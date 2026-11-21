"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { destroySession, normalizeEmail, requireAdmin, requireUser } from "@/lib/auth";
import { getDb, getSettings } from "@/lib/db";
import { sendTestAlert } from "@/lib/email";
import { dispatchCheck } from "@/lib/github";
import type { MovieSetting, Role, Settings, ShowDoc, Theme, UserDoc } from "@/lib/types";
import { ALL_TAGS } from "@/lib/types";

export type ActionResult = { ok?: string; error?: string } | null;

export async function signOut() {
  await destroySession();
  redirect("/login");
}

// ------------------------------------------------------------ controls (admin)

export async function runControl(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireAdmin();
  const intent = String(form.get("intent"));
  if (intent === "check") {
    try {
      await dispatchCheck();
      return { ok: "Check started. It shows up under Health in about a minute." };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't start the check." };
    }
  }
  if (intent === "pause" || intent === "resume") {
    const db = await getDb();
    await db.collection<Settings>("settings").updateOne({ _id: "global" }, { $set: { paused: intent === "pause" } });
    revalidatePath("/", "layout");
    return { ok: intent === "pause" ? "Tracking paused." : "Tracking resumed." };
  }
  if (intent === "test") return sendTest(user.email);
  return { error: "Unknown action." };
}

async function sendTest(email: string): Promise<ActionResult> {
  const db = await getDb();
  const sample = await db.collection<ShowDoc>("shows").aggregate<ShowDoc>([{ $match: { active: true } }, { $sample: { size: 4 } }]).toArray();
  try {
    await sendTestAlert(email, sample, process.env.SITE_URL ?? "");
    return { ok: `Test email sent to ${email}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send the test email." };
  }
}

// ------------------------------------------------------------ my alerts

export async function savePrefs(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const settings = await getSettings();
  const movieKeys = new Set(settings.movies.map((m) => m.key));
  const movies = form.getAll("movies").map(String).filter((k) => movieKeys.has(k));
  const formats = form.getAll("formats").map(String).filter((t) => ALL_TAGS.includes(t));
  const db = await getDb();
  await db.collection<UserDoc>("users").updateOne(
    { email: user.email },
    {
      $set: {
        name: String(form.get("name") ?? "").trim().slice(0, 60),
        prefs: {
          alerts_on: form.get("alerts_on") === "on",
          // Everything ticked is stored as "no filter", so new movies are included automatically.
          movies: movies.length === movieKeys.size ? [] : movies,
          formats,
        },
      },
    },
  );
  revalidatePath("/me");
  return { ok: "Alert preferences saved." };
}

// ------------------------------------------------------------ settings (admin)

const URL_RX = /^https:\/\/www\.district\.in\/movies\/[a-z0-9-]+?-movie-tickets(?:-in-[a-z0-9-]+)?-MV\d+/;

export async function saveSettings(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const city = String(form.get("city") ?? "").trim().toLowerCase();
  const language = String(form.get("language") ?? "").trim();
  if (!/^[a-z-]{2,40}$/.test(city)) return { error: "City must be District's city slug, like hyderabad or delhi-ncr." };
  if (!/^[A-Za-z]{2,20}$/.test(language)) return { error: "Language should be a single word, like English." };

  const keys = form.getAll("key").map(String);
  const movies: MovieSetting[] = [];
  for (let i = 0; i < keys.length; i++) {
    const name = String(form.getAll("name")[i] ?? "").trim();
    const url = String(form.getAll("url")[i] ?? "").trim();
    const theme = String(form.getAll("theme")[i] ?? "plain") as Theme;
    if (form.getAll("remove").map(String).includes(keys[i])) continue;
    if (!name && !url) continue;
    if (!name) return { error: "Every movie needs a name." };
    if (!URL_RX.test(url)) return { error: `"${name}" needs a District movie link, like https://www.district.in/movies/dune-part-three-movie-tickets-MV207332` };
    const key =
      keys[i] && keys[i] !== "new"
        ? keys[i]
        : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `movie-${Date.now()}`;
    if (movies.some((m) => m.key === key)) return { error: `Two movies share the name "${name}".` };
    movies.push({ key, name: name.slice(0, 80), url, enabled: form.getAll("enabled").map(String).includes(keys[i]), theme: ["dune", "doom", "plain"].includes(theme) ? theme : "plain" });
  }
  const db = await getDb();
  await db.collection<Settings>("settings").updateOne({ _id: "global" }, { $set: { city, language, movies } }, { upsert: true });
  revalidatePath("/", "layout");
  return { ok: "Settings saved. The next check uses them." };
}

// ------------------------------------------------------------ people (admin)

export async function addPerson(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const email = normalizeEmail(form.get("email"));
  if (!email) return { error: "Enter a valid email address." };
  const role: Role = form.get("role") === "admin" ? "admin" : "viewer";
  const db = await getDb();
  const res = await db.collection<UserDoc>("users").updateOne(
    { email },
    { $setOnInsert: { email, name: String(form.get("name") ?? "").trim().slice(0, 60), role, prefs: { alerts_on: true, movies: [], formats: [] }, created_at: new Date() } },
    { upsert: true },
  );
  revalidatePath("/people");
  return res.upsertedCount ? { ok: `${email} can now sign in.` } : { error: `${email} already has access.` };
}

export async function setRole(email: string, role: Role): Promise<void> {
  const me = await requireAdmin();
  if (email === me.email) return; // can't demote yourself
  const db = await getDb();
  await db.collection<UserDoc>("users").updateOne({ email }, { $set: { role } });
  revalidatePath("/people");
}

export async function removePerson(email: string): Promise<void> {
  const me = await requireAdmin();
  if (email === me.email) return;
  const db = await getDb();
  await db.collection<UserDoc>("users").deleteOne({ email });
  await db.collection("sessions").deleteMany({ email });
  revalidatePath("/people");
}
