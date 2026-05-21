import { useState, type FormEvent } from "react";

import { Button, InnerPanel } from "../components/ui/index.ts";

type PendingFire = {
  fireKey: string;
  readyAt: number;
  title: string;
  body: string;
  category?: string;
  count?: number;
};

type DebugState = {
  farmId: number | null;
  subscriptionCount: number;
  notificationTargets: string[];
  mutedCategories: string[];
  lastActivityAt: number | null;
  snapshotFetchedAt: number | null;
  snapshotUpdatedAt: string | null;
  pendingFires: PendingFire[];
};

export function FarmDebug() {
  const [farmInput, setFarmInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    farmId: number;
    state: DebugState;
  } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const parsed = Number(farmInput);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setError("Enter a positive integer farm ID");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/farm-debug/${parsed}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { farmId: number; state: DebugState };
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <InnerPanel>
      <div className="p-3 space-y-3">
        <p className="font-bold text-sm">Per-farm debug</p>
        <p className="text-xs opacity-70">
          Inspect a farm's DO: subscription count, last snapshot, pending
          push fires. No personal data is shown — push endpoints + keys
          stay inside the DO.
        </p>
        <form onSubmit={onSubmit} className="flex gap-2 items-end">
          <label className="flex-1 text-sm">
            <span className="block mb-1">Farm ID</span>
            <input
              type="number"
              min={1}
              value={farmInput}
              onChange={(e) => setFarmInput(e.target.value)}
              className="w-full p-1 text-black"
              placeholder="123456"
            />
          </label>
          <Button
            type="submit"
            disabled={loading || !farmInput}
            className="w-auto px-4"
          >
            {loading ? "Loading…" : "Look up"}
          </Button>
        </form>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        {result ? <DebugView debug={result} /> : null}
      </div>
    </InnerPanel>
  );
}

function DebugView({
  debug,
}: {
  debug: { farmId: number; state: DebugState };
}) {
  const s = debug.state;
  return (
    <div className="text-xs space-y-3">
      <div>
        <span className="opacity-70">Farm:</span> {debug.farmId}{" "}
        {s.farmId === null ? "(DO not initialized)" : ""}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span className="opacity-70">Subscriptions</span>
        <span>{s.subscriptionCount}</span>
        <span className="opacity-70">Targets</span>
        <span>{s.notificationTargets.join(", ") || "—"}</span>
        <span className="opacity-70">Muted categories</span>
        <span>{s.mutedCategories.join(", ") || "none"}</span>
        <span className="opacity-70">Last activity</span>
        <span>{formatTs(s.lastActivityAt)}</span>
        <span className="opacity-70">Snapshot fetched</span>
        <span>{formatTs(s.snapshotFetchedAt)}</span>
        <span className="opacity-70">Snapshot updatedAt</span>
        <span className="break-all">{s.snapshotUpdatedAt ?? "—"}</span>
      </div>
      <div>
        <p className="font-bold mb-1">Pending fires ({s.pendingFires.length})</p>
        {s.pendingFires.length === 0 ? (
          <p className="opacity-70">No pending fires.</p>
        ) : (
          <table className="w-full">
            <thead className="text-left opacity-70">
              <tr>
                <th className="p-1">Ready</th>
                <th className="p-1">Category</th>
                <th className="p-1">Title</th>
                <th className="p-1">Body</th>
                <th className="p-1">×</th>
              </tr>
            </thead>
            <tbody>
              {s.pendingFires.map((f) => (
                <tr key={f.fireKey} className="odd:bg-black/5">
                  <td className="p-1">{formatTs(f.readyAt)}</td>
                  <td className="p-1">{f.category ?? "—"}</td>
                  <td className="p-1">{f.title}</td>
                  <td className="p-1">{f.body}</td>
                  <td className="p-1">{f.count ?? 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatTs(ts: number | null): string {
  if (ts == null) return "—";
  return new Date(ts).toLocaleString();
}
