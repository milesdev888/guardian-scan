import { createHash } from "node:crypto";
import { getChain } from "@/lib/chains";
import { fetchJson } from "@/lib/http";
import type { CheckResult } from "@/lib/guardian/types";

function cacheSeconds(chainId: string): number {
  return getChain(chainId)?.cacheSeconds.explorer ?? 86_400;
}

/** Coerce explorer timestamps; reject nonsense (hashes, floats that aren't epoch). */
export function sanitizeTimestampMs(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const t = raw.trim();
    if (!t || /^0x/i.test(t) || /[a-f]/i.test(t)) return null;
    n = Number(t);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  // seconds vs ms
  if (n < 1e12) n *= 1000;
  // Jan 2015 .. now+1d
  if (n < 1_420_070_400_000 || n > Date.now() + 86_400_000) return null;
  return Math.floor(n);
}

export function parseExplorerTimestamp(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const result = o.result;
  if (typeof result === "string" || typeof result === "number") {
    return sanitizeTimestampMs(result);
  }
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    return (
      sanitizeTimestampMs(r.timestamp) ??
      sanitizeTimestampMs(r.timeStamp) ??
      sanitizeTimestampMs(r.creation_timestamp) ??
      sanitizeTimestampMs(r.block_timestamp)
    );
  }
  return (
    sanitizeTimestampMs(o.timestamp) ??
    sanitizeTimestampMs(o.timeStamp) ??
    sanitizeTimestampMs(o.creation_timestamp)
  );
}

async function getblockrewardTimestamp(
  base: string,
  blockNumber: number | string,
  cacheSec: number,
): Promise<number | null> {
  const bn = typeof blockNumber === "string" ? blockNumber.replace(/^0x/i, "") : String(blockNumber);
  if (!/^\d+$/.test(bn)) return null;
  try {
    const reward = await fetchJson<{ result?: { timeStamp?: string } }>(
      `${base}?module=block&action=getblockreward&blockno=${bn}`,
      { cacheTtlSeconds: cacheSec, timeoutMs: 12_000 },
    );
    return sanitizeTimestampMs(reward.result?.timeStamp);
  } catch {
    return null;
  }
}

async function resolveBlockscoutCreation(
  base: string,
  address: string,
  cacheSec: number,
): Promise<number | null> {
  try {
    const data = await fetchJson<{
      creation_transaction_hash?: string;
      creation_status?: string;
      creation_transaction?: { timestamp?: string; block_number?: number };
      block_number?: number | null;
    }>(`${base}/api/v2/addresses/${address}`, {
      cacheTtlSeconds: cacheSec,
      timeoutMs: 12_000,
    });

    const nested = sanitizeTimestampMs(data.creation_transaction?.timestamp);
    if (nested) return nested;

    const txHash = data.creation_transaction_hash;
    if (typeof txHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      try {
        const tx = await fetchJson<{ timestamp?: string; block?: number }>(
          `${base}/api/v2/transactions/${txHash}`,
          { cacheTtlSeconds: cacheSec, timeoutMs: 12_000 },
        );
        const fromTx = sanitizeTimestampMs(tx.timestamp);
        if (fromTx) return fromTx;
        if (tx.block != null) {
          const fromBlock = await getblockrewardTimestamp(base, tx.block, cacheSec);
          if (fromBlock) return fromBlock;
        }
      } catch {
        /* fall through */
      }
    }

    if (data.creation_transaction?.block_number != null) {
      const fromCreationBlock = await getblockrewardTimestamp(
        base,
        data.creation_transaction.block_number,
        cacheSec,
      );
      if (fromCreationBlock) return fromCreationBlock;
    }

    if (data.block_number != null) {
      return getblockrewardTimestamp(base, data.block_number, cacheSec);
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchExplorerCreation(
  chainId: string,
  address: string,
): Promise<CheckResult | null> {
  const chain = getChain(chainId);
  if (!chain?.explorerApi) return null;
  const cacheSec = cacheSeconds(chainId);
  const base = chain.explorerApi.replace(/\/$/, "");

  try {
    if (chain.explorerKind === "blockscout") {
      const ts = await resolveBlockscoutCreation(base, address, cacheSec);
      if (ts == null) return null;
      return {
        id: "contract_age",
        status: "pass",
        score: 1,
        evidence: { createdAt: new Date(ts).toISOString(), source: "blockscout" },
        summary: "Contract creation time from Blockscout",
      };
    }

    const url = `${base}?module=contract&action=getcontractcreation&contractaddresses=${address}`;
    const data = await fetchJson<{ result?: Array<{ timestamp?: string; timeStamp?: string; blockNumber?: string }> }>(
      url,
      { cacheTtlSeconds: cacheSec, timeoutMs: 12_000 },
    );
    const row = data.result?.[0];
    if (!row) return null;
    let ts =
      sanitizeTimestampMs(row.timestamp) ?? sanitizeTimestampMs(row.timeStamp);
    if (ts == null && row.blockNumber) {
      ts = await getblockrewardTimestamp(base, row.blockNumber, cacheSec);
    }
    if (ts == null) return null;
    return {
      id: "contract_age",
      status: "pass",
      score: 1,
      evidence: { createdAt: new Date(ts).toISOString(), source: "etherscan-compat" },
      summary: "Contract creation time from explorer",
    };
  } catch {
    return null;
  }
}

export async function fetchExplorerTxCount(
  chainId: string,
  address: string,
): Promise<CheckResult | null> {
  const chain = getChain(chainId);
  if (!chain?.explorerApi) return null;
  const cacheSec = cacheSeconds(chainId);
  try {
    const base = chain.explorerApi.replace(/\/$/, "");
    let count = 0;
    if (chain.explorerKind === "blockscout") {
      const data = await fetchJson<{ transactions_count?: number }>(`${base}/api/v2/addresses/${address}`, {
        cacheTtlSeconds: Math.min(cacheSec, 3600),
        timeoutMs: 12_000,
      });
      count = Number(data.transactions_count ?? 0);
    } else {
      const url = `${base}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=asc`;
      const data = await fetchJson<{ result?: unknown[] }>(url, {
        cacheTtlSeconds: Math.min(cacheSec, 3600),
        timeoutMs: 12_000,
      });
      count = Array.isArray(data.result) ? data.result.length : 0;
    }
    return {
      id: "tx_activity",
      status: count > 0 ? "pass" : "warn",
      score: count > 10 ? 1 : count > 0 ? 0.6 : 0.2,
      evidence: { sampleSize: count },
      summary: count > 0 ? "On-chain transaction history present" : "No transactions indexed",
    };
  } catch {
    return null;
  }
}

export function fingerprintSources(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}
