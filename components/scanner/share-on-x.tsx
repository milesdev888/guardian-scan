"use client";

import { useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { Grade } from "@/lib/guardian/types";
import {
  composeShareOnXText,
  twitterTagDefaultOn,
  type TwitterHandleSource,
} from "@/lib/guardian/twitter-handle";
import { cn } from "@/lib/utils";

/**
 * Opens X compose intent with grade/score + scan URL (no price/hashtag spam).
 * When a known handle exists, offers a Tag chip — ON by default only for
 * token-metadata sources; OFF for Dex/Gecko profile data.
 * Card unfurl comes from report-page OG tags → /api/card/<mint>/og.png.
 */
export function ShareOnXButton({
  address,
  grade,
  score,
  twitterHandle = null,
  twitterHandleSource = null,
}: {
  address: string;
  grade: Grade;
  score: number | null | undefined;
  twitterHandle?: string | null;
  twitterHandleSource?: TwitterHandleSource | null;
}) {
  const scanOrigin = (
    process.env.NEXT_PUBLIC_SCAN_ORIGIN || "https://scan.cyre.dev"
  ).replace(/\/$/, "");
  const reportUrl = `${scanOrigin}/app?address=${encodeURIComponent(address)}`;
  const scoreText =
    typeof score === "number" && Number.isFinite(score) ? String(Math.round(score)) : "—";

  const handle = twitterHandle && twitterHandle.startsWith("@") ? twitterHandle : null;
  const canTag = Boolean(handle);
  const [tagOn, setTagOn] = useState(() => twitterTagDefaultOn(twitterHandleSource));

  const shareText = useMemo(
    () =>
      composeShareOnXText({
        grade,
        scoreText,
        reportUrl,
        tagHandle: handle,
        tagEnabled: canTag && tagOn,
      }),
    [grade, scoreText, reportUrl, handle, canTag, tagOn],
  );
  const shareHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={shareHref}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: "outline" }), "h-9 rounded-xl px-3 text-xs")}
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
              : twitterHandleSource
                ? `Handle from ${twitterHandleSource}`
                : "Tag handle in compose text"
          }
        >
          Tag {handle}
        </button>
      ) : null}
    </div>
  );
}
