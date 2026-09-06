import assert from "node:assert/strict";
import {
  assessBlackhole,
  currenciesMatch,
  decodeCurrency,
  decodeHexAscii,
  domainHost,
  hasFlag,
  isBlackholeAddress,
  LSF_DISABLE_MASTER,
  LSF_GLOBAL_FREEZE,
  LSF_NO_FREEZE,
  tomlNamesIssuer,
  transferRatePct,
} from "./xrpl";

assert.equal(isBlackholeAddress("rrrrrrrrrrrrrrrrrrrrBZbvji"), true);
assert.equal(isBlackholeAddress("rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ"), false);

assert.equal(hasFlag(0xb80000, LSF_DISABLE_MASTER), true);
assert.equal(hasFlag(0xb80000, LSF_NO_FREEZE), true);
assert.equal(hasFlag(0xb80000, LSF_GLOBAL_FREEZE), false);

assert.equal(transferRatePct(undefined), 0);
assert.equal(transferRatePct(1_000_000_000), 0);
assert.equal(Number(transferRatePct(1_001_500_000).toFixed(2)), 0.15);
assert.equal(Number(transferRatePct(1_010_000_000).toFixed(0)), 1);

assert.equal(decodeHexAscii("6269747374616D702E6E6574"), "bitstamp.net");
assert.equal(domainHost("68747470733A2F2F726970706C652E636F6D2F"), "ripple.com");
assert.equal(domainHost("bitstamp.net"), "bitstamp.net");

assert.equal(decodeCurrency("USD"), "USD");
assert.equal(decodeCurrency("524C555344000000000000000000000000000000"), "RLUSD");
assert.equal(currenciesMatch("RLUSD", "524C555344000000000000000000000000000000"), true);

const holed = assessBlackhole({
  flags: LSF_DISABLE_MASTER | LSF_NO_FREEZE,
  regularKey: "rrrrrrrrrrrrrrrrrrrrBZbvji",
  signerList: false,
});
assert.equal(holed.blackholed, true);

const rlusdStyle = assessBlackhole({
  flags: LSF_DISABLE_MASTER,
  regularKey: null,
  signerList: false,
});
assert.equal(rlusdStyle.blackholed, true);

const bitstampStyle = assessBlackhole({
  flags: LSF_DISABLE_MASTER,
  regularKey: "rUUs1jns6tdUQwAABDJyHMUHvdGNvNADvJ",
  signerList: false,
});
assert.equal(bitstampStyle.blackholed, false);
assert.equal(bitstampStyle.regularKeyUsable, true);

const signerEscape = assessBlackhole({
  flags: LSF_DISABLE_MASTER,
  regularKey: null,
  signerList: true,
});
assert.equal(signerEscape.blackholed, false);

const toml = `
[[ISSUERS]]
address = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"
name = "RLUSD"
[[TOKENS]]
issuer = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"
currency = "RLUSD"
`;
assert.deepEqual(tomlNamesIssuer(toml, "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", "RLUSD"), {
  namedIssuer: true,
  namedToken: true,
});
assert.equal(tomlNamesIssuer(toml, "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B", "USD").namedIssuer, false);

console.log("ok xrpl flags");
