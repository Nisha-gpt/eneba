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
	"unicode/utf8"

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
	return cachedHandler(fn, "no-store")
}

func publicCatalog(fn endpoint) http.HandlerFunc {
	return cachedHandler(fn, "public, max-age=15, s-maxage=15")
}

func cachedHandler(fn endpoint, cache string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", cache)
		if err := fn(w, r); err != nil {
			w.Header().Set("Cache-Control", "no-store")
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

const catalog = `SELECT p.*,best.cents,to_jsonb(best) AS featured_offer FROM products p
 LEFT JOIN LATERAL (
  SELECT o.id,o.cents,s.name AS seller,available.stock FROM offers o JOIN sellers s ON s.id=o.seller_id
  CROSS JOIN LATERAL (SELECT count(*) AS stock FROM inventory i WHERE i.offer_id=o.id AND i.line_id IS NULL) available
  WHERE o.product_id=p.id AND available.stock>0
  ORDER BY o.cents,o.id LIMIT 1
 ) best ON true`

func (a app) store(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	page, err := number(q.Get("page"), 1, 1, 10000)
	if err != nil {
		return err
	}
	min, err := number(q.Get("min"), -1, 0, 1000000)
	if err != nil {
		return err
	}
	max, err := number(q.Get("max"), -1, 0, 1000000)
	if err != nil {
		return err
	}
	if max >= 0 && min > max {
		return fail(400, "Minimum price exceeds maximum price.")
	}
	search := strings.ToLower(strings.Join(strings.Fields(q.Get("q")), " "))
	if len(search) > 100 {
		return fail(400, "Search is limited to 100 bytes.")
	}
	sortColumn := map[string]string{"": "score DESC, name", "price-asc": "cents ASC NULLS LAST, name", "price-desc": "cents DESC NULLS LAST, name", "name-asc": "name ASC", "name-desc": "name DESC"}[q.Get("sort")]
	if sortColumn == "" {
		return fail(400, "Invalid sort order.")
	}

	selected := make(map[string][]string)
	for _, key := range []string{"platform", "region", "country", "type", "brand", "os", "currency", "denomination", "genre"} {
		if len(q[key]) > 20 {
			return fail(400, "Too many filter values.")
		}
		for _, value := range q[key] {
			if len(value) > 100 {
				return fail(400, "Filter value is too long.")
			}
			if value != "" {
				selected[key] = append(selected[key], value)
			}
		}
	}
	encoded, err := json.Marshal(selected)
	if err != nil {
		return err
	}
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 WITH RECURSIVE scope AS (
  SELECT slug FROM categories WHERE slug=$2
  UNION ALL SELECT c.slug FROM categories c JOIN scope s ON c.parent=s.slug
 ), candidates AS (
  SELECT p.*, attributes || jsonb_build_object('platform',platform,'region',region,'genre',genre) AS fields,
    CASE WHEN $1='' OR strpos(lower(name),$1)>0 THEN 2 ELSE word_similarity($1,lower(name)) END AS score
  FROM (`+catalog+`) p
  WHERE ($1='' OR strpos(lower(name),$1)>0 OR (length($1)>=3 AND word_similarity($1,lower(name))>=0.42))
   AND ($2='' OR EXISTS(SELECT 1 FROM product_categories pc JOIN scope s ON s.slug=pc.category WHERE pc.product_id=p.id))
   AND ($7='' OR EXISTS(SELECT 1 FROM collections c WHERE c.section=$7 AND c.product_id=p.id))
 ), price_range AS (
  SELECT * FROM candidates WHERE ($3::int<0 OR cents >= $3) AND ($4::int<0 OR cents <= $4)
 ), evaluated AS (
  SELECT p.*, ARRAY(
    SELECT f.key FROM jsonb_each($5::jsonb) f
    WHERE NOT COALESCE(f.value ? (p.fields->>f.key),false)
  ) AS exclusions FROM price_range p
 ), matched AS (
  SELECT * FROM evaluated WHERE cardinality(exclusions)=0
 ), page AS (
  SELECT *,row_number() OVER(ORDER BY `+sortColumn+`,id) AS position
  FROM matched ORDER BY position LIMIT 8 OFFSET $6
 ), counts AS (
  SELECT f.key,f.value,count(*) AS count
  FROM evaluated e CROSS JOIN LATERAL jsonb_each_text(e.fields) f
  WHERE f.key IN ('platform','region','country','type','brand','os','currency','denomination','genre')
    AND e.exclusions <@ ARRAY[f.key]
  GROUP BY f.key,f.value
 ), facets AS (
  SELECT key,jsonb_agg(jsonb_build_object('value',value,'count',count) ORDER BY value) AS options
  FROM counts GROUP BY key
 )
 SELECT jsonb_build_object(
 'category',(SELECT to_jsonb(c) FROM categories c WHERE c.slug=$2),
 'collection',(SELECT title FROM collection_sections WHERE section=$7),
 'facets',COALESCE((SELECT jsonb_object_agg(key,options) FROM facets),'{}'),
 'items',COALESCE((SELECT jsonb_agg(to_jsonb(page)-'position'-'score'-'fields'-'exclusions' ORDER BY position) FROM page),'[]'),
 'total',(SELECT count(*) FROM matched),'pageSize',8)
 WHERE ($2='' OR EXISTS(SELECT 1 FROM scope))
 AND ($7='' OR EXISTS(SELECT 1 FROM collection_sections WHERE section=$7))
 `, search, q.Get("category"), min, max, encoded, (page-1)*8, q.Get("collection")))
}

func (a app) navigation(w http.ResponseWriter, r *http.Request) error {
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT jsonb_agg(to_jsonb(c) ORDER BY rank,slug) FROM categories c`))
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

func (a app) recommendations(w http.ResponseWriter, r *http.Request) error {
	page, err := number(r.URL.Query().Get("page"), 1, 1, 1000)
	if err != nil {
		return err
	}
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 WITH current AS (SELECT id,platform FROM products WHERE slug=$1),
 ranked AS (
  SELECT p.*, row_number() OVER (ORDER BY
   CASE WHEN EXISTS (
    SELECT 1 FROM product_categories src JOIN product_categories dst USING(category)
    WHERE src.product_id=c.id AND dst.product_id=p.id
   ) THEN 0 ELSE 1 END,
   CASE WHEN p.platform=c.platform THEN 0 ELSE 1 END,p.name,p.id) AS rank
  FROM (`+catalog+`) p CROSS JOIN current c WHERE p.id<>c.id AND p.cents IS NOT NULL
 ), page AS (
  SELECT * FROM ranked ORDER BY rank LIMIT 5 OFFSET $2
 )
 SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(page)-'rank' ORDER BY rank) FROM page),'[]'),
 'hasMore',(SELECT count(*) FROM ranked)>$2::int+5)
 WHERE EXISTS(SELECT 1 FROM current)
 `, r.PathValue("slug"), (page-1)*5))
}

func (a app) reviews(w http.ResponseWriter, r *http.Request) error {
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT jsonb_build_object(
  'count',(SELECT count(*) FROM product_reviews WHERE product_id=p.id),
  'average',(SELECT round(avg(rating),1) FROM product_reviews WHERE product_id=p.id),
  'items',COALESCE((
   SELECT jsonb_agg(to_jsonb(recent) ORDER BY updated_at DESC,id)
   FROM (
    SELECT row_number() OVER (ORDER BY updated_at DESC,account_id) AS id,rating,body,updated_at
    FROM product_reviews WHERE product_id=p.id ORDER BY updated_at DESC,account_id LIMIT 10
   ) recent
  ),'[]'))
 FROM products p WHERE p.slug=$1
 `, r.PathValue("slug")))
}

func (a app) saveReview(w http.ResponseWriter, r *http.Request) error {
	id, _, err := a.account(r)
	if err != nil {
		return err
	}
	var review struct {
		Rating int    `json:"rating"`
		Body   string `json:"body"`
	}
	if err := read(w, r, &review); err != nil {
		return err
	}
	review.Body = strings.TrimSpace(review.Body)
	length := utf8.RuneCountInString(review.Body)
	if review.Rating < 1 || review.Rating > 5 || length < 10 || length > 1000 || strings.ContainsRune(review.Body, 0) {
		return fail(400, "Choose a rating from 1 to 5 and write 10–1000 characters.")
	}
	result, err := a.db.Exec(r.Context(), `
 INSERT INTO product_reviews(product_id,account_id,rating,body)
 SELECT id,$2,$3,$4 FROM products WHERE slug=$1
 ON CONFLICT (product_id,account_id) DO UPDATE
 SET rating=EXCLUDED.rating,body=EXCLUDED.body,updated_at=now()
 `, r.PathValue("slug"), id, review.Rating, review.Body)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fail(404, "This item could not be found.")
	}
	return a.reviews(w, r)
}

const cardJSON = `jsonb_build_object(
 'id',p.id,'slug',p.slug,'name',p.name,'platform',p.platform,'region',p.region,
 'artwork',p.artwork,'attributes',p.attributes,'cents',p.cents,'featured_offer',p.featured_offer)`

func (a app) home(section string) endpoint {
	return func(w http.ResponseWriter, r *http.Request) error {
		return queryJSON(w, a.db.QueryRow(r.Context(), `
  SELECT to_jsonb(s) || jsonb_build_object('items', COALESCE((
   SELECT jsonb_agg(`+cardJSON+` ORDER BY c.rank) FROM collections c
   JOIN (`+catalog+`) p ON p.id=c.product_id WHERE c.section=s.section
  ),'[]')) FROM collection_sections s WHERE s.section=$1`, section))
	}
}

func (a app) homeBrands(w http.ResponseWriter, r *http.Request) error {
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY name),'[]')
 FROM (
  SELECT attributes->>'brand' AS name,min(attributes->>'tone') AS tone
  FROM products WHERE attributes->>'type'='eGift Card' GROUP BY 1
 ) b`))
}

func (a app) homeGenres(w http.ResponseWriter, r *http.Request) error {
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY count DESC,name),'[]')
 FROM (SELECT genre AS name,count(*) FROM products WHERE attributes->>'type'='Game' GROUP BY genre) g`))
}

func (a app) recentlyViewed(w http.ResponseWriter, r *http.Request) error {
	slugs := r.URL.Query()["slug"]
	if len(slugs) > 12 {
		return fail(400, "Request up to 12 recently viewed products.")
	}
	if slugs == nil {
		slugs = []string{}
	}
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT COALESCE(jsonb_agg(`+cardJSON+` ORDER BY list.position),'[]')
 FROM unnest($1::text[]) WITH ORDINALITY list(slug,position)
 JOIN (`+catalog+`) p ON p.slug=list.slug`, slugs))
}

func (a app) subscribe(w http.ResponseWriter, r *http.Request) error {
	var form struct {
		Email string `json:"email"`
	}
	if err := read(w, r, &form); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(form.Email))
	if len(email) > 254 || !emailPattern.MatchString(email) || strings.ContainsRune(email, 0) {
		return fail(400, "Enter a valid email address.")
	}
	if _, err := a.db.Exec(r.Context(), `INSERT INTO newsletter_subscriptions(email) VALUES($1) ON CONFLICT DO NOTHING`, email); err != nil {
		return err
	}
	return write(w, 200, map[string]bool{"ok": true})
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
	Items         []line `json:"items"`
	RequestID     string `json:"requestId"`
	Payment       string `json:"payment"`
	ExpectedCents *int   `json:"expectedCents,omitempty"`
	DeliveryEmail string `json:"deliveryEmail,omitempty"`
}

var requestPattern = regexp.MustCompile(`^[A-Za-z0-9-]{16,80}$`)

// testPayment is internal to checkout. Its inputs never include card details.
func testPayment(scenario string) error {
	switch scenario {
	case "test_card_approved", "test_wallet":
		return nil
	case "test_card_declined":
		return fail(402, "Test payment declined. Check the test payment details and try again.")
	default:
		return fail(400, "Use one of the provided test cards.")
	}
}

func validateLines(items []line) error {
	if len(items) < 1 || len(items) > 20 {
		return fail(400, "Choose between 1 and 20 offers.")
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Offer < items[j].Offer })
	for i, l := range items {
		if l.Offer < 1 || l.Quantity < 1 || l.Quantity > 20 || (i > 0 && l.Offer == items[i-1].Offer) {
			return fail(400, "Invalid offer or quantity.")
		}
	}
	return nil
}

func (a app) quote(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Items []line `json:"items"`
	}
	if err := read(w, r, &req); err != nil {
		return err
	}
	if err := validateLines(req.Items); err != nil {
		return err
	}
	items, err := json.Marshal(req.Items)
	if err != nil {
		return err
	}
	return queryJSON(w, a.db.QueryRow(r.Context(), `
      SELECT jsonb_build_object(
        'cents',COALESCE(sum(o.cents * i.quantity), 0), 'serviceFeeCents',0,'discountCents',0,
        'items',jsonb_agg(jsonb_build_object('offer',i.offer,'quantity',i.quantity,
          'name',p.name,'seller',s.name,'cents',o.cents,'artwork',p.artwork,'platform',p.platform,'region',p.region,'country',p.attributes->>'country',
          'available',COALESCE(stock.count, 0)) ORDER BY i.offer))
      FROM jsonb_to_recordset($1::jsonb) AS i(offer bigint, quantity integer)
      LEFT JOIN offers o ON o.id=i.offer
      LEFT JOIN products p ON p.id=o.product_id
      LEFT JOIN sellers s ON s.id=o.seller_id
      LEFT JOIN LATERAL (
        SELECT count(*) FROM inventory WHERE offer_id=o.id AND line_id IS NULL
      ) stock ON true`, items))
}

func (a app) checkout(w http.ResponseWriter, r *http.Request) error {
	account, email, err := a.account(r)
	if err != nil {
		return err
	}
	var req checkoutRequest
	if err := read(w, r, &req); err != nil {
		return err
	}
	if !requestPattern.MatchString(req.RequestID) || req.ExpectedCents == nil || *req.ExpectedCents < 1 {
		return fail(400, "Invalid checkout request.")
	}
	req.DeliveryEmail = strings.TrimSpace(req.DeliveryEmail)
	if req.DeliveryEmail != "" && (len(req.DeliveryEmail) > 254 || !emailPattern.MatchString(req.DeliveryEmail) || strings.ContainsRune(req.DeliveryEmail, 0)) {
		return fail(400, "Enter a valid delivery email.")
	}
	if err := validateLines(req.Items); err != nil {
		return err
	}
	payload, _ := json.Marshal(req)
	hash := sha256.Sum256(payload)
	fingerprint := hex.EncodeToString(hash[:])
	if req.DeliveryEmail == "" {
		req.DeliveryEmail = email
	}
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
	if err := testPayment(req.Payment); err != nil {
		return 0, err
	}
	total := 0
	for _, l := range req.Items {
		var cents int
		var product, seller string
		var details json.RawMessage
		err = tx.QueryRow(ctx, `SELECT o.cents,p.name,s.name, jsonb_build_object('artwork',p.artwork,'platform',p.platform,'region',p.region,'activation',p.activation) FROM offers o
  JOIN products p ON p.id=o.product_id JOIN sellers s ON s.id=o.seller_id WHERE o.id=$1 FOR UPDATE OF o`, l.Offer).Scan(&cents, &product, &seller, &details)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, fail(409, "An offer is no longer available.")
		}
		if err != nil {
			return 0, err
		}
		var lineID int64
		err = tx.QueryRow(ctx, `INSERT INTO order_lines(order_id,offer_id,product_name,seller_name,cents,quantity,product_details)
  VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, order, l.Offer, product, seller, cents, l.Quantity, details).Scan(&lineID)
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
	if total != *req.ExpectedCents {
		return 0, fail(409, "The total changed. Review the updated order summary before paying.")
	}
	method := "card"
	if req.Payment == "test_wallet" {
		method = "wallet"
		deduction, err := tx.Exec(ctx, `UPDATE wallets SET cents=cents-$2 WHERE account_id=$1 AND cents >= $2`, account, total)
		if err != nil {
			return 0, err
		}
		if deduction.RowsAffected() == 0 {
			return 0, fail(402, "Insufficient test wallet balance. Add test funds or pay by card.")
		}
		if _, err = tx.Exec(ctx, `INSERT INTO wallet_transactions(account_id,order_id,cents) VALUES($1,$2,$3)`, account, order, -total); err != nil {
			return 0, err
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE orders SET cents=$1, payment_method=$3, delivery_email=$4 WHERE id=$2`, total, order, method, req.DeliveryEmail); err != nil {
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
  SELECT jsonb_build_object('id',o.id,'cents',o.cents,'created_at',o.created_at,'payment_method',o.payment_method,'delivery_email',o.delivery_email,'items',(
   SELECT jsonb_agg(jsonb_build_object('id',l.id,'product',l.product_name,'seller',l.seller_name,'cents',l.cents,
    'quantity',l.quantity,'keys',COALESCE((SELECT jsonb_agg(i.code ORDER BY i.id) FROM inventory i WHERE i.line_id=l.id),'[]'))
    || COALESCE(l.product_details,jsonb_build_object('artwork',p.artwork,'platform',p.platform,'region',p.region,'activation',p.activation)) ORDER BY l.id)
   FROM order_lines l JOIN offers f ON f.id=l.offer_id JOIN products p ON p.id=f.product_id WHERE l.order_id=o.id))
  FROM orders o WHERE o.id=$1 AND o.account_id=$2`, n, id))
	}
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'cents',cents,'created_at',created_at) ORDER BY id DESC),'[]')
 FROM orders WHERE account_id=$1`, id))
}

func (a app) wallet(w http.ResponseWriter, r *http.Request) error {
	id, _, err := a.account(r)
	if err != nil {
		return err
	}
	return queryJSON(w, a.db.QueryRow(r.Context(), `
 SELECT jsonb_build_object('cents',COALESCE((SELECT cents FROM wallets WHERE account_id=$1),0),
 'topUpCents',2500)
 `, id))
}

func (a app) fundWallet(w http.ResponseWriter, r *http.Request) error {
	id, _, err := a.account(r)
	if err != nil {
		return err
	}
	var req struct {
		RequestID string `json:"requestId"`
	}
	if err := read(w, r, &req); err != nil {
		return err
	}
	if !requestPattern.MatchString(req.RequestID) {
		return fail(400, "Invalid funding request.")
	}
	ctx := r.Context()
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO wallets(account_id) VALUES($1) ON CONFLICT DO NOTHING`, id); err != nil {
		return err
	}
	var balance int
	if err = tx.QueryRow(ctx, `SELECT cents FROM wallets WHERE account_id=$1 FOR UPDATE`, id).Scan(&balance); err != nil {
		return err
	}
	record, err := tx.Exec(ctx, `INSERT INTO wallet_transactions(account_id,request_id,cents)
 VALUES($1,$2,2500) ON CONFLICT (account_id,request_id) DO NOTHING`, id, req.RequestID)
	if err != nil {
		return err
	}
	if record.RowsAffected() > 0 {
		if balance > 97500 {
			return fail(409, "Your test wallet has reached its balance limit.")
		}
		balance += 2500
		if _, err = tx.Exec(ctx, `UPDATE wallets SET cents=$2 WHERE account_id=$1`, id, balance); err != nil {
			return err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	return write(w, 200, map[string]int{"cents": balance, "topUpCents": 2500})
}

func (a app) routes(static string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := a.db.Ping(r.Context()); err != nil {
			return fail(503, "Database unavailable.")
		}
		return write(w, 200, map[string]bool{"ok": true})
	}))
	mux.HandleFunc("GET /api/home/banner", publicCatalog(func(w http.ResponseWriter, r *http.Request) error {
		return queryJSON(w, a.db.QueryRow(r.Context(), `SELECT to_jsonb(p)||jsonb_build_object('campaigns',
 (SELECT jsonb_agg(to_jsonb(c) ORDER BY rank) FROM homepage_campaigns c))
 FROM promotions p ORDER BY id LIMIT 1`))
	}))
	mux.HandleFunc("GET /api/home/bestsellers", publicCatalog(a.home("bestsellers")))
	mux.HandleFunc("GET /api/home/deals", publicCatalog(a.home("deals")))
	for _, section := range []string{"recommended", "top-games", "gift-cards", "upcoming"} {
		mux.HandleFunc("GET /api/home/"+section, publicCatalog(a.home(section)))
	}
	mux.HandleFunc("GET /api/home/gift-brands", publicCatalog(a.homeBrands))
	mux.HandleFunc("GET /api/home/genres", publicCatalog(a.homeGenres))
	mux.HandleFunc("GET /api/home/recent", handler(a.recentlyViewed))
	mux.HandleFunc("POST /api/newsletter", handler(a.subscribe))
	mux.HandleFunc("GET /api/navigation", publicCatalog(a.navigation))
	mux.HandleFunc("GET /api/products", publicCatalog(a.store))
	mux.HandleFunc("GET /api/products/{slug}", publicCatalog(a.product))
	mux.HandleFunc("GET /api/products/{slug}/recommendations", publicCatalog(a.recommendations))
	mux.HandleFunc("GET /api/products/{slug}/reviews", handler(a.reviews))
	mux.HandleFunc("POST /api/products/{slug}/reviews", handler(a.saveReview))
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
	mux.HandleFunc("POST /api/checkout/quote", handler(a.quote))
	mux.HandleFunc("GET /api/wallet", handler(a.wallet))
	mux.HandleFunc("POST /api/wallet/fund", handler(a.fundWallet))
	mux.HandleFunc("POST /api/checkout", handler(a.checkout))
	mux.HandleFunc("GET /api/orders", handler(a.orders))
	mux.HandleFunc("GET /api/orders/{id}", handler(a.orders))
	unknownAPI := func(w http.ResponseWriter, r *http.Request) {
		_ = write(w, 404, map[string]string{"error": "Unknown API route."})
	}
	mux.HandleFunc("/api", unknownAPI)
	mux.HandleFunc("/api/", unknownAPI)
	mux.Handle("GET /assets/", http.FileServer(http.Dir(static)))
	mux.Handle("GET /art/", http.FileServer(http.Dir(static)))
	mux.Handle("GET /favicon.svg", http.FileServer(http.Dir(static)))
	mux.Handle("GET /apple-touch-icon.png", http.FileServer(http.Dir(static)))
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
