/**
 * Share-card LP status line wording (SCAN_SHARE_CARD_SPEC).
 * Use "locked", never "secured". Never say "unlocked" on Established path.
 */

import { asFiniteNumber, safeToFixed } from "@/lib/guardian/grade";
import type { GuardianReport } from "@/lib/guardian/types";
import type { BadgeCardStatus } from "@/lib/card/chips";

export type LpLine = {
  text: string;
  tone: "green" | "gold" | "amber" | "gray";
  icon: "lock" | "lock-open" | "pools";
};

function isEstablishedPath(badge: BadgeCardStatus | null): boolean {
  if (!badge) return false;
  const blob = [badge.pathFamily, badge.pathLabel, badge.qualifyPath]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.includes("established");
}

function formatUnlock(unlockAt: string | null | undefined): string {
  if (!unlockAt) return "—";
  const ms = Date.parse(unlockAt);
  if (!Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function independentPoolCount(report: GuardianReport): number | null {
  const n = report.pools?.length ?? 0;
  if (n <= 0) return null;
  return n;
}

/**
 * Build the LP status line from stored report + badge path.
 */
export function buildLpLine(
  report: GuardianReport,
  badge: BadgeCardStatus | null,
): LpLine {
  const tier = report.lp?.tier ?? null;
  const established = isEstablishedPath(badge);

  if (established) {
    const n = independentPoolCount(report);
    const count = n === null ? "—" : String(n);
    return {
      text: `LIQUIDITY DISTRIBUTED · ${count} independent pools`,
      tone: "gold",
      icon: "pools",
    };
  }

  if (tier === "PERMANENT" || tier === "BURNED") {
    return {
      text: "LP PERMANENT · 100% locked",
      tone: "green",
      icon: "lock",
    };
  }

  if (tier === "TIMED") {
    const until = formatUnlock(report.lp?.unlockAt);
    return {
      text: `LP LOCKED · until ${until}`,
      tone: "gold",
      icon: "lock",
    };
  }

  // Non-qualifying unlocked / unverified / unknown
  if (tier === "UNVERIFIED") {
    const pct = asFiniteNumber(report.lp?.lockedPct);
    const pctText =
      pct === null ? "—" : (() => {
        const f = safeToFixed(pct, pct >= 10 ? 0 : 1);
        return f ? `${f}%` : "—";
      })();
    return {
      text: `LP UNVERIFIED · ${pctText} reported`,
      tone: "amber",
      icon: "lock-open",
    };
  }

  return {
    text: "LP UNLOCKED",
    tone: "amber",
    icon: "lock-open",
  };
}
