"use server";

import { redirect } from "next/navigation";
import { createLoginCode, normalizeEmail, verifyLoginCode } from "@/lib/auth";
import { sendLoginCode } from "@/lib/email";

export type LoginState = { step: "email" | "code"; email?: string; error?: string; notice?: string };

export async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = normalizeEmail(form.get("email"));
  if (!email) return { step: "email", error: "Enter a valid email address." };

  const result = await createLoginCode(email);
  if ("error" in result) {
    if (result.error === "too_soon") return { step: "code", email, notice: "A code was sent less than a minute ago. Check your inbox, or wait a minute to request another." };
    if (result.error === "too_many") return { step: "email", email, error: "Too many codes requested for this email. Try again in an hour." };
    // Unknown emails get the same response as known ones, so the allowlist can't be probed.
    return { step: "code", email, notice: `If ${email} is on the guest list, a 6-digit code is on its way.` };
  }
  try {
    await sendLoginCode(email, result.code);
  } catch (e) {
    console.error("sendLoginCode failed", e);
    return { step: "email", email, error: "The code email couldn't be sent. Check the site's Gmail settings and try again." };
  }
  return { step: "code", email, notice: `If ${email} is on the guest list, a 6-digit code is on its way.` };
}

export async function submitCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = normalizeEmail(form.get("email"));
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!email) return { step: "email", error: "Enter your email again." };
  if (code.length !== 6) return { step: "code", email, error: "Enter the 6-digit code from the email." };
  const res = await verifyLoginCode(email, code);
  if (!res.ok) return { step: "code", email, error: res.message };
  redirect("/");
}
