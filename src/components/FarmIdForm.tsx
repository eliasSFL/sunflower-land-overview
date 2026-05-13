import { useState } from "react";

import { Button } from "./ui/index.ts";

type Props = {
  initialFarmId?: string;
  initialApiKey?: string;
  onSubmit: (farmId: string, apiKey: string) => void;
  loading?: boolean;
  // The most recently loaded credentials, if any. When the current form
  // values differ from these, the cooldown doesn't apply (so switching
  // farms / keys is instant). When they match, the cooldown gates the
  // submit button to prevent rapid-refresh spam against the same farm.
  lastLoaded?: { farmId: string; apiKey: string };
  cooldownLeftMs?: number;
};

export function FarmIdForm({
  initialFarmId = "",
  initialApiKey = "",
  onSubmit,
  loading,
  lastLoaded,
  cooldownLeftMs = 0,
}: Props) {
  const [farmId, setFarmId] = useState(initialFarmId);
  const [apiKey, setApiKey] = useState(initialApiKey);

  const trimmedFarmId = farmId.trim();
  const trimmedApiKey = apiKey.trim();
  const valid = /^\d+$/.test(trimmedFarmId) && trimmedApiKey.length > 0;

  const matchesLastLoaded =
    lastLoaded != null &&
    trimmedFarmId === lastLoaded.farmId &&
    trimmedApiKey === lastLoaded.apiKey;

  const cooldownBlocks = matchesLastLoaded && cooldownLeftMs > 0;
  const disabled = !valid || loading || cooldownBlocks;

  let label: string;
  if (loading) {
    label = "Loading…";
  } else if (!matchesLastLoaded) {
    label = "Load farm";
  } else if (cooldownLeftMs > 0) {
    label = `Refresh (${Math.ceil(cooldownLeftMs / 1000)}s)`;
  } else {
    label = "Refresh";
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit(trimmedFarmId, trimmedApiKey);
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span>Farm ID</span>
        <input
          className="rounded border border-[#3e2731] bg-[#f7e4c2] px-2 py-1 outline-none"
          inputMode="numeric"
          pattern="\d*"
          value={farmId}
          onChange={(e) => setFarmId(e.target.value)}
          placeholder="123456"
          aria-label="Farm ID"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>API Key</span>
        <input
          className="rounded border border-[#3e2731] bg-[#f7e4c2] px-2 py-1 outline-none"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="generated in Settings → Developer Options"
          aria-label="API Key"
        />
      </label>
      <Button type="submit" disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}
