"use client";

import { useEffect, useState } from "react";

type BadgeLookup = {
  valid: boolean;
  status?: string;
  badge?: {
    serial: string;
    pathLabel?: string;
    qualifyPath?: string;
  };
  verifyUrl?: string;
  sealUrl?: string;
};

const BADGE_API =
  process.env.NEXT_PUBLIC_GUARDIAN_BADGE_API || "https://cyre.dev/api/badge/verify";

/**
 * Gold seal — bottom-right of the scan report ONLY when a VALID badge exists.
 * No badge → render nothing. Serial links to the verify page.
 */
export function BadgeSealCorner({ mint }: { mint: string }) {
  const [data, setData] = useState<BadgeLookup | null>(null);

  useEffect(() => {
    if (!mint) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${BADGE_API}?mint=${encodeURIComponent(mint)}&live=1`,
          { headers: { accept: "application/json" }, cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as BadgeLookup;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mint]);

  if (!data?.valid || !data.badge?.serial) return null;

  const href =
    data.verifyUrl || `https://cyre.dev/verify/${encodeURIComponent(data.badge.serial)}`;
  const seal =
    data.sealUrl || "https://cyre.dev/brand/seals/guardian-seal-valid.png";
  const path = data.badge.pathLabel || data.badge.qualifyPath || "Badge";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="pointer-events-auto absolute right-3 bottom-3 z-10 flex flex-col items-center gap-1 no-underline"
      title={`Guardian ${path} · ${data.badge.serial}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={seal}
        alt={`Guardian ${path} seal`}
        width={72}
        height={72}
        className="drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)]"
      />
      <span className="font-mono text-[10px] tracking-wide text-amber-300/90">
        {data.badge.serial}
      </span>
    </a>
  );
}
