import assert from "node:assert/strict";
import { compileReportMeta, gradeFromScore } from "./grade";
import type { Check } from "./types";

function c(id: string, grade: Check["grade"]): Check {
  return {
    id,
    title: id,
    status: grade === "U" ? "unknown" : grade === "A" || grade === "B" ? "pass" : "flag",
    grade,
    summary: id,
    detail: id,
  };
}

assert.equal(gradeFromScore(91), "A");
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

console.log("grade.composite.test.ts ok", { allA, withU, weakLp: weakLp.score });
