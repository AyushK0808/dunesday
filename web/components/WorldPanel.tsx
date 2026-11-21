import Link from "next/link";
import type { MovieStats } from "@/lib/queries";
import type { MovieSetting } from "@/lib/types";
import { dayLabel, dayShort, daysUntil } from "@/lib/time";
import { Scene } from "./Art";
import { fillLevel } from "./ShowChip";

const n = (x: number) => x.toLocaleString("en-IN");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

function whenLine(first: string | undefined, enabled: boolean): string {
  if (!enabled) return "Not being tracked right now";
  if (!first) return "Waiting for bookings to open";
  const d = daysUntil(first);
  if (d > 1) return `First show in ${d} days, ${dayLabel(first, "long")}`;
  if (d === 1) return "First show tomorrow";
  if (d === 0) return "Showing today";
  return "Now showing";
}

export function WorldPanel({ movie, stats, city }: { movie: MovieSetting; stats: MovieStats; city: string }) {
  const theme = movie.theme ?? "plain";
  const cityName = city.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const premium = stats.formats.filter((f) => !["2D", "3D", "Recliners"].includes(f.tag)).slice(0, 5);
  return (
    <section className={`world theme-${theme}`} aria-labelledby={`t-${movie.key}`}>
      <Scene theme={theme} className="world-art" />
      <div className="world-body">
        <p className="world-when" style={{ margin: 0 }}>
          {whenLine(stats.days[0]?.date, movie.enabled)}
          {stats.newToday > 0 && <span className="world-new">{n(stats.newToday)} added in the last day</span>}
        </p>
        <h2 className="world-title" id={`t-${movie.key}`}>
          {movie.name}
        </h2>
        {stats.shows > 0 ? (
          <>
            <p className="world-sub">
              <b>{n(stats.shows)} shows</b> at {stats.cinemas} {stats.cinemas === 1 ? "cinema" : "cinemas"}, {pct(stats.seatsLeft, stats.seatsTotal)} of seats still free
            </p>
            <div className="days" role="list" aria-label="Shows per day">
              {stats.days.slice(0, 7).map((d) => (
                <Link key={d.date} className="day" role="listitem" href={`/shows?movie=${movie.key}&date=${d.date}`} aria-label={`${dayLabel(d.date, "long")}: ${d.n} shows, ${d.left} seats free`}>
                  <span className="day-name">{dayShort(d.date)}</span>
                  <span className="day-n">{d.n}</span>
                  <span className="fill" data-level={fillLevel(d.left, d.total)} aria-hidden="true">
                    <i style={{ width: `${d.total ? 100 - Math.round((d.left / d.total) * 100) : 0}%` }} />
                  </span>
                </Link>
              ))}
            </div>
            <div className="world-foot">
              <Link className="btn" href={`/shows?movie=${movie.key}`}>
                See showtimes
              </Link>
              {premium.length > 0 && (
                <ul className="fmt-list" aria-label="Formats">
                  {premium.map((f) => (
                    <li key={f.tag} className="fmt">
                      {f.tag} <b>{f.n}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <p className="world-empty">
            No {cityName} shows found yet. You'll get an email the moment the first one appears.
          </p>
        )}
      </div>
    </section>
  );
}
