CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS products (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, slug text UNIQUE NOT NULL,
 name text NOT NULL, platform text NOT NULL, region text NOT NULL, genre text NOT NULL,
 description text NOT NULL, activation text NOT NULL, artwork text NOT NULL
);
CREATE TABLE IF NOT EXISTS sellers (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS offers (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product_id bigint NOT NULL REFERENCES products,
 seller_id bigint NOT NULL REFERENCES sellers, cents integer NOT NULL CHECK(cents > 0), UNIQUE(product_id,seller_id)
);
CREATE TABLE IF NOT EXISTS accounts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text UNIQUE NOT NULL, password_hash bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash bytea PRIMARY KEY, account_id bigint NOT NULL REFERENCES accounts, expires timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_id bigint NOT NULL REFERENCES accounts,
 request_id text NOT NULL, fingerprint text NOT NULL, cents integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,request_id)
);
CREATE TABLE IF NOT EXISTS order_lines (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id bigint NOT NULL REFERENCES orders,
 offer_id bigint NOT NULL REFERENCES offers, product_name text NOT NULL, seller_name text NOT NULL,
 cents integer NOT NULL, quantity integer NOT NULL CHECK(quantity > 0), UNIQUE(order_id,offer_id),
 UNIQUE(id,offer_id)
);
CREATE TABLE IF NOT EXISTS inventory (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, offer_id bigint NOT NULL REFERENCES offers,
 code text UNIQUE NOT NULL, line_id bigint,
 FOREIGN KEY(line_id,offer_id) REFERENCES order_lines(id,offer_id)
);
CREATE INDEX IF NOT EXISTS available_keys ON inventory(offer_id,id) WHERE line_id IS NULL;
CREATE TABLE IF NOT EXISTS promotions (
 id integer PRIMARY KEY, eyebrow text NOT NULL, headline text NOT NULL,
 subtitle text NOT NULL, action text NOT NULL, destination text NOT NULL, artwork text NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
 section text NOT NULL, product_id bigint NOT NULL REFERENCES products, rank integer NOT NULL,
 PRIMARY KEY(section,product_id)
);
