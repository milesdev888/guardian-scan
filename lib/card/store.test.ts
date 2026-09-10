/**
 * Card store: scanId pins share-card snapshot so PNG matches share text.
 */
import assert from "node:assert/strict";
import {
  __resetCardStoreForTests,
  getStoredScan,
  getStoredScanById,
  putStoredScan,
} from "./store";
import type { GuardianReport } from "../guardian/types";

function fixture(partial: Partial<GuardianReport> & { token: GuardianReport["token"]; grade: GuardianReport["grade"]; score: number }): GuardianReport {
  return {
    schema: "guardian.report.v2",
    scannedAt: "2026-09-10T12:00:00.000Z",
    chain: {
      id: "base",
      name: "Base",
      family: "evm",
      explorerUrl: `https://basescan.org/address/${partial.token.address}`,
    },
    headline: "t",
    disclaimer: "x",
    patterns: [],
    checks: [],
    copycats: [],
    pools: [],
    holders: [],
    sources: [],
    ...partial,
  };
}

__resetCardStoreForTests();

const mint = "0xb095274743941e953c746f9c228da9c18bb6ec29";

const first = putStoredScan(
  fixture({
    grade: "C",
    score: 65,
    token: { address: mint, name: "LAPTOP", symbol: "LAPTOP", decimals: 18, imageUrl: null },
  }),
);
assert.ok(first.scanId && first.scanId.length >= 8, "scanId assigned");
assert.equal(getStoredScan(mint)?.report.grade, "C");
assert.equal(getStoredScanById(first.scanId!)?.report.score, 65);

const second = putStoredScan(
  fixture({
    grade: "D",
    score: 46,
    token: { address: mint, name: "LAPTOP", symbol: "LAPTOP", decimals: 18, imageUrl: null },
  }),
);
assert.notEqual(second.scanId, first.scanId);
assert.equal(getStoredScan(mint)?.report.grade, "D", "mint points at latest");
assert.equal(getStoredScanById(first.scanId!)?.report.grade, "C", "old scanId still C");
assert.equal(getStoredScanById(second.scanId!)?.report.grade, "D");

console.log("card store scanId ok", { first: first.scanId, second: second.scanId });
