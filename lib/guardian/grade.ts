import type { Check, Grade, Pattern, PatternSeverity } from "@/lib/guardian/types";

const GRADE_ORDER: Grade[] = ["A", "B", "C", "D", "F"];

/** Letter → points for the weighted composite. U is excluded from the denominator. */
export const GRADE_POINTS: Record<Exclude<Grade, "U">, number> = {
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
  const msRaw = asFiniteNumber(timestamp);
  if (msRaw === null || msRaw <= 0) return null;
  const ms = msRaw < 10_000_000_000 ? msRaw * 1000 : msRaw;
  return Math.max(0, (Date.now() - ms) / 86_400_000);
}

export function formatAge(timestamp: number | null | undefined | string): string {
  const days = daysAgo(timestamp);
  if (days === null) return "unknown age";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} hours`;
  if (days < 45) return `${Math.round(days)} days`;
  if (days < 365) {
    const m = safeToFixed(days / 30, 1);
    return m ? `${m} months` : "unknown age";
  }
  const y = safeToFixed(days / 365, 1);
  return y ? `${y} years` : "unknown age";
}

export function formatPct(value: unknown): string {
  const n = asFiniteNumber(value);
  if (n === null) return "—";
  const fixed = safeToFixed(n, n >= 10 || n <= -10 ? 0 : 1);
  return fixed ? `${fixed}%` : "—";
}

export function formatUsd(value: unknown): string {
  const n = asFiniteNumber(value);
  if (n === null) return "—";
  if (Math.abs(n) >= 1_000_000) {
    const fixed = safeToFixed(n / 1_000_000, 1);
    return fixed ? `$${fixed}M` : "—";
  }
  if (Math.abs(n) >= 1_000) {
    const fixed = safeToFixed(n / 1_000, 1);
    return fixed ? `$${fixed}k` : "—";
  }
  const fixed = safeToFixed(n, 0);
  return fixed ? `$${fixed}` : "—";
}

export function shorten(address: string, size = 4) {
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + (address.startsWith("0x") ? 2 : 0))}…${address.slice(-size)}`;
}

export function check(partial: Omit<Check, "grade"> & { grade?: Grade }): Check {
  return {
    grade: partial.grade ?? (partial.status === "pass" ? "A" : partial.status === "unknown" ? "U" : "C"),
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

function headlineFromChecks(checks: Check[]): string {
  const byId = new Map(checks.map((item) => [item.id, item]));
  const bits: string[] = [];

  const lp = byId.get("lp_lock");
  if (lp && lp.grade !== "U") {
    const tier = typeof lp.evidence?.tier === "string" ? lp.evidence.tier : null;
    if (tier === "PERMANENT" || tier === "BURNED" || lp.grade === "A") {
      bits.push("Locked liquidity");
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
      ? flagTitles.slice(0, 3).join(" · ")
      : "No high-severity patterns in the v2 checks";
  }

  const [first, ...rest] = bits.slice(0, 3);
  if (!rest.length) return first;
  return `${first}, ${rest.join(", ")}`;
}

/**
 * Weighted composite score from check grades.
 * A=100 · B=80 · C=55 · D=30 · F=0. Grade U excluded from the denominator.
 */
export function compileReportMeta(checks: Check[], extraPatterns: Pattern[] = []) {
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
  const headline = headlineFromChecks(checks);

  return { score, grade, headline, patterns };
}
