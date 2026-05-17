// Fetch helpers for the Worker's /vip/* routes. Mirrors the shape of
// ./api.ts so consumers can swap helpers without learning a new style.

export type VipChain = "base" | "polygon";

export type VipStatus = {
  farmId: number;
  isVip: boolean;
  inGrace: boolean;
  expiresAt: number | null;
  graceUntil: number | null;
  trialUsedAt: number | null;
  depositAddress: `0x${string}`;
  chains: Record<
    VipChain,
    { usdc: `0x${string}`; minAmount: string; explorer: string }
  >;
};

const JSON_HEADERS = { "content-type": "application/json" } as const;

export async function getVipStatus(farmId: number): Promise<VipStatus> {
  const res = await fetch(`/vip/status?farmId=${farmId}`);
  if (!res.ok) throw new Error(`vip status: ${res.status}`);
  return (await res.json()) as VipStatus;
}

export type TrialResult =
  | { ok: true; status: VipStatus }
  | { ok: false; error: "trial_used"; status: VipStatus };

export async function postVipTrial(farmId: number): Promise<TrialResult> {
  const res = await fetch("/vip/trial", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ farmId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    status?: VipStatus;
  };
  if (res.ok && body.ok && body.status) {
    return { ok: true, status: body.status };
  }
  if (res.status === 409 && body.status) {
    return { ok: false, error: "trial_used", status: body.status };
  }
  throw new Error(body.error ?? `trial: ${res.status}`);
}

export type PaymentError =
  | "tx_not_found"
  | "tx_pending"
  | "tx_reverted"
  | "wrong_token"
  | "wrong_recipient"
  | "insufficient_amount"
  | "insufficient_confirmations"
  | "already_claimed";

export type PaymentResult =
  | { ok: true; status: VipStatus }
  | { ok: false; error: PaymentError; status?: VipStatus };

export async function postVipPayment(body: {
  farmId: number;
  chain: VipChain;
  txHash: string;
}): Promise<PaymentResult> {
  const res = await fetch("/vip/payment", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: PaymentError;
    status?: VipStatus;
  };
  if (res.ok && data.ok && data.status) {
    return { ok: true, status: data.status };
  }
  return {
    ok: false,
    error: data.error ?? "tx_not_found",
    status: data.status,
  };
}
