/**
 * Guardian scan share card — 1600×1067 PNG via @napi-rs/canvas.
 * Visual target: gold-on-black dossier; seal TL; chips+icons; QR BR.
 * ALL painted text from registry/model — never URL params.
 * Use "locked", never "secured". Medallion only when badge.valid.
 */

import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import QRCode from "qrcode";
import type { ShareCardModel } from "@/lib/card/model";
import { chipColors, type ChipDef } from "@/lib/card/chips";
import {
  AA_PLATINUM,
  applyAaPlatinumCanvasFill,
  clearCanvasTextShadow,
} from "@/lib/guardian/aa-platinum";

export const CARD_WIDTH = 1600;
export const CARD_HEIGHT = 1067;
/** Compressed OG unfurl — long edge ~1024px, target under 300KB. */
export const CARD_OG_WIDTH = 1024;

let fontsReady = false;

function registerFonts() {
  if (fontsReady) return;
  // Literal paths + try/catch (no existsSync loop) — Turbopack flags
  // dynamic FS probes as whole-project tracing.
  const fonts: Array<[string, string]> = [
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVuSans"],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVuSans-Bold"],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "DejaVuSansMono"],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", "DejaVuSerif-Bold"],
    ["/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", "NotoColorEmoji"],
  ];
  for (const [file, name] of fonts) {
    try {
      GlobalFonts.registerFromPath(file, name);
    } catch {
      /* font missing on this host */
    }
  }
  fontsReady = true;
}

const FONT_UI = '"DejaVu Sans", "IBM Plex Sans", "Segoe UI", sans-serif';
const FONT_SERIF = '"DejaVu Serif", Georgia, "Times New Roman", serif';
const FONT_MONO = '"DejaVu Sans Mono", "IBM Plex Mono", Menlo, monospace';
const FONT_EMOJI = '"Noto Color Emoji", "DejaVu Sans", sans-serif';

/** Rounded rect via explicit arcs (not arcTo). arcTo with r≈h/2 produced
 *  degenerate end-caps — stray diagonals on the frame and curled chip tails. */
function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arc(x + w - radius, y + radius, radius, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2);
  ctx.lineTo(x + radius, y + h);
  ctx.arc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + radius);
  ctx.arc(x + radius, y + radius, radius, Math.PI, (3 * Math.PI) / 2);
  ctx.closePath();
}

function drawBackground(ctx: SKRSContext2D) {
  const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  g.addColorStop(0, "#0A0C10");
  g.addColorStop(0.4, "#12161C");
  g.addColorStop(1, "#080A0E");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // soft gold bloom behind seal
  const vg = ctx.createRadialGradient(220, 200, 20, 280, 260, 520);
  vg.addColorStop(0, "rgba(232,197,106,0.10)");
  vg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = "rgba(232,197,106,0.42)";
  ctx.lineWidth = 2.5;
  roundRect(ctx, 36, 36, CARD_WIDTH - 72, CARD_HEIGHT - 72, 32);
  ctx.stroke();
}

function drawFlatGoldG(ctx: SKRSContext2D, cx: number, cy: number, size: number) {
  ctx.save();
  const r = size / 2;
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, "#F0D78A");
  g.addColorStop(0.5, "#E8C56A");
  g.addColorStop(1, "#B8923A");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,16,8,0.35)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#1A1408";
  ctx.font = `700 ${Math.round(size * 0.52)}px ${FONT_SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("G", cx, cy + size * 0.03);
  ctx.restore();
}

function drawLockIcon(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  color: string,
  open: boolean,
  scale = 1,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3 * scale;
  ctx.lineCap = "round";
  const s = scale;
  ctx.beginPath();
  if (open) {
    ctx.arc(x + 10 * s, y + 8 * s, 8 * s, Math.PI, Math.PI * 1.85);
  } else {
    ctx.arc(x + 10 * s, y + 8 * s, 8 * s, Math.PI, 0);
  }
  ctx.stroke();
  roundRect(ctx, x + 2 * s, y + 14 * s, 16 * s, 14 * s, 3 * s);
  ctx.fill();
  ctx.restore();
}

/** Small chip glyph — gold outline style matching visual target. */
function drawChipIcon(ctx: SKRSContext2D, id: string, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (id === "LP_PERMANENT" || id === "GUARDIAN_VERIFIED" || id === "AUTHORITIES_REVOKED") {
    drawLockIcon(ctx, cx - 10, cy - 14, color, false, 0.85);
  } else if (id === "LP_UNLOCKED" || id === "LP_UNVERIFIED") {
    drawLockIcon(ctx, cx - 10, cy - 14, color, true, 0.85);
  } else if (id === "YOUNG_TOKEN") {
    // sprout
    ctx.beginPath();
    ctx.moveTo(cx, cy + 10);
    ctx.lineTo(cx, cy - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - 6, cy - 2, 7, 4, -0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy - 6, 6, 3.5, 0.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === "DISPERSED_HOLDERS" || id === "CONCENTRATED_HOLDERS") {
    // three-person silhouette
    for (const ox of [-10, 0, 10]) {
      ctx.beginPath();
      ctx.arc(cx + ox, cy - 6, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + ox, cy + 6, 6, 5, 0, Math.PI, 0);
      ctx.fill();
    }
  } else if (id === "DISTRIBUTED_LIQUIDITY") {
    // three pool dots
    for (const ox of [-8, 0, 8]) {
      ctx.beginPath();
      ctx.arc(cx + ox, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (id === "HONEYPOT" || id === "FRAUD_FLAG" || id === "REVOKED") {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx + 10, cy + 8);
    ctx.lineTo(cx - 10, cy + 8);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + 4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 1, cy - 6, 2, 7);
  } else if (id === "ESTABLISHED") {
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 2);
    ctx.lineTo(cx - 2, cy + 9);
    ctx.lineTo(cx + 10, cy - 8);
    ctx.stroke();
  } else {
    // generic diamond
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 8, cy);
    ctx.lineTo(cx, cy + 8);
    ctx.lineTo(cx - 8, cy);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function lpToneColor(tone: ShareCardModel["lp"]["tone"]): string {
  if (tone === "green") return "#3DDC97";
  if (tone === "gold") return "#E8C56A";
  if (tone === "amber") return "#E09A3C";
  return "#9AA4B2";
}

async function drawQr(ctx: SKRSContext2D, url: string, x: number, y: number, size: number) {
  const dataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    width: size,
    color: { dark: "#0B1018", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });
  const img = await loadImage(dataUrl);
  roundRect(ctx, x - 10, y - 10, size + 20, size + 20, 10);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.drawImage(img, x, y, size, size);
}

async function loadSealMark(serial: string | null) {
  // Prefer live seal when serial known (closer to visual target); else medallion.
  // Runtime fetch — keep the guardian-scan repo free of multi-MB seal PNGs.
  const urls: string[] = [];
  if (serial) {
    urls.push(`https://cyre.dev/api/seal/${encodeURIComponent(serial)}/og.png`);
  }
  urls.push("https://cyre.dev/brand/seals/guardian-seal-medallion.png");
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      return await loadImage(buf);
    } catch {
      /* try next */
    }
  }
  return null;
}

function drawChip(
  ctx: SKRSContext2D,
  chip: ChipDef,
  x: number,
  y: number,
): number {
  const colors = chipColors(chip.kind);
  // Visual target: gold-outline hollow chips (positive) with icons
  const outlineGold = chip.kind !== "fraud" && chip.kind !== "risk";
  const border = outlineGold ? "rgba(232,197,106,0.75)" : colors.border;
  const fg = outlineGold ? "#E8C56A" : colors.fg;
  const bg = outlineGold ? "rgba(0,0,0,0.25)" : colors.bg;

  ctx.font = `600 20px ${FONT_UI}`;
  const tw = ctx.measureText(chip.label).width;
  const iconSlot = 28;
  const padL = 14;
  const padR = 18;
  const w = iconSlot + padL + tw + padR;
  const h = 48;

  ctx.fillStyle = bg;
  // Radius < h/2 so end-caps stay true quarter-circles (pill, not degenerate).
  roundRect(ctx, x, y, w, h, 20);
  ctx.fill();
  roundRect(ctx, x, y, w, h, 20);
  ctx.strokeStyle = outlineGold ? "#E8C56A" : colors.border;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";

  drawChipIcon(ctx, chip.id, x + 22, y + h / 2, fg);
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(chip.label, x + iconSlot + padL, y + h / 2);
  ctx.textBaseline = "alphabetic";
  return w;
}

/**
 * Render share card PNG. Never throws on missing numerics — model already uses "—".
 */
export async function renderShareCardPng(model: ShareCardModel): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);

  // Large seal top-left (visual target)
  const markSize = 220;
  const markX = 150;
  const markY = 190;

  if (model.showMedallion) {
    const img = await loadSealMark(model.badgeSerial);
    if (img) {
      ctx.drawImage(img, markX - markSize / 2, markY - markSize / 2, markSize, markSize);
    } else {
      drawFlatGoldG(ctx, markX, markY, markSize);
    }
  } else {
    drawFlatGoldG(ctx, markX, markY, markSize);
  }

  // NAME $TICKER on one line; — CHAIN beneath.
  // Safe-zone: frame inset is 36px; keep ≥48px from frame to glyph top
  // (56px serif ascent ≈ 44px → baseline ≥ 128; use 176 for clear padding).
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const textLeft = 300;
  const nameBaseline = 196;
  const chainBaseline = 244;
  const titleMaxRight = CARD_WIDTH - 280; // leave room for QR / right margin
  ctx.fillStyle = "#F4F1EA";
  ctx.font = `700 56px ${FONT_SERIF}`;
  let name = model.tokenName;
  while (name.length > 4 && ctx.measureText(name).width + textLeft > titleMaxRight - 160) {
    name = `${name.slice(0, Math.max(1, name.length - 2))}…`;
  }
  if (name.length > 28) name = `${name.slice(0, 26)}…`;
  const tickerHasEmoji = /[^\u0000-\u00ff]/.test(model.ticker);
  const nameWidth = ctx.measureText(name).width;
  ctx.fillText(name, textLeft, nameBaseline);

  ctx.fillStyle = "#E8C56A";
  ctx.font = tickerHasEmoji
    ? `600 48px ${FONT_EMOJI}`
    : `600 48px ${FONT_SERIF}`;
  ctx.fillText(model.ticker, textLeft + nameWidth + 18, nameBaseline);

  ctx.fillStyle = "#C9A84A";
  ctx.font = `500 26px ${FONT_UI}`;
  ctx.fillText(`— ${model.chainName.toUpperCase()}`, textLeft, chainBaseline);

  // Grade line
  const gradeY = 360;
  let aaExtra = 0;
  if (model.grade === "AA") {
    aaExtra = 28;
    const aaLabel = "Grade AA";
    ctx.font = `700 48px ${FONT_SERIF}`;
    applyAaPlatinumCanvasFill(ctx, 88, gradeY - 40, gradeY + 6);
    ctx.fillText(aaLabel, 88, gradeY);
    clearCanvasTextShadow(ctx);

    const aaWidth = ctx.measureText(aaLabel).width;
    ctx.fillStyle = "#8B95A3";
    ctx.font = `600 40px ${FONT_SERIF}`;
    const rest = model.gradeLine.replace(/^Grade AA\s*/, " ");
    ctx.fillText(rest, 88 + aaWidth, gradeY);

    ctx.font = `500 18px ${FONT_SERIF}`;
    applyAaPlatinumCanvasFill(ctx, 88, gradeY + 10, gradeY + 30);
    ctx.fillText(AA_PLATINUM.wordmark, 88, gradeY + 28);
    clearCanvasTextShadow(ctx);
  } else {
    ctx.fillStyle = model.gradeColor;
    ctx.font = `700 48px ${FONT_SERIF}`;
    ctx.fillText(model.gradeLine, 88, gradeY);
  }

  // Gold hairline under grade (visual target)
  const lineY = 392 + aaExtra;
  ctx.strokeStyle = "rgba(232,197,106,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(88, lineY);
  ctx.lineTo(980, lineY);
  ctx.stroke();

  // LP line — registry text only ("locked", never "secured")
  const lpColor = lpToneColor(model.lp.tone);
  const lpY = 420 + aaExtra;
  drawLockIcon(ctx, 88, lpY, lpColor, model.lp.icon === "lock-open", 1.15);
  ctx.fillStyle = lpColor;
  ctx.font = `700 32px ${FONT_UI}`;
  ctx.fillText(model.lp.text, 128, lpY + 28);

  // Full mint monospace — byte-exact from model.mint
  ctx.fillStyle = "#B8C0CC";
  ctx.font = `500 24px ${FONT_MONO}`;
  const mint = model.mint;
  if (mint.length > 52) {
    ctx.fillText(mint.slice(0, 44), 88, 510 + aaExtra);
    ctx.fillText(mint.slice(44), 88, 542 + aaExtra);
  } else {
    ctx.fillText(mint, 88, 510 + aaExtra);
  }

  // Pattern chips with icons (max 4)
  let chipX = 88;
  const chipY = 600 + aaExtra;
  for (const chip of model.chips.slice(0, 4)) {
    const w = drawChip(ctx, chip, chipX, chipY);
    chipX += w + 14;
  }

  // Footer
  ctx.fillStyle = "#6B7380";
  ctx.font = `400 20px ${FONT_UI}`;
  ctx.fillText(model.footer, 88, CARD_HEIGHT - 72);

  // White QR bottom-right
  await drawQr(ctx, model.reportUrl, CARD_WIDTH - 230, CARD_HEIGHT - 250, 160);

  return Buffer.from(canvas.toBuffer("image/png"));
}

/**
 * Downscale a full-res share card for OG/Twitter unfurls (~1024px long edge).
 * Full 1600×1067 remains at /api/card/<mint>.png.
 */
export async function compressShareCardPng(
  fullPng: Buffer,
  maxWidth: number = CARD_OG_WIDTH,
): Promise<Buffer> {
  const img = await loadImage(fullPng);
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  if (w === img.width && h === img.height) {
    return Buffer.from(fullPng);
  }
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return Buffer.from(canvas.toBuffer("image/png"));
}

/** Render full card then compress for OG crawlers. */
export async function renderShareCardOgPng(model: ShareCardModel): Promise<Buffer> {
  const full = await renderShareCardPng(model);
  return compressShareCardPng(full, CARD_OG_WIDTH);
}
