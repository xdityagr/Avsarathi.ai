"""
Message queue worker — consumes messages from the async queue.

Architecture.md requirements fulfilled here:
- Worker reads user state atomically (LangGraph checkpointer, Non-negotiable #2)
- Every step is idempotent and retryable (Non-negotiable #3)
- State written back atomically, same transaction as read (message chain step 6)
- Response sent via separate outbound call (message chain step 7)

Implementation details:
- asyncio.Queue as the in-process message queue
- GC-safe task management (master_build_guide.md Issue #8)
- Per-user rate limiting (in-memory token bucket)
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from src.config import get_settings
from src.graph import build_graph
from src.whatsapp import send_whatsapp_message, send_whatsapp_buttons

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# GC-safe task management (master_build_guide.md Issue #8)
# Without this, asyncio.create_task() tasks can be garbage-collected mid-run.
# ---------------------------------------------------------------------------

_background_tasks: set[asyncio.Task] = set()


def _spawn_task(coro) -> asyncio.Task:
    """Spawn an asyncio task with GC protection."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


# ---------------------------------------------------------------------------
# Per-user rate limiter (simple token bucket)
# Protects against message loops silently burning API quota.
# ---------------------------------------------------------------------------

class RateLimiter:
    """Simple per-user token bucket rate limiter.

    Allows `max_tokens` messages per `window_seconds` per user.
    In-memory only — resets on server restart, which is fine.
    """

    def __init__(self, max_tokens: int = 10, window_seconds: float = 60.0):
        self.max_tokens = max_tokens
        self.window_seconds = window_seconds
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def allow(self, user_id: str) -> bool:
        """Check if this user is within their rate limit."""
        now = time.monotonic()
        bucket = self._buckets[user_id]

        # Remove expired timestamps
        cutoff = now - self.window_seconds
        self._buckets[user_id] = [t for t in bucket if t > cutoff]

        if len(self._buckets[user_id]) >= self.max_tokens:
            return False

        self._buckets[user_id].append(now)
        return True


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------

class MessageWorker:
    """Async worker that consumes messages from the queue and processes them
    through the LangGraph graph with checkpointer-backed state persistence.
    """

    def __init__(self, queue: asyncio.Queue):
        self.queue = queue
        self._compiled_graph = None
        self._checkpointer = None
        self._checkpointer_cm = None
        self._rate_limiter = RateLimiter(
            max_tokens=get_settings().max_messages_per_user_per_minute,
            window_seconds=60.0,
        )

    async def start(self) -> None:
        """Initialize the LangGraph graph with AsyncSqliteSaver checkpointer
        and start worker tasks."""
        settings = get_settings()

        # Create the checkpointer — this manages its own SQLite tables
        # for conversation state (architecture.md Non-negotiable #2)
        #
        # from_conn_string() returns an ASYNC CONTEXT MANAGER, not a saver. The
        # previous code called .setup() on the context manager itself, which
        # raised AttributeError the first time the app was actually started —
        # the unit tests stub _checkpointer out, so nothing caught it until the
        # server ran for real.
        #
        # A worker with start()/stop() can't use `async with` around its whole
        # life, so enter the context explicitly here and exit it in stop().
        self._checkpointer_cm = AsyncSqliteSaver.from_conn_string(
            settings.database_path,
        )
        self._checkpointer = await self._checkpointer_cm.__aenter__()
        await self._checkpointer.setup()

        # Build and compile the graph with the checkpointer
        graph_builder = build_graph()
        self._compiled_graph = graph_builder.compile(
            checkpointer=self._checkpointer,
        )

        # Start worker coroutines
        for i in range(settings.worker_count):
            _spawn_task(self._worker_loop(worker_id=i))
            logger.info("Worker %d started", i)

    async def stop(self) -> None:
        """Gracefully stop workers — drain the queue."""
        logger.info("Stopping workers — draining queue...")

        # Wait for the queue to be fully processed (with timeout)
        try:
            await asyncio.wait_for(self.queue.join(), timeout=10.0)
            logger.info("Queue drained successfully")
        except asyncio.TimeoutError:
            logger.warning("Queue drain timed out — %d messages remaining", self.queue.qsize())

        # Cancel all background tasks
        for task in _background_tasks.copy():
            task.cancel()

        # Close the checkpointer's SQLite connection. Paired with the explicit
        # __aenter__ in start() — see the note there.
        if self._checkpointer_cm is not None:
            try:
                await self._checkpointer_cm.__aexit__(None, None, None)
            except Exception as exc:
                logger.warning("Checkpointer did not close cleanly: %s", exc)
            finally:
                self._checkpointer_cm = None
                self._checkpointer = None

    async def _worker_loop(self, worker_id: int) -> None:
        """Main worker loop — dequeue, process, send response.

        Each iteration is idempotent: if processing fails, the message
        was already marked as processed in the webhook handler (so it won't
        be re-delivered), and we send an error message to the user.
        """
        while True:
            msg = await self.queue.get()
            try:
                await self._process_message(msg, worker_id)
            except asyncio.CancelledError:
                logger.info("Worker %d cancelled", worker_id)
                break
            except Exception as e:
                logger.error(
                    "Worker %d error processing %s: %s",
                    worker_id,
                    msg.get("message_sid", "unknown"),
                    e,
                    exc_info=True,
                )
                # Send error message to user — never let the bot go silent
                # (phrases.md §7 — fallback/error states)
                try:
                    await send_whatsapp_message(
                        to=msg.get("from_number", ""),
                        body=(
                            "Sorry, having a little trouble right now — "
                            "please try again in a moment. Your progress is saved."
                        ),
                    )
                except Exception:
                    logger.error("Failed to send error message to user", exc_info=True)
            finally:
                self.queue.task_done()

    async def _process_message(self, msg: dict, worker_id: int) -> None:
        """Process a single message through the LangGraph graph."""
        user_id = msg["from_number"]
        body = msg.get("body", "")
        message_sid = msg["message_sid"]

        logger.info(
            "Worker %d processing message %s from %s",
            worker_id,
            message_sid,
            user_id[:10] + "...",
        )

        # Rate-limit check
        if not self._rate_limiter.allow(user_id):
            logger.warning("Rate limit exceeded for %s", user_id[:10] + "...")
            await send_whatsapp_message(
                to=user_id,
                body="You're sending messages too quickly. Please wait a moment.",
            )
            return

        # Invoke the LangGraph graph with checkpointer
        # thread_id = WhatsApp number → one conversation thread per user
        config = {"configurable": {"thread_id": user_id}}

        # The graph reads state from the checkpointer (atomic read),
        # processes the message, and writes state back (atomic write).
        # This is Non-negotiable #2 in architecture.md.
        result = await self._compiled_graph.ainvoke(
            {
                "message": body,
                "button_payload": msg.get("button_payload", ""),
            },
            config=config,
        )

        # Send response (decoupled from webhook — message chain step 7)
        settings = get_settings()
        content_sid = result.get("response_content_sid", "")
        response_text = result.get("response", "")
        
        success = False
        if content_sid and settings.use_button_messages:
            success = await send_whatsapp_buttons(
                to=user_id,
                content_sid=content_sid,
                fallback_body=response_text,
            )
        elif response_text:
            success = await send_whatsapp_message(to=user_id, body=response_text)
            
        if response_text or content_sid:
            if success:
                logger.info(
                    "Response sent for message %s (worker %d)",
                    message_sid,
                    worker_id,
                )
            else:
                logger.error(
                    "Failed to send response for message %s",
                    message_sid,
                )
        else:
            logger.warning(
                "Empty response from graph for message %s — this shouldn't happen",
                message_sid,
            )
