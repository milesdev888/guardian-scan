import { fetchJson, fetchText } from "@/lib/http";
import { CHAINS } from "@/lib/chains/config";

const XRPL_RPC = CHAINS.XRPL.rpc;
const ACCOUNT_LINES_LIMIT = 400;
const ACCOUNT_LINES_MAX_PAGES = 20;

export const XRPL_BLACKHOLES = new Set([
  "rrrrrrrrrrrrrrrrrrrrBZbvji",
  "rrrrrrrrrrrrrrrrrrrrrhoLvTp",
]);

export const LSF_PASSWORD_SPENT = 0x00010000;
export const LSF_REQUIRE_DEST_TAG = 0x00020000;
export const LSF_REQUIRE_AUTH = 0x00040000;
export const LSF_DISALLOW_XRP = 0x00080000;
export const LSF_DISABLE_MASTER = 0x00100000;
export const LSF_NO_FREEZE = 0x00200000;
export const LSF_GLOBAL_FREEZE = 0x00400000;
export const LSF_DEFAULT_RIPPLE = 0x00800000;
export const LSF_DEPOSIT_AUTH = 0x01000000;
export const LSF_AMM = 0x02000000;
export const LSF_CLAWBACK = 0x80000000;

interface JsonRpcOk<T> {
  result: T & { status?: string; error?: string; error_message?: string };
}

export class XrplRpcError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "XrplRpcError";
  }
}

async function xrplRpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const body = {
    method,
    params: [{ ...params, ledger_index: params.ledger_index ?? "validated" }],
  };
  const json = await fetchJson<JsonRpcOk<T>>(XRPL_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = json.result;
  if (!result) {
    throw new XrplRpcError(`Empty XRPL result for ${method}`);
  }
  if (result.status === "error" || result.error) {
    throw new XrplRpcError(
      result.error_message || result.error || `XRPL ${method} failed`,
      result.error,
    );
  }
  return result as T;
}

export interface XrplAccountInfo {
  Account: string;
  Balance: string;
  Flags: number;
  Domain?: string;
  TransferRate?: number;
  RegularKey?: string;
  Sequence: number;
  OwnerCount: number;
}

export interface XrplAccountInfoResult {
  account_data: XrplAccountInfo;
  ledger_current_index?: number;
  ledger_index?: number;
}

export async function accountInfo(account: string): Promise<XrplAccountInfo> {
  const result = await xrplRpc<XrplAccountInfoResult>("account_info", {
    account,
    signer_lists: true,
  });
  return result.account_data;
}

export interface XrplSignerList {
  SignerList?: { SignerEntries?: unknown[]; SignerQuorum?: number };
}

export async function accountSignerList(account: string): Promise<boolean> {
  try {
    const result = await xrplRpc<XrplAccountInfoResult & { signer_lists?: XrplSignerList[] }>(
      "account_info",
      { account, signer_lists: true },
    );
    const lists = result.signer_lists ?? [];
    return lists.some((entry) => (entry.SignerList?.SignerEntries?.length ?? 0) > 0);
  } catch {
    return false;
  }
}

export function hasFlag(flags: number, bit: number): boolean {
  return (flags & bit) === bit;
}

export function isBlackholed(info: XrplAccountInfo, hasSignerList: boolean): boolean {
  const masterDisabled = hasFlag(info.Flags, LSF_DISABLE_MASTER);
  const regular = info.RegularKey?.trim();
  const usableRegular = Boolean(regular) && !XRPL_BLACKHOLES.has(regular!);
  return masterDisabled && !usableRegular && !hasSignerList;
}

export function decodeDomain(hex?: string): string | null {
  if (!hex) return null;
  try {
    const clean = hex.replace(/^0x/i, "");
    if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return null;
    const bytes = Buffer.from(clean, "hex");
    const text = bytes.toString("utf8").replace(/\0/g, "").trim();
    if (!text || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return null;
    return text.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function transferRatePercent(rate?: number): number | null {
  if (rate == null || rate === 0 || rate === 1_000_000_000) return 0;
  if (rate < 1_000_000_000) return null;
  return ((rate - 1_000_000_000) / 1_000_000_000) * 100;
}

export interface XrplCurrencyAmount {
  currency: string;
  issuer: string;
  value: string;
}

export interface XrplAccountLine {
  account: string;
  balance: string;
  currency: string;
  limit: string;
  limit_peer: string;
  quality_in?: number;
  quality_out?: number;
  freeze?: boolean;
  freeze_peer?: boolean;
  no_ripple?: boolean;
  no_ripple_peer?: boolean;
  authorized?: boolean;
}

export interface XrplAccountLinesResult {
  lines: XrplAccountLine[];
  marker?: unknown;
}

export async function accountLinesAll(
  account: string,
  options: { peer?: string; currency?: string } = {},
): Promise<{ lines: XrplAccountLine[]; truncated: boolean }> {
  const lines: XrplAccountLine[] = [];
  let marker: unknown = undefined;
  let pages = 0;
  let truncated = false;
  do {
    pages += 1;
    if (pages > ACCOUNT_LINES_MAX_PAGES) {
      truncated = true;
      break;
    }
    const params: Record<string, unknown> = {
      account,
      ledger_index: "validated",
      limit: ACCOUNT_LINES_LIMIT,
    };
    if (options.peer) params.peer = options.peer;
    if (options.currency) params.currency = options.currency;
    if (marker) params.marker = marker;
    const result = await xrplRpc<XrplAccountLinesResult>("account_lines", params);
    lines.push(...(result.lines ?? []));
    marker = result.marker;
  } while (marker);
  return { lines, truncated };
}

export interface XrplGatewayBalances {
  obligations?: Record<string, string>;
  balances?: Record<string, { currency: string; value: string }[]>;
  assets?: Record<string, { currency: string; value: string }[]>;
  frozen_balances?: Record<string, { currency: string; value: string }[]>;
}

export async function gatewayBalances(account: string): Promise<XrplGatewayBalances> {
  try {
    return await xrplRpc<XrplGatewayBalances>("gateway_balances", {
      account,
      ledger_index: "validated",
    });
  } catch {
    return {};
  }
}

export interface XrplIssuedCurrency {
  currency: string;
  display: string;
  obligation: string | null;
}

export function decodeCurrencyCode(code: string): string {
  if (!code) return code;
  if (code.length <= 3) return code;
  if (/^[0-9A-F]{40}$/i.test(code)) {
    try {
      const bytes = Buffer.from(code, "hex");
      const text = bytes.toString("utf8").replace(/\0/g, "").trim();
      if (text && /^[A-Za-z0-9._-]{1,20}$/.test(text)) return text;
    } catch {
      /* keep hex */
    }
  }
  return code;
}

export function currenciesFromGateway(balances: XrplGatewayBalances): XrplIssuedCurrency[] {
  const obligations = balances.obligations ?? {};
  return Object.entries(obligations).map(([currency, obligation]) => ({
    currency,
    display: decodeCurrencyCode(currency),
    obligation,
  }));
}

export interface XrplAmmInfo {
  amount?: string | XrplCurrencyAmount;
  amount2?: string | XrplCurrencyAmount;
  lp_token?: XrplCurrencyAmount;
  account?: string;
  trading_fee?: number;
  auction_slot?: unknown;
}

export async function ammInfo(
  asset: { currency: string; issuer?: string },
  asset2: { currency: string; issuer?: string },
): Promise<XrplAmmInfo | null> {
  try {
    const result = await xrplRpc<{ amm?: XrplAmmInfo }>("amm_info", { asset, asset2 });
    return result.amm ?? null;
  } catch {
    return null;
  }
}

export async function findIssuedAmm(
  issuer: string,
  currency: string,
): Promise<XrplAmmInfo | null> {
  const vsXrp = await ammInfo({ currency, issuer }, { currency: "XRP" });
  if (vsXrp) return vsXrp;
  return ammInfo({ currency: "XRP" }, { currency, issuer });
}

export interface XrplEscrow {
  Account: string;
  Destination: string;
  Amount: string | XrplCurrencyAmount;
  FinishAfter?: number;
  CancelAfter?: number;
  Condition?: string;
}

export async function accountEscrows(account: string): Promise<XrplEscrow[]> {
  try {
    const result = await xrplRpc<{ escrows?: XrplEscrow[] }>("account_objects", {
      account,
      type: "escrow",
      ledger_index: "validated",
    });
    return result.escrows ?? [];
  } catch {
    return [];
  }
}

export function tomlUrlForDomain(domain: string): string {
  const host = domain.replace(/^https?:\/\//i, "").split("/")[0] ?? domain;
  return `https://${host}/.well-known/xrp-ledger.toml`;
}

export interface XrplTomlEvidence {
  domain: string;
  url: string;
  ok: boolean;
  namesIssuer: boolean;
  namesCurrency: boolean;
  excerpt: string | null;
}

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 200).trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.includes("<head");
}

export async function fetchXrplToml(
  domain: string,
  issuer: string,
  currency?: string,
): Promise<XrplTomlEvidence> {
  const url = tomlUrlForDomain(domain);
  const evidence: XrplTomlEvidence = {
    domain,
    url,
    ok: false,
    namesIssuer: false,
    namesCurrency: false,
    excerpt: null,
  };
  try {
    const body = await fetchText(url, { timeoutMs: 8_000 });
    if (!body || looksLikeHtml(body)) return evidence;
    evidence.ok = true;
    evidence.namesIssuer = body.includes(issuer);
    if (currency) {
      const display = decodeCurrencyCode(currency);
      evidence.namesCurrency =
        body.includes(currency) || (display !== currency && body.includes(display));
    }
    evidence.excerpt = body.slice(0, 280).replace(/\s+/g, " ").trim();
    return evidence;
  } catch {
    return evidence;
  }
}

export async function accountCurrencies(account: string): Promise<{
  receive_currencies?: string[];
  send_currencies?: string[];
}> {
  try {
    return await xrplRpc("account_currencies", { account, ledger_index: "validated" });
  } catch {
    return {};
  }
}
