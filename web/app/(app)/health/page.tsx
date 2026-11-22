import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { latestRuns } from "@/lib/queries";
import { PLATFORM_NAMES, type RunDoc } from "@/lib/types";
import { ago, stamp } from "@/lib/time";

export const metadata: Metadata = { title: "Health" };

function duration(a: Date, b?: Date) {
  if (!b) return "";
  const s = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export default async function Health() {
  await requireUser();
  const [settings, runs] = await Promise.all([getSettings(), latestRuns(144)]);
  const isBms = (r: RunDoc) => r.source === "bookmyshow";
  // The schedule is judged by District runs: they're the ones that always run in GitHub Actions.
  const last = runs.find((r) => !isBms(r));
  const lastOk = runs.find((r) => !isBms(r) && r.status === "ok");
  const lastBms = runs.find(isBms);
  const lastBmsOk = runs.find((r) => isBms(r) && r.status === "ok");
  const day = runs.filter((r) => Date.now() - new Date(r.started_at).getTime() < 24 * 60 * 60 * 1000);
  const failures = day.filter((r) => r.status === "error").length;
  const newToday = day.reduce((a, r) => a + (r.new_shows ?? 0), 0);
  const max = Math.max(1, ...runs.map((r) => r.shows_found ?? 0));
  const stale = last && Date.now() - new Date(last.started_at).getTime() > 60 * 60 * 1000;
  const nameOf = Object.fromEntries(settings.movies.map((m) => [m.key, m.name]));

  return (
    <>
      <h1 className="page-title">Tracker health</h1>
      <p className="lede">Each check loads every bookable date on District, then on BookMyShow, and compares the showtimes with what it found before. A show that's on both sites is only emailed once.</p>

      {settings.paused && <div className="callout">Tracking is paused. Scheduled checks are skipped until an admin resumes it.</div>}
      {!settings.paused && stale && (
        <div className="callout">
          The last check was {ago(last.started_at)}. GitHub sometimes delays scheduled runs, but more than an hour usually means the schedule stopped. Check the Actions tab on GitHub.
        </div>
      )}
      {last?.status === "error" && (
        <div className="callout" data-kind="error">
          The last District check failed. Admins were emailed when the failures started. The error is in the table below.
        </div>
      )}
      {lastBms?.status === "error" && (
        <div className="callout" data-kind="error">
          The last BookMyShow check failed{/HTTP 403|blocking this IP|blocked/.test(lastBms.error ?? "") ? ": BookMyShow is blocking the server it ran from" : ""}. District checks are unaffected.
        </div>
      )}

      <dl className="stats">
        <div className="stat">
          <dt>Last check</dt>
          <dd>{last ? ago(last.started_at) : "Never"}</dd>
        </div>
        <div className="stat">
          <dt>Last successful check</dt>
          <dd>{lastOk ? ago(lastOk.started_at) : "Never"}</dd>
        </div>
        <div className="stat">
          <dt>Last BookMyShow success</dt>
          <dd>{lastBmsOk ? ago(lastBmsOk.started_at) : "Never"}</dd>
        </div>
        <div className="stat">
          <dt>Checks in the last day</dt>
          <dd>
            {day.length}
            {failures ? <span className="muted" style={{ fontSize: "0.875rem", fontWeight: 400 }}>, {failures} failed</span> : null}
          </dd>
        </div>
        <div className="stat">
          <dt>New shows in the last day</dt>
          <dd>{newToday.toLocaleString("en-IN")}</dd>
        </div>
      </dl>

      <h2 className="section-title">Last {runs.length} checks</h2>
      <p className="section-note">Bar height is the number of shows found. Oldest on the left.</p>
      <div className="pulse" role="img" aria-label={`${runs.length} recent checks, ${runs.filter((r) => r.status === "error").length} failed`}>
        {[...runs].reverse().map((r) => (
          <i
            key={String(r._id)}
            data-status={r.status}
            data-new={(r.new_shows ?? 0) > 0}
            style={{ height: `${r.status === "error" ? 100 : Math.max(6, ((r.shows_found ?? 0) / max) * 100)}%` }}
            title={`${stamp(r.started_at)}: ${r.status}, ${r.shows_found ?? 0} found, ${r.new_shows ?? 0} new`}
          />
        ))}
      </div>
      <div className="pulse-legend">
        <span><i style={{ background: "var(--verd)" }} /> Check succeeded</span>
        <span><i style={{ background: "var(--sand)" }} /> Found new shows</span>
        <span><i style={{ background: "var(--danger)" }} /> Failed</span>
        <span><i style={{ background: "var(--warn)" }} /> Skipped while paused</span>
      </div>

      {runs.length === 0 ? (
        <div className="empty">
          <h2>No checks yet</h2>
          <p>The first scheduled check runs within about 20 minutes of the GitHub workflow being enabled.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="runs">
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Site</th>
                <th scope="col">Result</th>
                <th scope="col">Trigger</th>
                <th scope="col" className="num">Found</th>
                <th scope="col" className="num">New</th>
                <th scope="col" className="num">Emails</th>
                <th scope="col">Took</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 40).map((r) => (
                <tr key={String(r._id)}>
                  <td>{stamp(r.started_at)}</td>
                  <td className="muted">{PLATFORM_NAMES[r.source ?? "district"]}</td>
                  <td>
                    <span className="badge" data-status={r.status}>
                      {{ ok: "OK", error: "Failed", skipped: "Skipped", running: "Running" }[r.status]}
                    </span>
                    {r.error && <pre className="err">{r.error.split("\n\n")[0]}</pre>}
                  </td>
                  <td className="muted">{r.trigger === "cron" ? "Schedule" : "Manual"}</td>
                  <td className="num" title={Object.entries(r.per_movie ?? {}).map(([k, v]) => `${nameOf[k] ?? k}: ${v}`).join("\n")}>
                    {r.shows_found ?? ""}
                  </td>
                  <td className="num" title={r.already_listed ? `${r.already_listed} already listed on the other site, not emailed` : undefined}>
                    {r.new_shows ? <b>{r.new_shows}</b> : r.status === "ok" ? "0" : ""}
                  </td>
                  <td className="num">{r.emails_sent ?? ""}</td>
                  <td className="muted">{duration(r.started_at, r.finished_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
