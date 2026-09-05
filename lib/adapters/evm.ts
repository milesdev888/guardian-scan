import { DISCLAIMER, type Check, type EvmChainConfig, type GuardianReport, type Holder, type LiquidityPool, type Pattern, type PresenceMatch, type SourceStatus } from "@/lib/guardian/types";
import { findCopycats } from "@/lib/guardian/copycats";
import { check, compileReportMeta, daysAgo, formatAge, formatPct, formatUsd, pattern } from "@/lib/guardian/grade";
import { isEvmAddress } from "@/lib/chains/detect";
import { fetchDexToken, filterPairsForChain, identityFromPairs, pickCanonicalPair } from "@/lib/sources/dexscreener";
import { fetchExplorerCreation, fetchExplorerSource, fetchFirstTransactionTime } from "@/lib/sources/explorer";
import { collectPrivileges, fetchGoPlusEvm, percentFromGoPlus } from "@/lib/sources/goplus";
import { fetchHoneypot } from "@/lib/sources/honeypot";
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

    const verified =
      sourceResult.data?.verified ?? honeypot?.openSource ?? (goplus ? goplus.is_open_source === "1" : null);
    checks.push(
      verified === true
        ? check({
            id: "verified_source",
            title: "Verified source",
            status: "pass",
            grade: "A",
            summary: "Explorer lists verified source for this contract.",
            detail: `${evm.name} explorer reports open source. Unverified bytecode is a common pattern on copycat launches.`,
            evidence: { explorer: evm.explorerUrl },
          })
        : verified === false
          ? check({
              id: "verified_source",
              title: "Verified source",
              status: "flag",
              grade: "D",
              summary: "Source is not verified on the explorer.",
              detail:
                "Without verified source, mint, pause, blacklist, and tax functions cannot be audited from the explorer page.",
            })
          : check({
              id: "verified_source",
              title: "Verified source",
              status: "unknown",
              grade: "U",
              summary: "Explorer did not return a verification status.",
              detail: sourceResult.error ?? "Verification lookup unavailable.",
            }),
    );

    const proxy =
      Boolean(implementation && !isBurnAddress(implementation)) ||
      sourceResult.data?.proxy === true ||
      honeypot?.isProxy === true ||
      goplus?.is_proxy === "1" ||
      looksLikeProxy(bytecode);
    checks.push(
      proxy
        ? check({
            id: "proxy_upgradeable",
            title: "Proxy / upgradeable",
            status: "flag",
            grade: "C",
            summary: "Upgradeable or proxy pattern detected.",
            detail: implementation
              ? `EIP-1967 implementation slot points to ${implementation}. Logic can change without a new address.`
              : "Bytecode or explorer metadata matches a proxy / upgradeable pattern. The listed address may not be the logic contract.",
            evidence: { implementation },
          })
        : check({
            id: "proxy_upgradeable",
            title: "Proxy / upgradeable",
            status: "pass",
            grade: "A",
            summary: "No proxy slot or upgradeable pattern found.",
            detail: "Direct bytecode at this address. This does not prove the contract cannot be replaced by a different factory pattern.",
          }),
    );

    const ownerLive = owner && !isBurnAddress(owner);
    const privilegeLabels = privileges.map((item) => item.label);
    if (privilegeLabels.length) {
      extraPatterns.push(
        pattern(
          "owner-privileges",
          privilegeLabels.includes("mint") || privilegeLabels.includes("owner can change balances")
            ? "critical"
            : "caution",
          "Owner privileges still live",
          `Detected: ${privilegeLabels.join(", ")}.`,
        ),
      );
    }
    checks.push(
      privilegeLabels.length
        ? check({
            id: "owner_privileges",
            title: "Owner privileges",
            status: "flag",
            grade: privilegeLabels.some((label) =>
              ["mint", "owner can change balances", "hidden owner", "selfdestruct"].includes(label),
            )
              ? "F"
              : "D",
            summary: `Owner-linked functions: ${privilegeLabels.join(", ")}.`,
            detail: ownerLive
              ? `Owner ${owner} is not a burn address. Privileges include mint, pause, blacklist, and fee-change when those selectors or GoPlus flags are present.`
              : "Privileged functions are present in the ABI/bytecode even if ownership looks burned.",
            evidence: { owner, privileges: privilegeLabels },
          })
        : ownerLive
          ? check({
              id: "owner_privileges",
              title: "Owner privileges",
              status: "flag",
              grade: "C",
              summary: `Owner is set (${owner}) without a detected mint/pause/blacklist/fee selector.`,
              detail: "An owned contract can still gain privileges through a proxy upgrade. Ownership itself is a pattern, not a verdict.",
              evidence: { owner },
            })
          : check({
              id: "owner_privileges",
              title: "Owner privileges",
              status: "pass",
              grade: "A",
              summary: "No mint, pause, blacklist, or fee-change privilege detected.",
              detail: owner ? `Owner field is ${owner}.` : "No owner() and no privilege selectors found.",
            }),
    );

    const buyTax = honeypot?.buyTax ?? (goplus?.buy_tax ? Number(goplus.buy_tax) * (Number(goplus.buy_tax) <= 1 ? 100 : 1) : null);
    const sellTax = honeypot?.sellTax ?? (goplus?.sell_tax ? Number(goplus.sell_tax) * (Number(goplus.sell_tax) <= 1 ? 100 : 1) : null);
    const tax = Math.max(buyTax ?? 0, sellTax ?? 0);
    const taxKnown = buyTax !== null || sellTax !== null;
    checks.push(
      !taxKnown
        ? check({
            id: "transfer_tax",
            title: "Transfer tax",
            status: "unknown",
            grade: "U",
            summary: "Buy/sell tax could not be measured.",
            detail: "No honeypot simulation or GoPlus tax fields for this chain yet.",
          })
        : tax >= 50
          ? check({
              id: "transfer_tax",
              title: "Transfer tax",
              status: "flag",
              grade: "F",
              summary: `Tax is ${formatPct(buyTax)} buy / ${formatPct(sellTax)} sell.`,
              detail: "Taxes at this level behave like a trap even when a sell technically succeeds.",
              evidence: { buyTax, sellTax },
            })
          : tax >= 10
            ? check({
                id: "transfer_tax",
                title: "Transfer tax",
                status: "flag",
                grade: "D",
                summary: `Tax is ${formatPct(buyTax)} buy / ${formatPct(sellTax)} sell.`,
                detail: "Double-digit transfer tax is a common farm pattern. Confirm the fee wallet and whether it is changeable.",
                evidence: { buyTax, sellTax },
              })
            : check({
                id: "transfer_tax",
                title: "Transfer tax",
                status: "pass",
                grade: tax > 0 ? "B" : "A",
                summary:
                  tax > 0
                    ? `Low tax: ${formatPct(buyTax)} buy / ${formatPct(sellTax)} sell.`
                    : "Simulation shows 0% buy and sell tax.",
                detail: "Tax can still be changed if a fee-change function exists.",
                evidence: { buyTax, sellTax },
              }),
    );

    const isHoneypot = honeypot?.isHoneypot ?? (goplus?.is_honeypot === "1");
    const cannotSell = goplus?.cannot_sell_all === "1" || goplus?.cannot_buy === "1";
    checks.push(
      isHoneypot || cannotSell
        ? check({
            id: "honeypot_simulation",
            title: "Honeypot simulation",
            status: "flag",
            grade: "F",
            summary: "Buy→sell simulation failed or is flagged as a honeypot.",
            detail:
              honeypot?.honeypotReason ??
              "The simulated buy could not be unwound with a sell. This is a pattern, not a legal finding.",
            evidence: { buyTax, sellTax, source: honeypot ? "honeypot.is" : "goplus" },
          })
        : honeypot || goplus?.is_honeypot === "0"
          ? check({
              id: "honeypot_simulation",
              title: "Honeypot simulation",
              status: "pass",
              grade: "A",
              summary: "Simulated buy then sell did not revert.",
              detail: honeypot
                ? `Honeypot.is simulated a buy→sell on ${evm.name}. Gas buy ${honeypot.buyGas ?? "n/a"}, sell ${honeypot.sellGas ?? "n/a"}.`
                : "GoPlus does not flag this token as a honeypot. That is not a guarantee of sellability under every wallet.",
            })
          : check({
              id: "honeypot_simulation",
              title: "Honeypot simulation",
              status: "unavailable",
              grade: "U",
              summary: `No buy→sell simulator for ${evm.name} yet.`,
              detail: "Honeypot.is currently covers Ethereum and Base. Arbitrum and Robinhood Chain fall back to GoPlus flags and selector scans.",
            }),
    );

    const createdAt =
      creationResult.data?.timestamp ??
      pickCanonicalPair(pairs, lower)?.pairCreatedAt ??
      honeypot?.pairCreatedAt ??
      null;
    const ageDays = daysAgo(createdAt);

    const lpHolders = goplus?.lp_holders ?? [];
    const lockedPct = lpHolders.reduce((sum, row) => {
      const pct = percentFromGoPlus(row.percent) ?? 0;
      const locked = row.is_locked === 1 || row.is_locked === "1" || isBurnAddress(row.address);
      return locked ? sum + pct : sum;
    }, 0);
    const burnedPct = lpHolders.reduce((sum, row) => {
      const pct = percentFromGoPlus(row.percent) ?? 0;
      return isBurnAddress(row.address) || (row.tag ?? "").toLowerCase().includes("burn")
        ? sum + pct
        : sum;
    }, 0);
    const securedPct = Math.max(lockedPct, burnedPct);
    const mainDexHit = pairs.some((pair) =>
      evm.dexes.some((dex) => pair.dexId.toLowerCase().includes(dex.id.toLowerCase()) || dex.id.includes(pair.dexId)),
    );
    const totalLiq = pairs.reduce((sum, pair) => sum + (pair.liquidityUsd ?? 0), 0);
    const established = (ageDays !== null && ageDays >= 90) || goplus?.trust_list === "1";
    const hasLpSignal = pairs.length > 0 || lpHolders.length > 0;
    checks.push(
      !hasLpSignal
        ? check({
            id: "lp_lock",
            title: "LP lock / burn",
            status: "unknown",
            grade: "U",
            summary: `No pool found on ${evm.name} main DEXes.`,
            detail: `Configured DEXes: ${evm.dexes.map((dex) => dex.name).join(", ")}.`,
            evidence: { tone: "gray" },
          })
        : lpHolders.length === 0
          ? check({
              id: "lp_lock",
              title: "LP lock / burn",
              status: "unknown",
              grade: "U",
              summary: `Pools found; lock percent undetectable.`,
              detail: `Liquidity ${formatUsd(totalLiq)}. Undetectable lock data is grade U — not F.`,
              evidence: { totalLiq, mainDexHit, tone: "gray" },
            })
          : securedPct >= 90
            ? check({
                id: "lp_lock",
                title: "LP lock / burn",
                status: "pass",
                grade: "A",
                summary: `🔒 ${formatPct(securedPct)} locked/burned.`,
                detail: `Liquidity on listed pools is ${formatUsd(totalLiq)}. Lock data comes from GoPlus-recognized lockers and burn addresses.`,
                evidence: { lockedPct, burnedPct, securedPct, totalLiq, mainDexHit, tone: "green" },
              })
            : securedPct >= 50
              ? check({
                  id: "lp_lock",
                  title: "LP lock / burn",
                  status: "pass",
                  grade: "B",
                  summary: `🔐 ${formatPct(securedPct)} locked/burned.`,
                  detail: `Liquidity on listed pools is ${formatUsd(totalLiq)}.`,
                  evidence: { lockedPct, burnedPct, securedPct, totalLiq, tone: "gold" },
                })
              : securedPct >= 1
                ? check({
                    id: "lp_lock",
                    title: "LP lock / burn",
                    status: "flag",
                    grade: "C",
                    summary: `🔓 ${formatPct(securedPct)} of tracked LP is locked; ${formatPct(burnedPct)} burned.`,
                    detail: established
                      ? `Partial LP lock on a ${formatAge(createdAt)} contract. Pools: ${pools.map((p) => p.dex).join(", ") || "none listed"}.`
                      : `Low lock coverage on ${evm.dexes.map((d) => d.name).join(", ")}. Pools: ${pools.map((p) => p.dex).join(", ") || "none listed"}.`,
                    evidence: { lockedPct, burnedPct, securedPct, totalLiq, established, tone: "red" },
                  })
                : check({
                    id: "lp_lock",
                    title: "LP lock / burn",
                    status: "flag",
                    grade: "D",
                    summary: `🔓 0% of tracked LP is locked.`,
                    detail: established
                      ? `Unlocked AMM LP on a ${formatAge(createdAt)} contract is a pattern, not the same rug vector as a day-old launch.`
                      : `Unlocked LP on ${evm.dexes.map((d) => d.name).join(", ")} is the classic rug vector for new DEX launches.`,
                    evidence: { lockedPct, burnedPct, securedPct: 0, totalLiq, established, tone: "red" },
                  }),
    );

    checks.push(
      holders.length === 0
        ? check({
            id: "holder_concentration",
            title: "Holder concentration",
            status: "unknown",
            grade: "U",
            summary: "Top-10 holders were not returned.",
            detail: "GoPlus holder tables are unavailable for this chain or token.",
          })
        : top10 >= 70
          ? check({
              id: "holder_concentration",
              title: "Holder concentration",
              status: "flag",
              grade: top10 >= 90 ? "F" : "D",
              summary: `Top 10 wallets hold ${formatPct(top10)} of supply.`,
              detail: "Concentration this high means a handful of wallets can move the market. Contracts, locks, and exchanges in the top 10 can change the reading.",
              evidence: { top10, holders },
            })
          : check({
              id: "holder_concentration",
              title: "Holder concentration",
              status: "pass",
              grade: top10 >= 50 ? "B" : "A",
              summary: `Top 10 wallets hold ${formatPct(top10)} of supply.`,
              detail: `${holders.length} holders listed. This excludes some LP and burn tags when GoPlus marks them.`,
            }),
    );

    checks.push(
      ageDays === null
        ? check({
            id: "contract_age",
            title: "Contract age",
            status: "unknown",
            grade: "U",
            summary: "Creation time was not available.",
            detail: "Explorer creation API and DexScreener pairCreatedAt both missed.",
          })
        : ageDays < 2
          ? check({
              id: "contract_age",
              title: "Contract age",
              status: "flag",
              grade: "D",
              summary: `Contract is ${formatAge(createdAt)} old.`,
              detail: "Brand-new contracts are where most copycat launches cluster. Age is a pattern, not proof of intent.",
              evidence: { createdAt },
            })
          : check({
              id: "contract_age",
              title: "Contract age",
              status: "pass",
              grade: ageDays < 30 ? "B" : "A",
              summary: `Contract is ${formatAge(createdAt)} old.`,
              detail: deployer ? `Deployer ${deployer}.` : "Deployer not listed.",
              evidence: { createdAt, deployer },
            }),
    );

    const deployerAge = daysAgo(deployerFirstTx);
    checks.push(
      !deployer
        ? check({
            id: "deployer_age",
            title: "Deployer wallet age",
            status: "unknown",
            grade: "U",
            summary: "Deployer address was not found.",
            detail: "Creation transaction is required to age the deployer wallet.",
          })
        : deployerAge === null
          ? check({
              id: "deployer_age",
              title: "Deployer wallet age",
              status: "unknown",
              grade: "U",
              summary: `Deployer ${deployer} has no readable first transaction.`,
              detail: "Explorer txlist did not return the wallet's earliest tx.",
            })
          : deployerAge < 7
            ? check({
                id: "deployer_age",
                title: "Deployer wallet age",
                status: "flag",
                grade: "D",
                summary: `Deployer wallet is ${formatAge(deployerFirstTx)} old.`,
                detail: "Fresh deployer wallets are a recurring pattern next to same-ticker copies.",
                evidence: { deployer, deployerFirstTx },
              })
            : check({
                id: "deployer_age",
                title: "Deployer wallet age",
                status: "pass",
                grade: deployerAge < 60 ? "B" : "A",
                summary: `Deployer wallet is ${formatAge(deployerFirstTx)} old.`,
                detail: `First seen ${new Date(deployerFirstTx ?? 0).toISOString().slice(0, 10)}.`,
              }),
    );

    const oldestCopy = copycats.find((row) => row.flags.includes("oldest"));
    const deepestCopy = copycats.find((row) => row.flags.includes("deepest"));
    checks.push(
      !symbol
        ? check({
            id: "copycats",
            title: "Same-ticker copies",
            status: "unknown",
            grade: "U",
            summary: "No ticker to search.",
            detail: "Token symbol was not resolved.",
          })
        : copycats.length === 0
          ? check({
              id: "copycats",
              title: "Same-ticker copies",
              status: "pass",
              grade: "A",
              summary: `No other ${symbol} pools on ${evm.name} in the DexScreener search window.`,
              detail: "Search coverage is the current DexScreener result set, not every contract ever deployed.",
            })
          : check({
              id: "copycats",
              title: "Same-ticker copies",
              status: "flag",
              grade: "C",
              summary: `${copycats.length} other ${symbol} token(s) on ${evm.name}. Oldest and deepest are flagged.`,
              detail: [
                oldestCopy
                  ? `Oldest: ${oldestCopy.address} (${formatAge(oldestCopy.createdAt)}, ${oldestCopy.dex}).`
                  : null,
                deepestCopy
                  ? `Deepest: ${deepestCopy.address} (${formatUsd(deepestCopy.liquidityUsd)} liquidity).`
                  : null,
              ]
                .filter(Boolean)
                .join(" "),
              evidence: { copycats: copycats.slice(0, 4) },
            }),
    );

    if (copycats.length) {
      extraPatterns.push(
        pattern(
          "copycats",
          "watch",
          `Same ticker (${symbol}) on ${evm.name}`,
          "Oldest and deepest same-ticker pools are listed. The scanned contract is not assumed original.",
        ),
      );
    }

    const { grade, score, headline, patterns } = compileReportMeta(checks, extraPatterns);

    return {
      schema: "guardian.report.v2",
      scannedAt: new Date().toISOString(),
      chain: {
        id: evm.id,
        name: evm.name,
        family: "evm",
        explorerUrl: `${evm.explorerUrl}/address/${lower}`,
      },
      token: {
        address: lower,
        name,
        symbol,
        decimals: onchainMeta.decimals,
        imageUrl: identity.imageUrl,
      },
      grade,
      score,
      headline,
      disclaimer: DISCLAIMER,
      patterns,
      checks,
      copycats,
      pools,
      holders,
      sources,
    };
  }
}
