import Link from "next/link";
import { Controls } from "@/components/Controls";
import { ShowChip } from "@/components/ShowChip";
import { WorldPanel } from "@/components/WorldPanel";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { movieStats, recentBatches } from "@/lib/queries";
import { ago, dayLabel, stamp } from "@/lib/time";

export default async function Overview() {
  const user = await requireUser();
  const settings = await getSettings();
  const movies = settings.movies;
  const [stats, feed] = await Promise.all([Promise.all(movies.map((m) => movieStats(m.key))), recentBatches(4, 8)]);
  const movieOf = Object.fromEntries(movies.map((m) => [m.key, m]));

  return (
    <>
      <h1 className="sr-only">Overview</h1>
      <div className="worlds">
        {movies.map((m, i) => (
          <WorldPanel key={m.key} movie={m} stats={stats[i]} city={settings.city} />
        ))}
      </div>

      <div className="grid-2">
        <section aria-labelledby="recent">
          <h2 className="section-title" id="recent">
            Recently added
          </h2>
          <p className="section-note">New showtimes, in the order the tracker found them. Tap a time to book on District.</p>
          {feed.length === 0 ? (
            <div className="empty">
              <h2>Nothing found yet</h2>
              <p>Shows appear here after the first check runs. An admin can start one with Check now.</p>
            </div>
          ) : (
            <ol className="feed">
              {feed.map((b) => (
                <li key={new Date(b.at).toISOString()}>
                  <div className="batch-head">
                    <span className="batch-when">{stamp(new Date(b.at))}</span>
                    <span className="batch-count">
                      {b.count.toLocaleString("en-IN")} new {b.count === 1 ? "show" : "shows"}, found {ago(new Date(b.at))}
                    </span>
                  </div>
                  <div className="cinema-films">
                    {b.groups.map((g) => (
                      <div key={`${g.movie_key}|${g.date}`} className={`film-line theme-${movieOf[g.movie_key]?.theme ?? "plain"}`}>
                        <div className="film-name">
                          <span className="pill-dot" aria-hidden="true" />
                          {movieOf[g.movie_key]?.name ?? g.shows[0]?.movie_name}, {dayLabel(g.date, "long")}
                        </div>
                        <div className="chips">
                          {g.shows.map((s) => (
                            <ShowChip key={s._id} show={s} />
                          ))}
                          {g.count > g.shows.length && (
                            <Link className="chip chip-more" href={`/shows?movie=${g.movie_key}&date=${g.date}`}>
                              <span className="chip-time">+{g.count - g.shows.length}</span>
                              <span className="chip-meta">See all</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside>
          {user.role === "admin" && <Controls paused={settings.paused} />}
          <div className="panel">
            <h2 className="section-title">Your alerts</h2>
            <p className="section-note" style={{ marginBottom: 14 }}>
              {user.prefs.alerts_on
                ? `You get an email for every new ${user.prefs.formats.length ? user.prefs.formats.join(" or ") + " " : ""}showtime${
                    user.prefs.movies.length ? ` of ${movies.filter((m) => user.prefs.movies.includes(m.key)).map((m) => m.name).join(" and ")}` : ""
                  }.`
                : "Email alerts are off for you."}
            </p>
            <Link className="btn btn-quiet btn-sm" href="/me">
              Change alerts
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
