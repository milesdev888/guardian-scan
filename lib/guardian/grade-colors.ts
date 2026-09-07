/**
 * Unified Guardian grade palette — scanner UI, share cards, seal bands.
 * Red is reserved exclusively for fraud flags / revocation — never for a low grade.
 */

import type { Grade } from "@/lib/guardian/types";

export const GRADE_HEX: Record<Exclude<Grade, "U"> | "U", string> = {
  AA: "#E5E4E2", // platinum
  A: "#E8C56A", // gold
  B: "#5FD0FF", // ice
  C: "#9AA4B2", // grey
  D: "#E09A3C", // amber
  F: "#E09A3C", // amber — not red
  U: "#9AA4B2",
};

/** Cool sheen stops for AA platinum surfaces (canvas / CSS gradients). */
export const AA_PLATINUM_SHEEN = {
  hi: "#F7F8FA",
  mid: "#E5E4E2",
  lo: "#B8BEC8",
} as const;

/** Tailwind class bundles matching GRADE_HEX (no red on D/F). */
export const GRADE_TILE_CLASS: Record<Grade, string> = {
  AA: "border-[#E5E4E2]/50 bg-gradient-to-br from-[#F7F8FA]/25 via-[#E5E4E2]/15 to-[#B8BEC8]/20 text-[#E5E4E2]",
  A: "border-[#E8C56A]/45 bg-[#E8C56A]/10 text-[#E8C56A]",
  B: "border-[#5FD0FF]/45 bg-[#5FD0FF]/10 text-[#5FD0FF]",
  C: "border-[#9AA4B2]/40 bg-[#9AA4B2]/10 text-[#9AA4B2]",
  D: "border-[#E09A3C]/45 bg-[#E09A3C]/10 text-[#E09A3C]",
  F: "border-[#E09A3C]/45 bg-[#E09A3C]/10 text-[#E09A3C]",
  U: "border-border bg-secondary text-muted-foreground",
};

export function gradeHex(grade: Grade | string | null | undefined): string {
  const g = String(grade || "U").toUpperCase() as Grade;
  return GRADE_HEX[g] ?? GRADE_HEX.U;
}
