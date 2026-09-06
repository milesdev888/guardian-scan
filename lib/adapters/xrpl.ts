import type {
  ChainConfig,
  Check,
  GuardianReport,
  Holder,
  LiquidityPool,
  Pattern,
  PresenceMatch,
  SourceStatus,
  XrplChainConfig,
  XrplIssuance,
} from "@/lib/guardian/types";
import { DISCLAIMER } from "@/lib/guardian/types";
import { isXrplAddress, xrplTokenId } from "@/lib/chains/detect";
import { findCopycats } from "@/lib/guardian/copycats";
import {
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
import {
  assessBlackhole,
  decodeCurrency,
  domainHost,
  fetchAccountInfo,
  fetchAccountLines,
  fetchAmmInfo,
  fetchEscrows,
  fetchGatewayBalances,
  fetchSignerList,
  fetchXrplToml,
  hasFlag,
  isBlackholeAddress,
  issuedAmountFromIssuerLine,
  LSF_ALLOW_TRUSTLINE_CLAWBACK,
  LSF_GLOBAL_FREEZE,
  LSF_NO_FREEZE,
  resolveLedgerCurrency,
  transferRatePct,
} from "@/lib/sources/xrpl";
import type { ChainAdapter, ScanOptions } from "@/lib/adapters/types";

function asXrpl(chain: ChainConfig): XrplChainConfig {
  if (chain.family !== "xrpl") {
    throw new Error("XRPLAdapter received a non-XRPL chain config");
  }
  return chain;
}

export class XRPLAdapter implements ChainAdapter {
  family = "xrpl" as const;

  supports(address: string) {
    return isXrplAddress(address);
  }

  async probe(address: string, chain: ChainConfig): Promise<PresenceMatch> {
    const xrpl = asXrpl(chain);
    const info = await fetchAccountInfo(address);
    return {
      chainId: xrpl.id,
      chainName: xrpl.name,
      family: "xrpl",
      exists: Boolean(info.account),
      isContract: Boolean(info.account),
      error: info.error,
    };
  }

  async listIssuances(address: string) {
    return fetchGatewayBalances(address);
  }

  async findCopycats(ticker: string, chain: ChainConfig, excludeAddress: string) {
    const xrpl = asXrpl(chain);
    const { copycats } = await findCopycats({
      ticker,
      chainId: xrpl.id,
      chainName: xrpl.name,
      dexScreenerChain: xrpl.dexScreenerChain,
      excludeAddress,
      family: "xrpl",
    });
    return copycats;
  }

  async scan(address: string, chain: ChainConfig, options?: ScanOptions): Promise<GuardianReport> {
    const xrpl = asXrpl(chain);
    const sources: SourceStatus[] = [];
    const note = (id: string, ok: boolean, error?: string) => sources.push({ id, ok, error });

    const [info, balances, signer] = await Promise.all([
      fetchAccountInfo(address),
      fetchGatewayBalances(address),
      fetchSignerList(address),
    ]);

    note("xrpl-account_info", Boolean(info.account), info.error);
    note("xrpl-gateway_balances", !balances.error, balances.error);
    note("xrpl-signer_list", !signer.error, signer.error);

    if (!info.account) {
      throw new Error(info.error ?? "XRPL account not found.");
    }

    const account = info.account;
    const signerList = info.signerList || signer.present;
    const blackhole = assessBlackhole({
      flags: account.Flags,
      regularKey: account.RegularKey,
      signerList,
    });
    const noFreeze = hasFlag(account.Flags, LSF_NO_FREEZE);
    const globalFreeze = hasFlag(account.Flags, LSF_GLOBAL_FREEZE);
    const clawback = hasFlag(account.Flags, LSF_ALLOW_TRUSTLINE_CLAWBACK);
    const taxPct = transferRatePct(account.TransferRate);
    const host = domainHost(account.Domain);

    const requested = options?.currency?.trim() || undefined;
    const ledgerCurrency = requested
      ? resolveLedgerCurrency(
          requested,
          balances.issuances.map((row) => row.currency),
        ) ?? requested
      : undefined;
    const issuance: XrplIssuance | null = ledgerCurrency
      ? (balances.issuances.find((row) => row.currency === ledgerCurrency || row.display === ledgerCurrency) ?? {
          currency: ledgerCurrency,
          display: decodeCurrency(ledgerCurrency),
          value: "0",
        })
      : null;
    const scanningToken = Boolean(issuance);
    const displayCurrency = issuance?.display ?? ledgerCurrency ?? null;
    const dexQuery = displayCurrency ? `${displayCurrency}.${address}` : address;

    const [dex, toml, lines, amm] = await Promise.all([
      fetchDexToken(dexQuery).then(async (first) => {
        if (first.pairs.length || !displayCurrency) return first;
        return fetchDexToken(address);
      }),
      host ? fetchXrplToml(host, address, issuance?.currency ?? displayCurrency) : Promise.resolve(null),
      scanningToken
        ? fetchAccountLines(address, { currency: issuance!.currency })
        : Promise.resolve({ lines: [], pages: 0, truncated: false, sampled: 0, error: undefined as string | undefined }),
      scanningToken
        ? fetchAmmInfo(issuance!.currency, address)
        : Promise.resolve({ amm: null, error: undefined as string | undefined }),
    ]);

    note("dexscreener", !dex.error, dex.error);
    if (toml) note("xrp-ledger.toml", toml.fetched, toml.error);
    note("xrpl-account_lines", !lines.error, lines.error);
    note("xrpl-amm_info", Boolean(amm.amm) || !amm.error, amm.error);

    const pairs = filterPairsForChain(dex.pairs, "xrpl");
    const identity = identityFromPairs(pairs.length ? pairs : dex.pairs, dexQuery);
    const symbol = scanningToken ? displayCurrency : null;
    const name = scanningToken
      ? (identity.name && identity.symbol?.toLowerCase() === displayCurrency?.toLowerCase()
          ? identity.name
          : displayCurrency)
      : host
        ? `XRPL account (${host})`
        : "XRPL account";

    const extraPatterns: Pattern[] = [];
    const checks: Check[] = [];

    const verified =
      Boolean(host) && Boolean(toml?.fetched) && Boolean(toml?.namedIssuer) && (scanningToken ? Boolean(toml?.namedToken) : true);
    checks.push(
      verified
        ? check({
            id: "verified_source",
            title: "Issuer verification",
            status: "pass",
            grade: "A",
            summary: `Domain ${host} publishes xrp-ledger.toml naming this ${scanningToken ? "token" : "account"}.`,
            detail:
              "XRPL has no Etherscan-style source verify. Guardian maps Domain + /.well-known/xrp-ledger.toml onto the verified-source slot.",
            evidence: { domain: host, toml: toml },
          })
        : check({
            id: "verified_source",
            title: "Issuer verification",
            status: host ? "flag" : "unknown",
            grade: host ? "C" : "U",
            summary: host
              ? toml?.fetched
                ? `Domain ${host} is set, but xrp-ledger.toml does not name this ${scanningToken ? "token" : "issuer"}.`
                : `Domain ${host} is set, but xrp-ledger.toml was not fetched (${toml?.error ?? "missing"}).`
              : "No Domain field on this account.",
            detail:
              "A Domain without a toml that names the issuer back is not a verified issuer. Guardian will not treat a website string as proof.",
            evidence: { domain: host, toml },
          }),
    );

    checks.push(
      check({
        id: "proxy_upgradeable",
        title: "Proxy / upgradeable",
        status: "pass",
        grade: "A",
        summary: "XRPL issued tokens are not EVM proxies.",
        detail:
          "There is no contract bytecode to upgrade. Issuer power lives in AccountRoot flags, regular keys, and signer lists — reported in owner privileges.",
      }),
    );

    if (globalFreeze) {
      extraPatterns.push(
        pattern(
          "global-freeze",
          "critical",
          "Global Freeze is set",
          "lsfGlobalFreeze is on. Trust lines cannot send this issuance until the issuer clears the flag (which a blackholed issuer cannot do).",
        ),
      );
    }
    if (clawback && !blackhole.blackholed) {
      extraPatterns.push(
        pattern(
          "clawback",
          "caution",
          "Clawback enabled",
          "lsfAllowTrustLineClawback is set. The issuer can reclaim issued balances.",
        ),
      );
    }

    const freezeLive = !noFreeze && !blackhole.blackholed;
    if (!blackhole.blackholed) {
      extraPatterns.push(
        pattern(
          "issuer-keys",
          "critical",
          "Issuer is not blackholed",
          blackhole.summary,
        ),
      );
    }

    const privilegeGrade = !blackhole.blackholed
      ? "F"
      : globalFreeze
        ? "D"
        : freezeLive
          ? "C"
          : "A";
    checks.push(
      check({
        id: "owner_privileges",
        title: "Supply safety / freeze",
        status: privilegeGrade === "A" ? "pass" : "flag",
        grade: privilegeGrade,
        summary: blackhole.blackholed
          ? `Issuer blackholed${noFreeze ? "; No Freeze surrendered" : globalFreeze ? "; Global Freeze is set" : "; freeze flag not permanently surrendered, but the issuer cannot sign"}.`
          : `Issuer can still sign (${blackhole.summary}).${noFreeze ? " No Freeze is set." : " Freeze authority remains."}`,
        detail: [
          blackhole.summary,
          noFreeze
            ? "lsfNoFreeze is set — freeze was permanently surrendered."
            : "lsfNoFreeze is unset — freeze was not permanently surrendered.",
          globalFreeze ? "lsfGlobalFreeze is currently set." : "lsfGlobalFreeze is unset.",
          clawback ? "Clawback flag is set." : "Clawback flag is unset.",
          "Blackholing (master disabled + no usable regular key + no signer list) is the XRPL equivalent of mint authority revoked.",
        ].join(" "),
        evidence: {
          flags: account.Flags,
          regularKey: account.RegularKey ?? null,
          blackholed: blackhole.blackholed,
          noFreeze,
          globalFreeze,
          clawback,
        },
      }),
    );

    checks.push(
      taxPct >= 0.05
        ? check({
            id: "transfer_tax",
            title: "Transfer tax",
            status: "flag",
            grade: taxPct >= 5 ? "D" : "C",
            summary: `Issuer TransferRate is ${taxPct < 0.1 ? `${taxPct.toFixed(3)}%` : formatPct(taxPct)}.`,
            detail:
              "XRPL TransferRate is charged when issued tokens are transferred between customers. 1,000,000,000 = 0%. This is the protocol equivalent of an EVM transfer tax.",
            evidence: { transferRate: account.TransferRate ?? null, percent: taxPct },
          })
        : check({
            id: "transfer_tax",
            title: "Transfer tax",
            status: "pass",
            grade: "A",
            summary:
              taxPct > 0
                ? `TransferRate is ${taxPct.toFixed(3)}% — treated as dust, not a tax.`
                : "TransferRate is 0% (unset or 1,000,000,000).",
            detail: "No meaningful issuer transfer fee on this AccountRoot.",
            evidence: { transferRate: account.TransferRate ?? null, percent: taxPct },
          }),
    );

    const holders: Holder[] = [];
    let top10 = 0;
    let concentrationNote = "No trust lines sampled.";
    if (scanningToken) {
      const totalIssued = Number(issuance?.value ?? 0);
      const ammAccount = amm.amm?.account;
      const holderRows = lines.lines
        .map((line) => {
          const amount = issuedAmountFromIssuerLine(line.balance);
          const tag = isBlackholeAddress(line.account)
            ? "burn"
            : ammAccount && line.account === ammAccount
              ? "pool"
              : null;
          return {
            address: line.account,
            amount,
            percent: totalIssued > 0 ? (amount / totalIssued) * 100 : null,
            tag,
            locked: tag === "burn",
          };
        })
        .filter((row) => row.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      const free = holderRows.filter((row) => row.tag !== "pool" && row.tag !== "burn");
      holders.push(
        ...holderRows.slice(0, 16).map((row) => ({
          address: row.address,
          percent: row.percent,
          tag: row.tag,
          locked: row.locked,
        })),
      );
      top10 = free.slice(0, 10).reduce((sum, row) => sum + (row.percent ?? 0), 0);
      concentrationNote = lines.truncated
        ? `Sampled ${lines.sampled} matching trust lines across ${lines.pages} pages (cap reached). Percents use gateway_balances obligation as the denominator, so whale share is a lower bound.`
        : `${free.length} free-float trust lines after excluding AMM and blackhole accounts. Obligation ${issuance?.value ?? "n/a"} ${displayCurrency}.`;
    }

    let lpEscrowUnlock: string | null = null;
    let lpBurnedPct: number | null = null;
    let lpFacts = "";
    if (amm.amm) {
      const lpLines = await fetchAccountLines(amm.amm.account, { currency: amm.amm.lpCurrency });
      note("xrpl-amm-lp-lines", !lpLines.error, lpLines.error);
      const lpTotal = amm.amm.lpValue && amm.amm.lpValue > 0 ? amm.amm.lpValue : null;
      const lpHolders = lpLines.lines
        .map((line) => ({
          address: line.account,
          amount: issuedAmountFromIssuerLine(line.balance),
        }))
        .filter((row) => row.amount > 0);
      const burned = lpHolders
        .filter((row) => isBlackholeAddress(row.address))
        .reduce((sum, row) => sum + row.amount, 0);
      lpBurnedPct = lpTotal ? (burned / lpTotal) * 100 : null;
      const escrows = await fetchEscrows(amm.amm.account);
      note("xrpl-amm-escrow", !escrows.error, escrows.error);
      const dated = escrows.escrows.map((row) => row.finishAfter).filter((value): value is string => Boolean(value));
      dated.sort((a, b) => Date.parse(a) - Date.parse(b));
      lpEscrowUnlock = dated[0] ?? null;
      lpFacts = `AMM ${amm.amm.account}; LP supply ${amm.amm.lpValue ?? "n/a"}; ${lpHolders.length} LP trust lines sampled; burned-at-blackhole ${
        lpBurnedPct === null ? "n/a" : `${lpBurnedPct.toFixed(1)}%`
      }.`;
    }

    const createdAt = (pairs.length ? pairs : dex.pairs)[0]?.pairCreatedAt ?? null;
    const ageDays = daysAgo(createdAt);

    const lpAssessment = classifyLp({
      family: "xrpl",
      tokenAgeDays: ageDays,
      xrpl: {
        poolExists: Boolean(amm.amm),
        ammAccount: amm.amm?.account ?? null,
        lpBurnedPct,
        lpLockedPct: lpEscrowUnlock ? 100 : null,
        escrowUnlockAt: lpEscrowUnlock,
        facts: lpFacts || null,
      },
    });
    checks.push(lpCheckFrom(lpAssessment));

    checks.push(
      !scanningToken
        ? check({
            id: "holder_concentration",
            title: "Holder concentration",
            status: "unknown",
            grade: "U",
            summary: "Account scan — no issued currency selected.",
            detail: "Pick a currency this account issues to build a trust-line holder table.",
          })
        : holders.length === 0
          ? check({
              id: "holder_concentration",
              title: "Holder concentration",
              status: "unknown",
              grade: "U",
              summary: "No trust lines with a positive issued balance in the sampled window.",
              detail: concentrationNote,
            })
          : top10 >= 70
            ? check({
                id: "holder_concentration",
                title: "Holder concentration",
                status: "flag",
                grade: top10 >= 90 ? "F" : "D",
                summary: `Top 10 non-pool wallets hold ${formatPct(top10)} of issued ${displayCurrency}.`,
                detail: concentrationNote,
              })
            : check({
                id: "holder_concentration",
                title: "Holder concentration",
                status: "pass",
                grade: top10 >= 50 ? "B" : "A",
                summary: `Top 10 non-pool wallets hold ${formatPct(top10)} of issued ${displayCurrency}.`,
                detail: concentrationNote,
              }),
    );

    checks.push(
      ageDays === null
        ? check({
            id: "contract_age",
            title: "Contract age",
            status: "unknown",
            grade: "U",
            summary: scanningToken
              ? "No DexScreener pair timestamp for this issuance."
              : "XRPL accounts do not have an EVM-style creation block in this adapter.",
            detail: "Pair created-at is the age proxy when DexScreener lists an XRPL pool.",
          })
        : ageDays < 2
          ? check({
              id: "contract_age",
              title: "Contract age",
              status: "flag",
              grade: "D",
              summary: `First listed pool is ${formatAge(createdAt)} old.`,
              detail: "New issuances are where copycat tickers cluster.",
            })
          : check({
              id: "contract_age",
              title: "Contract age",
              status: "pass",
              grade: ageDays < 30 ? "B" : "A",
              summary: `First listed pool is ${formatAge(createdAt)} old.`,
              detail: `Issuer ${address}.`,
            }),
    );

    checks.push(
      check({
        id: "deployer_age",
        title: "Deployer wallet age",
        status: "unknown",
        grade: "U",
        summary: "Issuer first-ledger age is not fetched in v2.",
        detail: "The issuer account is the XRPL analogue of a deployer. Full first-transaction aging ships with Watch.",
      }),
    );

    const copycats =
      symbol
        ? (
            await findCopycats({
              ticker: symbol,
              chainId: xrpl.id,
              chainName: xrpl.name,
              dexScreenerChain: "xrpl",
              excludeAddress: address,
              family: "xrpl",
            })
          ).copycats
        : [];

    const oldestCopy = copycats.find((row) => row.flags.includes("oldest"));
    const deepestCopy = copycats.find((row) => row.flags.includes("deepest"));
    checks.push(
      !symbol
        ? check({
            id: "copycats",
            title: "Same-ticker copies",
            status: "unknown",
            grade: "U",
            summary: "No currency code to search.",
            detail: "Account scan only.",
          })
        : copycats.length === 0
          ? check({
              id: "copycats",
              title: "Same-ticker copies",
              status: "pass",
              grade: "A",
              summary: `No other ${symbol} issuances on XRPL in the DexScreener search window.`,
              detail: "Same oldest/deepest ticker search used on Solana and EVM.",
            })
          : check({
              id: "copycats",
              title: "Same-ticker copies",
              status: "flag",
              grade: "C",
              summary: `${copycats.length} other ${symbol} issuance(s) on XRPL. Oldest and deepest are flagged.`,
              detail: [
                oldestCopy ? `Oldest: ${oldestCopy.address} (${formatAge(oldestCopy.createdAt)}).` : null,
                deepestCopy ? `Deepest: ${deepestCopy.address} (${formatUsd(deepestCopy.liquidityUsd)}).` : null,
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
          `Same ticker (${symbol}) on XRPL`,
          "Oldest and deepest same-ticker issuances are listed. The scanned issuer is not assumed original.",
        ),
      );
    }

    const pools: LiquidityPool[] = (pairs.length ? pairs : dex.pairs).slice(0, 6).map((pair) => ({
      dex: pair.dexId,
      pairAddress: pair.pairAddress,
      quote: pair.quoteToken.symbol ?? "",
      liquidityUsd: pair.liquidityUsd,
      createdAt: pair.pairCreatedAt,
      url: pair.url,
    }));
    if (!pools.length && amm.amm) {
      pools.push({
        dex: "xls30-amm",
        pairAddress: amm.amm.account,
        quote: "XRP",
        liquidityUsd: null,
        createdAt: null,
        url: `${xrpl.explorerUrl}/account/${amm.amm.account}`,
      });
    }

    const { grade, score, headline, patterns } = compileReportMeta(checks, extraPatterns);
    const tokenAddress = scanningToken
      ? xrplTokenId(address, displayCurrency)
      : address;

    return {
      schema: "guardian.report.v2",
      scannedAt: new Date().toISOString(),
      chain: {
        id: xrpl.id,
        name: xrpl.name,
        family: "xrpl",
        explorerUrl: `${xrpl.explorerUrl}/account/${address}`,
      },
      token: {
        address: tokenAddress,
        name,
        symbol,
        decimals: 15,
        imageUrl: identity.imageUrl,
        currency: displayCurrency,
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
      lp: toLpLockInfo(lpAssessment),
    };
  }
}
