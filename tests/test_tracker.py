import dataclasses
import json
from pathlib import Path

import pytest

from tracker.db import new_shows
from tracker.formats import tags_for
from tracker.notify import filter_for_user, render_alert, subject_for
from tracker.sources.district import Movie, language_buckets, parse_shows, selected_date, session_block, show_dates

FIX = Path(__file__).parent / "fixtures"
AVENGERS = Movie.from_url("avengers-doomsday", "Avengers: Doomsday", "https://www.district.in/movies/avengers-doomsday-movie-tickets-MV176735")
DUNE = Movie.from_url("dune-part-three", "Dune: Part Three", "https://www.district.in/movies/dune-part-three-movie-tickets-in-hyderabad-MV207332")


def block(name):
    return session_block(json.loads((FIX / name).read_text(encoding="utf-8")))


def test_movie_from_url():
    assert (AVENGERS.slug, AVENGERS.district_id) == ("avengers-doomsday", "176735")
    assert (DUNE.slug, DUNE.district_id) == ("dune-part-three", "207332")
    with pytest.raises(ValueError):
        Movie.from_url("x", "x", "https://example.com/nope")


def test_parse_avengers_day():
    b = block("district_avengers_2026-12-17.json")
    assert selected_date(b) == "2026-12-17"
    assert "2026-12-18" in show_dates(b)
    assert "English" in language_buckets(b)
    shows = parse_shows(b, AVENGERS, "hyderabad", "English")
    assert len(shows) > 50
    s = shows[0]
    assert s.theatre_name.startswith("PVR Irrum Manzil")
    assert (s.date, s.time, s.time_text) == ("2026-12-17", "08:40", "08:40 AM")
    assert s.tags == ("4DX", "3D")
    assert s.total == 68 and s.areas[0].price == 479
    assert s.booking_url.endswith("in-hyderabad-MV176735?fromdate=2026-12-17")
    assert len({x.key for x in shows}) == len(shows)


def test_language_filter():
    b = block("district_avengers_2026-12-17.json")
    assert parse_shows(b, AVENGERS, "hyderabad", "Telugu") == []


def test_no_sessions_is_empty_not_error():
    assert parse_shows(None, DUNE, "hyderabad", "English") == []
    assert show_dates(None) == []


def test_formats():
    assert tags_for("MS INFINITY VISION 4DX-3D", "4DX", "AUDI 01 4DX") == ("4DX", "3D")
    assert tags_for("2D", "PXL", "SCREEN 11") == ("P[XL]", "2D")
    assert tags_for("MS INFINITY VISION 3D", "ATMOS") == ("Atmos", "3D")
    assert tags_for("IMAX 3D", "", "") == ("IMAX", "3D")
    assert tags_for("2D", "MACRO XE") == ("Macro XE", "2D")
    assert tags_for("MS INFINITY VISION", "2K LASER DOLBY 7.1") == ("Laser", "Dolby", "2D")


def test_new_show_on_already_open_date_is_detected():
    shows = parse_shows(block("district_dune_2026-12-16.json"), DUNE, "hyderabad", "English")
    seen = {s.key for s in shows}
    assert new_shows(shows, seen) == []
    # A cinema adds an extra show on the same date (2026-12-16) that was already bookable.
    extra = dataclasses.replace(shows[0], session_id="99999", time="23:55", time_text="11:55 PM")
    assert new_shows(shows + [extra], seen) == [extra]
    # A show that changes time is also treated as new.
    moved = dataclasses.replace(shows[1], time="22:00")
    assert new_shows([moved], seen) == [moved]


def test_user_filter_and_email():
    shows = parse_shows(block("district_dune_2026-12-16.json"), DUNE, "hyderabad", "English")
    assert filter_for_user(shows, {"movies": ["avengers-doomsday"]}) == []
    only_4dx = filter_for_user(shows, {"formats": ["4DX"]})
    assert only_4dx and all("4DX" in s.tags for s in only_4dx)
    html = render_alert(shows, "https://dunesday.ayushk08.com", {"dune-part-three": "dune"})
    assert "Dune: Part Three" in html and "THE SPICE FLOWS" in html
    assert subject_for(shows).startswith(f"🎬 {len(shows)} new shows: Dune Part Three")
