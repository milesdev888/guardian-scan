import { EVM_CHAIN_LIST, getChain, SOLANA } from "@/lib/chains/config";
import { detectFamily } from "@/lib/chains/detect";
import { EvmAdapter } from "@/lib/adapters/evm";
import { SolanaAdapter } from "@/lib/adapters/solana";
import type { ChainAdapter } from "@/lib/adapters/types";
import type {
  GuardianReport,
  PresenceMatch,
  ScanResponse,
} from "@/lib/guardian/types";

export const solanaAdapter = new SolanaAdapter();
export const evmAdapter = new EvmAdapter();

export function adapterFor(family: "solana" | "evm"): ChainAdapter {
  return family === "solana" ? solanaAdapter : evmAdapter;
}

const cache = new Map<string, { expires: number; report: GuardianReport }>();
const CACHE_MS = 45_000;

function cached(chainId: string, address: string) {
  const row = cache.get(`${chainId}:${address.toLowerCase()}`);
  if (!row) return null;
  if (row.expires < Date.now()) {
    cache.delete(`${chainId}:${address.toLowerCase()}`);
    return null;
  }
  return row.report;
}

function remember(report: GuardianReport) {
  cache.set(`${report.chain.id}:${report.token.address.toLowerCase()}`, {
    expires: Date.now() + CACHE_MS,
    report,
  });
}

export async function probeEvmPresence(address: string): Promise<PresenceMatch[]> {
  return Promise.all(EVM_CHAIN_LIST.map((chain) => evmAdapter.probe(address, chain)));
}

export async function scanOnChain(address: string, chainId: string): Promise<GuardianReport> {
  const hit = cached(chainId, address);
  if (hit) return hit;
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain: ${chainId}`);
  const adapter = adapterFor(chain.family);
  const report = await adapter.scan(address, chain);
  remember(report);
  return report;
}

export async function runScan(input: {
  address: string;
  chain?: string;
}): Promise<ScanResponse> {
  const detected = detectFamily(input.address);
  if (!detected.family) {
    return { kind: "error", error: detected.error, address: input.address };
  }

  const address = detected.address;

  if (detected.family === "solana") {
    const presence = await solanaAdapter.probe(address, SOLANA);
    const rpcBlocked =
      !presence.exists &&
      Boolean(presence.error) &&
      /rate limit|too many requests|429|503|502|504|timeout|timed out|fetch failed|HTTP 429|HTTP 503|capacity|exceeded/i.test(
        presence.error ?? "",
      );
    if (!presence.exists && !rpcBlocked) {
      return {
        kind: "error",
        address,
        error: presence.error
          ? `Solana RPC could not confirm that mint: ${presence.error}`
          : "No account at that Solana address.",
      };
    }
    try {
      const report = await scanOnChain(address, "solana");
      return {
        kind: "report",
        family: "solana",
        address,
        presence: [
          presence.exists
            ? presence
            : {
                ...presence,
                exists: true,
                isContract: true,
                error: presence.error
                  ? `RPC probe degraded (${presence.error}); report built from other sources`
                  : undefined,
              },
        ],
        reports: [report],
      };
    } catch (error) {
      if (!presence.exists) {
        return {
          kind: "error",
          address,
          error: presence.error
            ? `Solana RPC could not confirm that mint: ${presence.error}`
            : error instanceof Error
              ? error.message
              : "Solana scan failed.",
        };
      }
      throw error;
    }
  }

  if (input.chain) {
    const chain = getChain(input.chain);
    if (!chain || chain.family !== "evm") {
      return { kind: "error", address, error: `Unknown EVM chain '${input.chain}'.` };
    }
    const presence = await evmAdapter.probe(address, chain);
    if (!presence.exists) {
      return {
        kind: "error",
        address,
        error: presence.error
          ? `No contract on ${chain.name}: ${presence.error}`
          : `No contract bytecode on ${chain.name}.`,
      };
    }
    const report = await scanOnChain(address, chain.id);
    const others = await probeEvmPresence(address);
    return {
      kind: "report",
      family: "evm",
      address,
      presence: others,
      reports: [report],
    };
  }

  const presence = await probeEvmPresence(address);
  const hits = presence.filter((row) => row.exists);
  if (!hits.length) {
    const rpcErrors = presence.filter((row) => row.error);
    return {
      kind: "error",
      address,
      error: rpcErrors.length
        ? `No bytecode on configured EVM chains. RPC issues: ${rpcErrors
            .map((row) => `${row.chainName} (${row.error})`)
            .join("; ")}`
        : "That 0x address has no contract bytecode on Ethereum, Base, Arbitrum, or Robinhood Chain.",
    };
  }

  if (hits.length === 1) {
    const report = await scanOnChain(address, hits[0].chainId);
    return {
      kind: "report",
      family: "evm",
      address,
      presence,
      reports: [report],
    };
  }

  const preferred = ["ethereum", "base", "arbitrum", "robinhood"];
  const first = [...hits].sort(
    (a, b) => preferred.indexOf(a.chainId) - preferred.indexOf(b.chainId),
  )[0];
  const report = await scanOnChain(address, first.chainId);
  return {
    kind: "report",
    family: "evm",
    address,
    presence,
    reports: [report],
  };
}
