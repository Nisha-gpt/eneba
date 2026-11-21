# Eneba internship marketplace recreation

An unofficial recreation for the Eneba internship assignment. The design follows supplied Eneba references. The catalog, seller offers and artwork are demonstration data, and purchases use simulated payments and non-redeemable keys.

## Run locally

Requirements are Go 1.25 or later, Node 24, npm, and PostgreSQL 17 with the `pg_trgm` extension available. An existing PostgreSQL instance works. For a local Docker database:

```sh
docker run -d --name keyshift-db \
  -e POSTGRES_USER=market -e POSTGRES_PASSWORD=market -e POSTGRES_DB=market \
  -p 127.0.0.1:5432:5432 postgres:17-alpine
docker exec keyshift-db pg_isready -U market -d market
```

From the repository root:

```sh
cp .env.example .env
(cd web && npm ci && npm run build)
set -a
. ./.env
set +a
go run .
```

Open http://localhost:8080. Leave the Go process running and use `cd web && KEYSHIFT_DEV_API_URL=http://localhost:8080 npm run dev` for Vite hot reload. This sets the API proxy for standalone Vite only. When editing artwork, rebuild the production frontend to refresh the Go-served copy.

`DATABASE_URL` is required. `PORT` defaults to 8080 and `STATIC_DIR` defaults to `web/dist`. HTTPS deployments use secure cookies by default. The example disables that flag for local HTTP. Database migrations and seed data run once per database at startup, under a PostgreSQL advisory lock. Startup fails if database access or migration fails.

## Architecture and data model

React and TypeScript handle routing and rendering. Go serves the Vite build, static artwork, and a same-origin REST API. PostgreSQL is the source of truth for catalog data, inventory, account sessions and orders. One web service and one database keep the demo deployment small.

| Data | Purpose |
| --- | --- |
| Products, sellers, offers | Product details and seller-specific prices in integer cents |
| Inventory | One code per row, linked to an offer and assigned to an order line when sold |
| Promotions, collection sections, collections | Banner copy, collection headings, product membership and display order |
| Accounts, sessions | bcrypt hashes and expiring, hashed session tokens |
| Orders, order lines | Account-owned purchases, stable price and seller snapshots, and checkout retry IDs |

The homepage uses `/api/home/banner`, `/api/home/bestsellers`, and `/api/home/deals`. The store uses `/store/:category` for category pages and reads `q`, facet values, `min` and `max` (cents), `sort`, and `page` from the URL and sends them to `/api/products`. The lowest in-stock offer sets each displayed starting price. The product page shows all sellers, including exhausted offers.

Search normalizes whitespace and case and gives literal substrings precedence in relevance order. For queries of at least three characters, PostgreSQL `word_similarity` also compares trigrams across the query and portions of the product name, accepting a score of 0.42 or higher. For example, `elden` matches `Elden Ring`, and `cybrpunk` matches `Cyberpunk 2077`. Heavily misspelled and very short queries have limited fuzzy recall.

The homepage requests its campaign, discovery rows, gift brands and genre counts independently. Recently viewed is stored on the current browser. The Spanish preference translates the supported navigation, discovery headings, settings and core checkout controls. Currency equivalents use fixed demo rates. Database prices, checkout and wallet accounting stay in EUR. Newsletter subscriptions store one normalized email per address and do not send mail.

## Checkout and key delivery

Checkout progresses through Cart, Payment, and Get your product. The cart preserves seller offers and the edited delivery email through sign-in. The app records the delivery email with the order and makes keys available in the authenticated account. It does not send email. The Go API quotes current prices, stock, and the €0.00 service fee.

Choose Credit or debit card and use **4242 4242 4242 4242** for approval or **0000 0000 0000 0000** for a decline. Enter a test name, a future expiry, and any three-digit CVC. The form sends a scenario identifier instead of card details. Eneba Wallet adds €25.00 in test funds per funding request. Its account balance and ledger are stored in PostgreSQL. Funding retries cannot add the same credit twice, and a wallet debit commits with the order and keys in one transaction.

The server authenticates the buyer using an expiring, HttpOnly, SameSite cookie. Checkout locks selected offers in a consistent order, verifies the quoted total and stock, and assigns one key per unit in a single transaction. A decline, changed price, or insufficient stock leaves the basket available for review. The browser reuses an unresolved checkout ID when retrying the same scenario. PostgreSQL enforces uniqueness per account and the API returns the existing order on matching retries.

Receipts show the purchased items and hide keys until the buyer reveals them. The server checks order ownership on every request. New order lines snapshot product details, and older receipts resolve these details through their original offers without changing issued keys.

Product pages show the least-expensive in-stock offer first, same-category recommendations, activation instructions, and persisted product reviews. Signed-in users can submit or update one review per product.

## Validation

Run `go vet ./...` and `npm run build` in `web/` as appropriate. To run the API smoke test, point a second app instance at a freshly seeded disposable database and run `MARKET_URL=http://localhost:8081 python3 scripts/smoke.py`. The test creates accounts and consumes one offer's stock. It covers the homepage, filter combination, sorting, pagination, partial and typo search, authentication, ownership, payment decline, idempotency and concurrent inventory allocation.

Browser verification uses the built app and exercises search → product → seller offer → cart refresh → registration → declined payment → successful purchase → order history. Verify this again with a dedicated offer after deployment.

## Deployment

### Vercel Services

Import the repository on Vercel with the repository root as the project root. The root `vercel.json` builds two services. `app` runs the existing Go server on the platform-supplied port and receives `/api` and its subpaths. `web` builds the Vite storefront and serves the remaining paths, with an HTML fallback for React Router deep links. Artwork and bundles are served by `web`. The browser sends relative `/api/…` requests through the project router. Neither service calls the other at runtime, so there are no service bindings.

Set `DATABASE_URL` in Vercel project settings to a TLS-enabled PostgreSQL connection string with permission to run the startup migrations. Keep the default secure cookies in deployment. For local testing, link the Vercel project and run from the repository root with local database settings:

```sh
set -a
. ./.env
set +a
vercel dev
```

Check `/api/health`, reload a product page directly, and complete the demo checkout under the same project origin. Run the smoke script only against a disposable database.

### Docker and Render

The Dockerfile builds a single container with the React app and Go server. `render.yaml` configures a candidate Render free Docker web service and health check. Use a Neon PostgreSQL database with `pg_trgm` available and set its direct, TLS-enabled connection string as the secret `DATABASE_URL` in the hosting dashboard. On Render, import the repository as a Blueprint and choose the free plan if currently available to your account. Confirm `GET /api/health` and complete the browser flow on the assigned public HTTPS URL. Keep `COOKIE_SECURE` at its default on HTTPS.

Neon's published free plan includes 100 compute-unit hours and 1 GB of storage per project, and computes suspend after five idle minutes. Review Render's current free-plan policy and account eligibility before deployment, including cold starts, quotas, and renewal. Hosting access is required to verify the public deployment.

- [Render free instances](https://render.com/docs/free)
- [Neon plan terms](https://raw.githubusercontent.com/neondatabase/website/main/content/docs/introduction/plans.md)

## Scope and asset sources

The catalog seeds 65 sample products, including fictional upcoming releases sold as test preorders. Category membership, nested navigation, product attributes, and contextual filter counts come from PostgreSQL. Mobile, recharge and eSIM products deliver test vouchers through the existing key flow. The wishlist is stored on the current browser. The demo storefront uses English and quotes EUR. There is no real payment processing, real key redemption, seller administration, password reset, or automated restocking. Add rate limits and abuse protections before using this beyond a demo. Stock is finite and shared across all users. Browser carts stay on the same browser and can show stale estimates until checkout validates the order.

The Eneba screenshots provided with the brief informed the marketplace structure. The banner and all product illustrations in `web/public/art` were created with OpenAI ImageGen for this demo and bundled as WebP files. The illustrations are original concept artwork. Product names are used to demonstrate catalog search. DM Sans and Space Grotesk are distributed via Fontsource under the SIL Open Font License. The interface icons are from Lucide.
