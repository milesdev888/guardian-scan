import type { BadgeCardStatus } from "@/lib/card/chips";

const BADGE_API =
  process.env.GUARDIAN_BADGE_API ||
  process.env.NEXT_PUBLIC_GUARDIAN_BADGE_API ||
  "https://cyre.dev/api/badge/verify";

/**
 * Live badge lookup by mint. Path param is the mint only —
 * serial / status / path never come from the card URL.
 */
export async function lookupBadgeForMint(mint: string): Promise<BadgeCardStatus | null> {
  try {
    const url = `${BADGE_API}?mint=${encodeURIComponent(mint)}&live=1`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      valid?: boolean;
      status?: string;
      badge?: {
        serial?: string;
        status?: string;
        pathFamily?: string;
        pathLabel?: string;
        qualifyPath?: string;
      };
    };
    return {
      valid: Boolean(json.valid),
      status: json.status ?? json.badge?.status ?? null,
      pathFamily: json.badge?.pathFamily ?? null,
      pathLabel: json.badge?.pathLabel ?? null,
      qualifyPath: json.badge?.qualifyPath ?? null,
      serial: json.badge?.serial ?? null,
    };
  } catch {
    return null;
  }
}
