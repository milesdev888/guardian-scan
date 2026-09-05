import type {
  ChainConfig,
  Copycat,
  GuardianReport,
  PresenceMatch,
} from "@/lib/guardian/types";

export interface ChainAdapter {
  family: "solana" | "evm";
  supports(address: string): boolean;
  probe(address: string, chain: ChainConfig): Promise<PresenceMatch>;
  scan(address: string, chain: ChainConfig): Promise<GuardianReport>;
  findCopycats(
    ticker: string,
    chain: ChainConfig,
    excludeAddress: string,
  ): Promise<Copycat[]>;
}
