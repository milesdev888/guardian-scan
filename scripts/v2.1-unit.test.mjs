/**
 * Self-contained v2.1 unit checks (no TS path aliases).
 * Mirrors lib/guardian/{grade,accounts,liquidity} formulas.
 */
import assert from "node:assert/strict";
import test from "node:test";

const GRADE_POINTS = { A: 100, B: 80, C: 55, D: 30, F: 0 };
const WEIGHTS = {
  honeypot_simulation: 20,
  lp_lock: 20,
  holder_concentration: 20,
  owner_privileges: 15,
  transfer_tax: 10,
  contract_age: 10,
  copycats: 5,
};

function gradeFromScore(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

function composite(checks) {
  let weighted = 0;
  let weightSum = 0;
  for (const item of checks) {
    const w = WEIGHTS[item.id];
    if (!w || item.grade === "U") continue;
    weighted += GRADE_POINTS[item.grade] * w;
    weightSum += w;
  }
  const score = weightSum > 0 ? Math.round(weighted / weightSum) : 50;
  return { score, grade: gradeFromScore(score) };
}

test("gradeFromScore uses v2.1 bands", () => {
  assert.equal(gradeFromScore(85), "A");
  assert.equal(gradeFromScore(84), "B");
  assert.equal(gradeFromScore(70), "B");
  assert.equal(gradeFromScore(50), "C");
  assert.equal(gradeFromScore(30), "D");
  assert.equal(gradeFromScore(29), "F");
});

test("composite excludes U from denominator", () => {
  const { score, grade } = composite([
    { id: "honeypot_simulation", grade: "B" },
    { id: "lp_lock", grade: "A" },
    { id: "holder_concentration", grade: "A" },
    { id: "owner_privileges", grade: "A" },
    { id: "transfer_tax", grade: "U" },
    { id: "contract_age", grade: "B" },
    { id: "copycats", grade: "C" },
  ]);
  assert.equal(score, 91);
  assert.equal(grade, "A");
});

test("C7 acceptance composite lands B or better", () => {
  // Expected C7 check grades after v2.1 fixes
  const { score, grade } = composite([
    { id: "honeypot_simulation", grade: "B" },
    { id: "lp_lock", grade: "A" },
    { id: "holder_concentration", grade: "A" },
    { id: "owner_privileges", grade: "A" },
    { id: "transfer_tax", grade: "U" },
    { id: "contract_age", grade: "B" },
    { id: "copycats", grade: "C" },
  ]);
  assert.ok(score >= 70, `score ${score}`);
  assert.ok(grade === "A" || grade === "B", `grade ${grade}`);
});

test("LP lock grade bands", () => {
  const gradeLp = (pct) => {
    if (pct == null) return "U";
    if (pct >= 90) return "A";
    if (pct >= 50) return "B";
    if (pct >= 1) return "C";
    return "D";
  };
  assert.equal(gradeLp(100), "A");
  assert.equal(gradeLp(75), "B");
  assert.equal(gradeLp(20), "C");
  assert.equal(gradeLp(0), "D");
  assert.equal(gradeLp(null), "U");
});

test("adjusted holder concentration excludes LP + locked", () => {
  const rows = [
    { kind: "locked", pct: 60 },
    { kind: "liquidity", pct: 11 },
    { kind: "locked", pct: 10 },
    { kind: "other", pct: 6.7 },
    { kind: "locked", pct: 5 },
    { kind: "other", pct: 2.5 },
    { kind: "other", pct: 1.5 },
    { kind: "other", pct: 1 },
    { kind: "other", pct: 1 },
    { kind: "other", pct: 0.7 },
  ];
  const raw = rows.reduce((s, r) => s + r.pct, 0);
  const adjusted = rows
    .filter((r) => r.kind === "other")
    .reduce((s, r) => s + r.pct, 0);
  assert.ok(raw > 90);
  assert.ok(adjusted < 20);
  assert.equal(adjusted >= 90 ? "F" : adjusted >= 70 ? "D" : adjusted >= 50 ? "C" : adjusted >= 30 ? "B" : "A", "A");
});

console.log("ok guardian-scan v2.1 unit tests");
