"""
Shareify Booking Service
- Create booking (with full validation flow)
- Get bookings for user
- Get booking by ID

Inter-service communication:
  → Item Service   : fetch item details (owner_id, price)
  → Inventory Service : check availability & reserve
  → Payment Service   : process mock payment
"""

import os
import uuid
import sqlite3
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt
import httpx

app = FastAPI(title="Shareify Booking Service", version="1.0.0")

# ── Config ──────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET", "shareify-secret-key-2024")
ALGORITHM = "HS256"
DATABASE = os.getenv("DATABASE_PATH", "./data/bookings.db")

ITEM_SERVICE_URL = os.getenv("ITEM_SERVICE_URL", "http://localhost:8002")
INVENTORY_SERVICE_URL = os.getenv("INVENTORY_SERVICE_URL", "http://localhost:8003")
PAYMENT_SERVICE_URL = os.getenv("PAYMENT_SERVICE_URL", "http://localhost:8005")
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8001")
NOTIFICATION_SERVICE_URL = os.getenv("NOTIFICATION_SERVICE_URL", "http://localhost:8007")

security = HTTPBearer()


# ── Database ────────────────────────────────────────────────────────────────
def get_db():
    os.makedirs(os.path.dirname(DATABASE) or ".", exist_ok=True)
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            booking_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            total_price REAL NOT NULL,
            payment_id TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup():
    init_db()


# ── Schemas ─────────────────────────────────────────────────────────────────
class BookingCreate(BaseModel):
    item_id: str
    start_date: str  # YYYY-MM-DD
    end_date: str


# ── Auth ────────────────────────────────────────────────────────────────────
def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(
            credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Helpers ─────────────────────────────────────────────────────────────────
def calculate_days(start_date: str, end_date: str) -> int:
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    delta = (end - start).days
    if delta <= 0:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")
    return delta


# ── Endpoints ───────────────────────────────────────────────────────────────
@app.post("/bookings")
def create_booking(booking: BookingCreate, payload: dict = Depends(verify_token)):
    user_id = payload["user_id"]
    booking_id = str(uuid.uuid4())

    # ── Step 1: Validate dates ──────────────────────────────────────────
    num_days = calculate_days(booking.start_date, booking.end_date)

    # ── Step 2: Fetch item details from Item Service ────────────────────
    try:
        item_resp = httpx.get(
            f"{ITEM_SERVICE_URL}/items/{booking.item_id}", timeout=5.0
        )
        if item_resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Item not found")
        item_resp.raise_for_status()
        item_data = item_resp.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Item service unavailable: {e}")

    owner_id = item_data["owner_id"]
    price_per_day = item_data["price_per_day"]

    # ── Step 3: Cannot book own item ────────────────────────────────────
    if user_id == owner_id:
        raise HTTPException(status_code=400, detail="You cannot book your own item")

    # ── Step 4: Check availability via Inventory Service ────────────────
    try:
        avail_resp = httpx.get(
            f"{INVENTORY_SERVICE_URL}/availability",
            params={
                "item_id": booking.item_id,
                "start_date": booking.start_date,
                "end_date": booking.end_date,
            },
            timeout=5.0,
        )
        avail_resp.raise_for_status()
        avail_data = avail_resp.json()
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503, detail=f"Inventory service unavailable: {e}"
        )

    if not avail_data.get("available"):
        raise HTTPException(
            status_code=409,
            detail=f"Item not available: {avail_data.get('reason', 'unknown')}",
        )

    # ── Step 5: Process payment via Payment Service ─────────────────────
    total_price = round(num_days * price_per_day, 2)
    try:
        pay_resp = httpx.post(
            f"{PAYMENT_SERVICE_URL}/payments",
            json={"booking_id": booking_id, "amount": total_price},
            timeout=5.0,
        )
        pay_resp.raise_for_status()
        pay_data = pay_resp.json()
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503, detail=f"Payment service unavailable: {e}"
        )

    if pay_data.get("status") != "success":
        raise HTTPException(status_code=402, detail="Payment failed")

    # ── Step 6: Reserve item via Inventory Service ──────────────────────
    try:
        reserve_resp = httpx.post(
            f"{INVENTORY_SERVICE_URL}/reserve",
            json={
                "item_id": booking.item_id,
                "start_date": booking.start_date,
                "end_date": booking.end_date,
                "booking_id": booking_id,
            },
            timeout=5.0,
        )
        reserve_resp.raise_for_status()
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503, detail=f"Failed to reserve item: {e}"
        )

    # ── Step 7: Save booking ────────────────────────────────────────────
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO bookings "
            "(booking_id, user_id, item_id, owner_id, start_date, end_date, "
            "total_price, payment_id, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)",
            (booking_id, user_id, booking.item_id, owner_id,
             booking.start_date, booking.end_date, total_price,
             pay_data["payment_id"], datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    finally:
        conn.close()

    # ── Step 8: Trigger Notification ──────────────────────────────────
    try:
        # Get user email
        user_resp = httpx.get(f"{USER_SERVICE_URL}/users/{user_id}", timeout=5.0)
        user_data = user_resp.json()
        user_email = user_data.get("email", "unknown@example.com")

        # Send notification
        httpx.post(
            f"{NOTIFICATION_SERVICE_URL}/send-email",
            json={
                "to_email": user_email,
                "subject": f"Booking Confirmed: {item_data['title']}",
                "body": f"Hi {user_data.get('name', 'User')},\n\n"
                        f"Your booking for '{item_data['title']}' has been confirmed!\n"
                        f"Booking ID: {booking_id}\n"
                        f"Dates: {booking.start_date} to {booking.end_date}\n"
                        f"Total Price: ${total_price}\n\n"
                        f"Thank you for using Shareify!"
            },
            timeout=2.0
        )
    except Exception as e:
        print(f"Failed to send notification: {e}")

    return {
        "message": "Booking confirmed",
        "booking_id": booking_id,
        "item_id": booking.item_id,
        "start_date": booking.start_date,
        "end_date": booking.end_date,
        "total_price": total_price,
        "payment_id": pay_data["payment_id"],
        "status": "confirmed",
    }


@app.get("/bookings")
def get_user_bookings(payload: dict = Depends(verify_token)):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC",
            (payload["user_id"],),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/bookings/{booking_id}")
def get_booking(booking_id: str, payload: dict = Depends(verify_token)):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM bookings WHERE booking_id = ?", (booking_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Booking not found")
        return dict(row)
    finally:
        conn.close()


@app.put("/bookings/{booking_id}/complete")
def complete_booking(booking_id: str, payload: dict = Depends(verify_token)):
    user_id = payload["user_id"]
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM bookings WHERE booking_id = ?", (booking_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Booking not found")
        if row["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not your booking")
        if row["status"] != "confirmed":
            raise HTTPException(status_code=400, detail="Only confirmed bookings can be completed")

        conn.execute(
            "UPDATE bookings SET status = 'completed' WHERE booking_id = ?",
            (booking_id,)
        )
        conn.commit()
        return {"message": "Booking marked as completed"}
    finally:
        conn.close()


@app.get("/bookings/verify-completion")
def verify_completion(user_id: str, item_id: str):
    """Inter-service endpoint for Review Service."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT 1 FROM bookings WHERE user_id = ? AND item_id = ? AND status = 'completed'",
            (user_id, item_id)
        ).fetchone()
        return {"completed": bool(row)}
    finally:
        conn.close()


@app.get("/health")
def health():
    return {"status": "healthy", "service": "shareify-booking-service"}
