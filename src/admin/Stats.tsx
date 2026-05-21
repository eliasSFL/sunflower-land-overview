import { useEffect, useState } from "react";

import { InnerPanel } from "../components/ui/index.ts";

type LastSweep = {
  startedAt: number;
  finishedAt: number | null;
  trigger: "cron" | "manual";
  farmsTouched: number | null;
  errors: string | null;
} | null;

type StatsBody = {
  optedInFarms: number;
  lastSweep: LastSweep;
};

const REFRESH_MS = 10_000;

export function Stats() {
  const [stats, setStats] = useState<StatsBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    try {
      const res = await fetch("/api/admin/stats", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as StatsBody;
      setStats(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }

  return (
    <InnerPanel>
      <div className="p-3 space-y-3">
        <p className="font-bold text-sm">At a glance</p>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        {stats ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric
              label="Opted-in farms"
              value={stats.optedInFarms.toLocaleString()}
              hint="Total farms with at least one push subscription"
            />
            <Metric
              label="Last sweep"
              value={
                stats.lastSweep
                  ? new Date(stats.lastSweep.startedAt).toLocaleTimeString()
                  : "never"
              }
              hint={
                stats.lastSweep
                  ? `${stats.lastSweep.trigger}${
                      stats.lastSweep.errors ? " · errored" : ""
                    }${
                      stats.lastSweep.farmsTouched != null
                        ? ` · ${stats.lastSweep.farmsTouched} farms`
                        : ""
                    }`
                  : "Cron runs every 10 min"
              }
            />
          </div>
        ) : (
          <p className="text-xs opacity-70">Loading…</p>
        )}
        <p className="text-xs opacity-50">
          Auto-refreshes every {REFRESH_MS / 1000}s. For per-farm push
          delivery counts, look in Cloudflare's Observability tab
          (Worker logs include the &quot;dispatchPush&quot; lines).
        </p>
      </div>
    </InnerPanel>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-50">{hint}</p>
    </div>
  );
}
