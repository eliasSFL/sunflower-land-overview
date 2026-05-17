/// <reference types="@cloudflare/workers-types" />

// HTTP handlers for /vip/*.
//
//   GET  /vip/status?farmId=N      → VipStatus
//   GET  /vip/config               → { walletConnectProjectId }
//   POST /vip/trial   { farmId }   → { ok, expiresAt } | 409 trial_used
//   POST /vip/payment { farmId, chain, txHash } → { ok, expiresAt } | 4xx

import type { Env, VipChain, VipStatus } from "../types.ts";
import { depositAddress } from "./address.ts";
import {
  applyPayment,
  applyTrial,
  readVip,
  type VipState,
} from "./state.ts";
import { MIN_USDC_6, verifyUsdcPayment } from "./verify.ts";

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function toStatus(env: Env, state: VipState): VipStatus {
  const address = depositAddress(env, state.farmId);
  return {
    farmId: state.farmId,
    isVip: state.isVip,
    inGrace: state.inGrace,
    expiresAt: state.expiresAt,
    graceUntil: state.graceUntil,
    trialUsedAt: state.trialUsedAt,
    depositAddress: address,
    chains: {
      base: {
        usdc: env.USDC_ADDRESS_BASE.toLowerCase() as `0x${string}`,
        minAmount: MIN_USDC_6.toString(),
        explorer: "https://basescan.org/tx/",
      },
      polygon: {
        usdc: env.USDC_ADDRESS_POLYGON.toLowerCase() as `0x${string}`,
        minAmount: MIN_USDC_6.toString(),
        explorer: "https://polygonscan.com/tx/",
      },
    },
  };
}

export async function handleVipStatus(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const raw = url.searchParams.get("farmId");
  if (!raw || !/^\d+$/.test(raw)) {
    return json({ error: "Missing or invalid farmId" }, { status: 400 });
  }
  const farmId = Number(raw);
  const state = await readVip(env, farmId);
  return json(toStatus(env, state));
}

export async function handleVipConfig(env: Env): Promise<Response> {
  if (!env.WALLETCONNECT_PROJECT_ID) {
    return json({ error: "Not configured" }, { status: 503 });
  }
  return json({ walletConnectProjectId: env.WALLETCONNECT_PROJECT_ID });
}

export async function handleVipTrial(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<{ farmId?: number }>(request);
  if (!body || typeof body.farmId !== "number" || !Number.isInteger(body.farmId)) {
    return json({ error: "Missing farmId" }, { status: 400 });
  }
  const result = await applyTrial(env, body.farmId);
  if (!result.ok) {
    return json(
      { error: "trial_used", status: toStatus(env, result.state) },
      { status: 409 },
    );
  }
  return json({ ok: true, status: toStatus(env, result.state) });
}

function isChain(s: unknown): s is VipChain {
  return s === "base" || s === "polygon";
}

export async function handleVipPayment(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<{
    farmId?: number;
    chain?: string;
    txHash?: string;
  }>(request);
  if (
    !body ||
    typeof body.farmId !== "number" ||
    !Number.isInteger(body.farmId) ||
    !isChain(body.chain) ||
    typeof body.txHash !== "string"
  ) {
    return json(
      { error: "Missing farmId, chain ('base'|'polygon'), or txHash" },
      { status: 400 },
    );
  }
  const farmId = body.farmId;
  const chain = body.chain;
  const recipient = depositAddress(env, farmId);
  const verify = await verifyUsdcPayment(env, chain, body.txHash, recipient);
  if (!verify.ok) {
    // 202 for transient states the client should retry; 4xx for
    // terminal rejections. The PayModal polls /vip/status anyway, so
    // it can also drive retries off `tx_pending` / `insufficient_confirmations`.
    const transient =
      verify.reason === "tx_pending" ||
      verify.reason === "insufficient_confirmations";
    return json({ error: verify.reason }, { status: transient ? 202 : 400 });
  }
  const applied = await applyPayment(env, {
    farmId,
    chain,
    txHash: body.txHash,
    from: verify.from,
    to: verify.to,
    amountUsdc6: verify.amount,
    blockNumber: verify.blockNumber,
  });
  if (!applied.ok) {
    return json(
      { error: applied.reason, status: toStatus(env, applied.state) },
      { status: 409 },
    );
  }
  return json({ ok: true, status: toStatus(env, applied.state) });
}
