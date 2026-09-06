import type {
  ChainConfig,
  Copycat,
  Family,
  GuardianReport,
  PresenceMatch,
} from "@/lib/guardian/types";

export type ScanOptions = {
  currency?: string;
};

export interface ChainAdapter {
  family: Family;
  supports(address: string): boolean;
  probe(address: string, chain: ChainConfig): Promise<PresenceMatch>;
  scan(address: string, chain: ChainConfig, options?: ScanOptions): Promise<GuardianReport>;
  findCopycats(
    ticker: string,
    chain: ChainConfig,
    excludeAddress: string,
  ): Promise<Copycat[]>;
}
