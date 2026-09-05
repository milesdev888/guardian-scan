import { asArray, asRecord, fetchJson, num, str } from "@/lib/http";
import type { KnownAccount } from "@/lib/guardian/accounts";

export type RugCheckReport = {
  mint: string | null;
  tokenMeta: {
    name: string | null;
    symbol: string | null;
    mutable?: boolean;
  };
  mintAuthority: string | null;
  freezeAuthority: string | null;
  deployer: string | null;
  score: number | null;
  risks: Array<{ name: string; level?: string; description?: string }>;
  topHolders: Array<{
    address?: string;
    owner?: string;
    pct?: number;
    insider?: boolean;
  }>;
  totalHolders: number | null;
  /** Root-level aggregate when present; prefer per-market lpLockedPct. */
  lpLockedPct: number | null;
  markets: unknown[];
  knownAccounts: Record<string, KnownAccount>;
  lockers: Record<string, { programID?: string; type?: string; unlockDate?: number }>;
  detectedAt: number | null;
};

export async function fetchRugCheck(
  mint: string,
): Promise<{ data: RugCheckReport | null; error?: string }> {
  const url = `https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(mint)}/report`;
  const result = await fetchJson<Record<string, unknown>>(url, { timeoutMs: 16_000 });
  if (!result.ok) return { data: null, error: result.error };
  const root = result.data;
  const tokenMeta = asRecord(root.tokenMeta) ?? asRecord(root.fileMeta) ?? {};
  const token = asRecord(root.token);
  const markets = asArray(root.markets);
  const risks = asArray(root.risks).map((item) => {
    const row = asRecord(item) ?? {};
    return {
      name: str(row.name) ?? str(row.level) ?? "risk",
      level: str(row.level) ?? undefined,
      description: str(row.description) ?? undefined,
    };
  });
  const topHolders = asArray(root.topHolders).map((item) => {
    const row = asRecord(item) ?? {};
    return {
      address: str(row.address) ?? str(row.owner) ?? undefined,
      owner: str(row.owner) ?? undefined,
      pct: num(row.pct) ?? num(row.percentage) ?? undefined,
      insider: Boolean(row.insider),
    };
  });

  const knownAccounts: Record<string, KnownAccount> = {};
  const knownRaw = asRecord(root.knownAccounts) ?? {};
  for (const [address, value] of Object.entries(knownRaw)) {
    const row = asRecord(value) ?? {};
    knownAccounts[address] = {
      name: str(row.name),
      type: str(row.type),
    };
  }

  const lockers: RugCheckReport["lockers"] = {};
  const lockersRaw = asRecord(root.lockers) ?? {};
  for (const [key, value] of Object.entries(lockersRaw)) {
    const row = asRecord(value) ?? {};
    lockers[key] = {
      programID: str(row.programID) ?? undefined,
      type: str(row.type) ?? undefined,
      unlockDate: num(row.unlockDate) ?? undefined,
    };
  }

  // Prefer deepest market's lock % — root `lp` is often null for Meteora DAMM v2.
  let marketLocked: number | null = null;
  let deepestUsd = -1;
  for (const item of markets) {
    const row = asRecord(item);
    const lp = asRecord(row?.lp);
    if (!lp) continue;
    const usd = (num(lp.quoteUSD) ?? 0) + (num(lp.baseUSD) ?? 0);
    const locked = num(lp.lpLockedPct);
    if (usd >= deepestUsd && locked != null) {
      deepestUsd = usd;
      marketLocked = locked;
    }
  }

  const lp = asRecord(root.lp);
  return {
    data: {
      mint: str(root.mint) ?? mint,
      tokenMeta: {
        name: str(tokenMeta.name) ?? str(token?.name),
        symbol: str(tokenMeta.symbol) ?? str(token?.symbol),
        mutable: tokenMeta.mutable === true || tokenMeta.mutable === "true",
      },
      mintAuthority: str(root.mintAuthority) ?? str(token?.mintAuthority),
      freezeAuthority: str(root.freezeAuthority) ?? str(token?.freezeAuthority),
      deployer: str(root.creator) ?? str(root.deployer),
      score: num(root.score) ?? num(root.tokenProgram),
      risks,
      topHolders,
      totalHolders: num(root.totalHolders),
      lpLockedPct: marketLocked ?? num(lp?.lpLockedPct) ?? num(root.lpLockedPct),
      markets,
      knownAccounts,
      lockers,
      detectedAt: num(root.detectedAt) ?? num(root.createdAt),
    },
  };
}
