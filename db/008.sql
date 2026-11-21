CREATE TABLE homepage_campaigns (
 rank integer PRIMARY KEY, title text NOT NULL, subtitle text NOT NULL, destination text NOT NULL, artwork text NOT NULL
);
INSERT INTO homepage_campaigns VALUES
 (1,'Game deals','Find your next game','/store/cheap-games','/art/elden-ring.webp'),
 (2,'Digital gifts','Explore eGift Cards','/store/e-gift-cards',''),
 (3,'PC Software','Browse software keys','/store/software','');

CREATE TABLE newsletter_subscriptions (
 email text PRIMARY KEY, subscribed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO collection_sections VALUES
 ('recommended','Recommended for you','','/store?collection=recommended'),
 ('top-games','Top games','','/store?collection=top-games'),
 ('gift-cards','Best selling gift cards','','/store?collection=gift-cards'),
 ('upcoming','Upcoming games','','/store?collection=upcoming');

INSERT INTO collections
SELECT 'recommended', id,row_number() OVER (ORDER BY id)
FROM products WHERE slug IN ('elden-ring','cyberpunk-2077','hades-ii','stardew-valley','hollow-knight',
 'baldurs-gate-3','forza-horizon-5','god-of-war','celeste','nintendo-wallet','spotify-eur');
INSERT INTO collections
SELECT 'top-games',id,row_number() OVER (ORDER BY id)
FROM products WHERE attributes->>'type'='Game';
INSERT INTO collections
SELECT 'gift-cards',id,row_number() OVER(ORDER BY id)
FROM products WHERE attributes->>'type' IN ('eGift Card','Gaming eCard');

INSERT INTO products(slug,name,platform,region,genre,description,activation,artwork,attributes,release_date)
SELECT slug,name,'Steam','Global',genre,
 'An upcoming fictional game for this internship recreation. The sample preorder key is available immediately.',
 'Reveal the sample key in your account after checkout. It cannot activate a Steam product.','',
 jsonb_build_object('country','Worldwide','type','Game','os','Windows','brand',name,'tone',tone),
 CURRENT_DATE+days
FROM (VALUES
 ('orbit-relay','Orbit Relay','Racing','sky',90),('sandglass-keep','Sandglass Keep','Adventure','orange',120),
 ('ember-coast','Ember Coast','Action','red',150),('hex-harbor','Hex Harbor','Strategy','teal',175),
 ('meadow-signal','Meadow Signal','Simulation','violet',200),('silent-estuary','Silent Estuary','Puzzle','night',225),
 ('echoes-afterlight','Echoes Afterlight','Role Playing','gold',250)
) demos(slug,name,genre,tone,days);

INSERT INTO collections
SELECT 'upcoming', id,row_number() OVER(ORDER BY release_date,id)
FROM products WHERE description LIKE 'An upcoming fictional game%';
INSERT INTO product_categories SELECT product_id,'games' FROM collections WHERE section='upcoming'
UNION ALL SELECT product_id,'steam' FROM collections WHERE section='upcoming';
INSERT INTO offers(product_id,seller_id,cents)
SELECT c.product_id,s.id,1299+150*c.rank FROM collections c CROSS JOIN sellers s
WHERE c.section='upcoming' AND s.name='Pixel Supply';
INSERT INTO inventory(offer_id,code)
SELECT o.id,'DEMO-PRE-'||upper(substr(md5(o.id||':'||n),1,16))
FROM offers o JOIN collections c ON c.product_id=o.product_id
CROSS JOIN generate_series(1,8) n WHERE c.section='upcoming';

INSERT INTO products(slug,name,platform,region,genre,description,activation,artwork,attributes)
VALUES ('uber-us','Uber Gift Card 25 USD','Uber','North America','eGift Card','A demonstration Uber gift card for US accounts.',
 'Reveal your test code in order history. Demo codes cannot be redeemed with Uber.','',
 '{"type":"eGift Card","brand":"Uber","country":"United States","currency":"USD","denomination":"25","tone":"night"}');
INSERT INTO product_categories SELECT id,'retail' FROM products WHERE slug='uber-us'
UNION ALL SELECT id,'gift-guide' FROM products WHERE slug='uber-us';
INSERT INTO collections SELECT 'gift-cards',id,99 FROM products WHERE slug='uber-us';
INSERT INTO offers(product_id,seller_id,cents)
SELECT p.id,s.id,2399 FROM products p CROSS JOIN sellers s WHERE p.slug='uber-us' AND s.name='Pixel Supply';
INSERT INTO inventory(offer_id,code)
SELECT o.id,'DEMO-UBER-'||upper(substr(md5(o.id||':'||n),1,16))
FROM offers o JOIN products p ON p.id=o.product_id CROSS JOIN generate_series(1,8) n WHERE p.slug='uber-us';

ALTER TABLE promotions ADD COLUMN mobile_artwork text;
UPDATE promotions SET mobile_artwork='/art/night-city-mobile.webp' WHERE artwork='/art/night-city.webp';
