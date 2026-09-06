import { asArray, asRecord, fetchJson, fetchText, num, str } from "@/lib/http";
import { XRPL } from "@/lib/chains/config";
import type { XrplIssuance } from "@/lib/guardian/types";

export const LSF_DISABLE_MASTER = 0x00_10_00_00;
export const LSF_NO_FREEZE = 0x00_20_00_00;
export const LSF_GLOBAL_FREEZE = 0x00_40_00_00;
export const LSF_DEFAULT_RIPPLE = 0x00_80_00_00;
export const LSF_REQUIRE_DEST_TAG = 0x00_02_00_00;
export const LSF_REQUIRE_AUTH = 0x00_04_00_00;
export const LSF_DISALLOW_XRP = 0x00_08_00_00;
export const LSF_DEPOSIT_AUTH = 0x01_00_00_00;
export const LSF_ALLOW_TRUSTLINE_CLAWBACK = 0x80_00_00_00;

/** Well-known unusable accounts. RegularKey pointing here cannot sign. */
export const XRPL_BLACKHOLES = new Set([
  "rrrrrrrrrrrrrrrrrrrrBZbvji", // ACCOUNT_ZERO
  "rrrrrrrrrrrrrrrrrrrrrhoLvTp", // ACCOUNT_ONE
]);

export const TRANSFER_RATE_NEUTRAL = 1_000_000_000;

const MAX_LINE_PAGES = 20;
const LINE_LIMIT = 400;

export type XrplAccountRoot = {
  Account: string;
  Flags: number;
  RegularKey?: string;
  Domain?: string;
  TransferRate?: number;
  Sequence?: number;
  Balance?: string;
};

export type XrplTrustLine = {
  account: string;
  balance: number;
  currency: string;
  limit: string | null;
  limitPeer: string | null;
  freeze: boolean;
};

export type XrplAmmInfo = {
  account: string;
  lpCurrency: string;
  lpIssuer: string;
  lpValue: number | null;
  tradingFee: number | null;
  amount: unknown;
  amount2: unknown;
};

export type TomlVerdict = {
  domain: string | null;
  fetched: boolean;
  namedIssuer: boolean;
  namedToken: boolean;
  error?: string;
};

type RpcEnvelope = {
  result?: Record<string, unknown>;
  error?: string;
  error_message?: string;
};

export function hasFlag(flags: number | null | undefined, bit: number) {
  return Boolean((flags ?? 0) & bit);
}

export function isBlackholeAddress(address: string | null | undefined) {
  if (!address) return false;
  return XRPL_BLACKHOLES.has(address);
}

export function transferRatePct(rate: number | null | undefined): number {
  if (rate === null || rate === undefined || rate === 0) return 0;
  return Math.max(0, (rate / TRANSFER_RATE_NEUTRAL - 1) * 100);
}

export function decodeHexAscii(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return null;
  try {
    const text = Buffer.from(clean, "hex").toString("utf8").replace(/\0/g, "").trim();
    if (!text || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export function domainHost(domainHexOrHost: string | null | undefined): string | null {
  const raw = decodeHexAscii(domainHexOrHost) ?? domainHexOrHost?.trim() ?? null;
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProto);
    return url.hostname.replace(/^www\./i, "") || null;
  } catch {
    return raw.replace(/^https?:\/\//i, "").split("/")[0]?.replace(/^www\./i, "") || null;
  }
}

export function decodeCurrency(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 3) return trimmed;
  if (/^[0-9A-Fa-f]{40}$/.test(trimmed)) {
    const ascii = decodeHexAscii(trimmed);
    if (ascii && /^[\x20-\x7E]+$/.test(ascii)) return ascii;
  }
  return trimmed;
}

export function currenciesMatch(requested: string, ledgerCode: string) {
  const a = requested.trim();
  const b = ledgerCode.trim();
  if (a === b) return true;
  return decodeCurrency(a).toLowerCase() === decodeCurrency(b).toLowerCase();
}

export function resolveLedgerCurrency(requested: string, codes: string[]): string | null {
  const exact = codes.find((code) => code === requested.trim());
  if (exact) return exact;
  const hits = codes.filter((code) => currenciesMatch(requested, code));
  return hits[0] ?? null;
}

export type BlackholeAssessment = {
  blackholed: boolean;
  disableMaster: boolean;
  regularKey: string | null;
  regularKeyUsable: boolean;
  signerList: boolean;
  summary: string;
};

export function assessBlackhole(input: {
  flags: number;
  regularKey?: string | null;
  signerList: boolean;
}): BlackholeAssessment {
  const disableMaster = hasFlag(input.flags, LSF_DISABLE_MASTER);
  const regularKey = input.regularKey ?? null;
  const regularKeyUsable = Boolean(regularKey) && !isBlackholeAddress(regularKey);
  const blackholed = disableMaster && !regularKeyUsable && !input.signerList;
  const summary = blackholed
    ? `Master key disabled; ${
        regularKey ? `regular key is the blackhole ${regularKey}` : "no regular key"
      }; no signer list.`
    : [
        disableMaster ? "Master key disabled" : "Master key still enabled",
        regularKeyUsable
          ? `usable regular key ${regularKey}`
          : regularKey
            ? `regular key ${regularKey} (unusable)`
            : "no regular key",
        input.signerList ? "signer list present" : "no signer list",
      ].join("; ");
  return {
    blackholed,
    disableMaster,
    regularKey,
    regularKeyUsable,
    signerList: input.signerList,
    summary,
  };
}

export function tomlNamesIssuer(toml: string, issuer: string, currency?: string | null) {
  const blob = toml.replace(/\s+/g, " ");
  const namedIssuer = blob.includes(issuer);
  if (!namedIssuer) return { namedIssuer: false, namedToken: false };
  if (!currency) return { namedIssuer: true, namedToken: true };
  const display = decodeCurrency(currency);
  const namedToken =
    blob.includes(currency) ||
    new RegExp(`currency\\s*=\\s*["']${escapeReg(display)}["']`, "i").test(toml) ||
    toml.toLowerCase().includes(display.toLowerCase());
  return { namedIssuer: true, namedToken };
}

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rpcUrl() {
  return XRPL.rpcUrl;
}

export async function xrplRpc<T = Record<string, unknown>>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const result = await fetchJson<RpcEnvelope>(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    timeoutMs: 18_000,
    body: JSON.stringify({ method, params: [params] }),
  });
  if (!result.ok) return { ok: false, error: result.error };
  const payload = result.data.result ?? result.data;
  const record = asRecord(payload) ?? {};
  const status = str(record.status);
  const err = str(record.error) ?? str(result.data.error);
  if (status === "error" || err) {
    return {
      ok: false,
      error: str(record.error_message) ?? str(result.data.error_message) ?? err ?? "XRPL RPC error",
    };
  }
  return { ok: true, data: record as T };
}

export async function fetchAccountInfo(account: string) {
  const result = await xrplRpc<{ account_data?: Record<string, unknown> }>("account_info", {
    account,
    ledger_index: "validated",
    signer_lists: true,
  });
  if (!result.ok) return { account: null as XrplAccountRoot | null, signerList: false, error: result.error };
  const raw = asRecord(result.data.account_data);
  if (!raw) return { account: null as XrplAccountRoot | null, signerList: false, error: "No account_data" };
  const signerLists = asArray((result.data as { signer_lists?: unknown }).signer_lists);
  return {
    account: {
      Account: str(raw.Account) ?? account,
      Flags: num(raw.Flags) ?? 0,
      RegularKey: str(raw.RegularKey) ?? undefined,
      Domain: str(raw.Domain) ?? undefined,
      TransferRate: num(raw.TransferRate) ?? undefined,
      Sequence: num(raw.Sequence) ?? undefined,
      Balance: str(raw.Balance) ?? undefined,
    } satisfies XrplAccountRoot,
    signerList: signerLists.length > 0,
    error: undefined as string | undefined,
  };
}

export async function fetchSignerList(account: string) {
  const result = await xrplRpc<{ account_objects?: unknown[] }>("account_objects", {
    account,
    type: "signer_list",
    ledger_index: "validated",
  });
  if (!result.ok) return { present: false, error: result.error };
  return { present: asArray(result.data.account_objects).length > 0, error: undefined as string | undefined };
}

export async function fetchGatewayBalances(account: string) {
  const result = await xrplRpc<{ obligations?: Record<string, string> }>("gateway_balances", {
    account,
    ledger_index: "validated",
    strict: true,
  });
  if (!result.ok) return { issuances: [] as XrplIssuance[], error: result.error };
  const obligations = asRecord(result.data.obligations) ?? {};
  const issuances: XrplIssuance[] = Object.entries(obligations).map(([currency, value]) => ({
    currency,
    display: decodeCurrency(currency),
    value: String(value),
  }));
  issuances.sort((a, b) => Number(b.value) - Number(a.value) || a.display.localeCompare(b.display));
  return { issuances, error: undefined as string | undefined };
}

export async function fetchAccountLines(
  account: string,
  opts?: { currency?: string; peer?: string; maxPages?: number },
) {
  const lines: XrplTrustLine[] = [];
  let marker: unknown;
  let pages = 0;
  let truncated = false;
  let error: string | undefined;
  const maxPages = opts?.maxPages ?? MAX_LINE_PAGES;

  while (pages < maxPages) {
    const params: Record<string, unknown> = {
      account,
      ledger_index: "validated",
      limit: LINE_LIMIT,
    };
    if (opts?.peer) params.peer = opts.peer;
    if (marker) params.marker = marker;
    const result = await xrplRpc<{ lines?: unknown[]; marker?: unknown }>("account_lines", params);
    if (!result.ok) {
      error = result.error;
      break;
    }
    for (const raw of asArray(result.data.lines)) {
      const row = asRecord(raw);
      if (!row) continue;
      const currency = str(row.currency);
      if (!currency) continue;
      if (opts?.currency && !currenciesMatch(opts.currency, currency)) continue;
      lines.push({
        account: str(row.account) ?? "",
        balance: num(row.balance) ?? 0,
        currency,
        limit: str(row.limit),
        limitPeer: str(row.limit_peer),
        freeze: Boolean(row.freeze) || Boolean(row.freeze_peer),
      });
    }
    pages += 1;
    marker = result.data.marker;
    if (!marker) break;
  }
  if (marker) truncated = true;
  return { lines, pages, truncated, sampled: lines.length, error };
}

export async function fetchAmmInfo(currency: string, issuer: string, quote?: { currency: string; issuer?: string }) {
  const asset = { currency, issuer };
  const asset2 = quote?.issuer
    ? { currency: quote.currency, issuer: quote.issuer }
    : { currency: quote?.currency ?? "XRP" };
  const attempts = [
    { asset, asset2 },
    { asset: asset2, asset2: asset },
  ];
  let lastError: string | undefined;
  for (const params of attempts) {
    const result = await xrplRpc<{ amm?: Record<string, unknown> }>("amm_info", params);
    if (!result.ok) {
      lastError = result.error;
      continue;
    }
    const amm = asRecord(result.data.amm);
    if (!amm) continue;
    const lp = asRecord(amm.lp_token);
    return {
      amm: {
        account: str(amm.account) ?? "",
        lpCurrency: str(lp?.currency) ?? "",
        lpIssuer: str(lp?.issuer) ?? str(amm.account) ?? "",
        lpValue: num(lp?.value),
        tradingFee: num(amm.trading_fee),
        amount: amm.amount,
        amount2: amm.amount2,
      } satisfies XrplAmmInfo,
      error: undefined as string | undefined,
    };
  }
  return { amm: null as XrplAmmInfo | null, error: lastError };
}

export async function fetchEscrows(account: string) {
  const result = await xrplRpc<{ account_objects?: unknown[] }>("account_objects", {
    account,
    type: "escrow",
    ledger_index: "validated",
    limit: 200,
  });
  if (!result.ok) return { escrows: [] as Array<{ finishAfter: string | null }>, error: result.error };
  const escrows = asArray(result.data.account_objects).map((raw) => {
    const row = asRecord(raw);
    const finish = num(row?.FinishAfter);
    return {
      finishAfter: finish ? new Date(rippleTimeToUnix(finish) * 1000).toISOString() : null,
    };
  });
  return { escrows, error: undefined as string | undefined };
}

/** Ripple epoch: seconds since 2000-01-01 00:00 UTC. */
export function rippleTimeToUnix(rippleTime: number) {
  return rippleTime + 946_684_800;
}

export async function fetchXrplToml(host: string, issuer: string, currency?: string | null): Promise<TomlVerdict> {
  const hosts = [host.replace(/^www\./i, "")];
  if (!host.startsWith("www.")) hosts.push(`www.${hosts[0]}`);
  let lastError: string | undefined;
  for (const name of hosts) {
    const url = `https://${name}/.well-known/xrp-ledger.toml`;
    const result = await fetchText(url, { timeoutMs: 10_000 });
    if (!result.ok) {
      lastError = result.status ? `HTTP ${result.status}` : result.error;
      continue;
    }
    const body = result.data.trim();
    if (!body || body.startsWith("<") || /<!DOCTYPE/i.test(body)) {
      lastError = "Toml endpoint returned HTML";
      continue;
    }
    const named = tomlNamesIssuer(body, issuer, currency);
    return {
      domain: name,
      fetched: true,
      namedIssuer: named.namedIssuer,
      namedToken: named.namedToken,
    };
  }
  return { domain: host, fetched: false, namedIssuer: false, namedToken: false, error: lastError };
}

export function issuedAmountFromIssuerLine(balance: number) {
  // From the issuer's view a negative RippleState balance means the peer holds issued tokens.
  return Math.abs(balance);
}
