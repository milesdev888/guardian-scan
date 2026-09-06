import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { arbitrum, base, mainnet } from "viem/chains";
import type { EvmChainConfig } from "@/lib/guardian/types";

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;

const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
]);

export const SELECTORS = {
  mint: ["40c10f19", "a0712d68", "1249c58b"],
  pause: ["8456cb59", "5c975abb"],
  unpause: ["3f4ba83a"],
  blacklist: ["f9f92be4", "0ecb93c0", "39410404", "7a4301d7"],
  setFee: ["69fe0e2d", "b2bdfa7b", "8a8c523c", "c5d7649e", "ea2f0b37"],
  excludeFromFee: ["437823ec", "4fbee193"],
  renounceOwnership: ["715018a6"],
  transferOwnership: ["f2fde38b"],
} as const;

const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

function viemChain(config: EvmChainConfig): Chain {
  if (config.chainId === 1) return mainnet;
  if (config.chainId === 8453) return base;
  if (config.chainId === 42161) return arbitrum;
  if (config.chainId === 4663) return robinhoodChain;
  return defineChain({
    id: config.chainId,
    name: config.name,
    nativeCurrency: { name: config.nativeCurrency, symbol: config.nativeCurrency, decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    blockExplorers: { default: { name: config.name, url: config.explorerUrl } },
  });
}

const clients = new Map<string, PublicClient>();

export function evmClient(config: EvmChainConfig): PublicClient {
  const cached = clients.get(config.id);
  if (cached) return cached;
  const client = createPublicClient({
    chain: viemChain(config),
    transport: http(config.rpcUrl, { timeout: 12_000 }),
  });
  clients.set(config.id, client);
  return client;
}

export async function getBytecode(config: EvmChainConfig, address: string) {
  if (!isAddress(address)) {
    return { bytecode: null as Hex | null, error: "Invalid EVM address" };
  }
  try {
    const bytecode = await evmClient(config).getBytecode({
      address: address as Address,
    });
    return { bytecode: bytecode && bytecode !== "0x" ? bytecode : null, error: undefined };
  } catch (error) {
    return {
      bytecode: null as Hex | null,
      error: error instanceof Error ? error.message : "RPC getCode failed",
    };
  }
}

export async function readErc20Meta(config: EvmChainConfig, address: string) {
  const client = evmClient(config);
  const token = address as Address;
  const [name, symbol, decimals] = await Promise.all([
    client
      .readContract({ address: token, abi: ERC20_ABI, functionName: "name" })
      .then((value) => String(value))
      .catch(() => null),
    client
      .readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" })
      .then((value) => String(value))
      .catch(() => null),
    client
      .readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" })
      .then((value) => Number(value))
      .catch(() => null),
  ]);
  return { name, symbol, decimals };
}

export async function readOwner(config: EvmChainConfig, address: string) {
  try {
    const owner = await evmClient(config).readContract({
      address: address as Address,
      abi: ERC20_ABI,
      functionName: "owner",
    });
    return String(owner);
  } catch {
    return null;
  }
}

export async function readImplementationSlot(config: EvmChainConfig, address: string) {
  try {
    const word = await evmClient(config).getStorageAt({
      address: address as Address,
      slot: EIP1967_IMPLEMENTATION_SLOT,
    });
    if (!word || word === "0x" || /^0x0+$/.test(word)) return null;
    return `0x${word.slice(-40)}`;
  } catch {
    return null;
  }
}

export function hasSelector(bytecode: string, selector: string) {
  return bytecode.toLowerCase().includes(selector.toLowerCase());
}

export function detectSelectors(bytecode: string | null) {
  if (!bytecode) {
    return {
      mint: false,
      pause: false,
      blacklist: false,
      feeChange: false,
      renounce: false,
    };
  }
  const hay = bytecode.toLowerCase().replace(/^0x/, "");
  const any = (ids: readonly string[]) => ids.some((id) => hay.includes(id));
  return {
    mint: any(SELECTORS.mint),
    pause: any(SELECTORS.pause) || any(SELECTORS.unpause),
    blacklist: any(SELECTORS.blacklist),
    feeChange: any(SELECTORS.setFee) || any(SELECTORS.excludeFromFee),
    renounce: any(SELECTORS.renounceOwnership),
  };
}

export function looksLikeProxy(bytecode: string | null) {
  if (!bytecode) return false;
  const hay = bytecode.toLowerCase();
  return (
    hay.includes("363d3d373d3d3d363d73") ||
    hay.includes("3d3d3d3d363d3d37363d73") ||
    hay.includes("5c60da1b") ||
    hay.length < 200
  );
}

export function isBurnAddress(address: string | null | undefined) {
  if (!address) return false;
  const lower = address.toLowerCase();
  return (
    lower === "0x0000000000000000000000000000000000000000" ||
    lower === "0x000000000000000000000000000000000000dead" ||
    lower === "0x0000000000000000000000000000000000000001" ||
    /^0x0+$/.test(lower)
  );
}

/** Public Solana RPCs tried after SOLANA_RPC_URL when the primary is rate-limited. */
export const SOLANA_RPC_FALLBACKS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
] as const;

function isRetryableSolanaRpcError(message: string | undefined) {
  if (!message) return false;
  return /rate limit|too many requests|429|503|502|504|timeout|timed out|fetch failed|ECONNRESET|ECONNREFUSED|socket|network|cloudflare|capacity|exceeded|HTTP 429|HTTP 503/i.test(
    message,
  );
}

async function solanaAccountExistsOnce(rpcUrl: string, address: string) {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "GuardianScan/2.0" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [address, { encoding: "base64" }],
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      return { exists: false, error: `HTTP ${response.status} from Solana RPC` };
    }
    const json = (await response.json()) as {
      result?: { value?: unknown };
      error?: { message?: string };
    };
    if (json.error) return { exists: false, error: json.error.message ?? "RPC error" };
    return { exists: Boolean(json.result?.value), error: undefined };
  } catch (error) {
    return {
      exists: false,
      error: error instanceof Error ? error.message : "Solana RPC failed",
    };
  }
}

export async function solanaAccountExists(rpcUrl: string, address: string) {
  const urls = [rpcUrl, ...SOLANA_RPC_FALLBACKS.filter((url) => url !== rpcUrl)];
  let lastError: string | undefined;
  for (const url of urls) {
    const result = await solanaAccountExistsOnce(url, address);
    if (result.exists) return result;
    if (!result.error) return result; // confirmed missing
    lastError = result.error;
    if (!isRetryableSolanaRpcError(result.error)) return result;
  }
  return { exists: false, error: lastError ?? "Solana RPC failed" };
}
