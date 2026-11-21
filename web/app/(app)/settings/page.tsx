import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="lede">What the tracker watches. Changes apply from the next check. Removing a film keeps its past shows in the database.</p>
      <SettingsForm city={s.city} language={s.language} movies={s.movies} />
    </>
  );
}
