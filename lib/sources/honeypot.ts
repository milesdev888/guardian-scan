import { asRecord, fetchJson, flag, num, str } from "@/lib/http";
import type { EvmChainConfig } from "@/lib/guardian/types";

export type HoneypotSimulation = {
  isHoneypot: boolean | null;
  buyTax: number | null;
  sellTax: number | null;
  transferTax: number | null;
  buyGas: number | null;
  sellGas: number | null;
  honeypotReason: string | null;
  openSource: boolean | null;
  isProxy: boolean | null;
  holderCount: number | null;
  pairAddress: string | null;
  pairCreatedAt: number | null;
};

export async function fetchHoneypot(
  chain: EvmChainConfig,
  address: string,
): Promise<{ data: HoneypotSimulation | null; error?: string }> {
  if (chain.honeypotChainId === undefined) {
    return { data: null, error: "Honeypot.is does not list this chain" };
  }
  const url = `https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${chain.honeypotChainId}`;
  const result = await fetchJson<Record<string, unknown>>(url, { timeoutMs: 18_000 });
  if (!result.ok) return { data: null, error: result.error };

  const root = result.data;
  const simulation = asRecord(root.simulationResult);
  const contractCode = asRecord(root.contractCode);
  const token = asRecord(root.token);
  const pair = asRecord(root.pair);
  const pairInner = asRecord(pair?.pair);

  return {
    data: {
      isHoneypot: flag(root.honeypotResult ? asRecord(root.honeypotResult)?.isHoneypot : root.isHoneypot),
      buyTax: num(simulation?.buyTax),
      sellTax: num(simulation?.sellTax),
      transferTax: num(simulation?.transferTax),
      buyGas: num(simulation?.buyGas),
      sellGas: num(simulation?.sellGas),
      honeypotReason: str(root.honeypotReason) ?? str(asRecord(root.summary)?.risk),
      openSource: flag(contractCode?.openSource),
      isProxy: flag(contractCode?.isProxy),
      holderCount: num(token?.totalHolders),
      pairAddress: str(pairInner?.address),
      pairCreatedAt: num(pair?.createdAtTimestamp)
        ? Number(pair?.createdAtTimestamp) * 1000
        : null,
    },
  };
}
