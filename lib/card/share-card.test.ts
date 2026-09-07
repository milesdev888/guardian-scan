/**
 * Share-card unit tests:
 * (1) card text matches stored record character-by-character
 * (2) A badged / C unbadged / 2+ risk chips / Established / REVOKED
 * (3) Zes mint fixture renders with "—" fields, no crash
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CHIP_VOCAB,
  mapShareCardChips,
  type BadgeCardStatus,
} from "../card/chips";
import { buildLpLine } from "../card/lp-line";
import {
  buildShareCardModel,
  cardTextFingerprint,
  CARD_FOOTER,
} from "../card/model";
import { renderShareCardPng } from "../card/render";
import type { Check, GuardianReport, Grade } from "../guardian/types";

function baseReport(partial: Partial<GuardianReport> & { token: GuardianReport["token"] }): GuardianReport {
  return {
    schema: "guardian.report.v2",
    scannedAt: "2026-09-07T12:00:00.000Z",
    chain: {
      id: "solana",
      name: "Solana",
      family: "solana",
      explorerUrl: `https://solscan.io/token/${partial.token.address}`,
    },
    grade: "C",
    score: 55,
    headline: "test",
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

function check(
  id: string,
  grade: Grade,
  status: Check["status"],
  summary: string,
  detail = "",
): Check {
  return { id, title: id, grade, status, summary, detail };
}

const C7_MINT = "979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww";
const ZES_MINT = "ZesMGYmokFiEuDvNzWeMhB7jxF6eUW8c512vwSKSTNK";

const badgeValidA: BadgeCardStatus = {
  valid: true,
  status: "VALID",
  pathFamily: "secured",
  pathLabel: "Lifetime",
  qualifyPath: "lifetime",
  serial: "GRD-2026-00001",
};

const badgeEstablished: BadgeCardStatus = {
  valid: true,
  status: "VALID",
  pathFamily: "established",
  pathLabel: "Established",
  qualifyPath: "established",
  serial: "GRD-2026-00099",
};

const badgeRevoked: BadgeCardStatus = {
  valid: false,
  status: "REVOKED",
  pathFamily: "secured",
  pathLabel: "Lifetime",
  qualifyPath: "lifetime",
  serial: "GRD-2026-00050",
};

async function main() {
// ——— (1) character-by-character match to stored record ———
{
  const report = baseReport({
    token: {
      address: C7_MINT,
      name: "CYRE",
      symbol: "C7",
      decimals: 6,
      imageUrl: null,
    },
    grade: "A",
    score: 91,
    lp: {
      tier: "PERMANENT",
      lockedPct: 100,
      burnedPct: 0,
      freePct: 0,
      unlockAt: null,
      lockerName: null,
      poolType: "meteora_damm_v2",
      lifetimeEligible: true,
      badgeEligible: true,
    },
    checks: [
      check("owner_privileges", "A", "pass", "Mint and freeze authorities are revoked."),
      check("lp_lock", "A", "pass", "🔒 PERMANENT — 100% locked."),
      check("holder_concentration", "A", "pass", "Top 10 hold 18%."),
      check("transfer_tax", "A", "pass", "Simulation shows 0% buy and sell tax."),
      check("honeypot_simulation", "A", "pass", "No honeypot."),
      check("contract_age", "A", "pass", "Seasoned."),
      check("verified_source", "A", "pass", "OK"),
      check("copycats", "A", "pass", "None"),
    ],
  });

  const model = buildShareCardModel(report, badgeValidA);
  assert.equal(model.tokenName, report.token.name);
  assert.equal(model.ticker, `$${report.token.symbol}`);
  assert.equal(model.mint, report.token.address);
  assert.equal(model.chainName, report.chain.name);
  assert.equal(model.gradeLine, `Grade ${report.grade} · composite ${report.score}/100`);
  assert.equal(model.footer, CARD_FOOTER);
  assert.equal(model.lp.text, "LP PERMANENT · 100% locked");
  assert.equal(model.showMedallion, true);

  // Fingerprint strings must equal stored fields exactly (no URL param pollution)
  const fp = cardTextFingerprint(model);
  assert.ok(fp.includes(report.token.address));
  assert.ok(fp.includes("CYRE"));
  assert.ok(fp.includes("$C7"));
  assert.ok(fp.every((s) => typeof s === "string" && !s.includes("undefined")));
  assert.ok(!fp.some((s) => /NaN/.test(s)));
}

// ——— (2a) A badged token ———
{
  const report = baseReport({
    token: {
      address: C7_MINT,
      name: "CYRE",
      symbol: "C7",
      decimals: 6,
      imageUrl: null,
    },
    grade: "A",
    score: 91,
    lp: {
      tier: "PERMANENT",
      lockedPct: 100,
      burnedPct: null,
      freePct: null,
      unlockAt: null,
      lockerName: null,
      poolType: "meteora_damm_v2",
      lifetimeEligible: true,
      badgeEligible: true,
    },
    checks: [
      check("owner_privileges", "A", "pass", "Mint and freeze authorities are revoked."),
      check("lp_lock", "A", "pass", "PERMANENT"),
      check("holder_concentration", "A", "pass", "dispersed"),
      check("transfer_tax", "A", "pass", "0% tax"),
    ],
  });
  const model = buildShareCardModel(report, badgeValidA);
  assert.equal(model.showMedallion, true);
  assert.equal(model.gradeColor, "#E8C56A");
  // AA platinum
  const aaReport = baseReport({
    token: {
      address: C7_MINT,
      name: "CYRE",
      symbol: "C7",
      decimals: 6,
      imageUrl: null,
    },
    grade: "AA",
    score: 96,
    checks: [
      check("honeypot_simulation", "A", "pass", "ok"),
      check("lp_lock", "A", "pass", "PERMANENT"),
      check("holder_concentration", "A", "pass", "dispersed"),
      check("owner_privileges", "A", "pass", "revoked"),
      check("transfer_tax", "A", "pass", "0%"),
      check("contract_age", "A", "pass", "aged"),
      check("copycats", "A", "pass", "none"),
    ],
    lp: {
      tier: "PERMANENT",
      lockedPct: 100,
      burnedPct: 0,
      freePct: 0,
      unlockAt: null,
      lockerName: "Meteora",
      poolType: "damm_v2",
      lifetimeEligible: true,
      badgeEligible: true,
    },
  });
  const aaModel = buildShareCardModel(aaReport, badgeValidA);
  assert.equal(aaModel.gradeColor, "#E5E4E2");
  assert.equal(aaModel.gradeLine, "Grade AA · composite 96/100");
  assert.ok(!aaModel.lp.text.toLowerCase().includes("secured"));
  assert.ok(model.chips.some((c) => c.id === "GUARDIAN_VERIFIED"));
  const png = await renderShareCardPng(model);
  assert.ok(png.length > 5_000);
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
}

// ——— (2b) C unbadged token ———
{
  const report = baseReport({
    token: {
      address: "So11111111111111111111111111111111111111112",
      name: "Wrapped SOL",
      symbol: "SOL",
      decimals: 9,
      imageUrl: null,
    },
    grade: "C",
    score: 58,
    lp: {
      tier: "UNVERIFIED",
      lockedPct: 40,
      burnedPct: 0,
      freePct: 60,
      unlockAt: null,
      lockerName: null,
      poolType: "raydium",
      lifetimeEligible: false,
      badgeEligible: false,
    },
    checks: [
      check("verified_source", "C", "flag", "Token metadata is still mutable."),
      check("lp_lock", "C", "flag", "UNVERIFIED lock"),
      check("contract_age", "C", "flag", "Token is 12 days old."),
    ],
  });
  const model = buildShareCardModel(report, null);
  assert.equal(model.showMedallion, false);
  assert.equal(model.gradeColor, "#9AA4B2");
  assert.ok(model.lp.text.includes("UNVERIFIED") || model.lp.text === "LP UNLOCKED");
  const png = await renderShareCardPng(model);
  assert.ok(png.length > 5_000);
}

// ——— (2c) token with 2+ risk chips ———
{
  const report = baseReport({
    token: {
      address: "RiskMint11111111111111111111111111111111111",
      name: "Risk Token",
      symbol: "RISK",
      decimals: 6,
      imageUrl: null,
    },
    grade: "F",
    score: 12,
    patterns: [
      {
        id: "copycats",
        severity: "watch",
        title: "Same ticker",
        detail: "many copies",
      },
    ],
    checks: [
      check("honeypot_simulation", "F", "flag", "Likely honeypot / sell-trap."),
      check("owner_privileges", "F", "flag", "Mint authority is still live."),
      check("transfer_tax", "D", "flag", "High transfer tax 25%."),
      check("copycats", "C", "flag", "20 other copies"),
      check("lp_lock", "F", "flag", "LP unlocked"),
    ],
  });
  const chips = mapShareCardChips(report, null);
  assert.ok(chips.length >= 2, `expected ≥2 risk chips, got ${chips.map((c) => c.id)}`);
  assert.ok(chips.filter((c) => c.kind === "risk" || c.kind === "fraud").length >= 2);
  // Risk precedes positive
  const firstPositive = chips.findIndex((c) => c.kind === "positive");
  const lastRisk = Math.max(
    -1,
    ...chips.map((c, i) => (c.kind !== "positive" ? i : -1)),
  );
  if (firstPositive >= 0) assert.ok(lastRisk < firstPositive);
  const model = buildShareCardModel(report, null);
  assert.equal(model.gradeColor, "#E09A3C"); // D/F amber — not red
  const png = await renderShareCardPng(model);
  assert.ok(png.length > 5_000);
}

// ——— (2d) Established token ———
{
  const report = baseReport({
    token: {
      address: "EstablishedMint111111111111111111111111111",
      name: "Battle Tested",
      symbol: "BTTL",
      decimals: 6,
      imageUrl: null,
    },
    grade: "B",
    score: 78,
    pools: [
      {
        dex: "raydium",
        pairAddress: "a",
        quote: "SOL",
        liquidityUsd: 500_000,
        createdAt: 1,
        url: null,
      },
      {
        dex: "orca",
        pairAddress: "b",
        quote: "USDC",
        liquidityUsd: 400_000,
        createdAt: 1,
        url: null,
      },
      {
        dex: "meteora",
        pairAddress: "c",
        quote: "SOL",
        liquidityUsd: 300_000,
        createdAt: 1,
        url: null,
      },
    ],
    lp: {
      tier: "UNVERIFIED",
      lockedPct: 0,
      burnedPct: 0,
      freePct: 100,
      unlockAt: null,
      lockerName: null,
      poolType: "amm",
      lifetimeEligible: false,
      badgeEligible: true,
    },
    checks: [check("lp_lock", "C", "flag", "Unlocked AMM on established token")],
  });
  const lp = buildLpLine(report, badgeEstablished);
  assert.equal(lp.text, "LIQUIDITY DISTRIBUTED · 3 independent pools");
  assert.doesNotMatch(lp.text, /unlocked/i);
  const model = buildShareCardModel(report, badgeEstablished);
  assert.ok(model.chips.some((c) => c.id === "ESTABLISHED"));
  assert.equal(model.showMedallion, true);
  const png = await renderShareCardPng(model);
  assert.ok(png.length > 5_000);

  // Same pool book without badge → DISTRIBUTED LIQUIDITY chip, never LP UNLOCKED / Weak
  const noBadgeLp = buildLpLine(report, null);
  assert.equal(noBadgeLp.text, "LIQUIDITY DISTRIBUTED · 3 independent pools");
  const noBadgeChips = mapShareCardChips(report, null);
  assert.ok(noBadgeChips.some((c) => c.id === "DISTRIBUTED_LIQUIDITY"));
  assert.ok(!noBadgeChips.some((c) => c.id === "LP_UNLOCKED"));
}

// ——— (2e) REVOKED badge ———
{
  const report = baseReport({
    token: {
      address: "RevokedMint111111111111111111111111111111",
      name: "Was Good",
      symbol: "WAS",
      decimals: 6,
      imageUrl: null,
    },
    grade: "B",
    score: 70,
    lp: {
      tier: "TIMED",
      lockedPct: 100,
      burnedPct: 0,
      freePct: 0,
      unlockAt: "2026-01-01T00:00:00.000Z",
      lockerName: "Streamflow",
      poolType: "raydium",
      lifetimeEligible: false,
      badgeEligible: false,
    },
    checks: [check("lp_lock", "B", "pass", "Timed lock")],
  });
  const model = buildShareCardModel(report, badgeRevoked);
  assert.equal(model.showMedallion, false, "REVOKED must not show medallion");
  assert.ok(model.chips.some((c) => c.id === "REVOKED"));
  assert.equal(model.chips.find((c) => c.id === "REVOKED")?.kind, "fraud");
  assert.equal(model.lp.text, "LP LOCKED · until 2026-01-01");
  const png = await renderShareCardPng(model);
  assert.ok(png.length > 5_000);
}

// ——— (3) Zes mint — missing numerics → "—", no crash ———
{
  let zes: GuardianReport | null = null;
  const fixturePath = path.join(process.cwd(), "lib/card/fixtures/zes-report.json");
  if (fs.existsSync(fixturePath)) {
    zes = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as GuardianReport;
  } else {
    // Synthetic stand-in with null liquidity / odd stringy fields
    zes = baseReport({
      token: {
        address: ZES_MINT,
        name: "Just a Backpack",
        symbol: "🎒",
        decimals: null,
        imageUrl: null,
      },
      grade: "B",
      score: 73,
      lp: {
        tier: "UNVERIFIED",
        lockedPct: null as unknown as number,
        burnedPct: null,
        freePct: null,
        unlockAt: null,
        lockerName: null,
        poolType: "raydium_cpmm",
        lifetimeEligible: false,
        badgeEligible: false,
      },
      pools: [
        {
          dex: "raydium",
          pairAddress: "x",
          quote: "SOL",
          liquidityUsd: null,
          createdAt: null,
          url: null,
        },
      ],
      checks: [
        check("transfer_tax", "C", "flag", "Token-2022 transfer fee ≈ 0.0%."),
        check("lp_lock", "C", "flag", "UNVERIFIED"),
        check("verified_source", "C", "flag", "Token metadata is still mutable."),
        check("copycats", "C", "flag", "20 other 🎒 mint(s)"),
        check("contract_age", "D", "flag", "First pool is 6 hours old."),
      ],
      patterns: [
        {
          id: "copycats",
          severity: "watch",
          title: "Same ticker (🎒) on Solana",
          detail: "copies",
        },
      ],
    });
  }

  const model = buildShareCardModel(zes!, null);
  assert.equal(model.mint, ZES_MINT);
  assert.ok(!cardTextFingerprint(model).some((s) => /NaN/.test(s)));
  // Zes may be UNVERIFIED/UNLOCKED or DISTRIBUTED depending on stored pools
  assert.match(model.lp.text, /—|UNVERIFIED|UNLOCKED|DISTRIBUTED/);
  assert.doesNotMatch(model.lp.text, /secured/i);
  const png = await renderShareCardPng(model);
  assert.ok(png.length > 5_000, "Zes card must render without throw");

  // Explicit missing score → —
  const broken = buildShareCardModel(
    { ...zes!, score: Number.NaN as unknown as number },
    null,
  );
  assert.equal(broken.scoreDisplay, "—");
  assert.equal(broken.gradeLine, `Grade ${zes!.grade} · composite —/100`);
  await renderShareCardPng(broken);
}

// Chip vocabulary is closed
{
  for (const chip of Object.values(CHIP_VOCAB)) {
    assert.ok(chip.label.length > 0);
    assert.ok(["risk", "positive", "fraud"].includes(chip.kind));
  }
}

console.log("share-card tests: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
