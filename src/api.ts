const API_BASE = "https://api.sunflower-land.com";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type FarmResponse = {
  farm: GameState;
  id: number;
  nft_id?: number;
  nftId?: number;
  isBlacklisted?: boolean;
};

import type { GameState } from "./types";

export async function fetchFarm({
  farmId,
  apiKey,
}: {
  farmId: string;
  apiKey: string;
}): Promise<FarmResponse> {
  const res = await fetch(`${API_BASE}/community/farms/${farmId}`, {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) message = parsed.error;
    } catch {
      if (text) message = text;
    }
    throw new ApiError(res.status, message);
  }

  return res.json();
}
