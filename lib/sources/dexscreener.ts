import { asArray, asRecord, fetchJson, num, str } from "@/lib/http";

export type DexPair = {
  chainId: string;
  dexId: string;
  url: string | null;
  pairAddress: string;
  baseToken: { address: string; name: string | null; symbol: string | null };
  quoteToken: { address: string; name: string | null; symbol: string | null };
  priceUsd: number | null;
  liquidityUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
  imageUrl: string | null;
};

function parsePair(raw: unknown): DexPair | null {
  const row = asRecord(raw);
  if (!row) return null;
  const base = asRecord(row.baseToken);
  const quote = asRecord(row.quoteToken);
  const liquidity = asRecord(row.liquidity);
  const info = asRecord(row.info);
  if (!base) return null;
  return {
    chainId: str(row.chainId) ?? "",
    dexId: str(row.dexId) ?? "",
    url: str(row.url),
    pairAddress: str(row.pairAddress) ?? "",
    baseToken: {
      address: str(base.address) ?? "",
      name: str(base.name),
      symbol: str(base.symbol),
    },
    quoteToken: {
      address: str(quote?.address) ?? "",
      name: str(quote?.name),
      symbol: str(quote?.symbol),
    },
    priceUsd: num(row.priceUsd),
    liquidityUsd: num(liquidity?.usd),
    fdv: num(row.fdv),
    marketCap: num(row.marketCap),
    pairCreatedAt: num(row.pairCreatedAt),
    imageUrl: str(info?.imageUrl),
  };
}

function parsePairs(payload: unknown): DexPair[] {
  const root = asRecord(payload);
  const list = asArray(root?.pairs ?? root?.pair ?? payload);
  return list.map(parsePair).filter((row): row is DexPair => Boolean(row));
}

export async function fetchDexToken(
  address: string,
): Promise<{ pairs: DexPair[]; error?: string }> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`;
  const result = await fetchJson<unknown>(url);
  if (!result.ok) return { pairs: [], error: result.error };
  return { pairs: parsePairs(result.data) };
}

export async function fetchDexSearch(
  query: string,
): Promise<{ pairs: DexPair[]; error?: string }> {
  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
  const result = await fetchJson<unknown>(url);
  if (!result.ok) return { pairs: [], error: result.error };
  return { pairs: parsePairs(result.data) };
}

export function filterPairsForChain(pairs: DexPair[], dexScreenerChain: string) {
  const wanted = dexScreenerChain.toLowerCase();
  return pairs.filter((pair) => pair.chainId.toLowerCase() === wanted);
}

export function pickCanonicalPair(pairs: DexPair[], tokenAddress: string): DexPair | null {
  const lower = tokenAddress.toLowerCase();
  const matching = pairs.filter(
    (pair) =>
      pair.baseToken.address.toLowerCase() === lower ||
      pair.quoteToken.address.toLowerCase() === lower,
  );
  if (!matching.length) return pairs[0] ?? null;
  return [...matching].sort(
    (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0),
  )[0];
}

export function identityFromPairs(pairs: DexPair[], tokenAddress: string) {
  const lower = tokenAddress.toLowerCase();
  for (const pair of pairs) {
    const side =
      pair.baseToken.address.toLowerCase() === lower
        ? pair.baseToken
        : pair.quoteToken.address.toLowerCase() === lower
          ? pair.quoteToken
          : null;
    if (side) {
      return {
        name: side.name,
        symbol: side.symbol,
        imageUrl: pair.imageUrl,
      };
    }
  }
  const first = pairs[0];
  return {
    name: first?.baseToken.name ?? null,
    symbol: first?.baseToken.symbol ?? null,
    imageUrl: first?.imageUrl ?? null,
  };
}
