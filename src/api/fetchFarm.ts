import type { GameState } from "../game/index.ts";

export type FarmResponse = {
  farm: GameState;
  id: number;
  nft_id?: number;
  nftId?: number;
  isBlacklisted?: boolean;
};

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function fetchFarm(
  farmId: string,
  apiKey: string,
): Promise<FarmResponse> {
  const trimmedId = farmId.trim();
  if (!/^\d+$/.test(trimmedId)) {
    throw new ApiError(400, "Farm ID must be a number");
  }

  const res = await fetch(`/api/farms/${trimmedId}`, {
    headers: { "x-api-key": apiKey.trim() },
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      message = String((parsed as Record<string, unknown>).error);
    } else if (typeof parsed === "string" && parsed.length > 0) {
      message = parsed;
    }
    throw new ApiError(res.status, message, parsed);
  }

  // Minimal shape check — every downstream consumer assumes `farm` is
  // present and `id` is numeric. A malformed 200 response from a
  // misconfigured proxy would otherwise crash deeper in the pipeline.
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("farm" in parsed) ||
    typeof (parsed as Record<string, unknown>).farm !== "object"
  ) {
    throw new ApiError(
      502,
      "Unexpected response shape from /api/farms",
      parsed,
    );
  }

  return parsed as FarmResponse;
}
