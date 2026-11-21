ALTER TABLE orders ADD COLUMN delivery_email text;
ALTER TABLE orders ADD COLUMN payment_method text NOT NULL DEFAULT 'card'
 CHECK(payment_method IN ('card','wallet'));

CREATE TABLE wallets (
 account_id bigint PRIMARY KEY REFERENCES accounts(id),
 cents integer NOT NULL DEFAULT 0 CHECK(cents BETWEEN 0 AND 100000)
);

CREATE TABLE wallet_transactions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES wallets(account_id),
 request_id text,
 order_id bigint UNIQUE REFERENCES orders(id),
 cents integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,request_id),
 CHECK ((cents > 0 AND request_id IS NOT NULL AND order_id IS NULL) OR
  (cents < 0 AND request_id IS NULL AND order_id IS NOT NULL))
);
