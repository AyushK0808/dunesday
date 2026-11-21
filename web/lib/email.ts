import "server-only";
import "./env";
import nodemailer, { type SendMailOptions } from "nodemailer";
import type { ShowDoc } from "./types";

function transport() {
  // Local development only: print emails to the server log instead of sending them.
  if (process.env.NODE_ENV !== "production" && process.env.MAIL_DEV_LOG === "1") {
    const t = nodemailer.createTransport({ jsonTransport: true });
    const send = t.sendMail.bind(t);
    t.sendMail = (async (msg: SendMailOptions) => {
      console.log(`[mail:dev] to=${String(msg.to)} subject=${String(msg.subject)} text=${String(msg.text)}`);
      return send(msg);
    }) as typeof t.sendMail;
    return { t, user: "dev@localhost" };
  }
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be set");
  return { t: nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } }), user };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function shell(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#16131D;padding:28px 12px">
<div style="max-width:560px;margin:auto;background:#1E1A27;border:1px solid #2E2938;border-radius:18px;padding:30px;color:#ECE3D2;font:15px/1.55 -apple-system,Segoe UI,Arial,sans-serif">
<div style="font:700 13px Arial,sans-serif;letter-spacing:.42em;color:#D8B98C">DUNESDAY</div>${inner}</div></body></html>`;
}

export async function sendLoginCode(to: string, code: string) {
  const { t, user } = transport();
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  await t.sendMail({
    from: { name: "Dunesday", address: user },
    to,
    subject: `${pretty} is your Dunesday sign-in code`,
    text: `Your Dunesday sign-in code is ${pretty}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`,
    html: shell(`<p style="margin:22px 0 6px;color:#A79F92">Your sign-in code</p>
<div style="font:600 40px/1.1 Consolas,Menlo,monospace;letter-spacing:.18em;color:#EE9A3E">${pretty}</div>
<p style="margin:18px 0 0;color:#A79F92">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`),
  });
}

export async function sendTestAlert(to: string, sample: ShowDoc[], siteUrl: string) {
  const { t, user } = transport();
  const rows = sample
    .map(
      (s) => `<tr><td style="padding:8px 0;border-top:1px solid #2E2938"><b>${esc(s.time_text)}</b> <span style="color:${s.movie_key.includes("dune") ? "#EE9A3E" : "#45C79A"}">${esc(s.tags.join(" "))}</span><br>
<span style="color:#A79F92;font-size:13px">${esc(s.movie_name)}, ${esc(s.theatre_name)}, ${esc(s.date)}</span></td></tr>`,
    )
    .join("");
  await t.sendMail({
    from: { name: "Dunesday", address: user },
    to,
    subject: "Test alert from Dunesday",
    text: "This is a test alert. Real alerts list every new showtime the tracker finds.",
    html: shell(`<h2 style="font:400 22px Georgia,serif;margin:18px 0 6px">Email alerts are working</h2>
<p style="color:#A79F92;margin:0 0 12px">Real alerts look like this and list every new showtime the tracker finds. Here are a few current shows:</p>
<table width="100%" cellpadding="0" cellspacing="0">${rows || "<tr><td>No shows in the database yet.</td></tr>"}</table>
${siteUrl ? `<p style="margin-top:18px"><a style="color:#EE9A3E" href="${esc(siteUrl)}">Open Dunesday</a></p>` : ""}`),
  });
}
