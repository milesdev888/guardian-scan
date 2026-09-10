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

/**
 * Score → letter grade. Never returns AA — platinum requires applyAaIfEligible.
 */
export function gradeFromScore(score: number): Grade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

export function minGrade(a: Grade, b: Grade): Grade {
  if (a === "U") return b;
  if (b === "U") return a;
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}

/** Coerce unknown numeric-ish values; null if not finite. */
export function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Safe toFixed — never throws on string/null/NaN. */
export function safeToFixed(value: unknown, digits: number): string | null {
  const n = asFiniteNumber(value);
  if (n === null) return null;
  return n.toFixed(digits);
}

export function daysAgo(timestamp: number | null | undefined | string): number | null {
  if (timestamp === null || timestamp === undefined || timestamp === "") return null;
  // ISO strings
  if (typeof timestamp === "string" && /^\d{4}-\d{2}-\d{2}/.test(timestamp.trim())) {
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < Date.parse("2015-01-01") || parsed > Date.now() + 86_400_000) return null;
    return Math.max(0, (Date.now() - parsed) / 86_400_000);
  }
  // Reject 0x hashes coerced through Number()
  if (typeof timestamp === "string" && /^0x[0-9a-f]+$/i.test(timestamp.trim())) return null;
  const msRaw = asFiniteNumber(timestamp);
  if (msRaw === null || msRaw <= 0) return null;
  const ms = msRaw < 10_000_000_000 ? msRaw * 1000 : msRaw;
  if (ms < Date.parse("2015-01-01") || ms > Date.now() + 86_400_000) return null;
  return Math.max(0, (Date.now() - ms) / 86_400_000);
}

export function formatAge(timestamp: number | null | undefined | string): string {
  const days = daysAgo(timestamp);
  if (days === null) return "unknown age";
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  if (days < 45) {
    const d = Math.round(days);
    return d === 1 ? "1 day" : `${d} days`;
  }
  if (days < 365) {
    const m = safeToFixed(days / 30, 1);
    if (!m) return "unknown age";
    return m === "1.0" ? "1.0 month" : `${m} months`;
  }
  const y = safeToFixed(days / 365, 1);
  if (!y) return "unknown age";
  return y === "1.0" ? "1.0 year" : `${y} years`;
}

/** Display years for AA proven line — e.g. "1.2 yrs". */
export function formatProvenYears(ageDays: number | null | undefined): string | null {
  const n = asFiniteNumber(ageDays);
  if (n === null || n < AA_MIN_AGE_DAYS) return null;
  const yrs = n / 365;
  const fixed = safeToFixed(yrs, yrs >= 10 ? 0 : 1);
  return fixed;
}

export function formatPct(value: unknown): string {
  const n = asFiniteNumber(value);
  if (n === null) return "\u2014";
  const fixed = safeToFixed(n, n >= 10 || n <= -10 ? 0 : 1);
  return fixed ? `${fixed}%` : "\u2014";
}

export function formatUsd(value: unknown): string {
  const n = asFiniteNumber(value);
  if (n === null) return "\u2014";
  if (Math.abs(n) >= 1_000_000) {
    const fixed = safeToFixed(n / 1_000_000, 1);
    return fixed ? `$${fixed}M` : "\u2014";
  }
  if (Math.abs(n) >= 1_000) {
    const fixed = safeToFixed(n / 1_000, 1);
    return fixed ? `$${fixed}k` : "\u2014";
  }
  const fixed = safeToFixed(n, 0);
  return fixed ? `$${fixed}` : "\u2014";
}

export function shorten(address: string, size = 4) {
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + (address.startsWith("0x") ? 2 : 0))}\u2026${address.slice(-size)}`;
}

export function check(partial: Omit<Check, "grade"> & { grade?: Grade }): Check {
  return {
    grade:
      partial.grade ??
      (partial.status === "pass"
        ? "A"
        : partial.status === "unknown" || partial.status === "unavailable"
          ? "U"
          : "C"),
    ...partial,
  };
}

export function pattern(
  id: string,
  severity: PatternSeverity,
  title: string,
  detail: string,
): Pattern {
  return { id, severity, title, detail };
}

function headlineFromChecks(
  checks: Check[],
  pools?: LiquidityPool[] | null,
): string {
  const byId = new Map(checks.map((item) => [item.id, item]));
  const bits: string[] = [];

  const lp = byId.get("lp_lock");
  if (lp && lp.grade !== "U") {
    const tier = typeof lp.evidence?.tier === "string" ? lp.evidence.tier : null;
    const distributed =
      lp.evidence?.distributedLiquidity === true || isDistributedLiquidity(pools);
    if (tier === "PERMANENT" || tier === "BURNED" || lp.grade === "A") {
      bits.push("Locked liquidity");
    } else if (distributed) {
      bits.push("Distributed liquidity");
    } else if (lp.grade === "B") {
      bits.push("Partially locked liquidity");
    } else {
      bits.push("Weak LP lock");
    }
  }

  const age = byId.get("contract_age");
  if (age && (age.grade === "D" || age.grade === "C" || age.grade === "B")) {
    bits.push("young token");
  }

  const holders = byId.get("holder_concentration");
  if (holders && holders.grade !== "U") {
    if (holders.grade === "A" || holders.grade === "B") bits.push("dispersed holders");
    else bits.push("watch concentration");
  }

  const hp = byId.get("honeypot_simulation");
  if (hp && (hp.grade === "F" || hp.grade === "D")) bits.push("sell-trap risk");

  const priv = byId.get("owner_privileges");
  if (priv && (priv.grade === "F" || priv.grade === "D")) bits.push("live owner privileges");

  const copies = byId.get("copycats");
  if (copies && copies.status === "flag") bits.push("same-ticker copies");

  if (!bits.length) {
    const flagTitles = checks
      .filter((item) => item.status === "flag")
      .map((item) => item.title.toLowerCase());
    return flagTitles.length
      ? flagTitles.slice(0, 3).join(" \u00b7 ")
      : "No high-severity patterns in the v2 checks";
  }

  const [first, ...rest] = bits.slice(0, 3);
  if (!rest.length) return first;
  return `${first}, ${rest.join(", ")}`;
}

/**
 * Weighted composite score from check grades.
 * A=100 \u00b7 B=80 \u00b7 C=55 \u00b7 D=30 \u00b7 F=0. Grade U excluded from the denominator.
 * Letter from score is A\u2013F only; call applyAaIfEligible for platinum.
 */
export function compileReportMeta(
  checks: Check[],
  extraPatterns: Pattern[] = [],
  opts?: { pools?: LiquidityPool[] | null },
) {
  const patterns = [...extraPatterns];
  let weighted = 0;
  let weightSum = 0;

  for (const item of checks) {
    const weight = COMPOSITE_WEIGHTS[item.id];
    if (!weight) continue;
    if (item.grade === "U" || item.status === "unknown" || item.status === "unavailable") {
      continue;
    }
    const points = GRADE_POINTS[item.grade as Exclude<Grade, "U">];
    if (points === undefined) continue;
    weighted += points * weight;
    weightSum += weight;
  }

  const score =
    weightSum > 0 ? Math.max(0, Math.min(100, Math.round(weighted / weightSum))) : 50;
  const grade = gradeFromScore(score);
  const headline = headlineFromChecks(checks, opts?.pools);

  return { score, grade, headline, patterns };
}

export type AaPoolStats = {
  poolCount: number;
  totalLiquidityUsd: number;
  maxPoolShare: number;
  majorityShareCeiling: number;
  noSingleMajority: boolean;
};

export const MAJORITY_STRICT_USD = 1_000_000;
export const MAJORITY_RELAX_USD = 5_000_000;
export const MAJORITY_SHARE_STRICT = 0.5;
export const MAJORITY_SHARE_RELAXED = 0.8;

/**
 * Liquidity-scaled single-pool share ceiling — shared with badge Established path.
 * &lt;$1M → ≤50%; $1M→$5M linear 50%→80%; ≥$5M → ≤80%.
 */
export function majorityShareCeiling(totalLiquidityUsd: number): number {
  const total = asFiniteNumber(totalLiquidityUsd) ?? 0;
  if (total < MAJORITY_STRICT_USD) return MAJORITY_SHARE_STRICT;
  if (total >= MAJORITY_RELAX_USD) return MAJORITY_SHARE_RELAXED;
  const t = (total - MAJORITY_STRICT_USD) / (MAJORITY_RELAX_USD - MAJORITY_STRICT_USD);
  return MAJORITY_SHARE_STRICT + (MAJORITY_SHARE_RELAXED - MAJORITY_SHARE_STRICT) * t;
}

export function analyzePoolsForAa(pools: LiquidityPool[] | null | undefined): AaPoolStats {
  const rows = (Array.isArray(pools) ? pools : [])
    .map((p) => ({
      dex: String(p?.dex || "unknown").toLowerCase(),
      pair: String(p?.pairAddress || ""),
      liquidityUsd: asFiniteNumber(p?.liquidityUsd) ?? 0,
    }))
    .filter((p) => p.liquidityUsd > 0 || p.pair);

  const seen = new Set<string>();
  const independent: typeof rows = [];
  for (const row of rows) {
    const key = row.pair || `${row.dex}:${independent.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    independent.push(row);
  }

  const total = independent.reduce((s, r) => s + r.liquidityUsd, 0);
  const maxShare =
    total > 0 ? Math.max(...independent.map((r) => r.liquidityUsd / total)) : 1;
  const shareCeiling = majorityShareCeiling(total);
  return {
    poolCount: independent.length,
    totalLiquidityUsd: total,
    maxPoolShare: maxShare,
    majorityShareCeiling: shareCeiling,
    noSingleMajority: independent.length >= 2 && maxShare <= shareCeiling,
  };
}

/**
 * Deep distributed liquidity \u2014 Established-path *presentation* for chips / headlines / LP line.
 * Threshold: \u22653 independent pools and \u2265$1M combined depth
 * (DISTRIBUTED_LIQUIDITY_MIN_POOLS / DISTRIBUTED_LIQUIDITY_MIN_USD).
 * AA eligibility still requires \u2265$100K + no single-pool majority via analyzePoolsForAa.
 */
export function isDistributedLiquidity(
  pools: LiquidityPool[] | null | undefined,
): boolean {
  const stats = analyzePoolsForAa(pools);
  return (
    stats.poolCount >= DISTRIBUTED_LIQUIDITY_MIN_POOLS &&
    stats.totalLiquidityUsd >= DISTRIBUTED_LIQUIDITY_MIN_USD &&
    stats.noSingleMajority
  );
}

export function readAgeDays(checks: Check[]): number | null {
  const age = checks.find((c) => c.id === "contract_age");
  if (!age) return null;
  const fromEvidence = asFiniteNumber(age.evidence?.ageDays);
  if (fromEvidence !== null) return fromEvidence;
  const createdAt = age.evidence?.createdAt;
  if (createdAt !== undefined && createdAt !== null) return daysAgo(createdAt as number | string);
  return null;
}

export type AaEligibility = {
  eligible: boolean;
  scoreOk: boolean;
  ageOk: boolean;
  lpOk: boolean;
  authoritiesOk: boolean;
  fraudOk: boolean;
  ageDays: number | null;
  reasons: string[];
};

function hasFraudFlags(checks: Check[], patterns: Pattern[]): boolean {
  if (patterns.some((p) => p.severity === "critical")) return true;
  for (const item of checks) {
    if (item.status !== "flag") continue;
    if (
      item.id === "honeypot_simulation" ||
      item.id === "holder_concentration" ||
      item.id === "owner_privileges"
    ) {
      if (item.id === "owner_privileges") continue;
      if (item.grade === "F" || item.grade === "D" || item.status === "flag") {
        if (item.id === "honeypot_simulation") return true;
        if (item.id === "holder_concentration" && (item.grade === "F" || item.grade === "D")) {
          return true;
        }
      }
    }
  }
  if (
    patterns.some((p) =>
      /fraud|honeypot|rug|scam|revoke/i.test(`${p.id} ${p.title}`),
    )
  ) {
    return true;
  }
  const hp = checks.find((c) => c.id === "honeypot_simulation");
  if (hp && hp.status === "flag") return true;
  return false;
}

function authoritiesRevoked(checks: Check[]): boolean {
  const owner = checks.find((c) => c.id === "owner_privileges");
  if (!owner) return false;
  if (owner.status === "flag") return false;
  return owner.status === "pass" && owner.grade === "A";
}

function lpQualifiesForAa(
  lp: LpLockInfo | null | undefined,
  pools: LiquidityPool[] | null | undefined,
): boolean {
  if (lp?.tier === "PERMANENT" || lp?.tier === "BURNED") return true;
  const stats = analyzePoolsForAa(pools);
  return (
    stats.poolCount >= AA_ESTABLISHED_MIN_POOLS &&
    stats.totalLiquidityUsd >= AA_ESTABLISHED_MIN_LIQUIDITY_USD &&
    stats.noSingleMajority
  );
}

/**
 * AA (Platinum) \u2014 all gates must hold. If any fails, grade stays A at best
 * (never round a B/C up). Score gate alone is not enough.
 */
export function evaluateAaEligibility(input: {
  score: number;
  checks: Check[];
  pools?: LiquidityPool[] | null;
  lp?: LpLockInfo | null;
  patterns?: Pattern[];
}): AaEligibility {
  const patterns = input.patterns ?? [];
  const ageDays = readAgeDays(input.checks);
  const scoreOk = input.score >= AA_MIN_SCORE;
  const ageOk = ageDays !== null && ageDays >= AA_MIN_AGE_DAYS;
  const lpOk = lpQualifiesForAa(input.lp, input.pools);
  const authoritiesOk = authoritiesRevoked(input.checks);
  const fraudOk = !hasFraudFlags(input.checks, patterns);

  const reasons: string[] = [];
  if (!scoreOk) reasons.push(`composite below ${AA_MIN_SCORE}`);
  if (!ageOk) reasons.push(`on-chain age below ${AA_MIN_AGE_DAYS} days`);
  if (!lpOk) reasons.push("LP not PERMANENT/BURNED and Established-path liquidity not met");
  if (!authoritiesOk) reasons.push("mint/freeze authorities not revoked");
  if (!fraudOk) reasons.push("fraud flag present");

  return {
    eligible: scoreOk && ageOk && lpOk && authoritiesOk && fraudOk,
    scoreOk,
    ageOk,
    lpOk,
    authoritiesOk,
    fraudOk,
    ageDays,
    reasons,
  };
}

/**
 * Upgrade A \u2192 AA when every platinum gate holds. Never upgrades below A.
 */
export function applyAaIfEligible(
  score: number,
  grade: Grade,
  ctx: {
    checks: Check[];
    pools?: LiquidityPool[] | null;
    lp?: LpLockInfo | null;
    patterns?: Pattern[];
  },
): { grade: Grade; aa: AaEligibility } {
  const aa = evaluateAaEligibility({
    score,
    checks: ctx.checks,
    pools: ctx.pools,
    lp: ctx.lp,
    patterns: ctx.patterns,
  });
  if (grade === "A" && aa.eligible) {
    return { grade: "AA", aa };
  }
  return { grade, aa };
}
