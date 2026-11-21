"use client";

import { useActionState } from "react";
import { Flash, Submit } from "@/components/Submit";
import { addPerson } from "../actions";

export function AddPerson() {
  const [state, action] = useActionState(addPerson, null);
  return (
    <form action={action} className="panel" style={{ marginBottom: 28 }}>
      <h2 className="section-title">Invite someone</h2>
      <p className="section-note">They sign in with a code sent to this email. Viewers can browse and set their own alerts. Admins can also change settings and people.</p>
      <div className="inline-form">
        <div className="field">
          <label htmlFor="p-email">Email</label>
          <input id="p-email" name="email" type="email" className="input" required autoComplete="off" />
        </div>
        <div className="field" style={{ flex: "0 1 200px" }}>
          <label htmlFor="p-name">Name (optional)</label>
          <input id="p-name" name="name" className="input" autoComplete="off" />
        </div>
        <div className="field" style={{ flex: "0 0 140px" }}>
          <label htmlFor="p-role">Role</label>
          <select id="p-role" name="role" className="select" style={{ minHeight: 46, borderRadius: 12 }} defaultValue="viewer">
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Submit pending="Adding…">Give access</Submit>
      </div>
      <Flash state={state} />
    </form>
  );
}
