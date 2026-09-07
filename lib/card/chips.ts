/**
 * Share-card pattern chips — fixed vocabulary (SCAN_SHARE_CARD_SPEC).
 *
 * Rules:
 * - Only labels from CHIP_VOCAB may appear on the card.
 * - Max 4 chips.
 * - Risk chips always precede positive chips.
 * - Within each band, order follows RISK_ORDER / POSITIVE_ORDER (deterministic).
 * - Mapping is derived only from stored scan checks / patterns / badge status —
 *   never from URL params.
 *
 * Red (#E23B3B) is reserved for FRAUD_FLAG and REVOKED only.
 */

import type { Check, GuardianReport, Pattern } from "@/lib/guardian/types";

export type ChipKind = "risk" | "positive" | "fraud";

export type ChipDef = {
  id: string;
  label: string;
  kind: ChipKind;
};

/** Closed vocabulary — do not invent free-form chip text at render time. */
export const CHIP_VOCAB = {
  HONEYPOT: { id: "HONEYPOT", label: "HONEYPOT", kind: "risk" },
  MINT_AUTHORITY_LIVE: {
    id: "MINT_AUTHORITY_LIVE",
    label: "MINT AUTHORITY LIVE",
    kind: "risk",
  },
  FREEZE_AUTHORITY_LIVE: {
    id: "FREEZE_AUTHORITY_LIVE",
    label: "FREEZE AUTHORITY LIVE",
    kind: "risk",
  },
  HIGH_TRANSFER_TAX: {
    id: "HIGH_TRANSFER_TAX",
    label: "HIGH TRANSFER TAX",
    kind: "risk",
  },
  MUTABLE_METADATA: {
    id: "MUTABLE_METADATA",
    label: "MUTABLE METADATA",
    kind: "risk",
  },
  COPYCAT_TICKER: { id: "COPYCAT_TICKER", label: "COPYCAT TICKER", kind: "risk" },
  CONCENTRATED_HOLDERS: {
    id: "CONCENTRATED_HOLDERS",
    label: "CONCENTRATED HOLDERS",
    kind: "risk",
  },
  YOUNG_TOKEN: { id: "YOUNG_TOKEN", label: "YOUNG TOKEN", kind: "risk" },
  LP_UNVERIFIED: { id: "LP_UNVERIFIED", label: "LP UNVERIFIED", kind: "risk" },
  PROXY_UPGRADEABLE: {
    id: "PROXY_UPGRADEABLE",
    label: "PROXY / UPGRADEABLE",
    kind: "risk",
  },
  LP_UNLOCKED: { id: "LP_UNLOCKED", label: "LP UNLOCKED", kind: "risk" },
  FRAUD_FLAG: { id: "FRAUD_FLAG", label: "FRAUD FLAG", kind: "fraud" },
  REVOKED: { id: "REVOKED", label: "REVOKED", kind: "fraud" },
  LP_PERMANENT: { id: "LP_PERMANENT", label: "LP PERMANENT", kind: "positive" },
  AUTHORITIES_REVOKED: {
    id: "AUTHORITIES_REVOKED",
    label: "AUTHORITIES REVOKED",
    kind: "positive",
  },
  ESTABLISHED: { id: "ESTABLISHED", label: "ESTABLISHED", kind: "positive" },
  GUARDIAN_VERIFIED: {
    id: "GUARDIAN_VERIFIED",
    label: "GUARDIAN VERIFIED",
    kind: "positive",
  },
  DISPERSED_HOLDERS: {
    id: "DISPERSED_HOLDERS",
    label: "DISPERSED HOLDERS",
    kind: "positive",
  },
  NO_TRANSFER_TAX: {
    id: "NO_TRANSFER_TAX",
    label: "NO TRANSFER TAX",
    kind: "positive",
  },
} as const satisfies Record<string, ChipDef>;

export type ChipId = keyof typeof CHIP_VOCAB;

const RISK_ORDER: ChipId[] = [
  "FRAUD_FLAG",
  "REVOKED",
  "HONEYPOT",
  "MINT_AUTHORITY_LIVE",
  "FREEZE_AUTHORITY_LIVE",
  "PROXY_UPGRADEABLE",
  "HIGH_TRANSFER_TAX",
  "LP_UNLOCKED",
  "LP_UNVERIFIED",
  "MUTABLE_METADATA",
  "CONCENTRATED_HOLDERS",
  "COPYCAT_TICKER",
  "YOUNG_TOKEN",
];

const POSITIVE_ORDER: ChipId[] = [
  "GUARDIAN_VERIFIED",
  "ESTABLISHED",
  "LP_PERMANENT",
  "AUTHORITIES_REVOKED",
  "DISPERSED_HOLDERS",
  "NO_TRANSFER_TAX",
];

export type BadgeCardStatus = {
  valid: boolean;
  status: string | null;
  pathFamily: string | null;
  pathLabel: string | null;
  qualifyPath: string | null;
  serial: string | null;
};

function checkById(checks: Check[], id: string): Check | undefined {
  return checks.find((c) => c.id === id);
}

function textBlob(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function isEstablishedPath(badge: BadgeCardStatus | null): boolean {
  if (!badge) return false;
  const blob = textBlob(badge.pathFamily, badge.pathLabel, badge.qualifyPath);
  return blob.includes("established");
}

/**
 * Deterministic mapping: stored report (+ optional badge) → up to 4 chips.
 */
export function mapShareCardChips(
  report: GuardianReport,
  badge: BadgeCardStatus | null,
): ChipDef[] {
  const hit = new Set<ChipId>();
  const checks = report.checks ?? [];
  const patterns = report.patterns ?? [];

  if (badge && (badge.status || "").toUpperCase() === "REVOKED") {
    hit.add("REVOKED");
  }

  for (const p of patterns) {
    if (p.severity === "critical" || /fraud|scam|rug/i.test(`${p.id} ${p.title}`)) {
      hit.add("FRAUD_FLAG");
    }
  }

  const hp = checkById(checks, "honeypot_simulation");
  // Only fail grades / explicit flags — never match "No sell-trap…" pass copy.
  if (
    hp &&
    (hp.grade === "F" ||
      hp.grade === "D" ||
      (hp.status === "flag" && /honeypot|sell[\s-]?trap/i.test(hp.summary) && !/^no\b/i.test(hp.summary.trim())))
  ) {
    hit.add("HONEYPOT");
  }

  const owner = checkById(checks, "owner_privileges");
  if (owner) {
    const blob = textBlob(owner.summary, owner.detail);
    if (/mint/.test(blob) && /(live|active|present|not revoked|authority)/i.test(blob) && owner.grade !== "A") {
      hit.add("MINT_AUTHORITY_LIVE");
    }
    if (/freeze/.test(blob) && /(live|active|present|not revoked|authority)/i.test(blob) && owner.grade !== "A") {
      hit.add("FREEZE_AUTHORITY_LIVE");
    }
    if (owner.grade === "A" || /revoked/i.test(blob)) {
      hit.add("AUTHORITIES_REVOKED");
    }
  }

  const proxy = checkById(checks, "proxy_upgradeable");
  if (proxy && (proxy.grade === "F" || proxy.grade === "D" || proxy.status === "flag")) {
    hit.add("PROXY_UPGRADEABLE");
  }

  const tax = checkById(checks, "transfer_tax");
  if (tax) {
    if (tax.grade === "F" || tax.grade === "D") {
      hit.add("HIGH_TRANSFER_TAX");
    } else if (
      tax.status === "flag" &&
      /high|≥\s*10|>=\s*10|double-digit|[1-9]\d(\.\d+)?%/.test(tax.summary)
    ) {
      hit.add("HIGH_TRANSFER_TAX");
    } else if (tax.grade === "A" && /0%|no transfer tax|0\.0%/i.test(tax.summary)) {
      hit.add("NO_TRANSFER_TAX");
    }
  }

  const src = checkById(checks, "verified_source");
  if (src && (/mutable/i.test(textBlob(src.summary, src.detail)) || src.grade === "C" || src.grade === "D")) {
    hit.add("MUTABLE_METADATA");
  }

  const copies = checkById(checks, "copycats");
  if (
    (copies && copies.status === "flag") ||
    patterns.some((p) => p.id === "copycats" || /same ticker|copycat/i.test(p.title))
  ) {
    hit.add("COPYCAT_TICKER");
  }

  const holders = checkById(checks, "holder_concentration");
  if (holders) {
    if (holders.grade === "F" || holders.grade === "D") hit.add("CONCENTRATED_HOLDERS");
    else if (holders.grade === "A" || holders.grade === "B") hit.add("DISPERSED_HOLDERS");
  }

  const age = checkById(checks, "contract_age");
  // Young = weak age grade on a flag — not every "N days old" pass summary.
  if (age && (age.grade === "F" || age.grade === "D" || (age.status === "flag" && age.grade === "C"))) {
    hit.add("YOUNG_TOKEN");
  }

  const tier = report.lp?.tier ?? null;
  if (tier === "PERMANENT" || tier === "BURNED") {
    hit.add("LP_PERMANENT");
  } else if (tier === "UNVERIFIED") {
    hit.add("LP_UNVERIFIED");
  } else if (!tier || tier === "TIMED") {
    // unlocked / non-qualifying handled below via lp check grade
  }

  const lp = checkById(checks, "lp_lock");
  if (lp) {
    const established = isEstablishedPath(badge);
    if (
      !established &&
      (lp.grade === "F" || /unlocked|free\s*lp|no lock/i.test(textBlob(lp.summary, lp.detail)))
    ) {
      if (tier !== "PERMANENT" && tier !== "BURNED" && tier !== "TIMED") {
        hit.add("LP_UNLOCKED");
      }
    }
  }

  if (badge?.valid) hit.add("GUARDIAN_VERIFIED");
  if (isEstablishedPath(badge)) hit.add("ESTABLISHED");

  const picked: ChipDef[] = [];
  for (const id of [...RISK_ORDER, ...POSITIVE_ORDER]) {
    if (!hit.has(id)) continue;
    // Drop positive LP_PERMANENT if we already have risk LP chips crowding — still allow both bands by order
    picked.push(CHIP_VOCAB[id]);
    if (picked.length >= 4) break;
  }
  return picked;
}

/** Chip fill colors — red only for fraud/revocation. */
export function chipColors(kind: ChipKind): { bg: string; fg: string; border: string } {
  if (kind === "fraud") {
    return { bg: "rgba(226,59,59,0.18)", fg: "#FF6B6B", border: "rgba(226,59,59,0.55)" };
  }
  if (kind === "risk") {
    return { bg: "rgba(224,154,60,0.14)", fg: "#E09A3C", border: "rgba(224,154,60,0.45)" };
  }
  return { bg: "rgba(232,197,106,0.12)", fg: "#E8C56A", border: "rgba(232,197,106,0.4)" };
}
