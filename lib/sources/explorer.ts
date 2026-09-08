import { asArray, asRecord, fetchJson, flag, num, str } from "@/lib/http";
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

function isBlockscoutHost(explorerApiUrl: string): boolean {
  return /blockscout\.com/i.test(explorerApiUrl);
}

function blockscoutOrigin(explorerApiUrl: string): string {
  try {
    const u = new URL(explorerApiUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return explorerApiUrl.replace(/\/api\/?$/, "");
  }
}

/**
 * Blockscout JSON API v2 — preferred for Orbit/Robinhood where classic
 * `?module=contract&action=getsourcecode` is Cloudflare-403 HTML.
 */
async function fetchBlockscoutV2Source(
  chain: EvmChainConfig,
  address: string,
): Promise<{ data: ExplorerSource | null; error?: string }> {
  const origin = blockscoutOrigin(chain.explorerApiUrl);
  const addrUrl = `${origin}/api/v2/addresses/${encodeURIComponent(address)}`;
  const addr = await fetchJson<Record<string, unknown>>(addrUrl, {
    headers: {
      accept: "application/json",
      referer: `${origin}/`,
      "user-agent":
        "Mozilla/5.0 (compatible; GuardianScan/2.0; +https://scan.cyre.dev)",
    },
  });
  if (!addr.ok) return { data: null, error: addr.error };

  const verifiedFlag = flag(addr.data.is_verified);
  // If address payload lacks is_verified, try smart-contracts endpoint.
  if (verifiedFlag === null) {
    const scUrl = `${origin}/api/v2/smart-contracts/${encodeURIComponent(address)}`;
    const sc = await fetchJson<Record<string, unknown>>(scUrl, {
      headers: {
        accept: "application/json",
        referer: `${origin}/`,
        "user-agent":
          "Mozilla/5.0 (compatible; GuardianScan/2.0; +https://scan.cyre.dev)",
      },
    });
    if (!sc.ok) return { data: null, error: sc.error };
    const source = str(sc.data.source_code) ?? "";
    const verified =
      flag(sc.data.is_verified) ?? flag(sc.data.is_fully_verified) ?? source.length > 2;
    return {
      data: {
        verified,
        contractName: str(sc.data.name) ?? str(sc.data.file_path),
        proxy: Boolean(sc.data.proxy_type) || Boolean(asArray(sc.data.implementations).length),
        implementation: str(
          asRecord(asArray(sc.data.implementations)[0])?.address_hash,
        ),
      },
    };
  }

  return {
    data: {
      verified: verifiedFlag,
      contractName: str(addr.data.name),
      proxy: Boolean(addr.data.proxy_type) || Boolean(addr.data.implementations),
      implementation: str(addr.data.implementation_address),
    },
  };
}

async function fetchClassicExplorerSource(
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

export async function fetchExplorerSource(
  chain: EvmChainConfig,
  address: string,
): Promise<{ data: ExplorerSource | null; error?: string }> {
  // Robinhood / Blockscout Orbit: classic module API returns Cloudflare HTML 403.
  // Prefer JSON API v2 first on Blockscout hosts.
  if (isBlockscoutHost(chain.explorerApiUrl) || chain.id === "robinhood") {
    const v2 = await fetchBlockscoutV2Source(chain, address);
    if (v2.data) return v2;
    // Fall through to classic only if v2 soft-failed without hard HTTP error payload.
    if (v2.error && !/HTTP 403|Just a moment/i.test(v2.error)) {
      // try classic as secondary
    } else if (v2.error) {
      // Still try classic once; if both CF-blocked, surface the clearer error.
      const classic = await fetchClassicExplorerSource(chain, address);
      if (classic.data) return classic;
      return { data: null, error: v2.error };
    }
  }

  const classic = await fetchClassicExplorerSource(chain, address);
  if (classic.data || !isBlockscoutHost(chain.explorerApiUrl)) return classic;

  // Classic failed on Blockscout — last chance v2.
  const v2 = await fetchBlockscoutV2Source(chain, address);
  if (v2.data) return v2;
  return {
    data: null,
    error: classic.error || v2.error || "Explorer verification unavailable",
  };
}

export async function fetchExplorerCreation(
  chain: EvmChainConfig,
  address: string,
): Promise<{ data: ExplorerCreation | null; error?: string }> {
  if (isBlockscoutHost(chain.explorerApiUrl) || chain.id === "robinhood") {
    const origin = blockscoutOrigin(chain.explorerApiUrl);
    const url = `${origin}/api/v2/addresses/${encodeURIComponent(address)}`;
    const result = await fetchJson<Record<string, unknown>>(url, {
      headers: {
        accept: "application/json",
        referer: `${origin}/`,
        "user-agent":
          "Mozilla/5.0 (compatible; GuardianScan/2.0; +https://scan.cyre.dev)",
      },
    });
    if (result.ok) {
      const creator =
        str(result.data.creator_address_hash) ??
        str(asRecord(result.data.creator_address_hash)?.hash) ??
        null;
      const txHash = str(result.data.creation_tx_hash);
      const timestampRaw =
        num(result.data.creation_transaction_hash) ??
        num(asRecord(result.data.block)?.timestamp);
      // creation time often nested; leave null if absent — caller has pairCreatedAt fallback
      return {
        data: {
          creator,
          txHash,
          timestamp: timestampRaw
            ? timestampRaw < 10_000_000_000
              ? timestampRaw * 1000
              : timestampRaw
            : null,
        },
      };
    }
  }

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
