package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed db/*.sql
var migrations embed.FS

type app struct {
	db     *pgxpool.Pool
	secure bool
}

type endpoint func(http.ResponseWriter, *http.Request) error
type apiError struct {
	status  int
	message string
}

func (e apiError) Error() string            { return e.message }
func fail(status int, message string) error { return apiError{status, message} }

func write(w http.ResponseWriter, status int, value any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(value)
}

func handler(fn endpoint) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if err := fn(w, r); err != nil {
			var ae apiError
			if !errors.As(err, &ae) {
				log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
				ae = apiError{500, "Something went wrong. Please try again."}
			}
			_ = write(w, ae.status, map[string]string{"error": ae.message})
		}
	}
}

func read(w http.ResponseWriter, r *http.Request, value any) error {
	media, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if media != "application/json" {
		return fail(415, "Send application/json.")
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384))
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil || decoder.Decode(new(any)) != io.EOF {
		return fail(400, "Invalid request body.")
	}
	return nil
}

func queryJSON(w http.ResponseWriter, row pgx.Row) error {
	var result json.RawMessage
	if err := row.Scan(&result); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fail(404, "This item could not be found.")
		}
		return err
	}
	return write(w, 200, result)
}

func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(381902); CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)`); err != nil {
		return err
	}
	files, err := migrations.ReadDir("db")
	if err != nil {
		return err
	}
	for _, file := range files {
		var exists bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1)`, file.Name()).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		sql, err := migrations.ReadFile("db/" + file.Name())
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("%s: %w", file.Name(), err)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations VALUES($1)`, file.Name()); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

const catalog = `SELECT p.*, (
 SELECT min(o.cents) FROM offers o WHERE o.product_id=p.id
 AND EXISTS(SELECT 1 FROM inventory i WHERE i.offer_id=o.id AND i.line_id IS NULL)
 ) AS cents FROM products p`

func (a app) store(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	page, err := number(q.Get("page"), 1, 1, 10000)
	if err != nil {
		return err
	}
	max, err := number(q.Get("max"), 100000, 0, 100000)
	if err != nil {
		return err
	}
	search := strings.ToLower(strings.Join(strings.Fields(q.Get("q")), " "))
	if len(search) > 100 {
		return fail(400, "Search is limited to 100 bytes.")
	}
	sortColumn := map[string]string{"": "score DESC, name", "price-asc": "cents ASC NULLS LAST, name", "price-desc": "cents DESC NULLS LAST, name", "name-asc": "name ASC", "name-desc": "name DESC"}[q.Get("sort")]
	if sortColumn == "" {
		return fail(400, "Invalid sort order.")
	}
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 WITH matched AS (
 SELECT *,CASE WHEN strpos(lower(name),$1)>0 THEN 2 ELSE word_similarity($1,lower(name)) END AS score
 FROM (`+catalog+`) products
 WHERE ($1='' OR strpos(lower(name),$1)>0 OR (length($1)>=3 AND word_similarity($1,lower(name))>=0.42))
 AND ($2='' OR platform=$2) AND ($3='' OR region=$3)
 AND ($4=100000 OR cents<=$4)
 ), page AS (
 SELECT *, row_number() OVER(ORDER BY `+sortColumn+`,id) AS position FROM matched ORDER BY position LIMIT 8 OFFSET $5
 )
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(page)-'position'-'score' ORDER BY position) FROM page),'[]'),
 'total',(SELECT count(*) FROM matched),'pageSize',8)
 `, search, q.Get("platform"), q.Get("region"), max, (page-1)*8))
}

func number(value string, fallback, min, max int) (int, error) {
	if value == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(value)
	if err != nil || n < min || n > max {
		return 0, fail(400, "Invalid numeric value.")
	}
	return n, nil
}

func (a app) product(w http.ResponseWriter, r *http.Request) error {
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT to_jsonb(p)||jsonb_build_object('offers',COALESCE((
 SELECT jsonb_agg(jsonb_build_object('id',o.id,'cents',o.cents,'seller',s.name,'stock',
 (SELECT count(*) FROM inventory i WHERE i.offer_id=o.id AND i.line_id IS NULL)) ORDER BY o.cents,o.id)
 FROM offers o JOIN sellers s ON s.id=o.seller_id WHERE o.product_id=p.id),'[]'))
 FROM products p WHERE slug=$1`, r.PathValue("slug")))
}

func (a app) home(section string) endpoint {
	return func(w http.ResponseWriter, r *http.Request) error {
		return queryJSON(w, a.db.QueryRow(r.Context(), `
  SELECT to_jsonb(s) || jsonb_build_object('items', COALESCE((
   SELECT jsonb_agg(to_jsonb(p) ORDER BY c.rank) FROM collections c
   JOIN (`+catalog+`) p ON p.id=c.product_id WHERE c.section=s.section
  ),'[]')) FROM collection_sections s WHERE s.section=$1`, section))
	}
}

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

const cookieName = "market_session"

func (a app) auth(register bool) endpoint {
	return func(w http.ResponseWriter, r *http.Request) error {
		var form credentials
		if err := read(w, r, &form); err != nil {
			return err
		}
		form.Email = strings.ToLower(strings.TrimSpace(form.Email))
		if len(form.Email) > 254 || !emailPattern.MatchString(form.Email) || len(form.Password) < 8 || len(form.Password) > 72 {
			return fail(400, "Enter a valid email and a password of 8–72 bytes.")
		}
		ctx := r.Context()
		var id int64
		var hash []byte
		if register {
			var err error
			hash, err = bcrypt.GenerateFromPassword([]byte(form.Password), 12)
			if err != nil {
				return err
			}
			err = a.db.QueryRow(ctx, `INSERT INTO accounts(email,password_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id`, form.Email, hash).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				return fail(409, "An account already uses that email.")
			}
			if err != nil {
				return err
			}
		} else {
			err := a.db.QueryRow(ctx, `SELECT id,password_hash FROM accounts WHERE email=$1`, form.Email).Scan(&id, &hash)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			if errors.Is(err, pgx.ErrNoRows) {
				hash = []byte("$2a$12$C6UzMDM.H6dfI/f/IKcEe.7gVhdH4t2xQHMiMehh64S2tJw4L9xT6")
			}
			if bcrypt.CompareHashAndPassword(hash, []byte(form.Password)) != nil || id == 0 {
				return fail(401, "Email or password is incorrect.")
			}
		}
		raw := rand.Text()
		digest := sha256.Sum256([]byte(raw))
		tx, err := a.db.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		if old, err := r.Cookie(cookieName); err == nil {
			key := sha256.Sum256([]byte(old.Value))
			if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE token_hash=$1`, key[:]); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')`, digest[:], id); err != nil {
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		a.cookie(w, raw, 604800)
		return write(w, 200, map[string]string{"email": form.Email})
	}
}

func (a app) cookie(w http.ResponseWriter, value string, age int) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: value, Path: "/", MaxAge: age, HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode})
}

func (a app) account(r *http.Request) (id int64, email string, err error) {
	cookie, e := r.Cookie(cookieName)
	if e != nil {
		return 0, "", fail(401, "Sign in to continue.")
	}
	digest := sha256.Sum256([]byte(cookie.Value))
	err = a.db.QueryRow(r.Context(), `SELECT a.id,a.email FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=$1 AND s.expires>now()`, digest[:]).Scan(&id, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		err = fail(401, "Sign in to continue.")
	}
	return
}

type line struct {
	Offer    int64 `json:"offer"`
	Quantity int   `json:"quantity"`
}
type checkoutRequest struct {
	Items     []line `json:"items"`
	RequestID string `json:"requestId"`
	Payment   string `json:"payment"`
}

var requestPattern = regexp.MustCompile(`^[A-Za-z0-9-]{16,80}$`)

func (a app) checkout(w http.ResponseWriter, r *http.Request) error {
	account, _, err := a.account(r)
	if err != nil {
		return err
	}
	var req checkoutRequest
	if err := read(w, r, &req); err != nil {
		return err
	}
	if !requestPattern.MatchString(req.RequestID) || len(req.Items) < 1 || len(req.Items) > 20 ||
		(req.Payment != "success" && req.Payment != "failure") {
		return fail(400, "Invalid checkout request.")
	}
	sort.Slice(req.Items, func(i, j int) bool { return req.Items[i].Offer < req.Items[j].Offer })
	for i, l := range req.Items {
		if l.Offer < 1 || l.Quantity < 1 || l.Quantity > 20 || (i > 0 && l.Offer == req.Items[i-1].Offer) {
			return fail(400, "Invalid offer or quantity.")
		}
	}
	payload, _ := json.Marshal(req)
	hash := sha256.Sum256(payload)
	fingerprint := hex.EncodeToString(hash[:])
	var order int64
	for attempt := 0; attempt < 3; attempt++ {
		order, err = a.purchase(r.Context(), account, req, fingerprint)
		var pg *pgconn.PgError
		if !errors.As(err, &pg) || (pg.Code != "40001" && pg.Code != "40P01") {
			break
		}
	}
	if err != nil {
		return err
	}
	return write(w, 200, map[string]int64{"id": order})
}

func (a app) purchase(ctx context.Context, account int64, req checkoutRequest, fingerprint string) (int64, error) {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var order int64
	err = tx.QueryRow(ctx, `INSERT INTO orders(account_id,request_id,fingerprint,cents)
 VALUES($1,$2,$3,0) ON CONFLICT DO NOTHING RETURNING id`, account, req.RequestID, fingerprint).Scan(&order)
	if errors.Is(err, pgx.ErrNoRows) {
		var saved string
		err = tx.QueryRow(ctx, `SELECT id,fingerprint FROM orders WHERE account_id=$1 AND request_id=$2`, account, req.RequestID).Scan(&order, &saved)
		if err != nil {
			return 0, err
		}
		if saved != fingerprint {
			return 0, fail(409, "This checkout request was already used for a different purchase.")
		}
		return order, nil
	}
	if err != nil {
		return 0, err
	}
	if req.Payment == "failure" {
		return 0, fail(402, "Demo payment declined. Your cart is still available.")
	}
	total := 0
	for _, l := range req.Items {
		var cents int
		var product, seller string
		err = tx.QueryRow(ctx, `SELECT o.cents,p.name,s.name FROM offers o
  JOIN products p ON p.id=o.product_id JOIN sellers s ON s.id=o.seller_id WHERE o.id=$1 FOR UPDATE OF o`, l.Offer).Scan(&cents, &product, &seller)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, fail(409, "An offer is no longer available.")
		}
		if err != nil {
			return 0, err
		}
		var lineID int64
		err = tx.QueryRow(ctx, `INSERT INTO order_lines(order_id,offer_id,product_name,seller_name,cents,quantity)
  VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, order, l.Offer, product, seller, cents, l.Quantity).Scan(&lineID)
		if err != nil {
			return 0, err
		}
		result, err := tx.Exec(ctx, `UPDATE inventory SET line_id=$1 WHERE id IN
  (SELECT id FROM inventory WHERE offer_id=$2 AND line_id IS NULL ORDER BY id LIMIT $3)`, lineID, l.Offer, l.Quantity)
		if err != nil {
			return 0, err
		}
		if result.RowsAffected() != int64(l.Quantity) {
			return 0, fail(409, product+" has insufficient stock. Update your cart and try again.")
		}
		total += cents * l.Quantity
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET cents=$1 WHERE id=$2`, total, order); err != nil {
		return 0, err
	}
	return order, tx.Commit(ctx)
}

func (a app) orders(w http.ResponseWriter, r *http.Request) error {
	id, _, err := a.account(r)
	if err != nil {
		return err
	}
	if order := r.PathValue("id"); order != "" {
		n, err := strconv.ParseInt(order, 10, 64)
		if err != nil || n < 1 {
			return fail(404, "Order not found.")
		}
		return queryJSON(w, a.db.QueryRow(r.Context(), `
  SELECT jsonb_build_object('id',o.id,'cents',o.cents,'created_at',o.created_at,'items',(
   SELECT jsonb_agg(jsonb_build_object('product',l.product_name,'seller',l.seller_name,'cents',l.cents,
    'quantity',l.quantity,'keys',(SELECT jsonb_agg(i.code ORDER BY i.id) FROM inventory i WHERE i.line_id=l.id)) ORDER BY l.id)
   FROM order_lines l WHERE l.order_id=o.id))
  FROM orders o WHERE o.id=$1 AND o.account_id=$2`, n, id))
	}
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'cents',cents,'created_at',created_at) ORDER BY id DESC),'[]')
 FROM orders WHERE account_id=$1`, id))
}

func (a app) routes(static string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := a.db.Ping(r.Context()); err != nil {
			return fail(503, "Database unavailable.")
		}
		return write(w, 200, map[string]bool{"ok": true})
	}))
	mux.HandleFunc("GET /api/home/banner", handler(func(w http.ResponseWriter, r *http.Request) error {
		return queryJSON(w, a.db.QueryRow(r.Context(), `SELECT to_jsonb(p) FROM promotions p ORDER BY id LIMIT 1`))
	}))
	mux.HandleFunc("GET /api/home/bestsellers", handler(a.home("bestsellers")))
	mux.HandleFunc("GET /api/home/deals", handler(a.home("deals")))
	mux.HandleFunc("GET /api/products", handler(a.store))
	mux.HandleFunc("GET /api/products/{slug}", handler(a.product))
	mux.HandleFunc("GET /api/filters", handler(func(w http.ResponseWriter, r *http.Request) error {
		return queryJSON(w, a.db.QueryRow(r.Context(), `SELECT jsonb_build_object('platforms',array_agg(DISTINCT platform ORDER BY platform),'regions',array_agg(DISTINCT region ORDER BY region)) FROM products`))
	}))
	mux.HandleFunc("GET /api/session", handler(func(w http.ResponseWriter, r *http.Request) error {
		_, email, err := a.account(r)
		var ae apiError
		if errors.As(err, &ae) && ae.status == 401 {
			return write(w, 200, nil)
		}
		if err != nil {
			return err
		}
		return write(w, 200, map[string]string{"email": email})
	}))
	mux.HandleFunc("POST /api/register", handler(a.auth(true)))
	mux.HandleFunc("POST /api/login", handler(a.auth(false)))
	mux.HandleFunc("POST /api/logout", handler(func(w http.ResponseWriter, r *http.Request) error {
		var body struct{}
		if err := read(w, r, &body); err != nil {
			return err
		}
		if c, err := r.Cookie(cookieName); err == nil {
			d := sha256.Sum256([]byte(c.Value))
			if _, err := a.db.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash=$1`, d[:]); err != nil {
				return err
			}
		}
		a.cookie(w, "", -1)
		return write(w, 200, nil)
	}))
	mux.HandleFunc("POST /api/checkout", handler(a.checkout))
	mux.HandleFunc("GET /api/orders", handler(a.orders))
	mux.HandleFunc("GET /api/orders/{id}", handler(a.orders))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		_ = write(w, 404, map[string]string{"error": "Unknown API route."})
	})
	mux.Handle("GET /assets/", http.FileServer(http.Dir(static)))
	mux.Handle("GET /art/", http.FileServer(http.Dir(static)))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			_ = write(w, 405, map[string]string{"error": "Method not allowed."})
			return
		}
		http.ServeFile(w, r, filepath.Join(static, "index.html"))
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
		mux.ServeHTTP(w, r)
	})
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal("Invalid database configuration")
	}
	defer db.Close()
	if err := migrate(ctx, db); err != nil {
		log.Fatalf("database setup failed: %v", err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	static := os.Getenv("STATIC_DIR")
	if static == "" {
		static = "web/dist"
	}
	server := http.Server{Addr: ":" + port, Handler: app{db, os.Getenv("COOKIE_SECURE") != "false"}.routes(static),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("Marketplace listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}
