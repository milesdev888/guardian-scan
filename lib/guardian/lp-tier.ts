import { check, formatPct, safeToFixed } from "@/lib/guardian/grade";
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
  "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m", // Streamflow vesting (mainnet)
  "aSTRM2NKoKxNnkmLWk9sz3k74gKBk9t7bpPrTGxMszH", // Streamflow aligned
  "strmRqUCoQkeZbZyeFyBTvzmU9aNSv1VqdAdybM73Vv", // Legacy Streamflow id (indexes)
  "GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgBgs55bnpH", // Goki smart wallet
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

function clampPct(value: number | null | undefined | string): number | null {
  const n =
    value === null || value === undefined || value === ""
      ? null
      : typeof value === "number"
        ? value
        : Number(value);
  if (n === null || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
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
