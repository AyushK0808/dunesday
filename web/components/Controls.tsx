"use client";

import { useActionState } from "react";
import { runControl } from "@/app/(app)/actions";
import { Flash } from "./Submit";

export function Controls({ paused }: { paused: boolean }) {
  const [state, action, busy] = useActionState(runControl, null);
  return (
    <form action={action} className="panel">
      <h2 className="section-title">Controls</h2>
      <p className="section-note">
        {paused ? "Tracking is paused. Scheduled checks are skipped until you resume." : "Scheduled checks run about every 10 minutes."}
      </p>
      <div className="controls">
        <button className="btn" name="intent" value="check" disabled={busy}>
          Check now
        </button>
        <button className="btn btn-ghost" name="intent" value={paused ? "resume" : "pause"} disabled={busy}>
          {paused ? "Resume tracking" : "Pause tracking"}
        </button>
        <button className="btn btn-ghost" name="intent" value="test" disabled={busy}>
          Send test email
        </button>
      </div>
      <Flash state={busy ? { ok: "Working…" } : state} />
    </form>
  );
}
