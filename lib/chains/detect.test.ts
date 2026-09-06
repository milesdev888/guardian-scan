import assert from "node:assert/strict";
import {
  detectFamily,
  isEvmAddress,
  isSolanaAddress,
  isXrplAddress,
  splitXrplTokenId,
  xrplTokenId,
} from "./detect";

const BITSTAMP = "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B";
const RLUSD = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const C7 = "979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const ZERO = "rrrrrrrrrrrrrrrrrrrrBZbvji";

assert.equal(isXrplAddress(BITSTAMP), true);
assert.equal(isXrplAddress(RLUSD), true);
assert.equal(isXrplAddress(ZERO), true);
assert.equal(isXrplAddress(C7), false);
assert.equal(isXrplAddress(USDC), false);
assert.equal(isXrplAddress("rnotavalidchecksumaddressxxxxx"), false);

assert.equal(isSolanaAddress(C7), true);
assert.equal(isSolanaAddress(BITSTAMP), false);
assert.equal(isEvmAddress(USDC), true);

const xrpl = detectFamily(BITSTAMP);
assert.equal(xrpl.family, "xrpl");
if (xrpl.family === "xrpl") assert.equal(xrpl.address, BITSTAMP);

const withCurrency = detectFamily(`${RLUSD}:RLUSD`);
assert.equal(withCurrency.family, "xrpl");
if (withCurrency.family === "xrpl") {
  assert.equal(withCurrency.address, RLUSD);
  assert.equal(withCurrency.currency, "RLUSD");
}

assert.equal(detectFamily(C7).family, "solana");
assert.equal(detectFamily(USDC).family, "evm");
assert.equal(detectFamily("").family, null);

assert.deepEqual(splitXrplTokenId(`${BITSTAMP}:USD`), { issuer: BITSTAMP, currency: "USD" });
assert.equal(xrplTokenId(BITSTAMP, "USD"), `${BITSTAMP}:USD`);

console.log("ok detect");
