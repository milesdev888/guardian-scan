/**
 * 24h scan store for share cards.
 * In-memory (Render filesystem is ephemeral). Missing/stale → re-scan.
 */

import type { GuardianReport } from "@/lib/guardian/types";
import { runScan } from "@/lib/scan";

type Row = {
  report: GuardianReport;
  storedAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const store = new Map<string, Row>();

export function cardStoreKey(mint: string): string {
  return mint.trim();
}

export function getStoredScan(mint: string): Row | null {
  const key = cardStoreKey(mint);
  const row = store.get(key);
  if (!row) return null;
  if (Date.now() - row.storedAt > DAY_MS) {
    store.delete(key);
    return null;
  }
  return row;
}

export function putStoredScan(report: GuardianReport, storedAt = Date.now()): void {
  store.set(cardStoreKey(report.token.address), { report, storedAt });
}

/** Test helper — inject a fixture without scanning. */
export function __resetCardStoreForTests(): void {
  store.clear();
}

/**
 * Latest stored scan for mint; re-scan when missing or older than 24h.
 * Address is lookup-only — all display fields come from the returned report.
 */
export async function loadScanForCard(mint: string): Promise<GuardianReport> {
  const hit = getStoredScan(mint);
  if (hit) return hit.report;

  const result = await runScan({ address: mint });
  if (result.kind !== "report" || !result.reports[0]) {
    const err =
      result.kind === "error"
        ? result.error
        : "Scan did not produce a report for this address.";
    throw new Error(err || "Scan failed");
  }
  const report = result.reports[0];
  putStoredScan(report);
  return report;
}
