import { check } from "@/lib/guardian/grade";
import type { Check, CheckStatus, Family, Grade, LpLockInfo, LpTier } from "@/lib/guardian/types";

export type { LpTier, LpLockInfo };

export type LpMarketInput = {
  marketType?: string | null;
  lpMint?: string | null;
  lockedPct?: number | null;
  burnedPct?: number | null;
  liquidityUsd?: number | null;
  unlockAt?: string | null;
  lockerName?: string | null;
};

export type LpLockerInput = {
  programId?: string | null;
  type?: string | null;
  name?: string | null;
  unlockAt?: string | null;
};

export type EvmLpHolderInput = {
  address?: string | null;
  percent?: number | null;
  tag?: string | null;
  locked?: boolean | null;
  isContract?: boolean | null;
  unlockAt?: string | null;
};

export type XrplLpInput = {
  poolExists: boolean;
  ammAccount?: string | null;
  lpBurnedPct?: number | null;
  lpLockedPct?: number | null;
  escrowUnlockAt?: string | null;
  facts?: string | null;
};

export type LpObservation = {
  family: Family;
  markets?: LpMarketInput[];
  lockers?: LpLockerInput[];
  evmLpHolders?: EvmLpHolderInput[];
  xrpl?: XrplLpInput;
  tokenAgeDays?: number | null;
};

export type LpAssessment = {
  tier: LpTier;
  lockedPct: number | null;
  burnedPct: number | null;
  freePct: number | null;
  unlockAt: string | null;
  lockerName: string | null;
  poolType: string | null;
  emoji: string;
  label: string;
  summary: string;
  detail: string;
  grade: Grade;
  status: CheckStatus;
  lifetimeEligible: boolean;
  badgeEligible: boolean;
  shortUnlockWarning: boolean;
};

const SOLANA_BURNS = new Set([
  "11111111111111111111111111111111",
  "1nc1nerator11111111111111111111111111111111",
  "dead111111111111111111111111111111111111111",
  "Burn111111111111111111111111111111111111111",
]);

const PERMANENT_POOL_TYPES = [
  "meteora_damm_v2",
  "meteora_dammv2",
  "meteora-damm-v2",
  "damm_v2",
  "dammv2",
];

const TIMED_LOCKER_NAMES = [
  "streamflow",
  "jupiter lock",
  "jupiter locker",
  "uncx",
  "unicrypt",
  "team finance",
  "teamfinance",
  "pinklock",
  "pinksale",
  "dxlock",
  "dxsale",
  "mudra",
  "plumer",
  "plumelock",
  "bags",
  "goki",
];

const TIMED_PROGRAMS = new Set([
  "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn", // Jupiter Lock
  "strmRqUCoQkeZbZyeFyBTvzmU9aNSv1VqdAdybM73Vv", // Streamflow
  "GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgM8Y5qJiM", // Goki
]);

const EVM_BURNS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000000001",
]);

export function lpTierLabel(tier: LpTier): { emoji: string; label: string } {
  switch (tier) {
    case "BURNED":
      return { emoji: "🔥", label: "BURNED" };
    case "PERMANENT":
      return { emoji: "🔒", label: "PERMANENT" };
    case "TIMED":
      return { emoji: "⏳", label: "TIMED" };
    default:
      return { emoji: "⚠️", label: "UNVERIFIED" };
  }
}

export function isPermanentPoolType(marketType: string | null | undefined): boolean {
  if (!marketType) return false;
  const key = marketType.toLowerCase().replace(/[\s-]/g, "_");
  return PERMANENT_POOL_TYPES.some((item) => key.includes(item));
}

function isSolanaBurn(address: string | null | undefined): boolean {
  if (!address) return false;
  return SOLANA_BURNS.has(address);
}

function isEvmBurn(address: string | null | undefined): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  return EVM_BURNS.has(lower) || /^0x0+$/.test(lower);
}

function looksTimedLocker(name: string | null | undefined, programId?: string | null): boolean {
  if (programId && TIMED_PROGRAMS.has(programId)) return true;
  if (!name) return false;
  const hay = name.toLowerCase();
  return TIMED_LOCKER_NAMES.some((item) => hay.includes(item));
}

function clampPct(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.min(100, Math.max(0, value));
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return null;
  return ms / 86_400_000;
}

function pickDeepestMarket(markets: LpMarketInput[]): LpMarketInput | null {
  if (!markets.length) return null;
  return [...markets].sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))[0] ?? null;
}

function finalize(
  partial: Omit<LpAssessment, "emoji" | "label" | "lifetimeEligible" | "badgeEligible" | "shortUnlockWarning"> & {
    shortUnlockWarning?: boolean;
  },
): LpAssessment {
  const { emoji, label } = lpTierLabel(partial.tier);
  const remaining = daysUntil(partial.unlockAt);
  const expired = remaining !== null && remaining <= 0;
  const shortUnlockWarning =
    partial.shortUnlockWarning ??
    (partial.tier === "TIMED" && (expired || (remaining !== null && remaining < 90)));
  const lifetimeEligible = partial.tier === "BURNED" || partial.tier === "PERMANENT";
  const timedOk =
    partial.tier === "TIMED" && !shortUnlockWarning && remaining !== null && remaining >= 90;
  const badgeEligible = lifetimeEligible || timedOk;
  return {
    ...partial,
    emoji,
    label,
    shortUnlockWarning,
    lifetimeEligible,
    badgeEligible,
  };
}

function unverified(
  extra: Partial<LpAssessment> & Pick<LpAssessment, "summary" | "detail">,
): LpAssessment {
  return finalize({
    tier: "UNVERIFIED",
    lockedPct: extra.lockedPct ?? null,
    burnedPct: extra.burnedPct ?? 0,
    freePct: extra.freePct ?? null,
    unlockAt: extra.unlockAt ?? null,
    lockerName: extra.lockerName ?? null,
    poolType: extra.poolType ?? null,
    summary: extra.summary,
    detail: extra.detail,
    grade: extra.grade ?? "C",
    status: extra.status ?? "flag",
  });
}

export function classifyLp(input: LpObservation): LpAssessment {
  if (input.family === "solana") return classifySolana(input);
  if (input.family === "xrpl") return classifyXrpl(input);
  return classifyEvm(input);
}

function classifyXrpl(input: LpObservation): LpAssessment {
  const x = input.xrpl;
  if (!x?.poolExists) {
    return unverified({
      poolType: null,
      summary: "⚠️ UNVERIFIED — no XLS-30 AMM pool found for this currency + issuer.",
      detail:
        "XRPL has no Meteora DAMM analogue. Without an AMM pool, Guardian cannot treat LP as burned, permanent, or timed.",
      grade: "U",
      status: "unknown",
    });
  }

  const burnedPct = clampPct(x.lpBurnedPct ?? 0) ?? 0;
  const lockedPct = clampPct(x.lpLockedPct ?? null);
  const amm = x.ammAccount ?? "XLS-30 AMM";

  if (burnedPct >= 80) {
    return finalize({
      tier: "BURNED",
      lockedPct: burnedPct,
      burnedPct,
      freePct: clampPct(100 - burnedPct),
      unlockAt: null,
      lockerName: amm,
      poolType: "xls30_amm",
      summary: `🔥 BURNED — ${burnedPct.toFixed(0)}% of AMM LP tokens sit at a blackhole address.`,
      detail:
        "LP tokens at a known XRPL blackhole cannot be withdrawn. This is the lifetime-burn equivalent. PERMANENT does not apply on XRPL — there is no protocol-level DAMM lock.",
      grade: "A",
      status: "pass",
    });
  }

  if (x.escrowUnlockAt) {
    const remaining = daysUntil(x.escrowUnlockAt);
    const expired = remaining !== null && remaining <= 0;
    const short = expired || remaining === null || remaining < 90;
    return finalize({
      tier: "TIMED",
      lockedPct: lockedPct ?? burnedPct,
      burnedPct,
      freePct: clampPct(100 - (lockedPct ?? 0) - burnedPct),
      unlockAt: x.escrowUnlockAt,
      lockerName: amm,
      poolType: "xls30_amm",
      summary: expired
        ? `⏳ TIMED — AMM LP escrow finished ${x.escrowUnlockAt.slice(0, 10)}.`
        : `⏳ TIMED — AMM LP in escrow until ${x.escrowUnlockAt.slice(0, 10)}.`,
      detail: short
        ? "An escrow that ends in under 90 days is not a lasting lock. Flagged, not a pass. XRPL has no PERMANENT AMM tier."
        : "LP tokens in an Escrow with FinishAfter. Badge eligibility expires at FinishAfter.",
      grade: expired ? "F" : short ? "D" : "B",
      status: expired || short ? "flag" : "pass",
      shortUnlockWarning: short,
    });
  }

  return unverified({
    lockedPct,
    burnedPct,
    freePct: clampPct(100 - burnedPct - (lockedPct ?? 0)),
    lockerName: amm,
    poolType: "xls30_amm",
    summary: `⚠️ UNVERIFIED — XLS-30 AMM exists (${amm}); LP tokens remain transferable.`,
    detail:
      x.facts ??
      "XRPL AMM LP tokens can be withdrawn unless burned or escrowed. Guardian will not invent a PERMANENT pass — there is no DAMM v2 analogue on XRPL.",
    grade: "C",
    status: "flag",
  });
}

function classifySolana(input: LpObservation): LpAssessment {
  const markets = input.markets ?? [];
  const top = pickDeepestMarket(markets);
  const lockers = input.lockers ?? [];
  const timedLocker = lockers.find((row) => looksTimedLocker(row.name ?? row.type, row.programId));
  const earliestUnlock =
    [...lockers, ...markets]
      .map((row) => row.unlockAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

  const lockedPct = clampPct(top?.lockedPct ?? null);
  const burnedPct = clampPct(top?.burnedPct ?? 0) ?? 0;
  const poolType = top?.marketType ?? null;
  const lockerName = timedLocker?.name ?? timedLocker?.type ?? top?.lockerName ?? null;
  const lpMintBurned = isSolanaBurn(top?.lpMint);
  const secured = (lockedPct ?? 0) + burnedPct;
  const established = (input.tokenAgeDays ?? 0) >= 90;

  if (!top && !lockers.length) {
    return unverified({
      summary: "No LP lock figure and no recognized pool.",
      detail: "Guardian needs a pool or locker map before LP can be graded as burned, permanent, or timed.",
      grade: "U",
      status: "unknown",
    });
  }

  // Protocol-level permanent pools (e.g. Meteora DAMM v2) before classic burn —
  // DAMM often surfaces a burn-like lpMint for non-transferable positions.
  if (isPermanentPoolType(poolType) && (lockedPct ?? 0) >= 80) {
    return finalize({
      tier: "PERMANENT",
      lockedPct,
      burnedPct,
      freePct: clampPct(100 - (lockedPct ?? 0) - burnedPct),
      unlockAt: null,
      lockerName: lockerName ?? "Meteora DAMM v2",
      poolType,
      summary: `🔒 PERMANENT — ${Math.round(lockedPct ?? 0)}% locked in a protocol-level position (${poolType}).`,
      detail:
        "Meteora DAMM v2 (and equivalent permanent positions) do not mint transferable LP tokens that a team wallet can pull. This is a lifetime lock tier.",
      grade: "A",
      status: "pass",
    });
  }

  if (burnedPct >= 80 || (lpMintBurned && burnedPct >= 50)) {
    return finalize({
      tier: "BURNED",
      lockedPct,
      burnedPct,
      freePct: clampPct(100 - secured),
      unlockAt: null,
      lockerName: lockerName,
      poolType,
      summary: `🔥 BURNED — ${burnedPct.toFixed(0)}% of LP is at a burn address.`,
      detail: "Burned LP cannot be withdrawn. This is a lifetime lock tier.",
      grade: "A",
      status: "pass",
    });
  }

  if (lpMintBurned && (lockedPct ?? 0) >= 95 && !earliestUnlock) {
    return finalize({
      tier: "PERMANENT",
      lockedPct,
      burnedPct,
      freePct: clampPct(100 - (lockedPct ?? 0) - burnedPct),
      unlockAt: null,
      lockerName: lockerName ?? poolType,
      poolType,
      summary: `🔒 PERMANENT — LP mint is burned and ${Math.round(lockedPct ?? 0)}% is locked with no unlock date.`,
      detail: "No transferable LP mint remains. Treated as a protocol-level permanent lock.",
      grade: "A",
      status: "pass",
    });
  }

  if (timedLocker || earliestUnlock || looksTimedLocker(lockerName)) {
    const remaining = daysUntil(earliestUnlock);
    const expired = remaining !== null && remaining <= 0;
    const short = expired || (remaining !== null && remaining < 90);
    return finalize({
      tier: "TIMED",
      lockedPct,
      burnedPct,
      freePct: clampPct(100 - (lockedPct ?? 0) - burnedPct),
      unlockAt: earliestUnlock,
      lockerName,
      poolType,
      summary: expired
        ? `⏳ TIMED — lock expired${earliestUnlock ? ` ${earliestUnlock.slice(0, 10)}` : ""}.`
        : `⏳ TIMED — ${Math.round(lockedPct ?? 0)}% locked via ${lockerName ?? "a known locker"}${
            earliestUnlock ? `; unlock ${earliestUnlock.slice(0, 10)}` : ""
          }.`,
      detail: short
        ? "A lock that expires in under 90 days is not a lasting lock. Flagged, not a pass."
        : "Known timed locker (Streamflow, Jupiter Lock, UNCX, Team Finance, and similar). Badge eligibility expires at unlock.",
      grade: expired ? "F" : short ? "D" : "B",
      status: expired || short ? "flag" : "pass",
      shortUnlockWarning: short,
    });
  }

  if ((lockedPct ?? 0) >= 80) {
    return unverified({
      lockedPct,
      burnedPct,
      freePct: clampPct(100 - (lockedPct ?? 0) - burnedPct),
      lockerName,
      poolType,
      summary: `⚠️ UNVERIFIED — ${Math.round(lockedPct ?? 0)}% reported locked in an unknown contract or wallet.`,
      detail:
        "Unknown lockers are a warning, never a pass. Guardian will not treat an unlabeled wallet as a lock, even at 100%.",
      grade: "C",
      status: "flag",
    });
  }

  const unlocked = lockedPct === null || lockedPct < 10;
  return unverified({
    lockedPct,
    burnedPct,
    freePct: clampPct(100 - (lockedPct ?? 0) - burnedPct),
    lockerName,
    poolType,
    summary:
      lockedPct == null
        ? "⚠️ UNVERIFIED — lock percent missing for listed pools."
        : `⚠️ UNVERIFIED — ${Math.round(lockedPct)}% locked; remainder can be pulled.`,
    detail: established
      ? "Unlocked AMM LP on an established token is a pattern, not the same rug vector as a day-old launch."
      : "Unlocked LP on a new mint is the standard Solana rug vector.",
    grade: unlocked && !established ? "F" : "C",
    status: "flag",
  });
}

function classifyEvm(input: LpObservation): LpAssessment {
  const holders = input.evmLpHolders ?? [];
  const established = (input.tokenAgeDays ?? 0) >= 90;
  if (!holders.length && !(input.markets ?? []).length) {
    return unverified({
      summary: "No LP holders or pools returned.",
      detail: "Without a locker map, Guardian cannot call this burned, permanent, or timed.",
      grade: "U",
      status: "unknown",
    });
  }

  let burnedPct = 0;
  let timedPct = 0;
  let unknownLockedPct = 0;
  let freePct = 0;
  let lockerName: string | null = null;
  let unlockAt: string | null = null;

  for (const row of holders) {
    const pct = row.percent ?? 0;
    const tag = row.tag ?? "";
    const timed = looksTimedLocker(tag);
    const burned = isEvmBurn(row.address) || /burn/i.test(tag);
    if (burned) {
      burnedPct += pct;
      continue;
    }
    if (timed || (row.locked && looksTimedLocker(tag))) {
      timedPct += pct;
      if (!lockerName) lockerName = tag || "known locker";
      if (row.unlockAt && (!unlockAt || Date.parse(row.unlockAt) < Date.parse(unlockAt))) {
        unlockAt = row.unlockAt;
      }
      continue;
    }
    if (row.locked) {
      unknownLockedPct += pct;
      if (!lockerName) lockerName = tag || row.address || "unknown locker";
      continue;
    }
    freePct += pct;
  }

  const poolType = pickDeepestMarket(input.markets ?? [])?.marketType ?? null;

  if (burnedPct >= 80) {
    return finalize({
      tier: "BURNED",
      lockedPct: burnedPct,
      burnedPct,
      freePct,
      unlockAt: null,
      lockerName,
      poolType,
      summary: `🔥 BURNED — ${burnedPct.toFixed(0)}% of tracked LP is at a burn address.`,
      detail: "Burned LP cannot be withdrawn. This is a lifetime lock tier.",
      grade: "A",
      status: "pass",
    });
  }

  if (timedPct >= 80) {
    const remaining = daysUntil(unlockAt);
    const expired = remaining !== null && remaining <= 0;
    const short = expired || remaining === null || remaining < 90;
    return finalize({
      tier: "TIMED",
      lockedPct: timedPct,
      burnedPct,
      freePct,
      unlockAt,
      lockerName,
      poolType,
      summary: `⏳ TIMED — ${timedPct.toFixed(0)}% in ${lockerName ?? "a known locker"}${
        unlockAt ? `; unlock ${unlockAt.slice(0, 10)}` : ""
      }.`,
      detail: short
        ? remaining === null
          ? "Known timed locker, but no unlock date was returned. Treated as a warning until the date is public."
          : "A lock that expires in under 90 days is not a lasting lock. Flagged, not a pass."
        : "Known timed locker. Badge eligibility expires at unlock.",
      grade: expired ? "F" : short ? "D" : "B",
      status: expired || short ? "flag" : "pass",
      shortUnlockWarning: short,
    });
  }

  if (unknownLockedPct >= 80 || burnedPct + timedPct + unknownLockedPct >= 80) {
    return unverified({
      lockedPct: unknownLockedPct + timedPct + burnedPct,
      burnedPct,
      freePct,
      lockerName,
      poolType,
      summary: `⚠️ UNVERIFIED — LP sits in an unknown contract or wallet (${Math.round(
        unknownLockedPct + timedPct + burnedPct,
      )}% tagged locked).`,
      detail: "Unknown lockers are a warning, never a pass — including GoPlus is_locked flags on unlabeled addresses.",
      grade: "C",
      status: "flag",
    });
  }

  const lockedPct = burnedPct + timedPct + unknownLockedPct;
  return unverified({
    lockedPct,
    burnedPct,
    freePct: clampPct(100 - lockedPct),
    lockerName,
    poolType,
    summary: `⚠️ UNVERIFIED — ${Math.round(lockedPct)}% of tracked LP is locked or burned.`,
    detail: established
      ? "Unlocked AMM LP on an established token is a pattern, not the same rug vector as a day-old launch."
      : "Unlocked LP on a new DEX launch is the classic rug vector.",
    grade: lockedPct < 10 && !established ? "F" : "C",
    status: "flag",
  });
}

export function lpCheckFrom(assessment: LpAssessment): Check {
  return check({
    id: "lp_lock",
    title: "LP lock / burn",
    status: assessment.status,
    grade: assessment.grade,
    summary: assessment.summary,
    detail: assessment.detail,
    evidence: {
      tier: assessment.tier,
      lockedPct: assessment.lockedPct,
      burnedPct: assessment.burnedPct,
      freePct: assessment.freePct,
      unlockAt: assessment.unlockAt,
      lockerName: assessment.lockerName,
      poolType: assessment.poolType,
      lifetimeEligible: assessment.lifetimeEligible,
    },
  });
}

export function toLpLockInfo(assessment: LpAssessment): LpLockInfo {
  return {
    tier: assessment.tier,
    lockedPct: assessment.lockedPct,
    burnedPct: assessment.burnedPct,
    freePct: assessment.freePct,
    unlockAt: assessment.unlockAt,
    lockerName: assessment.lockerName,
    poolType: assessment.poolType,
    lifetimeEligible: assessment.lifetimeEligible,
    badgeEligible: assessment.badgeEligible,
  };
}

export function unixToIso(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n < 10_000_000_000 ? n * 1000 : n;
  return new Date(ms).toISOString();
}
