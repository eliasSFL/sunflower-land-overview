/// <reference types="@cloudflare/workers-types" />

// On-chain payment verification.
//
// Player POSTs a txHash + chain. We fetch the receipt via the
// chain-appropriate RPC, find the USDC Transfer log going to the
// farm's derived deposit address, and check amount + confirmations.
// No client-trusted data: the chain itself is the source of truth.

import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  type Hash,
  type Hex,
} from "viem";
import { base, polygon } from "viem/chains";

import type { Env, VipChain } from "../types.ts";

const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

// USDC has 6 decimals. $1 = 1_000_000 raw units.
export const MIN_USDC_6 = 1_000_000n;

// Minimum confirmations before a receipt is considered settled.
// Receipts persist across reorgs, so checking status alone is not
// enough — a freshly mined tx that gets reorged out would otherwise
// extend VIP for a payment that never sticks.
const MIN_CONFIRMATIONS: Record<VipChain, bigint> = {
  base: 2n,
  polygon: 12n,
};

// Returns a viem PublicClient pinned to the requested chain. We don't
// type the return — Base (OP Stack) and Polygon clients have slightly
// different inferred shapes; the union of the two doesn't satisfy
// either, but every method we call below (getTransactionReceipt,
// getBlockNumber) is shared by both.
function clientFor(env: Env, chain: VipChain) {
  if (chain === "base") {
    return createPublicClient({ chain: base, transport: http(env.RPC_URL_BASE) });
  }
  return createPublicClient({
    chain: polygon,
    transport: http(env.RPC_URL_POLYGON),
  });
}

function usdcAddress(env: Env, chain: VipChain): Hex {
  const addr = chain === "base" ? env.USDC_ADDRESS_BASE : env.USDC_ADDRESS_POLYGON;
  return addr.toLowerCase() as Hex;
}

export type VerifyResult =
  | {
      ok: true;
      from: Hex;
      to: Hex;
      amount: bigint;
      blockNumber: bigint;
    }
  | {
      ok: false;
      reason:
        | "tx_not_found"
        | "tx_pending"
        | "tx_reverted"
        | "wrong_token"
        | "wrong_recipient"
        | "insufficient_amount"
        | "insufficient_confirmations";
    };

// Fetches the receipt, decodes USDC Transfer logs, and returns the
// first one matching `expectedRecipient`. Comparison is lower-case.
//
// Returns sentinel reason codes that the caller maps to HTTP status.
export async function verifyUsdcPayment(
  env: Env,
  chain: VipChain,
  txHash: string,
  expectedRecipient: Hex,
): Promise<VerifyResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, reason: "tx_not_found" };
  }
  const client = clientFor(env, chain);
  const expected = expectedRecipient.toLowerCase() as Hex;
  const usdc = usdcAddress(env, chain);

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as Hash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // viem throws when the receipt isn't available yet rather than
    // returning null. Treat any "not found" shape as pending so the
    // client retries; everything else surfaces as not_found.
    if (/not\s+found|TransactionReceiptNotFoundError/i.test(msg)) {
      return { ok: false, reason: "tx_pending" };
    }
    return { ok: false, reason: "tx_not_found" };
  }
  if (!receipt) return { ok: false, reason: "tx_pending" };
  if (receipt.status !== "success") {
    return { ok: false, reason: "tx_reverted" };
  }

  let match:
    | { from: Hex; to: Hex; amount: bigint }
    | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== usdc) continue;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) continue;
    const toTopic = log.topics[2];
    const fromTopic = log.topics[1];
    if (!toTopic || !fromTopic) continue;
    const toAddr = ("0x" + toTopic.slice(26)).toLowerCase() as Hex;
    if (toAddr !== expected) continue;
    const fromAddr = ("0x" + fromTopic.slice(26)).toLowerCase() as Hex;
    const amount = BigInt(log.data);
    match = { from: fromAddr, to: toAddr, amount };
    break;
  }
  if (!match) {
    // Was the tx a USDC transfer at all? Distinguish "wrong token" from
    // "right token, wrong recipient" so the UI can say something useful.
    const anyUsdc = receipt.logs.some(
      (l) =>
        l.address.toLowerCase() === usdc &&
        l.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase(),
    );
    return { ok: false, reason: anyUsdc ? "wrong_recipient" : "wrong_token" };
  }
  if (match.amount < MIN_USDC_6) {
    return { ok: false, reason: "insufficient_amount" };
  }

  const latest = await client.getBlockNumber();
  const need = MIN_CONFIRMATIONS[chain];
  if (latest < receipt.blockNumber || latest - receipt.blockNumber < need) {
    return { ok: false, reason: "insufficient_confirmations" };
  }

  return {
    ok: true,
    from: match.from,
    to: match.to,
    amount: match.amount,
    blockNumber: receipt.blockNumber,
  };
}
