"""
Where the data lives, in one place.

`data/` was hardcoded in eight modules, which is fine on a laptop and wrong
everywhere else. A container has its own filesystem layout, and Render mounts a
persistent disk at a path it chooses, not one we choose — so the directory has
to be a setting rather than a literal.

TWO KINDS OF DATA, AND THEY DO NOT BELONG TOGETHER

The corpus (`schemes.db`) is a BUILD ARTEFACT. It is 283 MB, read-only at
runtime, rebuilt by an ingest that takes hours, and identical for every
deployment. It belongs in the image, baked in at build time.

Everything else — who has opted out of WhatsApp, which messages have been
answered, the geocoding cache — is STATE. It is tiny, it is written to, and it
must survive a restart. It belongs on a disk, or in a database.

Conflating them is how you end up either shipping a 283 MB file to a
persistent volume on every deploy, or losing someone's opt-out because it was
stored next to a file you replace.
"""

from __future__ import annotations

import os
from pathlib import Path


def _dir(name: str, default: str) -> Path:
    return Path(os.environ.get(name, default))


#: Read-only, baked into the image. Overridden only if the corpus is mounted.
CORPUS_DIR = _dir("AVSARATHI_CORPUS_DIR", "data")

#: Read-write, and the thing that needs to outlive a deploy.
STATE_DIR = _dir("AVSARATHI_STATE_DIR", "data")

#: Rendered map images and the tile cache. Regenerable, so losing them costs a
#: little latency and nothing else — they stay with the state directory rather
#: than earning a volume of their own.
MEDIA_DIR = STATE_DIR / "maps"
TILE_DIR = STATE_DIR / "tiles"

CORPUS_DB = CORPUS_DIR / "schemes.db"
STATE_DB = STATE_DIR / "avsarathi.db"
GEO_CACHE_DB = STATE_DIR / "geo-cache.db"


def ensure_state_dirs() -> None:
    """Make the writable directories, once, at startup.

    A container starts with an empty volume and SQLite will not create a
    missing parent, so the first write would fail with a confusing "unable to
    open database file" rather than anything about a directory.
    """
    for path in (STATE_DIR, MEDIA_DIR, TILE_DIR):
        path.mkdir(parents=True, exist_ok=True)


def describe() -> dict[str, str]:
    """What the process actually resolved, for the health endpoint.

    Worth exposing: the commonest deployment failure here is a disk mounted
    somewhere other than where the app looks, and that is invisible until
    something tries to write.
    """
    return {
        "corpus_dir": str(CORPUS_DIR.resolve()),
        "state_dir": str(STATE_DIR.resolve()),
        "corpus_present": str(CORPUS_DB.exists()),
        "corpus_mb": (f"{CORPUS_DB.stat().st_size / 1e6:.0f}"
                      if CORPUS_DB.exists() else "0"),
    }
