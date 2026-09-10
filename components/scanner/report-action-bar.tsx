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

/** Primary CTA on every graded report — qualify is a live check, not a gate on visibility. */
const GET_VERIFIED_LABEL = "Get Verified";
const BUY_LABEL = "Get Guardian Verified \u2014 $25";

/**
 * Report action row (every graded report):
 * - Always show Get Verified → /order?mint=… (or qualify checkoutUrl when eligible)
 * - Qualifying + unissued → gold buy emphasis ($25)
 * - Already badged → Share leads; Get Verified hidden (verify via Share / seal)
 * - Non-qualifying → Get Verified still visible (order page explains gate)
 */
export function ReportActionBar({
  mint,
  grade,
  score,
  scanId = null,
  twitterHandle = null,
  twitterHandleSource = null,
}: {
  mint: string;
  grade: Grade;
  score: number | null | undefined;
  scanId?: string | null;
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
  const qualifyingBuy = Boolean(data?.showBuy && data.checkoutUrl && !badged);
  const checkoutUrl =
    data?.checkoutUrl || `${SITE}/order?mint=${encodeURIComponent(mint)}`;

  const verifiedBtn = !badged ? (
    <a
      href={checkoutUrl}
      data-testid="get-verified"
      className={cn(
        buttonVariants({ variant: qualifyingBuy ? "default" : "outline" }),
        "h-9 rounded-xl px-4 text-xs font-semibold no-underline",
        qualifyingBuy
          ? "border border-[#c9a227]/40 bg-[#c9a227] text-[#0b1210] hover:bg-[#d4b03a]"
          : "border-border bg-secondary/40 text-foreground hover:bg-secondary/70",
      )}
    >
      {qualifyingBuy ? BUY_LABEL : GET_VERIFIED_LABEL}
    </a>
  ) : null;

  const shareBtn = (
    <ShareOnXButton
      key={`${mint}:${scanId ?? ""}:${twitterHandle ?? ""}:${badged ? "badged" : "scan"}`}
      address={mint}
      grade={grade}
      score={score}
      scanId={scanId}
      twitterHandle={twitterHandle}
      twitterHandleSource={twitterHandleSource}
      emphasis={badged ? "primary" : "secondary"}
      shareVerifyUrl={badged ? data?.verifyUrl || undefined : undefined}
      badgeSerial={badged ? data?.badge?.serial : undefined}
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="report-action-bar">
      {badged ? (
        <>{shareBtn}</>
      ) : (
        <>
          {verifiedBtn}
          {shareBtn}
        </>
      )}
    </div>
  );
}
