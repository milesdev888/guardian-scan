import { runScan } from "@/lib/scan";
import { ScanForm } from "@/components/scanner/scan-form";
import type { ScanResponse } from "@/lib/guardian/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const params = await searchParams;
  const rawAddress = readParam(params.address);
  const address = rawAddress?.trim() ?? "";
  const chain = readParam(params.chain);
  const currency = readParam(params.currency);

  let result: ScanResponse | null = null;
  if (rawAddress !== undefined && address === "") {
    result = { kind: "error", error: "Paste a contract or mint address." };
  } else if (address) {
    result = await runScan({ address, chain, currency });
  }

  return (
    <div className="px-4 py-10 sm:py-14">
      <ScanForm address={address} chain={chain} result={result} />
    </div>
  );
}
