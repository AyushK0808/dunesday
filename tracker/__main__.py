"""Dunesday tracker.

  python -m tracker                 # normal run (needs MONGODB_URI, GMAIL_USER, GMAIL_APP_PASSWORD)
  python -m tracker --dry-run       # fetch + print, no database, no email
  python -m tracker --no-email      # update database, skip emails
  python -m tracker init --admin you@example.com   # create indexes, settings, admin user
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import traceback
from collections import Counter

from . import db as dbm
from .models import Show
from .notify import Mailer, filter_for_user, render_alert, render_notice, render_text, subject_for
from .sources.district import DistrictClient, Movie

log = logging.getLogger("tracker")


def _load_env_file() -> None:
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def fetch_all(settings: dict) -> tuple[list[Show], set[str], dict[str, str]]:
    client = DistrictClient()
    shows: list[Show] = []
    complete: set[str] = set()
    errors: dict[str, str] = {}
    for m in settings["movies"]:
        if not m.get("enabled", True):
            continue
        try:
            movie = Movie.from_url(m["key"], m["name"], m["url"])
            shows.extend(client.fetch_movie(movie, settings["city"], settings["language"]))
            complete.add(m["key"])
        except Exception as e:  # keep going with other movies
            log.exception("Failed to fetch %s", m["name"])
            errors[m["key"]] = f"{type(e).__name__}: {e}"
    return shows, complete, errors


def summarize(shows: list[Show]) -> str:
    out = []
    for movie in sorted({s.movie_name for s in shows}):
        ss = [s for s in shows if s.movie_name == movie]
        dates = Counter(s.date for s in ss)
        tags = Counter(t for s in ss for t in s.tags)
        out.append(
            f"{movie}: {len(ss)} shows at {len({s.theatre_id for s in ss})} cinemas\n"
            f"  dates:   {', '.join(f'{d} ({n})' for d, n in sorted(dates.items()))}\n"
            f"  formats: {', '.join(f'{t} ({n})' for t, n in tags.most_common())}"
        )
    return "\n".join(out) or "No shows found."


def run(args: argparse.Namespace) -> int:
    if args.dry_run:
        shows, _, errors = fetch_all(dbm.DEFAULT_SETTINGS)
        print(summarize(shows))
        for k, v in errors.items():
            print(f"ERROR {k}: {v}")
        return 1 if errors else 0

    db = dbm.connect(os.environ["MONGODB_URI"])
    settings = dbm.get_settings(db)
    site = os.environ.get("SITE_URL", "").rstrip("/")
    trigger = os.environ.get("RUN_TRIGGER", "manual")
    run_doc = {"started_at": dbm.now(), "trigger": trigger, "status": "running"}
    run_id = db.runs.insert_one(run_doc).inserted_id

    if settings.get("paused") and trigger == "cron":
        db.runs.update_one({"_id": run_id}, {"$set": {"status": "skipped", "finished_at": dbm.now(), "note": "paused"}})
        log.info("Tracker is paused; skipping.")
        return 0

    mailer = None
    if not args.no_email and os.environ.get("GMAIL_USER") and os.environ.get("GMAIL_APP_PASSWORD"):
        mailer = Mailer(os.environ["GMAIL_USER"], os.environ["GMAIL_APP_PASSWORD"])

    emails_sent = 0
    try:
        shows, complete, errors = fetch_all(settings)
        new = dbm.sync_shows(db, shows, complete)
        log.info("%d shows found, %d new", len(shows), len(new))

        if new and mailer:
            themes = {m["key"]: m.get("theme", "") for m in settings["movies"]}
            for user in dbm.alert_recipients(db):
                mine = filter_for_user(new, user.get("prefs", {}))
                if not mine:
                    continue
                try:
                    mailer.send_one(user["email"], subject_for(mine), render_alert(mine, site, themes), render_text(mine))
                    emails_sent += 1
                except Exception:
                    log.exception("Email to %s failed", user["email"])

        status = "error" if errors else "ok"
        error_text = "\n".join(f"{k}: {v}" for k, v in errors.items()) or None
    except Exception as e:
        shows, new, status = [], [], "error"
        error_text = f"{type(e).__name__}: {e}\n\n{traceback.format_exc()}"
        log.exception("Run failed")

    per_movie = Counter(s.movie_key for s in shows)
    db.runs.update_one(
        {"_id": run_id},
        {
            "$set": {
                "status": status,
                "finished_at": dbm.now(),
                "shows_found": len(shows),
                "new_shows": len(new),
                "per_movie": dict(per_movie),
                "new_per_movie": dict(Counter(s.movie_key for s in new)),
                "emails_sent": emails_sent,
                "error": error_text,
            }
        },
    )

    # One failure email per failure streak, and one when it recovers.
    streak = settings.get("failure_streak", 0)
    if status == "error":
        db.settings.update_one({"_id": "global"}, {"$inc": {"failure_streak": 1}})
        if streak == 0 and mailer:
            admins = dbm.admins(db)
            if admins:
                mailer.send(admins, "⚠️ Dunesday tracker is failing", render_notice("The tracker hit an error", error_text or "", site), error_text or "")
    else:
        db.settings.update_one({"_id": "global"}, {"$set": {"failure_streak": 0, "last_ok_at": dbm.now()}})
        if streak > 0 and mailer:
            admins = dbm.admins(db)
            if admins:
                msg = f"Back to normal after {streak} failed run(s)."
                mailer.send(admins, "✅ Dunesday tracker recovered", render_notice("Tracker recovered", msg, site), msg)
    return 1 if status == "error" else 0


def init(args: argparse.Namespace) -> int:
    db = dbm.connect(os.environ["MONGODB_URI"])
    dbm.ensure_indexes(db)
    dbm.get_settings(db)
    if args.admin:
        dbm.seed_admin(db, args.admin)
    print("Database ready.")
    return 0


def main() -> int:
    _load_env_file()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="tracker")
    p.add_argument("--dry-run", action="store_true", help="fetch and print only")
    p.add_argument("--no-email", action="store_true", help="update database but send no email")
    sub = p.add_subparsers(dest="cmd")
    pi = sub.add_parser("init", help="create indexes, default settings and admin user")
    pi.add_argument("--admin", help="admin email address")
    args = p.parse_args()
    if args.cmd == "init":
        return init(args)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
