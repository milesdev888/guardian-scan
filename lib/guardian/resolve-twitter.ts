import { pickTwitterHandle, type ResolvedTwitterHandle } from "@/lib/guardian/twitter-handle";
import { twitterFromPairs, type DexPair } from "@/lib/sources/dexscreener";
import { fetchGeckoTokenTwitter } from "@/lib/sources/geckoterminal";
import { fetchTokenMetadataTwitter } from "@/lib/sources/token-metadata";

/**
 * Resolve twitter handle from sources we already pull (metadata URI, Dex
 * profile socials, GeckoTerminal /info). Prefer own metadata over third-party.
 */
export async function resolveTokenTwitter(input: {
  chainId: string;
  address: string;
  metadataUri?: string | null;
  pairs?: DexPair[];
}): Promise<ResolvedTwitterHandle | null> {
  const [meta, gecko] = await Promise.all([
    fetchTokenMetadataTwitter(input.metadataUri),
    fetchGeckoTokenTwitter(input.chainId, input.address),
  ]);
  const dexTwitter = twitterFromPairs(input.pairs ?? []);

  return pickTwitterHandle([
    { raw: meta.twitter, source: "token-metadata" },
    { raw: dexTwitter, source: "dexscreener" },
    { raw: gecko.twitter, source: "geckoterminal" },
  ]);
}
