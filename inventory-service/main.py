"""
Shareify Inventory Service
- Initialize item availability
- Check availability for a date range
- Reserve item (block dates)
- Release item (unblock dates)
"""

import os
import uuid
import sqlite3
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

app = FastAPI(title="Shareify Inventory Service", version="1.0.0")

# ── Config ──────────────────────────────────────────────────────────────────
DATABASE = os.getenv("DATABASE_PATH", "./data/inventory.db")


# ── Database ────────────────────────────────────────────────────────────────
def get_db():
    os.makedirs(os.path.dirname(DATABASE) or ".", exist_ok=True)
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            item_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'available'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            reservation_id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            booking_id TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup():
    init_db()


# ── Schemas ─────────────────────────────────────────────────────────────────
class InitializeRequest(BaseModel):
    item_id: str


class ReserveRequest(BaseModel):
    item_id: str
    start_date: str  # YYYY-MM-DD
    end_date: str
    booking_id: str


class ReleaseRequest(BaseModel):
    booking_id: str


# ── Helpers ─────────────────────────────────────────────────────────────────
def has_overlap(conn, item_id: str, start_date: str, end_date: str) -> bool:
    """Check if any active reservation overlaps with the requested range."""
    row = conn.execute(
        """
        SELECT 1 FROM reservations
        WHERE item_id = ? AND status = 'active'
          AND start_date <= ? AND end_date >= ?
        LIMIT 1
        """,
        (item_id, end_date, start_date),
    ).fetchone()
    return row is not None


# ── Endpoints ───────────────────────────────────────────────────────────────
@app.post("/initialize")
def initialize_item(req: InitializeRequest):
    """Called by Item Service when a new item is created."""
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT 1 FROM inventory WHERE item_id = ?", (req.item_id,)
        ).fetchone()
        if existing:
            return {"message": "Item already initialized"}

        conn.execute(
            "INSERT INTO inventory (item_id, status) VALUES (?, 'available')",
            (req.item_id,),
        )
        conn.commit()
        return {"message": "Item initialized as available", "item_id": req.item_id}
    finally:
        conn.close()


@app.get("/availability")
def check_availability(
    item_id: str = Query(...),
    start_date: str = Query(...),
    end_date: str = Query(...),
):
    conn = get_db()
    try:
        # Check if item exists in inventory
        inv = conn.execute(
            "SELECT * FROM inventory WHERE item_id = ?", (item_id,)
        ).fetchone()
        if not inv:
            raise HTTPException(status_code=404, detail="Item not found in inventory")

        if inv["status"] == "unavailable":
            return {"available": False, "reason": "Item marked as unavailable"}

        if has_overlap(conn, item_id, start_date, end_date):
            return {"available": False, "reason": "Dates already reserved"}

        return {"available": True, "item_id": item_id}
    finally:
        conn.close()


@app.post("/reserve")
def reserve_item(req: ReserveRequest):
    conn = get_db()
    try:
        if has_overlap(conn, req.item_id, req.start_date, req.end_date):
            raise HTTPException(
                status_code=409, detail="Item not available for the requested dates"
            )

        reservation_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO reservations "
            "(reservation_id, item_id, start_date, end_date, booking_id, status, created_at) "
            "VALUES (?, ?, ?, ?, ?, 'active', ?)",
            (reservation_id, req.item_id, req.start_date, req.end_date,
             req.booking_id, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        return {
            "message": "Item reserved successfully",
            "reservation_id": reservation_id,
        }
    finally:
        conn.close()


@app.post("/release")
def release_reservation(req: ReleaseRequest):
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM reservations WHERE booking_id = ? AND status = 'active'",
            (req.booking_id,),
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=404, detail="Active reservation not found for this booking"
            )

        conn.execute(
            "UPDATE reservations SET status = 'released' WHERE booking_id = ?",
            (req.booking_id,),
        )
        conn.commit()
        return {"message": "Reservation released", "booking_id": req.booking_id}
    finally:
        conn.close()


@app.get("/health")
def health():
    return {"status": "healthy", "service": "shareify-inventory-service"}
