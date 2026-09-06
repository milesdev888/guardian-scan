import type { Copycat, Family } from "@/lib/guardian/types";
import { fetchDexSearch, fetchDexToken, type DexPair } from "@/lib/sources/dexscreener";
import { searchJupiterTokens } from "@/lib/sources/jupiter-tokens";
import { asArray, asRecord, fetchJson, num, str } from "@/lib/http";

function sameTicker(a: string | null | undefined, b: string) {
  return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

function sameAddress(a: string, b: string, family?: Family) {
  if (family === "xrpl") {
    return a === b || a.includes(b) || b.includes(a);
  }
  return a.toLowerCase() === b.toLowerCase();
}

type Hit = {
  address: string;
  name: string | null;
  symbol: string;
  pairAddress: string | null;
  dex: string | null;
  liquidityUsd: number | null;
  createdAt: number | null;
  url: string | null;
};

async function searchGeckoSolanaTicker(ticker: string): Promise<Hit[]> {
  const url = `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(ticker)}&network=solana`;
  const result = await fetchJson<unknown>(url, { timeoutMs: 12_000 });
  if (!result.ok) return [];
  const root = asRecord(result.data) ?? {};
  const hits: Hit[] = [];
  for (const item of asArray(root.data)) {
    const row = asRecord(item) ?? {};
    const attrs = asRecord(row.attributes) ?? {};
    const name = str(attrs.name) ?? "";
    // Pool names look like "C7 / SOL" — require ticker as the base side.
    const baseSymbol = name.split("/")[0]?.trim() ?? "";
    if (!sameTicker(baseSymbol, ticker)) continue;
    const rel = asRecord(row.relationships) ?? {};
    const base = asRecord(asRecord(rel.base_token)?.data) ?? {};
    const baseId = str(base.id) ?? "";
    if (!baseId.startsWith("solana_")) continue;
    const mint = baseId.slice("solana_".length);
    hits.push({
      address: mint,
      name: baseSymbol,
      symbol: ticker,
      pairAddress: str(attrs.address),
      dex: "geckoterminal",
      liquidityUsd: num(attrs.reserve_in_usd),
      createdAt: attrs.pool_created_at ? Date.parse(String(attrs.pool_created_at)) || null : null,
      url: str(attrs.address)
        ? `https://www.geckoterminal.com/solana/pools/${str(attrs.address)}`
        : null,
    });
  }
  return hits;
}

async function enrichFromDex(mint: string, ticker: string): Promise<Hit | null> {
  const { pairs } = await fetchDexToken(mint);
  const solPairs = pairs.filter((pair) => pair.chainId.toLowerCase() === "solana");
  if (!solPairs.length) {
    return {
      address: mint,
      name: null,
      symbol: ticker,
      pairAddress: null,
      dex: null,
      liquidityUsd: null,
      createdAt: null,
      url: `https://solscan.io/token/${mint}`,
    };
  }
  const best = [...solPairs].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0];
  const token = tokenSide(best, ticker) ?? best.baseToken;
  return {
    address: mint,
    name: token.name,
    symbol: token.symbol ?? ticker,
    pairAddress: best.pairAddress,
    dex: best.dexId,
    liquidityUsd: best.liquidityUsd,
    createdAt: best.pairCreatedAt,
    url: best.url,
  };
}

/**
 * Same-ticker search with depth beyond DexScreener alone.
 * DexScreener search often returns 1 hit for short tickers; Jupiter + Gecko catch pump.fun clones.
 */
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

  const byMint = new Map<string, Hit>();

  const merge = (hit: Hit) => {
    if (sameAddress(hit.address, options.excludeAddress, options.family)) return;
    if (!sameTicker(hit.symbol, ticker) && options.family !== "xrpl") {
      // Jupiter / gecko rows are pre-filtered; still guard.
    }
    const key = options.family === "xrpl" ? hit.address : hit.address.toLowerCase();
    const existing = byMint.get(key);
    if (!existing) {
      byMint.set(key, hit);
      return;
    }
    byMint.set(key, {
      ...existing,
      name: existing.name ?? hit.name,
      pairAddress: existing.pairAddress ?? hit.pairAddress,
      dex: existing.dex ?? hit.dex,
      liquidityUsd: Math.max(existing.liquidityUsd ?? 0, hit.liquidityUsd ?? 0) || null,
      createdAt:
        existing.createdAt == null
          ? hit.createdAt
          : hit.createdAt == null
            ? existing.createdAt
            : Math.min(existing.createdAt, hit.createdAt),
      url: existing.url ?? hit.url,
    });
  };

  const [dex, jupiter, gecko] = await Promise.all([
    fetchDexSearch(ticker),
    options.dexScreenerChain.toLowerCase() === "solana"
      ? searchJupiterTokens(ticker)
      : Promise.resolve({ tokens: [] as Awaited<ReturnType<typeof searchJupiterTokens>>["tokens"] }),
    options.dexScreenerChain.toLowerCase() === "solana"
      ? searchGeckoSolanaTicker(ticker)
      : Promise.resolve([] as Hit[]),
  ]);

  if (dex.error && !jupiter.tokens?.length && !gecko.length) {
    return { copycats: [], error: dex.error };
  }

  for (const pair of dex.pairs ?? []) {
    if (pair.chainId.toLowerCase() !== options.dexScreenerChain.toLowerCase()) continue;
    const token = tokenSide(pair, ticker);
    if (!token) continue;
    merge({
      address: token.address,
      name: token.name,
      symbol: token.symbol ?? ticker,
      pairAddress: pair.pairAddress,
      dex: pair.dexId,
      liquidityUsd: pair.liquidityUsd,
      createdAt: pair.pairCreatedAt,
      url: pair.url,
    });
  }

  for (const hit of gecko) merge(hit);

  const jupiterExact = (jupiter.tokens ?? []).filter((token) => sameTicker(token.symbol, ticker));
  // Enrich Jupiter hits that DexScreener search missed (common for pump.fun clones).
  const needEnrich = jupiterExact.filter((token) => {
    const key = token.id.toLowerCase();
    return !byMint.has(key) && !sameAddress(token.id, options.excludeAddress, options.family);
  });
  const enriched = await Promise.all(
    needEnrich.slice(0, 24).map(async (token) => {
      const hit = await enrichFromDex(token.id, ticker);
      return hit
        ? { ...hit, name: hit.name ?? token.name, symbol: token.symbol ?? ticker }
        : null;
    }),
  );
  for (const hit of enriched) {
    if (hit) merge(hit);
  }
  // Also merge already-seen Jupiter mints for name fill.
  for (const token of jupiterExact) {
    if (sameAddress(token.id, options.excludeAddress, options.family)) continue;
    const existing = byMint.get(token.id.toLowerCase());
    if (existing && !existing.name) existing.name = token.name;
    if (!existing) {
      merge({
        address: token.id,
        name: token.name,
        symbol: token.symbol ?? ticker,
        pairAddress: null,
        dex: null,
        liquidityUsd: null,
        createdAt: null,
        url: `https://solscan.io/token/${token.id}`,
      });
    }
  }

  const rows = [...byMint.values()];
  const oldest = [...rows].sort(
    (a, b) => (a.createdAt ?? Number.MAX_SAFE_INTEGER) - (b.createdAt ?? Number.MAX_SAFE_INTEGER),
  )[0];
  const deepest = [...rows].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0];

  const copycats: Copycat[] = rows.map((row) => {
    const flags: Copycat["flags"] = ["same-chain"];
    if (oldest && row.address === oldest.address) flags.push("oldest");
    if (deepest && row.address === deepest.address) flags.push("deepest");
    return {
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      chainId: options.chainId,
      chainName: options.chainName,
      pairAddress: row.pairAddress,
      dex: row.dex,
      liquidityUsd: row.liquidityUsd,
      createdAt: row.createdAt,
      flags,
      url: row.url,
    };
  });

  copycats.sort((a, b) => {
    const aRank =
      (a.flags.includes("oldest") ? 2 : 0) + (a.flags.includes("deepest") ? 1 : 0);
    const bRank =
      (b.flags.includes("oldest") ? 2 : 0) + (b.flags.includes("deepest") ? 1 : 0);
    if (bRank !== aRank) return bRank - aRank;
    return (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
  });

  return { copycats: copycats.slice(0, 20) };
}

function tokenSide(pair: DexPair, ticker: string) {
  if (sameTicker(pair.baseToken.symbol, ticker)) return pair.baseToken;
  if (sameTicker(pair.quoteToken.symbol, ticker)) return pair.quoteToken;
  return null;
}
