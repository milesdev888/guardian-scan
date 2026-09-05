/** Account classification for holder concentration + LP attribution. */

export type AccountKind = "liquidity" | "locked" | "burn" | "other";

export type KnownAccount = {
  name?: string | null;
  type?: string | null;
};

export type ClassifiedHolder = {
  address: string;
  owner: string | null;
  percent: number;
  kind: AccountKind;
  tag: string | null;
  locked: boolean | null;
  unlockEnd: string | null;
  label: string | null;
};

const BURN_ADDRESSES = new Set([
  "11111111111111111111111111111111",
  "1nc1nerator11111111111111111111111111111111",
  "dead111111111111111111111111111111111111111",
  "Burn111111111111111111111111111111111111111",
]);

const LOCKER_PROGRAM_IDS = new Set([
  "strmRqUCoQkeZbZyeFyBTvzmU9aNSv1VqdAdybM73Vv", // Streamflow
  "LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn", // Jupiter Lock
]);

const POOL_TYPES = new Set(["AMM", "POOL", "VAULT", "MARKET", "LP"]);

function lookup(
  address: string | null | undefined,
  known: Record<string, KnownAccount>,
): KnownAccount | null {
  if (!address) return null;
  return known[address] ?? null;
}

export function classifyAccount(
  address: string | null | undefined,
  owner: string | null | undefined,
  known: Record<string, KnownAccount> = {},
): { kind: AccountKind; label: string | null } {
  const addr = address || "";
  const own = owner || "";
  if (BURN_ADDRESSES.has(addr) || BURN_ADDRESSES.has(own)) {
    return { kind: "burn", label: "Burn" };
  }

  const ka = lookup(addr, known) || lookup(own, known);
  const type = String(ka?.type || "").toUpperCase();
  const name = String(ka?.name || "");

  if (/BURN|INCINERATOR|DEAD/i.test(name) || type === "BURN") {
    return { kind: "burn", label: ka?.name || "Burn" };
  }

  if (
    type === "LOCKER" ||
    /lock|streamflow|vest|jupiter locker/i.test(name) ||
    LOCKER_PROGRAM_IDS.has(own) ||
    LOCKER_PROGRAM_IDS.has(addr)
  ) {
    const label = /streamflow/i.test(name)
      ? "Locked · Streamflow"
      : /jupiter/i.test(name)
        ? "Locked · Jupiter"
        : ka?.name
          ? `Locked · ${ka.name}`
          : "Locked";
    return { kind: "locked", label };
  }

  if (
    POOL_TYPES.has(type) ||
    /AMM|POOL|VAULT|MARKET|LP|DAMM|DBC|Raydium|Orca|Meteora|Whirlpool/i.test(
      `${type} ${name}`,
    )
  ) {
    return {
      kind: "liquidity",
      label: ka?.name ? `Liquidity · ${ka.name}` : "Liquidity",
    };
  }

  return { kind: "other", label: null };
}

export function classifyHolders(
  rows: Array<{
    address?: string | null;
    owner?: string | null;
    pct?: number | null;
    percent?: number | null;
    insider?: boolean;
    unlockEnd?: string | null;
  }>,
  known: Record<string, KnownAccount> = {},
): ClassifiedHolder[] {
  return rows
    .map((row) => {
      const address = String(row.address || "");
      const owner = row.owner ? String(row.owner) : null;
      const percent = Number(row.pct ?? row.percent ?? NaN);
      const { kind, label } = classifyAccount(address, owner, known);
      const tag =
        kind === "other"
          ? row.insider
            ? "insider"
            : null
          : kind === "liquidity"
            ? "Liquidity"
            : kind === "locked"
              ? "Locked"
              : "Burn";
      return {
        address,
        owner,
        percent: Number.isFinite(percent) ? percent : 0,
        kind,
        tag,
        locked: kind === "locked" ? true : kind === "burn" ? true : null,
        unlockEnd: row.unlockEnd ?? null,
        label,
      };
    })
    .filter((row) => row.address && row.percent > 0);
}

/**
 * Raw top-10 sum vs top-10 after excluding liquidity vaults, lockers, and burns.
 * Grading keys off the adjusted figure.
 */
export function holderConcentration(holders: ClassifiedHolder[]) {
  const top = holders.slice(0, 10);
  const rawTop10 = top.reduce((sum, row) => sum + row.percent, 0);
  const adjusted = top.filter(
    (row) => row.kind !== "liquidity" && row.kind !== "locked" && row.kind !== "burn",
  );
  const adjustedTop10 = adjusted.reduce((sum, row) => sum + row.percent, 0);
  const adjustedTop1 = adjusted[0]?.percent ?? 0;
  return {
    rawTop10: Math.min(100, rawTop10),
    adjustedTop10: Math.min(100, adjustedTop10),
    adjustedTop1: Math.min(100, adjustedTop1),
    adjustedCount: adjusted.length,
    excludedLiquidityPct: top
      .filter((row) => row.kind === "liquidity")
      .reduce((sum, row) => sum + row.percent, 0),
    excludedLockedPct: top
      .filter((row) => row.kind === "locked" || row.kind === "burn")
      .reduce((sum, row) => sum + row.percent, 0),
  };
}

export function gradeHolderConcentration(adjustedTop10: number): {
  grade: "A" | "B" | "C" | "D" | "F";
  status: "pass" | "flag";
} {
  if (adjustedTop10 >= 90) return { grade: "F", status: "flag" };
  if (adjustedTop10 >= 70) return { grade: "D", status: "flag" };
  if (adjustedTop10 >= 50) return { grade: "C", status: "flag" };
  if (adjustedTop10 >= 30) return { grade: "B", status: "pass" };
  return { grade: "A", status: "pass" };
}
