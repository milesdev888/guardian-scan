import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildShareCardModel } from "./model";
import { renderShareCardSvg } from "./render";
import type { ScanReport } from "@/lib/guardian/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "../../fixtures/sample-report.json");

function loadFixture(): ScanReport {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as ScanReport;
}

test("share card model keeps fixture grade and score unchanged", () => {
  const report = loadFixture();
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "fixture-scan",
  });

  assert.equal(model.grade, report.grade);
  assert.equal(model.score, report.score);
  assert.equal(model.tokenName, report.token.name);
  assert.equal(model.tokenSymbol, report.token.symbol);
  assert.equal(model.chain, report.token.chain);
  assert.equal(model.headline, report.headline);
  assert.ok(model.wordmarkDataUrl.startsWith("data:image/svg+xml"));
  assert.ok(model.scannedAtLabel.length > 0);
  assert.equal(model.gradeHex, "#3DDC97");
});

test("share card model uses AA grade hex for AA reports", () => {
  const report = {
    ...loadFixture(),
    grade: "AA" as const,
    score: 94,
  };
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "fixture-scan-aa",
  });

  assert.equal(model.grade, "AA");
  assert.equal(model.gradeHex, "#E8E8E8");
});

test("share card SVG includes grade, score, and Cyre wordmark", () => {
  const report = loadFixture();
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "fixture-scan",
  });
  const svg = renderShareCardSvg(model);

  assert.match(svg, /<svg[\s\S]*<\/svg>/);
  assert.match(svg, new RegExp(`>${model.grade}<`));
  assert.match(svg, new RegExp(`${model.score}/100`));
  assert.match(svg, /href="data:image\/svg\+xml/);
  assert.match(svg, /Scanned/);
  assert.match(svg, /CYRE SCAN/);
  assert.match(svg, /guardian security report/);
});

test("share card SVG keeps grade lettering crisp (no blur/shadow filters)", () => {
  const report = loadFixture();
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "fixture-scan",
  });
  const svg = renderShareCardSvg(model);

  assert.doesNotMatch(svg, /filter=/);
  assert.doesNotMatch(svg, /feGaussianBlur/);
  assert.doesNotMatch(svg, /feDropShadow/);
  assert.match(svg, /font-family="Inter, Arial, sans-serif"/);
});

test("share card SVG escapes unsafe token text", () => {
  const report = {
    ...loadFixture(),
    token: {
      ...loadFixture().token,
      name: `Alpha <script>alert(1)</script>`,
      symbol: `A&B"C'`,
    },
    headline: `Risk "quoted" & <tagged>`,
  };
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "escape-scan",
  });
  const svg = renderShareCardSvg(model);

  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /&amp;/);
  assert.match(svg, /&quot;/);
});

test("share card SVG truncates long names without breaking layout constants", () => {
  const report = {
    ...loadFixture(),
    token: {
      ...loadFixture().token,
      name: "Supercalifragilisticexpialidocious Token Name That Should Truncate",
      symbol: "LONGSYMBOLNAME",
    },
  };
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "truncate-scan",
  });
  const svg = renderShareCardSvg(model);

  assert.match(svg, /\.\.\./);
  assert.match(svg, /viewBox="0 0 1200 630"/);
});

test("share card SVG includes optional icon when provided", () => {
  const report = loadFixture();
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "icon-scan",
    iconDataUrl: "data:image/png;base64,abc",
  });
  const svg = renderShareCardSvg(model);

  assert.match(svg, /href="data:image\/png;base64,abc"/);
  assert.match(svg, /clipPath/);
});

test("share card SVG falls back when icon is missing", () => {
  const report = loadFixture();
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "no-icon-scan",
  });
  const svg = renderShareCardSvg(model);

  assert.doesNotMatch(svg, /clipPath/);
  assert.match(svg, />S</);
});

test("share card model prefers remote iconUrl and keeps it out of SVG when unsafe", () => {
  const report = {
    ...loadFixture(),
    token: {
      ...loadFixture().token,
      iconUrl: "https://cdn.example/token.png",
    },
  };
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "remote-icon",
  });

  assert.equal(model.iconUrl, "https://cdn.example/token.png");
  const svg = renderShareCardSvg(model);
  assert.doesNotMatch(svg, /cdn\.example/);
});

test("share card SVG prefers remote https iconUrl over data URL", () => {
  const report = {
    ...loadFixture(),
    token: {
      ...loadFixture().token,
      iconUrl: "https://cdn.example/token.png",
    },
  };
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "remote-icon-svg",
    iconDataUrl: "data:image/png;base64,abc",
  });
  const svg = renderShareCardSvg(model);

  assert.match(svg, /href="https:\/\/cdn\.example\/token\.png"/);
  assert.doesNotMatch(svg, /data:image\/png;base64,abc/);
});

test("share card SVG rejects non-https remote iconUrl", () => {
  const report = {
    ...loadFixture(),
    token: {
      ...loadFixture().token,
      iconUrl: "http://cdn.example/token.png",
    },
  };
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "insecure-icon",
    iconDataUrl: "data:image/png;base64,abc",
  });
  const svg = renderShareCardSvg(model);

  assert.doesNotMatch(svg, /cdn\.example/);
  assert.match(svg, /href="data:image\/png;base64,abc"/);
});

test("share card SVG keeps status pills inside the safe content column", () => {
  const report = loadFixture();
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "pill-layout",
  });
  const svg = renderShareCardSvg(model);

  const mintX = Number(/>(Mint (?:revoked|active))<\/text>/.exec(svg)?.index != null
    ? /x="(\d+)"[^>]*>Mint /.exec(svg)?.[1]
    : undefined);
  // Soft layout assertion: mint pill label should render in the left content column.
  assert.ok(svg.includes("Mint "));
  assert.ok(svg.includes("Freeze "));
  assert.ok(svg.includes("% locked"));
  assert.ok(!svg.includes("% secured"));
  void mintX;
});

test("share card SVG draws the grade inside an ornate circular seal", () => {
  const report = loadFixture();
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "seal-layout",
  });
  const svg = renderShareCardSvg(model);

  assert.match(svg, /<circle cx="984" cy="292" r="118"/);
  assert.match(svg, /stroke-dasharray="2\.2 7\.5"/);
  assert.match(svg, /GUARDIAN GRADE/);
  assert.match(svg, /textPath/);
  assert.match(svg, /CYRE/);
  assert.match(svg, /ESTABLISHED/);
  assert.match(svg, /SECURITY/);
  assert.doesNotMatch(svg, />SCANNED</);
  assert.doesNotMatch(svg, /A · ESTABLISHED/);
  assert.match(svg, /font-size="92"/);
});

test("share card SVG keeps status copy on one baseline with middot separators", () => {
  const report = loadFixture();
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "status-baseline",
  });
  const svg = renderShareCardSvg(model);

  assert.match(svg, /Mint revoked · Freeze revoked · \d+% locked/);
  assert.doesNotMatch(svg, /<rect[^>]*rx="16"[^>]*fill="rgba\(255,255,255,0\.04\)"/);
  assert.doesNotMatch(svg, /% secured/);
});

test("AA share card seal uses platinum pathWord instead of ESTABLISHED", () => {
  const report = {
    ...loadFixture(),
    grade: "AA" as const,
    score: 94,
  };
  const model = buildShareCardModel(report, {
    scannedAt: "2026-03-22T12:00:00.000Z",
    scanId: "aa-seal",
  });
  const svg = renderShareCardSvg(model);

  assert.equal(model.grade, "AA");
  assert.match(svg, /PLATINUM/);
  assert.doesNotMatch(svg, /ESTABLISHED/);
  assert.match(svg, />AA</);
});
