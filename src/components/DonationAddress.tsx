import { useEffect, useRef, useState } from "react";

import { Label } from "./ui/Label.tsx";

type Props = {
  address: string;
  // How many leading/trailing chars to keep when truncating. The middle
  // gets replaced with an ellipsis. 6/4 mirrors upstream's
  // `shortAddress()` formatting for EVM addresses.
  head?: number;
  tail?: number;
};

function truncate(address: string, head: number, tail: number): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function DonationAddress({ address, head = 6, tail = 4 }: Props) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Clipboard API rejects on insecure contexts / permission denial.
      // The visual feedback would be misleading, so bail silently.
      return;
    }
    setCopied(true);
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="relative">
      <span
        role="button"
        tabIndex={0}
        onClick={handleCopy}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleCopy();
          }
        }}
        title={`Copy donation address: ${address}`}
        className="cursor-pointer whitespace-nowrap text-sm text-white text-shadow underline decoration-dotted underline-offset-2 hover:opacity-80"
      >
        <span className="no-underline">Donate: </span>
        <span className="sm:hidden">{truncate(address, head, tail)}</span>
        <span className="hidden sm:inline">{address}</span>
      </span>
      {/* Floating "Copied" toast — absolute so it doesn't shift the
          header layout when it appears. Right-anchored to match the
          right-aligned header stack. */}
      <span
        aria-hidden={!copied}
        className={`pointer-events-none absolute top-full right-0 mt-1 transition-opacity duration-200 ${
          copied ? "opacity-100" : "opacity-0"
        }`}
      >
        <Label type="success">Copied!</Label>
      </span>
    </span>
  );
}
