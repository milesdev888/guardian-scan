import { AddressInput } from "@/components/scanner/address-input";
import { ScanResultView } from "@/components/scanner/report-view";
import { buttonVariants } from "@/components/ui/button";
import { detectFamily } from "@/lib/chains/detect";
import type { ScanResponse } from "@/lib/guardian/types";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  {
    label: "USDC",
    chain: "Ethereum",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    label: "BONK",
    chain: "Solana",
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  },
  {
    label: "WETH",
    chain: "Base",
    address: "0x4200000000000000000000000000000000000006",
  },
];

export function ScanForm({
  address,
  chain,
  result,
}: {
  address: string;
  chain?: string;
  result: ScanResponse | null;
}) {
  const detected = address ? detectFamily(address) : { family: null };
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-8 space-y-3">
        <p className="text-xs tracking-[0.22em] text-primary uppercase">Paste first</p>
        <h1 className="font-heading text-4xl leading-tight text-balance sm:text-5xl">
          Scan the contract. Read the patterns.
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          No chain dropdown. Paste a mint or 0x address. Base58 is Solana. 0x plus 40 hex is EVM —
          Guardian then shows every configured chain where the contract actually exists.
        </p>
      </div>

      <form action="/app" method="get" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <AddressInput defaultValue={address} />
          <button
            type="submit"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-14 shrink-0 rounded-2xl px-8 text-base sm:min-w-36",
            )}
          >
            Scan
          </button>
        </div>
        {detected.family ? (
          <p className="text-xs text-primary">
            Detected {detected.family === "evm" ? "EVM" : "Solana"}
          </p>
        ) : address ? (
          <p className="text-xs text-muted-foreground">Waiting for a complete address</p>
        ) : null}
      </form>

      <div className="mt-4">
        <p className="mb-2 text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Or scan an example
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {EXAMPLES.map((example) => (
            <a
              key={example.address}
              href={`/app?address=${encodeURIComponent(example.address)}`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl py-2.5",
              )}
            >
              <span className="text-sm font-medium text-foreground">{example.label}</span>
              <span className="text-[11px] text-muted-foreground">{example.chain}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {result?.kind === "error" ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {result.error}
          </div>
        ) : null}
        {result?.kind === "report" ? (
          <ScanResultView result={result} activeChain={chain} />
        ) : null}
        {!result ? <EmptyIntro /> : null}
      </div>
    </div>
  );
}

function EmptyIntro() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        {
          title: "One adapter, four EVM chains",
          body: "Ethereum, Base, Arbitrum, and Robinhood Chain share EvmAdapter. Chain six is config: id, RPC, explorer, DEX list.",
        },
        {
          title: "Same report on Solana",
          body: "Mint/freeze, LP lock, holders, age, and same-ticker copies land in the same grades-and-patterns layout.",
        },
        {
          title: "Agents pay over x402",
          body: "Every check is mirrored at /api/scan/evm/{chain}/{address}. Catalog is public; Bazaar listing waits on settlement.",
        },
      ].map((item) => (
        <div key={item.title} className="rounded-xl border border-border/70 bg-card/50 p-4">
          <h2 className="font-heading text-lg">{item.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
        </div>
      ))}
    </div>
  );
}
