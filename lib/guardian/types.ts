export type Family = "solana" | "evm" | "xrpl";

export type Grade = "A" | "B" | "C" | "D" | "F";

export type Severity = "info" | "warn" | "fail";

export type CheckId =
  | "lp_lock"
  | "mint_authority"
  | "freeze_authority"
  | "holder_concentration"
  | "honeypot"
  | "owner_privileges"
  | "verified_source"
  | "transfer_tax";

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export interface CheckResult {
  id: CheckId;
  title: string;
  status: CheckStatus;
  severity: Severity;
  score: number;
  summary: string;
  detail?: string;
}

export type LpTier = "PERMANENT" | "BURNED" | "TIMED" | "UNLOCKED" | "UNVERIFIED";

export interface LpLockInfo {
  tier: LpTier;
  label: string;
  lockedPct: number | null;
  burnedPct: number | null;
  unlockAt: string | null;
  remainingHours: number | null;
  locker: string | null;
  lockerKind: "protocol" | "escrow" | "burn" | "unknown" | null;
  lockerUrl: string | null;
  facts: string[];
}

export interface TokenIdentity {
  address: string;
  chainId: string;
  family: Family;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  image: string | null;
  /** XRPL issued-currency code (3-letter or 40-hex). */
  currency?: string | null;
}

export interface GuardianReport {
  token: TokenIdentity;
  scannedAt: string;
  overall: number;
  grade: Grade;
  checks: CheckResult[];
  notes: string[];
  /** Present when the adapter reports LP / pool facts (XRPL AMM, future Solana/EVM). */
  lp?: LpLockInfo | null;
}

export interface SolanaChainConfig {
  id: string;
  family: "solana";
  label: string;
  rpc: string;
  explorer: string;
  nativeSymbol: string;
}

export interface EvmChainConfig {
  id: string;
  family: "evm";
  label: string;
  rpc: string;
  explorer: string;
  nativeSymbol: string;
  chainId: number;
  wrappedNative: string;
}

export interface XrplChainConfig {
  id: string;
  family: "xrpl";
  label: string;
  rpc: string;
  explorer: string;
  nativeSymbol: string;
}

export type ChainConfig = SolanaChainConfig | EvmChainConfig | XrplChainConfig;

export interface ScanRequest {
  address: string;
  chain?: string;
}

export type ScanResponse =
  | { ok: true; report: GuardianReport }
  | { ok: false; error: string; code?: string }
  | {
      ok: false;
      kind: "xrpl-issuances";
      error: string;
      code: "XRPL_ISSUANCES";
      issuer: string;
      issuances: { currency: string; display: string }[];
    };
