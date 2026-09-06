import { EVM_CHAIN_LIST, getChain, SOLANA, XRPL } from "@/lib/chains/config";
import { detectFamily, splitXrplTokenId } from "@/lib/chains/detect";
import { EvmAdapter } from "@/lib/adapters/evm";
import { SolanaAdapter } from "@/lib/adapters/solana";
import { XRPLAdapter } from "@/lib/adapters/xrpl";
import type { ChainAdapter, ScanOptions } from "@/lib/adapters/types";
import type {
  Family,
  GuardianReport,
  PresenceMatch,
  ScanResponse,
} from "@/lib/guardian/types";

export const solanaAdapter = new SolanaAdapter();
export const evmAdapter = new EvmAdapter();
export const xrplAdapter = new XRPLAdapter();

export function adapterFor(family: Family): ChainAdapter {
  if (family === "solana") return solanaAdapter;
  if (family === "xrpl") return xrplAdapter;
  return evmAdapter;
}

const cache = new Map<string, { expires: number; report: GuardianReport }>();
const CACHE_MS = 45_000;

function cacheKey(chainId: string, address: string, currency?: string) {
  if (chainId === "xrpl") return `xrpl:${address}:${currency ?? ""}`;
  return `${chainId}:${address.toLowerCase()}`;
}

function cached(chainId: string, address: string, currency?: string) {
  const key = cacheKey(chainId, address, currency);
  const row = cache.get(key);
  if (!row) return null;
  if (row.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return row.report;
}

function remember(report: GuardianReport, address: string, currency?: string) {
  cache.set(cacheKey(report.chain.id, address, currency), {
    expires: Date.now() + CACHE_MS,
    report,
  });
}

export async function probeEvmPresence(address: string): Promise<PresenceMatch[]> {
  return Promise.all(EVM_CHAIN_LIST.map((chain) => evmAdapter.probe(address, chain)));
}

export async function scanOnChain(
  address: string,
  chainId: string,
  options?: ScanOptions,
): Promise<GuardianReport> {
  let addr = address;
  let currency = options?.currency;
  if (chainId === "xrpl") {
    const parsed = splitXrplTokenId(address);
    if (parsed) {
      addr = parsed.issuer;
      currency = currency ?? parsed.currency;
    }
  }
  const hit = cached(chainId, chainId === "xrpl" ? addr : address, currency);
  if (hit) return hit;
  const chain = getChain(chainId);
  if (!chain) throw new Error(`Unknown chain: ${chainId}`);
  const adapter = adapterFor(chain.family);
  const report = await adapter.scan(addr, chain, { currency });
  remember(report, chainId === "xrpl" ? addr : address, currency);
  return report;
}

export async function runScan(input: {
  address: string;
  chain?: string;
  currency?: string;
}): Promise<ScanResponse> {
  const detected = detectFamily(input.address);
  if (!detected.family) {
    return { kind: "error", error: detected.error, address: input.address };
  }

  const address = detected.address;
  const currency = input.currency ?? detected.currency;

  if (detected.family === "xrpl") {
    const presence = await xrplAdapter.probe(address, XRPL);
    if (!presence.exists) {
      return {
        kind: "error",
        address,
        error: presence.error
          ? `XRPL node could not confirm that account: ${presence.error}`
          : "No account at that XRPL classic address.",
      };
    }

    const { issuances, error: issuanceError } = await xrplAdapter.listIssuances(address);
    if (!currency) {
      if (issuances.length > 1) {
        return {
          kind: "xrpl-issuances",
          family: "xrpl",
          address,
          presence: [presence],
          issuances,
          message:
            issuanceError
              ? `Could not list every issuance (${issuanceError}). Showing what the node returned — pick a currency.`
              : "This account issues multiple currencies. Pick one to run the token report.",
        };
      }
      const only = issuances[0]?.display ?? issuances[0]?.currency;
      const report = await scanOnChain(address, "xrpl", { currency: only });
      return {
        kind: "report",
        family: "xrpl",
        address,
        presence: [presence],
        reports: [report],
      };
    }

    const report = await scanOnChain(address, "xrpl", { currency });
    return {
      kind: "report",
      family: "xrpl",
      address,
      presence: [presence],
      reports: [report],
    };
  }

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
