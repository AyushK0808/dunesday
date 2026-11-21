import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { PREMIUM_TAGS } from "@/lib/types";
import { PrefsForm } from "./PrefsForm";

export const metadata: Metadata = { title: "My alerts" };

export default async function Me() {
  const user = await requireUser();
  const settings = await getSettings();
  return (
    <>
      <h1 className="page-title">My alerts</h1>
      <p className="lede">Choose which new showtimes you get emailed about. Each check sends at most one email, listing everything new that matches.</p>
      <PrefsForm
        name={user.name}
        email={user.email}
        prefs={user.prefs}
        movies={settings.movies.map((m) => ({ key: m.key, name: m.name, theme: m.theme }))}
        formats={[...PREMIUM_TAGS, "Atmos", "Recliners", "3D", "2D"]}
      />
    </>
  );
}
