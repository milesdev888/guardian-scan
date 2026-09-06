import { NextResponse } from "next/server";
import { listPublicChains } from "@/lib/chains/config";

export async function GET() {
  return NextResponse.json({
    adapter: "ChainAdapter",
    implementations: ["SolanaAdapter", "EvmAdapter", "XRPLAdapter"],
    note: "Adding another EVM chain is a config object. XRPL is a third adapter — paste an r-address, no dropdown.",
    chains: listPublicChains(),
  });
}
