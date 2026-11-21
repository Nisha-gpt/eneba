INSERT INTO products(slug,name,platform,region,genre,description,activation,artwork)
SELECT slug,name,platform,region,genre,description,
 CASE platform
 WHEN 'Steam' THEN 'Open Steam and choose Games → Activate a Product on Steam. Enter the code and follow the prompts.'
 WHEN 'Xbox' THEN 'Sign in to your Microsoft account, open Redeem, and enter your code.'
 WHEN 'PlayStation' THEN 'Open PlayStation Store, choose Redeem Codes, and enter the code for your account region.'
 ELSE 'Open Nintendo eShop on your Switch. Select Redeem Code and follow the prompts.'
 END,
 '/art/' || slug || '.webp'
FROM (VALUES
 ('elden-ring','Elden Ring','Steam','Global','Action RPG','Explore the Lands Between, master its combat, and uncover the secrets of the Elden Ring.'),
 ('cyberpunk-2077','Cyberpunk 2077','Steam','Global','Open World','Build your reputation in Night City, a metropolis consumed by ambition and body modification.'),
 ('hades-ii','Hades II','Steam','Europe','Roguelike','Take on the Titan of Time with the Princess of the Underworld and the magic of Olympus.'),
 ('stardew-valley','Stardew Valley','Nintendo','Global','Simulation','Restore a family farm and build a new life in a small valley community.'),
 ('hollow-knight','Hollow Knight','Steam','Global','Adventure','Explore the kingdom of Hallownest, a vast underground world of insects and ruins.'),
 ('baldurs-gate-3','Baldur''s Gate 3','Steam','Europe','Role Playing','Gather your party and shape a sprawling adventure in the Forgotten Realms.'),
 ('forza-horizon-5','Forza Horizon 5','Xbox','Global','Racing','Drive through the landscapes of Mexico in an open-world racing festival.'),
 ('god-of-war','God of War','PlayStation','Europe','Action','Journey through the Norse realms with Kratos and Atreus.'),
 ('celeste','Celeste','Nintendo','North America','Platformer','Help Madeline climb Celeste Mountain in a precision platforming adventure.'),
 ('portal-2','Portal 2','Steam','Global','Puzzle','Use portals and inventive physics to solve puzzles at Aperture Science.'),
 ('subnautica','Subnautica','Xbox','Europe','Survival','Dive into an alien ocean, build a habitat, and discover what lies beneath.'),
 ('terraria','Terraria','Steam','North America','Sandbox','Dig, fight, explore, and build in a world filled with creatures and treasure.'),
 ('no-mans-sky','No Man''s Sky','Xbox','Global','Exploration','Travel between procedurally generated planets and chart your own course.'),
 ('sifu','Sifu','PlayStation','North America','Action','Train in kung fu and fight your way through a city in pursuit of revenge.'),
 ('dead-cells','Dead Cells','Nintendo','Europe','Roguelike','Explore a shifting castle and master fast-paced combat one run at a time.')
) AS p(slug,name,platform,region,genre,description);
INSERT INTO sellers(name) VALUES ('Pixel Supply'),('Game Relay'),('Key Foundry');
INSERT INTO offers(product_id,seller_id,cents)
 SELECT p.id,s.id, (ARRAY[3899,2499,2299,1099,849,4399,3299,2799,1299,399,1499,599,1999,1699,1399])[p.id] + (s.id-1)*235
 FROM products p CROSS JOIN sellers s;
INSERT INTO inventory(offer_id,code)
 SELECT o.id,'DEMO-' || upper(substr(md5(o.id || ':' || n),1,16))
 FROM offers o CROSS JOIN LATERAL generate_series(1,CASE WHEN o.seller_id=1 THEN 3 ELSE 8 END) n;
INSERT INTO promotions VALUES (1,'THE NIGHT CITY EDITION','Make your move in Night City.',
 'Explore Cyberpunk 2077 and compare offers from independent sellers.','Explore Cyberpunk 2077',
 '/product/cyberpunk-2077','/art/night-city.webp');
INSERT INTO collections(section,product_id,rank)
 SELECT x.section,p.id,x.rank FROM (VALUES
 ('bestsellers','elden-ring',1),('bestsellers','cyberpunk-2077',2),('bestsellers','hades-ii',3),
 ('bestsellers','stardew-valley',4),('bestsellers','hollow-knight',5),
 ('deals','portal-2',1),('deals','terraria',2),('deals','celeste',3),
 ('deals','dead-cells',4),('deals','subnautica',5)
 ) AS x(section,slug,rank) JOIN products p USING(slug);
