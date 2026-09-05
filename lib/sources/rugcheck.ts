import { asArray, asRecord, fetchJson, num, str } from "@/lib/http";

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
  topHolders: Array<{ address?: string; pct?: number; insider?: boolean }>;
  totalHolders: number | null;
  lpLockedPct: number | null;
  markets: unknown[];
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
      pct: num(row.pct) ?? num(row.percentage) ?? undefined,
      insider: Boolean(row.insider),
    };
  });
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
      lpLockedPct: num(lp?.lpLockedPct) ?? num(root.lpLockedPct),
      markets,
      detectedAt: num(root.detectedAt) ?? num(root.createdAt),
    },
  };
}
