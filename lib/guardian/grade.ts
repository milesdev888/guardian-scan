import type {
  Check,
  Grade,
  LiquidityPool,
  LpLockInfo,
  Pattern,
  PatternSeverity,
} from "@/lib/guardian/types";

/** Best → worst. AA is platinum above A; U is handled separately. */
const GRADE_ORDER: Grade[] = ["AA", "A", "B", "C", "D", "F"];

/** Letter → points for the weighted composite. U is excluded from the denominator. */
export const GRADE_POINTS: Record<Exclude<Grade, "U">, number> = {
  AA: 100,
  A: 100,
  B: 80,
  C: 55,
  D: 30,
  F: 0,
};

/**
 * Composite weights (sum 100). Checks not listed do not affect the score.
 * Grade U / unknown / unavailable checks are excluded from the denominator.
 * Ported from Guardian Scan v2.1 — Phase 1 check IDs remain the inputs.
 */
export const COMPOSITE_WEIGHTS: Record<string, number> = {
  honeypot_simulation: 20,
  lp_lock: 20,
  holder_concentration: 20,
  owner_privileges: 15,
  transfer_tax: 10,
  contract_age: 10,
  copycats: 5,
};

/** AA gates — every condition must hold; never round up from A. */
export const AA_MIN_SCORE = 90;
export const AA_MIN_AGE_DAYS = 365;
export const AA_ESTABLISHED_MIN_POOLS = 3;
export const AA_ESTABLISHED_MIN_LIQUIDITY_USD = 100_000;

/**
 * Distributed-Liquidity *presentation* (chips / LP line / headlines).
 * Blue-chip EVM books: ≥3 independent pools and ≥$1M combined depth.
 * Never show “Weak LP lock” / “unlocked” wording when this qualifies.
 * Stricter than AA’s Established-path LP dollar floor ($100K + no majority).
 */
export const DISTRIBUTED_LIQUIDITY_MIN_POOLS = 3;
export const DISTRIBUTED_LIQUIDITY_MIN_USD = 1_000_000;
