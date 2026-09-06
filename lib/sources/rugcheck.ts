import { asArray, asRecord, fetchJson, num, str } from "@/lib/http";

export type RugCheckKnownAccount = {
  name: string;
  type: string;
};

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
  /** RugCheck curated labels keyed by account pubkey (Streamflow Vault, AMM, etc.). */
  knownAccounts: Record<string, RugCheckKnownAccount>;
  /** Explicit locker entries when present on the report. */
  lockers: Array<{ address: string; name: string; type: string; pct?: number | null }>;
};

/** Map RugCheck known-account type/name → concentration holder tag. */
export function labelFromKnownAccount(meta: RugCheckKnownAccount | undefined): string | null {
  if (!meta) return null;
  const type = (meta.type ?? "").toUpperCase();
  const name = meta.name ?? "";
  if (
    type === "LOCKER" ||
    /streamflow|uncx|team\s*finance|goki|vest|escrow|locker|lock\b/i.test(name)
  ) {
    return name || "Protocol locker escrow";
  }
  if (type === "AMM" || /amm|pool|liquidity|raydium|orca|meteora|pump/i.test(name)) {
    const label = name || "AMM pool vault";
    if (/pool|vault|amm|liquidity|bonding/i.test(label)) return label;
    return `${label} AMM pool vault`;
  }
  if (type === "PROGRAM") {
    if (/streamflow|uncx|team\s*finance|goki|lock|vest|escrow/i.test(name)) {
      return name || "Protocol locker escrow";
    }
    return name || "Program account";
  }
  return name || null;
}

function parseKnownAccounts(root: Record<string, unknown>): Record<string, RugCheckKnownAccount> {
  const knownAccounts: Record<string, RugCheckKnownAccount> = {};
  const raw = asRecord(root.knownAccounts) ?? {};
  for (const [address, value] of Object.entries(raw)) {
    if (!address) continue;
    const meta = asRecord(value) ?? {};
    knownAccounts[address] = {
      name: str(meta.name) ?? "Known account",
      type: str(meta.type) ?? "UNKNOWN",
    };
  }
  return knownAccounts;
}

function parseLockers(
  root: Record<string, unknown>,
  knownAccounts: Record<string, RugCheckKnownAccount>,
): RugCheckReport["lockers"] {
  const lockers: RugCheckReport["lockers"] = [];
  const raw = root.lockers;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const row = asRecord(item) ?? {};
      const address = str(row.address) ?? str(row.pubkey);
      if (!address) continue;
      const name = str(row.name) ?? str(row.type) ?? "Locker";
      const type = str(row.type) ?? "LOCKER";
      lockers.push({
        address,
        name,
        type,
        pct: num(row.pct) ?? num(row.percentage) ?? null,
      });
      if (!knownAccounts[address]) {
        knownAccounts[address] = { name, type: "LOCKER" };
      }
    }
    return lockers;
  }

  const asMap = asRecord(raw);
  if (!asMap) return lockers;
  for (const [address, value] of Object.entries(asMap)) {
    if (!address) continue;
    const row = asRecord(value) ?? {};
    const name = str(row.type) ?? str(row.name) ?? "Locker";
    const type = str(row.type) ?? "LOCKER";
    lockers.push({
      address,
      name,
      type,
      pct: num(row.pct) ?? num(row.amount) ?? null,
    });
    if (!knownAccounts[address]) {
      knownAccounts[address] = { name, type: "LOCKER" };
    }
  }
  return lockers;
}

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
  const knownAccounts = parseKnownAccounts(root);
  const lockers = parseLockers(root, knownAccounts);
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
      knownAccounts,
      lockers,
    },
  };
}
