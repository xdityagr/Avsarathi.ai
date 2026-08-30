"""
Application entry point — FastAPI app with lifecycle management.

Startup:
  1. Initialize database (create tables if needed)
  2. Create the message queue
  3. Start the message worker (which initializes LangGraph + checkpointer)
  4. Mount the webhook router

Shutdown:
  1. Drain the message queue
  2. Stop worker tasks
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.config import get_settings
from src.database import init_database
from src.webhook import router as webhook_router, set_message_queue
from src.worker import MessageWorker

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

_worker: MessageWorker | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown."""
    global _worker

    settings = get_settings()
    logger.info("Starting Avsarathi.ai backend...")
    logger.info("Database: %s", settings.database_path)
    logger.info("Webhook URL: %s/webhook/whatsapp", settings.webhook_base_url)
    logger.info(
        "Signature verification: %s",
        "ENABLED" if settings.webhook_verify_signatures else "DISABLED",
    )

    # 1. Initialize database
    await init_database()

    # 2. Create the message queue
    message_queue = asyncio.Queue()

    # 3. Inject queue into webhook module
    set_message_queue(message_queue)

    # 4. Start the worker
    _worker = MessageWorker(queue=message_queue)
    await _worker.start()

    logger.info("Avsarathi.ai backend ready — listening for WhatsApp messages")

    yield  # App is running

    # Shutdown
    logger.info("Shutting down Avsarathi.ai backend...")
    if _worker:
        await _worker.stop()
    logger.info("Shutdown complete")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Avsarathi.ai",
    description="AI-Driven Scheme Matching for NSFDC Credit Schemes — SIH26092",
    version="0.1.0",
    lifespan=lifespan,
)

# Mount routes
app.include_router(webhook_router)


@app.get("/health")
async def health_check():
    """Health check endpoint — returns 200 if the server is running."""
    return {
        "status": "ok",
        "service": "avsarathi",
        "phase": "0",
    }


@app.get("/")
async def root():
    """Root endpoint — basic info."""
    return {
        "name": "Avsarathi.ai",
        "description": "NSFDC Scheme Matching Platform — SIH26092",
        "phase": "0 — Webhook/Queue/Worker skeleton",
        "health": "/health",
        "webhook": "/webhook/whatsapp",
    }
