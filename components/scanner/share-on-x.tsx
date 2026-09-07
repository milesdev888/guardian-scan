"use client";

import { buttonVariants } from "@/components/ui/button";
import type { Grade } from "@/lib/guardian/types";
import { cn } from "@/lib/utils";

/**
 * Opens X compose intent with grade/score + scan URL (no price/hashtag spam).
 * Card unfurl comes from report-page OG tags → /api/card/<mint>/og.png.
 */
export function ShareOnXButton({
  address,
  grade,
  score,
}: {
  address: string;
  grade: Grade;
  score: number | null | undefined;
}) {
  const scanOrigin = (
    process.env.NEXT_PUBLIC_SCAN_ORIGIN || "https://scan.cyre.dev"
  ).replace(/\/$/, "");
  const reportUrl = `${scanOrigin}/app?address=${encodeURIComponent(address)}`;
  const scoreText =
    typeof score === "number" && Number.isFinite(score) ? String(Math.round(score)) : "—";
  const shareText = `Scanned with Guardian — grade ${grade} · ${scoreText}/100\n${reportUrl}`;
  const shareHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <a
      href={shareHref}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "outline" }), "h-9 rounded-xl px-3 text-xs")}
    >
      Share on X
    </a>
  );
}
