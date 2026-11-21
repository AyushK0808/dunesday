import "server-only";
import "./env";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import type { UserDoc } from "./types";

export const SESSION_COOKIE = "dd_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

type OtpDoc = { email: string; code_hash: string; attempts: number; created_at: Date; expires_at: Date };
type SessionDoc = { token_hash: string; email: string; created_at: Date; expires_at: Date };

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET must be set (at least 16 characters)");
  return s;
}

export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

const hashCode = (email: string, code: string) => createHmac("sha256", secret()).update(`${email}:${code}`).digest("hex");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function ensureAdminSeed(email: string) {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin || email !== admin) return;
  const db = await getDb();
  await db.collection<UserDoc>("users").updateOne(
    { email },
    {
      $setOnInsert: { email, name: "", prefs: { alerts_on: true, movies: [], formats: [] }, created_at: new Date() },
      $set: { role: "admin" },
    },
    { upsert: true },
  );
}

/** Returns a code to email, or a reason it can't be sent. Unknown emails return "unknown" so the caller can respond identically. */
export async function createLoginCode(email: string): Promise<{ code: string } | { error: "unknown" | "too_soon" | "too_many" }> {
  await ensureAdminSeed(email);
  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ email });
  if (!user) return { error: "unknown" };

  const otps = db.collection<OtpDoc>("otp_codes");
  const now = Date.now();
  const recent = await otps.find({ email, created_at: { $gt: new Date(now - 60 * 60 * 1000) } }).sort({ created_at: -1 }).toArray();
  if (recent.length >= 5) return { error: "too_many" };
  if (recent[0] && now - recent[0].created_at.getTime() < 60 * 1000) return { error: "too_soon" };

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await otps.insertOne({
    email,
    code_hash: hashCode(email, code),
    attempts: 0,
    created_at: new Date(now),
    expires_at: new Date(now + CODE_MINUTES * 60 * 1000),
  });
  return { code };
}

export async function verifyLoginCode(email: string, code: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = await getDb();
  const otps = db.collection<OtpDoc>("otp_codes");
  const otp = await otps.findOne({ email, expires_at: { $gt: new Date() } }, { sort: { created_at: -1 } });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) return { ok: false, message: "This code has expired. Request a new one." };

  const a = Buffer.from(otp.code_hash, "hex");
  const b = Buffer.from(hashCode(email, code.replace(/\D/g, "")), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await otps.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    const left = MAX_ATTEMPTS - otp.attempts - 1;
    return { ok: false, message: left > 0 ? `That code doesn't match. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Request a new one." };
  }

  await otps.deleteMany({ email });
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.collection<SessionDoc>("sessions").insertOne({ token_hash: hashToken(token), email, created_at: new Date(), expires_at: expires });
  await db.collection<UserDoc>("users").updateOne({ email }, { $set: { last_login_at: new Date() } });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  return { ok: true };
}

export const currentUser = cache(async (): Promise<UserDoc | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const session = await db.collection<SessionDoc>("sessions").findOne({ token_hash: hashToken(token), expires_at: { $gt: new Date() } });
  if (!session) return null;
  return db.collection<UserDoc>("users").findOne({ email: session.email });
});

export async function requireUser(): Promise<UserDoc> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<UserDoc> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.collection<SessionDoc>("sessions").deleteOne({ token_hash: hashToken(token) });
  }
  jar.delete(SESSION_COOKIE);
}
