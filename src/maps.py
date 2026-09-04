"""
Static map rendering — OpenStreetMap tiles, no API key.

The PS asks for "integration of a mapping service", and a text list of distances
under-reads that. This renders a real map with numbered pins, saved as a PNG that
Twilio can fetch as `media_url`.

Rolled by hand rather than using the `staticmap` package, for three reasons:

1. OSM's tile usage policy requires a valid identifying User-Agent and blocks
   generic library ones. A 403 mid-demo is a live risk and `staticmap` gives no
   clean way to set it. We already commit to an honest User-Agent in
   docs/data-sources.md §7.4.
2. `staticmap` is built on `requests` (sync); `httpx` is already a dependency
   and lets tiles fetch concurrently.
3. It's ~120 lines we fully control, versus an unmaintained dependency.

THE MOST IMPORTANT LINE IN THIS FILE is the tile cache. The demo hits the same
district every time, so after one warm run the map renders fully offline. That
converts "the map depends on OSM being reachable from the stage" into "the map
is local" — the cache-warming discipline in MVP-PLAN §5, applied to tiles.

And if every fetch fails, we still draw pins on a plain background rather than
returning nothing. Ugly beats blank.
"""

from __future__ import annotations

import asyncio
import logging
import math
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TILE_SIZE = 256
TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"

# OSM's tile policy requires this to identify the application and a contact.
TILE_USER_AGENT = (
    "Avsarathi.ai/0.1 (+https://github.com/BEAST04289/Avsarathi.ai; "
    "SIH 2026 PS26092; NSFDC scheme matching)"
)

# Filenames are unguessable: a rendered map is a public, unauthenticated URL that
# encodes a beneficiary's approximate location, which is personal data under DPDP.
TOKEN_BYTES = 16
MEDIA_FILENAME_PATTERN = r"^[A-Za-z0-9_-]{22}\.png$"

PIN_COLOURS = [(198, 40, 40), (21, 101, 192), (46, 125, 50), (239, 108, 0)]


@dataclass
class MapPin:
    latitude: float
    longitude: float
    label: str = ""


# ---------------------------------------------------------------------------
# Slippy-tile maths
# ---------------------------------------------------------------------------

def deg2num(lat: float, lon: float, zoom: int) -> tuple[float, float]:
    """Longitude/latitude to fractional tile coordinates (Web Mercator)."""
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return x, y


def num2deg(x: float, y: float, zoom: int) -> tuple[float, float]:
    """Fractional tile coordinates back to latitude/longitude."""
    n = 2.0 ** zoom
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lat, lon


def choose_zoom(pins: list[MapPin], width: int, height: int, max_zoom: int = 16) -> int:
    """Highest zoom at which every pin still fits in the image."""
    if len(pins) < 2:
        return 13
    lats = [p.latitude for p in pins]
    lons = [p.longitude for p in pins]
    for zoom in range(max_zoom, 2, -1):
        xs, ys = zip(*(deg2num(lat, lon, zoom) for lat, lon in zip(lats, lons)))
        span_x = (max(xs) - min(xs)) * TILE_SIZE
        span_y = (max(ys) - min(ys)) * TILE_SIZE
        # Leave a margin so pins near the edge aren't clipped.
        if span_x < width * 0.8 and span_y < height * 0.8:
            return zoom
    return 3


# ---------------------------------------------------------------------------
# Tiles
# ---------------------------------------------------------------------------

def _tile_cache_path(cache_dir: Path, z: int, x: int, y: int) -> Path:
    return cache_dir / str(z) / str(x) / f"{y}.png"


async def _fetch_tile(
    client: httpx.AsyncClient,
    z: int,
    x: int,
    y: int,
    cache_dir: Optional[Path],
) -> Optional[bytes]:
    """One tile, from the local cache when possible."""
    if cache_dir is not None:
        cached = _tile_cache_path(cache_dir, z, x, y)
        if cached.exists():
            return cached.read_bytes()

    try:
        response = await client.get(TILE_URL.format(z=z, x=x, y=y))
        response.raise_for_status()
        payload = response.content
    except Exception as exc:
        logger.warning("Tile %d/%d/%d unavailable: %s", z, x, y, exc)
        return None

    if cache_dir is not None:
        cached = _tile_cache_path(cache_dir, z, x, y)
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(payload)
    return payload


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

async def render_map(
    pins: list[MapPin],
    output_dir: Path,
    cache_dir: Optional[Path] = None,
    width: int = 640,
    height: int = 480,
) -> Path:
    """Render pins onto an OSM basemap and return the PNG path.

    Never raises for a tile failure — a map with no basemap still shows the
    relative positions, which is most of the value on a small screen.
    """
    from PIL import Image, ImageDraw

    if not pins:
        raise ValueError("render_map needs at least one pin")

    zoom = choose_zoom(pins, width, height)
    centre_lat = sum(p.latitude for p in pins) / len(pins)
    centre_lon = sum(p.longitude for p in pins) / len(pins)
    centre_x, centre_y = deg2num(centre_lat, centre_lon, zoom)

    # Pixel coordinate of the image's top-left corner in the global tile plane.
    origin_px = centre_x * TILE_SIZE - width / 2
    origin_py = centre_y * TILE_SIZE - height / 2

    canvas = Image.new("RGB", (width, height), (233, 229, 220))  # OSM-ish land

    x_start, x_end = int(origin_px // TILE_SIZE), int((origin_px + width) // TILE_SIZE)
    y_start, y_end = int(origin_py // TILE_SIZE), int((origin_py + height) // TILE_SIZE)
    wanted = [(x, y) for x in range(x_start, x_end + 1) for y in range(y_start, y_end + 1)]

    async with httpx.AsyncClient(
        headers={"User-Agent": TILE_USER_AGENT}, timeout=20.0, follow_redirects=True
    ) as client:
        tiles = await asyncio.gather(
            *(_fetch_tile(client, zoom, x, y, cache_dir) for x, y in wanted)
        )

    placed = 0
    for (tx, ty), payload in zip(wanted, tiles):
        if payload is None:
            continue
        try:
            import io as _io
            tile = Image.open(_io.BytesIO(payload)).convert("RGB")
        except Exception:
            continue
        canvas.paste(tile, (int(tx * TILE_SIZE - origin_px), int(ty * TILE_SIZE - origin_py)))
        placed += 1

    if placed == 0:
        logger.warning("No tiles rendered — falling back to pins on a plain background")

    draw = ImageDraw.Draw(canvas)
    for index, pin in enumerate(pins):
        px, py = deg2num(pin.latitude, pin.longitude, zoom)
        x = px * TILE_SIZE - origin_px
        y = py * TILE_SIZE - origin_py
        colour = PIN_COLOURS[index % len(PIN_COLOURS)]
        radius = 13
        draw.ellipse([x - radius, y - radius, x + radius, y + radius],
                     fill=colour, outline=(255, 255, 255), width=3)
        marker = pin.label or str(index + 1)
        draw.text((x - 4 * len(marker[:2]), y - 6), marker[:2], fill=(255, 255, 255))

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"{secrets.token_urlsafe(TOKEN_BYTES)}.png"
    canvas.save(path, format="PNG", optimize=True)
    logger.info("Rendered map with %d pins (%d/%d tiles) -> %s",
                len(pins), placed, len(wanted), path.name)
    return path


def maps_link(latitude: float, longitude: float) -> str:
    """A plain maps URL, as the always-works fallback for a location message.

    A native WhatsApp location pin needs an approved `twilio/location` Content
    Template, and approval turnaround isn't something we control. This link
    opens the user's own maps app with directions, works on every handset, and
    never fails — arguably the better option on a low-end phone anyway.
    """
    return f"https://www.google.com/maps/search/?api=1&query={latitude},{longitude}"
