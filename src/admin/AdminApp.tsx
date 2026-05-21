import { useState, type FormEvent } from "react";

import {
  Button,
  InnerPanel,
  OuterPanel,
  SectionHeader,
} from "../components/ui/index.ts";
import { BannerEditor } from "./BannerEditor.tsx";
import { BroadcastPush } from "./BroadcastPush.tsx";
import { FarmDebug } from "./FarmDebug.tsx";
import { Stats } from "./Stats.tsx";
import { SweepRunner } from "./SweepRunner.tsx";
import { useIsAdmin } from "./useIsAdmin.ts";

// Rendered when the SPA's path starts with `/admin`. The route itself is
// protected by Cloudflare Access at the edge, so by the time this mounts
// the browser already holds a valid session — but we still hit
// /api/admin/me to surface the authenticated email and to fail loudly
// if the env vars wiring Access ↔ the Worker aren't set.
export function AdminApp() {
  const state = useIsAdmin();

  return (
    <div className="min-h-dvh bg-[#181425] p-3">
      <OuterPanel className="min-h-dvh">
        <SectionHeader>Admin</SectionHeader>
        {state.status === "loading" ? (
          <p className="p-3 text-sm">Checking access…</p>
        ) : state.status === "anonymous" ? (
          <NotAuthorized />
        ) : (
          <AuthorizedView email={state.email} />
        )}
      </OuterPanel>
    </div>
  );
}

function NotAuthorized() {
  return (
    <InnerPanel className="m-3">
      <div className="p-3 text-sm space-y-2">
        <p className="font-bold">Not authorized</p>
        <p>
          This dashboard is gated by Cloudflare Access. If you should have
          access, sign in via the Access flow and reload.
        </p>
        <p className="opacity-70">
          If you keep seeing this after signing in, the Worker is missing
          one of CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD / ADMIN_EMAIL.
        </p>
      </div>
    </InnerPanel>
  );
}

function AuthorizedView({ email }: { email: string }) {
  return (
    <div className="m-3 space-y-3">
      <InnerPanel>
        <div className="p-3 text-sm flex items-center justify-between gap-2">
          <span>
            Signed in as <span className="font-bold">{email}</span>
          </span>
          <a
            href="/"
            className="text-xs underline opacity-70 hover:opacity-100"
          >
            ← Back to dashboard
          </a>
        </div>
      </InnerPanel>
      <Stats />
      <BannerEditor />
      <SweepRunner />
      <FarmDebug />
      <BroadcastPush />
      <TestEmailForm />
    </div>
  );
}

type SendStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

function TestEmailForm() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Test from SFL Overview");
  const [text, setText] = useState(
    "This is a test message sent via Cloudflare Email Sending.",
  );
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, subject, text }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setStatus({
          kind: "error",
          message: body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      setStatus({ kind: "ok" });
    } catch (err: unknown) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <InnerPanel>
      <div className="p-3 space-y-3">
        <p className="font-bold text-sm">Send test email</p>
        <p className="text-xs opacity-70">
          Sends from <code>no-reply@sfl-overview.com</code> with
          Reply-To <code>info@sunflower-land.com</code>. Counts against
          today's 200-message quota.
        </p>
        <form onSubmit={onSubmit} className="space-y-2 text-sm">
          <label className="block">
            <span className="block mb-1">To</span>
            <input
              required
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full p-1 text-black"
              placeholder="someone@example.com"
            />
          </label>
          <label className="block">
            <span className="block mb-1">Subject</span>
            <input
              required
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full p-1 text-black"
            />
          </label>
          <label className="block">
            <span className="block mb-1">Body</span>
            <textarea
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              className="w-full p-1 text-black"
            />
          </label>
          <Button type="submit" disabled={status.kind === "sending"}>
            {status.kind === "sending" ? "Sending…" : "Send"}
          </Button>
        </form>
        {status.kind === "ok" ? (
          <p className="text-xs text-green-300">Sent.</p>
        ) : null}
        {status.kind === "error" ? (
          <p className="text-xs text-red-300">Error: {status.message}</p>
        ) : null}
      </div>
    </InnerPanel>
  );
}
