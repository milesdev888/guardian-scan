import assert from "node:assert/strict";
import {
  asFiniteNumber,
  formatPct,
  formatUsd,
  formatAge,
  safeToFixed,
} from "./grade";

// Strings that used to crash .toFixed on the report page / Solana adapter
assert.equal(formatPct("12.5"), "13%"); // ≥10 uses 0 decimals (legacy)
assert.equal(formatPct("8.25"), "8.3%");
assert.equal(formatPct("80"), "80%");
assert.equal(formatPct(null), "—");
assert.equal(formatPct(undefined), "—");
assert.equal(formatPct("nope"), "—");
assert.equal(formatPct(""), "—");
assert.equal(formatPct(NaN), "—");

assert.equal(formatUsd("1500"), "$1.5k");
assert.equal(formatUsd("2500000"), "$2.5M");
assert.equal(formatUsd(null), "—");
assert.equal(formatUsd("abc"), "—");

assert.equal(safeToFixed("3.14159", 2), "3.14");
assert.equal(safeToFixed(null, 2), null);
assert.equal(asFiniteNumber("0.05"), 0.05);
assert.equal(asFiniteNumber(true), null);

// Age with numeric timestamp still works
const dayMs = 86_400_000;
assert.match(formatAge(Date.now() - 10 * dayMs), /days/);

console.log("grade.formatters.test.ts ok");
