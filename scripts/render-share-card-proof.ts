/**
 * Proof renders after share-card path/safe-zone fixes.
 * LAPTOP (Base) + Solana fixture + EVM live.
 */
import fs from "node:fs";
import { buildShareCardModel } from "../lib/card/model";
import { renderShareCardPng } from "../lib/card/render";
import type { BadgeCardStatus } from "../lib/card/chips";
import type { GuardianReport } from "../lib/guardian/types";

const OUT = "/opt/cursor/artifacts";
const TMP = "/tmp/cursor/artifacts";

async function fetchReport(address: string, chain?: string): Promise<GuardianReport | null> {
  const qs = new URLSearchParams({ address });
  if (chain) qs.set("chain", chain);
  const res = await fetch(`https://scan.cyre.dev/api/scan?${qs}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    console.error("scan fail", address, res.status, await res.text().then((t) => t.slice(0, 200)));
    return null;
  }
  const data = (await res.json()) as {
    kind?: string;
    reports?: GuardianReport[];
    schema?: string;
  };
  if (data.kind === "report" && data.reports?.[0]) return data.reports[0];
  if (data.schema) return data as GuardianReport;
  console.error("unexpected shape", address, Object.keys(data));
  return null;
}

async function writeCard(label: string, report: GuardianReport, badge: BadgeCardStatus | null) {
  const model = buildShareCardModel(report, badge);
  const png = await renderShareCardPng(model);
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(`${OUT}/share-card-${label}.png`, png);
  fs.writeFileSync(`${TMP}/share-card-${label}.png`, png);
  console.log(
    "wrote",
    label,
    png.length,
    model.tokenName,
    model.ticker,
    model.chainName,
    model.grade,
  );
}

async function main() {
  const badge: BadgeCardStatus = {
    valid: true,
    status: "VALID",
    pathFamily: "secured",
    pathLabel: "Lifetime",
    qualifyPath: "lifetime",
    serial: "GRD-2026-00001",
  };

  // Base $LAPTOP (boosted @Cyredev888 share-card)
  const laptop = await fetchReport("0xB095274743941e953c746F9C228DA9c18Bb6ec29", "base");
  if (laptop) await writeCard("laptop-base", laptop, null);

  const c7 = JSON.parse(
    fs.readFileSync("lib/card/fixtures/c7-report.json", "utf8"),
  ) as GuardianReport;
  await writeCard("solana-c7", c7, badge);

  const zes = JSON.parse(
    fs.readFileSync("lib/card/fixtures/zes-report.json", "utf8"),
  ) as GuardianReport;
  await writeCard("solana-zes", zes, null);

  const usdc = await fetchReport("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "ethereum");
  if (usdc) await writeCard("evm-usdc", usdc, null);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
