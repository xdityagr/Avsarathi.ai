"""
Database module — async SQLite with WAL mode.

Handles:
- Connection factory with correct pragmas (WAL, busy_timeout, etc.)
- DDL for all custom tables (NOT conversation_state — that's LangGraph's job)
- Idempotency queries (processed_messages)
- User management queries

Architecture.md Non-negotiable #2: conversation state is handled by
LangGraph's AsyncSqliteSaver checkpointer, not by a custom table here.
"""

from __future__ import annotations

import aiosqlite
import logging
from datetime import datetime, timezone
from pathlib import Path

from src.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DDL — every table we manage (LangGraph manages its own checkpointer tables)
# ---------------------------------------------------------------------------

DDL_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        preferred_language TEXT DEFAULT 'en',
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS recommendation_cache (
        profile_fingerprint TEXT NOT NULL,
        language TEXT NOT NULL,
        scheme_id TEXT NOT NULL,
        explanation TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (profile_fingerprint, language)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS schemes (
        scheme_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        max_project_cost INTEGER,
        financing_pct REAL,
        rate_min REAL,
        rate_max REAL,
        moratorium_months_min INTEGER,
        moratorium_months_max INTEGER,
        max_income INTEGER,
        target_category TEXT,
        requires_student INTEGER DEFAULT 0,
        min_age INTEGER,
        max_age INTEGER,
        women_rebate_pct REAL DEFAULT 0.0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS channel_partners (
        partner_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        agency_type TEXT NOT NULL,
        state TEXT,
        district TEXT,
        latitude REAL,
        longitude REAL,
        net_npa_percentage REAL DEFAULT 0.0,
        cumulative_utilization REAL DEFAULT 1.0,
        has_active_overdues INTEGER DEFAULT 0
    )
    """,
]


async def _set_pragmas(db: aiosqlite.Connection) -> None:
    """Set SQLite pragmas for performance and correctness.

    - WAL mode: readers and writers don't block each other
    - busy_timeout 5000ms: concurrent writers queue instead of SQLITE_BUSY
    - synchronous NORMAL: safe with WAL, better write performance
    - foreign_keys ON: enforce referential integrity
    """
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA busy_timeout=5000")
    await db.execute("PRAGMA synchronous=NORMAL")
    await db.execute("PRAGMA foreign_keys=ON")


async def get_connection() -> aiosqlite.Connection:
    """Get a new database connection with correct pragmas set."""
    settings = get_settings()
    # Ensure the data directory exists
    db_path = Path(settings.database_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    db = await aiosqlite.connect(str(db_path))
    db.row_factory = aiosqlite.Row
    await _set_pragmas(db)
    return db


async def init_database() -> None:
    """Create all tables if they don't exist. Called once at app startup."""
    db = await get_connection()
    try:
        for ddl in DDL_STATEMENTS:
            await db.execute(ddl)
        await db.commit()
        logger.info("Database initialized successfully at %s", get_settings().database_path)
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# Idempotency — processed_messages
# ---------------------------------------------------------------------------

async def is_message_processed(db: aiosqlite.Connection, message_id: str) -> bool:
    """Check if a message has already been processed (idempotency guard)."""
    cursor = await db.execute(
        "SELECT 1 FROM processed_messages WHERE message_id = ?",
        (message_id,),
    )
    row = await cursor.fetchone()
    return row is not None


async def mark_message_processed(db: aiosqlite.Connection, message_id: str) -> None:
    """Record a message as processed. Idempotent — INSERT OR IGNORE."""
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT OR IGNORE INTO processed_messages (message_id, processed_at) VALUES (?, ?)",
        (message_id, now),
    )
    await db.commit()


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

async def get_or_create_user(db: aiosqlite.Connection, user_id: str) -> dict:
    """Get existing user or create a new one. Returns user dict."""
    cursor = await db.execute(
        "SELECT user_id, preferred_language, created_at, last_active_at FROM users WHERE user_id = ?",
        (user_id,),
    )
    row = await cursor.fetchone()

    now = datetime.now(timezone.utc).isoformat()

    if row is not None:
        # Update last_active_at
        await db.execute(
            "UPDATE users SET last_active_at = ? WHERE user_id = ?",
            (now, user_id),
        )
        await db.commit()
        return dict(row)
    else:
        # Create new user
        await db.execute(
            "INSERT INTO users (user_id, preferred_language, created_at, last_active_at) VALUES (?, 'en', ?, ?)",
            (user_id, now, now),
        )
        await db.commit()
        return {
            "user_id": user_id,
            "preferred_language": "en",
            "created_at": now,
            "last_active_at": now,
        }
