import type { Metadata } from "next";
import { runScan } from "@/lib/scan";
import { ScanForm } from "@/components/scanner/scan-form";
import type { ScanResponse } from "@/lib/guardian/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function scanOrigin() {
  return (
    process.env.NEXT_PUBLIC_SCAN_ORIGIN ||
    process.env.SCAN_PUBLIC_ORIGIN ||
    "https://scan.cyre.dev"
  ).replace(/\/$/, "");
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const address = readParam(params.address)?.trim() ?? "";
  const origin = scanOrigin();

  if (!address) {
    return {
      title: "Guardian — Multichain Scan",
      description:
        "Paste-first token scanner for Solana, Ethereum, Base, Arbitrum, Robinhood Chain, and XRPL.",
    };
  }

  const reportUrl = `${origin}/app?address=${encodeURIComponent(address)}`;
  // Compressed OG card (~1024px, under 300KB). Full card remains at /api/card/<mint>.png
  const ogImage = `${origin}/api/card/${encodeURIComponent(address)}/og.png`;
  const title = "Guardian scan report";
  const description = "Scanned with Guardian — grades and on-chain patterns, not a verdict.";

  return {
    title,
    description,
    alternates: { canonical: reportUrl },
    openGraph: {
      type: "website",
      siteName: "Guardian",
      title,
      description,
      url: reportUrl,
      images: [
        {
          url: ogImage,
          width: 1024,
          height: 683,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
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
