/**
 * Normalize and pick a known X/Twitter handle for Share-on-X tagging.
 * Never invent — callers only pass handles observed from scan sources.
 */

export type TwitterHandleSource = "token-metadata" | "dexscreener" | "geckoterminal";

export type ResolvedTwitterHandle = {
  /** Always `@handle` when present. */
  handle: string;
  source: TwitterHandleSource;
};

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

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

/** Own-metadata sources default the Tag chip ON; third-party profile data defaults OFF. */
export function twitterTagDefaultOn(source: TwitterHandleSource | null | undefined): boolean {
  return source === "token-metadata";
}

/**
 * Prefer token metadata → DexScreener profile → GeckoTerminal.
 * First non-null normalized handle wins.
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
