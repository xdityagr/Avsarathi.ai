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


async def send_whatsapp_buttons(
    to: str,
    content_sid: str,
    fallback_body: str = "",
    content_variables: dict | None = None,
    max_retries: int = 3,
) -> bool:
    """Send a WhatsApp message with quick-reply buttons via Content Template.

    Uses Twilio's Content API (content_sid) to send interactive button messages.
    If the Content Template call fails (e.g., Sandbox doesn't support it),
    falls back to sending plain text via send_whatsapp_message().

    Args:
        to: Recipient WhatsApp number (format: "whatsapp:+91XXXXXXXXXX")
        content_sid: Twilio Content Template SID (HXxxxx...)
        fallback_body: Plain text to send if button message fails
        content_variables: Optional template variables (e.g., {"1": "Name"})
        max_retries: Number of retries on transient failure

    Returns:
        True if message was sent (button or fallback), False otherwise.
    """
    if not content_sid:
        # No Content SID configured — send plain text directly
        if fallback_body:
            return await send_whatsapp_message(to=to, body=fallback_body, max_retries=max_retries)
        return False

    settings = get_settings()
    client = _get_client()

    for attempt in range(max_retries):
        try:
            # Build the message create kwargs
            create_kwargs = {
                "from_": settings.twilio_whatsapp_number,
                "to": to,
                "content_sid": content_sid,
            }
            if content_variables:
                import json
                create_kwargs["content_variables"] = json.dumps(content_variables)

            # Run synchronous Twilio API call in thread pool
            message = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: client.messages.create(**create_kwargs),
            )
            logger.info(
                "WhatsApp button message sent: SID=%s, content_sid=%s, to=%s",
                message.sid,
                content_sid,
                to[:15] + "...",
            )
            return True

        except TwilioRestException as e:
            # Check if this is a "content template not supported" type error
            # (e.g., Sandbox, invalid SID, unapproved template)
            # Error codes 63016, 63018 are template-related failures
            if e.code in (63016, 63018, 63024, 21602) or attempt == max_retries - 1:
                logger.warning(
                    "Content Template failed (code=%s): %s — falling back to plain text",
                    e.code,
                    e.msg,
                )
                if fallback_body:
                    return await send_whatsapp_message(
                        to=to, body=fallback_body, max_retries=max_retries
                    )
                return False

            # Transient error — retry
            logger.error(
                "Twilio API error sending buttons (attempt %d/%d): %s",
                attempt + 1,
                max_retries,
                e,
            )
            wait_time = 2 ** attempt
            logger.info("Retrying in %ds...", wait_time)
            await asyncio.sleep(wait_time)

        except Exception as e:
            logger.error("Unexpected error sending button message: %s", e)
            # Fall back to plain text
            if fallback_body:
                return await send_whatsapp_message(
                    to=to, body=fallback_body, max_retries=max_retries
                )
            return False

    return False
