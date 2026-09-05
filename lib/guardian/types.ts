export type Family = "solana" | "evm";

export type Grade = "A" | "B" | "C" | "D" | "F" | "U";

export type PatternSeverity = "info" | "watch" | "caution" | "critical";

export type CheckStatus = "pass" | "flag" | "unknown" | "unavailable";

export type DexKind = "uniswap-v2" | "uniswap-v3" | "other";

export type DexConfig = {
  id: string;
  name: string;
  kind: DexKind;
};

export type EvmChainConfig = {
  family: "evm";
  id: string;
  name: string;
  shortName: string;
  chainId: number;
  nativeCurrency: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerApiUrl: string;
  explorerApiKind: "etherscan-v2" | "blockscout";
  dexScreenerChain: string;
  goPlusChainId?: string;
  honeypotChainId?: number;
  dexes: DexConfig[];
  announcementTweet: string;
  rollout: "live" | "config";
};

export type SolanaChainConfig = {
  family: "solana";
  id: "solana";
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  dexScreenerChain: "solana";
  dexes: DexConfig[];
  announcementTweet: string;
  rollout: "live";
};

export type ChainConfig = EvmChainConfig | SolanaChainConfig;

export type DetectedFamily = {
  family: Family;
  address: string;
};

export type PresenceMatch = {
  chainId: string;
  chainName: string;
  family: Family;
  exists: boolean;
  isContract: boolean;
  error?: string;
};

export type Pattern = {
  id: string;
  severity: PatternSeverity;
  title: string;
  detail: string;
};

export type Check = {
  id: string;
  title: string;
  grade: Grade;
  status: CheckStatus;
  summary: string;
  detail: string;
  evidence?: Record<string, unknown>;
};

export type TokenIdentity = {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  imageUrl: string | null;
};

export type Copycat = {
  address: string;
  name: string | null;
  symbol: string;
  chainId: string;
  chainName: string;
  pairAddress: string | null;
  dex: string | null;
  liquidityUsd: number | null;
  createdAt: number | null;
  flags: Array<"oldest" | "deepest" | "same-chain">;
  url: string | null;
};

export type LiquidityPool = {
  dex: string;
  pairAddress: string;
  quote: string;
  liquidityUsd: number | null;
  createdAt: number | null;
  url: string | null;
  /** Share of this pool's LP that is locked or burned (0–100), when measured. */
  lockedPct?: number | null;
  permanentLock?: boolean;
};

export type Holder = {
  address: string;
  percent: number | null;
  tag: string | null;
  locked: boolean | null;
  /** liquidity | locked | burn | free (or null when unclassified) */
  kind?: "liquidity" | "locked" | "burn" | "other" | null;
  unlockEnd?: string | null;
  label?: string | null;
};

export type SourceStatus = {
  id: string;
  ok: boolean;
  error?: string;
};

export type GuardianReport = {
  schema: "guardian.report.v2";
  scannedAt: string;
  chain: {
    id: string;
    name: string;
    family: Family;
    explorerUrl: string;
  };
  token: TokenIdentity;
  grade: Grade;
  score: number;
  headline: string;
  disclaimer: string;
  patterns: Pattern[];
  checks: Check[];
  copycats: Copycat[];
  pools: LiquidityPool[];
  holders: Holder[];
  sources: SourceStatus[];
};

export type ScanRequest = {
  address: string;
  chain?: string;
};

export type ScanResponse =
  | {
      kind: "report";
      family: Family;
      address: string;
      presence: PresenceMatch[];
      reports: GuardianReport[];
    }
  | {
      kind: "presence";
      family: Family;
      address: string;
      presence: PresenceMatch[];
      message: string;
    }
  | {
      kind: "error";
      error: string;
      address?: string;
    };

export const CHECK_IDS = [
  "verified_source",
  "proxy_upgradeable",
  "owner_privileges",
  "transfer_tax",
  "honeypot_simulation",
  "lp_lock",
  "holder_concentration",
  "contract_age",
  "deployer_age",
  "copycats",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export const DISCLAIMER =
  "Guardian reports grades and on-chain patterns, not a verdict. A high grade is not an endorsement. A low grade is not a determination that the contract is fraudulent.";
