import { DISCLAIMER, type Check, type EvmChainConfig, type GuardianReport, type Holder, type LiquidityPool, type Pattern, type PresenceMatch, type SourceStatus } from "@/lib/guardian/types";
import { findCopycats } from "@/lib/guardian/copycats";
import {
  applyAaIfEligible,
  analyzePoolsForAa,
  check,
  compileReportMeta,
  daysAgo,
  formatAge,
  formatPct,
  formatUsd,
  isDistributedLiquidity,
  pattern,
} from "@/lib/guardian/grade";
import { isEvmAddress } from "@/lib/chains/detect";
import { fetchDexToken, filterPairsForChain, identityFromPairs, pickCanonicalPair } from "@/lib/sources/dexscreener";
import { fetchExplorerCreation, fetchExplorerSource, fetchFirstTransactionTime } from "@/lib/sources/explorer";
import { collectPrivileges, fetchGoPlusEvm, percentFromGoPlus } from "@/lib/sources/goplus";
import { fetchHoneypot } from "@/lib/sources/honeypot";
import { resolveTokenTwitter } from "@/lib/guardian/resolve-twitter";
import {
  detectSelectors,
  getBytecode,
  isBurnAddress,
  looksLikeProxy,
  readErc20Meta,
  readImplementationSlot,
  readOwner,
} from "@/lib/sources/rpc";
import type { ChainAdapter } from "@/lib/adapters/types";
import type { ChainConfig } from "@/lib/guardian/types";

function asEvm(chain: ChainConfig): EvmChainConfig {
  if (chain.family !== "evm") {
    throw new Error("EvmAdapter received a non-EVM chain config");
  }
  return chain;
}

export class EvmAdapter implements ChainAdapter {
  family = "evm" as const;

  supports(address: string) {
    return isEvmAddress(address);
  }

  async probe(address: string, chain: ChainConfig): Promise<PresenceMatch> {
    const evm = asEvm(chain);
    const { bytecode, error } = await getBytecode(evm, address);
    return {
      chainId: evm.id,
      chainName: evm.name,
      family: "evm",
      exists: Boolean(bytecode),
      isContract: Boolean(bytecode),
      error,
    };
  }

  async findCopycats(ticker: string, chain: ChainConfig, excludeAddress: string) {
    const evm = asEvm(chain);
    const { copycats } = await findCopycats({
      ticker,
      chainId: evm.id,
      chainName: evm.name,
      dexScreenerChain: evm.dexScreenerChain,
      excludeAddress,
    });
    return copycats;
  }

  async scan(address: string, chain: ChainConfig): Promise<GuardianReport> {
    const evm = asEvm(chain);
    const lower = address.toLowerCase();
    const sources: SourceStatus[] = [];
    const note = (id: string, ok: boolean, error?: string) => {
      sources.push({ id, ok, error });
    };

    const [codeResult, dexResult, goplusResult, honeypotResult, sourceResult, creationResult] =
      await Promise.all([
        getBytecode(evm, lower),
        fetchDexToken(lower),
        fetchGoPlusEvm(evm, lower),
        fetchHoneypot(evm, lower),
        fetchExplorerSource(evm, lower),
        fetchExplorerCreation(evm, lower),
      ]);

    note("rpc", Boolean(codeResult.bytecode), codeResult.error);
    note("dexscreener", !dexResult.error, dexResult.error);
    note("goplus", Boolean(goplusResult.data), goplusResult.error);
    note("honeypot.is", Boolean(honeypotResult.data), honeypotResult.error);
    note("explorer-source", Boolean(sourceResult.data), sourceResult.error);
    note("explorer-creation", Boolean(creationResult.data), creationResult.error);

    const chainPairs = filterPairsForChain(dexResult.pairs, evm.dexScreenerChain);
    const pairs = chainPairs.length ? chainPairs : dexResult.pairs;
    const identity = identityFromPairs(pairs, lower);
    const twitterPromise = resolveTokenTwitter({
      chainId: evm.id,
      address: lower,
      pairs,
    });
    const onchainMeta = await readErc20Meta(evm, lower).catch(() => ({
      name: null,
      symbol: null,
      decimals: null,
    }));
    const goplus = goplusResult.data;
    const honeypot = honeypotResult.data;
    const bytecode = codeResult.bytecode;
    const selectors = detectSelectors(bytecode);
    const implementation = await readImplementationSlot(evm, lower);
    const owner = goplus?.owner_address ?? (await readOwner(evm, lower));

    const name =
      onchainMeta.name ?? goplus?.token_name ?? identity.name ?? sourceResult.data?.contractName ?? null;
    const symbol = onchainMeta.symbol ?? goplus?.token_symbol ?? identity.symbol ?? null;

    const deployer = creationResult.data?.creator ?? goplus?.creator_address ?? null;
    let deployerFirstTx: number | null = null;
    if (deployer) {
      const first = await fetchFirstTransactionTime(evm, deployer);
      deployerFirstTx = first.timestamp;
      note("deployer-history", Boolean(first.timestamp), first.error);
    }

    const pools: LiquidityPool[] = pairs.slice(0, 6).map((pair) => ({
      dex: pair.dexId,
      pairAddress: pair.pairAddress,
      quote: pair.quoteToken.symbol ?? pair.quoteToken.address,
      liquidityUsd: pair.liquidityUsd,
      createdAt: pair.pairCreatedAt,
      url: pair.url,
    }));

    const holders: Holder[] = (goplus?.holders ?? []).slice(0, 10).map((row) => ({
      address: row.address ?? "",
      percent: percentFromGoPlus(row.percent),
      tag: row.tag ?? null,
      locked: row.is_locked === 1 || row.is_locked === "1",
    }));

    const top10 = holders.reduce((sum, row) => sum + (row.percent ?? 0), 0);
    const privileges = collectPrivileges(goplus);
    if (!goplus) {
      if (selectors.mint) privileges.push({ id: "mint", label: "mint", on: true });
      if (selectors.pause) privileges.push({ id: "pause", label: "pause transfers", on: true });
      if (selectors.blacklist) privileges.push({ id: "blacklist", label: "blacklist", on: true });
      if (selectors.feeChange) privileges.push({ id: "fee-change", label: "fee-change", on: true });
    }

    const copycats = symbol
      ? (await findCopycats({
          ticker: symbol,
          chainId: evm.id,
          chainName: evm.name,
          dexScreenerChain: evm.dexScreenerChain,
          excludeAddress: lower,
        })).copycats
      : [];

    const checks: Check[] = [];
    const extraPatterns: Pattern[] = [];

    // NOTE: truncated mid-file intentionally - will use push_files with full content instead
    return null as unknown as GuardianReport;
  }
}
