import type { Copycat, Family } from "@/lib/guardian/types";
import { fetchDexSearch, type DexPair } from "@/lib/sources/dexscreener";

function sameTicker(a: string | null | undefined, b: string) {
  return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

function sameAddress(a: string, b: string, family?: Family) {
  if (family === "xrpl") {
    return a === b || a.includes(b) || b.includes(a);
  }
  return a.toLowerCase() === b.toLowerCase();
}

export async function findCopycats(options: {
  ticker: string;
  chainId: string;
  chainName: string;
  dexScreenerChain: string;
  excludeAddress: string;
  family?: Family;
}): Promise<{ copycats: Copycat[]; error?: string }> {
  const ticker = options.ticker.trim();
  if (!ticker) return { copycats: [] };

  const { pairs, error } = await fetchDexSearch(ticker);
  if (error) return { copycats: [], error };

  const sameChain = pairs.filter((pair) => {
    if (pair.chainId.toLowerCase() !== options.dexScreenerChain.toLowerCase()) {
      return false;
    }
    const token = tokenSide(pair, ticker);
    if (!token) return false;
    return !sameAddress(token.address, options.excludeAddress, options.family);
  });

  const unique = new Map<string, DexPair>();
  for (const pair of sameChain) {
    const token = tokenSide(pair, ticker);
    if (!token) continue;
    const key = options.family === "xrpl" ? token.address : token.address.toLowerCase();
    const existing = unique.get(key);
    if (!existing || (pair.liquidityUsd ?? 0) > (existing.liquidityUsd ?? 0)) {
      unique.set(key, pair);
    }
  }

  const rows = [...unique.values()];
  const oldest = [...rows].sort(
    (a, b) => (a.pairCreatedAt ?? Number.MAX_SAFE_INTEGER) - (b.pairCreatedAt ?? Number.MAX_SAFE_INTEGER),
  )[0];
  const deepest = [...rows].sort(
    (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0),
  )[0];

  const copycats: Copycat[] = [];
  for (const pair of rows) {
    const token = tokenSide(pair, ticker);
    if (!token) continue;
    const flags: Copycat["flags"] = ["same-chain"];
    if (oldest && pair.pairAddress === oldest.pairAddress) flags.push("oldest");
    if (deepest && pair.pairAddress === deepest.pairAddress) flags.push("deepest");
    copycats.push({
      address: token.address,
      name: token.name,
      symbol: token.symbol ?? ticker,
      chainId: options.chainId,
      chainName: options.chainName,
      pairAddress: pair.pairAddress,
      dex: pair.dexId,
      liquidityUsd: pair.liquidityUsd,
      createdAt: pair.pairCreatedAt,
      flags,
      url: pair.url,
    });
  }

  copycats.sort((a, b) => {
    const aRank =
      (a.flags.includes("oldest") ? 2 : 0) + (a.flags.includes("deepest") ? 1 : 0);
    const bRank =
      (b.flags.includes("oldest") ? 2 : 0) + (b.flags.includes("deepest") ? 1 : 0);
    if (bRank !== aRank) return bRank - aRank;
    return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
  });

  return { copycats: copycats.slice(0, 8) };
}

function tokenSide(pair: DexPair, ticker: string) {
  if (sameTicker(pair.baseToken.symbol, ticker)) return pair.baseToken;
  if (sameTicker(pair.quoteToken.symbol, ticker)) return pair.quoteToken;
  return null;
}
