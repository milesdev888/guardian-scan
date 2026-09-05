import type { ChainConfig, EvmChainConfig, SolanaChainConfig } from "@/lib/guardian/types";

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export const SOLANA: SolanaChainConfig = {
  family: "solana",
  id: "solana",
  name: "Solana",
  shortName: "SOL",
  rpcUrl: env("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"),
  explorerUrl: "https://solscan.io",
  dexScreenerChain: "solana",
  dexes: [
    { id: "raydium", name: "Raydium", kind: "other" },
    { id: "orca", name: "Orca", kind: "other" },
    { id: "meteora", name: "Meteora", kind: "other" },
    { id: "pumpswap", name: "PumpSwap", kind: "other" },
  ],
  announcementTweet:
    "Guardian Scan is live on Solana. Paste a mint — grades and patterns, not a verdict.",
  rollout: "live",
};

const EVM_CHAINS: EvmChainConfig[] = [
  {
    family: "evm",
    id: "ethereum",
    name: "Ethereum",
    shortName: "ETH",
    chainId: 1,
    nativeCurrency: "ETH",
    rpcUrl: env("ETHEREUM_RPC_URL", "https://ethereum.publicnode.com"),
    explorerUrl: "https://etherscan.io",
    explorerApiUrl: env(
      "ETHEREUM_EXPLORER_API",
      "https://eth.blockscout.com/api",
    ),
    explorerApiKind: "blockscout",
    dexScreenerChain: "ethereum",
    goPlusChainId: "1",
    honeypotChainId: 1,
    dexes: [
      { id: "uniswap", name: "Uniswap V2", kind: "uniswap-v2" },
      { id: "uniswapv3", name: "Uniswap V3", kind: "uniswap-v3" },
      { id: "sushiswap", name: "SushiSwap", kind: "uniswap-v2" },
    ],
    announcementTweet:
      "Guardian v2 — Ethereum adapter is live. Same paste-first scan, now for 0x contracts: verified source, proxy, owner privileges, tax/honeypot sim, LP lock, holders, age, copycats.",
    rollout: "live",
  },
  {
    family: "evm",
    id: "base",
    name: "Base",
    shortName: "BASE",
    chainId: 8453,
    nativeCurrency: "ETH",
    rpcUrl: env("BASE_RPC_URL", "https://mainnet.base.org"),
    explorerUrl: "https://basescan.org",
    explorerApiUrl: env("BASE_EXPLORER_API", "https://base.blockscout.com/api"),
    explorerApiKind: "blockscout",
    dexScreenerChain: "base",
    goPlusChainId: "8453",
    honeypotChainId: 8453,
    dexes: [
      { id: "uniswap", name: "Uniswap V3", kind: "uniswap-v3" },
      { id: "uniswapv2", name: "Uniswap V2", kind: "uniswap-v2" },
      { id: "aerodrome", name: "Aerodrome", kind: "other" },
      { id: "baseswap", name: "BaseSwap", kind: "uniswap-v2" },
    ],
    announcementTweet:
      "Guardian now scans Base. Same EVM adapter, new chain config. Paste a Base contract — no dropdown first.",
    rollout: "config",
  },
  {
    family: "evm",
    id: "arbitrum",
    name: "Arbitrum",
    shortName: "ARB",
    chainId: 42161,
    nativeCurrency: "ETH",
    rpcUrl: env("ARBITRUM_RPC_URL", "https://arb1.arbitrum.io/rpc"),
    explorerUrl: "https://arbiscan.io",
    explorerApiUrl: env(
      "ARBITRUM_EXPLORER_API",
      "https://arbitrum.blockscout.com/api",
    ),
    explorerApiKind: "blockscout",
    dexScreenerChain: "arbitrum",
    goPlusChainId: "42161",
    dexes: [
      { id: "uniswap", name: "Uniswap V3", kind: "uniswap-v3" },
      { id: "camelot", name: "Camelot", kind: "other" },
      { id: "sushiswap", name: "SushiSwap", kind: "uniswap-v2" },
    ],
    announcementTweet:
      "Guardian on Arbitrum. Config rollout — no new adapter. Copycat ticker search and LP lock checks now cover Arb DEXes.",
    rollout: "config",
  },
  {
    family: "evm",
    id: "robinhood",
    name: "Robinhood Chain",
    shortName: "RHC",
    chainId: 4663,
    nativeCurrency: "ETH",
    rpcUrl: env(
      "ROBINHOOD_RPC_URL",
      "https://rpc.mainnet.chain.robinhood.com",
    ),
    explorerUrl: "https://robinhoodchain.blockscout.com",
    explorerApiUrl: env(
      "ROBINHOOD_EXPLORER_API",
      "https://robinhoodchain.blockscout.com/api",
    ),
    explorerApiKind: "blockscout",
    dexScreenerChain: "robinhood",
    dexes: [{ id: "uniswap", name: "Uniswap V3", kind: "uniswap-v3" }],
    announcementTweet:
      "Guardian on Robinhood Chain (4663). Chain six would still be a config file, not a rewrite.",
    rollout: "config",
  },
];

export const CHAINS: ChainConfig[] = [SOLANA, ...EVM_CHAINS];

export const EVM_CHAIN_LIST = EVM_CHAINS;

export function getChain(id: string): ChainConfig | undefined {
  return CHAINS.find((chain) => chain.id === id.toLowerCase());
}

export function getEvmChain(id: string): EvmChainConfig | undefined {
  return EVM_CHAINS.find((chain) => chain.id === id.toLowerCase());
}

export function listPublicChains() {
  return CHAINS.map((chain) => ({
    id: chain.id,
    name: chain.name,
    family: chain.family,
    rollout: chain.rollout,
    explorerUrl: chain.explorerUrl,
    dexes: chain.dexes.map((dex) => dex.name),
    chainId: chain.family === "evm" ? chain.chainId : undefined,
  }));
}
