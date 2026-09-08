/**
 * AA metallic platinum — single style definition for scanner tile, share card,
 * and (mirrored) Cyre seal path-word. Do not fork gradient stops elsewhere.
 *
 * Visual target: serif AA + lowercase “platinum” wordmark, vertical metal sheen
 * (bright silver → #E5E4E2 → steel), thin brighter platinum border stroke.
 *
 * Cyre seal mirror: /brand/aa-platinum.js (keep hex/rgb in lockstep).
 */

export const AA_PLATINUM = {
  /** Canonical mid / flat fallback (GRADE_HEX.AA). */
  mid: "#E5E4E2",
  /** Bright silver-white highlight (top of letter). */
  peak: "#FFFFFF",
  hi: "#F7F8FA",
  /** Darker steel at the base of the letter. */
  lo: "#7A808A",
  steel: "#5A6068",
  /** Border stroke — slightly brighter than the fill. */
  borderPeak: "#FFFFFF",
  borderHi: "#F2F3F5",
  borderLo: "#A8AEB8",
  /** Dark tile well behind the metal type. */
  tileBg: "#0C0D0F",
  wordmark: "platinum",
  /** RGB companions for canvas / seal atlas tint. */
  rgb: {
    peak: [255, 255, 255] as const,
    hi: [247, 248, 250] as const,
    mid: [229, 228, 226] as const,
    lo: [122, 128, 138] as const,
    steel: [90, 96, 104] as const,
    borderHi: [242, 243, 245] as const,
    borderLo: [168, 174, 184] as const,
  },
} as const;

export type AaPlatinum = typeof AA_PLATINUM;

/** Vertical metallic fill for CSS `background-image` (text + borders). */
export const AA_PLATINUM_TEXT_GRADIENT = `linear-gradient(180deg, ${AA_PLATINUM.peak} 0%, ${AA_PLATINUM.hi} 14%, ${AA_PLATINUM.mid} 48%, ${AA_PLATINUM.lo} 82%, ${AA_PLATINUM.steel} 100%)`;

/** Thin frame stroke — a touch brighter than the letter fill. */
export const AA_PLATINUM_BORDER_GRADIENT = `linear-gradient(145deg, ${AA_PLATINUM.borderPeak} 0%, ${AA_PLATINUM.borderHi} 38%, ${AA_PLATINUM.mid} 70%, ${AA_PLATINUM.borderLo} 100%)`;

/**
 * Apply vertical AA platinum fill + faint depth to a canvas 2D context.
 * Call immediately before `fillText` (sets fillStyle / shadow).
 */
export function applyAaPlatinumCanvasFill(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  x: number,
  yTop: number,
  yBottom: number,
): void {
  const g = ctx.createLinearGradient(x, yTop, x, yBottom);
  g.addColorStop(0, AA_PLATINUM.peak);
  g.addColorStop(0.14, AA_PLATINUM.hi);
  g.addColorStop(0.48, AA_PLATINUM.mid);
  g.addColorStop(0.82, AA_PLATINUM.lo);
  g.addColorStop(1, AA_PLATINUM.steel);
  ctx.fillStyle = g;
  // Faint drop for depth (bevel highlight is the top gradient stop).
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 1.5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
}

export function clearCanvasTextShadow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
): void {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** @deprecated Prefer AA_PLATINUM — kept for existing imports. */
export const AA_PLATINUM_SHEEN = {
  hi: AA_PLATINUM.hi,
  mid: AA_PLATINUM.mid,
  lo: AA_PLATINUM.lo,
} as const;
