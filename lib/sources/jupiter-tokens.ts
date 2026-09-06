import { asArray, asRecord, fetchJson, str } from "@/lib/http";

export type JupiterTokenHit = {
  id: string;
  name: string | null;
  symbol: string | null;
  icon: string | null;
};

/** Jupiter lite token search — catches pump.fun same-ticker mints DexScreener search misses. */
export async function searchJupiterTokens(
  query: string,
): Promise<{ tokens: JupiterTokenHit[]; error?: string }> {
  const q = query.trim();
  if (!q) return { tokens: [] };
  const url = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`;
  const result = await fetchJson<unknown>(url, { timeoutMs: 12_000 });
  if (!result.ok) return { tokens: [], error: result.error };
  const rows = asArray(result.data);
  const tokens: JupiterTokenHit[] = [];
  for (const item of rows) {
    const row = asRecord(item) ?? {};
    const id = str(row.id) ?? str(row.address);
    if (!id) continue;
    tokens.push({
      id,
      name: str(row.name),
      symbol: str(row.symbol),
      icon: str(row.icon) ?? str(row.logoURI),
    });
  }
  return { tokens };
}
