import { NextResponse } from "next/server";
import { getEvmChain } from "@/lib/chains/config";
import { isEvmAddress } from "@/lib/chains/detect";
import { scanOnChain } from "@/lib/scan";
import { maybeRequirePayment, withX402Headers } from "@/lib/x402/protocol";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ chain: string; address: string }> },
) {
  const url = new URL(request.url);
  const gated = maybeRequirePayment(request, url.pathname);
  if (gated) return gated;

  const { chain: chainId, address } = await context.params;
  if (!isEvmAddress(address)) {
    return NextResponse.json(
      { kind: "error", error: "Address must be 0x plus 40 hex characters." },
      { status: 400 },
    );
  }
  const chain = getEvmChain(chainId);
  if (!chain) {
    return NextResponse.json(
      {
        kind: "error",
        error: `Unknown EVM chain '${chainId}'. Use ethereum, base, arbitrum, or robinhood.`,
      },
      { status: 404 },
    );
  }
  try {
    const report = await scanOnChain(address, chain.id);
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
