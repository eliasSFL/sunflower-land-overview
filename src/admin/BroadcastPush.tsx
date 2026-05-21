import { useState, type FormEvent } from "react";

import { Button, InnerPanel } from "../components/ui/index.ts";

type BroadcastResult = {
  farms: number;
  farmsFailed: number;
  sent: number;
  pruned: number;
  total: number;
};

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok"; result: BroadcastResult }
  | { kind: "error"; message: string };

export function BroadcastPush() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urlField, setUrlField] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function send() {
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/admin/broadcast-push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          url: urlField || undefined,
        }),
      });
      if (!res.ok) {
        const reply = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(reply.error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as BroadcastResult;
      setStatus({ kind: "ok", result });
      setConfirming(false);
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Send failed",
      });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    void send();
  }

  return (
    <InnerPanel>
      <div className="p-3 space-y-3">
        <p className="font-bold text-sm">Broadcast push notification</p>
        <p className="text-xs opacity-70">
          Sends a custom push to every device subscribed to every opted-in
          farm. Bypasses per-category mutes. Use sparingly — this hits
          every user at once.
        </p>
        <form onSubmit={onSubmit} className="space-y-2 text-sm">
          <label className="block">
            <span className="block mb-1">Title (max 100)</span>
            <input
              required
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              className="w-full p-1 text-black"
              placeholder="Sunflower Land Overview"
            />
          </label>
          <label className="block">
            <span className="block mb-1">Body (max 300)</span>
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full p-1 text-black"
              placeholder="New feature: …"
            />
          </label>
          <label className="block">
            <span className="block mb-1">
              Click URL (optional — defaults to the user's overview tab)
            </span>
            <input
              type="text"
              value={urlField}
              onChange={(e) => setUrlField(e.target.value)}
              className="w-full p-1 text-black"
              placeholder="/?farmId=..."
            />
          </label>
          <Button
            type="submit"
            disabled={status.kind === "sending" || !title || !body}
            className="w-auto px-4"
          >
            {status.kind === "sending"
              ? "Sending…"
              : confirming
                ? "Confirm broadcast"
                : "Send to everyone"}
          </Button>
          {confirming && status.kind !== "sending" ? (
            <p className="text-xs text-amber-300">
              Click again to confirm — this will dispatch a push to every
              opted-in farm.
            </p>
          ) : null}
        </form>
        {status.kind === "ok" ? (
          <p className="text-xs text-green-300">
            Sent. {status.result.farms} farms · {status.result.sent}{" "}
            deliveries · {status.result.pruned} stale endpoints pruned
            {status.result.farmsFailed
              ? ` · ${status.result.farmsFailed} farms failed`
              : ""}
            .
          </p>
        ) : null}
        {status.kind === "error" ? (
          <p className="text-xs text-red-300">Error: {status.message}</p>
        ) : null}
      </div>
    </InnerPanel>
  );
}
