ALTER TABLE orders
  ADD COLUMN display_currency text NOT NULL DEFAULT 'EUR' CHECK (display_currency ~ '^[A-Z]{3}$'),
  ADD COLUMN display_rate integer NOT NULL DEFAULT 10000 CHECK (display_rate > 0);
