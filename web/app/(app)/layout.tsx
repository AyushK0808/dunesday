import Link from "next/link";
import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { latestRuns } from "@/lib/queries";
import { ago } from "@/lib/time";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [settings, [last]] = await Promise.all([getSettings(), latestRuns(1, "district")]);
  const stale = !last || Date.now() - new Date(last.started_at).getTime() > 60 * 60 * 1000;
  const state = settings.paused ? "paused" : last?.status === "error" ? "error" : stale ? "stale" : "ok";
  const text =
    state === "paused"
      ? "Paused"
      : !last
        ? "No checks yet"
        : state === "error"
          ? `Last check failed ${ago(last.started_at)}`
          : `Checked ${ago(last.started_at)}`;

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link href="/" className="wordmark" aria-label="Dunesday home">
            DUNESDAY
          </Link>
          <Nav admin={user.role === "admin"} />
          <div className="topbar-end">
            <Link href="/health" className="status" data-state={state}>
              <span className="status-dot" aria-hidden="true" />
              <span className="status-text">{text}</span>
              <span className="sr-only">{state === "ok" ? "" : text}</span>
            </Link>
            <form action={signOut}>
              <button className="linkish" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>
        <div className="wrap">{children}</div>
      </main>
    </>
  );
}
