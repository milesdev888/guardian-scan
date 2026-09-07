# SCAN SHARE CARD SPEC

Endpoint: `GET /api/card/<mint>.png` on scan.cyre.dev  
Size: **1600×1067** PNG  
Source of truth: latest **stored** Guardian scan (re-scan if none or older than 24h).  
Serving discipline: same as `/api/seal/<serial>.png` — path param is a lookup key only; **all painted text comes from stored records**, never from URL query params.

## Layout

1. **Top-left mark**
   - Valid badge for this mint → Guardian Verified **medallion**
   - Otherwise (including REVOKED) → flat gold **G** mark
2. **Top (name block)** — token name + `$ticker`, chain beneath
3. **Grade line** — `Grade X · composite N/100` (missing score → `—`)
4. **LP status line** — lock icon + wording below
5. **Full mint** — monospace
6. **Up to 4 pattern chips** — fixed vocabulary only
7. **Footer (verbatim on every card)** — `Guardian reports grades and on-chain patterns, not a verdict.`
8. **QR** — bottom-right → full report URL (`/app?address=<mint>`)

## Grade colors

| Grade | Color | Hex |
|-------|-------|-----|
| A | gold | `#E8C56A` |
| B | ice | `#5FD0FF` |
| C | grey | `#9AA4B2` |
| D / F | amber | `#E09A3C` |

**Red is reserved exclusively for fraud chips and revocation — never for a low grade.**

## LP line wording

| Condition | Line | Tone |
|-----------|------|------|
| PERMANENT / burned | `LP PERMANENT · 100% locked` | green |
| Timed lock | `LP LOCKED · until <YYYY-MM-DD>` | gold |
| Established path (badge) | `LIQUIDITY DISTRIBUTED · N independent pools` | gold — **never** the word “unlocked” |
| Non-qualifying unlocked | `LP UNLOCKED` | amber |
| Unverified reported lock | `LP UNVERIFIED · <pct>% reported` (pct or `—`) | amber |

Use **“locked”**, never **“secured”**.

## Chips

Closed vocabulary in `lib/card/chips.ts`. Max **4**. Risk/fraud chips always precede positive chips. Deterministic mapping from scan checks / patterns / badge status — see `mapShareCardChips`.

Numerics: every `.toFixed` path uses `asFiniteNumber` / `safeToFixed` — a card must never render `NaN`; missing numeric → `—`.

## Tests

See `lib/card/share-card.test.ts`.
