import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DuneScene, IronScene } from "@/components/Art";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function Login() {
  if (await currentUser()) redirect("/");
  return (
    <div className="login">
      <div className="login-art" aria-hidden="true">
        <div className="half half-dune">
          <DuneScene viewBox="420 0 330 420" />
        </div>
        <div className="half half-doom">
          <IronScene />
        </div>
        <div className="login-seam" />
      </div>
      <main className="login-panel">
        <div className="login-card">
          <h1 className="login-mark">DUNESDAY</h1>
          <p className="login-copy">Showtimes for Dune: Part Three and Avengers: Doomsday in Hyderabad, watched every 10 minutes.</p>
          <LoginForm />
          <p className="login-foot">Invite only. Ask the admin to add your email.</p>
        </div>
      </main>
    </div>
  );
}
