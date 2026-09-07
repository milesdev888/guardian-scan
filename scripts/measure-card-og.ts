/**
 * Measure full + OG share-card PNG sizes (acceptance: OG under 300KB ~1024px).
 */
import fs from "node:fs";
import { buildShareCardModel } from "../lib/card/model";
import {
  CARD_HEIGHT,
  CARD_OG_WIDTH,
  CARD_WIDTH,
  renderShareCardOgPng,
  renderShareCardPng,
} from "../lib/card/render";
import type { GuardianReport } from "../lib/guardian/types";

async function main() {
  const report = JSON.parse(
    fs.readFileSync("lib/card/fixtures/c7-report.json", "utf8"),
  ) as GuardianReport;
  const model = buildShareCardModel(report, { valid: true, status: "VALID", pathFamily: "secured", pathLabel: "Lifetime", qualifyPath: "lifetime", serial: "GRD-2026-00001" }, {
    publicOrigin: "https://scan.cyre.dev",
  });
  const full = await renderShareCardPng(model);
  const og = await renderShareCardOgPng(model);
  console.log(
    JSON.stringify(
      {
        full: {
          bytes: full.length,
          kb: Number((full.length / 1024).toFixed(1)),
          size: `${CARD_WIDTH}x${CARD_HEIGHT}`,
        },
        og: {
          bytes: og.length,
          kb: Number((og.length / 1024).toFixed(1)),
          targetWidth: CARD_OG_WIDTH,
          under300kb: og.length < 300 * 1024,
        },
      },
      null,
      2,
    ),
  );
  if (og.length >= 300 * 1024) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
