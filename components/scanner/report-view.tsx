"use client";

import { ExternalLink, Lock, LockOpen } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GradeMark } from "@/components/scanner/grade-mark";
import { buttonVariants } from "@/components/ui/button";
import { formatAge, formatPct, formatUsd, shorten } from "@/lib/guardian/grade";
import type {
  Check,
  GuardianReport,
  LpTier,
  PresenceMatch,
  ScanResponse,
} from "@/lib/guardian/types";
import { cn } from "@/lib/utils";

const SEVERITY: Record<string, string> = {
  info: "border-border text-muted-foreground",
  watch: "border-sky-500/40 text-sky-200",
  caution: "border-amber-400/40 text-amber-200",
  critical: "border-red-500/45 text-red-300",
};

type LockTone = "green" | "gold" | "red" | "gray";

const LOCK_TONE_CLASS: Record<LockTone, string> = {
  green: "text-emerald-400",
  gold: "text-amber-300",
  red: "text-red-400",
  gray: "text-muted-foreground",
};

/** Green/gold LP chrome from Phase 1 classifyLp tiers — never RugCheck lock %. */
function lockToneFromTier(tier: LpTier | null | undefined, grade: Check["grade"]): LockTone {
  if (tier === "PERMANENT" || tier === "BURNED") return "green";
  if (tier === "TIMED") return "gold";
  if (tier === "UNVERIFIED") return grade === "U" ? "gray" : "red";
  if (grade === "A") return "green";
  if (grade === "B") return "gold";
  if (grade === "U") return "gray";
  return "red";
}

export function ScanResultView({
  result,
  activeChain,
}: {
  result: Extract<ScanResponse, { kind: "report" }>;
  activeChain?: string;
}) {
  const report =
    result.reports.find((item) => item.chain.id === activeChain) ?? result.reports[0];
  if (!report) return null;
  return (
    <div className="space-y-6">
      <PresenceBar
        presence={result.presence}
        family={result.family}
        active={report.chain.id}
        address={result.address}
      />
      <ReportView report={report} />
    </div>
  );
}

function PresenceBar({
  presence,
  family,
  active,
  address,
}: {
  presence: PresenceMatch[];
  family: string;
  active?: string;
  address: string;
}) {
  if (family === "solana" || family === "xrpl") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {presence.map((row) => {
        const selected = row.chainId === active;
        const href = row.exists
          ? `/app?address=${encodeURIComponent(address)}&chain=${encodeURIComponent(row.chainId)}`
          : undefined;
        const className = cn(
          buttonVariants({ variant: selected ? "default" : "outline" }),
          "h-10 rounded-xl px-3 text-xs",
          !row.exists && "pointer-events-none opacity-50",
        );
        if (!href) {
          return (
            <span key={row.chainId} className={className}>
              {row.chainName} · empty
            </span>
          );
        }
        return (
          <a key={row.chainId} href={href} className={className}>
            {row.chainName}
            {selected ? " · report" : " · contract"}
          </a>
        );
      })}
    </div>
  );
}

function CheckCard({ item, lpTier }: { item: Check; lpTier?: LpTier | null }) {
  const isLp = item.id === "lp_lock";
  const tier = (
    typeof item.evidence?.tier === "string" ? item.evidence.tier : lpTier
  ) as LpTier | null | undefined;
  const tone = isLp ? lockToneFromTier(tier, item.grade) : null;

  return (
    <div className="flex gap-3 rounded-xl border border-border/80 bg-card/60 p-3 sm:p-4">
      <GradeMark grade={item.grade} size="sm" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-medium">{item.title}</h3>
          <span className="text-xs text-muted-foreground">
            grade {item.grade} · {item.status}
          </span>
          {isLp && tone ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                LOCK_TONE_CLASS[tone],
              )}
              title={`LP lock tone: ${tone}${tier ? ` · ${tier}` : ""}`}
            >
              {tone === "gray" || tone === "red" ? (
                <LockOpen className="size-3.5" aria-hidden />
              ) : (
                <Lock className="size-3.5" aria-hidden />
              )}
              {tier ?? null}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm">{item.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
      </div>
    </div>
  );
}

export function ReportView({ report }: { report: GuardianReport }) {
  const concentration = report.concentration;
  const lpTier = report.lp?.tier ?? null;

  return (
    <div className="space-y-6">
      <Card className="border-border/80 bg-card/80">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <GradeMark grade={report.grade} size="lg" labeled />
            <div>
              <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
                {report.chain.name}
                {report.chain.family &&
                report.chain.family.toLowerCase() !== report.chain.name.toLowerCase()
                  ? ` · ${report.chain.family}`
                  : ""}
              </p>
              <CardTitle className="font-heading mt-1 text-2xl sm:text-3xl">
                {report.token.name ?? "Unknown token"}{" "}
                {report.token.symbol ? (
                  <span className="text-muted-foreground">${report.token.symbol}</span>
                ) : null}
              </CardTitle>
              <p className="mt-1 text-sm">
                Grade {report.grade}
                <span className="text-muted-foreground"> · composite {report.score}/100</span>
              </p>
              {lpTier ? (
                <p
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 text-sm font-medium",
                    LOCK_TONE_CLASS[lockToneFromTier(lpTier, report.grade)],
                  )}
                >
                  {lpTier === "UNVERIFIED" ? (
                    <LockOpen className="size-4" aria-hidden />
                  ) : (
                    <Lock className="size-4" aria-hidden />
                  )}
                  LP {lpTier}
                  {typeof report.lp?.lockedPct === "number"
                    ? ` · ${Math.round(report.lp.lockedPct)}% secured`
                    : null}
                </p>
              ) : null}
              <p className="mt-2 font-mono text-xs break-all text-muted-foreground">
                {report.token.address}
              </p>
              <p className="mt-3 max-w-xl text-sm text-foreground/80 capitalize">
                {report.headline}
              </p>
            </div>
          </div>
          <a
            href={report.chain.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Explorer <ExternalLink className="size-3" />
          </a>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{report.disclaimer}</p>
        </CardContent>
      </Card>

      {report.patterns.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {report.patterns.map((item) => (
            <Badge
              key={item.id}
              variant="outline"
              className={cn("h-auto max-w-full py-1 whitespace-normal", SEVERITY[item.severity])}
            >
              {item.title}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No extra patterns beyond the check table.</p>
      )}

      <div className="grid gap-3">
        {report.checks.map((item) => (
          <CheckCard key={item.id} item={item} lpTier={lpTier} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top holders</CardTitle>
            {concentration ? (
              <p className="text-sm text-muted-foreground">
                Top 10 hold {formatPct(concentration.rawTop10)} raw ·{" "}
                {formatPct(concentration.adjustedTop10)} excluding locked &amp; LP
                {concentration.excludedPct > 0
                  ? ` (excluded ${formatPct(concentration.excludedPct)})`
                  : ""}
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            {report.holders.length ? (
              <ul className="space-y-2">
                {report.holders.map((holder, index) => (
                  <li
                    key={`${holder.address}-${index}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 text-xs text-muted-foreground">
                      {holder.tag ? (
                        <>
                          <span className="text-foreground/90">{holder.tag}</span>
                          <span className="font-mono">
                            {" "}
                            · {shorten(holder.address || "unknown", 4)}
                          </span>
                        </>
                      ) : (
                        <span className="font-mono">{shorten(holder.address || "unknown", 5)}</span>
                      )}
                    </span>
                    <span>{formatPct(holder.percent)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote text="Holder table not returned for this chain." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pools</CardTitle>
          </CardHeader>
          <CardContent>
            {report.pools.length ? (
              <ul className="space-y-2">
                {report.pools.map((pool) => (
                  <li key={pool.pairAddress} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {pool.dex} / {pool.quote}
                      </span>
                      <span>{formatUsd(pool.liquidityUsd)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatAge(pool.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote text="No DEX pools in the current window." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Same-ticker copies</CardTitle>
        </CardHeader>
        <CardContent>
          {report.copycats.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Token</th>
                    <th className="pb-2 font-medium">DEX</th>
                    <th className="pb-2 font-medium">Liquidity</th>
                    <th className="pb-2 font-medium">Age</th>
                    <th className="pb-2 font-medium">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {report.copycats.map((row) => (
                    <tr key={row.address} className="border-t border-border/60">
                      <td className="py-2">
                        <div>{row.name ?? row.symbol}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {shorten(row.address, 6)}
                        </div>
                      </td>
                      <td>{row.dex ?? "—"}</td>
                      <td>{formatUsd(row.liquidityUsd)}</td>
                      <td>{formatAge(row.createdAt)}</td>
                      <td className="space-x-1">
                        {row.flags
                          .filter((flag) => flag !== "same-chain")
                          .map((flag) => (
                            <Badge key={flag} variant="outline" className="capitalize">
                              {flag}
                            </Badge>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyNote text="No same-ticker copies in the search window." />
          )}
        </CardContent>
      </Card>

      <Accordion>
        <AccordionItem value="sources">
          <AccordionTrigger>Data sources</AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-1 text-sm">
              {report.sources.map((source) => (
                <li key={source.id} className="flex justify-between gap-3">
                  <span>{source.id}</span>
                  <span className="text-muted-foreground">
                    {source.ok ? "ok" : source.error ?? "miss"}
                  </span>
                </li>
              ))}
            </ul>
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground">
              Scanned {new Date(report.scannedAt).toLocaleString()} · schema {report.schema}
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
