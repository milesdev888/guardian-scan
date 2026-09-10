/**
 * Normalize and pick a known X/Twitter handle for Share-on-X tagging.
 * Never invent from token name — only observed verified metadata/socials
 * or an explicit curated allowlist.
 */

export type TwitterHandleSource = "token-metadata" | "dexscreener" | "geckoterminal" | "curated";

export type ResolvedTwitterHandle = {
  /** Always `@handle` when present. */
  handle: string;
  source: TwitterHandleSource;
};

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * Curated verified project handles (lowercase mint/address → @handle).
 * Only entries the founder would endorse tagging — never name-derived.
 */
export const CURATED_TWITTER_HANDLES: Record<string, string> = {
  // Ethereum
  "0x514910771af9ca656af840dff83e8264ecf986ca": "@chainlink", // LINK
  "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": "@AaveAave", // AAVE
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "@circle", // USDC
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "@tether_to", // USDT
  // Solana $C7
  "979sitxcjwfpdasrf2ybknenwfcpihdwaaasc5xa5qww": "@Cyredev888",
};

/**
 * Accepts `@handle`, `handle`, `https://x.com/handle`, `https://twitter.com/handle?...`
 * Returns `@handle` or null. Rejects status URLs, intents, and non-handle paths.
 */
export function normalizeTwitterHandle(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // URL forms — profile root only (reject /status/, /i/, etc.)
  const urlMatch = s.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(@?[A-Za-z0-9_]{1,15})\/?(?:\?[^#]*)?(?:#.*)?$/i,
  );
  if (urlMatch) {
    s = urlMatch[1];
  } else if (/^(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\//i.test(s)) {
    // Looks like an X URL but not a bare profile — do not invent a handle.
    return null;
  }

  s = s.replace(/^@+/, "");
  // Reject reserved / non-profile paths that can sneak past the regex if passed bare
  if (
    /^(intent|share|i|home|explore|search|settings|messages|notifications|compose|hashtag)$/i.test(
      s,
    )
  ) {
    return null;
  }
  if (!HANDLE_RE.test(s)) return null;
  return `@${s}`;
}

/** Tag chip only for own metadata or curated allowlist — never Dex/Gecko alone. */
export function twitterHandleIsVerified(
  source: TwitterHandleSource | null | undefined,
): boolean {
  return source === "token-metadata" || source === "curated";
}

/** Own-metadata / curated sources default the Tag chip ON. */
export function twitterTagDefaultOn(source: TwitterHandleSource | null | undefined): boolean {
  return twitterHandleIsVerified(source);
}

/**
 * Prefer curated → token metadata → DexScreener → GeckoTerminal for *storage*,
 * but Tag UI only renders for verified sources (see twitterHandleIsVerified).
 */
export function pickTwitterHandle(candidates: Array<{
  raw: unknown;
  source: TwitterHandleSource;
}>): ResolvedTwitterHandle | null {
  for (const candidate of candidates) {
    const handle = normalizeTwitterHandle(candidate.raw);
    if (handle) return { handle, source: candidate.source };
  }
  return null;
}

export function curatedTwitterForAddress(address: string | null | undefined): ResolvedTwitterHandle | null {
  if (!address) return null;
  const key = address.trim().toLowerCase();
  const raw = CURATED_TWITTER_HANDLES[key];
  if (!raw) return null;
  const handle = normalizeTwitterHandle(raw);
  return handle ? { handle, source: "curated" } : null;
}

export function composeShareOnXText(input: {
  grade: string;
  scoreText: string;
  reportUrl: string;
  /** When set and tagging is on, use the tagged template. */
  tagHandle?: string | null;
  tagEnabled?: boolean;
}): string {
  const { grade, scoreText, reportUrl, tagHandle, tagEnabled } = input;
  if (tagEnabled && tagHandle) {
    return `Scanned ${tagHandle} with Guardian — grade ${grade} · ${scoreText}/100\n${reportUrl}`;
  }
  return `Scanned with Guardian — grade ${grade} · ${scoreText}/100\n${reportUrl}`;
}
