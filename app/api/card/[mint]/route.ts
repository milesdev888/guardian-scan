import { NextRequest } from "next/server";
import { lookupBadgeForMint } from "@/lib/card/badge";
import { buildShareCardModel } from "@/lib/card/model";
import { renderShareCardPng } from "@/lib/card/render";
import { loadScanForCard } from "@/lib/card/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

function normalizeMintParam(raw: string): string {
  return decodeURIComponent(raw).replace(/\.png$/i, "").trim();
}

function publicOrigin(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SCAN_ORIGIN || process.env.SCAN_PUBLIC_ORIGIN;
  if (env) return env.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return "https://scan.cyre.dev";
}

/**
 * GET /api/card/<mint>.png
 * Serving discipline mirrors /api/seal/<serial>.png:
 * path param is lookup key only — all painted text comes from stored scan + badge records.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mint: string }> },
) {
  const { mint: raw } = await context.params;
  const mint = normalizeMintParam(raw);
  if (!mint || mint.length < 32) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const report = await loadScanForCard(mint);
    // Ignore any query string text — only mint path is used for lookup.
    const badge = await lookupBadgeForMint(report.token.address);
    const model = buildShareCardModel(report, badge, {
      publicOrigin: publicOrigin(request),
    });
    const png = await renderShareCardPng(model);

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
        "X-Guardian-Card": model.grade,
        "X-Guardian-Card-Mint": model.mint,
        "X-Guardian-Card-Badge": model.showMedallion ? "VALID" : model.badgeStatus || "NONE",
        "Content-Length": String(png.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Card render failed";
    return new Response(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ mint: string }> },
) {
  const res = await GET(request, context);
  return new Response(null, { status: res.status, headers: res.headers });
}
