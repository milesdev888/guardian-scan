import assert from "node:assert/strict";
import { parseRugCheckMarkets } from "./rugcheck-markets";
import { classifyLp } from "@/lib/guardian/lp-tier";

const c7Markets = [
  {
    pubkey: "78fZQMdvzFVx4LbGDe6cJBC6jWH2nVHyWU6x7JPnFQLG",
    marketType: "meteora_damm_v2",
    liquidityA: "HDwozVaultAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    liquidityB: "QuoteVaultAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    lp: {
      lpMint: "11111111111111111111111111111111",
      lpLockedPct: 100,
      baseUSD: 3000,
      quoteUSD: 2500,
    },
  },
];

const parsed = parseRugCheckMarkets(c7Markets);
assert.equal(parsed.markets[0]?.marketType, "meteora_damm_v2");
assert.equal(parsed.markets[0]?.lockedPct, 100);
assert.equal(parsed.markets[0]?.burnedPct, 0, "DAMM burn-like lpMint must not force burnedPct");
assert.equal(parsed.accountLabels.get("HDwozVaultAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), "Meteora pool vault");

const assessment = classifyLp({
  family: "solana",
  tokenAgeDays: 120,
  markets: parsed.markets,
});
assert.equal(assessment.tier, "PERMANENT");

console.log("rugcheck-markets.test.ts ok");
