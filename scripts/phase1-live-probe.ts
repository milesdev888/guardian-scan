import { SolanaAdapter } from "@/lib/adapters/solana";
import { SOLANA } from "@/lib/chains/config";

const C7 = "979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww";
const GOOD = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RUG = process.env.KNOWN_RUG_MINT ?? "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs";

const adapter = new SolanaAdapter();
const pick = (r: Awaited<ReturnType<SolanaAdapter["scan"]>>, id: string) =>
  r.checks.find((c) => c.id === id);

async function run(label: string, mint: string) {
  console.log("\n====", label, mint, "====");
  const report = await adapter.scan(mint, SOLANA);
  console.log("grade", report.grade, "score", report.score, report.token.symbol);
  console.log("lp", JSON.stringify(report.lp));
  console.log("lp_lock", pick(report, "lp_lock")?.summary);
  console.log("holders", pick(report, "holder_concentration")?.summary);
  console.log(
    "tags",
    report.holders.map((h) => `${h.tag ?? "wallet"}:${(h.percent ?? 0).toFixed(1)}%`).join(" | "),
  );
  console.log("deployer", pick(report, "deployer_age")?.summary);
  console.log("copycats", pick(report, "copycats")?.summary, "n=", report.copycats.length);
  return report;
}

async function main() {
  const c7 = await run("C7", C7);
  let failed = false;
  if (c7.lp?.tier !== "PERMANENT") {
    console.error("FAIL tier", c7.lp?.tier);
    failed = true;
  }
  if (!/Creator\s+\S+/.test(pick(c7, "deployer_age")?.summary ?? "")) {
    console.error("FAIL deployer");
    failed = true;
  }
  if (c7.copycats.length < 6) console.warn("WARN copycats", c7.copycats.length);
  await run("GOOD_USDC", GOOD);
  await run("RUG_CONTROL", RUG);
  console.log(failed ? "\nFAILED" : "\nOK");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
