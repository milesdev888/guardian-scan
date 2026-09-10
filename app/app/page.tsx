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

function cardOgUrl(origin: string, address: string, scanId?: string | null) {
  const base = `${origin}/api/card/${encodeURIComponent(address)}/og.png`;
  if (scanId) return `${base}?s=${encodeURIComponent(scanId)}`;
  return base;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const address = readParam(params.address)?.trim() ?? "";
  const scanIdParam = readParam(params.s)?.trim() || readParam(params.scanId)?.trim() || "";
  const chain = readParam(params.chain);
  const currency = readParam(params.currency);
  const origin = scanOrigin();

  if (!address) {
    return {
      title: "Guardian — Multichain Scan",
      description:
        "Paste-first token scanner for Solana, Ethereum, Base, Arbitrum, Robinhood Chain, and XRPL.",
    };
  }

  let scanId = scanIdParam;
  let gradeLabel = "";
  try {
    const result = await runScan({ address, chain, currency });
    if (result.kind === "report" && result.reports[0]) {
      const report =
        (chain && result.reports.find((r) => r.chain.id === chain)) || result.reports[0];
      scanId = scanId || report.scanId || "";
      if (report.grade && typeof report.score === "number") {
        gradeLabel = `Grade ${report.grade} · ${Math.round(report.score)}/100. `;
      }
    }
  } catch {
    // Metadata must not fail the page — fall back to mint-only OG.
  }

  const reportUrl = scanId
    ? `${origin}/app?address=${encodeURIComponent(address)}&s=${encodeURIComponent(scanId)}`
    : `${origin}/app?address=${encodeURIComponent(address)}`;
  const ogImage = cardOgUrl(origin, address, scanId || null);
  const title = "Guardian scan report";
  const description = `${gradeLabel}Scanned with Guardian — grades and on-chain patterns, not a verdict.`;

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
  if (address) {
    result = await runScan({ address, chain, currency });
  }

  return <ScanForm address={address} chain={chain} result={result} />;
}
