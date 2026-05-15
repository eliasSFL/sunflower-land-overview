import { useState } from "react";

import { Button } from "./ui/index.ts";

type Props = {
  initialFarmId?: string;
  onSubmit: (farmId: string) => void;
  loading?: boolean;
  // Most recently loaded farm id, if any. The submit button stays
  // disabled while the input matches it — refreshing the current farm
  // belongs on the floating RefreshButton, not here.
  lastLoaded?: { farmId: string };
};

export function FarmIdForm({
  initialFarmId = "",
  onSubmit,
  loading,
  lastLoaded,
}: Props) {
  const [farmId, setFarmId] = useState(initialFarmId);

  const trimmedFarmId = farmId.trim();
  const valid = /^\d+$/.test(trimmedFarmId);
  const matchesLastLoaded =
    lastLoaded != null && trimmedFarmId === lastLoaded.farmId;
  const disabled = !valid || loading || matchesLastLoaded;

  const label = loading ? "Loading…" : "Load farm";

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) onSubmit(trimmedFarmId);
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
      <Button type="submit" disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}
