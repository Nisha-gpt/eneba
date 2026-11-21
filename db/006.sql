ALTER TABLE products ADD COLUMN release_date date;

UPDATE products AS p SET release_date=v.released::date,
 attributes=p.attributes||jsonb_build_object('edition','Standard Edition')
FROM (VALUES
 ('elden-ring','2022-02-25'),('cyberpunk-2077','2020-12-10'),
 ('stardew-valley','2017-10-05'),('hollow-knight','2017-02-24'),
 ('baldurs-gate-3','2023-08-03'),('forza-horizon-5','2021-11-09'),
 ('god-of-war','2018-04-20'),('celeste','2018-01-25'),('portal-2','2011-04-19'),
 ('subnautica','2018-12-04'),('terraria','2011-05-16'),('no-mans-sky','2016-08-09'),
 ('sifu','2022-02-08'),('dead-cells','2018-08-07')
) v(slug,released) WHERE p.slug=v.slug;

UPDATE products SET attributes=attributes||jsonb_build_object('os','Windows')
WHERE platform='Steam' AND attributes->>'type'='Game';

CREATE TABLE product_reviews (
 product_id bigint NOT NULL REFERENCES products(id),
 account_id bigint NOT NULL REFERENCES accounts(id),
 rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5),
 body text NOT NULL CHECK(char_length(body) BETWEEN 10 AND 1000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(product_id,account_id)
);
