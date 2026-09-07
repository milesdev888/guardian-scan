/**
 * Guardian scan share card — 1600×1067 PNG via @napi-rs/canvas.
 * Visual target: dark dossier card; medallion only when badge.valid.
 */

import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import QRCode from "qrcode";
import path from "node:path";
import fs from "node:fs";
import type { ShareCardModel } from "@/lib/card/model";
import { chipColors } from "@/lib/card/chips";

export const CARD_WIDTH = 1600;
export const CARD_HEIGHT = 1067;

let fontsReady = false;

function registerFonts() {
  if (fontsReady) return;
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
    path.join(process.cwd(), "public/brand/fonts/NotoColorEmoji.ttf"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const base = path.basename(p, path.extname(p));
      GlobalFonts.registerFromPath(p, base);
    } catch {
      /* ignore */
    }
  }
  fontsReady = true;
}

const FONT_UI = '"DejaVu Sans", "IBM Plex Sans", "Segoe UI", sans-serif';
const FONT_SERIF = '"DejaVu Serif", Georgia, "Times New Roman", serif';
const FONT_MONO = '"DejaVu Sans Mono", "IBM Plex Mono", Menlo, monospace';
const FONT_EMOJI = '"Noto Color Emoji", "DejaVu Sans", sans-serif';

function assetPath(...parts: string[]): string | null {
  const candidates = [
    path.join(process.cwd(), "public", ...parts),
    path.join(process.cwd(), ...parts),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawBackground(ctx: SKRSContext2D) {
  const g = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  g.addColorStop(0, "#0B1018");
  g.addColorStop(0.45, "#121A24");
  g.addColorStop(1, "#0A0E14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // subtle vignette / grain bands
  const vg = ctx.createRadialGradient(
    CARD_WIDTH * 0.2,
    CARD_HEIGHT * 0.15,
    40,
    CARD_WIDTH * 0.35,
    CARD_HEIGHT * 0.4,
    900,
  );
  vg.addColorStop(0, "rgba(232,197,106,0.07)");
  vg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = "rgba(232,197,106,0.28)";
  ctx.lineWidth = 2;
  roundRect(ctx, 28, 28, CARD_WIDTH - 56, CARD_HEIGHT - 56, 28);
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
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  // shackle
  ctx.beginPath();
  if (open) {
    ctx.arc(x + 10, y + 8, 8, Math.PI, Math.PI * 1.85);
  } else {
    ctx.arc(x + 10, y + 8, 8, Math.PI, 0);
  }
  ctx.stroke();
  // body
  roundRect(ctx, x + 2, y + 14, 16, 14, 3);
  ctx.fill();
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
    color: { dark: "#0B1018", light: "#F5E6C0" },
    errorCorrectionLevel: "M",
  });
  const img = await loadImage(dataUrl);
  roundRect(ctx, x - 8, y - 8, size + 16, size + 16, 12);
  ctx.fillStyle = "#F5E6C0";
  ctx.fill();
  ctx.drawImage(img, x, y, size, size);
}

async function loadMedallionImage() {
  const local =
    assetPath("brand", "seals", "guardian-seal-medallion.png") ||
    assetPath("brand", "seals", "guardian-seal-valid-128.png");
  if (local) {
    try {
      return await loadImage(local);
    } catch {
      /* fall through */
    }
  }
  // Runtime fetch — keep the guardian-scan repo free of multi-MB seal PNGs.
  try {
    const res = await fetch("https://cyre.dev/brand/seals/guardian-seal-medallion.png", {
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch {
    return null;
  }
}

/**
 * Render share card PNG. Never throws on missing numerics — model already uses "—".
 */
export async function renderShareCardPng(model: ShareCardModel): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);

  const markX = 120;
  const markY = 140;
  const markSize = 140;

  if (model.showMedallion) {
    const img = await loadMedallionImage();
    if (img) {
      ctx.drawImage(img, markX - markSize / 2, markY - markSize / 2, markSize, markSize);
    } else {
      drawFlatGoldG(ctx, markX, markY, markSize);
    }
  } else {
    drawFlatGoldG(ctx, markX, markY, markSize);
  }

  // Token name + ticker (top-right of left cluster / center-right)
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const textLeft = 220;
  ctx.fillStyle = "#F4F1EA";
  ctx.font = `600 54px ${FONT_SERIF}`;
  const name = model.tokenName.length > 36 ? `${model.tokenName.slice(0, 34)}…` : model.tokenName;
  ctx.fillText(name, textLeft, 118);

  ctx.fillStyle = "#E8C56A";
  // Emoji tickers need the color-emoji face; ASCII tickers use UI sans.
  const tickerHasEmoji = /[^\u0000-\u00ff]/.test(model.ticker);
  ctx.font = tickerHasEmoji
    ? `500 36px ${FONT_EMOJI}`
    : `500 36px ${FONT_UI}`;
  ctx.fillText(model.ticker, textLeft, 168);

  ctx.fillStyle = "#8B95A3";
  ctx.font = `500 22px ${FONT_UI}`;
  ctx.fillText(model.chainName.toUpperCase(), textLeft, 206);

  // Grade line
  ctx.fillStyle = model.gradeColor;
  ctx.font = `700 44px ${FONT_UI}`;
  ctx.fillText(model.gradeLine, 88, 320);

  // LP line
  const lpColor = lpToneColor(model.lp.tone);
  drawLockIcon(ctx, 88, 360, lpColor, model.lp.icon === "lock-open");
  ctx.fillStyle = lpColor;
  ctx.font = `600 30px ${FONT_UI}`;
  ctx.fillText(model.lp.text, 120, 386);

  // Full mint monospace
  ctx.fillStyle = "#A8B0BC";
  ctx.font = `500 22px ${FONT_MONO}`;
  const mint = model.mint;
  // wrap if needed
  if (mint.length > 52) {
    ctx.fillText(mint.slice(0, 44), 88, 460);
    ctx.fillText(mint.slice(44), 88, 490);
  } else {
    ctx.fillText(mint, 88, 460);
  }

  // Pattern chips (max 4)
  let chipX = 88;
  const chipY = 560;
  for (const chip of model.chips.slice(0, 4)) {
    const colors = chipColors(chip.kind);
    ctx.font = `600 20px ${FONT_UI}`;
    const tw = ctx.measureText(chip.label).width;
    const padX = 18;
    const w = tw + padX * 2;
    const h = 44;
    ctx.fillStyle = colors.bg;
    roundRect(ctx, chipX, chipY, w, h, 22);
    ctx.fill();
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = colors.fg;
    ctx.textBaseline = "middle";
    ctx.fillText(chip.label, chipX + padX, chipY + h / 2);
    ctx.textBaseline = "alphabetic";
    chipX += w + 14;
  }

  // Footer
  ctx.fillStyle = "#6B7380";
  ctx.font = `400 20px ${FONT_UI}`;
  ctx.fillText(model.footer, 88, CARD_HEIGHT - 72);

  // QR bottom-right → full report
  await drawQr(ctx, model.reportUrl, CARD_WIDTH - 220, CARD_HEIGHT - 240, 160);

  ctx.fillStyle = "#8B95A3";
  ctx.font = `500 16px ${FONT_UI}`;
  ctx.textAlign = "center";
  ctx.fillText("Full report", CARD_WIDTH - 140, CARD_HEIGHT - 58);
  ctx.textAlign = "left";

  return Buffer.from(canvas.toBuffer("image/png"));
}
