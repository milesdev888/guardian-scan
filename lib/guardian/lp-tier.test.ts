import assert from "node:assert/strict";
import { classifyLp, isPermanentPoolType } from "./lp-tier";

assert.equal(isPermanentPoolType("meteora_damm_v2"), true);
assert.equal(isPermanentPoolType("raydium"), false);

const c7 = classifyLp({
  family: "solana",
  tokenAgeDays: 120,
  markets: [
    {
      marketType: "meteora_damm_v2",
      lpMint: "11111111111111111111111111111111",
      lockedPct: 100,
      burnedPct: 0,
      liquidityUsd: 5559,
    },
  ],
  lockers: [],
});
assert.equal(c7.tier, "PERMANENT", "Meteora DAMM v2 marketType must classify as PERMANENT");
assert.equal(c7.emoji, "\ud83d\udd12");
assert.equal(c7.status, "pass");
assert.equal(c7.lifetimeEligible, true);
assert.match(c7.summary, /PERMANENT/);

const burned = classifyLp({
  family: "solana",
  markets: [
    {
      marketType: "raydium",
      lpMint: "11111111111111111111111111111111",
      lockedPct: 100,
      burnedPct: 100,
      liquidityUsd: 10_000,
    },
  ],
});
assert.equal(burned.tier, "BURNED");

const timed = classifyLp({
  family: "solana",
  markets: [{ marketType: "raydium", lockedPct: 100, liquidityUsd: 20_000 }],
  lockers: [
    {
      programId: "strmRqUCoQkeZbZyeFyBTvzmU9aNSv1VqdAdybM73Vv",
      type: "streamflow",
      name: "Streamflow",
      unlockAt: new Date(Date.now() + 200 * 86_400_000).toISOString(),
    },
  ],
});
assert.equal(timed.tier, "TIMED");
assert.equal(timed.status, "pass");

const shortTimed = classifyLp({
  family: "solana",
  markets: [{ marketType: "raydium", lockedPct: 100, liquidityUsd: 20_000 }],
  lockers: [
    {
      name: "Streamflow",
      unlockAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    },
  ],
});
assert.equal(shortTimed.tier, "TIMED");
assert.equal(shortTimed.shortUnlockWarning, true);
assert.equal(shortTimed.badgeEligible, false);

const unknown = classifyLp({
  family: "solana",
  markets: [{ marketType: "unknown_amm", lockedPct: 100, liquidityUsd: 1_000 }],
});
assert.equal(unknown.tier, "UNVERIFIED");
assert.equal(unknown.badgeEligible, false);

const evmBurn = classifyLp({
  family: "evm",
  evmLpHolders: [{ address: "0x000000000000000000000000000000000000dead", percent: 100, locked: true, tag: "burn" }],
});
assert.equal(evmBurn.tier, "BURNED");

const evmUnknown = classifyLp({
  family: "evm",
  evmLpHolders: [{ address: "0x1111111111111111111111111111111111111111", percent: 100, locked: true, tag: "" }],
});
assert.equal(evmUnknown.tier, "UNVERIFIED");

const goki = classifyLp({
  family: "solana",
  markets: [{ marketType: "raydium", lockedPct: 100, liquidityUsd: 8_000 }],
  lockers: [
    {
      programId: "GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgM8Y5qJiM",
      name: "Goki",
      unlockAt: new Date(Date.now() + 200 * 86_400_000).toISOString(),
    },
  ],
});
assert.equal(goki.tier, "TIMED");

const xrplNone = classifyLp({ family: "xrpl", xrpl: { poolExists: false } });
assert.equal(xrplNone.tier, "UNVERIFIED");
assert.equal(xrplNone.badgeEligible, false);

const xrplAmm = classifyLp({
  family: "xrpl",
  xrpl: {
    poolExists: true,
    ammAccount: "rHUpaqUPbwzKZdzQ8ZQCme18FrgW9pB4am",
    lpBurnedPct: 0,
    facts: "LP tokens remain transferable.",
  },
});
assert.equal(xrplAmm.tier, "UNVERIFIED");
assert.equal(xrplAmm.poolType, "xls30_amm");
assert.doesNotMatch(xrplAmm.summary, /PERMANENT/);

const xrplBurn = classifyLp({
  family: "xrpl",
  xrpl: { poolExists: true, ammAccount: "rAMM", lpBurnedPct: 100 },
});
assert.equal(xrplBurn.tier, "BURNED");
assert.equal(xrplBurn.badgeEligible, true);

const xrplTimed = classifyLp({
  family: "xrpl",
  xrpl: {
    poolExists: true,
    ammAccount: "rAMM",
    lpLockedPct: 100,
    escrowUnlockAt: new Date(Date.now() + 200 * 86_400_000).toISOString(),
  },
});
assert.equal(xrplTimed.tier, "TIMED");
assert.equal(xrplTimed.status, "pass");

console.log("ok lp-tier");
