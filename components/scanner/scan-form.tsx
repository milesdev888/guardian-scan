import { AddressInput } from "@/components/scanner/address-input";
import { ChainBillboard } from "@/components/scanner/chain-billboard";
import { ScanResultView } from "@/components/scanner/report-view";
import { buttonVariants } from "@/components/ui/button";
import { detectFamily } from "@/lib/chains/detect";
import type { ScanResponse, XrplIssuance } from "@/lib/guardian/types";
import { cn } from "@/lib/utils";

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
  const familyLabel =
    detected.family === "evm" ? "EVM" : detected.family === "xrpl" ? "XRPL" : detected.family === "solana" ? "Solana" : null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-8 space-y-3">
        <p className="text-xs tracking-[0.22em] text-primary uppercase">Paste first</p>
        <h1 className="font-heading text-4xl leading-tight text-balance sm:text-5xl">
          Scan the contract. Read the patterns.
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          No chain dropdown. Paste a mint, 0x address, or XRPL classic address starting with r. Base58 is
          Solana. 0x plus 40 hex is EVM. r… with a valid checksum is XRPL.
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
        {familyLabel ? (
          <p className="text-xs text-primary">Detected {familyLabel}</p>
        ) : address ? (
          <p className="text-xs text-muted-foreground">Waiting for a complete address</p>
        ) : null}
      </form>

      <div className="mt-5">
        <ChainBillboard />
      </div>

      <div className="mt-8">
        {result?.kind === "error" ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {result.error}
          </div>
        ) : null}
        {result?.kind === "xrpl-issuances" ? (
          <IssuancePicker address={result.address} issuances={result.issuances} message={result.message} />
        ) : null}
        {result?.kind === "report" ? (
          <ScanResultView result={result} activeChain={chain} />
        ) : null}
        {!result ? <EmptyIntro /> : null}
      </div>
    </div>
  );
}

function IssuancePicker({
  address,
  issuances,
  message,
}: {
  address: string;
  issuances: XrplIssuance[];
  message: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4">
      <h2 className="font-heading text-xl">This issuer lists multiple currencies</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{address}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {issuances.map((row) => {
          const params = new URLSearchParams();
          params.set("address", address);
          params.set("currency", row.display);
          return (
            <a
              key={row.currency}
              href={`/app?${params.toString()}`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-auto min-h-12 flex-col items-start rounded-xl px-3 py-2",
              )}
            >
              <span className="text-sm font-medium">{row.display}</span>
              <span className="text-[11px] text-muted-foreground">obligation {row.value}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function EmptyIntro() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        {
          title: "One paste box, six chains",
          body: "Solana, Ethereum, Base, Arbitrum, Robinhood Chain, and XRPL. The row under the box is a billboard — it never gates the scan.",
        },
        {
          title: "XRPL is not EVM",
          body: "No bytecode. Guardian reads issuer flags, TransferRate, trust lines, Domain.toml, and XLS-30 AMM pools from public nodes.",
        },
        {
          title: "Agents pay over x402",
          body: "Every check is mirrored at /api/scan/evm/{chain}/{address}, /api/scan/solana/{address}, and /api/scan/xrpl/{issuer}.",
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
