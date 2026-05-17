/// <reference types="@cloudflare/workers-types" />

// Per-farm USDC deposit address derivation.
//
// Master seed lives in env.OVERVIEW_VIP_MASTER_SEED as a BIP-39
// mnemonic. We derive m/44'/60'/0'/0/<farmId>. farmId is a uint32 and
// fits the non-hardened child index. The Worker never signs — these
// addresses are receive-only — but the seed *can* sweep funds, so it
// must be backed up offline.
//
// Both @scure/bip32 and @scure/bip39 are pure JS and work in Workers
// with `nodejs_compat`. viem's privateKeyToAddress hashes the pubkey.

import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { privateKeyToAddress } from "viem/accounts";

import type { Env } from "../types.ts";

let rootCache: HDKey | null = null;

function root(env: Env): HDKey {
  if (rootCache) return rootCache;
  const mnemonic = env.OVERVIEW_VIP_MASTER_SEED?.trim();
  if (!mnemonic) {
    throw new Error("OVERVIEW_VIP_MASTER_SEED not configured");
  }
  const seed = mnemonicToSeedSync(mnemonic);
  rootCache = HDKey.fromMasterSeed(seed);
  return rootCache;
}

export function depositAddress(env: Env, farmId: number): `0x${string}` {
  if (!Number.isInteger(farmId) || farmId < 0 || farmId > 0x7fffffff) {
    throw new Error(`Invalid farmId for derivation: ${farmId}`);
  }
  const child = root(env).derive(`m/44'/60'/0'/0/${farmId}`);
  if (!child.privateKey) throw new Error("HD derivation produced no key");
  const hex = Array.from(child.privateKey, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return privateKeyToAddress(`0x${hex}`);
}
