import { useEffect, useState } from "react";

import { Button, InnerPanel } from "../components/ui/index.ts";

type Banner = { text: string; updatedAt: number } | null;
type ActionStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "clearing" }
  | { kind: "error"; message: string };

export function BannerEditor() {
  const [banner, setBanner] = useState<Banner>(null);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<ActionStatus>({ kind: "idle" });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/banner", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { banner: Banner };
      setBanner(body.banner);
      setDraft(body.banner?.text ?? "");
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Load failed",
      });
    } finally {
      setLoaded(true);
    }
  }

  async function save() {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/admin/banner", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { banner: Banner };
      setBanner(body.banner);
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  async function clear() {
    setStatus({ kind: "clearing" });
    try {
      const res = await fetch("/api/admin/banner", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBanner(null);
      setDraft("");
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Clear failed",
      });
    }
  }

  return (
    <InnerPanel>
      <div className="p-3 space-y-3">
        <p className="font-bold text-sm">System banner</p>
        <p className="text-xs opacity-70">
          Shows across the top of the dashboard for every visitor until you
          clear it. Max 500 chars. Users can dismiss per-session (a new
          banner re-shows even after dismiss).
        </p>
        {banner ? (
          <p className="text-xs opacity-70">
            Currently active · updated{" "}
            {new Date(banner.updatedAt).toLocaleString()}
          </p>
        ) : (
          <p className="text-xs opacity-70">
            {loaded ? "No banner active." : "Loading…"}
          </p>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Scheduled maintenance Saturday 10:00 UTC"
          className="w-full p-1 text-black text-sm"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={save}
            disabled={
              status.kind === "saving" ||
              draft.trim().length === 0 ||
              draft.trim() === banner?.text
            }
            className="w-auto px-4"
          >
            {status.kind === "saving" ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            onClick={clear}
            disabled={status.kind === "clearing" || !banner}
            className="w-auto px-4"
          >
            {status.kind === "clearing" ? "Clearing…" : "Clear"}
          </Button>
        </div>
        {status.kind === "error" ? (
          <p className="text-xs text-red-300">Error: {status.message}</p>
        ) : null}
      </div>
    </InnerPanel>
  );
}
