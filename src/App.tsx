import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, fetchFarm, type FarmResponse } from "./api";
import {
  aggregateTimers,
  extractActiveCategories,
  extractTimers,
  groupByCategory,
} from "./lib/timers";
import { slugify } from "./lib/slug";
import { useNow } from "./hooks/useNow";
import { FarmIdForm } from "./components/FarmIdForm";
import { TimerSection } from "./components/TimerSection";
import { Sidebar } from "./components/Sidebar";
import {
  clearApiKey,
  clearFarmId,
  loadApiKey,
  loadFarmId,
  saveApiKey,
  saveFarmId,
} from "./lib/storage";

// Server throttle is 5s normal / 10s after rapid attempts; we stay above the
// upper bound so client-initiated reloads can never trigger a 429.
const CLIENT_COOLDOWN_MS = 11_000;

export default function App() {
  const [farmId, setFarmId] = useState(loadFarmId);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [data, setData] = useState<FarmResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const now = useNow(1000);

  // Refs (not state) so we can guard synchronously inside `load` — React state
  // is stale in the closures of the auto-load effect and any rapid-fire calls.
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  async function load(id: string, key: string) {
    // Drop overlapping calls (StrictMode double-mount, fast button mashing,
    // background interval racing a manual submit, etc.).
    if (inFlightRef.current) return;
    if (Date.now() - lastFetchAtRef.current < CLIENT_COOLDOWN_MS) return;

    inFlightRef.current = true;
    lastFetchAtRef.current = Date.now();
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
      inFlightRef.current = false;
    }
  }

  useEffect(() => {
    if (farmId && apiKey && !data && !loading && !error) {
      // The cascading-renders concern of set-state-in-effect is mitigated by
      // inFlightRef / lastFetchAtRef inside load(); this is a deliberate
      // mount-time fetch that should run exactly once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load(farmId, apiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll while the mobile drawer is open so the page underneath
  // doesn't scroll behind it.
  useEffect(() => {
    if (!drawerOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [drawerOpen]);

  const rawTimers = useMemo(() => extractTimers(data?.farm), [data]);
  const aggregated = useMemo(() => aggregateTimers(rawTimers), [rawTimers]);
  const activeCategories = useMemo(
    () => extractActiveCategories(data?.farm),
    [data],
  );
  const grouped = useMemo(
    () => groupByCategory(aggregated, activeCategories),
    [aggregated, activeCategories],
  );
  const totalReady = rawTimers.filter((t) => t.readyAt - now <= 0).length;

  const sidebarEntries = Object.entries(grouped).map(([category, list]) => ({
    category,
    total: list.reduce((sum, t) => sum + t.count, 0),
    ready: list.reduce(
      (sum, t) => (t.earliestReadyAt - now <= 0 ? sum + t.count : sum),
      0,
    ),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold">Sunflower Land Overview</h1>
        <p className="text-sm text-[--color-muted]">
          Live timers for your farm. Get your API key in-game from{" "}
          <span className="font-medium">
            Settings → Developer Options → API Key
          </span>
          .
        </p>
      </header>

      <div className="flex gap-6">
        {/* Desktop sidebar — sticky, always visible from `lg` up. */}
        {sidebarEntries.length > 0 && (
          <aside className="sticky top-6 hidden h-fit w-48 shrink-0 lg:block">
            <Sidebar entries={sidebarEntries} />
          </aside>
        )}

        <main className="min-w-0 flex-1 space-y-6">
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

              {Object.keys(grouped).length === 0 ? (
                <div className="rounded-lg border border-dashed border-black/10 bg-white p-8 text-center text-sm text-[--color-muted]">
                  No active timers — you're all caught up. 🌻
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {Object.entries(grouped).map(([category, list]) => (
                    <TimerSection
                      key={category}
                      id={slugify(category)}
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
        </main>
      </div>

      {/* Floating mobile-only button — fixed-position so it stays reachable
          as the user scrolls through the timer sections. Bottom-right keeps
          it within easy thumb reach. */}
      {sidebarEntries.length > 0 && !drawerOpen && (
        <button
          type="button"
          className="fixed bottom-4 right-4 z-40 rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-medium shadow-lg hover:bg-black/5 lg:hidden"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open sections menu"
        >
          ☰ Sections
        </button>
      )}

      {/* Mobile drawer — only mounted when open so the dimmed backdrop and
          slide-in panel don't capture taps when closed. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Sections
              </h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm hover:bg-black/5"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto">
              <Sidebar
                entries={sidebarEntries}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
