import { useState } from "react";

import { Button } from "./sfl-ui/index.ts";

type Props = {
  initialFarmId?: string;
  initialApiKey?: string;
  onSubmit: (farmId: string, apiKey: string) => void;
  loading?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
};

export function FarmIdForm({
  initialFarmId = "",
  initialApiKey = "",
  onSubmit,
  loading,
  submitLabel = "Load farm",
  submitDisabled,
}: Props) {
  const [farmId, setFarmId] = useState(initialFarmId);
  const [apiKey, setApiKey] = useState(initialApiKey);

  const valid = /^\d+$/.test(farmId.trim()) && apiKey.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(farmId.trim(), apiKey.trim());
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
      <Button
        type="submit"
        disabled={!valid || loading || submitDisabled}
      >
        {loading ? "Loading…" : submitLabel}
      </Button>
    </form>
  );
}
