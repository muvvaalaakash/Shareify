"""
Shareify API Gateway
- Central entry point for all requests
- Routes requests to downstream microservices
- Passes JWT headers transparently
"""

import os
from fastapi import FastAPI, Request, Response
import httpx

app = FastAPI(title="Shareify API Gateway", version="1.0.0")

# ── Service URLs ────────────────────────────────────────────────────────────
SERVICE_MAP = {
    "users": os.getenv("USER_SERVICE_URL", "http://localhost:8001"),
    "items": os.getenv("ITEM_SERVICE_URL", "http://localhost:8002"),
    "inventory": os.getenv("INVENTORY_SERVICE_URL", "http://localhost:8003"),
    "bookings": os.getenv("BOOKING_SERVICE_URL", "http://localhost:8004"),
    "payments": os.getenv("PAYMENT_SERVICE_URL", "http://localhost:8005"),
    "reviews": os.getenv("REVIEW_SERVICE_URL", "http://localhost:8006"),
}

client = httpx.AsyncClient(timeout=10.0)


# ── Health ──────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "healthy", "service": "shareify-api-gateway"}


# ── User Service Routes ────────────────────────────────────────────────────
@app.api_route("/api/users/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_users(request: Request, path: str):
    return await _proxy(request, "users", f"/{path}")


@app.api_route("/api/register", methods=["POST"])
async def proxy_register(request: Request):
    return await _proxy(request, "users", "/register")


@app.api_route("/api/login", methods=["POST"])
async def proxy_login(request: Request):
    return await _proxy(request, "users", "/login")


@app.api_route("/api/profile", methods=["GET"])
async def proxy_profile(request: Request):
    return await _proxy(request, "users", "/profile")


# ── Item Service Routes ────────────────────────────────────────────────────
@app.api_route("/api/items", methods=["GET", "POST"])
async def proxy_items_root(request: Request):
    return await _proxy(request, "items", "/items")


@app.api_route("/api/items/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_items(request: Request, path: str):
    return await _proxy(request, "items", f"/items/{path}")


# ── Inventory Service Routes ───────────────────────────────────────────────
@app.api_route("/api/inventory/{path:path}", methods=["GET", "POST"])
async def proxy_inventory(request: Request, path: str):
    return await _proxy(request, "inventory", f"/{path}")


@app.api_route("/api/availability", methods=["GET"])
async def proxy_availability(request: Request):
    return await _proxy(request, "inventory", "/availability")


# ── Booking Service Routes ─────────────────────────────────────────────────
@app.api_route("/api/bookings", methods=["GET", "POST"])
async def proxy_bookings_root(request: Request):
    return await _proxy(request, "bookings", "/bookings")


@app.api_route("/api/bookings/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_bookings(request: Request, path: str):
    return await _proxy(request, "bookings", f"/bookings/{path}")


# ── Payment Service Routes ─────────────────────────────────────────────────
@app.api_route("/api/payments", methods=["GET", "POST"])
async def proxy_payments_root(request: Request):
    return await _proxy(request, "payments", "/payments")


@app.api_route("/api/payments/{path:path}", methods=["GET"])
async def proxy_payments(request: Request, path: str):
    return await _proxy(request, "payments", f"/payments/{path}")


# ── Review Service Routes ──────────────────────────────────────────────────
@app.api_route("/api/reviews", methods=["GET", "POST"])
async def proxy_reviews_root(request: Request):
    return await _proxy(request, "reviews", "/reviews")


# ── Proxy Helper ────────────────────────────────────────────────────────────
async def _proxy(request: Request, service_name: str, downstream_path: str) -> Response:
    base_url = SERVICE_MAP.get(service_name)
    if not base_url:
        return Response(
            content=f'{{"detail":"Unknown service: {service_name}"}}',
            status_code=502,
            media_type="application/json",
        )

    # Build target URL with query params
    url = f"{base_url}{downstream_path}"
    if request.query_params:
        url += f"?{request.query_params}"

    # Forward headers (especially Authorization)
    headers = {}
    if "authorization" in request.headers:
        headers["Authorization"] = request.headers["authorization"]
    headers["Content-Type"] = request.headers.get("content-type", "application/json")

    # Read body
    body = await request.body()

    try:
        resp = await client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=body,
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/json"),
        )
    except httpx.RequestError as e:
        return Response(
            content=f'{{"detail":"Service unavailable: {service_name} – {e}"}}',
            status_code=503,
            media_type="application/json",
        )
