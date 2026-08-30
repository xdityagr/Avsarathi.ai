"""
WhatsApp message sender — decoupled from webhook handler.

Architecture.md requirement: the response is sent via a SEPARATE outbound
WhatsApp API call, fully decoupled from the original webhook request/response cycle.

Uses Twilio's REST API to send messages. Retries with exponential backoff
on transient failures.
"""

from __future__ import annotations

import logging
import asyncio
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

from src.config import get_settings

logger = logging.getLogger(__name__)

# Lazy-initialized Twilio client (created on first use, not at import time)
_client: Client | None = None


def _get_client() -> Client:
    """Get or create the Twilio client singleton."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    return _client


async def send_whatsapp_message(
    to: str,
    body: str,
    max_retries: int = 3,
) -> bool:
    """Send a WhatsApp text message via Twilio.

    Args:
        to: Recipient WhatsApp number (format: "whatsapp:+91XXXXXXXXXX")
        body: Message text
        max_retries: Number of retries on transient failure

    Returns:
        True if message was sent successfully, False otherwise.

    Note: This is called from the worker, never from the webhook handler.
    The Twilio SDK is synchronous, so we run it in a thread executor
    to avoid blocking the asyncio event loop.
    """
    settings = get_settings()
    client = _get_client()

    for attempt in range(max_retries):
        try:
            # Run synchronous Twilio API call in thread pool
            message = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: client.messages.create(
                    body=body,
                    from_=settings.twilio_whatsapp_number,
                    to=to,
                ),
            )
            logger.info(
                "WhatsApp message sent: SID=%s, to=%s",
                message.sid,
                to[:15] + "...",
            )
            return True

        except TwilioRestException as e:
            logger.error(
                "Twilio API error (attempt %d/%d): %s",
                attempt + 1,
                max_retries,
                e,
            )
            if attempt < max_retries - 1:
                # Exponential backoff: 1s, 2s, 4s
                wait_time = 2 ** attempt
                logger.info("Retrying in %ds...", wait_time)
                await asyncio.sleep(wait_time)
            else:
                logger.error("All retries exhausted for message to %s", to[:15] + "...")
                return False

        except Exception as e:
            logger.error("Unexpected error sending WhatsApp message: %s", e)
            return False

    return False
