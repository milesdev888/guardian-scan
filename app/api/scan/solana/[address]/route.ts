import { NextResponse } from "next/server";
import { isSolanaAddress } from "@/lib/chains/detect";
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

  const { address } = await context.params;
  if (!isSolanaAddress(address)) {
    return NextResponse.json(
      { kind: "error", error: "Address must be a Solana base58 mint." },
      { status: 400 },
    );
  }
  try {
    const report = await scanOnChain(address, "solana");
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
