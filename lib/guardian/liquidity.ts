/** LP lock / burn extraction from RugCheck markets + known accounts. */

import { classifyAccount, type KnownAccount } from "./accounts";
import type { Grade } from "./types";

export type MarketLiquidity = {
  marketType: string | null;
  pubkey: string | null;
  quoteUsd: number;
  baseUsd: number;
  poolUsd: number;
  lpLockedPct: number | null;
  lpUnlocked: number | null;
  lpTotalSupply: number | null;
  holders: Array<{ address?: string; owner?: string; pct?: number }>;
};

export type LpLockAssessment = {
  measured: boolean;
  securedPct: number | null;
  lockedPct: number;
  burnedPct: number;
  freePct: number | null;
  permanent: boolean;
  marketType: string | null;
  poolUsd: number | null;
  lockerName: string | null;
  summaryLabel: string;
};

function isMeteoraDamm(marketType: string | null | undefined) {
  return /meteora.*damm|damm.*v2/i.test(String(marketType || ""));
}

function isRaydiumOrOrca(marketType: string | null | undefined) {
  return /raydium|orca|whirlpool|cpmm|clmm/i.test(String(marketType || ""));
}

/**
 * Parse RugCheck-style market rows into a normalized liquidity snapshot.
 */
export function parseMarkets(rawMarkets: unknown[]): MarketLiquidity[] {
  const out: MarketLiquidity[] = [];
  for (const item of rawMarkets) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const lp = (row.lp && typeof row.lp === "object" ? row.lp : null) as Record<
      string,
      unknown
    > | null;
    if (!lp) continue;
    const quoteUsd = Number(lp.quoteUSD ?? 0) || 0;
    const baseUsd = Number(lp.baseUSD ?? 0) || 0;
    const holdersRaw = Array.isArray(lp.holders) ? lp.holders : [];
    const holders = holdersRaw.map((h) => {
      const hr = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
      return {
        address: typeof hr.address === "string" ? hr.address : undefined,
        owner: typeof hr.owner === "string" ? hr.owner : undefined,
        pct: Number(hr.pct) || 0,
      };
    });
    const lockedPct = Number(lp.lpLockedPct);
    out.push({
      marketType: typeof row.marketType === "string" ? row.marketType : null,
      pubkey: typeof row.pubkey === "string" ? row.pubkey : null,
      quoteUsd,
      baseUsd,
      poolUsd: quoteUsd + baseUsd,
      lpLockedPct: Number.isFinite(lockedPct) ? lockedPct : null,
      lpUnlocked: Number.isFinite(Number(lp.lpUnlocked)) ? Number(lp.lpUnlocked) : null,
      lpTotalSupply: Number.isFinite(Number(lp.lpTotalSupply))
        ? Number(lp.lpTotalSupply)
        : null,
      holders,
    });
  }
  out.sort((a, b) => b.poolUsd - a.poolUsd);
  return out;
}

export function assessLpLock(input: {
  markets: MarketLiquidity[];
  knownAccounts?: Record<string, KnownAccount>;
  rootLpLockedPct?: number | null;
}): LpLockAssessment {
  const known = input.knownAccounts || {};
  const top = input.markets[0];
  const empty: LpLockAssessment = {
    measured: false,
    securedPct: null,
    lockedPct: 0,
    burnedPct: 0,
    freePct: null,
    permanent: false,
    marketType: null,
    poolUsd: null,
    lockerName: null,
    summaryLabel: "undetectable",
  };
  if (!top && (input.rootLpLockedPct === null || input.rootLpLockedPct === undefined)) {
    return empty;
  }

  let burnedPct = 0;
  let lockedFromHolders = 0;
  let lockerName: string | null = null;

  for (const h of top?.holders || []) {
    const { kind, label } = classifyAccount(h.address, h.owner, known);
    const pct = Number(h.pct) || 0;
    if (kind === "burn") burnedPct += pct;
    else if (kind === "locked") {
      lockedFromHolders += pct;
      if (!lockerName && label) lockerName = label.replace(/^Locked · /, "");
    }
  }

  let aggregate =
    top?.lpLockedPct != null && Number.isFinite(top.lpLockedPct)
      ? top.lpLockedPct
      : input.rootLpLockedPct != null && Number.isFinite(input.rootLpLockedPct)
        ? input.rootLpLockedPct
        : null;

  // When holder breakdown under-counts vs aggregate lock %, trust aggregate.
  let lockedOnly = lockedFromHolders;
  if (aggregate != null && burnedPct + lockedOnly < aggregate * 0.5) {
    lockedOnly = Math.max(lockedOnly, aggregate - burnedPct);
  }

  let lockedPct = Math.min(100, Math.max(0, +lockedOnly.toFixed(2)));
  burnedPct = Math.min(100, Math.max(0, +burnedPct.toFixed(2)));

  let freePct: number | null = null;
  if (top?.lpUnlocked != null && top.lpTotalSupply) {
    const fromSupply = (top.lpUnlocked / top.lpTotalSupply) * 100;
    if (Number.isFinite(fromSupply)) freePct = fromSupply;
  }
  if (freePct == null && aggregate != null) {
    freePct = Math.max(0, 100 - aggregate);
  } else if (freePct == null) {
    freePct = Math.max(0, 100 - lockedPct - burnedPct);
  }
  freePct = Math.min(100, Math.max(0, +freePct.toFixed(2)));

  const secured = lockedPct + burnedPct;
  if (aggregate != null && aggregate > secured + 5) {
    lockedPct = Math.min(100, +(lockedPct + (aggregate - secured)).toFixed(2));
  }

  const securedPct = Math.min(100, +(lockedPct + burnedPct).toFixed(2));
  const measured =
    aggregate != null ||
    lockedPct > 0 ||
    burnedPct > 0 ||
    (top != null && (top.lpUnlocked != null || top.holders.length > 0));

  // Meteora DAMM v2 permanent-lock: aggregate 100% with zero unlocked, or market flag.
  const permanent =
    isMeteoraDamm(top?.marketType) &&
    ((aggregate != null && aggregate >= 99.5 && (top?.lpUnlocked === 0 || freePct < 0.5)) ||
      securedPct >= 99.5);

  if (!lockerName && permanent) lockerName = "Meteora DAMM v2 permanent lock";
  else if (!lockerName && isRaydiumOrOrca(top?.marketType) && burnedPct >= 50) {
    lockerName = "burned LP";
  } else if (!lockerName && isRaydiumOrOrca(top?.marketType) && lockedPct >= 50) {
    lockerName = top?.marketType || "DEX locker";
  }

  let summaryLabel = "undetectable";
  if (measured && securedPct != null) {
    if (permanent) summaryLabel = `${Math.round(securedPct)}% permanently locked`;
    else if (burnedPct >= lockedPct && burnedPct > 0) {
      summaryLabel = `${Math.round(burnedPct)}% burned`;
    } else if (securedPct > 0) {
      summaryLabel = `${Math.round(securedPct)}% locked/burned`;
    } else {
      summaryLabel = "0% locked";
    }
  }

  return {
    measured: Boolean(measured),
    securedPct: measured ? securedPct : null,
    lockedPct,
    burnedPct,
    freePct: measured ? freePct : null,
    permanent,
    marketType: top?.marketType ?? null,
    poolUsd: top?.poolUsd ?? null,
    lockerName,
    summaryLabel,
  };
}

export function gradeLpLock(assessment: LpLockAssessment): {
  grade: Grade;
  status: "pass" | "flag" | "unknown";
} {
  if (!assessment.measured || assessment.securedPct == null) {
    return { grade: "U", status: "unknown" };
  }
  const pct = assessment.securedPct;
  if (pct >= 90) return { grade: "A", status: "pass" };
  if (pct >= 50) return { grade: "B", status: "pass" };
  if (pct >= 1) return { grade: "C", status: "flag" };
  return { grade: "D", status: "flag" };
}

export function lpLockTone(
  securedPct: number | null | undefined,
): "green" | "gold" | "red" | "gray" {
  if (securedPct == null || !Number.isFinite(securedPct)) return "gray";
  if (securedPct >= 90) return "green";
  if (securedPct >= 50) return "gold";
  return "red";
}
