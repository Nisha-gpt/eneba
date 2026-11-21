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
assert first["total"] == second["total"] == 57
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
print("PASS: homepage, filters, sorting, pagination, typo search, authentication, ownership, payment decline, unique keys, checkout retries, and concurrent stock exhaustion.")
