import { useEffect, useMemo, useState } from "react";
import {
  WagmiProvider,
  useAccount,
  useChainId,
  useConnect,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { base, polygon } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Config } from "wagmi";

import { Button, Modal, Radio } from "../ui/index.ts";
import { getWagmiConfig, USDC_ABI } from "../../lib/wagmi.ts";
import {
  getVipStatus,
  postVipPayment,
  type VipChain,
  type VipStatus,
} from "../../notifications/vipApi.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  farmId: number;
  status: VipStatus;
  onPaid: (status: VipStatus) => void;
};

// Cache the wagmi config + a single QueryClient across modal open/close
// so the wallet connection survives. Created lazily inside the modal
// because the config fetch hits /vip/config.
let cachedConfig: Config | null = null;
const queryClient = new QueryClient();

export default function PayModal(props: Props) {
  const [config, setConfig] = useState<Config | null>(cachedConfig);

  useEffect(() => {
    if (cachedConfig) return;
    let cancelled = false;
    void getWagmiConfig().then((c) => {
      if (cancelled) return;
      cachedConfig = c;
      setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal open={props.open} onClose={props.onClose} title="Subscribe — $1 / 30 days">
      {config ? (
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <PayFlow {...props} />
          </QueryClientProvider>
        </WagmiProvider>
      ) : (
        <p className="text-sm">Loading payment…</p>
      )}
    </Modal>
  );
}

const CHAIN_NAME: Record<VipChain, string> = {
  base: "Base",
  polygon: "Polygon",
};
const CHAIN_ID: Record<VipChain, number> = {
  base: base.id,
  polygon: polygon.id,
};

type Phase =
  | "pick"
  | "connect"
  | "switch"
  | "send"
  | "submitted"
  | "success"
  | "error";

function PayFlow({ farmId, status, onPaid, onClose }: Props) {
  const [chain, setChain] = useState<VipChain>("base");
  const [phase, setPhase] = useState<Phase>("pick");
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [latest, setLatest] = useState<VipStatus>(status);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const currentChainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync, isPending: sending } = useWriteContract();

  const usdcAddress = useMemo(
    () => latest.chains[chain].usdc,
    [chain, latest],
  );
  const explorer = latest.chains[chain].explorer;
  const minAmount = BigInt(latest.chains[chain].minAmount);

  // After the tx hash is in flight, poll /vip/status until isVip flips
  // (or we hit the timeout). The Worker also accepts the txHash via
  // POST /vip/payment so we don't strictly need to poll — but the
  // payment route requires confirmations, and polling lets the UI
  // reflect the moment the chain catches up.
  useEffect(() => {
    if (phase !== "submitted" || !txHash) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = Date.now();
    const STEP_MS = 5_000;
    const TIMEOUT_MS = 5 * 60 * 1000;

    async function tick() {
      if (cancelled) return;
      try {
        const submit = await postVipPayment({ farmId, chain, txHash: txHash! });
        if (submit.ok) {
          setLatest(submit.status);
          onPaid(submit.status);
          if (!cancelled) setPhase("success");
          return;
        }
        // Terminal errors (wrong recipient/token/amount, already
        // claimed) stop the loop. Transient ones (pending,
        // insufficient confirmations) keep polling.
        const transient =
          submit.error === "tx_pending" ||
          submit.error === "insufficient_confirmations";
        if (!transient) {
          if (submit.status) setLatest(submit.status);
          setErrorMsg(submit.error);
          if (!cancelled) setPhase("error");
          return;
        }
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Network error");
      }
      if (Date.now() - start > TIMEOUT_MS) {
        if (!cancelled) {
          setErrorMsg(
            "Still waiting for the chain. Your payment will be applied once it confirms — close this and reopen Notifications later.",
          );
          setPhase("error");
        }
        return;
      }
      // Cheap cross-check so the badge reflects any state change even
      // if Worker doesn't accept the txHash yet (e.g. another tab paid).
      try {
        const fresh = await getVipStatus(farmId);
        if (!cancelled && fresh.expiresAt !== latest.expiresAt) {
          setLatest(fresh);
          if (fresh.isVip) {
            onPaid(fresh);
            setPhase("success");
            return;
          }
        }
      } catch {
        // ignore, keep polling
      }
      timer = setTimeout(tick, STEP_MS);
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, txHash, chain, farmId]);

  async function onPay() {
    setErrorMsg(undefined);
    try {
      if (!isConnected) {
        setPhase("connect");
        const connector = connectors[0];
        if (!connector) {
          setErrorMsg("No wallet connector available.");
          setPhase("error");
          return;
        }
        await new Promise<void>((resolve, reject) => {
          connect(
            { connector },
            {
              onSuccess: () => resolve(),
              onError: (e) => reject(e),
            },
          );
        });
      }
      const targetChainId = CHAIN_ID[chain];
      if (currentChainId !== targetChainId) {
        setPhase("switch");
        await switchChainAsync({ chainId: targetChainId });
      }
      setPhase("send");
      const hash = await writeContractAsync({
        abi: USDC_ABI,
        address: usdcAddress,
        functionName: "transfer",
        args: [latest.depositAddress, minAmount],
        chainId: targetChainId,
      });
      setTxHash(hash);
      setPhase("submitted");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Transaction failed");
      setPhase("error");
    }
  }

  const cta =
    phase === "connect" || connecting
      ? "Connecting wallet…"
      : phase === "switch" || switching
        ? `Switching to ${CHAIN_NAME[chain]}…`
        : phase === "send" || sending
          ? "Confirm in wallet…"
          : phase === "submitted"
            ? "Waiting for confirmations…"
            : phase === "success"
              ? "Done"
              : "Pay $1 USDC";

  const disabled =
    phase === "connect" ||
    phase === "switch" ||
    phase === "send" ||
    phase === "submitted" ||
    connecting ||
    switching ||
    sending;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Pays $1 USDC to{" "}
        <code className="break-all text-xs">{latest.depositAddress}</code>.
        Same address on Base and Polygon. Extends VIP by 30 days from
        current expiry.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-semibold">Network</legend>
        {(["base", "polygon"] as const).map((c) => (
          <label
            key={c}
            className={`flex items-center gap-2 ${
              disabled ? "opacity-60" : "cursor-pointer"
            }`}
          >
            <Radio
              checked={chain === c}
              onChange={() => setChain(c)}
              disabled={disabled}
            />
            <span>{CHAIN_NAME[c]}</span>
          </label>
        ))}
      </fieldset>

      {address ? (
        <p className="text-xs">
          Wallet: <code className="break-all">{address}</code>
        </p>
      ) : null}

      {txHash ? (
        <p className="text-xs">
          Tx:{" "}
          <a
            href={`${explorer}${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {txHash.slice(0, 10)}…{txHash.slice(-6)}
          </a>
        </p>
      ) : null}

      {errorMsg ? <p className="text-sm text-red-700">{errorMsg}</p> : null}

      <div className="flex gap-2">
        {phase === "success" ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onPay} disabled={disabled}>
              {cta}
            </Button>
            <Button onClick={onClose} disabled={sending}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
