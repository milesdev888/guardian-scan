import { getEvmChain } from "../lib/chains/config";
import { fetchExplorerCreation } from "../lib/sources/explorer";
import { daysAgo, formatAge } from "../lib/guardian/grade";

async function main() {
  const eth = getEvmChain("ethereum");
  if (!eth) throw new Error("no eth");
  for (const [name, addr] of [
    ["LINK", "0x514910771AF9Ca656af840dff83E8264EcF986CA"],
    ["RAIN", "0x6BA6B0002F0566364221b0b582C39C876718E8bC"],
    ["RLUSD", "0x8292bb45bf1ee4d140127049757c2e0ff06317ed"],
  ] as const) {
    const r = await fetchExplorerCreation(eth, addr);
    const age = daysAgo(r.data?.timestamp ?? null);
    console.log(
      JSON.stringify({
        name,
        address: addr,
        iso: r.data?.timestamp ? new Date(r.data.timestamp).toISOString() : null,
        ageDays: age,
        formatAge: formatAge(r.data?.timestamp ?? null),
        years: age != null ? +(age / 365).toFixed(1) : null,
        error: r.error ?? null,
      }),
    );
  }
  // grammar unit
  const oneHourAgo = Date.now() - 3600_000;
  const fa = formatAge(oneHourAgo);
  if (fa !== "1 hour") throw new Error(`expected '1 hour', got ${fa}`);
  console.log(JSON.stringify({ grammar: "ok", formatAge_1h: fa }));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
