import { asArray, asRecord, fetchJson, num, str } from "@/lib/http";
import type { EvmChainConfig } from "@/lib/guardian/types";

export type ExplorerSource = {
  verified: boolean | null;
  contractName: string | null;
  proxy: boolean | null;
  implementation: string | null;
};

export type ExplorerCreation = {
  creator: string | null;
  txHash: string | null;
  timestamp: number | null;
};

export async function fetchExplorerSource(
  chain: EvmChainConfig,
  address: string,
): Promise<{ data: ExplorerSource | null; error?: string }> {
  const url = `${chain.explorerApiUrl}?module=contract&action=getsourcecode&address=${address}`;
  const result = await fetchJson<Record<string, unknown>>(url);
  if (!result.ok) return { data: null, error: result.error };
  const row = asRecord(asArray(result.data.result)[0]) ?? asRecord(result.data.result);
  if (!row) return { data: null, error: "Explorer returned no source payload" };
  const source = str(row.SourceCode) ?? "";
  const verified = source.length > 2;
  const proxyFlag =
    str(row.Proxy) === "1" || str(row.IsProxy) === "1" || Boolean(str(row.Implementation));
  return {
    data: {
      verified,
      contractName: str(row.ContractName),
      proxy: proxyFlag,
      implementation: str(row.Implementation),
    },
  };
}

export async function fetchExplorerCreation(
  chain: EvmChainConfig,
  address: string,
): Promise<{ data: ExplorerCreation | null; error?: string }> {
  const url = `${chain.explorerApiUrl}?module=contract&action=getcontractcreation&contractaddresses=${address}`;
  const result = await fetchJson<Record<string, unknown>>(url);
  if (!result.ok) return { data: null, error: result.error };
  const row = asRecord(asArray(result.data.result)[0]) ?? asRecord(result.data.result);
  if (!row) return { data: null, error: "Explorer returned no creation payload" };
  const timestamp = num(row.timestamp) ?? num(row.timeStamp);
  return {
    data: {
      creator: str(row.contractCreator) ?? str(row.creatorAddress),
      txHash: str(row.txHash) ?? str(row.txnHash),
      timestamp: timestamp ? (timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp) : null,
    },
  };
}

export async function fetchFirstTransactionTime(
  chain: EvmChainConfig,
  address: string,
): Promise<{ timestamp: number | null; error?: string }> {
  const url = `${chain.explorerApiUrl}?module=account&action=txlist&address=${address}&page=1&offset=1&sort=asc`;
  const result = await fetchJson<Record<string, unknown>>(url);
  if (!result.ok) return { timestamp: null, error: result.error };
  const row = asRecord(asArray(result.data.result)[0]);
  if (!row) return { timestamp: null, error: "No transactions" };
  const timestamp = num(row.timeStamp) ?? num(row.timestamp);
  if (!timestamp) return { timestamp: null };
  return { timestamp: timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp };
}
