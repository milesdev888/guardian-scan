"use client";

import { useEffect, useState } from "react";
import { ShareOnXButton } from "@/components/scanner/share-on-x";
import { buttonVariants } from "@/components/ui/button";
import type { Grade } from "@/lib/guardian/types";
import type { TwitterHandleSource } from "@/lib/guardian/twitter-handle";
import { cn } from "@/lib/utils";

type QualifyResponse = {
  ok?: boolean;
  eligible?: boolean;
  showBuy?: boolean;
  alreadyIssued?: boolean;
  cta?: string;
  checkoutUrl?: string;
  verifyUrl?: string;
  badge?: { serial: string };
};

const QUALIFY_API =
  process.env.NEXT_PUBLIC_GUARDIAN_QUALIFY_API || "https://cyre.dev/api/badge/qualify";
const SITE = (process.env.NEXT_PUBLIC_GUARDIAN_SITE_URL || "https://cyre.dev").replace(/\/$/, "");

const BUY_LABEL = "Get Guardian Verified — $25";

/**
 * Report action row:
 * - Qualifying + unissued → gold PRIMARY buy, then Share on X (secondary)
 * - Non-qualifying → Share only (no buy)
 * - Already badged → Share on X leads (primary), buy disappears
 */
export function ReportActionBar({
  mint,
  grade,
  score,
  twitterHandle = null,
  twitterHandleSource = null,
}: {
  mint: string;
  grade: Grade;
  score: number | null | undefined;
  twitterHandle?: string | null;
  twitterHandleSource?: TwitterHandleSource | null;
}) {
  const [data, setData] = useState<QualifyResponse | null>(null);

  useEffect(() => {
    if (!mint) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${QUALIFY_API}?mint=${encodeURIComponent(mint)}`, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as QualifyResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mint]);

  const badged = Boolean(data?.alreadyIssued && data.badge?.serial);
  const showBuy = Boolean(data?.showBuy && data.checkoutUrl && !badged);
  const checkoutUrl =
    data?.checkoutUrl || `${SITE}/order?mint=${encodeURIComponent(mint)}`;

  const buyBtn = showBuy ? (
    <a
      href={checkoutUrl}
      className={cn(
        buttonVariants({ variant: "default" }),
        "h-9 rounded-xl px-4 text-xs font-semibold no-underline",
      )}
    >
      {BUY_LABEL}
    </a>
  ) : null;

  const shareBtn = (
    <ShareOnXButton
      key={`${mint}:${twitterHandle ?? ""}:${badged ? "badged" : "scan"}`}
      address={mint}
      grade={grade}
      score={score}
      twitterHandle={twitterHandle}
      twitterHandleSource={twitterHandleSource}
      emphasis={badged ? "primary" : "secondary"}
      shareVerifyUrl={badged ? data?.verifyUrl || undefined : undefined}
      badgeSerial={badged ? data?.badge?.serial : undefined}
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {badged ? (
        <>
          {shareBtn}
        </>
      ) : showBuy ? (
        <>
          {buyBtn}
          {shareBtn}
        </>
      ) : (
        <>{shareBtn}</>
      )}
    </div>
  );
}
