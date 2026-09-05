import type {
  ChainConfig,
  Check,
  GuardianReport,
  Holder,
  LiquidityPool,
  Pattern,
  PresenceMatch,
  SolanaChainConfig,
  SourceStatus,
} from "@/lib/guardian/types";
import { DISCLAIMER } from "@/lib/guardian/types";
import { isSolanaAddress } from "@/lib/chains/detect";
import { findCopycats } from "@/lib/guardian/copycats";
import { check, compileReportMeta, daysAgo, formatAge, formatPct, formatUsd, pattern } from "@/lib/guardian/grade";
import { fetchDexToken, filterPairsForChain, identityFromPairs } from "@/lib/sources/dexscreener";
import { fetchGoPlusSolana } from "@/lib/sources/goplus";
import { fetchRugCheck } from "@/lib/sources/rugcheck";
import { solanaAccountExists } from "@/lib/sources/rpc";
import type { ChainAdapter } from "@/lib/adapters/types";

function asSolana(chain: ChainConfig): SolanaChainConfig {
  if (chain.family !== "solana") {
    throw new Error("SolanaAdapter received a non-Solana chain config");
  }
  return chain;
}

export class SolanaAdapter implements ChainAdapter {
  family = "solana" as const;

  supports(address: string) {
    return isSolanaAddress(address);
  }

  async probe(address: string, chain: ChainConfig): Promise<PresenceMatch> {
    const sol = asSolana(chain);
    const result = await solanaAccountExists(sol.rpcUrl, address);
    return {
      chainId: sol.id,
      chainName: sol.name,
      family: "solana",
      exists: result.exists,
      isContract: result.exists,
      error: result.error,
    };
  }

  async findCopycats(ticker: string, chain: ChainConfig, excludeAddress: string) {
    const sol = asSolana(chain);
    const { copycats } = await findCopycats({
      ticker,
      chainId: sol.id,
      chainName: sol.name,
      dexScreenerChain: sol.dexScreenerChain,
      excludeAddress,
    });
    return copycats;
  }

  async scan(address: string, chain: ChainConfig): Promise<GuardianReport> {
    const sol = asSolana(chain);
    const sources: SourceStatus[] = [];
    const note = (id: string, ok: boolean, error?: string) => sources.push({ id, ok, error });

    const [rug, goplus, dex, account] = await Promise.all([
      fetchRugCheck(address),
      fetchGoPlusSolana(address),
      fetchDexToken(address),
      solanaAccountExists(sol.rpcUrl, address),
    ]);

    note("rugcheck", Boolean(rug.data), rug.error);
    note("goplus-solana", Boolean(goplus.data), goplus.error);
    note("dexscreener", !dex.error, dex.error);
    note("solana-rpc", account.exists, account.error);

    const pairs = filterPairsForChain(dex.pairs, "solana");
    const identity = identityFromPairs(pairs.length ? pairs : dex.pairs, address);
    const name = rug.data?.tokenMeta.name ?? goplus.data?.token_name ?? identity.name;
    const symbol = rug.data?.tokenMeta.symbol ?? goplus.data?.token_symbol ?? identity.symbol;

    const mintAuth = rug.data?.mintAuthority ?? (goplus.data?.mintable?.status === "1" ? "live" : null);
    const freezeAuth = rug.data?.freezeAuthority ?? (goplus.data?.freezable?.status === "1" ? "live" : null);
    const mintLive = Boolean(mintAuth) && mintAuth !== "null";
    const freezeLive = Boolean(freezeAuth) && freezeAuth !== "null";
    const goplusMint = goplus.data?.mintable?.status === "1";
    const goplusFreeze = goplus.data?.freezable?.status === "1";

    const holders: Holder[] = (rug.data?.topHolders.length ? rug.data.topHolders : goplus.data?.holders ?? [])
      .slice(0, 10)
      .map((row) => ({
        address: ("address" in row ? row.address : undefined) ?? "",
        percent: "pct" in row ? (row.pct ?? null) : Number((row as { percent?: string }).percent ?? 0) * 100,
        tag: "insider" in row && row.insider ? "insider" : ((row as { tag?: string }).tag ?? null),
        locked: "is_locked" in row ? (row as { is_locked?: number }).is_locked === 1 : null,
      }));
    const top10 = holders.reduce((sum, row) => sum + (row.percent ?? 0), 0);

    const pools: LiquidityPool[] = (pairs.length ? pairs : dex.pairs).slice(0, 6).map((pair) => ({
      dex: pair.dexId,
      pairAddress: pair.pairAddress,
      quote: pair.quoteToken.symbol ?? "",
      liquidityUsd: pair.liquidityUsd,
      createdAt: pair.pairCreatedAt,
      url: pair.url,
    }));

    const copycats = symbol
      ? (
          await findCopycats({
            ticker: symbol,
            chainId: sol.id,
            chainName: sol.name,
            dexScreenerChain: "solana",
            excludeAddress: address,
          })
        ).copycats
      : [];

    const checks: Check[] = [];
    const extraPatterns: Pattern[] = [];

    const mutable = rug.data?.tokenMeta.mutable;
    checks.push(
      mutable
        ? check({
            id: "verified_source",
            title: "Metadata / source",
            status: "flag",
            grade: "C",
            summary: "Token metadata is still mutable.",
            detail: "Solana tokens do not use Etherscan-style verification. Mutable metadata means name, symbol, and URI can still change.",
          })
        : check({
            id: "verified_source",
            title: "Metadata / source",
            status: mutable === false ? "pass" : "unknown",
            grade: mutable === false ? "A" : "U",
            summary:
              mutable === false
                ? "Metadata update authority is frozen."
                : "Metadata mutability was not returned.",
            detail: "Guardian maps Solana metadata authority onto the same verified-source slot used for EVM explorer verification.",
          }),
    );

    checks.push(
      check({
        id: "proxy_upgradeable",
        title: "Proxy / upgradeable",
        status: "pass",
        grade: "A",
        summary: "Solana SPL tokens are not EVM proxies.",
        detail:
          "Upgrade authority on a custom program is out of v2 scope. Standard Token / Token-2022 mints are reported through mint and freeze authorities instead.",
      }),
    );

    const privilegeOn = mintLive || freezeLive || goplusMint || goplusFreeze;
    if (privilegeOn) {
      extraPatterns.push(
        pattern(
          "authorities",
          "critical",
          "Mint or freeze authority still live",
          [mintLive || goplusMint ? "mint" : null, freezeLive || goplusFreeze ? "freeze" : null]
            .filter(Boolean)
            .join(" + "),
        ),
      );
    }
    checks.push(
      privilegeOn
        ? check({
            id: "owner_privileges",
            title: "Owner privileges",
            status: "flag",
            grade: mintLive || goplusMint ? "F" : "D",
            summary: `${mintLive || goplusMint ? "Mint authority live" : "Mint burned"}${freezeLive || goplusFreeze ? "; freeze authority live" : ""}.`,
            detail: "Mint and freeze map to the EVM owner-privilege slot (mint / pause). A live mint can inflate supply; freeze can halt wallets.",
            evidence: { mintAuth, freezeAuth },
          })
        : check({
            id: "owner_privileges",
            title: "Owner privileges",
            status: "pass",
            grade: "A",
            summary: "Mint and freeze authorities are revoked.",
            detail: "No mint/freeze authority returned by RugCheck or GoPlus.",
          }),
    );

    const feeRate =
      (goplus.data?.transfer_fee as { current_fee_rate?: { fee_rate?: number } } | undefined)
        ?.current_fee_rate?.fee_rate ?? null;
    checks.push(
      feeRate && feeRate > 0
        ? check({
            id: "transfer_tax",
            title: "Transfer tax",
            status: "flag",
            grade: feeRate >= 10 ? "D" : "C",
            summary: `Token-2022 transfer fee ≈ ${formatPct(feeRate)}.`,
            detail: "Transfer-fee extension on Token-2022. This is the Solana equivalent of an EVM transfer tax.",
          })
        : check({
            id: "transfer_tax",
            title: "Transfer tax",
            status: feeRate === 0 ? "pass" : "unknown",
            grade: feeRate === 0 ? "A" : "U",
            summary:
              feeRate === 0
                ? "No Token-2022 transfer fee reported."
                : "No transfer-fee extension in the GoPlus payload.",
            detail: "Solana does not use EVM buy/sell tax fields; Guardian maps Token-2022 transfer fees here.",
          }),
    );

    const rugHoneypot = (rug.data?.risks ?? []).some((risk) =>
      /honeypot|can't sell|cannot sell/i.test(`${risk.name} ${risk.description}`),
    );
    checks.push(
      rugHoneypot
        ? check({
            id: "honeypot_simulation",
            title: "Honeypot simulation",
            status: "flag",
            grade: "F",
            summary: "RugCheck risk list includes a sell-trap pattern.",
            detail: rug.data?.risks.map((risk) => risk.name).join(", ") ?? "",
          })
        : check({
            id: "honeypot_simulation",
            title: "Honeypot simulation",
            status: "pass",
            grade: "B",
            summary: "No sell-trap item in the RugCheck risk list.",
            detail:
              "Solana has no Honeypot.is buy→sell fork. Guardian uses RugCheck risks as the equivalent slot so the report shape stays identical to EVM.",
          }),
    );

    const locked = rug.data?.lpLockedPct;
    checks.push(
      locked === null || locked === undefined
        ? check({
            id: "lp_lock",
            title: "LP lock / burn",
            status: pools.length ? "flag" : "unknown",
            grade: pools.length ? "C" : "U",
            summary: pools.length
              ? `Pools found on ${[...new Set(pools.map((p) => p.dex))].join(", ")}; lock percent missing.`
              : "No LP lock figure and no DexScreener pools.",
            detail: `Main DEXes: ${sol.dexes.map((d) => d.name).join(", ")}.`,
          })
        : locked >= 80
          ? check({
              id: "lp_lock",
              title: "LP lock / burn",
              status: "pass",
              grade: "A",
              summary: `${formatPct(locked)} of LP is locked or burned.`,
              detail: `Liquidity across listed pools: ${formatUsd(pools.reduce((s, p) => s + (p.liquidityUsd ?? 0), 0))}.`,
            })
          : check({
              id: "lp_lock",
              title: "LP lock / burn",
              status: "flag",
              grade: locked < 10 ? "F" : "D",
              summary: `${formatPct(locked)} of LP is locked.`,
              detail: "Unlocked Raydium / Meteora / Pump LP is the standard Solana rug vector.",
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
            detail: "RugCheck and GoPlus both missed holder tables.",
          })
        : top10 >= 70
          ? check({
              id: "holder_concentration",
              title: "Holder concentration",
              status: "flag",
              grade: top10 >= 90 ? "F" : "D",
              summary: `Top 10 wallets hold ${formatPct(top10)} of supply.`,
              detail: "Includes bonding-curve and LP accounts when RugCheck lists them.",
            })
          : check({
              id: "holder_concentration",
              title: "Holder concentration",
              status: "pass",
              grade: top10 >= 50 ? "B" : "A",
              summary: `Top 10 wallets hold ${formatPct(top10)} of supply.`,
              detail: `${holders.length} accounts listed.`,
            }),
    );

    const createdAt = pools[0]?.createdAt ?? rug.data?.detectedAt ?? null;
    const ageDays = daysAgo(createdAt);
    checks.push(
      ageDays === null
        ? check({
            id: "contract_age",
            title: "Contract age",
            status: "unknown",
            grade: "U",
            summary: "Mint creation time was not available.",
            detail: "DexScreener pairCreatedAt is the Solana age proxy in v2.",
          })
        : ageDays < 2
          ? check({
              id: "contract_age",
              title: "Contract age",
              status: "flag",
              grade: "D",
              summary: `First pool is ${formatAge(createdAt)} old.`,
              detail: "New Solana mints are where copycat tickers cluster.",
            })
          : check({
              id: "contract_age",
              title: "Contract age",
              status: "pass",
              grade: ageDays < 30 ? "B" : "A",
              summary: `First pool is ${formatAge(createdAt)} old.`,
              detail: rug.data?.deployer ? `Creator ${rug.data.deployer}.` : "Creator not listed.",
            }),
    );

    checks.push(
      rug.data?.deployer
        ? check({
            id: "deployer_age",
            title: "Deployer wallet age",
            status: "unknown",
            grade: "U",
            summary: `Creator ${rug.data.deployer} — first-signature age not fetched in v2.`,
            detail: "Solana deployer-age uses creator identity today. Full first-signature aging ships with Watch.",
          })
        : check({
            id: "deployer_age",
            title: "Deployer wallet age",
            status: "unknown",
            grade: "U",
            summary: "Creator wallet was not returned.",
            detail: "RugCheck did not include a creator field.",
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
            detail: "Mint symbol was not resolved.",
          })
        : copycats.length === 0
          ? check({
              id: "copycats",
              title: "Same-ticker copies",
              status: "pass",
              grade: "A",
              summary: `No other ${symbol} pools on Solana in the DexScreener search window.`,
              detail: "This is the same oldest/deepest ticker search used on EVM chains.",
            })
          : check({
              id: "copycats",
              title: "Same-ticker copies",
              status: "flag",
              grade: "C",
              summary: `${copycats.length} other ${symbol} mint(s) on Solana. Oldest and deepest are flagged.`,
              detail: [
                oldestCopy
                  ? `Oldest: ${oldestCopy.address} (${formatAge(oldestCopy.createdAt)}).`
                  : null,
                deepestCopy
                  ? `Deepest: ${deepestCopy.address} (${formatUsd(deepestCopy.liquidityUsd)}).`
                  : null,
              ]
                .filter(Boolean)
                .join(" "),
            }),
    );

    if (copycats.length) {
      extraPatterns.push(
        pattern(
          "copycats",
          "watch",
          `Same ticker (${symbol}) on Solana`,
          "Oldest and deepest same-ticker mints are listed. The scanned mint is not assumed original.",
        ),
      );
    }

    const { grade, score, headline, patterns } = compileReportMeta(checks, extraPatterns);

    return {
      schema: "guardian.report.v2",
      scannedAt: new Date().toISOString(),
      chain: {
        id: sol.id,
        name: sol.name,
        family: "solana",
        explorerUrl: `${sol.explorerUrl}/token/${address}`,
      },
      token: {
        address,
        name,
        symbol,
        decimals: null,
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
