import json
from pathlib import Path

import pytest

from tracker.cinemas import same_cinema
from tracker.db import matches_elsewhere
from tracker.notify import render_alert
from tracker.sources.bookmyshow import (
    BookMyShowError,
    Format,
    Movie,
    extract_state,
    formats,
    page_url,
    parse_shows,
    primary,
    selected_date,
    show_dates,
)
from tracker.sources.district import Movie as DistrictMovie
from tracker.sources.district import parse_shows as district_shows
from tracker.sources.district import session_block

FIX = Path(__file__).parent / "fixtures"
DUNE = Movie.from_url("dune-part-three", "Dune: Part Three", "https://in.bookmyshow.com/hyderabad/movies/dune-part-three/ET00491771")
AVENGERS = Movie.from_url(
    "avengers-doomsday", "Avengers: Doomsday", "https://in.bookmyshow.com/movies/hyderabad/avengers-doomsday/buytickets/ET00439706/20261217"
)


def load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def test_movie_from_url():
    assert (DUNE.slug, DUNE.event_code) == ("dune-part-three", "ET00491771")
    assert (AVENGERS.slug, AVENGERS.event_code) == ("avengers-doomsday", "ET00439706")
    with pytest.raises(ValueError):
        Movie.from_url("x", "x", "https://www.district.in/movies/dune-part-three-movie-tickets-MV207332")
    assert page_url("hyderabad", "dune-part-three", "ET00491771", "2026-12-16").endswith("/buytickets/ET00491771/20261216")


def test_extract_state():
    p = {"additionalData": {"dateCode": "20261216"}, "showtimeWidgets": []}
    html = '<script>window.__INITIAL_STATE__ = {"showtimesFunctionalApi":{"queries":{"fetchPrimaryDynamic-x":{"data":{"data":%s}}}}};</script>' % json.dumps(p)
    assert primary(extract_state(html)) == p
    with pytest.raises(BookMyShowError, match="blocking"):
        extract_state("<title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/x.js'></script>")
    with pytest.raises(BookMyShowError):
        extract_state("<html>nothing here</html>")


def test_dates_and_formats():
    p = load("bms_dune_2026-12-16.json")
    assert selected_date(p) == "2026-12-16"
    assert show_dates(p) == ["2026-12-16", "2026-12-17", "2026-12-18", "2026-12-19", "2026-12-20"]  # 21, 22 not bookable yet
    fmts = formats(p, "English")
    assert [f.title for f in fmts] == ["2D", "4DX", "EPIQ", "HDR By Barco"]  # "Select all" dropped
    assert fmts[1] == Format("4DX", "ET00526391", "dune-part-three-4dx")
    assert formats(p, "Telugu") == []


def test_parse_dune_day():
    p = load("bms_dune_2026-12-16.json")
    fmt = formats(p, "English")[0]
    shows = parse_shows(p, DUNE, fmt, "hyderabad", "English")
    assert len({s.theatre_id for s in shows}) == 5
    prasads = [s for s in shows if s.theatre_id == "PRHN"]
    s = prasads[0]
    assert s.platform == "bookmyshow" and s.theatre_name == "Prasads Multiplex: Hyderabad"
    assert (s.date, s.time, s.time_text) == ("2026-12-16", "17:45", "05:45 PM")
    assert s.starts_at == "2026-12-16T17:45:00+05:30"
    assert s.tags == ("PCX", "2D")
    assert s.areas and all(a.price for a in s.areas)
    assert s.booking_url == "https://in.bookmyshow.com/movies/hyderabad/dune-part-three/buytickets/ET00491771/20261216"
    assert len({x.key for x in shows}) == len(shows)


def test_parse_avengers_formats():
    p = load("bms_avengers_2026-12-17.json")
    fmts = {f.title: f for f in formats(p, "English")}
    assert set(fmts) == {"2D", "MS - Inf Vsn 4DX 3D", "MS - Infinity Vision", "MS-Infinity Vsn 3d"}
    shows = parse_shows(p, AVENGERS, fmts["2D"], "hyderabad", "English")
    assert {s.theatre_name for s in shows} == {"Aparna Cinemas: Nallagandla", "Aparna Cinemas: Shamshabad"}
    assert all("Atmos" in s.tags or "2D" in s.tags for s in shows)
    # The format title carries the 3D / 4DX tags for the other event codes.
    fake = Format("MS - Inf Vsn 4DX 3D", "ET00526320", "avengers-doomsday-ms-infinity-vision4dx-3d")
    assert parse_shows(p, AVENGERS, fake, "hyderabad", "English")[0].tags[:1] == ("4DX",)


def test_no_shows_is_empty():
    assert parse_shows(None, DUNE, Format("2D", "ET00491771", ""), "hyderabad", "English") == []
    assert show_dates(None) == [] and formats(None, "English") == []


@pytest.mark.parametrize(
    "district,bms",
    [
        ("PVR Lakeshore Mall, Y Junction, Hyderabad", "PVR Lakeshore PXL 4K Laser ATMOS DTS-X Y Junction"),
        ("PVR Superplex Inorbit, LUXE PXL 4DX, Cyberabad", "PVR Superplex Inorbit: LUXE, PXL, 4DX: Cyberabad"),
        ("Cinepolis TNR North City, Suchitra, Hyderabad", "Cinepolis: TNR North City, Suchitra, Hyderabad"),
        ("PVR Nexus Mall (Formerly Forum Sujana) Kukatpally, Hyderabad", "PVR: Nexus Mall, Kukatpally"),
        ("PVR Panjagutta, Central Mall, Hyderabad", "PVR: Central Mall, Panjagutta"),
    ],
)
def test_same_cinema(district, bms):
    assert same_cinema(district, bms)


@pytest.mark.parametrize(
    "a,b",
    [
        ("PVR Panjagutta, Central Mall, Hyderabad", "PVR Next Galleria Mall, Panjagutta, Hyderabad"),
        ("PVR Lakeshore Mall, Y Junction, Hyderabad", "INOX Ashoka One Mall, Kukatpally Y Junction, Hyderabad"),
        ("PVR Nexus Mall (Formerly Forum Sujana) Kukatpally, Hyderabad", "PVR Lakeshore Mall, Y Junction, Hyderabad"),
        ("Prasads Multiplex: Hyderabad", "Cinepolis Lulu Mall (Formerly Manjeera), Hyderabad"),
    ],
)
def test_different_cinema(a, b):
    assert not same_cinema(a, b)


def test_shows_on_both_platforms_alert_once():
    p = load("bms_dune_2026-12-16.json")
    bms = parse_shows(p, DUNE, formats(p, "English")[0], "hyderabad", "English")
    dm = DistrictMovie.from_url("dune-part-three", "Dune: Part Three", "https://www.district.in/movies/dune-part-three-movie-tickets-MV207332")
    district = district_shows(session_block(load("district_dune_2026-12-16.json")), dm, "hyderabad", "English")
    others = [{"movie_key": s.movie_key, "date": s.date, "time": s.time, "theatre_name": s.theatre_name} for s in district]
    dupes = matches_elsewhere(bms, others)
    by_cinema = {s.theatre_name for s in bms if s.key in dupes}
    assert not any(n.startswith(("Prasads", "AAA")) for n in by_cinema)  # BookMyShow-only cinemas always alert
    for s in bms:
        if s.key in dupes:
            assert any(o["time"] == s.time and same_cinema(s.theatre_name, o["theatre_name"]) for o in others)


def test_email_names_platform():
    p = load("bms_dune_2026-12-16.json")
    shows = parse_shows(p, DUNE, formats(p, "English")[0], "hyderabad", "English")
    html = render_alert(shows, "", {"dune-part-three": "dune"}, "BookMyShow · Hyderabad")
    assert "appeared on BookMyShow · Hyderabad" in html and "in.bookmyshow.com" in html
