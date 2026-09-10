/**
 * 24h scan store for share cards.
 * In-memory (Render filesystem is ephemeral). Missing/stale → re-scan.
 *
 * Indexed by mint (latest) and by scanId (immutable snapshot for share/OG).
 * Card URLs with ?s=<scanId> paint the same report the share text used.
 */

import { randomUUID } from "node:crypto";
import type { GuardianReport } from "@/lib/guardian/types";
import { runScan } from "@/lib/scan";

type Row = {
  report: GuardianReport;
  storedAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const byMint = new Map<string, Row>();
const byScanId = new Map<string, Row>();

export function cardStoreKey(mint: string): string {
  return mint.trim();
}

function ensureScanId(report: GuardianReport): GuardianReport {
  if (report.scanId && report.scanId.length >= 8) return report;
  return { ...report, scanId: randomUUID() };
}

export function getStoredScan(mint: string): Row | null {
  const key = cardStoreKey(mint);
  const row = byMint.get(key);
  if (!row) return null;
  if (Date.now() - row.storedAt > DAY_MS) {
    byMint.delete(key);
    if (row.report.scanId) byScanId.delete(row.report.scanId);
    return null;
  }
  return row;
}

export function getStoredScanById(scanId: string): Row | null {
  const id = String(scanId || "").trim();
  if (!id) return null;
  const row = byScanId.get(id);
  if (!row) return null;
  if (Date.now() - row.storedAt > DAY_MS) {
    byScanId.delete(id);
    return null;
  }
  return row;
}

export function putStoredScan(report: GuardianReport, storedAt = Date.now()): GuardianReport {
  const withId = ensureScanId(report);
  const row: Row = { report: withId, storedAt };
  byMint.set(cardStoreKey(withId.token.address), row);
  if (withId.scanId) byScanId.set(withId.scanId, row);
  return withId;
}

/** Test helper — inject a fixture without scanning. */
export function __resetCardStoreForTests(): void {
  byMint.clear();
  byScanId.clear();
}

/**
 * Load scan for card paint.
 * Prefer ?s=<scanId> snapshot when present so share text and PNG match.
 * Fall back to latest mint store, then re-scan.
 */
export async function loadScanForCard(
  mint: string,
  scanId?: string | null,
): Promise<GuardianReport> {
  if (scanId) {
    const byId = getStoredScanById(scanId);
    if (byId) return byId.report;
  }

  const hit = getStoredScan(mint);
  if (hit) {
    // Mint hit without matching scanId still paints latest — CDN URL should
    // include ?s= so a miss here means another instance; re-scan below only
    // when mint store is empty.
    if (!scanId || hit.report.scanId === scanId) return hit.report;
  }

  // scanId miss on this instance: do not invent a different snapshot —
  // re-scan and store; caller still gets a fresh card (better than 404).
  const result = await runScan({ address: mint });
  if (result.kind !== "report" || !result.reports[0]) {
    const err =
      result.kind === "error"
        ? result.error
        : "Scan did not produce a report for this address.";
    throw new Error(err || "Scan failed");
  }
  return putStoredScan(result.reports[0]);
}
