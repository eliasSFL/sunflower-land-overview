import { useEffect, useState } from "react";

import { Button, InnerPanel } from "../components/ui/index.ts";

type SweepRun = {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  trigger: "cron" | "manual";
  farmsTouched: number | null;
  farmsSkipped: number | null;
  errors: string | null;
};

const POLL_MS = 5000;

export function SweepRunner() {
  const [runs, setRuns] = useState<SweepRun[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/sweeps", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { runs: SweepRun[] };
      setRuns(body.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }

  async function trigger() {
    setTriggering(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sweep", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <InnerPanel>
      <div className="p-3 space-y-3">
        <p className="font-bold text-sm">Coordinator sweep</p>
        <p className="text-xs opacity-70">
          The cron sweep runs every 10 min. Manual trigger forces a sweep
          immediately and queues behind any in-flight run. Recent runs
          below — auto-refreshes every {POLL_MS / 1000}s.
        </p>
        <Button
          type="button"
          onClick={trigger}
          disabled={triggering}
          className="w-auto px-4"
        >
          {triggering ? "Triggering…" : "Run sweep now"}
        </Button>
        {error ? <p className="text-xs text-red-300">Error: {error}</p> : null}
        <SweepTable runs={runs} />
      </div>
    </InnerPanel>
  );
}

function SweepTable({ runs }: { runs: SweepRun[] }) {
  if (runs.length === 0) {
    return <p className="text-xs opacity-70">No sweeps recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left opacity-70">
          <tr>
            <th className="p-1">Started</th>
            <th className="p-1">Trigger</th>
            <th className="p-1">Duration</th>
            <th className="p-1">Farms</th>
            <th className="p-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const duration =
              r.finishedAt != null
                ? `${Math.round((r.finishedAt - r.startedAt) / 100) / 10}s`
                : "in flight";
            const status = r.errors
              ? `error: ${r.errors.slice(0, 60)}`
              : r.finishedAt == null
                ? "running"
                : "ok";
            return (
              <tr key={r.id} className="odd:bg-black/5">
                <td className="p-1">
                  {new Date(r.startedAt).toLocaleString()}
                </td>
                <td className="p-1">{r.trigger}</td>
                <td className="p-1">{duration}</td>
                <td className="p-1">
                  {r.farmsTouched ?? "—"}
                  {r.farmsSkipped ? ` (-${r.farmsSkipped})` : ""}
                </td>
                <td className="p-1">{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
