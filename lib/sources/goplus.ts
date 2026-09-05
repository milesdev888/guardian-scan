import { asRecord, fetchJson, flag, num } from "@/lib/http";
import type { EvmChainConfig } from "@/lib/guardian/types";

export type GoPlusEvmToken = {
  token_name?: string;
  token_symbol?: string;
  holder_count?: string;
  total_supply?: string;
  creator_address?: string;
  creator_percent?: string;
  owner_address?: string;
  owner_percent?: string;
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  hidden_owner?: string;
  selfdestruct?: string;
  external_call?: string;
  gas_abuse?: string;
  buy_tax?: string;
  sell_tax?: string;
  transfer_pausable?: string;
  is_blacklisted?: string;
  is_whitelisted?: string;
  is_anti_whale?: string;
  anti_whale_modifiable?: string;
  slippage_modifiable?: string;
  personal_slippage_modifiable?: string;
  trading_cooldown?: string;
  is_honeypot?: string;
  honeypot_with_same_creator?: string;
  cannot_buy?: string;
  cannot_sell_all?: string;
  is_in_dex?: string;
  trust_list?: string;
  other_potential_risks?: string;
  note?: string;
  holders?: Array<{
    address?: string;
    percent?: string;
    tag?: string;
    is_locked?: number | string;
  }>;
  lp_holders?: Array<{
    address?: string;
    percent?: string;
    tag?: string;
    is_locked?: number | string;
    is_contract?: number | string;
  }>;
  dex?: Array<{
    name?: string;
    liquidity?: string;
    pair?: string;
  }>;
};

export async function fetchGoPlusEvm(
  chain: EvmChainConfig,
  address: string,
): Promise<{ data: GoPlusEvmToken | null; error?: string }> {
  if (!chain.goPlusChainId) {
    return { data: null, error: "GoPlus does not list this chain" };
  }
  const url = `https://api.gopluslabs.io/api/v1/token_security/${chain.goPlusChainId}?contract_addresses=${address.toLowerCase()}`;
  const result = await fetchJson<Record<string, unknown>>(url);
  if (!result.ok) return { data: null, error: result.error };
  const payload = asRecord(result.data.result) ?? asRecord(result.data);
  if (!payload) return { data: null, error: "GoPlus returned no result" };
  const token =
    asRecord(payload[address.toLowerCase()]) ??
    (Object.values(payload)[0] as Record<string, unknown> | undefined);
  if (!token) return { data: null, error: "GoPlus has no record for this address" };
  return { data: token as GoPlusEvmToken };
}

export type GoPlusSolanaToken = {
  token_name?: string;
  token_symbol?: string;
  creator_address?: string;
  mintable?: { status?: string };
  freezable?: { status?: string };
  balance_mutable_authority?: { status?: string };
  closable?: { status?: string };
  transfer_fee?: { current_fee_rate?: { fee_rate?: number } | Record<string, unknown> };
  holders?: Array<{
    address?: string;
    percent?: string;
    tag?: string;
    is_locked?: number;
  }>;
  dex?: Array<{
    dex_name?: string;
    liquidity?: string;
  }>;
  metadata?: { mutable?: string };
  trusted_token?: number;
};

export async function fetchGoPlusSolana(
  address: string,
): Promise<{ data: GoPlusSolanaToken | null; error?: string }> {
  const url = `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(address)}`;
  const result = await fetchJson<Record<string, unknown>>(url);
  if (!result.ok) return { data: null, error: result.error };
  const payload = asRecord(result.data.result) ?? asRecord(result.data);
  if (!payload) return { data: null, error: "GoPlus returned no result" };
  const token =
    asRecord(payload[address]) ??
    (Object.values(payload)[0] as Record<string, unknown> | undefined);
  if (!token) return { data: null, error: "GoPlus has no record for this mint" };
  return { data: token as GoPlusSolanaToken };
}

export function percentFromGoPlus(value: unknown): number | null {
  const n = num(value);
  if (n === null) return null;
  return n <= 1 ? n * 100 : n;
}

export function collectPrivileges(token: GoPlusEvmToken | null) {
  if (!token) return [];
  const items: Array<{ id: string; label: string; on: boolean }> = [];
  const push = (id: string, label: string, raw: unknown) => {
    const value = flag(raw);
    if (value) items.push({ id, label, on: true });
  };
  push("mint", "mint", token.is_mintable);
  push("pause", "pause transfers", token.transfer_pausable);
  push("blacklist", "blacklist", token.is_blacklisted);
  push("whitelist", "whitelist", token.is_whitelisted);
  push("fee-change", "modifiable tax / slippage", token.slippage_modifiable);
  push("personal-fee", "personal slippage", token.personal_slippage_modifiable);
  push("take-back-ownership", "take back ownership", token.can_take_back_ownership);
  push("hidden-owner", "hidden owner", token.hidden_owner);
  push("owner-change-balance", "owner can change balances", token.owner_change_balance);
  push("anti-whale-mod", "modifiable anti-whale", token.anti_whale_modifiable);
  push("selfdestruct", "selfdestruct", token.selfdestruct);
  return items;
}
