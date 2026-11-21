"""Email: grouped alert emails and tracker-health emails via Gmail SMTP."""

from __future__ import annotations

import datetime as dt
import html
import logging
import smtplib
import ssl
from collections import defaultdict
from email.message import EmailMessage
from email.utils import formataddr

from .models import Show

log = logging.getLogger(__name__)

THEMES = {
    "doom": {"accent": "#7fd1a8", "deep": "#0f2a22", "label": "DOOM APPROACHES"},
    "dune": {"accent": "#e8a25a", "deep": "#2e1a0c", "label": "THE SPICE FLOWS"},
}
DEFAULT_THEME = {"accent": "#d9c7a7", "deep": "#1c1a17", "label": "NEW SHOWS"}


def _day(date: str) -> str:
    d = dt.date.fromisoformat(date)
    return d.strftime("%a %d %b")


def filter_for_user(shows: list[Show], prefs: dict) -> list[Show]:
    movies = set(prefs.get("movies") or [])
    formats = set(prefs.get("formats") or [])
    out = []
    for s in shows:
        if movies and s.movie_key not in movies:
            continue
        if formats and not formats.intersection(s.tags):
            continue
        out.append(s)
    return out


def subject_for(shows: list[Show]) -> str:
    by_movie: dict[str, list[Show]] = defaultdict(list)
    for s in shows:
        by_movie[s.movie_name].append(s)
    parts = []
    for name, ss in by_movie.items():
        top = defaultdict(int)
        for s in ss:
            for t in s.tags:
                if t in ("IMAX", "4DX", "P[XL]", "Dolby Cinema", "EPIQ", "ICE", "ScreenX"):
                    top[t] += 1
        extra = ", ".join(f"{t} ×{n}" for t, n in sorted(top.items(), key=lambda x: -x[1])[:2])
        parts.append(f"{name.replace(':', '')} ({len(ss)}{'; ' + extra if extra else ''})")
    n = len(shows)
    return f"🎬 {n} new show{'s' if n != 1 else ''}: " + " · ".join(parts)


def render_alert(shows: list[Show], site_url: str, themes: dict[str, str]) -> str:
    """themes: movie_key -> theme name"""
    by_movie: dict[str, dict[str, dict[str, list[Show]]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    names: dict[str, str] = {}
    for s in sorted(shows, key=lambda s: (s.movie_key, s.theatre_name, s.date, s.time)):
        by_movie[s.movie_key][s.theatre_name][s.date].append(s)
        names[s.movie_key] = s.movie_name

    e = html.escape
    blocks = []
    for mkey, theatres in by_movie.items():
        th = THEMES.get(themes.get(mkey, ""), DEFAULT_THEME)
        count = sum(len(v) for t in theatres.values() for v in t.values())
        rows = []
        for theatre, dates in theatres.items():
            rows.append(
                f'<tr><td style="padding:18px 0 6px;font:600 15px Georgia,serif;color:#f3ead9">{e(theatre)}</td></tr>'
            )
            for date, ss in dates.items():
                chips = []
                for s in ss:
                    seats = f"{s.available}/{s.total}" if s.total else ""
                    tone = "#e05a4f" if s.total and s.available == 0 else ("#e0b04f" if s.total and s.available < s.total * 0.2 else th["accent"])
                    chips.append(
                        f'<a href="{e(s.booking_url)}" style="display:inline-block;margin:0 6px 6px 0;padding:7px 10px;'
                        f'border:1px solid {th["accent"]}55;border-radius:8px;background:{th["deep"]};color:#f3ead9;'
                        f'text-decoration:none;font:13px -apple-system,Segoe UI,Arial,sans-serif">'
                        f'<b>{e(s.time_text)}</b> <span style="color:{th["accent"]}">{e(s.format_label)}</span>'
                        f'{f" <span style=color:{tone}>· {seats}</span>" if seats else ""}</a>'
                    )
                rows.append(
                    f'<tr><td style="padding:2px 0 8px"><div style="font:600 11px Arial,sans-serif;letter-spacing:.12em;'
                    f'text-transform:uppercase;color:#a99e8b;margin-bottom:6px">{_day(date)}</div>{"".join(chips)}</td></tr>'
                )
        blocks.append(
            f'<tr><td style="padding:28px 28px 8px;border-top:1px solid #2E2938">'
            f'<div style="font:700 11px Arial,sans-serif;letter-spacing:.3em;color:{th["accent"]}">{th["label"]}</div>'
            f'<div style="font:400 26px Georgia,serif;color:#f3ead9;margin:6px 0 2px">{e(names[mkey])}</div>'
            f'<div style="font:13px Arial,sans-serif;color:#a99e8b">{count} new show{"s" if count != 1 else ""}</div>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{"".join(rows)}</table></td></tr>'
        )

    link = f'<a href="{e(site_url)}/shows" style="color:#e8a25a">Open the dashboard</a>' if site_url else ""
    return f"""<!doctype html><html><body style="margin:0;background:#16131D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16131D"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#1E1A27;border:1px solid #2E2938;border-radius:16px">
<tr><td style="padding:26px 28px 18px"><div style="font:700 12px Arial,sans-serif;letter-spacing:.45em;color:#d9c7a7">DUNESDAY</div>
<div style="font:13px Arial,sans-serif;color:#a99e8b;margin-top:6px">New showtimes just appeared on District · Hyderabad</div></td></tr>
{"".join(blocks)}
<tr><td style="padding:22px 28px 26px;border-top:1px solid #2E2938;font:12px Arial,sans-serif;color:#7d7466">
Seats shown as available/total at the time of the check. {link} · change what you get on the dashboard under My alerts.</td></tr>
</table></td></tr></table></body></html>"""


def render_text(shows: list[Show]) -> str:
    lines = []
    for s in sorted(shows, key=lambda s: (s.movie_key, s.theatre_name, s.date, s.time)):
        lines.append(f"{s.movie_name} | {s.theatre_name} | {_day(s.date)} {s.time_text} | {s.format_label} | {s.booking_url}")
    return "\n".join(lines)


class Mailer:
    def __init__(self, user: str, password: str, sender_name: str = "Dunesday"):
        self.user, self.password, self.sender_name = user, password, sender_name

    def send(self, to: list[str], subject: str, html_body: str, text_body: str) -> None:
        msg = EmailMessage()
        msg["From"] = formataddr((self.sender_name, self.user))
        if len(to) == 1:
            msg["To"] = to[0]
        else:
            msg["To"] = self.user  # Bcc so recipients don't see each other's addresses
            msg["Bcc"] = ", ".join(to)
        msg["Subject"] = subject
        msg.set_content(text_body)
        msg.add_alternative(html_body, subtype="html")
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as smtp:
            smtp.login(self.user, self.password)
            smtp.send_message(msg)
        log.info("Sent '%s' to %d recipient(s)", subject, len(to))

    def send_one(self, to: str, subject: str, html_body: str, text_body: str) -> None:
        self.send([to], subject, html_body, text_body)


def render_notice(title: str, body: str, site_url: str) -> str:
    e = html.escape
    link = f'<p><a href="{e(site_url)}/health" style="color:#e8a25a">Open tracker health</a></p>' if site_url else ""
    return f"""<!doctype html><html><body style="margin:0;background:#16131D;padding:24px">
<div style="max-width:560px;margin:auto;background:#1E1A27;border:1px solid #2E2938;border-radius:16px;padding:26px;color:#f3ead9;font:14px Arial,sans-serif">
<div style="font:700 12px Arial;letter-spacing:.45em;color:#d9c7a7">DUNESDAY</div>
<h2 style="font:400 22px Georgia,serif">{e(title)}</h2><pre style="white-space:pre-wrap;color:#c9bfae;font:12px Consolas,monospace">{e(body)}</pre>{link}</div></body></html>"""
