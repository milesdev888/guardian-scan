# Guardian Multichain Scan

Paste-first token scanner for **Solana**, **Ethereum**, **Base**, **Arbitrum**, and **Robinhood Chain**.

Guardian reports **grades and patterns**, not verdicts. A high grade is not an endorsement. A low grade is not a finding of fraud.

## How it works

Paste an address. There is no chain dropdown first.

- Base58 (32–44 chars) → **SolanaAdapter** (live Solana checks)
- `0x` + 40 hex → **EvmAdapter**, which probes every configured EVM chain and scans where bytecode exists

One `ChainAdapter` interface, two implementations. Per-EVM-chain differences live in config: chain id, RPC URL, explorer URL, DEX list. Adding chain six is a config object, not a new adapter.

## v2 checks (same report on every chain)

- Verified source (EVM explorer / Solana metadata authority)
- Proxy / upgradeable pattern
- Owner privileges (mint, pause, blacklist, fee-change)
- Transfer tax
- Honeypot simulation (buy→sell on Ethereum and Base via Honeypot.is; GoPlus / RugCheck elsewhere)
- LP lock / burn on the chain’s main DEXes
- Holder concentration (top 10)
- Contract age and deployer wallet age
- Same-ticker copycats — oldest and deepest flagged (Solana feature carried onto every EVM chain)

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317/app](http://127.0.0.1:4317/app).

Optional RPC and explorer overrides: copy `.env.example` to `.env.local`.

Public RPCs are the default. They rate-limit. Set your own RPC URLs for production.

## HTTP API

Unpaid UI scan:

```bash
curl -X POST http://127.0.0.1:4317/api/scan \
  -H 'content-type: application/json' \
  -d '{"address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"}'
```

### x402 agent routes

Every check is mirrored for agents:

- `GET /api/scan/evm/{chain}/{address}` — `ethereum` | `base` | `arbitrum` | `robinhood`
- `GET /api/scan/solana/{address}`
- Catalog: `GET /api/x402/catalog`

Payment is off until you set:

```
X402_REQUIRE_PAYMENT=true
X402_PAY_TO_EVM=0xYourAddress
X402_NETWORK=eip155:8453
X402_PRICE=$0.01
```

A route declares Bazaar discovery metadata in its 402 body. It indexes on the x402 Bazaar after one successful facilitator settlement — list it when the Ethereum path is stable.

## Adding another EVM chain

Edit `lib/chains/config.ts`. Add one object: `id`, `chainId`, `rpcUrl`, `explorerUrl`, `explorerApiUrl`, `dexScreenerChain`, optional `goPlusChainId` / `honeypotChainId`, and `dexes`. Then announce it.

Tweet drafts (one per chain):

- Ethereum: *Guardian v2 — Ethereum adapter is live. Same paste-first scan, now for 0x contracts: verified source, proxy, owner privileges, tax/honeypot sim, LP lock, holders, age, copycats.*
- Base: *Guardian now scans Base. Same EVM adapter, new chain config. Paste a Base contract — no dropdown first.*
- Arbitrum: *Guardian on Arbitrum. Config rollout — no new adapter. Copycat ticker search and LP lock checks now cover Arb DEXes.*
- Robinhood Chain: *Guardian on Robinhood Chain (4663). Chain six would still be a config file, not a rewrite.*

## Deploy

Live on Render: [guardian-scan.onrender.com](https://guardian-scan.onrender.com)

This is a standard Next.js app on Vercel — no extra config. From the repo: `npx vercel` (or Import on vercel.com). Optional RPC URLs and `X402_PAY_TO_EVM` can be set as environment variables after the first deploy.

Source: [github.com/milesdev888/guardian-scan](https://github.com/milesdev888/guardian-scan)

The HTTP server binds `0.0.0.0:$PORT`. `render.yaml` is a Render Blueprint (`npm install && npm run build`, then `npm start`). Health check: `/api/health`.

## Out of scope (v2)

Sui, Aptos, and other non-EVM chains beyond Solana. Historical monitoring and alerts — that is Guardian Watch.
