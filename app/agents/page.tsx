import Link from "next/link";
import { PAID_ROUTES } from "@/lib/x402/protocol";
import { listPublicChains } from "@/lib/chains/config";

export default function AgentsPage() {
  const chains = listPublicChains();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs tracking-[0.22em] text-primary uppercase">x402</p>
      <h1 className="font-heading mt-2 text-4xl">Agent endpoints</h1>
      <p className="mt-3 text-muted-foreground">
        The web scanner at <Link href="/app">/app</Link> is unpaid. Agents call the mirrored
        routes below. Set <code className="font-mono text-xs">X402_REQUIRE_PAYMENT=true</code> and
        a pay-to address when you are ready to settle; resources index on Bazaar after the first
        successful facilitator settlement.
      </p>

      <div className="mt-8 space-y-4">
        {PAID_ROUTES.map((route) => (
          <div key={route.path} className="rounded-xl border border-border/70 bg-card/60 p-4">
            <p className="font-mono text-sm text-primary">
              {route.method} {route.path}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{route.description}</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-secondary/60 p-3 font-mono text-xs">
              {JSON.stringify(route.input, null, 2)}
            </pre>
          </div>
        ))}
      </div>

      <h2 className="font-heading mt-10 text-2xl">Configured chains</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {chains.map((chain) => (
          <li key={chain.id} className="flex justify-between gap-3 border-b border-border/50 py-2">
            <span>
              {chain.name}{" "}
              <span className="text-muted-foreground">
                ({chain.family}
                {chain.chainId ? ` ${chain.chainId}` : ""})
              </span>
            </span>
            <span className="text-muted-foreground">{chain.rollout}</span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-muted-foreground">
        Machine catalog:{" "}
        <Link href="/api/x402/catalog" className="text-primary hover:underline">
          /api/x402/catalog
        </Link>
      </p>
    </div>
  );
}
