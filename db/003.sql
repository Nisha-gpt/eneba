CREATE TABLE collection_sections (
 section text PRIMARY KEY, title text NOT NULL, label text NOT NULL, browse_path text NOT NULL
);
INSERT INTO collection_sections VALUES
 ('bestsellers','Best sellers','POPULAR NOW','/store'),
 ('deals','Deals worth playing','LOWER PRICES','/store?sort=price-asc');
ALTER TABLE collections ADD FOREIGN KEY (section) REFERENCES collection_sections;
