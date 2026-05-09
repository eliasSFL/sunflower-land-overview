import { useState } from "react";

type Props = {
  initialFarmId: string;
  initialApiKey: string;
  loading: boolean;
  cooldownRemainingMs: number;
  onSubmit: (farmId: string, apiKey: string) => void;
  onClear: () => void;
};

export function FarmIdForm({
  initialFarmId,
  initialApiKey,
  loading,
  cooldownRemainingMs,
  onSubmit,
  onClear,
}: Props) {
  const [farmId, setFarmId] = useState(initialFarmId);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [revealKey, setRevealKey] = useState(false);

  const cooldownSeconds = Math.ceil(cooldownRemainingMs / 1000);
  const onCooldown = cooldownSeconds > 0;

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!farmId || !apiKey) return;
        onSubmit(farmId.trim(), apiKey.trim());
      }}
    >
      <label className="block">
        <span className="text-xs font-medium text-[--color-muted] uppercase tracking-wide">
          Farm ID
        </span>
        <input
          className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          inputMode="numeric"
          placeholder="e.g. 12345"
          value={farmId}
          onChange={(e) => setFarmId(e.target.value)}
          disabled={loading}
        />
      </label>

      <label className="block">
        <span className="flex items-center justify-between text-xs font-medium text-[--color-muted] uppercase tracking-wide">
          API Key
          <button
            type="button"
            className="text-amber-700 normal-case text-[11px] hover:underline"
            onClick={() => setRevealKey((v) => !v)}
            tabIndex={-1}
          >
            {revealKey ? "Hide" : "Show"}
          </button>
        </span>
        <input
          className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          type={revealKey ? "text" : "password"}
          placeholder="sfl.xxxxx.yyyyy"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={loading}
        />
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
          disabled={loading || onCooldown || !farmId || !apiKey}
          title={
            onCooldown
              ? `Wait ${cooldownSeconds}s before refreshing again`
              : undefined
          }
        >
          {loading
            ? "Loading…"
            : onCooldown
              ? `Wait ${cooldownSeconds}s`
              : "Load farm"}
        </button>
        {(initialFarmId || initialApiKey) && (
          <button
            type="button"
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[--color-muted] hover:bg-black/5"
            onClick={() => {
              setFarmId("");
              setApiKey("");
              onClear();
            }}
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
