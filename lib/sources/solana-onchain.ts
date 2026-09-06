import { SOLANA_RPC_FALLBACKS } from "@/lib/sources/rpc";

type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function solanaRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<RpcResult<T>> {
  const urls = [rpcUrl, ...SOLANA_RPC_FALLBACKS.filter((url) => url !== rpcUrl)];
  let lastError = "Solana RPC failed";
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "GuardianScan/2.0" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status} from Solana RPC`;
        if (/429|503|502|504/.test(String(response.status))) continue;
        return { ok: false, error: lastError };
      }
      const json = (await response.json()) as {
        result?: T;
        error?: { message?: string };
      };
      if (json.error) {
        lastError = json.error.message ?? "RPC error";
        if (/rate limit|429|503|capacity|timeout/i.test(lastError)) continue;
        return { ok: false, error: lastError };
      }
      return { ok: true, data: json.result as T };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Solana RPC failed";
    }
  }
  return { ok: false, error: lastError };
}

export async function getAccountOwner(
  rpcUrl: string,
  address: string,
): Promise<{ owner: string | null; error?: string }> {
  const result = await solanaRpc<{ value?: { owner?: string } | null }>(rpcUrl, "getAccountInfo", [
    address,
    { encoding: "base64" },
  ]);
  if (!result.ok) return { owner: null, error: result.error };
  return { owner: result.data?.value?.owner ?? null };
}

export async function getMultipleAccountOwners(
  rpcUrl: string,
  addresses: string[],
): Promise<{ owners: Map<string, string | null>; error?: string }> {
  const owners = new Map<string, string | null>();
  if (!addresses.length) return { owners };
  const unique = [...new Set(addresses.filter(Boolean))];
  const result = await solanaRpc<{ value?: Array<{ owner?: string } | null> }>(
    rpcUrl,
    "getMultipleAccounts",
    [unique, { encoding: "base64" }],
  );
  if (!result.ok) return { owners, error: result.error };
  const values = result.data?.value ?? [];
  unique.forEach((address, index) => {
    owners.set(address, values[index]?.owner ?? null);
  });
  return { owners };
}

type ParsedKey =
  | string
  | {
      pubkey?: string;
      signer?: boolean;
    };

/**
 * When RugCheck omits creator, resolve the mint's earliest on-chain fee payer.
 * Prefers an initializeMint* instruction for this mint when present in history.
 */
export async function resolveMintDeployer(
  rpcUrl: string,
  mint: string,
): Promise<{ deployer: string | null; error?: string }> {
  const sigResult = await solanaRpc<
    Array<{ signature: string; blockTime?: number | null; err?: unknown }>
  >(rpcUrl, "getSignaturesForAddress", [mint, { limit: 1000 }]);
  if (!sigResult.ok) return { deployer: null, error: sigResult.error };
  const signatures = sigResult.data ?? [];
  if (!signatures.length) return { deployer: null, error: "No signatures for mint" };

  // Walk oldest → newest looking for initializeMint for this mint.
  for (const row of [...signatures].reverse()) {
    if (row.err) continue;
    const txResult = await solanaRpc<{
      transaction?: { message?: { accountKeys?: ParsedKey[]; instructions?: unknown[] } };
      meta?: { innerInstructions?: Array<{ instructions?: unknown[] }> };
    }>(rpcUrl, "getTransaction", [
      row.signature,
      { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!txResult.ok || !txResult.data) continue;
    const message = txResult.data.transaction?.message;
    const keys = message?.accountKeys ?? [];
    const feePayer = keyPubkey(keys[0]);
    const instructions = [
      ...(message?.instructions ?? []),
      ...((txResult.data.meta?.innerInstructions ?? []).flatMap((group) => group.instructions ?? [])),
    ];
    for (const raw of instructions) {
      const ix = raw as { parsed?: { type?: string; info?: Record<string, unknown> } };
      const parsed = ix.parsed;
      if (!parsed || typeof parsed !== "object") continue;
      const type = parsed.type ?? "";
      if (!/initializeMint/i.test(type)) continue;
      const info = parsed.info ?? {};
      const mintInIx = typeof info.mint === "string" ? info.mint : null;
      if (mintInIx && mintInIx !== mint) continue;
      if (feePayer) return { deployer: feePayer };
    }
  }

  // Fallback: fee payer of the oldest successful signature involving the mint.
  const oldest = [...signatures].reverse().find((row) => !row.err) ?? signatures[signatures.length - 1];
  const txResult = await solanaRpc<{
    transaction?: { message?: { accountKeys?: ParsedKey[] } };
  }>(rpcUrl, "getTransaction", [
    oldest.signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
  if (!txResult.ok || !txResult.data) return { deployer: null, error: txResult.ok ? "Empty tx" : txResult.error };
  const feePayer = keyPubkey(txResult.data.transaction?.message?.accountKeys?.[0]);
  return { deployer: feePayer };
}

function keyPubkey(key: ParsedKey | undefined): string | null {
  if (!key) return null;
  if (typeof key === "string") return key;
  return key.pubkey ?? null;
}

/** Meteora DAMM v2 pool program — permanent-lock positions live under this owner. */
export const METEORA_DAMM_V2_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

/** Streamflow vesting (mainnet) — https://github.com/streamflow-finance/js-sdk */
export const STREAMFLOW_PROGRAM = "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m";
export const STREAMFLOW_ALIGNED_PROGRAM = "aSTRM2NKoKxNnkmLWk9sz3k74gKBk9t7bpPrTGxMszH";
/** Jupiter Lock */
export const JUPITER_LOCK_PROGRAM = "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn";
/** Goki smart wallet */
export const GOKI_SMART_WALLET_PROGRAM = "GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgBgs55bnpH";

export const SOLANA_BURN_ADDRESSES = new Set([
  "1nc1nerator11111111111111111111111111111111",
  "dead111111111111111111111111111111111111111",
  "Burn111111111111111111111111111111111111111",
  "11111111111111111111111111111111",
]);

/**
 * Program IDs whose PDAs / vaults are not free-float.
 * Labels must keep matching `isExcludedConcentrationTag` (escrow|locker|vault|…).
 */
export const PROTOCOL_OWNER_LABELS: Record<string, string> = {
  [METEORA_DAMM_V2_PROGRAM]: "Meteora pool vault",
  [STREAMFLOW_PROGRAM]: "Streamflow locker escrow",
  [STREAMFLOW_ALIGNED_PROGRAM]: "Streamflow aligned locker escrow",
  [JUPITER_LOCK_PROGRAM]: "Jupiter lock escrow",
  [GOKI_SMART_WALLET_PROGRAM]: "Goki locker escrow",
  // Legacy Streamflow id still seen in some indexes
  strmRqUCoQkeZbZyeFyBTvzmU9aNSv1VqdAdybM73Vv: "Streamflow locker escrow",
  // Raydium AMM / CLMM
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium pool vault",
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM vault",
  // Orca Whirlpool
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca whirlpool vault",
  // Pump.fun bonding curve
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun bonding curve",
};

export function labelForProtocolOwner(owner: string | null | undefined): string | null {
  if (!owner) return null;
  return PROTOCOL_OWNER_LABELS[owner] ?? null;
}

const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

/**
 * For SPL token accounts, resolve the token authority (wallet / escrow PDA).
 * AccountInfo.owner is the Token Program — useless for locker detection.
 */
export async function getMultipleTokenAccountAuthorities(
  rpcUrl: string,
  addresses: string[],
): Promise<{ authorities: Map<string, string | null>; error?: string }> {
  const authorities = new Map<string, string | null>();
  if (!addresses.length) return { authorities };
  const unique = [...new Set(addresses.filter(Boolean))];
  type ParsedAccount = {
    owner?: string;
    data?:
      | { parsed?: { info?: { owner?: string }; type?: string }; program?: string }
      | string;
  };
  const result = await solanaRpc<{ value?: Array<ParsedAccount | null> }>(
    rpcUrl,
    "getMultipleAccounts",
    [unique, { encoding: "jsonParsed" }],
  );
  if (!result.ok) return { authorities, error: result.error };
  const values = result.data?.value ?? [];
  unique.forEach((address, index) => {
    const row = values[index];
    if (!row) {
      authorities.set(address, null);
      return;
    }
    const programOwner = row.owner ?? "";
    if (!TOKEN_PROGRAMS.has(programOwner)) {
      // Not an SPL token account — authority N/A (may itself be a program PDA).
      authorities.set(address, null);
      return;
    }
    const data = row.data;
    const parsed =
      data && typeof data === "object" && "parsed" in data
        ? (data.parsed as { info?: { owner?: string } } | undefined)
        : undefined;
    authorities.set(address, parsed?.info?.owner ?? null);
  });
  return { authorities };
}
