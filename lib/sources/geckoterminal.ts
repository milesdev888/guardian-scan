import { asRecord, fetchJson, str } from "@/lib/http";

/** Map Guardian chain ids → GeckoTerminal network ids. */
export function geckoNetworkId(chainId: string): string | null {
  switch (chainId) {
    case "ethereum":
      return "eth";
    case "base":
      return "base";
    case "arbitrum":
      return "arbitrum";
    case "solana":
      return "solana";
    default:
      return null;
  }
}

/**
 * GeckoTerminal token /info — includes twitter_handle from their profile layer.
 */
export async function fetchGeckoTokenTwitter(
  chainId: string,
  address: string,
): Promise<{ twitter: string | null; error?: string }> {
  const network = geckoNetworkId(chainId);
  if (!network) return { twitter: null };
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${encodeURIComponent(address)}/info`;
  const result = await fetchJson<unknown>(url, { timeoutMs: 10_000 });
  if (!result.ok) return { twitter: null, error: result.error };
  const root = asRecord(result.data);
  const attrs = asRecord(asRecord(root?.data)?.attributes) ?? asRecord(root?.attributes);
  const handle = str(attrs?.twitter_handle);
  return { twitter: handle };
}
