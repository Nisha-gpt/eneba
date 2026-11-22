"""Exercise a running marketplace with a disposable, freshly seeded database."""

import concurrent.futures
import http.cookiejar
import json
import os
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("MARKET_URL", "http://localhost:8080").rstrip("/")


def client():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(opener, path, data=None, expected=200):
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(
        BASE + "/api" + path, data=body,
        headers={"Content-Type": "application/json"} if body is not None else {},
    )
    try:
        response = opener.open(req, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        result = json.load(response)
        assert response.code == expected, (path, response.code, result)
    return result


guest, buyer, other = client(), client(), client()
assert request(guest, "/health")["ok"]
assert request(guest, "/home/banner")["destination"]
assert len(request(guest, "/home/bestsellers")["items"]) == 5
assert len(request(guest, "/home/deals")["items"]) == 5
assert request(guest, "/filters")["regions"]
first = request(guest, "/products")
second = request(guest, "/products?page=2")
assert first["total"] == second["total"] == 65
assert len(first["items"]) == 8 and len(second["items"]) == 8
assert {p["id"] for p in first["items"]}.isdisjoint(p["id"] for p in second["items"])
categories = request(guest, "/navigation")
assert len(categories) >= 37
for category in categories:
    listing = request(guest, "/products?category=" + category["slug"])
    assert listing["total"] and listing["category"]["slug"] == category["slug"], category
software = request(guest, "/products?category=software&os=Windows&os=Mac&region=Global&min=1000&max=3500")
assert software["total"] == 4
assert {item["attributes"]["os"] for item in software["items"]} == {"Windows", "Mac"}
assert software["facets"]["brand"]
gift = request(guest, "/products?category=e-gift-cards&country=India&currency=INR")
assert gift["total"] == 1 and gift["items"][0]["attributes"]["denomination"] == "1000"
filtered = request(guest, "/products?platform=Steam&region=Global&max=2500&sort=price-asc")["items"]
assert len(filtered) >= 2 and all(p["platform"] == "Steam" and p["region"] == "Global" and p["cents"] <= 2500 for p in filtered)
assert [p["cents"] for p in filtered] == sorted(p["cents"] for p in filtered)
names = [p["name"] for p in request(guest, "/products?sort=name-asc")["items"]]
assert names == sorted(names)
assert request(guest, "/products?q=elden")["items"][0]["slug"] == "elden-ring"
assert request(guest, "/products?q=cybrpunk")["items"][0]["slug"] == "cyberpunk-2077"
assert not request(guest, "/products?q=zzzzzzz")["items"]
assert request(guest, "/session") is None
request(guest, "/orders", expected=401)
request(guest, "/checkout", {}, expected=401)

password = str(uuid.uuid4())
email = f"smoke-{uuid.uuid4()}@example.test"
request(buyer, "/register", {"email": email, "password": password})
assert request(buyer, "/session")["email"] == email
request(buyer, "/logout", {})
assert request(buyer, "/session") is None
request(buyer, "/login", {"email": email, "password": "wrong-password"}, expected=401)
request(buyer, "/login", {"email": email, "password": password})
request(other, "/register", {"email": f"other-{uuid.uuid4()}@example.test", "password": password})

product_path = "/products/portal-2"
offers = request(guest, product_path)["offers"]
assert len(offers) == 3
offer = offers[0]
assert offer["stock"] == 3, "Run on a fresh disposable database."


def checkout_payload(quantity, outcome="test_card_approved"):
    return {"requestId": str(uuid.uuid4()), "payment": outcome, "expectedCents": offer["cents"] * quantity,
            "items": [{"offer": offer["id"], "quantity": quantity}]}


quote = request(buyer, "/checkout/quote", {"items": checkout_payload(2)["items"]})
assert quote["cents"] == offer["cents"] * 2 and quote["items"][0]["available"] == 3
request(buyer, "/checkout", checkout_payload(1, "unsupported"), expected=400)
request(buyer, "/checkout", {**checkout_payload(1), "expectedCents": 1}, expected=409)
request(buyer, "/checkout", checkout_payload(1, "test_card_declined"), expected=402)
assert request(buyer, "/orders") == []
assert request(guest, product_path)["offers"][0]["stock"] == 3

payload = checkout_payload(2)
with concurrent.futures.ThreadPoolExecutor(4) as pool:
    orders = list(pool.map(lambda _: request(buyer, "/checkout", payload), range(4)))
assert len({order["id"] for order in orders}) == 1
id_ = orders[0]["id"]
assert request(buyer, "/checkout", payload)["id"] == id_
request(buyer, "/checkout", {**payload, "payment": "test_card_declined"}, expected=409)
detail = request(buyer, f"/orders/{id_}")
assert detail["cents"] == offer["cents"] * 2
assert detail["items"][0]["platform"] == "Steam" and detail["items"][0]["artwork"] and detail["items"][0]["activation"]
keys = set(detail["items"][0]["keys"])
assert len(keys) == 2 and all(key.startswith("DEMO-") for key in keys)
request(other, f"/orders/{id_}", expected=404)
assert request(other, "/orders") == []


def take_last_key(_):
    try:
        return request(buyer, "/checkout", checkout_payload(1))["id"]
    except AssertionError as error:
        assert error.args[0][1] == 409, error
        return None


with concurrent.futures.ThreadPoolExecutor(2) as pool:
    winners = [result for result in pool.map(take_last_key, range(2)) if result]
assert len(winners) == 1
last_order = request(buyer, f"/orders/{winners[0]}")
assert not keys.intersection(last_order["items"][0]["keys"])
assert request(guest, product_path)["offers"][0]["stock"] == 0
request(buyer, "/checkout", checkout_payload(1), expected=409)
assert len(request(buyer, "/orders")) == 2
assert detail["payment_method"] == "card"
review_path = "/products/elden-ring/reviews"
assert request(guest, review_path)["average"] is None
review = {"rating": 4, "body": "A useful test review for this product."}
request(guest, review_path, review, expected=401)
request(buyer, review_path, {**review, "rating": 6}, expected=400)
assert request(buyer, review_path, review)["average"] == 4
assert request(buyer, review_path, {**review, "rating": 5})["count"] == 1
public_reviews = request(guest, review_path)
assert public_reviews["average"] == 5 and "email" not in public_reviews["items"][0]
recommendations = request(guest, "/products/elden-ring/recommendations")
next_picks = request(guest, "/products/elden-ring/recommendations?page=2")
assert recommendations["hasMore"] and len(recommendations["items"]) == 5
assert {p["id"] for p in recommendations["items"]}.isdisjoint(p["id"] for p in next_picks["items"])

wallet_offer = offers[1]
wallet_items = [{"offer": wallet_offer["id"], "quantity": 3}]
wallet_payload = {"requestId": str(uuid.uuid4()), "payment": "test_wallet", "items": wallet_items,
                  "expectedCents": wallet_offer["cents"] * 3, "deliveryEmail": "delivery@example.test", "currency": "INR"}
request(guest, "/wallet", expected=401)
assert request(buyer, "/wallet")["cents"] == 0
request(buyer, "/checkout", wallet_payload, expected=402)
assert request(guest, product_path)["offers"][1]["stock"] == wallet_offer["stock"]

funding = {"requestId": str(uuid.uuid4())}
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    credits = list(pool.map(lambda _: request(buyer, "/wallet/fund", funding), range(2)))
assert {credit["cents"] for credit in credits} == {2500}

def wallet_checkout(payload):
    try:
        return request(buyer, "/checkout", payload)["id"]
    except AssertionError as error:
        assert error.args[0][1] == 402, error
        return None

with concurrent.futures.ThreadPoolExecutor(3) as pool:
    payments = list(pool.map(wallet_checkout, [wallet_payload, wallet_payload,
                                               {**wallet_payload, "requestId": str(uuid.uuid4())}]))
assert len({order for order in payments if order}) == 1
assert request(buyer, "/wallet")["cents"] == 2500 - wallet_payload["expectedCents"]
assert request(other, "/wallet")["cents"] == 0
wallet_order = request(buyer, f"/orders/{next(order for order in payments if order)}")
assert wallet_order["display_currency"] == "INR" and wallet_order["display_rate"] == 990000
assert detail["display_currency"] == "EUR" and detail["display_rate"] == 10000
assert wallet_order["payment_method"] == "wallet" and wallet_order["delivery_email"] == "delivery@example.test"
assert len(set(wallet_order["items"][0]["keys"])) == 3
request(other, f"/orders/{wallet_order['id']}", expected=404)

for section in ["recommended", "top-games", "gift-cards", "upcoming"]:
    block = request(guest, "/home/" + section)
    listing = request(guest, "/products?collection=" + section)
    assert block["items"] and listing["total"] == len(block["items"])
    assert all(p["featured_offer"]["cents"] == p["cents"] for p in block["items"] if p["featured_offer"])
brands = request(guest, "/home/gift-brands")
assert {"Google Play", "Netflix", "Spotify", "Uber"}.issubset(brand["name"] for brand in brands)
assert request(guest, "/home/genres")
assert request(guest, "/home/recent") == []
recent = request(guest, "/home/recent?slug=portal-2&slug=elden-ring")
assert [product["slug"] for product in recent] == ["portal-2", "elden-ring"]
request(guest, "/newsletter", {"email": "invalid"}, expected=400)
assert request(guest, "/newsletter", {"email": email})["ok"]
assert request(guest, "/newsletter", {"email": email.upper()})["ok"]

print("PASS: catalog, reviews, recommendations, authorization, card outcomes, checkout retries, stock exhaustion, wallet funding, concurrent wallet debit and order ownership.")
