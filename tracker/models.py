from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class SeatArea:
    label: str
    price: float | None
    available: int
    total: int


@dataclass(frozen=True)
class Show:
    platform: str
    movie_key: str
    movie_name: str
    theatre_id: str
    theatre_name: str
    session_id: str
    date: str  # YYYY-MM-DD (IST)
    time: str  # HH:MM 24h (IST)
    time_text: str  # "08:40 AM"
    starts_at: str  # ISO with offset
    language: str
    screen_format: str  # raw, e.g. "MS INFINITY VISION 4DX-3D"
    premium_label: str  # raw, e.g. "4DX"
    audi: str
    tags: tuple[str, ...]
    available: int
    total: int
    areas: tuple[SeatArea, ...] = field(default_factory=tuple)
    booking_url: str = ""

    @property
    def key(self) -> str:
        # Changing time or format at the same cinema counts as a new show.
        return "|".join(
            [
                self.platform,
                self.movie_key,
                self.theatre_id,
                self.session_id,
                self.date,
                self.time,
                self.screen_format,
            ]
        )

    @property
    def format_label(self) -> str:
        return " ".join(self.tags) if self.tags else "2D"

    @property
    def min_price(self) -> float | None:
        prices = [a.price for a in self.areas if a.price is not None]
        return min(prices) if prices else None

    def to_doc(self) -> dict:
        d = asdict(self)
        d["tags"] = list(self.tags)
        d["areas"] = [asdict(a) for a in self.areas]
        d["format_label"] = self.format_label
        d["min_price"] = self.min_price
        return d
