import { useEffect, useMemo, useState } from "react";
import { ApiError, fetchFarm, type FarmResponse } from "./api";
import { aggregateTimers, extractTimers, groupByCategory } from "./lib/timers";
import { useNow } from "./hooks/useNow";
import { FarmIdForm } from "./components/FarmIdForm";
import { TimerSection } from "./components/TimerSection";
import {
  clearApiKey,
  clearFarmId,
  loadApiKey,
  loadFarmId,
  saveApiKey,
  saveFarmId,
} from "./lib/storage";

const REFRESH_INTERVAL_MS = 60_000;

export default function App() {
  const [farmId, setFarmId] = useState(loadFarmId);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [data, setData] = useState<FarmResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);

  const now = useNow(1000);

  async function load(id: string, key: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFarm({ farmId: id, apiKey: key });
      setData(res);
      setLastLoaded(Date.now());
      saveFarmId(id);
      saveApiKey(key);
    } catch (e) {
      setData(null);
      if (e instanceof ApiError) setError(e.message);
      else if (e instanceof Error) setError(e.message);
      else setError("Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (farmId && apiKey && !data && !loading && !error) {
      void load(farmId, apiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data || !farmId || !apiKey) return;
    const id = setInterval(() => {
      void load(farmId, apiKey);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [data, farmId, apiKey]);

  const rawTimers = useMemo(() => extractTimers(data?.farm), [data]);
  const aggregated = useMemo(() => aggregateTimers(rawTimers), [rawTimers]);
  const grouped = useMemo(() => groupByCategory(aggregated), [aggregated]);
  const totalReady = rawTimers.filter((t) => t.readyAt - now <= 0).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Sunflower Land Overview</h1>
        <p className="text-sm text-[--color-muted]">
          Live timers for your farm. Get your API key in-game from{" "}
          <span className="font-medium">
            Settings → Developer Options → API Key
          </span>
          .
        </p>
      </header>

      <div className="rounded-xl border border-black/5 bg-white p-4 shadow-sm">
        <FarmIdForm
          initialFarmId={farmId}
          initialApiKey={apiKey}
          loading={loading}
          onSubmit={(id, key) => {
            setFarmId(id);
            setApiKey(key);
            void load(id, key);
          }}
          onClear={() => {
            setFarmId("");
            setApiKey("");
            setData(null);
            setError(null);
            clearFarmId();
            clearApiKey();
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="flex items-baseline justify-between text-sm text-[--color-muted]">
            <span>
              Farm <span className="font-mono">#{data.id}</span>
              {data.nftId ? (
                <>
                  {" "}
                  · NFT <span className="font-mono">#{data.nftId}</span>
                </>
              ) : null}
              {data.isBlacklisted && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  blacklisted
                </span>
              )}
            </span>
            <span>
              {totalReady} ready · {rawTimers.length} item
              {rawTimers.length === 1 ? "" : "s"}
              {lastLoaded && (
                <>
                  {" · "}
                  refreshed{" "}
                  {Math.max(0, Math.floor((now - lastLoaded) / 1000))}s ago
                </>
              )}
            </span>
          </div>

          {rawTimers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-black/10 bg-white p-8 text-center text-sm text-[--color-muted]">
              No active timers — you're all caught up. 🌻
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {Object.entries(grouped).map(([category, list]) => (
                <TimerSection
                  key={category}
                  category={category}
                  timers={list}
                  now={now}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!data && !error && !loading && !farmId && !apiKey && (
        <div className="rounded-lg border border-dashed border-black/10 bg-white p-8 text-center text-sm text-[--color-muted]">
          Enter a farm ID and API key to begin.
        </div>
      )}

      <footer className="pt-8 text-center text-xs text-[--color-muted]">
        Community tool · not affiliated with Sunflower Land · data via{" "}
        <code>api.sunflower-land.com/community/farms/&#123;id&#125;</code>
      </footer>
    </div>
  );
}
