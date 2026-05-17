import { lazy, Suspense, useState } from "react";

import { Button } from "../ui/index.ts";
import type { VipStatus } from "../../notifications/vipApi.ts";

// PayModal pulls in wagmi + viem + @tanstack/react-query — ~80KB
// gzipped. Lazy-load so the main bundle stays lean for users who
// never open the payment flow.
const PayModal = lazy(() => import("./PayModal.tsx"));

type Props = {
  farmId: number;
  status: VipStatus;
  onPaid: (status: VipStatus) => void;
  label?: string;
};

export function PayButton({ farmId, status, onPaid, label }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label ?? "Subscribe — $1 / 30 days"}</Button>
      {open ? (
        <Suspense fallback={null}>
          <PayModal
            open={open}
            onClose={() => setOpen(false)}
            farmId={farmId}
            status={status}
            onPaid={(s) => {
              onPaid(s);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
