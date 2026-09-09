"use client";

import { useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { Grade } from "@/lib/guardian/types";
import {
  composeShareOnXText,
  twitterHandleIsVerified,
  twitterTagDefaultOn,
  type TwitterHandleSource,
} from "@/lib/guardian/twitter-handle";
import { cn } from "@/lib/utils";

/**
 * Opens X compose intent with grade/score + scan URL (no price/hashtag spam).
 * Tag chip renders only for verified sources (token-metadata or curated).
 * Dex/Gecko handles are stored but never shown as a Tag — a wrong tag from
 * our UI is worse than none.
 */
export function ShareOnXButton({
  address,
  grade,
  score,
  twitterHandle = null,
  twitterHandleSource = null,
  emphasis = "secondary",
  shareVerifyUrl,
  badgeSerial,
}: {
  address: string;
  grade: Grade;
  score: number | null | undefined;
  twitterHandle?: string | null;
  twitterHandleSource?: TwitterHandleSource | null;
  /** Badged reports: Share leads (primary). Qualifying buy path: Share is secondary. */
  emphasis?: "primary" | "secondary";
  /** When badged, share the verify URL so the medallion/seal card unfurls. */
  shareVerifyUrl?: string;
  badgeSerial?: string;
}) {
  const scanOrigin = (
    process.env.NEXT_PUBLIC_SCAN_ORIGIN || "https://scan.cyre.dev"
  ).replace(/\/$/, "");
  const reportUrl = `${scanOrigin}/app?address=${encodeURIComponent(address)}`;
  const shareUrl = shareVerifyUrl || reportUrl;
  const scoreText =
    typeof score === "number" && Number.isFinite(score) ? String(Math.round(score)) : "-";

  const handle = twitterHandle && twitterHandle.startsWith("@") ? twitterHandle : null;
  const canTag = Boolean(handle) && twitterHandleIsVerified(twitterHandleSource);
  const [tagOn, setTagOn] = useState(() => twitterTagDefaultOn(twitterHandleSource));

  const shareText = useMemo(() => {
    if (badgeSerial) {
      const base = `Guardian Verified \u00b7 ${badgeSerial}\n${shareUrl}`;
      if (canTag && tagOn && handle) return `${base}\n${handle}`;
      return base;
    }
    return composeShareOnXText({
      grade,
      scoreText,
      reportUrl: shareUrl,
      tagHandle: handle,
      tagEnabled: canTag && tagOn,
    });
  }, [
    badgeSerial,
    shareUrl,
    canTag,
    tagOn,
    handle,
    grade,
    scoreText,
  ]);
  const shareHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={shareHref}
        target="_blank"
        rel="noreferrer"
        className={cn(
          buttonVariants({ variant: emphasis === "primary" ? "default" : "outline" }),
          "h-9 rounded-xl px-3 text-xs",
          emphasis === "primary" ? "font-semibold" : null,
        )}
      >
        Share on X
      </a>
      {canTag && handle ? (
        <button
          type="button"
          aria-pressed={tagOn}
          onClick={() => setTagOn((v) => !v)}
          className={cn(
            "h-9 rounded-xl border px-3 text-xs transition-colors",
            tagOn
              ? "border-primary/50 bg-primary/15 text-primary"
              : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
          )}
          title={
            twitterHandleSource === "token-metadata"
              ? "Handle from token metadata"
              : twitterHandleSource === "curated"
                ? "Handle from curated verified list"
                : "Tag handle in compose text"
          }
        >
          Tag {handle}
        </button>
      ) : null}
    </div>
  );
}
