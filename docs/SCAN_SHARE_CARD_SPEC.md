# SCAN SHARE CARD SPEC

Endpoint: `GET /api/card/<mint>.png` on scan.cyre.dev  
Size: **1600×1067** PNG  

OG / social unfurl: `GET /api/card/<mint>/og.png` — long edge **~1024px**, target **under 300KB**.  
Wire `og:image` / `twitter:image` on report pages to the **og** URL (not full-res).

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
| AA | metallic platinum | mid `#E5E4E2` — vertical metal sheen + “platinum” wordmark; see `lib/guardian/aa-platinum.ts` |
| A | gold | `#E8C56A` |
| B | ice | `#5FD0FF` |
| C | grey | `#9AA4B2` |
| D / F | amber | `#E09A3C` |

**AA (Platinum)** is awarded only when **all** hold: composite ≥ 90, on-chain age ≥ 365 days, LP tier PERMANENT/BURNED **or** Established-path liquidity (≥$100K across ≥3 independent pools, no majority), mint + freeze authorities revoked, zero fraud flags. Display `Grade AA · composite N/100` with the shared metallic platinum treatment (`aa-platinum.ts` / Cyre `brand/aa-platinum.js`). If any gate fails, grade is **A at best** — never round up from score alone.

**Red is reserved exclusively for fraud chips and revocation — never for a low grade.**

## LP line wording

| Condition | Line | Tone |
|-----------|------|------|
| PERMANENT / burned | `LP PERMANENT · 100% locked` | green |
| Timed lock | `LP LOCKED · until <YYYY-MM-DD>` | gold |
| Established path (badge) **or** deep distributed liquidity (≥3 independent pools, **≥$1M** combined depth — `DISTRIBUTED_LIQUIDITY_MIN_*` in `lib/guardian/grade.ts`) | `LIQUIDITY DISTRIBUTED · N independent pools` | gold — **never** “weak” / “unlocked”; chip **DISTRIBUTED LIQUIDITY** |
| Non-qualifying unlocked | `LP UNLOCKED` | amber — chip **LP UNLOCKED**; headline **Weak LP lock** only for young/thin single-pool unlocks |
| Unverified reported lock | `LP UNVERIFIED · <pct>% reported` (pct or `—`) | amber |

Use **“locked”**, never **“secured”**.

## Chips

Closed vocabulary in `lib/card/chips.ts`. Max **4**. Risk/fraud chips always precede positive chips. Deterministic mapping from scan checks / patterns / badge status — see `mapShareCardChips`.

Numerics: every `.toFixed` path uses `asFiniteNumber` / `safeToFixed` — a card must never render `NaN`; missing numeric → `—`.

## Tests

See `lib/card/share-card.test.ts`.
