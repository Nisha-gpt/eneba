# Interview guide

**Walk through a purchase.** Search for `cybrpunk`. Open Cyberpunk 2077, compare the three seller offers, add one, and refresh the cart. Register from checkout, enter the all-zero test card to decline, then use the 4242 test card to approve the same cart and open the delivered demo key in order history.

**Explain the backend boundary.** The browser presents a price estimate and sends an offer ID and quantity. PostgreSQL supplies the authoritative price and stock. Go serves both the REST API and the compiled frontend, so requests and the session cookie share an origin.

**Explain assignment of keys.** Each inventory row is a uniquely identified key. Checkout locks offers in ID order, checks available rows, and attaches them to order lines. The order and key assignments commit together. A failed item rolls back all earlier items in the same basket.

**Explain retries.** The browser retains a checkout ID for the same user, payment choice and cart. PostgreSQL enforces uniqueness for the combination of buyer and ID. Simultaneous matching retries return the same order. A separate checkout can purchase only remaining stock, even while requests overlap.

**Describe the tradeoffs.** PostgreSQL trigram search avoids another service and works for this small catalog. The threshold trades recall for noisy matches. A local cart has no cross-device sync. Explicit payment simulation lets reviewers exercise approval and decline without a payment provider account.
