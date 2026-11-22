"""Decide whether two cinema names from different platforms are the same cinema.

District says "PVR Lakeshore Mall, Y Junction, Hyderabad" where BookMyShow says
"PVR Lakeshore PXL 4K Laser ATMOS DTS-X Y Junction". Names must share the chain
(first word) and most of their distinctive words. Callers also require the same
film, date and start time, so a near-miss on the name rarely matters.
"""

from __future__ import annotations

import re

_NOISE = {
    # places and filler
    "hyderabad", "secunderabad", "mall", "cinemas", "cinema", "multiplex", "theatre", "theater", "formerly",
    "the", "and", "of", "at", "screen", "screens", "y", "x",
    # screen technology that BookMyShow puts in venue names
    "pxl", "luxe", "4dx", "imax", "4k", "2k", "laser", "atmos", "dts", "dolby", "epiq", "ice", "insignia",
    "recliner", "recliners", "screenx", "onyx", "pcx", "macro", "xe",
}


def _words(name: str) -> list[str]:
    return [w for w in re.split(r"[^a-z0-9]+", name.lower()) if w]


def _key(name: str) -> tuple[str, frozenset[str]]:
    words = _words(name)
    chain = words[0] if words else ""
    return chain, frozenset(w for w in words[1:] if w not in _NOISE and len(w) > 1)


def same_cinema(a: str, b: str) -> bool:
    chain_a, wa = _key(a)
    chain_b, wb = _key(b)
    if not chain_a or chain_a != chain_b:
        return False
    if not wa or not wb:
        return wa == wb
    if wa <= wb or wb <= wa:
        return True
    return len(wa & wb) / len(wa | wb) >= 0.4
