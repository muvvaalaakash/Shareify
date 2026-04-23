"""
Shareify Item Service
- Add item (authenticated users only – owner role)
- Get all items
- Get item by ID
- Notifies Inventory Service when item is created
"""

import os
import uuid
import sqlite3
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt
import httpx

app = FastAPI(title="Shareify Item Service", version="1.0.0")

# ── Config ──────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET", "shareify-secret-key-2024")
ALGORITHM = "HS256"
DATABASE = os.getenv("DATABASE_PATH", "./data/items.db")
INVENTORY_SERVICE_URL = os.getenv("INVENTORY_SERVICE_URL", "http://localhost:8003")

VALID_CATEGORIES = ["Electronics", "Furniture", "Kitchen", "Tools"]
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
        CREATE TABLE IF NOT EXISTS items (
            item_id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            price_per_day REAL NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup():
    init_db()


# ── Schemas ─────────────────────────────────────────────────────────────────
class ItemCreate(BaseModel):
    title: str
    category: str
    price_per_day: float


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


# ── Endpoints ───────────────────────────────────────────────────────────────
@app.post("/items")
def add_item(item: ItemCreate, payload: dict = Depends(verify_token)):
    if item.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {VALID_CATEGORIES}",
        )
    if item.price_per_day <= 0:
        raise HTTPException(status_code=400, detail="Price must be positive")

    item_id = str(uuid.uuid4())
    owner_id = payload["user_id"]
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO items (item_id, owner_id, title, category, price_per_day, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (item_id, owner_id, item.title, item.category, item.price_per_day,
             datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    finally:
        conn.close()

    # Notify Inventory Service to mark the item as available
    try:
        httpx.post(
            f"{INVENTORY_SERVICE_URL}/initialize",
            json={"item_id": item_id},
            timeout=5.0,
        )
    except Exception as e:
        print(f"[WARN] Could not notify inventory service: {e}")

    return {
        "message": "Item added successfully",
        "item_id": item_id,
        "owner_id": owner_id,
    }


@app.get("/items")
def get_items(category: str = Query(None)):
    conn = get_db()
    try:
        if category:
            rows = conn.execute(
                "SELECT * FROM items WHERE category = ?", (category,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM items").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/items/{item_id}")
def get_item(item_id: str):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM items WHERE item_id = ?", (item_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        return dict(row)
    finally:
        conn.close()


@app.get("/health")
def health():
    return {"status": "healthy", "service": "shareify-item-service"}
