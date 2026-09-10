import { getEvmChain } from "../lib/chains/config";
import { fetchExplorerCreation } from "../lib/sources/explorer";
import { daysAgo, formatAge } from "../lib/guardian/grade";
import { twitterHandleIsVerified, curatedTwitterForAddress } from "../lib/guardian/twitter-handle";

async function main() {
  const eth = getEvmChain("ethereum");
  if (!eth) throw new Error("no eth");
  for (const [name, addr] of [
    ["LINK", "0x514910771AF9Ca656af840dff83E8264EcF986CA"],
    ["AAVE", "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9"],
  ] as const) {
    const r = await fetchExplorerCreation(eth, addr);
    const age = daysAgo(r.data?.timestamp ?? null);
    console.log(
      JSON.stringify({
        name,
        creator: r.data?.creator,
        txHash: r.data?.txHash?.slice(0, 14),
        iso: r.data?.timestamp ? new Date(r.data.timestamp).toISOString() : null,
        ageDays: age,
        formatAge: formatAge(r.data?.timestamp ?? null),
        years: age != null ? +(age / 365).toFixed(1) : null,
        error: r.error ?? null,
        curated: curatedTwitterForAddress(addr),
        tagAllowed: twitterHandleIsVerified(curatedTwitterForAddress(addr)?.source),
      }),
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
