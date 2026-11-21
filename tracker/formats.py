"""Turn District's raw screen/format strings into short, consistent tags."""

from __future__ import annotations

import re

# (tag, regex) checked against "screen_format | premium_label | audi" (upper-cased).
# Order matters: it's the display order of tags.
_PREMIUM = [
    ("IMAX", r"\bIMAX\b"),
    ("4DX", r"\b4DX\b"),
    ("MX4D", r"\bMX4D\b"),
    ("ScreenX", r"\bSCREEN\s?X\b"),
    ("Dolby Cinema", r"\bDOLBY CINEMA\b"),
    ("EPIQ", r"\bEPIQ\b"),
    ("ICE", r"\bICE\b"),
    ("P[XL]", r"\bP\[?XL\]?\b"),
    ("Macro XE", r"\bMACRO\s?XE\b"),
    ("Onyx", r"\bONYX\b"),
    ("PCX", r"\bPCX\b"),
    ("Insignia", r"\bINSIGNIA\b"),
    ("Luxe", r"\bLUXE\b"),
    ("Laser", r"\bLASER\b"),
    ("Atmos", r"\bATMOS\b"),
    ("Recliners", r"\bRECLINERS?\b"),
]
_COMPILED = [(tag, re.compile(rx)) for tag, rx in _PREMIUM]

# Tags that count as "premium formats" in the UI filter.
PREMIUM_TAGS = {"IMAX", "4DX", "MX4D", "ScreenX", "Dolby Cinema", "EPIQ", "ICE", "P[XL]", "Macro XE", "Onyx", "PCX"}

ALL_TAGS = [t for t, _ in _PREMIUM] + ["3D", "2D"]


def tags_for(screen_format: str, premium_label: str = "", audi: str = "") -> tuple[str, ...]:
    hay = " | ".join(x for x in (screen_format, premium_label, audi) if x).upper()
    tags = [tag for tag, rx in _COMPILED if rx.search(hay)]
    if "Dolby Cinema" not in tags and re.search(r"\bDOLBY\b", hay) and "Atmos" not in tags:
        tags.append("Dolby")
    tags.append("3D" if re.search(r"\b3D\b|-3D\b", hay) else "2D")
    return tuple(tags)
