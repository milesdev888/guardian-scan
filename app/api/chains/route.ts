import { NextResponse } from "next/server";
import { listPublicChains } from "@/lib/chains/config";

export async function GET() {
  return NextResponse.json({
    adapter: "ChainAdapter",
    implementations: ["SolanaAdapter", "EvmAdapter"],
    note: "Adding another EVM chain is a config object: chain id, RPC, explorer, DEX list.",
    chains: listPublicChains(),
  });
}
