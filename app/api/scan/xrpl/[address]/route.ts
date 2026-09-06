import { NextResponse } from "next/server";
import { isXrplAddress, splitXrplTokenId } from "@/lib/chains/detect";
import { scanOnChain } from "@/lib/scan";
import { maybeRequirePayment, withX402Headers } from "@/lib/x402/protocol";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> },
) {
  const url = new URL(request.url);
  const gated = maybeRequirePayment(request, url.pathname);
  if (gated) return gated;

  const { address: raw } = await context.params;
  const parsed = splitXrplTokenId(decodeURIComponent(raw));
  const address = parsed?.issuer ?? decodeURIComponent(raw);
  const currency = url.searchParams.get("currency")?.trim() || parsed?.currency;
  if (!isXrplAddress(address)) {
    return NextResponse.json(
      { kind: "error", error: "Address must be an XRPL classic address starting with r." },
      { status: 400 },
    );
  }
  try {
    const report = await scanOnChain(address, "xrpl", { currency });
    return withX402Headers(NextResponse.json(report), report);
  } catch (error) {
    return NextResponse.json(
      {
        kind: "error",
        error: error instanceof Error ? error.message : "Scan failed",
      },
      { status: 500 },
    );
  }
}
