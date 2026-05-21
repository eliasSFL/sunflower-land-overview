import type { Env } from "./types.ts";

// Pinned by design: every outbound mail comes from `no-reply@` and routes
// replies to the main brand inbox. Centralised so a stray send() call can't
// pick a different From — see [[email-infrastructure]].
const FROM = "no-reply@sfl-overview.com";
const REPLY_TO = "info@sunflower-land.com";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  // Token to expose via `List-Unsubscribe` / `List-Unsubscribe-Post` headers
  // for one-click unsubscribe (RFC 8058 / Gmail bulk-sender requirements).
  // Omit for one-off admin sends (test mail, transactional acks); include
  // for anything fanned out to a subscriber list.
  unsubscribeToken?: string;
};

export async function sendEmail(env: Env, msg: SendEmailInput) {
  const headers: Record<string, string> = {};
  if (msg.unsubscribeToken) {
    const url = `https://sfl-overview.com/email/unsubscribe?t=${encodeURIComponent(msg.unsubscribeToken)}`;
    headers["List-Unsubscribe"] = `<${url}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return env.SEND_EMAIL.send({
    from: FROM,
    replyTo: REPLY_TO,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    headers,
  });
}
