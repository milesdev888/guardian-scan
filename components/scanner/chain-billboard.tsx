"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChainExample = {
  label: string;
  address: string;
  currency?: string;
  hint?: string;
};

export const CHAIN_BILLBOARD: Array<{
  id: string;
  label: string;
  hint: string;
  examples: ChainExample[];
}> = [
  {
    id: "solana",
    label: "SOLANA",
    hint: "Base58 mint, 32–44 characters. No 0x prefix.",
    examples: [
      {
        label: "C7",
        address: "979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww",
      },
      {
        label: "BONK",
        address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      },
    ],
  },
  {
    id: "ethereum",
    label: "ETHEREUM",
    hint: "0x plus 40 hex characters. Guardian then probes every configured EVM chain.",
    examples: [
      {
        label: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      },
    ],
  },
  {
    id: "base",
    label: "BASE",
    hint: "Same 0x format as Ethereum. Detection is the address, not this row.",
    examples: [
      {
        label: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      },
    ],
  },
  {
    id: "arbitrum",
    label: "ARBITRUM",
    hint: "Same 0x format. Paste first — this chip never filters the box.",
    examples: [
      {
        label: "USDC",
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      },
    ],
  },
  {
    id: "robinhood",
    label: "ROBINHOOD CHAIN",
    hint: "Chain 4663. Still a 0x contract address.",
    examples: [],
  },
  {
    id: "xrpl",
    label: "XRPL",
    hint: "Classic address starting with r (25–35 characters, checksummed). Tokens are a currency + issuer pair.",
    examples: [
      {
        label: "RLUSD",
        address: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
        currency: "RLUSD",
        hint: "Ripple USD issuer",
      },
      {
        label: "Bitstamp USD",
        address: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
        currency: "USD",
        hint: "Known issuer address",
      },
    ],
  },
];

function exampleHref(example: ChainExample) {
  const params = new URLSearchParams();
  params.set("address", example.address);
  if (example.currency) params.set("currency", example.currency);
  return `/app?${params.toString()}`;
}

export function ChainBillboard() {
  const [active, setActive] = useState<string | null>(null);
  const selected = CHAIN_BILLBOARD.find((row) => row.id === active) ?? null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        Chains · discoverability only
      </p>
      <div className="flex flex-wrap gap-x-1 gap-y-2 text-[11px] tracking-[0.14em] sm:text-xs">
        {CHAIN_BILLBOARD.map((chain, index) => (
          <span key={chain.id} className="inline-flex items-center">
            {index > 0 ? (
              <span className="px-1.5 text-muted-foreground/50" aria-hidden>
                ·
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setActive((current) => (current === chain.id ? null : chain.id))}
              className={cn(
                "rounded-md px-1.5 py-0.5 tracking-[0.14em] transition-colors",
                active === chain.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {chain.label}
            </button>
          </span>
        ))}
      </div>
      {selected ? (
        <div className="rounded-xl border border-border/70 bg-card/40 px-3 py-3">
          <p className="text-xs text-muted-foreground">{selected.hint}</p>
          {selected.examples.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.examples.map((example) => (
                <a
                  key={`${example.address}:${example.currency ?? ""}`}
                  href={exampleHref(example)}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "h-auto min-h-10 flex-col items-start gap-0 rounded-xl px-3 py-1.5",
                  )}
                >
                  <span className="text-sm font-medium text-foreground">{example.label}</span>
                  {example.hint ? (
                    <span className="text-[11px] text-muted-foreground">{example.hint}</span>
                  ) : null}
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No featured example yet — paste any 0x contract on this chain.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
