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
import {
  applyAaIfEligible,
  check,
  compileReportMeta,
  daysAgo,
  formatAge,
  formatPct,
  formatUsd,
  pattern,
} from "@/lib/guardian/grade";
import { classifyLp, lpCheckFrom, toLpLockInfo } from "@/lib/guardian/lp-tier";
import { fetchDexToken, filterPairsForChain, identityFromPairs } from "@/lib/sources/dexscreener";
import { fetchGoPlusSolana } from "@/lib/sources/goplus";
import { fetchRugCheck, labelFromKnownAccount } from "@/lib/sources/rugcheck";
import { parseRugCheckMarkets } from "@/lib/sources/rugcheck-markets";
import { solanaAccountExists } from "@/lib/sources/rpc";
import { resolveTokenTwitter } from "@/lib/guardian/resolve-twitter";
import {
  getAccountOwner,
  getMultipleAccountOwners,
  getMultipleTokenAccountAuthorities,
  labelForProtocolOwner,
  METEORA_DAMM_V2_PROGRAM,
  resolveMintDeployer,
  SOLANA_BURN_ADDRESSES,
} from "@/lib/sources/solana-onchain";
import type { ChainAdapter } from "@/lib/adapters/types";
import { ScanTimer, withTimeout } from "@/lib/scan-timing";

/** Hard per-sub-check ceiling — timed-out checks render as unavailable. */
const SUBCHECK_TIMEOUT_MS = 8_000;

function asSolana(chain: ChainConfig): SolanaChainConfig {
  if (chain.family !== "solana") {
    throw new Error("SolanaAdapter received a non-Solana chain config");
  }
  return chain;
}

/**
 * Protocol vaults, bonding curves, escrows, vesting lockers, and burns are not free-float.
 * Matches RugCheck names (e.g. "Streamflow Vault") and on-chain protocol labels.
 */
export function isExcludedConcentrationTag(tag: string | null | undefined): boolean {
  if (!tag) return false;
  return /pool vault|bonding curve|escrow|burn|blackhole|damm|locker|streamflow|uncx|unicrypt|team\s*finance|goki|vest|vault|amm\b/i.test(
    tag,
  );
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
    const timer = new ScanTimer(`solana:${address}`);

    const [rug, goplus, dex, account] = await Promise.all([
      (async () => {
        const r = await withTimeout(
          SUBCHECK_TIMEOUT_MS,
          () => timer.time("rugcheck", () => fetchRugCheck(address), (x) => ({ ok: Boolean(x.data), error: x.error })),
          () => {
            timer.mark("rugcheck", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
            return { data: null, error: "check timed out" } as Awaited<ReturnType<typeof fetchRugCheck>>;
          },
        );
        return r.value;
      })(),
      (async () => {
        const r = await withTimeout(
          SUBCHECK_TIMEOUT_MS,
          () => timer.time("goplus", () => fetchGoPlusSolana(address), (x) => ({ ok: Boolean(x.data), error: x.error })),
          () => {
            timer.mark("goplus", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
            return { data: null, error: "check timed out" } as Awaited<ReturnType<typeof fetchGoPlusSolana>>;
          },
        );
        return r.value;
      })(),
      (async () => {
        const r = await withTimeout(
          SUBCHECK_TIMEOUT_MS,
          () => timer.time("dexscreener", () => fetchDexToken(address), (x) => ({ ok: !x.error, error: x.error })),
          () => {
            timer.mark("dexscreener", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
            return { pairs: [], error: "check timed out" } as Awaited<ReturnType<typeof fetchDexToken>>;
          },
        );
        return r.value;
      })(),
      (async () => {
        const r = await withTimeout(
          SUBCHECK_TIMEOUT_MS,
          () =>
            timer.time("solanaRpcExists", () => solanaAccountExists(sol.rpcUrl, address), (x) => ({
              ok: x.exists,
              error: x.error,
            })),
          () => {
            timer.mark("solanaRpcExists", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
            return { exists: false, error: "check timed out" };
          },
        );
        return r.value;
      })(),
    ]);

    note("rugcheck", Boolean(rug.data), rug.error);
    note("goplus-solana", Boolean(goplus.data), goplus.error);
    note("dexscreener", !dex.error, dex.error);
    note("solana-rpc", account.exists, account.error);

    const pairs = filterPairsForChain(dex.pairs, "solana");
    const identity = identityFromPairs(pairs.length ? pairs : dex.pairs, address);
    const name = rug.data?.tokenMeta.name ?? goplus.data?.token_name ?? identity.name;
    const symbol = rug.data?.tokenMeta.symbol ?? goplus.data?.token_symbol ?? identity.symbol;

    const twitterPromise = resolveTokenTwitter({
      chainId: sol.id,
      address,
      metadataUri: rug.data?.tokenMeta.uri,
      pairs: pairs.length ? pairs : dex.pairs,
    });

    const mintAuth =
      rug.data?.mintAuthority ?? (goplus.data?.mintable?.status === "1" ? "live" : null);
    const freezeAuth =
      rug.data?.freezeAuthority ?? (goplus.data?.freezable?.status === "1" ? "live" : null);
    const mintLive = Boolean(mintAuth) && mintAuth !== "null";
    const freezeLive = Boolean(freezeAuth) && freezeAuth !== "null";
    const goplusMint = goplus.data?.mintable?.status === "1";
    const goplusFreeze = goplus.data?.freezable?.status === "1";

    const marketParse = parseRugCheckMarkets(rug.data?.markets ?? []);
    const accountLabels = new Map(marketParse.accountLabels);

    const rawHolders = (
      rug.data?.topHolders.length ? rug.data.topHolders : (goplus.data?.holders ?? [])
    ).slice(0, 12);

    const holderAddresses = rawHolders
      .map((row) => ("address" in row ? row.address : undefined) ?? "")
      .filter(Boolean);

    // RugCheck knownAccounts / lockers — labels Streamflow Vault, AMM, etc. by pubkey.
    for (const [addr, meta] of Object.entries(rug.data?.knownAccounts ?? {})) {
      const knownLabel = labelFromKnownAccount(meta);
      if (knownLabel && !accountLabels.has(addr)) {
        accountLabels.set(addr, knownLabel);
      }
    }
    for (const locker of rug.data?.lockers ?? []) {
      if (locker.address && !accountLabels.has(locker.address)) {
        accountLabels.set(locker.address, locker.name || "Protocol locker escrow");
      }
    }

    const deepestParsed = [...marketParse.parsed].sort(
      (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0),
    )[0];

    type HolderLookups = {
      authorities: Map<string, string | null>;
      owners: Map<string, string | null>;
      authError?: string;
      ownerError?: string;
    };

    // Independent sub-checks run in parallel with a hard ~8s ceiling each.
    const [poolOwnerTimed, holdersTimed, copycatsTimed, deployerTimed] = await Promise.all([
      withTimeout(
        SUBCHECK_TIMEOUT_MS,
        async () => {
          if (!deepestParsed?.pubkey) return { owner: null as string | null, error: undefined as string | undefined, skipped: true };
          const t0 = Date.now();
          const poolOwner = await getAccountOwner(sol.rpcUrl, deepestParsed.pubkey);
          timer.mark("poolOwner", Date.now() - t0, !poolOwner.error, poolOwner.error);
          return { ...poolOwner, skipped: false };
        },
        () => {
          timer.mark("poolOwner", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
          return { owner: null as string | null, error: "check timed out", skipped: false };
        },
      ),
      withTimeout(
        SUBCHECK_TIMEOUT_MS,
        async () => {
          const t0 = Date.now();
          const authorityLookup = await getMultipleTokenAccountAuthorities(
            sol.rpcUrl,
            holderAddresses,
          );
          timer.mark(
            "holderAuthorities",
            Date.now() - t0,
            !authorityLookup.error,
            authorityLookup.error,
          );
          const authorityAddresses = [
            ...new Set(
              [...authorityLookup.authorities.values()].filter(
                (value): value is string => Boolean(value),
              ),
            ),
          ];
          const t1 = Date.now();
          const programOwnerLookup = await getMultipleAccountOwners(sol.rpcUrl, [
            ...holderAddresses,
            ...authorityAddresses,
          ]);
          timer.mark(
            "holderOwners",
            Date.now() - t1,
            !programOwnerLookup.error,
            programOwnerLookup.error,
          );
          return {
            authorities: authorityLookup.authorities,
            owners: programOwnerLookup.owners,
            authError: authorityLookup.error,
            ownerError: programOwnerLookup.error,
          } satisfies HolderLookups;
        },
        () => {
          timer.mark("holderAuthorities", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
          timer.mark("holderOwners", 0, false, "check timed out", true);
          return {
            authorities: new Map<string, string | null>(),
            owners: new Map<string, string | null>(),
            authError: "check timed out",
            ownerError: "check timed out",
          } satisfies HolderLookups;
        },
      ),
      withTimeout(
        SUBCHECK_TIMEOUT_MS,
        async () => {
          if (!symbol) return { copycats: [] as Awaited<ReturnType<typeof findCopycats>>["copycats"], error: undefined as string | undefined };
          const t0 = Date.now();
          const result = await findCopycats({
            ticker: symbol,
            chainId: sol.id,
            chainName: sol.name,
            dexScreenerChain: sol.dexScreenerChain,
            excludeAddress: address,
          });
          timer.mark("copycats", Date.now() - t0, !result.error, result.error);
          return result;
        },
        () => {
          timer.mark("copycats", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
          return {
            copycats: [] as Awaited<ReturnType<typeof findCopycats>>["copycats"],
            error: "check timed out",
          };
        },
      ),
      withTimeout(
        SUBCHECK_TIMEOUT_MS,
        async () => {
          const fromSources = rug.data?.deployer ?? goplus.data?.creator_address ?? null;
          if (fromSources) {
            timer.mark("deployerResolve", 0, true);
            return { deployer: fromSources as string, error: undefined as string | undefined, fromSources: true };
          }
          const t0 = Date.now();
          const resolved = await resolveMintDeployer(sol.rpcUrl, address);
          timer.mark(
            "deployerResolve",
            Date.now() - t0,
            Boolean(resolved.deployer),
            resolved.error,
          );
          return { deployer: resolved.deployer, error: resolved.error, fromSources: false };
        },
        () => {
          timer.mark("deployerResolve", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
          return { deployer: null as string | null, error: "check timed out", fromSources: false };
        },
      ),
    ]);

    const poolOwner = poolOwnerTimed.value;
    if (!poolOwner.skipped) {
      note("solana-pool-owner", !poolOwner.error, poolOwner.error);
      if (poolOwner.owner === METEORA_DAMM_V2_PROGRAM && deepestParsed?.pubkey) {
        accountLabels.set(deepestParsed.pubkey, "Meteora DAMM v2 pool");
        const idx = marketParse.parsed.findIndex((row) => row.pubkey === deepestParsed.pubkey);
        if (idx >= 0) {
          marketParse.parsed[idx].marketType = "meteora_damm_v2";
          const market = marketParse.markets[idx];
          if (market) {
            market.marketType = "meteora_damm_v2";
            market.lockerName = "Meteora DAMM v2";
            market.burnedPct = 0;
          }
        }
      }
    }

    const authorityLookup = {
      authorities: holdersTimed.value.authorities,
      error: holdersTimed.value.authError,
    };
    const programOwnerLookup = {
      owners: holdersTimed.value.owners,
      error: holdersTimed.value.ownerError,
    };
    note("solana-holder-authorities", !authorityLookup.error, authorityLookup.error);
    note("solana-holder-owners", !programOwnerLookup.error, programOwnerLookup.error);

    for (const addr of holderAddresses) {
      if (accountLabels.has(addr)) continue;
      const authority = authorityLookup.authorities.get(addr) ?? null;
      const authorityProgram = authority
        ? programOwnerLookup.owners.get(authority) ?? null
        : null;
      const viaAuthority = labelForProtocolOwner(authorityProgram);
      if (viaAuthority) {
        accountLabels.set(addr, viaAuthority);
        continue;
      }
      const directOwner = programOwnerLookup.owners.get(addr) ?? null;
      const viaDirect = labelForProtocolOwner(directOwner);
      if (viaDirect) {
        accountLabels.set(addr, viaDirect);
      }
    }
    for (const addr of holderAddresses) {
      if (SOLANA_BURN_ADDRESSES.has(addr) && !accountLabels.has(addr)) {
        accountLabels.set(addr, "Burn address");
      }
    }

    const holders: Holder[] = rawHolders.slice(0, 10).map((row) => {
      const addr = ("address" in row ? row.address : undefined) ?? "";
      const percent =
        "pct" in row ? (row.pct ?? null) : Number((row as { percent?: string }).percent ?? 0) * 100;
      const priorTag =
        "insider" in row && row.insider
          ? "insider"
          : ((row as { tag?: string }).tag ?? null);
      const protocolTag = accountLabels.get(addr) ?? null;
      const tag = protocolTag ?? priorTag;
      return {
        address: addr,
        percent,
        tag,
        locked:
          Boolean(protocolTag) ||
          ("is_locked" in row ? (row as { is_locked?: number }).is_locked === 1 : null),
      };
    });

    const freeFloatHolders = holders.filter((row) => !isExcludedConcentrationTag(row.tag));
    const rawTop10 = holders.reduce((sum, row) => sum + (row.percent ?? 0), 0);
    const top10 = freeFloatHolders.reduce((sum, row) => sum + (row.percent ?? 0), 0);
    const excludedPct = holders
      .filter((row) => isExcludedConcentrationTag(row.tag))
      .reduce((sum, row) => sum + (row.percent ?? 0), 0);
    const concentration = {
      rawTop10: Math.min(100, rawTop10),
      adjustedTop10: Math.min(100, top10),
      excludedPct: Math.min(100, excludedPct),
    };

    const pools: LiquidityPool[] = (pairs.length ? pairs : dex.pairs).slice(0, 6).map((pair) => ({
      dex: pair.dexId,
      pairAddress: pair.pairAddress,
      quote: pair.quoteToken.symbol ?? "",
      liquidityUsd: pair.liquidityUsd,
      createdAt: pair.pairCreatedAt,
      url: pair.url,
    }));

    const copycatsUnavailable = copycatsTimed.timedOut || Boolean(copycatsTimed.value.error?.includes("timed out"));
    const copycats = copycatsUnavailable ? [] : copycatsTimed.value.copycats;
    if (copycatsTimed.value.error && !copycatsUnavailable) {
      note("copycats-search", false, copycatsTimed.value.error);
    } else if (copycatsUnavailable) {
      note("copycats-search", false, "check timed out");
    } else if (symbol) {
      note("copycats-search", true);
    }

    const deployerUnavailable = deployerTimed.timedOut || deployerTimed.value.error === "check timed out";
    let deployer = deployerTimed.value.deployer;
    if (deployerUnavailable) {
      note("solana-deployer", false, "check timed out");
      deployer = null;
    } else if (deployer) {
      note("solana-deployer", true);
    } else {
      note("solana-deployer", false, deployerTimed.value.error);
    }

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
            detail:
              "Solana tokens do not use Etherscan-style verification. Mutable metadata means name, symbol, and URI can still change.",
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
            detail:
              "Guardian maps Solana metadata authority onto the same verified-source slot used for EVM explorer verification.",
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
            summary: `${mintLive || goplusMint ? "Mint authority live" : "Mint burned"}${
              freezeLive || goplusFreeze ? "; freeze authority live" : ""
            }.`,
            detail:
              "Mint and freeze map to the EVM owner-privilege slot (mint / pause). A live mint can inflate supply; freeze can halt wallets.",
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

    const feeRateRaw =
      (goplus.data?.transfer_fee as { current_fee_rate?: { fee_rate?: number | string } } | undefined)
        ?.current_fee_rate?.fee_rate ?? null;
    const feeRate =
      feeRateRaw === null || feeRateRaw === undefined || feeRateRaw === ""
        ? null
        : Number(feeRateRaw);
    const feeRateNum = feeRate !== null && Number.isFinite(feeRate) ? feeRate : null;
    checks.push(
      feeRateNum && feeRateNum > 0
        ? check({
            id: "transfer_tax",
            title: "Transfer tax",
            status: "flag",
            grade: feeRateNum >= 10 ? "D" : "C",
            summary: `Token-2022 transfer fee ≈ ${formatPct(feeRateNum)}.`,
            detail:
              "Transfer-fee extension on Token-2022. This is the Solana equivalent of an EVM transfer tax.",
          })
        : check({
            id: "transfer_tax",
            title: "Transfer tax",
            status: feeRateNum === 0 ? "pass" : "unknown",
            grade: feeRateNum === 0 ? "A" : "U",
            summary:
              feeRateNum === 0
                ? "No Token-2022 transfer fee reported."
                : "No transfer-fee extension in the GoPlus payload.",
            detail:
              "Solana does not use EVM buy/sell tax fields; Guardian maps Token-2022 transfer fees here.",
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

    const createdAt = pools[0]?.createdAt ?? rug.data?.detectedAt ?? null;
    const ageDays = daysAgo(createdAt);

    const lpAssessment = classifyLp({
      family: "solana",
      tokenAgeDays: ageDays,
      markets: marketParse.markets,
      lockers: (rug.data?.lockers ?? []).map((locker) => ({
        programId: null,
        type: locker.type,
        name: locker.name,
        unlockAt: null,
      })),
    });
    checks.push(lpCheckFrom(lpAssessment));

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
        : freeFloatHolders.length === 0
          ? check({
              id: "holder_concentration",
              title: "Holder concentration",
              status: "unknown",
              grade: "U",
              summary: `Top 10 hold ${formatPct(concentration.rawTop10)} raw · all excluded as vaults/locks/burns.`,
              detail: `Excluded ${formatPct(concentration.excludedPct)} in protocol / burn accounts from free-float math.`,
              evidence: { ...concentration },
            })
          : top10 >= 70
            ? check({
                id: "holder_concentration",
                title: "Holder concentration",
                status: "flag",
                grade: top10 >= 90 ? "F" : "D",
                summary: `Top 10 hold ${formatPct(concentration.rawTop10)} raw · ${formatPct(
                  concentration.adjustedTop10,
                )} excluding locked & LP.`,
                detail: `Grade keys off free-float. Excluded ${formatPct(
                  concentration.excludedPct,
                )} in pool vaults, bonding curves, locker escrows, and burns.`,
                evidence: { ...concentration },
              })
            : check({
                id: "holder_concentration",
                title: "Holder concentration",
                status: "pass",
                grade: top10 >= 50 ? "B" : "A",
                summary: `Top 10 hold ${formatPct(concentration.rawTop10)} raw · ${formatPct(
                  concentration.adjustedTop10,
                )} excluding locked & LP.`,
                detail: `${freeFloatHolders.length} free-float accounts scored; protocol vaults and burns labeled but excluded.`,
                evidence: { ...concentration },
              }),
    );

    checks.push(
      ageDays === null
        ? check({
            id: "contract_age",
            title: "Contract age",
            status: "unknown",
            grade: "U",
            summary: "Mint creation time was not available.",
            detail: "DexScreener pairCreatedAt is the Solana age proxy in v2.",
            evidence: { ageDays: null, createdAt },
          })
        : ageDays < 2
          ? check({
              id: "contract_age",
              title: "Contract age",
              status: "flag",
              grade: "D",
              summary: `First pool is ${formatAge(createdAt)} old.`,
              detail: "New Solana mints are where copycat tickers cluster.",
              evidence: { ageDays, createdAt },
            })
          : check({
              id: "contract_age",
              title: "Contract age",
              status: "pass",
              grade: ageDays < 30 ? "B" : "A",
              summary: `First pool is ${formatAge(createdAt)} old.`,
              detail: "Age from first listed pool / detection timestamp.",
              evidence: { ageDays, createdAt },
            }),
    );

    checks.push(
      deployerUnavailable
        ? check({
            id: "deployer_age",
            title: "Deployer wallet age",
            status: "unavailable",
            grade: "U",
            summary: "Check unavailable — deployer lookup timed out.",
            detail:
              "On-chain deployer resolution exceeded the 8s sub-check budget. This slot is marked unavailable so the report is not mistaken for a complete scan.",
          })
        : deployer
          ? check({
              id: "deployer_age",
              title: "Deployer wallet age",
              status: "unknown",
              grade: "U",
              summary: `Creator ${deployer} — first-signature age not fetched in v2.`,
              detail:
                rug.data?.deployer || goplus.data?.creator_address
                  ? "Creator from RugCheck / GoPlus. Full first-signature aging ships with Watch."
                  : "Creator resolved from a bounded on-chain signature sample (RugCheck omitted creator).",
              evidence: { deployer },
            })
          : check({
              id: "deployer_age",
              title: "Deployer wallet age",
              status: "unknown",
              grade: "U",
              summary: "Creator wallet could not be resolved on-chain.",
              detail: "RugCheck omitted creator and the bounded signature sample did not return a fee payer.",
            }),
    );

    const oldestCopy = copycats.find((row) => row.flags.includes("oldest"));
    const deepestCopy = copycats.find((row) => row.flags.includes("deepest"));
    checks.push(
      copycatsUnavailable
        ? check({
            id: "copycats",
            title: "Same-ticker copies",
            status: "unavailable",
            grade: "U",
            summary: "Check unavailable — same-ticker search timed out.",
            detail:
              "Copycat search exceeded the 8s sub-check budget. Marked unavailable so a partial scan is not mistaken for a complete report.",
          })
        : !symbol
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
                summary: `No other ${symbol} pools on Solana in the search window.`,
                detail: "DexScreener + Jupiter + GeckoTerminal same-ticker search.",
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
                  "Search depth: DexScreener + Jupiter token search + GeckoTerminal pools.",
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

    if (checks.some((item) => item.status === "unavailable")) {
      extraPatterns.push(
        pattern(
          "checks_unavailable",
          "watch",
          "Report incomplete — some checks unavailable",
          "One or more sub-checks timed out or failed. Unavailable slots are excluded from the grade denominator; do not treat this as a full scan.",
        ),
      );
    }

    const { grade: baseGrade, score, headline, patterns } = compileReportMeta(
      checks,
      extraPatterns,
      { pools },
    );
    const lp = toLpLockInfo(lpAssessment);
    const { grade } = applyAaIfEligible(score, baseGrade, {
      checks,
      pools,
      lp,
      patterns,
    });

    const twitterTimed = await withTimeout(
      SUBCHECK_TIMEOUT_MS,
      async () => {
        const t0 = Date.now();
        const tw = await twitterPromise;
        timer.mark("twitter", Date.now() - t0, Boolean(tw), tw ? undefined : "no known handle");
        return tw;
      },
      () => {
        timer.mark("twitter", SUBCHECK_TIMEOUT_MS, false, "check timed out", true);
        return null;
      },
    );
    const twitter = twitterTimed.value;
    if (twitter) note("twitter-handle", true);
    else note("twitter-handle", false, twitterTimed.timedOut ? "check timed out" : "no known handle");

    timer.log({
      symbol: symbol ?? null,
      sourceFails: sources.filter((s) => !s.ok).map((s) => s.id),
      timedOut: {
        poolOwner: poolOwnerTimed.timedOut,
        holders: holdersTimed.timedOut,
        copycats: copycatsTimed.timedOut,
        deployer: deployerTimed.timedOut,
        twitter: twitterTimed.timedOut,
      },
    });

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
        twitterHandle: twitter?.handle ?? null,
        twitterHandleSource: twitter?.source ?? null,
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
      lp,
      concentration,
    };
  }
}
