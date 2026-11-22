"""MongoDB access. Collections are documented in PLAN.md."""

from __future__ import annotations

import datetime as dt
from typing import Iterable

from pymongo import ASCENDING, DESCENDING, MongoClient, UpdateOne
from pymongo.database import Database

from .cinemas import same_cinema
from .models import Show

DEFAULT_SETTINGS = {
    "_id": "global",
    "city": "hyderabad",
    "language": "English",
    "paused": False,
    "failure_streak": 0,
    "movies": [
        {
            "key": "avengers-doomsday",
            "name": "Avengers: Doomsday",
            "url": "https://www.district.in/movies/avengers-doomsday-movie-tickets-MV176735",
            "bms_url": "https://in.bookmyshow.com/movies/hyderabad/avengers-doomsday/buytickets/ET00439706",
            "enabled": True,
            "theme": "doom",
        },
        {
            "key": "dune-part-three",
            "name": "Dune: Part Three",
            "url": "https://www.district.in/movies/dune-part-three-movie-tickets-MV207332",
            "bms_url": "https://in.bookmyshow.com/movies/hyderabad/dune-part-three/buytickets/ET00491771",
            "enabled": True,
            "theme": "dune",
        },
    ],
}


def now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def connect(uri: str, db_name: str = "dunesday") -> Database:
    client = MongoClient(uri, serverSelectionTimeoutMS=15000, appname="dunesday-tracker", tz_aware=True)
    return client[db_name]


def ensure_indexes(db: Database) -> None:
    db.shows.create_index([("movie_key", ASCENDING), ("date", ASCENDING), ("time", ASCENDING)])
    db.shows.create_index([("first_seen_at", DESCENDING)])
    db.runs.create_index([("started_at", DESCENDING)])
    db.runs.create_index("started_at", expireAfterSeconds=60 * 60 * 24 * 30, name="runs_ttl")
    db.users.create_index("email", unique=True)
    db.otp_codes.create_index("expires_at", expireAfterSeconds=0)
    db.otp_codes.create_index("email")
    db.sessions.create_index("expires_at", expireAfterSeconds=0)
    db.sessions.create_index("token_hash", unique=True)


def get_settings(db: Database) -> dict:
    db.settings.update_one({"_id": "global"}, {"$setOnInsert": DEFAULT_SETTINGS}, upsert=True)
    return db.settings.find_one({"_id": "global"})


def seed_admin(db: Database, email: str) -> None:
    db.users.update_one(
        {"email": email.lower()},
        {
            "$setOnInsert": {
                "email": email.lower(),
                "name": "",
                "prefs": {"alerts_on": True, "movies": [], "formats": []},
                "created_at": now(),
            },
            "$set": {"role": "admin"},
        },
        upsert=True,
    )


def new_shows(shows: Iterable[Show], existing_keys: set[str]) -> list[Show]:
    """Shows whose key was never stored. Works per session, so a show added on a
    date that was already bookable is still new."""
    return [s for s in shows if s.key not in existing_keys]


def sync_shows(db: Database, shows: Iterable[Show], complete_movies: set[str], platform: str = "district") -> list[Show]:
    """Upsert current shows; return the ones never seen before.

    Shows of `platform` for movies in `complete_movies` (fully fetched this
    run) that are no longer listed are marked inactive (show passed, or removed).
    """
    shows = list(shows)
    ts = now()
    keys = [s.key for s in shows]
    existing = {d["_id"] for d in db.shows.find({"_id": {"$in": keys}}, {"_id": 1})} if keys else set()
    new = new_shows(shows, existing)

    ops = []
    for s in shows:
        doc = s.to_doc()
        live = {k: doc.pop(k) for k in ("available", "total", "areas", "min_price")}
        ops.append(
            UpdateOne(
                {"_id": s.key},
                {
                    "$setOnInsert": {**doc, "first_seen_at": ts},
                    "$set": {**live, "last_seen_at": ts, "active": True},
                },
                upsert=True,
            )
        )
    if ops:
        db.shows.bulk_write(ops, ordered=False)
    if complete_movies:
        db.shows.update_many(
            {"platform": platform, "movie_key": {"$in": sorted(complete_movies)}, "active": True, "_id": {"$nin": keys}},
            {"$set": {"active": False, "inactive_since": ts}},
        )
    return new


def listed_elsewhere(db: Database, shows: list[Show]) -> set[str]:
    """Keys of `shows` that are already stored from another platform (same film,
    date, start time and cinema), so people aren't emailed twice for one show."""
    if not shows:
        return set()
    others = db.shows.find(
        {
            "platform": {"$nin": sorted({s.platform for s in shows})},
            "movie_key": {"$in": sorted({s.movie_key for s in shows})},
            "date": {"$in": sorted({s.date for s in shows})},
            "time": {"$in": sorted({s.time for s in shows})},
        },
        {"movie_key": 1, "date": 1, "time": 1, "theatre_name": 1},
    )
    return matches_elsewhere(shows, list(others))


def matches_elsewhere(shows: list[Show], others: list[dict]) -> set[str]:
    by_slot: dict[tuple[str, str, str], list[str]] = {}
    for o in others:
        by_slot.setdefault((o["movie_key"], o["date"], o["time"]), []).append(o["theatre_name"])
    return {
        s.key
        for s in shows
        if any(same_cinema(s.theatre_name, name) for name in by_slot.get((s.movie_key, s.date, s.time), []))
    }


def seed_movie_field(db: Database, settings: dict, field: str, defaults: dict[str, str]) -> dict:
    """Copy a default (like a BookMyShow link) into movies that have never had
    the field. An empty value means an admin cleared it, so it stays empty."""
    changed = False
    for m in settings.get("movies", []):
        if field not in m and m.get("key") in defaults:
            m[field] = defaults[m["key"]]
            changed = True
    if changed:
        db.settings.update_one({"_id": "global"}, {"$set": {"movies": settings["movies"]}})
    return settings


def alert_recipients(db: Database) -> list[dict]:
    return list(db.users.find({"prefs.alerts_on": True}))


def admins(db: Database) -> list[str]:
    return [u["email"] for u in db.users.find({"role": "admin"}, {"email": 1})]
