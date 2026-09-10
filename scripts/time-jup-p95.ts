import { SolanaAdapter } from "@/lib/adapters/solana";
import { SOLANA } from "@/lib/chains/config";
import { writeFileSync, mkdirSync } from "node:fs";

const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const N = Number(process.env.SAMPLES ?? 5);
const adapter = new SolanaAdapter();

async function main() {
  const samples: number[] = [];
  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    await adapter.scan(JUP, SOLANA);
    const ms = Date.now() - t0;
    samples.push(ms);
    console.error(`sample ${i + 1}/${N} ${ms}ms`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
  const out = {
    mint: JUP,
    samples,
    p50: sorted[Math.floor(sorted.length / 2)],
    p95,
    max: Math.max(...samples),
    min: Math.min(...samples),
    coldP95Ok: p95 <= 15_000,
  };
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  writeFileSync("/opt/cursor/artifacts/jup-cold-p95.json", JSON.stringify(out, null, 2));
  writeFileSync("/tmp/cursor/artifacts/jup-cold-p95.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (!out.coldP95Ok) process.exitCode = 2;
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
