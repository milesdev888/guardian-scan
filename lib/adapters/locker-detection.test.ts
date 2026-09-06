import assert from "node:assert/strict";
import { isExcludedConcentrationTag } from "./solana";
import { labelFromKnownAccount } from "../sources/rugcheck";
import {
  GOKI_SMART_WALLET_PROGRAM,
  JUPITER_LOCK_PROGRAM,
  PROTOCOL_OWNER_LABELS,
  STREAMFLOW_ALIGNED_PROGRAM,
  STREAMFLOW_PROGRAM,
  labelForProtocolOwner,
} from "../sources/solana-onchain";

// RugCheck knownAccounts — Streamflow Vault must exclude from free-float.
assert.equal(
  labelFromKnownAccount({ name: "Streamflow Vault", type: "LOCKER" }),
  "Streamflow Vault",
);
assert.equal(isExcludedConcentrationTag("Streamflow Vault"), true);
assert.equal(isExcludedConcentrationTag("Jupiter Locker"), true);
assert.equal(isExcludedConcentrationTag("UNCX LP Lock"), true);
assert.equal(isExcludedConcentrationTag("Team Finance Vesting"), true);
assert.equal(isExcludedConcentrationTag("Goki Smart Wallet"), true);
assert.equal(isExcludedConcentrationTag("Raydium AMM"), true);
assert.equal(isExcludedConcentrationTag("insider"), false);
assert.equal(isExcludedConcentrationTag(null), false);

// Program map must include current Streamflow + Goki IDs (never mint-specific).
assert.equal(labelForProtocolOwner(STREAMFLOW_PROGRAM), "Streamflow locker escrow");
assert.equal(
  labelForProtocolOwner(STREAMFLOW_ALIGNED_PROGRAM),
  "Streamflow aligned locker escrow",
);
assert.equal(labelForProtocolOwner(JUPITER_LOCK_PROGRAM), "Jupiter lock escrow");
assert.equal(labelForProtocolOwner(GOKI_SMART_WALLET_PROGRAM), "Goki locker escrow");
assert.ok(PROTOCOL_OWNER_LABELS[STREAMFLOW_PROGRAM]);
assert.ok(isExcludedConcentrationTag(labelForProtocolOwner(STREAMFLOW_PROGRAM)));

// AMM type from RugCheck should also exclude.
assert.equal(
  isExcludedConcentrationTag(labelFromKnownAccount({ name: "Raydium", type: "AMM" })),
  true,
);

console.log("locker-detection.test.ts: ok");
