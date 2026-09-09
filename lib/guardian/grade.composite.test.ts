import assert from "node:assert/strict";
import {
  analyzePoolsForAa,
  applyAaIfEligible,
  compileReportMeta,
  evaluateAaEligibility,
  gradeFromScore,
  isDistributedLiquidity,
  majorityShareCeiling,
} from "./grade";
import type { Check, LiquidityPool, LpLockInfo, Pattern } from "./types";

function c(id: string, grade: Check["grade"], extras?: Partial<Check>): Check {
  return {
    id,
    title: id,
    status: grade === "U" ? "unknown" : grade === "A" || grade === "B" ? "pass" : "flag",
    grade,
    summary: id,
    detail: id,
    ...extras,
  };
}

assert.equal(gradeFromScore(91), "A"); // never AA from score alone
assert.equal(gradeFromScore(84), "B");
assert.equal(gradeFromScore(50), "C");
assert.equal(gradeFromScore(29), "F");

const allA = compileReportMeta([
  c("honeypot_simulation", "A"),
  c("lp_lock", "A"),
  c("holder_concentration", "A"),
  c("owner_privileges", "A"),
  c("transfer_tax", "A"),
  c("contract_age", "A"),
  c("copycats", "A"),
]);
assert.equal(allA.score, 100);
assert.equal(allA.grade, "A");

// U excluded from denominator — remaining weights still produce A
const withU = compileReportMeta([
  c("honeypot_simulation", "A"),
  c("lp_lock", "A"),
  c("holder_concentration", "U"),
  c("owner_privileges", "A"),
  c("transfer_tax", "A"),
  c("contract_age", "A"),
  c("copycats", "A"),
]);
assert.equal(withU.score, 100);
assert.equal(withU.grade, "A");

// lp_lock F alone cannot keep A
const weakLp = compileReportMeta([
  c("honeypot_simulation", "A"),
  c("lp_lock", "F"),
  c("holder_concentration", "A"),
  c("owner_privileges", "A"),
  c("transfer_tax", "A"),
  c("contract_age", "A"),
  c("copycats", "A"),
]);
assert.ok(weakLp.score < 85, `expected <85 got ${weakLp.score}`);
assert.notEqual(weakLp.grade, "A");

function aaChecks(ageDays = 400): Check[] {
  return [
    c("honeypot_simulation", "A"),
    c("lp_lock", "A"),
    c("holder_concentration", "A"),
    c("owner_privileges", "A", { status: "pass" }),
    c("transfer_tax", "A"),
    c("contract_age", "A", { status: "pass", evidence: { ageDays } }),
    c("copycats", "A"),
  ];
}

const permanentLp: LpLockInfo = {
  tier: "PERMANENT",
  lockedPct: 100,
  burnedPct: 0,
  freePct: 0,
  unlockAt: null,
  lockerName: "Meteora DAMM v2",
  poolType: "damm_v2",
  lifetimeEligible: true,
  badgeEligible: true,
};

const aaMeta = compileReportMeta(aaChecks());
assert.equal(aaMeta.grade, "A");
assert.ok(aaMeta.score >= 90);

const upgraded = applyAaIfEligible(aaMeta.score, aaMeta.grade, {
  checks: aaChecks(),
  lp: permanentLp,
  pools: [],
  patterns: [],
});
assert.equal(upgraded.grade, "AA");
assert.equal(upgraded.aa.eligible, true);

// Age gate — 200 days → A at best
const young = applyAaIfEligible(100, "A", {
  checks: aaChecks(200),
  lp: permanentLp,
  patterns: [],
});
assert.equal(young.grade, "A");
assert.equal(young.aa.ageOk, false);

// Score gate — 89 → never AA even with other gates
const lowScore = applyAaIfEligible(89, "A", {
  checks: aaChecks(),
  lp: permanentLp,
  patterns: [],
});
assert.equal(lowScore.grade, "A");
assert.equal(lowScore.aa.scoreOk, false);

// Never upgrade B → AA
const fromB = applyAaIfEligible(100, "B", {
  checks: aaChecks(),
  lp: permanentLp,
  patterns: [],
});
assert.equal(fromB.grade, "B");

// Established-path LP (≥3 pools, ≥$100k, no majority) without PERMANENT
const estPools: LiquidityPool[] = [
  { dex: "a", pairAddress: "1", quote: "SOL", liquidityUsd: 40_000, createdAt: null, url: null },
  { dex: "b", pairAddress: "2", quote: "SOL", liquidityUsd: 35_000, createdAt: null, url: null },
  { dex: "c", pairAddress: "3", quote: "USDC", liquidityUsd: 30_000, createdAt: null, url: null },
];
const unverifiedLp: LpLockInfo = {
  ...permanentLp,
  tier: "UNVERIFIED",
  lifetimeEligible: false,
  badgeEligible: false,
  lockedPct: 0,
};
const viaEstablished = applyAaIfEligible(100, "A", {
  checks: aaChecks(),
  lp: unverifiedLp,
  pools: estPools,
  patterns: [],
});
assert.equal(viaEstablished.grade, "AA");

// Majority pool fails Established-path LP (thin book keeps ≤50%)
const majorityPools: LiquidityPool[] = [
  { dex: "a", pairAddress: "1", quote: "SOL", liquidityUsd: 90_000, createdAt: null, url: null },
  { dex: "b", pairAddress: "2", quote: "SOL", liquidityUsd: 5_000, createdAt: null, url: null },
  { dex: "c", pairAddress: "3", quote: "USDC", liquidityUsd: 5_000, createdAt: null, url: null },
];
const majorityFail = evaluateAaEligibility({
  score: 100,
  checks: aaChecks(),
  lp: unverifiedLp,
  pools: majorityPools,
  patterns: [],
});
assert.equal(majorityFail.lpOk, false);
assert.equal(majorityFail.eligible, false);

// LINK-shaped deep book: ~57% deepest pool of $36M → passes scaled ceiling (80%)
assert.equal(majorityShareCeiling(500_000), 0.5);
assert.equal(majorityShareCeiling(5_000_000), 0.8);
const linkPools: LiquidityPool[] = [
  { dex: "u", pairAddress: "1", quote: "WETH", liquidityUsd: 20_500_000, createdAt: null, url: null },
  { dex: "u", pairAddress: "2", quote: "WETH", liquidityUsd: 13_000_000, createdAt: null, url: null },
  { dex: "u", pairAddress: "3", quote: "USDC", liquidityUsd: 900_000, createdAt: null, url: null },
  { dex: "u", pairAddress: "4", quote: "USDC", liquidityUsd: 800_000, createdAt: null, url: null },
  { dex: "u", pairAddress: "5", quote: "DAI", liquidityUsd: 400_000, createdAt: null, url: null },
  { dex: "u", pairAddress: "6", quote: "USDT", liquidityUsd: 100_000, createdAt: null, url: null },
];
const linkStats = analyzePoolsForAa(linkPools);
assert.ok(linkStats.maxPoolShare > 0.5);
assert.ok(linkStats.maxPoolShare <= linkStats.majorityShareCeiling);
assert.equal(linkStats.noSingleMajority, true);
const linkAa = evaluateAaEligibility({
  score: 100,
  checks: aaChecks(3000),
  lp: unverifiedLp,
  pools: linkPools,
  patterns: [],
});
assert.equal(linkAa.lpOk, true);

// pepeCoin-shaped: ~99% of ~$1.9M → still refused
const pepePools: LiquidityPool[] = [
  { dex: "u", pairAddress: "1", quote: "WETH", liquidityUsd: 1_903_773, createdAt: null, url: null },
  { dex: "u", pairAddress: "2", quote: "WETH", liquidityUsd: 4_966, createdAt: null, url: null },
  { dex: "u", pairAddress: "3", quote: "USDC", liquidityUsd: 103, createdAt: null, url: null },
  { dex: "u", pairAddress: "4", quote: "DAI", liquidityUsd: 1, createdAt: null, url: null },
];
const pepeStats = analyzePoolsForAa(pepePools);
assert.equal(pepeStats.noSingleMajority, false);
assert.equal(isDistributedLiquidity(pepePools), false, "pepeCoin must not wear distributed chip");
assert.equal(isDistributedLiquidity(linkPools), true, "LINK must wear distributed chip under scaled ceiling");

// Live authorities block AA
const liveAuth = applyAaIfEligible(100, "A", {
  checks: [
    ...aaChecks().filter((x) => x.id !== "owner_privileges"),
    c("owner_privileges", "F", { status: "flag" }),
  ],
  lp: permanentLp,
  patterns: [],
});
assert.equal(liveAuth.grade, "A");
assert.equal(liveAuth.aa.authoritiesOk, false);

// Fraud flag blocks AA
const fraud: Pattern[] = [
  { id: "honeypot", severity: "critical", title: "Fraud flag", detail: "test" },
];
const withFraud = applyAaIfEligible(100, "A", {
  checks: aaChecks(),
  lp: permanentLp,
  patterns: fraud,
});
assert.equal(withFraud.grade, "A");
assert.equal(withFraud.aa.fraudOk, false);

// Distributed liquidity headline — never "Weak LP lock"
const deepPools: LiquidityPool[] = [
  { dex: "uniswap", pairAddress: "1", quote: "WETH", liquidityUsd: 2_000_000, createdAt: null, url: null },
  { dex: "uniswap", pairAddress: "2", quote: "USDC", liquidityUsd: 1_500_000, createdAt: null, url: null },
  { dex: "sushiswap", pairAddress: "3", quote: "WETH", liquidityUsd: 1_200_000, createdAt: null, url: null },
];
assert.equal(isDistributedLiquidity(deepPools), true);
const distMeta = compileReportMeta(
  [
    c("honeypot_simulation", "A"),
    c("lp_lock", "C", { status: "flag", summary: "0% locked" }),
    c("holder_concentration", "A"),
    c("owner_privileges", "A"),
    c("transfer_tax", "A"),
    c("contract_age", "A"),
    c("copycats", "A"),
  ],
  [],
  { pools: deepPools },
);
assert.match(distMeta.headline, /Distributed liquidity/i);
assert.doesNotMatch(distMeta.headline, /Weak LP lock/i);

// Thin single unlocked pool → Weak LP lock
const thinPools: LiquidityPool[] = [
  { dex: "uniswap", pairAddress: "1", quote: "WETH", liquidityUsd: 8_000, createdAt: null, url: null },
];
assert.equal(isDistributedLiquidity(thinPools), false);
const thinMeta = compileReportMeta(
  [
    c("honeypot_simulation", "A"),
    c("lp_lock", "F", { status: "flag", summary: "unlocked" }),
    c("holder_concentration", "A"),
    c("owner_privileges", "A"),
    c("transfer_tax", "A"),
    c("contract_age", "D", { status: "flag" }),
    c("copycats", "A"),
  ],
  [],
  { pools: thinPools },
);
assert.match(thinMeta.headline, /Weak LP lock/i);

console.log("grade.composite.test.ts ok", {
  allA,
  withU,
  weakLp: weakLp.score,
  aa: upgraded.grade,
  distributed: distMeta.headline,
  thin: thinMeta.headline,
});
