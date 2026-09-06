import { asArray, asRecord, num, str } from "@/lib/http";
import type { LpMarketInput } from "@/lib/guardian/lp-tier";
import { isPermanentPoolType } from "@/lib/guardian/lp-tier";

export type ParsedRugMarket = {
  pubkey: string | null;
  marketType: string | null;
  liquidityA: string | null;
  liquidityB: string | null;
  lpMint: string | null;
  lockedPct: number | null;
  burnedPct: number | null;
  liquidityUsd: number | null;
};

export type RugMarketParse = {
  markets: LpMarketInput[];
  parsed: ParsedRugMarket[];
  /** Account → human label for vaults / burns discovered from markets. */
  accountLabels: Map<string, string>;
};

function marketVaultLabel(marketType: string | null): string {
  const key = (marketType ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (key.includes("meteora") || key.includes("damm")) return "Meteora pool vault";
  if (key.includes("raydium")) return "Raydium pool vault";
  if (key.includes("orca") || key.includes("whirl")) return "Orca pool vault";
  if (key.includes("pump")) return "Pump.fun pool vault";
  if (key.includes("fluxbeam")) return "Fluxbeam pool vault";
  return "DEX pool vault";
}

/**
 * Read pool / LP lock state from RugCheck market rows (and nested lp objects),
 * not from the often-null top-level lpLockedPct field.
 */
export function parseRugCheckMarkets(rawMarkets: unknown[]): RugMarketParse {
  const parsed: ParsedRugMarket[] = [];
  const accountLabels = new Map<string, string>();
  const markets: LpMarketInput[] = [];

  for (const item of asArray(rawMarkets)) {
    const row = asRecord(item) ?? {};
    const lp = asRecord(row.lp) ?? {};
    const marketType = str(row.marketType) ?? str(row.market_type) ?? str(row.type);
    const pubkey = str(row.pubkey) ?? str(row.publicKey) ?? str(row.address);
    const liquidityA =
      str(row.liquidityA) ?? str(row.liquidity_a) ?? str(row.liquidityAAccount);
    const liquidityB =
      str(row.liquidityB) ?? str(row.liquidity_b) ?? str(row.liquidityBAccount);
    const lpMint =
      str(lp.lpMint) ?? str(row.mintLP) ?? str(row.lpMint) ?? str(row.mint_lp);
    const lockedPct = num(lp.lpLockedPct) ?? num(row.lpLockedPct) ?? num(lp.lockedPct);
    const permanent = isPermanentPoolType(marketType);
    // DAMM v2 often lists a burn-like lpMint for non-transferable positions — that is
    // PERMANENT, not classic LP burn. Only infer burnedPct from mint when not permanent.
    const burnedPct =
      num(lp.lpBurnedPct) ??
      num(row.lpBurnedPct) ??
      (!permanent &&
      lpMint &&
      /^1{32}$|^11111111111111111111111111111111$|^dead/i.test(lpMint)
        ? 100
        : null);
    const liquidityUsd =
      num(lp.lpLockedUSD) ??
      ((num(lp.baseUSD) ?? 0) + (num(lp.quoteUSD) ?? 0) || null);

    const vaultLabel = marketVaultLabel(marketType);
    if (liquidityA) accountLabels.set(liquidityA, vaultLabel);
    if (liquidityB) accountLabels.set(liquidityB, vaultLabel);
    if (pubkey && permanent) {
      accountLabels.set(pubkey, "Meteora DAMM v2 pool");
    }

    parsed.push({
      pubkey,
      marketType,
      liquidityA,
      liquidityB,
      lpMint,
      lockedPct,
      burnedPct: burnedPct ?? 0,
      liquidityUsd,
    });

    markets.push({
      marketType,
      lpMint,
      lockedPct,
      burnedPct: burnedPct ?? 0,
      liquidityUsd,
      lockerName: permanent ? "Meteora DAMM v2" : null,
    });
  }

  return { markets, parsed, accountLabels };
}
