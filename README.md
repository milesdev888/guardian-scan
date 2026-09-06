# Guardian Multichain Scan

Paste-first token scanner for **Solana**, **Ethereum**, **Base**, **Arbitrum**, **Robinhood Chain**, and **XRPL**.

Guardian reports **grades and patterns**, not verdicts. A high grade is not an endorsement. A low grade is not a finding of fraud.

## How it works

Paste an address. There is no chain dropdown first — that is a brand promise.

- Base58 (32–44 chars) → **SolanaAdapter**
- `0x` + 40 hex → **EvmAdapter**, which probes every configured EVM chain and scans where bytecode exists
- Classic `r…` (checksummed, 25–35 chars) → **XRPLAdapter**. Longer `r…` strings that fail the XRPL checksum can still be Solana.

The chain row under the paste box is a billboard. Tapping a chain shows example chips and an address-format hint. It never filters or gates the paste box.

XRPL issued tokens are a **currency + issuer** pair. Paste an issuer: multiple currencies → pick one; one currency → report immediately; nothing issued → account report (blackhole, freeze flags). XRPL is not EVM — signals are protocol-level flags from public nodes (`https://xrplcluster.com`, no API keys). Honeypot simulation is omitted.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317/app](http://127.0.0.1:4317/app).

## HTTP API

```bash
curl -X POST http://127.0.0.1:4317/api/scan \
  -H 'content-type: application/json' \
  -d '{"address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"}'

curl 'http://127.0.0.1:4317/api/scan?address=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De&currency=RLUSD'
```

x402 agent routes:

- `GET /api/scan/evm/{chain}/{address}`
- `GET /api/scan/solana/{address}`
- `GET /api/scan/xrpl/{issuer}?currency=`
- Catalog: `GET /api/x402/catalog`

Live on Render: [guardian-scan.onrender.com](https://guardian-scan.onrender.com)

Source: [github.com/milesdev888/guardian-scan](https://github.com/milesdev888/guardian-scan)
