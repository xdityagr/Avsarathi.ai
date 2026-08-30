"""
Webhook handler — the most critical module in the system.

Non-negotiable (architecture.md #1):
This handler does ONLY:
  1. Verify Twilio HMAC-SHA1 signature
  2. Check idempotency (message_id already processed?)
  3. Enqueue the message
  4. Return 200 immediately

NO LLM calls. NO slow work. NO database writes beyond the idempotency check.
Total time budget: < 50ms.

Why: GrantBot's prior failure was caused partly by doing slow work (Gemini calls)
synchronously inside the webhook handler, causing WhatsApp/Twilio to retry-deliver
the same message — which, without idempotency, got processed multiple times.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from fastapi import APIRouter, Request, Response, HTTPException
from twilio.request_validator import RequestValidator

from src.config import get_settings
from src.database import get_connection, is_message_processed, mark_message_processed

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])

# This gets set by main.py at startup — the queue the worker reads from.
# Using a module-level reference avoids circular imports.
_message_queue: asyncio.Queue | None = None


def set_message_queue(queue: asyncio.Queue) -> None:
    """Called by main.py to inject the shared message queue."""
    global _message_queue
    _message_queue = queue


def _verify_twilio_signature(request: Request, form_data: dict) -> bool:
    """Verify Twilio's HMAC-SHA1 signature.

    Twilio signs with HMAC-SHA1 (NOT SHA256 — architecture.md says SHA256
    but that's for Meta Cloud API, not Twilio). Uses the X-Twilio-Signature
    header, keyed on the Auth Token.

    See master_build_guide.md Issue #1 for the full explanation.
    """
    settings = get_settings()

    if not settings.webhook_verify_signatures:
        logger.warning("Signature verification DISABLED — local testing only")
        return True

    signature = request.headers.get("X-Twilio-Signature", "")
    if not signature:
        logger.warning("Missing X-Twilio-Signature header")
        return False

    validator = RequestValidator(settings.twilio_auth_token)

    # Twilio computes signature over the full URL + sorted POST params
    # We must reconstruct the URL as Twilio sees it (the public webhook URL)
    url = str(request.url)

    # If behind a reverse proxy (ngrok, cloudflare tunnel), the URL in the
    # request object might be http://localhost:8000/... instead of the public
    # URL that Twilio signed against. Use the configured base URL instead.
    if settings.webhook_base_url:
        url = settings.webhook_base_url.rstrip("/") + request.url.path

    return validator.validate(url, form_data, signature)


@router.post("/whatsapp")
async def whatsapp_webhook(request: Request) -> Response:
    """Handle incoming WhatsApp messages from Twilio.

    Steps (architecture.md, Non-negotiable #1):
    1. Parse form data
    2. Verify Twilio signature
    3. Check idempotency
    4. Enqueue
    5. Return 200

    Nothing else. Ever.
    """
    # Step 1: Parse form data
    form_data = await request.form()
    form_dict = dict(form_data)

    # Step 2: Verify signature
    if not _verify_twilio_signature(request, form_dict):
        logger.warning("Invalid Twilio signature — rejecting request")
        raise HTTPException(status_code=403, detail="Invalid signature")

    # Extract key fields
    message_sid = form_dict.get("MessageSid", "")
    from_number = form_dict.get("From", "")
    body = form_dict.get("Body", "")

    if not message_sid or not from_number:
        logger.warning("Missing MessageSid or From in webhook payload")
        return Response(status_code=200)  # Still return 200 — don't make Twilio retry garbage

    # Step 3: Idempotency check
    db = await get_connection()
    try:
        if await is_message_processed(db, message_sid):
            logger.info("Message %s already processed — skipping (idempotent)", message_sid)
            return Response(status_code=200)

        # Mark as processed BEFORE enqueuing — if enqueue fails, we'd rather
        # skip a message than process it twice (architecture.md: never double-process)
        await mark_message_processed(db, message_sid)
    finally:
        await db.close()

    # Step 4: Enqueue
    if _message_queue is None:
        logger.error("Message queue not initialized — dropping message %s", message_sid)
        return Response(status_code=200)

    message_payload = {
        "message_sid": message_sid,
        "from_number": from_number,
        "body": body.strip(),
        # Include additional Twilio fields that might be useful later
        "num_media": form_dict.get("NumMedia", "0"),
        "latitude": form_dict.get("Latitude"),
        "longitude": form_dict.get("Longitude"),
        # Button response fields (for Content Template quick replies)
        "button_text": form_dict.get("ButtonText"),
        "button_payload": form_dict.get("ButtonPayload"),
    }

    await _message_queue.put(message_payload)
    logger.info(
        "Message %s from %s enqueued (queue size: %d)",
        message_sid,
        from_number[:10] + "...",  # Don't log full phone numbers
        _message_queue.qsize(),
    )

    # Step 5: Return 200 immediately
    return Response(status_code=200)


@router.get("/whatsapp")
async def whatsapp_webhook_verify(request: Request) -> Response:
    """Handle Twilio's initial webhook URL verification (GET request).

    Twilio may send a GET to verify the webhook URL is reachable.
    Just return 200.
    """
    return Response(status_code=200, content="OK")
