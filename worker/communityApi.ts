// Wrappers around `api.sunflower-land.com` community endpoints. Phase 1
// only needs the single-farm GET (for the subscribe-time warm fetch);
// the paginated scan used by the Coordinator lands in Phase 2.

const UPSTREAM = "https://api.sunflower-land.com";

// Per-farm community key format (services/communityApiKey.ts on the backend):
//   payload   = base64url(farmId as string)
//   signature = base64url(HMAC-SHA256(masterSecret, payload))
//   key       = `sfl.${payload}.${signature}`
// `looksLikePerFarmKey` lets local dev work with a single farm's pre-minted
// key (no master secret on the laptop) while production uses the master.
const PER_FARM_KEY_RE = /^sfl\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function looksLikePerFarmKey(value: string): boolean {
  return PER_FARM_KEY_RE.test(value);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Mint a per-farm community API key from the master HMAC secret.
// If `masterSecret` is itself already a per-farm key (local-dev mode),
// return it unchanged — upstream will accept it for the encoded farm
// and reject it for any other.
export async function mintFarmKey(
  farmId: number,
  masterSecret: string,
): Promise<string> {
  if (looksLikePerFarmKey(masterSecret)) {
    return masterSecret;
  }
  const payload = toBase64Url(new TextEncoder().encode(String(farmId)));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(masterSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(payload),
  );
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `sfl.${payload}.${sigB64}`;
}

export type FarmResponseRaw = {
  farm: unknown;
  id: number;
  nft_id?: number;
  nftId?: number;
  isBlacklisted?: boolean;
};

export async function getFarm(
  farmId: number,
  apiKey: string,
): Promise<FarmResponseRaw | null> {
  const res = await fetch(`${UPSTREAM}/community/farms/${farmId}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!res.ok) return null;
  try {
    return (await res.json()) as FarmResponseRaw;
  } catch {
    return null;
  }
}
