/**
 * Acceptance: cold ≤15s, warm ≤2s for JUP via scanOnChain (shared cache).
 */
import { scanOnChain } from "@/lib/scan";
import { writeFileSync, mkdirSync } from "node:fs";

const JUP = process.env.JUP_MINT ?? "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

async function once(label: string) {
  const t0 = Date.now();
  const report = await scanOnChain(JUP, "solana");
  const wallMs = Date.now() - t0;
  return {
    label,
    wallMs,
    bytes: JSON.stringify(report).length,
    grade: report.grade,
    score: report.score,
    symbol: report.token.symbol,
    unavailable: report.checks.filter((c) => c.status === "unavailable").map((c) => c.id),
    sourcesFailed: report.sources.filter((s) => !s.ok).map((s) => ({ id: s.id, error: s.error })),
    scannedAt: report.scannedAt,
  };
}

async function main() {
  const coldSamples = [];
  // First sample is cold; then invalidate isn't possible without restart — warm hits cache.
  coldSamples.push(await once("cold-1"));
  const warm1 = await once("warm-1");
  const warm2 = await once("warm-2");
  // Simulate badge qualify→order: two warm hits must be ≤5s each (order path)
  const qualifyLike = warm1;
  const orderLike = warm2;

  const out = {
    mint: JUP,
    cold: coldSamples,
    warm: [warm1, warm2],
    acceptance: {
      coldP95TargetMs: 15_000,
      warmTargetMs: 2_000,
      badgeOrderTargetMs: 5_000,
      coldOk: coldSamples.every((s) => s.wallMs <= 15_000),
      warmOk: [warm1, warm2].every((s) => s.wallMs <= 2_000),
      badgeOrderOk: orderLike.wallMs <= 5_000,
      coldMaxMs: Math.max(...coldSamples.map((s) => s.wallMs)),
      warmMaxMs: Math.max(warm1.wallMs, warm2.wallMs),
    },
  };
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  mkdirSync("/tmp/cursor/artifacts", { recursive: true });
  writeFileSync("/opt/cursor/artifacts/jup-accept-timing.json", JSON.stringify(out, null, 2));
  writeFileSync("/tmp/cursor/artifacts/jup-accept-timing.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (!out.acceptance.coldOk || !out.acceptance.warmOk || !out.acceptance.badgeOrderOk) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
