"""MongoDB access. Collections are documented in PLAN.md."""

from __future__ import annotations

import datetime as dt
from typing import Iterable

from pymongo import ASCENDING, DESCENDING, MongoClient, UpdateOne
from pymongo.database import Database

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
            "enabled": True,
            "theme": "doom",
        },
        {
            "key": "dune-part-three",
            "name": "Dune: Part Three",
            "url": "https://www.district.in/movies/dune-part-three-movie-tickets-MV207332",
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


def sync_shows(db: Database, shows: Iterable[Show], complete_movies: set[str]) -> list[Show]:
    """Upsert current shows; return the ones never seen before.

    Shows of movies in `complete_movies` (fully fetched this run) that are no
    longer listed are marked inactive (show passed, or removed).
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
            {"movie_key": {"$in": sorted(complete_movies)}, "active": True, "_id": {"$nin": keys}},
            {"$set": {"active": False, "inactive_since": ts}},
        )
    return new


def alert_recipients(db: Database) -> list[dict]:
    return list(db.users.find({"prefs.alerts_on": True}))


def admins(db: Database) -> list[str]:
    return [u["email"] for u in db.users.find({"role": "admin"}, {"email": 1})]
