"""
Conversational engine tests.

The chat is the whole product now, so the things that must never break are:
one question at a time, always with tappable options, never a dead end, and the
language following the user without them having to ask.
"""

from __future__ import annotations

import pytest

from src.chat import PLACES, parse_amount, turn
from src.i18n import LANGUAGES, detect_language, t


# ---------------------------------------------------------------------------
# Amount parsing — people do not type "120000"
# ---------------------------------------------------------------------------

class TestAmountParsing:
    def test_plain_number(self):
        assert parse_amount("120000") == 120_000

    def test_with_separators_and_symbol(self):
        assert parse_amount("₹1,20,000") == 120_000

    @pytest.mark.parametrize("text,expected", [
        ("1.4 lakh", 140_000), ("1.4 lac", 140_000), ("50L", 5_000_000),
        ("2 crore", 20_000_000), ("80 thousand", 80_000), ("50k", 50_000),
    ])
    def test_scaled_words(self, text, expected):
        assert parse_amount(text) == expected

    def test_multi_part_sums(self):
        """'my husband earns 2 lakh and I earn 80 thousand' -> 2.8 lakh."""
        assert parse_amount("2 lakh and 80 thousand") == 280_000

    def test_unreadable_returns_none(self):
        assert parse_amount("no idea") is None
        assert parse_amount("") is None


# ---------------------------------------------------------------------------
# Language
# ---------------------------------------------------------------------------

class TestLanguage:
    @pytest.mark.parametrize("text,lang", [
        ("मुझे सिलाई की दुकान खोलनी है", "hi"),
        ("আমি একটি দোকান খুলতে চাই", "bn"),
        ("எனக்கு ஒரு கடை வேண்டும்", "ta"),
    ])
    def test_script_detection(self, text, lang):
        assert detect_language(text) == lang

    def test_ascii_is_not_guessed(self):
        assert detect_language("I want a tailoring shop") is None

    def test_every_language_has_every_string(self):
        """A missing translation must never reach a user as a blank."""
        from src.i18n import STRINGS
        for key, entry in STRINGS.items():
            for code in LANGUAGES:
                assert entry.get(code), f"{key} missing {code}"

    def test_unknown_key_falls_back_to_itself(self):
        assert t("no_such_key", "hi") == "no_such_key"


# ---------------------------------------------------------------------------
# The conversation
# ---------------------------------------------------------------------------

class TestConversation:
    @pytest.mark.asyncio
    async def test_opens_with_a_greeting_and_options(self):
        r = await turn(None)
        assert len(r["messages"]) == 2          # greeting, then one question
        assert len(r["chips"]) == 2             # never a bare text prompt
        assert r["done"] is False

    @pytest.mark.asyncio
    async def test_hindi_is_detected_from_the_first_message(self):
        """Nobody should have to pick a language before they can ask."""
        r = await turn(None, "मुझे सिलाई की दुकान खोलनी है")
        assert r["language"] == "hi"
        assert r["step"] == "cost"

    @pytest.mark.asyncio
    async def test_every_step_offers_chips(self):
        r = await turn(None)
        sid = r["session_id"]
        for message in ["business", "120000", "280000", "SC", "female"]:
            r = await turn(sid, message)
            if not r["done"]:
                assert r["chips"], f"step {r['step']} left the user with no options"

    @pytest.mark.asyncio
    async def test_unparseable_answer_re_asks_with_options(self):
        """Never a dead end."""
        r = await turn(None)
        sid = r["session_id"]
        r = await turn(sid, "asdfghjkl")
        assert r["step"] == "purpose"           # did not advance
        assert r["chips"]                       # options still offered
        assert len(r["messages"]) == 2          # apology, then the question again

    @pytest.mark.asyncio
    async def test_full_run_produces_cards(self):
        r = await turn(None)
        sid = r["session_id"]
        for message in ["business", "120000", "280000", "SC", "female", "ballia"]:
            r = await turn(sid, message)
        assert r["done"] is True
        kinds = [c["kind"] for c in r["cards"]]
        assert kinds.count("scheme") == 3
        assert "compare" in kinds
        assert "partners" in kinds
        assert "notice" in kinds

    @pytest.mark.asyncio
    async def test_cheapest_scheme_is_first_and_badged(self):
        r = await turn(None)
        sid = r["session_id"]
        for m in ["business", "120000", "280000", "SC", "female", "ballia"]:
            r = await turn(sid, m)
        schemes = [c for c in r["cards"] if c["kind"] == "scheme"]
        assert schemes[0]["best"] is True
        assert schemes[0]["name"] == "Micro Finance Scheme"
        assert all(s["best"] is False for s in schemes[1:])

    @pytest.mark.asyncio
    async def test_out_of_category_gets_a_referral_not_a_wall(self):
        r = await turn(None)
        sid = r["session_id"]
        for m in ["business", "120000", "280000", "OBC", "male", "ballia"]:
            r = await turn(sid, m)
        assert r["done"] is True
        notices = [c for c in r["cards"] if c["kind"] == "notice"]
        assert any("NBCFDC" in c["body"] for c in notices)

    @pytest.mark.asyncio
    async def test_restart_clears_the_answers(self):
        r = await turn(None)
        sid = r["session_id"]
        await turn(sid, "business")
        r = await turn(sid, "", restart=True)
        assert r["step"] == "purpose"

    @pytest.mark.asyncio
    async def test_free_text_purpose_is_understood(self):
        """'I want to open a tailoring shop' should not need a chip tap."""
        r = await turn(None)
        sid = r["session_id"]
        r = await turn(sid, "I want to open a small tailoring shop")
        assert r["step"] == "cost"

    @pytest.mark.asyncio
    async def test_places_are_all_routable(self):
        for place in PLACES:
            r = await turn(None)
            sid = r["session_id"]
            for m in ["business", "120000", "280000", "SC", "female", place["id"]]:
                r = await turn(sid, m)
            assert r["done"] is True, f"{place['id']} did not complete"
