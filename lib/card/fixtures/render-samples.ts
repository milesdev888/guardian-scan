import fs from "node:fs";
import { buildShareCardModel } from "../model";
import { renderShareCardPng } from "../render";
import type { BadgeCardStatus } from "../chips";
import type { GuardianReport } from "../../guardian/types";

async function main() {
  const c7 = JSON.parse(
    fs.readFileSync("lib/card/fixtures/c7-report.json", "utf8"),
  ) as GuardianReport;
  const zes = JSON.parse(
    fs.readFileSync("lib/card/fixtures/zes-report.json", "utf8"),
  ) as GuardianReport;
  const badge: BadgeCardStatus = {
    valid: true,
    status: "VALID",
    pathFamily: "secured",
    pathLabel: "Lifetime",
    qualifyPath: "lifetime",
    serial: "GRD-2026-00001",
  };
  const a = await renderShareCardPng(buildShareCardModel(c7, badge));
  const b = await renderShareCardPng(buildShareCardModel(zes, null));
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync("/opt/cursor/artifacts/share-card-c7.png", a);
  fs.writeFileSync("/opt/cursor/artifacts/share-card-zes.png", b);
  console.log("wrote artifacts", a.length, b.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
