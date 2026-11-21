"use client";

import { useFormStatus } from "react-dom";

export function Submit({ children, pending, className = "btn" }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={busy}>
      {busy && pending ? pending : children}
    </button>
  );
}

export function Flash({ state }: { state: { ok?: string; error?: string } | null }) {
  if (!state) return null;
  return (
    <p className="flash" data-kind={state.error ? "error" : "ok"} role="status" aria-live="polite">
      {state.error ?? state.ok}
    </p>
  );
}
