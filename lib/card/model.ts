/**
 * Share-card display model — every string rendered on the PNG.
 * Built only from stored scan records + badge lookup (never URL text params).
 */

import { asFiniteNumber, safeToFixed } from "@/lib/guardian/grade";
import type { Grade, GuardianReport } from "@/lib/guardian/types";
import {
  mapShareCardChips,
  type BadgeCardStatus,
  type ChipDef,
} from "@/lib/card/chips";
import { buildLpLine, type LpLine } from "@/lib/card/lp-line";

export const CARD_FOOTER =
  "Guardian reports grades and on-chain patterns, not a verdict.";

export const GRADE_COLORS: Record<Exclude<Grade, "U"> | "U", string> = {
  A: "#E8C56A",
  B: "#5FD0FF",
  C: "#9AA4B2",
  D: "#E09A3C",
  F: "#E09A3C",
  U: "#9AA4B2",
};

export type ShareCardModel = {
  mint: string;
  tokenName: string;
  ticker: string;
  chainName: string;
  grade: Grade;
  gradeColor: string;
  /** e.g. "Grade B · composite 73/100" — score uses — when non-finite */
  gradeLine: string;
  scoreDisplay: string;
  lp: LpLine;
  chips: ChipDef[];
  /** Valid badge → medallion; otherwise flat gold G (REVOKED is not valid). */
  showMedallion: boolean;
  badgeStatus: string | null;
  badgeSerial: string | null;
  footer: string;
  reportUrl: string;
  scannedAt: string;
};

function safeName(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  return s || "—";
}

/** Prefer printable ticker; emoji-only symbols stay as-is for canvas. */
function safeTicker(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  return s ? `$${s}` : "$—";
}

function scoreText(score: unknown): string {
  const n = asFiniteNumber(score);
  if (n === null) return "—";
  const fixed = safeToFixed(n, 0);
  return fixed ?? "—";
}

export function buildShareCardModel(
  report: GuardianReport,
  badge: BadgeCardStatus | null,
  opts?: { publicOrigin?: string },
): ShareCardModel {
  const mint = report.token.address;
  const grade = report.grade;
  const scoreDisplay = scoreText(report.score);
  const gradeColor = GRADE_COLORS[grade] ?? GRADE_COLORS.C;
  const origin = (opts?.publicOrigin || "https://scan.cyre.dev").replace(/\/$/, "");
  const reportUrl = `${origin}/app?address=${encodeURIComponent(mint)}`;

  const showMedallion = Boolean(badge?.valid);
  const chips = mapShareCardChips(report, badge);
  const lp = buildLpLine(report, badge);

  return {
    mint,
    tokenName: safeName(report.token.name),
    ticker: safeTicker(report.token.symbol),
    chainName: report.chain.name || "—",
    grade,
    gradeColor,
    gradeLine: `Grade ${grade} · composite ${scoreDisplay}/100`,
    scoreDisplay,
    lp,
    chips,
    showMedallion,
    badgeStatus: badge?.status ?? null,
    badgeSerial: badge?.serial ?? null,
    footer: CARD_FOOTER,
    reportUrl,
    scannedAt: report.scannedAt,
  };
}

/** Flat list of every string painted on the card — for character-match tests. */
export function cardTextFingerprint(model: ShareCardModel): string[] {
  return [
    model.tokenName,
    model.ticker,
    model.chainName,
    model.gradeLine,
    model.lp.text,
    model.mint,
    ...model.chips.map((c) => c.label),
    model.footer,
  ];
}
