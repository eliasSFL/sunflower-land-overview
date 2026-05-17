// wagmi config for the VIP payment flow.
//
// The WalletConnect project id is fetched from GET /vip/config at
// runtime — we don't bake it into the bundle. Config is created
// lazily so the SPA only pays the wagmi cost when the user opens the
// PayModal (which is React.lazy'd from the gate).

import { http, createConfig } from "wagmi";
import { base, polygon } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

let configPromise: Promise<ReturnType<typeof createConfig>> | null = null;

export function getWagmiConfig(): Promise<ReturnType<typeof createConfig>> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    const res = await fetch("/vip/config");
    let projectId = "";
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        walletConnectProjectId?: string;
      };
      projectId = body.walletConnectProjectId ?? "";
    }
    return createConfig({
      chains: [base, polygon],
      connectors: [
        injected(),
        ...(projectId
          ? [
              walletConnect({
                projectId,
                showQrModal: true,
              }),
            ]
          : []),
      ],
      transports: {
        [base.id]: http(),
        [polygon.id]: http(),
      },
    });
  })();
  return configPromise;
}

// Native USDC contract addresses. The Worker returns these via
// /vip/status (env-driven so testnet flips don't need a redeploy), so
// the modal always uses what the Worker thinks the address is — these
// constants are fallbacks if the status payload is missing them.
export const USDC_FALLBACK = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const,
};

export const USDC_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;
