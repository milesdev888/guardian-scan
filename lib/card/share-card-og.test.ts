/**
 * OG card compress acceptance: ~1024px long edge, under 300KB.
 */
import assert from "node:assert/strict";
import { buildShareCardModel } from "../card/model";
import { CARD_OG_WIDTH, renderShareCardOgPng } from "../card/render";
import type { Check, Grade, GuardianReport } from "../guardian/types";

function check(
  id: string,
  grade: Grade,
  status: Check["status"],
  summary: string,
): Check {
  return { id, title: id, grade, status, summary, detail: "" };
}

const report: GuardianReport = {
  schema: "guardian.report.v2",
  scannedAt: "2026-09-07T12:00:00.000Z",
  chain: {
    id: "solana",
    name: "Solana",
    family: "solana",
    explorerUrl: "https://solscan.io/token/OgCompressMint1111111111111111111111111111111",
  },
  grade: "A",
  score: 91,
  headline: "test",
  disclaimer: "x",
  patterns: [],
  checks: [
    check("owner_privileges", "A", "pass", "Mint authority revoked."),
    check("lp_lock", "A", "pass", "LP permanently locked."),
  ],
  copycats: [],
  pools: [],
  holders: [],
  sources: [],
  token: {
    address: "OgCompressMint1111111111111111111111111111111",
    name: "OG Compress",
    symbol: "OGC",
    decimals: 6,
    imageUrl: null,
  },
  lp: {
    tier: "PERMANENT",
    lockedPct: 100,
    burnedPct: 0,
    freePct: 0,
    unlockAt: null,
    lockerName: null,
    poolType: "amm",
    lifetimeEligible: true,
    badgeEligible: true,
  },
};

async function main() {
  const model = buildShareCardModel(report, null, { publicOrigin: "https://scan.cyre.dev" });
  const og = await renderShareCardOgPng(model);
  assert.equal(og[0], 0x89);
  assert.ok(og.length < 300 * 1024, `card OG must be under 300KB, got ${og.length}`);
  assert.equal(CARD_OG_WIDTH, 1024);
  console.log("share-card-og tests: ok", { bytes: og.length, kb: +(og.length / 1024).toFixed(1) });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
