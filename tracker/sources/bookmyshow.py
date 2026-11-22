"""BookMyShow (in.bookmyshow.com) source.

The showtimes page `/movies/<city>/<slug>/buytickets/<ET code>[/<YYYYMMDD>]`
is server-rendered with a `window.__INITIAL_STATE__` JSON. Its
`fetchPrimaryDynamic-*` query holds, for one format and one date:

- `topStickyWidgets[0]`: the date strip; dates with a `cta` are bookable
- `bottomSheetData["format-selector"]`: every language/format, each its own ET code
- `showtimeWidgets`: venue cards with their showtimes and seat prices

Without a date in the URL, BookMyShow serves the first bookable date.
BookMyShow sits behind Cloudflare, which often blocks data-centre IPs (such
as GitHub Actions). A blocked request raises BookMyShowError saying so; the
tracker doesn't try to get around the block.
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

BASE = "https://in.bookmyshow.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/142.0 Safari/537.36"
)
_STATE_MARK = "window.__INITIAL_STATE__"
_URL = re.compile(r"/movies/(?:[a-z-]+/)?(?P<slug>[a-z0-9-]+)/(?:buytickets/)?(?P<code>ET\d{8})")
_PRICE = re.compile(r"[\d,]+(?:\.\d+)?")

# BookMyShow links for the films in DEFAULT_SETTINGS. The tracker copies these
# into the settings document the first time it runs, so admins can edit them.
DEFAULT_URLS = {
    "avengers-doomsday": "https://in.bookmyshow.com/movies/hyderabad/avengers-doomsday/buytickets/ET00439706",
    "dune-part-three": "https://in.bookmyshow.com/movies/hyderabad/dune-part-three/buytickets/ET00491771",
}


class BookMyShowError(RuntimeError):
    pass


@dataclass
class Movie:
    key: str
    name: str
    slug: str  # e.g. "dune-part-three"
    event_code: str  # e.g. "ET00491771"

    @staticmethod
    def from_url(key: str, name: str, url: str) -> "Movie":
        m = _URL.search(url)
        if not m:
            raise ValueError(f"Not a BookMyShow movie URL: {url}")
        return Movie(key=key, name=name, slug=m["slug"], event_code=m["code"])


@dataclass(frozen=True)
class Format:
    title: str  # "2D", "4DX", "MS - Inf Vsn 4DX 3D"
    event_code: str
    slug: str


def page_url(city: str, slug: str, event_code: str, date: str | None = None) -> str:
    url = f"{BASE}/movies/{city}/{slug}/buytickets/{event_code}"
    return f"{url}/{date.replace('-', '')}" if date else url


# ---------------------------------------------------------------- parsing


def extract_state(html: str) -> dict:
    i = html.find(_STATE_MARK)
    if i < 0:
        if "challenge-platform" in html or "Just a moment" in html or "cf-chl" in html:
            raise BookMyShowError("Cloudflare challenge page (BookMyShow is blocking this IP)")
        raise BookMyShowError("__INITIAL_STATE__ not found (page layout changed or request blocked)")
    rest = html[i + len(_STATE_MARK) :].lstrip()
    if not rest.startswith("="):
        raise BookMyShowError("Unexpected __INITIAL_STATE__ assignment")
    try:
        state, _ = json.JSONDecoder().raw_decode(rest[1:].lstrip())
    except json.JSONDecodeError as e:
        raise BookMyShowError(f"Could not parse __INITIAL_STATE__: {e}") from e
    return state


def primary(state: dict) -> dict | None:
    """The showtimes payload, or None if the movie has no shows (e.g. not open in this city)."""
    queries = (state.get("showtimesFunctionalApi") or {}).get("queries")
    if queries is None:
        raise BookMyShowError("Unexpected page structure: no showtimesFunctionalApi")
    for key, q in queries.items():
        if key.startswith("fetchPrimaryDynamic"):
            data = (q.get("data") or {}).get("data")
            if data and data.get("showtimeWidgets") is not None:
                return data
    return None


def _iso(code: str) -> str:
    return f"{code[:4]}-{code[4:6]}-{code[6:8]}"


def selected_date(p: dict | None) -> str | None:
    code = ((p or {}).get("additionalData") or {}).get("dateCode")
    return _iso(code) if code else None


def show_dates(p: dict | None) -> list[str]:
    """Bookable dates (the strip also lists greyed-out future dates without a cta)."""
    for w in (p or {}).get("topStickyWidgets") or []:
        if w.get("type") == "horizontal-block-list":
            return [_iso(d["id"]) for d in w.get("data") or [] if d.get("cta") and re.fullmatch(r"\d{8}", d.get("id", ""))]
    return []


def formats(p: dict | None, language: str) -> list[Format]:
    sheet = ((p or {}).get("bottomSheetData") or {}).get("format-selector") or {}
    for w in sheet.get("widgets") or []:
        if w.get("type") == "chip-list" and (w.get("text") or "").lower() == language.lower():
            out = []
            for chip in w.get("data") or []:
                ad = (chip.get("cta") or {}).get("additionalData") or {}
                code = ad.get("eventCode") or ""
                if code.startswith("ET"):
                    out.append(Format(title=chip.get("title") or "", event_code=code, slug=ad.get("eventUrl") or ""))
            return out
    return []


def languages(p: dict | None) -> list[str]:
    sheet = ((p or {}).get("bottomSheetData") or {}).get("format-selector") or {}
    return [w.get("text") for w in sheet.get("widgets") or [] if w.get("type") == "chip-list"]


def _price(text: str) -> float | None:
    m = _PRICE.search(text or "")
    return float(m.group(0).replace(",", "")) if m else None


def _areas(showtime: dict) -> tuple[SeatArea, ...]:
    sheet = (((showtime.get("customGestureCTA") or {}).get("additionalData") or {}).get("bottomSheetData")) or {}
    out = []
    for w in sheet.get("widgets") or []:
        v = w.get("variableData") or {}
        if "seatType" in v:
            # BookMyShow only says "AVAILABLE" / "FILLING FAST" / "SOLD OUT", not counts.
            out.append(SeatArea(label=v["seatType"].title(), price=_price(v.get("seatCost", "")), available=0, total=0))
    return tuple(out)


def _venues(p: dict):
    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "venue-card":
                yield node
                return
            for v in node.values():
                yield from walk(v)
        elif isinstance(node, list):
            for v in node:
                yield from walk(v)

    yield from walk(p.get("showtimeWidgets") or [])


def parse_shows(p: dict | None, movie: Movie, fmt: Format, city: str, language: str) -> list[Show]:
    if not p:
        return []
    shows: list[Show] = []
    for venue in _venues(p):
        info = venue.get("additionalData") or {}
        code = info.get("venueCode") or ""
        name = info.get("venueName") or "Unknown cinema"
        for section in venue.get("showtimesSections") or []:
            for st in section.get("showtimes") or []:
                ad = st.get("additionalData") or {}
                date_code = ad.get("showDateCode") or ""
                hhmm = ad.get("showTimeCode") or ""
                if not (re.fullmatch(r"\d{8}", date_code) and re.fullmatch(r"\d{4}", hhmm)):
                    continue
                date, tm = _iso(date_code), f"{hhmm[:2]}:{hhmm[2:]}"
                attrs = ad.get("attributes") or st.get("screenAttr") or ""
                screen = " | ".join(x for x in (fmt.title, attrs) if x)
                shows.append(
                    Show(
                        platform="bookmyshow",
                        movie_key=movie.key,
                        movie_name=movie.name,
                        theatre_id=code,
                        theatre_name=name,
                        session_id=str(ad.get("sessionId") or ""),
                        date=date,
                        time=tm,
                        time_text=ad.get("showTime") or st.get("title") or tm,
                        starts_at=f"{date}T{tm}:00+05:30",
                        language=language,
                        screen_format=screen,
                        premium_label=fmt.title,
                        audi=attrs,
                        tags=tags_for(fmt.title, attrs),
                        available=0,
                        total=0,
                        areas=_areas(st),
                        booking_url=page_url(city, fmt.slug or movie.slug, fmt.event_code, date),
                    )
                )
    return shows


# ---------------------------------------------------------------- fetching


class BookMyShowClient:
    def __init__(self, session: requests.Session | None = None, delay: float = 2.5, retries: int = 2):
        self.http = session or requests.Session()
        self.http.headers.update(
            {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-IN,en;q=0.9"}
        )
        self.delay = delay
        self.retries = retries

    def _get(self, url: str) -> dict | None:
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                r = self.http.get(url, timeout=30)
                if r.status_code in (403, 429, 503):
                    raise BookMyShowError(f"HTTP {r.status_code} from BookMyShow (blocked or rate-limited)")
                if r.status_code >= 400:
                    raise BookMyShowError(f"HTTP {r.status_code} from BookMyShow")
                return primary(extract_state(r.text))
            except (requests.RequestException, BookMyShowError) as e:
                last = e
                log.warning("BookMyShow fetch failed (attempt %d): %s", attempt + 1, e)
                if "blocking this IP" in str(e):
                    break  # a challenge page won't go away on retry
                # BookMyShow answers 403 when it thinks we're going too fast; back off properly.
                time.sleep((10 if "HTTP 403" in str(e) or "HTTP 429" in str(e) else 2) * (attempt + 1))
            finally:
                time.sleep(self.delay)
        raise BookMyShowError(f"Failed to fetch {url}: {last}")

    def fetch_movie(self, movie: Movie, city: str, language: str) -> list[Show]:
        first = self._get(page_url(city, movie.slug, movie.event_code))
        fmts = formats(first, language)
        if not first or not show_dates(first):
            log.info("%s: no BookMyShow shows in %s yet", movie.name, city)
            return []
        if not fmts:
            log.info("%s: no %s shows on BookMyShow (languages: %s)", movie.name, language, ", ".join(languages(first)))
            return []

        shows: list[Show] = []
        for fmt in fmts:
            # Each format has its own page and its own set of bookable dates.
            base = first if fmt.event_code == movie.event_code else self._get(page_url(city, fmt.slug or movie.slug, fmt.event_code))
            for date in show_dates(base):
                if selected_date(base) == date:
                    p = base
                else:
                    p = self._get(page_url(city, fmt.slug or movie.slug, fmt.event_code, date))
                    if selected_date(p) not in (date, None):
                        log.warning("%s %s: asked for %s, got %s", movie.name, fmt.title, date, selected_date(p))
                        continue
                day = parse_shows(p, movie, fmt, city, language)
                log.info("%s [%s] %s: %d shows", movie.name, fmt.title, date, len(day))
                shows.extend(day)
        return list({s.key: s for s in shows}.values())
