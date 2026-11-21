import type { Metadata } from "next";
import { Submit } from "@/components/Submit";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/queries";
import { ago } from "@/lib/time";
import { removePerson, setRole } from "../actions";
import { AddPerson } from "./AddPerson";

export const metadata: Metadata = { title: "People" };

export default async function People() {
  const me = await requireAdmin();
  const users = await listUsers();
  return (
    <>
      <h1 className="page-title">People</h1>
      <p className="lede">Only these emails can sign in. Removing someone signs them out everywhere.</p>
      <AddPerson />
      <ul className="people">
        {users.map((u) => {
          const self = u.email === me.email;
          return (
            <li key={u.email} className="person">
              <div className="person-id">
                <div className="person-email">
                  {u.name ? `${u.name}, ` : ""}
                  {u.email}
                </div>
                <div className="person-meta">
                  {u.role === "admin" ? "Admin" : "Viewer"}
                  {self ? " (you)" : ""}, {u.last_login_at ? `last signed in ${ago(u.last_login_at)}` : "hasn't signed in yet"}, alerts {u.prefs?.alerts_on ? "on" : "off"}
                </div>
              </div>
              {!self && (
                <>
                  <form action={setRole.bind(null, u.email, u.role === "admin" ? "viewer" : "admin")}>
                    <Submit className="btn btn-ghost btn-sm">{u.role === "admin" ? "Make viewer" : "Make admin"}</Submit>
                  </form>
                  <form action={removePerson.bind(null, u.email)}>
                    <Submit className="btn btn-danger btn-sm" pending="Removing…">
                      Remove
                    </Submit>
                  </form>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
