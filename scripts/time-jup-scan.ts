/**
 * Cold Solana scan timing probe for JUP.
 * Prints [scan-timing] lines from the adapter and a summary JSON.
 *
 * Usage: npx tsx scripts/time-jup-scan.ts
 */
import { SolanaAdapter } from "@/lib/adapters/solana";
import { SOLANA } from "@/lib/chains/config";
import { writeFileSync, mkdirSync } from "node:fs";

const JUP = process.env.JUP_MINT ?? "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

async function main() {
  const adapter = new SolanaAdapter();
  const t0 = Date.now();
  console.error(`cold scan start ${JUP} at ${new Date().toISOString()}`);
  const report = await adapter.scan(JUP, SOLANA);
  const wallMs = Date.now() - t0;
  const json = JSON.stringify(report);
  const summary = {
    mint: JUP,
    wallMs,
    bytes: json.length,
    grade: report.grade,
    score: report.score,
    symbol: report.token.symbol,
    checkCount: report.checks.length,
    sourceCount: report.sources.length,
    sources: report.sources,
    checks: report.checks.map((c) => ({
      id: c.id,
      status: c.status,
      grade: c.grade,
    })),
    scannedAt: report.scannedAt,
  };
  mkdirSync("/tmp/cursor/artifacts", { recursive: true });
  const out = `/tmp/cursor/artifacts/jup-cold-scan-baseline.json`;
  writeFileSync(out, JSON.stringify(summary, null, 2));
  writeFileSync(
    `/tmp/cursor/artifacts/jup-cold-scan-baseline-report.json`,
    json,
  );
  console.error(`cold scan done wallMs=${wallMs} bytes=${json.length}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
