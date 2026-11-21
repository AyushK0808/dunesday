import type { Metadata } from "next";
import Link from "next/link";
import { ShowChip } from "@/components/ShowChip";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { findShows, showFacets } from "@/lib/queries";
import { dayLabel } from "@/lib/time";
import { ALL_TAGS, type ShowDoc } from "@/lib/types";

export const metadata: Metadata = { title: "Showtimes" };

type Params = { movie?: string; date?: string; fmt?: string; cinema?: string; seats?: string; fresh?: string };

function href(base: Params, patch: Partial<Params>): string {
  const p = { ...base, ...patch };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/shows?${s}` : "/shows";
}

export default async function Shows({ searchParams }: PageProps<"/shows">) {
  await requireUser();
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const settings = await getSettings();
  const movieKeys = settings.movies.map((m) => m.key);
  const params: Params = {
    movie: movieKeys.includes(one(raw.movie) ?? "") ? one(raw.movie) : undefined,
    date: /^\d{4}-\d{2}-\d{2}$/.test(one(raw.date) ?? "") ? one(raw.date) : undefined,
    fmt: one(raw.fmt),
    cinema: one(raw.cinema),
    seats: one(raw.seats) === "1" ? "1" : undefined,
    fresh: one(raw.fresh) === "1" ? "1" : undefined,
  };
  const formats = (params.fmt ?? "").split(",").filter((t) => ALL_TAGS.includes(t));

  const facets = await showFacets(params.movie);
  const date = params.date && facets.dates.includes(params.date) ? params.date : facets.dates[0];
  const shows = date
    ? await findShows({ movie: params.movie, date, formats, cinema: params.cinema, seats: !!params.seats, fresh: !!params.fresh })
    : [];

  const themeOf = Object.fromEntries(settings.movies.map((m) => [m.key, m.theme]));
  const nameOf = Object.fromEntries(settings.movies.map((m) => [m.key, m.name]));
  const byCinema = new Map<string, { name: string; films: Map<string, ShowDoc[]> }>();
  for (const s of shows) {
    const c = byCinema.get(s.theatre_id) ?? { name: s.theatre_name, films: new Map() };
    c.films.set(s.movie_key, [...(c.films.get(s.movie_key) ?? []), s]);
    byCinema.set(s.theatre_id, c);
  }
  const fmtOptions = ALL_TAGS.filter((t) => facets.tags.includes(t));
  const toggleFmt = (t: string) => {
    const next = formats.includes(t) ? formats.filter((x) => x !== t) : [...formats, t];
    return href(params, { fmt: next.join(",") || undefined });
  };
  const free = shows.filter((s) => s.available > 0).length;

  return (
    <>
      <h1 className="page-title">Showtimes</h1>
      <p className="lede">
        Every English show District lists in {settings.city.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}. The bar under each time shows how full it is. A dot means it was added in the last 24 hours.
      </p>

      <div className="filters">
        <div className="filter-row" role="group" aria-label="Film">
          <span className="filter-label">Film</span>
          <Link className="pill" href={href(params, { movie: undefined, date: undefined })} aria-current={!params.movie ? "true" : undefined}>
            Both
          </Link>
          {settings.movies.map((m) => (
            <Link key={m.key} className={`pill theme-${m.theme}`} href={href(params, { movie: m.key, date: undefined })} aria-current={params.movie === m.key ? "true" : undefined}>
              <span className="pill-dot" aria-hidden="true" />
              {m.name}
            </Link>
          ))}
        </div>

        {facets.dates.length > 0 && (
          <div className="filter-row" role="group" aria-label="Date">
            <span className="filter-label">Date</span>
            {facets.dates.map((d) => (
              <Link key={d} className="pill date-pill" href={href(params, { date: d })} aria-current={d === date ? "true" : undefined}>
                {dayLabel(d)}
                <small>
                  {facets.dateCounts[d]} {facets.dateCounts[d] === 1 ? "show" : "shows"}
                </small>
              </Link>
            ))}
          </div>
        )}

        {fmtOptions.length > 0 && (
          <div className="filter-row" role="group" aria-label="Format">
            <span className="filter-label">Format</span>
            {fmtOptions.map((t) => (
              <Link key={t} className="pill" href={toggleFmt(t)} aria-pressed={formats.includes(t)}>
                {t}
              </Link>
            ))}
          </div>
        )}

        <div className="filter-row">
          <span className="filter-label">Show</span>
          <Link className="pill" href={href(params, { seats: params.seats ? undefined : "1" })} aria-pressed={!!params.seats}>
            Seats available
          </Link>
          <Link className="pill" href={href(params, { fresh: params.fresh ? undefined : "1" })} aria-pressed={!!params.fresh}>
            New in last 24 h
          </Link>
          <form action="/shows" className="filter-row" style={{ gap: 8 }}>
            {Object.entries(params).map(([k, v]) => (k !== "cinema" && k !== "date" && v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            {date && <input type="hidden" name="date" value={date} />}
            <label className="sr-only" htmlFor="cinema">
              Cinema
            </label>
            <select id="cinema" name="cinema" className="select" defaultValue={params.cinema ?? ""}>
              <option value="">All cinemas</option>
              {facets.cinemas.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="btn btn-quiet btn-sm" type="submit">
              Apply
            </button>
          </form>
        </div>
      </div>

      {!date ? (
        <div className="empty">
          <h2>No showtimes yet</h2>
          <p>Bookings haven't opened on District for these films, or the first check hasn't run. You'll get an email when shows appear.</p>
        </div>
      ) : byCinema.size === 0 ? (
        <div className="empty">
          <h2>No shows match these filters</h2>
          <p>
            Try another date or remove a format. <Link href={href({}, { movie: params.movie })}>Clear filters</Link>
          </p>
        </div>
      ) : (
        <>
          <p className="section-note">
            {dayLabel(date, "long")}: {shows.length} {shows.length === 1 ? "show" : "shows"} at {byCinema.size} {byCinema.size === 1 ? "cinema" : "cinemas"}, {free} with seats left.
          </p>
          <div className="cinemas">
            {[...byCinema.entries()].map(([id, c]) => {
              const all = [...c.films.values()].flat();
              const left = all.reduce((a, s) => a + s.available, 0);
              return (
                <section key={id} className="cinema" aria-labelledby={`c-${id}`}>
                  <div>
                    <h2 className="cinema-name" id={`c-${id}`}>
                      {c.name.replace(/, Hyderabad$/i, "")}
                    </h2>
                    <p className="cinema-sub">
                      {all.length} {all.length === 1 ? "show" : "shows"}, {left.toLocaleString("en-IN")} seats free
                    </p>
                  </div>
                  <div className="cinema-films">
                    {[...c.films.entries()].map(([mk, ss]) => (
                      <div key={mk} className={`film-line theme-${themeOf[mk] ?? "plain"}`}>
                        {!params.movie && (
                          <div className="film-name">
                            <span className="pill-dot" aria-hidden="true" />
                            {nameOf[mk] ?? ss[0].movie_name}
                          </div>
                        )}
                        <div className="chips">
                          {ss.map((s) => (
                            <ShowChip key={s._id} show={s} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
