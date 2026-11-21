CREATE TABLE categories (
 slug text PRIMARY KEY,
 parent text REFERENCES categories(slug),
 name text NOT NULL,
 heading text NOT NULL,
 rank integer NOT NULL,
 nav_rank integer
);
CREATE TABLE product_categories (
 product_id bigint REFERENCES products(id) ON DELETE CASCADE,
 category text REFERENCES categories(slug),
 PRIMARY KEY(product_id,category)
);
ALTER TABLE products ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}';

INSERT INTO categories VALUES
 ('mobile-games',NULL,'Mobile games','Mobile game credit and vouchers',1,NULL),
 ('games',NULL,'Games','Buy digital game keys',2,NULL),
 ('gaming-ecards',NULL,'Gaming eCards','Gaming eCards and subscriptions',3,NULL),
 ('e-gift-cards',NULL,'eGift Cards','Buy eGift cards at the best price! | Prepaid gift cards',4,3),
 ('e-money',NULL,'E-money cards','Prepaid e-money vouchers',5,NULL),
 ('psn',NULL,'PSN','PlayStation games and gift cards',6,NULL),
 ('xbox',NULL,'Xbox','Xbox games and subscriptions',7,NULL),
 ('nintendo',NULL,'Nintendo','Nintendo games and eShop cards',8,NULL),
 ('software',NULL,'Software','Buy PC Software keys at the best price',9,2),
 ('mobile-recharges',NULL,'Mobile recharges','Mobile recharge vouchers',10,NULL),
 ('esim',NULL,'eSIM','Test eSIM activation vouchers',11,NULL),
 ('gift-guide',NULL,'Gift Guide','Digital gifts for every player',12,NULL),
 ('steam','games','Steam','Steam game keys',1,NULL),
 ('playstation-games','psn','PlayStation games','PlayStation game keys',1,NULL),
 ('playstation-cards','psn','PlayStation Store cards','PlayStation Store gift cards',2,NULL),
 ('xbox-games','xbox','Xbox games','Xbox game keys',1,NULL),
 ('xbox-subscriptions','xbox','Xbox subscriptions','Xbox subscriptions',2,NULL),
 ('nintendo-games','nintendo','Nintendo games','Nintendo game keys',1,NULL),
 ('nintendo-cards','nintendo','Nintendo eShop cards','Nintendo eShop gift cards',2,NULL),
 ('security','software','Security','Security software keys',1,NULL),
 ('productivity','software','Productivity','Productivity software keys',2,NULL),
 ('prepaid','e-money','Prepaid vouchers','Prepaid wallet vouchers',1,NULL),
 ('entertainment','e-gift-cards','Entertainment','Entertainment gift cards',1,NULL),
 ('retail','e-gift-cards','Shopping','Shopping gift cards',2,NULL),
 ('eneba-gift-cards','e-gift-cards','Eneba Gift Cards','Eneba Gift Cards',3,4),
 ('gaming-wallets','gaming-ecards','Wallet codes','Gaming wallet codes',1,NULL),
 ('esim-europe','esim','Europe','Europe eSIM test vouchers',1,NULL),
 ('esim-global','esim','Global','Global eSIM test vouchers',2,NULL);

INSERT INTO categories(slug,parent,name,heading,rank)
SELECT slug,'mobile-games',name,name || ' test redemption codes',rank
FROM (VALUES ('pubg-uc','PUBG UC',1),('genshin-impact','Genshin Impact',2),
 ('marvel-rivals','Marvel Rivals',3),('wuthering-waves','Wuthering Waves',4),
 ('zenless-zone-zero','Zenless Zone Zero',5),('honkai-star-rail','Honkai Star Rail',6),
 ('mobile-legends','Mobile Legends',7),('free-fire','Free Fire',8),('poppo','Poppo',9),
 ('delta-force','Delta Force',10),('blood-strike','Blood Strike',11)) v(slug,name,rank);

UPDATE products SET attributes=jsonb_build_object('type','Game','country',
 CASE region WHEN 'Europe' THEN 'Europe' WHEN 'North America' THEN 'United States' ELSE 'Worldwide' END);
INSERT INTO product_categories
SELECT id,'games' FROM products
UNION ALL
SELECT id,CASE platform WHEN 'Steam' THEN 'steam' WHEN 'Xbox' THEN 'xbox-games'
 WHEN 'Nintendo' THEN 'nintendo-games' ELSE 'playstation-games' END FROM products;

CREATE TEMP TABLE catalog_seed (
 slug text,name text,category text,platform text,region text,country text,kind text,
 brand text,os text,currency text,denomination text,price integer,tone text
) ON COMMIT DROP;
INSERT INTO catalog_seed VALUES
 ('avast-premium','Avast Premium Security · 1 year','security','Avast','Global','Worldwide','Software','Avast','Windows','','',599,'orange'),
 ('f-secure-internet','F-Secure Internet Security · 1 year','security','F-Secure','Europe','Germany','Software','F-Secure','Windows','','',1799,'sky'),
 ('filmora-windows','Wondershare Filmora · Windows','productivity','Wondershare','Global','Worldwide','Software','Wondershare','Windows','','',2971,'teal'),
 ('filmora-mac','Wondershare Filmora · Mac','productivity','Wondershare','Global','Worldwide','Software','Wondershare','Mac','','',3190,'teal'),
 ('easeus-recovery','EaseUS Data Recovery Wizard · 1 month','productivity','EaseUS','Global','Worldwide','Software','EaseUS','Windows','','',1399,'sky'),
 ('easeus-mac','EaseUS Data Recovery Wizard · Mac','productivity','EaseUS','Global','Worldwide','Software','EaseUS','Mac','','',2799,'sky'),
 ('norton-premium','Norton 360 Premium · 1 year','security','Norton','Europe','United Kingdom','Software','Norton','Windows','','',1299,'night'),
 ('office-home','Office Home · Software key','productivity','Microsoft','North America','United States','Software','Microsoft','Mac','','',4899,'violet'),
 ('spotify-eur','Spotify Gift Card 10 EUR','entertainment','Spotify','Europe','Germany','eGift Card','Spotify','','EUR','10',929,'teal'),
 ('netflix-eur','Netflix Gift Card 25 EUR','entertainment','Netflix','Europe','France','eGift Card','Netflix','','EUR','25',2449,'red'),
 ('amazon-us','Amazon Gift Card 25 USD','retail','Amazon','North America','United States','eGift Card','Amazon','','USD','25',2369,'orange'),
 ('apple-us','Apple Gift Card 15 USD','retail','Apple','North America','United States','eGift Card','Apple','','USD','15',1469,'violet'),
 ('google-play-in','Google Play Gift Card 1000 INR','entertainment','Google Play','India','India','eGift Card','Google Play','','INR','1000',1099,'sky'),
 ('eneba-eur-10','Eneba Gift Card 10 EUR','eneba-gift-cards','Eneba','Europe','Germany','eGift Card','Eneba','','EUR','10',999,'violet'),
 ('eneba-eur-25','Eneba Gift Card 25 EUR','eneba-gift-cards','Eneba','Europe','France','eGift Card','Eneba','','EUR','25',2499,'violet'),
 ('playstation-wallet','PlayStation Store Card 20 EUR','playstation-cards','PlayStation','Europe','Germany','Gaming eCard','PlayStation','','EUR','20',1879,'sky'),
 ('xbox-game-pass','Xbox Game Pass · 1 month','xbox-subscriptions','Xbox','Global','Worldwide','Subscription','Xbox','','','',1199,'teal'),
 ('nintendo-wallet','Nintendo eShop Card 20 EUR','nintendo-cards','Nintendo','Europe','France','Gaming eCard','Nintendo','','EUR','20',1939,'red'),
 ('steam-wallet','Steam Wallet Card 20 EUR','gaming-wallets','Steam','Europe','Germany','Gaming eCard','Steam','','EUR','20',1929,'night'),
 ('paysafe-voucher','Paysafe test voucher 10 EUR','prepaid','Paysafe','Europe','Germany','E-money voucher','Paysafe','','EUR','10',999,'sky'),
 ('mobile-recharge-in','India mobile recharge test voucher','mobile-recharges','Mobile','India','India','Recharge voucher','Mobile','','INR','500',599,'orange'),
 ('esim-eu-voucher','Europe eSIM · Test activation voucher','esim-europe','eSIM','Europe','Europe','eSIM voucher','eSIM','','','',699,'teal'),
 ('esim-world-voucher','Global eSIM · Test activation voucher','esim-global','eSIM','Global','Worldwide','eSIM voucher','eSIM','','','',1499,'violet');

INSERT INTO catalog_seed
SELECT 'razer-gold-'||denomination, 'Razer Gold Gift Card '||denomination||' USD',
 'entertainment','Razer','Global','Worldwide','eGift Card','Razer','','USD',
 denomination::text,denomination*84,'gold'
FROM unnest(ARRAY[5,10,15,20,25,30,50,100]) AS denomination;

INSERT INTO catalog_seed
SELECT slug||'-voucher', name||' · Test credit voucher', slug, name,'Global','Worldwide',
 'Mobile voucher',name,'','','',499+rank*70,'violet'
FROM categories WHERE parent='mobile-games';

INSERT INTO products(slug,name,platform,region,genre,description,activation,artwork,attributes)
SELECT slug,name,platform,region,kind,
 CASE WHEN kind IN ('Mobile voucher','Recharge voucher','eSIM voucher')
 THEN 'A demonstration voucher delivered as a test code in your order. No mobile credit, eSIM profile or network service is provisioned.'
 ELSE 'Compare seller offers for this '||lower(kind)||'. Check the platform and region before choosing an offer.' END,
 CASE WHEN kind IN ('Mobile voucher','Recharge voucher','eSIM voucher')
 THEN 'Open your order to reveal the test voucher. It cannot be redeemed with a real provider or used to activate service.'
 ELSE 'Open your order to reveal the test code. A real code for this item would be redeemed through '||platform||'.' END,
 '',jsonb_strip_nulls(jsonb_build_object('type',kind,'country',country,'brand',brand,'os',NULLIF(os,''),
 'currency',NULLIF(currency,''),'denomination',NULLIF(denomination,''),'tone',tone))
FROM catalog_seed;

INSERT INTO product_categories
SELECT p.id,s.category FROM products p JOIN catalog_seed s USING(slug)
UNION ALL
SELECT p.id,'gift-guide' FROM products p JOIN catalog_seed s USING(slug)
 WHERE s.kind IN ('eGift Card','Gaming eCard')
UNION ALL
SELECT p.id,'gaming-ecards' FROM products p JOIN catalog_seed s USING(slug)
 WHERE s.kind IN ('Gaming eCard','Subscription') AND s.category<>'gaming-wallets';

INSERT INTO offers(product_id,seller_id,cents)
SELECT p.id,seller.id,s.price + CASE seller.name WHEN 'Pixel Supply' THEN 0 ELSE 195 END
FROM catalog_seed s JOIN products p USING(slug) CROSS JOIN sellers seller
WHERE seller.name IN ('Pixel Supply','Game Relay');

INSERT INTO inventory(offer_id,code)
SELECT o.id,'DEMO-CAT-'||upper(substr(md5(o.id||':'||n),1,16))
FROM offers o JOIN products p ON p.id=o.product_id JOIN catalog_seed s ON s.slug=p.slug
CROSS JOIN generate_series(1,8) n;

INSERT INTO categories VALUES ('cheap-games',NULL,'Cheap Games','Cheap games and digital deals',13,1);
INSERT INTO product_categories
SELECT product_id,'cheap-games' FROM collections WHERE section='deals';
