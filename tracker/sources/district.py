"""District (district.in) source.

The movie-in-city page is a Next.js page whose __NEXT_DATA__ JSON embeds all
sessions for one date. `?fromdate=YYYY-MM-DD` selects the date and
`&frmtid=<key>` selects the language/format bucket.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass

import requests

from ..formats import tags_for
from ..models import SeatArea, Show

log = logging.getLogger(__name__)

BASE = "https://www.district.in"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/142.0 Safari/537.36"
)
_NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)
_URL = re.compile(r"/movies/(?P<slug>[a-z0-9-]+?)-movie-tickets(?:-in-[a-z0-9-]+)?-MV(?P<id>\d+)")


class DistrictError(RuntimeError):
    pass


@dataclass
class Movie:
    key: str
    name: str
    slug: str  # e.g. "avengers-doomsday"
    district_id: str  # e.g. "176735"

    @staticmethod
    def from_url(key: str, name: str, url: str) -> "Movie":
        m = _URL.search(url)
        if not m:
            raise ValueError(f"Not a District movie URL: {url}")
        return Movie(key=key, name=name, slug=m["slug"], district_id=m["id"])


def movie_url(movie: Movie, city: str) -> str:
    return f"{BASE}/movies/{movie.slug}-movie-tickets-in-{city}-MV{movie.district_id}"


# ---------------------------------------------------------------- parsing


def extract_next_data(html: str) -> dict:
    m = _NEXT_DATA.search(html)
    if not m:
        raise DistrictError("__NEXT_DATA__ not found (page layout changed or request blocked)")
    return json.loads(m.group(1))


def session_block(next_data: dict) -> dict | None:
    """Return the movieSessions entry, or None if the movie has no sessions in this city."""
    try:
        ss = next_data["props"]["pageProps"]["data"]["serverState"]
    except KeyError as e:
        raise DistrictError(f"Unexpected page structure: missing {e}") from e
    blocks = (ss.get("movieSessions") or {}).values()
    return next(iter(blocks), None)


def show_dates(block: dict | None) -> list[str]:
    if not block:
        return []
    return list(block.get("meta", {}).get("showDates") or block.get("data", {}).get("sessionDates") or [])


def selected_date(block: dict | None) -> str | None:
    return (block or {}).get("meta", {}).get("selectedShowDate")


def language_buckets(block: dict | None) -> dict[str, dict]:
    """{"English": {"key": ..., "isSelected": bool}, ...}"""
    for b in (block or {}).get("meta", {}).get("filterBuckets") or []:
        if b.get("bucketKey") == "language":
            return {x["title"]: x for x in b.get("buckets", [])}
    return {}


def parse_shows(block: dict | None, movie: Movie, city: str, language: str) -> list[Show]:
    if not block:
        return []
    shows: list[Show] = []
    for cinema in block.get("arrangedSessions") or []:
        info = cinema.get("data") or {}
        theatre_id = str(info.get("id") or cinema.get("entityCode"))
        theatre_name = info.get("name") or cinema.get("entityName") or "Unknown cinema"
        for s in cinema.get("sessions") or []:
            lang = s.get("lang") or ""
            if language and lang.lower() != language.lower():
                continue
            local = s.get("showTimeLocal") or ""  # 2026-12-17T08:40:00
            date = s.get("showDate") or local[:10]
            areas = tuple(
                SeatArea(
                    label=(a.get("label") or a.get("code") or "").title(),
                    price=a.get("price"),
                    available=int(a.get("sAvail") or 0),
                    total=int(a.get("sTotal") or 0),
                )
                for a in s.get("areas") or []
            )
            scrn = s.get("scrnFmt") or ""
            premium = s.get("premiumLabel") or ""
            audi = s.get("audi") or ""
            shows.append(
                Show(
                    platform="district",
                    movie_key=movie.key,
                    movie_name=movie.name,
                    theatre_id=theatre_id,
                    theatre_name=theatre_name,
                    session_id=str(s.get("sid") or s.get("encSessionId")),
                    date=date,
                    time=local[11:16],
                    time_text=s.get("showTimeText") or local[11:16],
                    starts_at=s.get("showTimeISO") or local,
                    language=lang,
                    screen_format=scrn,
                    premium_label=premium,
                    audi=audi,
                    tags=tags_for(scrn, premium, audi),
                    available=int(s.get("avail") or 0),
                    total=int(s.get("total") or 0),
                    areas=areas,
                    booking_url=f"{movie_url(movie, city)}?fromdate={date}",
                )
            )
    return shows


# ---------------------------------------------------------------- fetching


class DistrictClient:
    def __init__(self, session: requests.Session | None = None, delay: float = 1.0, retries: int = 2):
        self.http = session or requests.Session()
        self.http.headers.update(
            {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-IN,en;q=0.9"}
        )
        self.delay = delay
        self.retries = retries

    def _get(self, url: str, params: dict | None = None) -> dict:
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                r = self.http.get(url, params=params, timeout=30)
                if r.status_code in (403, 429):
                    raise DistrictError(f"HTTP {r.status_code} from District (blocked or rate-limited)")
                r.raise_for_status()
                return extract_next_data(r.text)
            except (requests.RequestException, DistrictError, json.JSONDecodeError) as e:
                last = e
                log.warning("District fetch failed (attempt %d): %s", attempt + 1, e)
                time.sleep(2 * (attempt + 1))
            finally:
                time.sleep(self.delay)
        raise DistrictError(f"Failed to fetch {url}: {last}")

    def fetch_movie(self, movie: Movie, city: str, language: str) -> list[Show]:
        url = movie_url(movie, city)
        first = session_block(self._get(url))
        dates = show_dates(first)
        if not dates:
            log.info("%s: no sessions in %s yet", movie.name, city)
            return []

        params: dict[str, str] = {}
        langs = language_buckets(first)
        bucket = next((v for k, v in langs.items() if k.lower() == language.lower()), None)
        if langs and bucket is None:
            log.info("%s: no %s shows in %s (languages: %s)", movie.name, language, city, ", ".join(langs))
            return []
        if bucket and not bucket.get("isSelected"):
            params["frmtid"] = bucket["key"]
            first = None  # first page was a different language; refetch every date

        shows: list[Show] = []
        for date in dates:
            if first is not None and selected_date(first) == date:
                block = first
            else:
                block = session_block(self._get(url, {**params, "fromdate": date}))
                if selected_date(block) not in (date, None):
                    log.warning("%s: asked for %s, got %s", movie.name, date, selected_date(block))
                    continue
            day = parse_shows(block, movie, city, language)
            log.info("%s %s: %d shows", movie.name, date, len(day))
            shows.extend(day)
        # De-duplicate (the same session can appear under nearby + far cinemas).
        return list({s.key: s for s in shows}.values())
