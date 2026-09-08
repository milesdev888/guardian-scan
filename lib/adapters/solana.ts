import {
  Connection,
  PublicKey,
  type AccountInfo,
  type ParsedAccountData,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getSolanaRpcUrl } from "@/lib/config";
import { getCached, setCached } from "@/lib/cache";
import {
  getDexscreenerPair,
  getDexscreenerPairsByToken,
  type DexscreenerPair,
} from "@/lib/sources/dexscreener";
import { getGeckoTerminalPool } from "@/lib/sources/geckoterminal";
import { getRugCheckReport } from "@/lib/sources/rugcheck";
import { getGoPlusTokenSecurity } from "@/lib/sources/goplus";
import { getHeliusAsset } from "@/lib/sources/helius";
import {
  getTokenMetadata,
  type TokenMetadataLookup,
} from "@/lib/sources/token-metadata";
import { resolveTokenTwitter } from "@/lib/guardian/resolve-twitter";
import type {
  ChainAdapter,
  HolderConcentration,
  ScanEvidence,
  TokenIdentity,
  TokenomicsSnapshot,
} from "@/lib/guardian/types";

const NETWORK = "mainnet-beta" as const;
const ZERO_ADDRESS = "11111111111111111111111111111111";
const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

type MintSnapshot = {
  supply: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean;
};

type SolanaAdapterMeta = {
  mint: MintSnapshot | null;
  metadata: TokenMetadataLookup | null;
  dexscreener: DexscreenerPair | null;
  gecko: Awaited<ReturnType<typeof getGeckoTerminalPool>>;
  rugcheck: Awaited<ReturnType<typeof getRugCheckReport>>;
  goplus: Awaited<ReturnType<typeof getGoPlusTokenSecurity>>;
  helius: Awaited<ReturnType<typeof getHeliusAsset>>;
};

function connection() {
  return new Connection(getSolanaRpcUrl(), "confirmed");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function metadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  );
  return pda;
}

function readBorshString(
  data: Buffer,
  offset: number,
): { value: string; next: number } | null {
  if (offset + 4 > data.length) return null;
  const length = data.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;
  if (length < 0 || end > data.length) return null;
  return {
    value: data.subarray(start, end).toString("utf8").replace(/\0/g, "").trim(),
    next: end,
  };
}

function parseMetaplexMetadata(data: Buffer): {
  name: string | null;
  symbol: string | null;
  uri: string | null;
  updateAuthority: string | null;
  isMutable: boolean | null;
  primarySaleHappened: boolean | null;
} {
  try {
    if (data.length < 69) {
      return {
        name: null,
        symbol: null,
        uri: null,
        updateAuthority: null,
        isMutable: null,
        primarySaleHappened: null,
      };
    }

    const updateAuthority = new PublicKey(data.subarray(1, 33)).toBase58();
    let offset = 65;
    const name = readBorshString(data, offset);
    if (!name) {
      return {
        name: null,
        symbol: null,
        uri: null,
        updateAuthority,
        isMutable: null,
        primarySaleHappened: null,
      };
    }
    offset = name.next;
    const symbol = readBorshString(data, offset);
    if (!symbol) {
      return {
        name: name.value || null,
        symbol: null,
        uri: null,
        updateAuthority,
        isMutable: null,
        primarySaleHappened: null,
      };
    }
    offset = symbol.next;
    const uri = readBorshString(data, offset);
    if (!uri) {
      return {
        name: name.value || null,
        symbol: symbol.value || null,
        uri: null,
        updateAuthority,
        isMutable: null,
        primarySaleHappened: null,
      };
    }
    offset = uri.next + 2; // seller fee basis points

    const hasCreators = data[offset];
    offset += 1;
    if (hasCreators === 1) {
      if (offset + 4 > data.length) {
        return {
          name: name.value || null,
          symbol: symbol.value || null,
          uri: uri.value || null,
          updateAuthority,
          isMutable: null,
          primarySaleHappened: null,
        };
      }
      const creatorCount = data.readUInt32LE(offset);
      offset += 4 + creatorCount * 34;
    }

    if (offset + 2 > data.length) {
      return {
        name: name.value || null,
        symbol: symbol.value || null,
        uri: uri.value || null,
        updateAuthority,
        isMutable: null,
        primarySaleHappened: null,
      };
    }

    const primarySaleHappened = data[offset] === 1;
    const isMutable = data[offset + 1] === 1;

    return {
      name: name.value || null,
      symbol: symbol.value || null,
      uri: uri.value || null,
      updateAuthority,
      isMutable,
      primarySaleHappened,
    };
  } catch {
    return {
      name: null,
      symbol: null,
      uri: null,
      updateAuthority: null,
      isMutable: null,
      primarySaleHappened: null,
    };
  }
}

async function getMintSnapshot(address: string): Promise<MintSnapshot | null> {
  const cacheKey = `solana:mint:${address}`;
  const cached = getCached<MintSnapshot | null>(cacheKey);
  if (cached) return cached.value;

  try {
    const mint = new PublicKey(address);
    const info = await connection().getParsedAccountInfo(mint, "confirmed");
    const data = info.value?.data;
    if (!data || typeof data !== "object" || !("parsed" in data)) {
      setCached(cacheKey, null, 30_000);
      return null;
    }

    const parsed = asRecord((data as ParsedAccountData).parsed);
    const infoNode = asRecord(parsed?.info);
    if (!infoNode) {
      setCached(cacheKey, null, 30_000);
      return null;
    }

    const snapshot: MintSnapshot = {
      supply: String(infoNode.supply ?? "0"),
      decimals: Number(infoNode.decimals ?? 0),
      mintAuthority: asString(infoNode.mintAuthority),
      freezeAuthority: asString(infoNode.freezeAuthority),
      isInitialized: Boolean(infoNode.isInitialized),
    };
    setCached(cacheKey, snapshot, 30_000);
    return snapshot;
  } catch {
    setCached(cacheKey, null, 15_000);
    return null;
  }
}

async function getOnchainMetadata(address: string): Promise<{
  name: string | null;
  symbol: string | null;
  uri: string | null;
  updateAuthority: string | null;
  isMutable: boolean | null;
  primarySaleHappened: boolean | null;
} | null> {
  const cacheKey = `solana:metaplex:${address}`;
  const cached = getCached<{
    name: string | null;
    symbol: string | null;
    uri: string | null;
    updateAuthority: string | null;
    isMutable: boolean | null;
    primarySaleHappened: boolean | null;
  } | null>(cacheKey);
  if (cached) return cached.value;

  try {
    const mint = new PublicKey(address);
    const pda = metadataPda(mint);
    const account = await connection().getAccountInfo(pda, "confirmed");
    if (!account?.data) {
      setCached(cacheKey, null, 60_000);
      return null;
    }
    const parsed = parseMetaplexMetadata(Buffer.from(account.data));
    setCached(cacheKey, parsed, 60_000);
    return parsed;
  } catch {
    setCached(cacheKey, null, 30_000);
    return null;
  }
}

async function getLargestHolders(
  address: string,
): Promise<HolderConcentration | null> {
  try {
    const mint = new PublicKey(address);
    const response = await connection().getTokenLargestAccounts(
      mint,
      "confirmed",
    );
    const amounts = response.value
      .map((entry) => asNumber(entry.uiAmount))
      .filter((value): value is number => value != null && value > 0);

    if (!amounts.length) return null;

    const mintSnapshot = await getMintSnapshot(address);
    const supply =
      mintSnapshot && Number(mintSnapshot.supply) > 0
        ? Number(mintSnapshot.supply) / 10 ** mintSnapshot.decimals
        : amounts.reduce((sum, value) => sum + value, 0);

    if (!(supply > 0)) return null;

    const top10Share =
      amounts.slice(0, 10).reduce((sum, value) => sum + value, 0) / supply;
    return {
      top10Share: Math.max(0, Math.min(1, top10Share)),
      sampleSize: amounts.length,
      source: "solana_rpc",
    };
  } catch {
    return null;
  }
}

async function detectTokenProgram(
  address: string,
): Promise<"spl-token" | "token-2022" | "unknown"> {
  try {
    const info = await connection().getAccountInfo(
      new PublicKey(address),
      "confirmed",
    );
    if (!info?.owner) return "unknown";
    if (info.owner.equals(TOKEN_PROGRAM_ID)) return "spl-token";
    if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return "token-2022";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function buildEvidence(meta: SolanaAdapterMeta): ScanEvidence[] {
  const evidence: ScanEvidence[] = [];
  const mint = meta.mint;
  const metadata = meta.metadata;
  const pair = meta.dexscreener;
  const gecko = meta.gecko;
  const rug = meta.rugcheck;
  const goplus = meta.goplus;
  const helius = meta.helius;

  if (mint) {
    evidence.push({
      id: "solana_mint_authorities",
      label: "Mint / freeze authority",
      status: mint.mintAuthority || mint.freezeAuthority ? "warn" : "pass",
      detail: `mint=${mint.mintAuthority ?? "revoked"}; freeze=${mint.freezeAuthority ?? "revoked"}`,
      source: "solana_rpc",
    });
  }

  if (metadata) {
    evidence.push({
      id: "solana_metadata_mutable",
      label: "Metadata mutability",
      status: metadata.isMutable ? "warn" : metadata.isMutable === false ? "pass" : "info",
      detail:
        metadata.isMutable == null
          ? "Metadata mutability unknown"
          : metadata.isMutable
            ? "Update authority can still change metadata"
            : "Metadata frozen / immutable",
      source: metadata.source,
    });
  }

  if (pair) {
    const liq = asNumber(pair.liquidity?.usd);
    evidence.push({
      id: "solana_dex_liquidity",
      label: "DEX liquidity",
      status: liq != null && liq >= 10_000 ? "pass" : liq != null && liq >= 1_000 ? "warn" : "fail",
      detail: liq != null ? `$${(liq / 1000).toFixed(1)}k on ${pair.dexId ?? "dex"}` : "No liquidity reported",
      source: "dexscreener",
    });
  }

  if (gecko?.ok && gecko.reserveUsd != null) {
    evidence.push({
      id: "solana_gecko_reserve",
      label: "GeckoTerminal reserve",
      status: gecko.reserveUsd >= 10_000 ? "pass" : gecko.reserveUsd >= 1_000 ? "warn" : "fail",
      detail: `$${gecko.reserveUsd.toFixed(0)} pool reserve`,
      source: "geckoterminal",
    });
  }

  if (rug?.ok) {
    const score = rug.score;
    evidence.push({
      id: "solana_rugcheck_score",
      label: "RugCheck score",
      status:
        score == null ? "info" : score >= 70 ? "pass" : score >= 40 ? "warn" : "fail",
      detail: score != null ? `Score ${score}/100` : "Score unavailable",
      source: "rugcheck",
    });

    if (rug.rugged) {
      evidence.push({
        id: "solana_rugcheck_rugged",
        label: "RugCheck rugged flag",
        status: "fail",
        detail: "Token flagged as rugged",
        source: "rugcheck",
      });
    }

    if (rug.mintAuthority) {
      evidence.push({
        id: "solana_rugcheck_mint",
        label: "RugCheck mint authority",
        status: "warn",
        detail: `Mint authority: ${rug.mintAuthority}`,
        source: "rugcheck",
      });
    }

    if (rug.freezeAuthority) {
      evidence.push({
        id: "solana_rugcheck_freeze",
        label: "RugCheck freeze authority",
        status: "warn",
        detail: `Freeze authority: ${rug.freezeAuthority}`,
        source: "rugcheck",
      });
    }

    for (const risk of rug.risks.slice(0, 6)) {
      const name = asString(risk.name) ?? asString(risk.level) ?? "risk";
      const description = asString(risk.description) ?? name;
      const level = (asString(risk.level) ?? "").toLowerCase();
      evidence.push({
        id: `solana_rugcheck_risk_${name}`,
        label: `RugCheck: ${name}`,
        status: level.includes("danger") || level.includes("critical") || level.includes("high")
          ? "fail"
          : level.includes("warn")
            ? "warn"
            : "info",
        detail: description,
        source: "rugcheck",
      });
    }
  }

  if (goplus?.ok && goplus.raw) {
    const isMintable = asString(goplus.raw.is_mintable);
    const canFreeze = asString(goplus.raw.freezable) ?? asString(goplus.raw.closable);
    const balanceMutable = asString(goplus.raw.balance_mutable_authority);
    if (isMintable === "1") {
      evidence.push({
        id: "solana_goplus_mintable",
        label: "GoPlus mintable",
        status: "warn",
        detail: "Token reported as mintable",
        source: "goplus",
      });
    }
    if (canFreeze === "1") {
      evidence.push({
        id: "solana_goplus_freezable",
        label: "GoPlus freezable",
        status: "warn",
        detail: "Token accounts may be freezable/closable",
        source: "goplus",
      });
    }
    if (balanceMutable === "1") {
      evidence.push({
        id: "solana_goplus_balance_mutable",
        label: "GoPlus balance mutable",
        status: "fail",
        detail: "Balance mutable authority enabled",
        source: "goplus",
      });
    }
  }

  if (helius?.ok) {
    evidence.push({
      id: "solana_helius_identity",
      label: "Helius identity",
      status: "info",
      detail: [helius.name, helius.symbol].filter(Boolean).join(" / ") || "Asset resolved",
      source: "helius",
    });
  }

  return evidence;
}

export const solanaAdapter: ChainAdapter = {
  chain: "solana",
  displayName: "Solana",
  nativeSymbol: "SOL",
  addressExamples: ["So11111111111111111111111111111111111111112"],

  normalizeAddress(address: string) {
    try {
      return new PublicKey(address.trim()).toBase58();
    } catch {
      return address.trim();
    }
  },

  isValidAddress(address: string) {
    try {
      const key = new PublicKey(address.trim());
      return Boolean(key);
    } catch {
      return false;
    }
  },

  async getTokenIdentity(address: string): Promise<TokenIdentity> {
    const normalized = this.normalizeAddress(address);
    const [mint, onchainMeta, metadata, dexPairs, rug, goplus, helius] =
      await Promise.all([
        getMintSnapshot(normalized),
        getOnchainMetadata(normalized),
        getTokenMetadata("solana", normalized),
        getDexscreenerPairsByToken("solana", normalized),
        getRugCheckReport(normalized),
        getGoPlusTokenSecurity("solana", normalized),
        getHeliusAsset(normalized),
      ]);

    const pair = dexPairs[0] ?? null;
    const gecko = pair?.pairAddress
      ? await getGeckoTerminalPool("solana", pair.pairAddress)
      : { ok: false as const, error: "no_pair" };

    const twitter = resolveTokenTwitter({
      metadata,
      dexscreener: pair,
      geckoterminal: gecko.ok ? gecko : null,
    });

    const icons = uniqueStrings([
      metadata.iconUrl,
      helius.iconUrl,
      pair?.info?.imageUrl,
      asString(goplus.raw?.image_url),
      asString(goplus.raw?.token_logo),
      gecko.ok ? gecko.imageUrl : null,
    ]);

    return {
      chain: "solana",
      address: normalized,
      network: NETWORK,
      name:
        metadata.name ??
        onchainMeta?.name ??
        helius.name ??
        asString(goplus.raw?.token_name) ??
        pair?.baseToken?.name ??
        null,
      symbol:
        metadata.symbol ??
        onchainMeta?.symbol ??
        helius.symbol ??
        asString(goplus.raw?.token_symbol) ??
        pair?.baseToken?.symbol ??
        null,
      decimals: mint?.decimals ?? metadata.decimals ?? null,
      iconUrl: icons[0] ?? null,
      iconUrls: icons,
      websites: uniqueStrings([
        ...(metadata.websites ?? []),
        ...(pair?.info?.websites?.map((w) => w.url) ?? []),
        gecko.ok ? gecko.website : null,
      ]),
      socials: uniqueStrings([
        ...(metadata.socials ?? []),
        ...(pair?.info?.socials?.map((s) => s.url) ?? []),
        gecko.ok ? gecko.twitter : null,
        gecko.ok ? gecko.telegram : null,
        gecko.ok ? gecko.discord : null,
      ]),
      twitterUrl: twitter.twitterUrl,
      twitterHandle: twitter.twitterHandle,
      hasMintAuthority: Boolean(mint?.mintAuthority),
      hasFreezeAuthority: Boolean(mint?.freezeAuthority),
      mintAuthority: mint?.mintAuthority ?? rug.mintAuthority ?? null,
      freezeAuthority: mint?.freezeAuthority ?? rug.freezeAuthority ?? null,
      updateAuthority: onchainMeta?.updateAuthority ?? metadata.updateAuthority ?? null,
      metadataMutable: onchainMeta?.isMutable ?? metadata.isMutable,
      metadataUri: onchainMeta?.uri ?? metadata.uri ?? helius.metadataUri ?? null,
      isInitialized: mint?.isInitialized ?? null,
      tokenProgram: await detectTokenProgram(normalized),
      riskFlags: uniqueStrings([
        mint?.mintAuthority ? "mint_authority_active" : null,
        mint?.freezeAuthority ? "freeze_authority_active" : null,
        onchainMeta?.isMutable ? "metadata_mutable" : null,
        rug.rugged ? "rugcheck_rugged" : null,
      ]),
    };
  },

  async getTokenomics(address: string): Promise<TokenomicsSnapshot> {
    const normalized = this.normalizeAddress(address);
    const [mint, dexPairs, rug, holders] = await Promise.all([
      getMintSnapshot(normalized),
      getDexscreenerPairsByToken("solana", normalized),
      getRugCheckReport(normalized),
      getLargestHolders(normalized),
    ]);

    const pair = dexPairs[0] ?? null;
    const gecko = pair?.pairAddress
      ? await getGeckoTerminalPool("solana", pair.pairAddress)
      : null;

    const supply =
      mint && Number(mint.supply) > 0
        ? Number(mint.supply) / 10 ** mint.decimals
        : null;

    return {
      chain: "solana",
      address: normalized,
      network: NETWORK,
      totalSupply: supply,
      circulatingSupply: supply,
      priceUsd: asNumber(pair?.priceUsd) ?? (gecko?.ok ? gecko.priceUsd : null),
      liquidityUsd:
        asNumber(pair?.liquidity?.usd) ?? (gecko?.ok ? gecko.reserveUsd : null),
      fdvUsd: asNumber(pair?.fdv) ?? asNumber(pair?.marketCap),
      volume24hUsd: asNumber(pair?.volume?.h24),
      pairAddress: pair?.pairAddress ?? null,
      dexId: pair?.dexId ?? null,
      holderConcentration: holders ?? (rug.ok ? rug.holderConcentration : null),
    };
  },

  async getScanEvidence(address: string): Promise<ScanEvidence[]> {
    const normalized = this.normalizeAddress(address);
    const [mint, metadata, dexPairs, rug, goplus, helius] = await Promise.all([
      getMintSnapshot(normalized),
      getTokenMetadata("solana", normalized),
      getDexscreenerPairsByToken("solana", normalized),
      getRugCheckReport(normalized),
      getGoPlusTokenSecurity("solana", normalized),
      getHeliusAsset(normalized),
    ]);

    const pair = dexPairs[0] ?? null;
    const gecko = pair?.pairAddress
      ? await getGeckoTerminalPool("solana", pair.pairAddress)
      : { ok: false as const, error: "no_pair" };

    return buildEvidence({
      mint,
      metadata,
      dexscreener: pair,
      gecko,
      rugcheck: rug,
      goplus,
      helius,
    });
  },
};
