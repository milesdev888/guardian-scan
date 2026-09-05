import type { Check, Grade, Pattern, PatternSeverity } from "@/lib/guardian/types";

const GRADE_ORDER: Grade[] = ["A", "B", "C", "D", "F"];

export function gradeFromScore(score: number): Grade {
  if (score >= 88) return "A";
  if (score >= 74) return "B";
  if (score >= 58) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function minGrade(a: Grade, b: Grade): Grade {
  if (a === "U") return b;
  if (b === "U") return a;
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}

export function daysAgo(timestamp: number | null | undefined): number | null {
  if (!timestamp) return null;
  const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  return Math.max(0, (Date.now() - ms) / 86_400_000);
}

export function formatAge(timestamp: number | null | undefined): string {
  const days = daysAgo(timestamp);
  if (days === null) return "unknown age";
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} hours`;
  if (days < 45) return `${Math.round(days)} days`;
  if (days < 365) return `${(days / 30).toFixed(1)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
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

export function compileReportMeta(checks: Check[], extraPatterns: Pattern[] = []) {
  let score = 100;
  const patterns = [...extraPatterns];

  for (const item of checks) {
    if (item.status === "unknown" || item.status === "unavailable") continue;
    if (item.grade === "B") score -= 6;
    if (item.grade === "C") score -= 14;
    if (item.grade === "D") score -= 24;
    if (item.grade === "F") score -= 38;
  }

  const critical = checks.filter((item) => item.grade === "F");
  const caution = checks.filter((item) => item.grade === "D" || item.grade === "C");

  if (critical.length) {
    score = Math.min(score, 39);
  } else if (caution.length >= 3) {
    score = Math.min(score, 57);
  }

  score = Math.max(8, Math.min(100, Math.round(score)));
  const grade = gradeFromScore(score);

  const flagTitles = checks
    .filter((item) => item.status === "flag")
    .map((item) => item.title.toLowerCase());

  const headline = flagTitles.length
    ? flagTitles.slice(0, 3).join(" · ")
    : "No high-severity patterns in the v2 checks";

  return { score, grade, headline, patterns };
}
