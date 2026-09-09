import assert from "node:assert/strict";
import {
  composeShareOnXText,
  curatedTwitterForAddress,
  normalizeTwitterHandle,
  pickTwitterHandle,
  twitterHandleIsVerified,
  twitterTagDefaultOn,
} from "./twitter-handle";

assert.equal(normalizeTwitterHandle("https://x.com/Cyredev888"), "@Cyredev888");
assert.equal(normalizeTwitterHandle("https://twitter.com/Uniswap"), "@Uniswap");
assert.equal(normalizeTwitterHandle("@Uniswap"), "@Uniswap");
assert.equal(normalizeTwitterHandle("Uniswap"), "@Uniswap");
assert.equal(normalizeTwitterHandle("https://x.com/Uniswap/status/123"), null);
assert.equal(normalizeTwitterHandle("https://x.com/intent/tweet"), null);
assert.equal(normalizeTwitterHandle(""), null);
assert.equal(normalizeTwitterHandle(null), null);

const meta = pickTwitterHandle([
  { raw: "https://x.com/Cyredev888", source: "token-metadata" },
  { raw: "Other", source: "dexscreener" },
]);
assert.equal(meta?.handle, "@Cyredev888");
assert.equal(meta?.source, "token-metadata");

const dexOnly = pickTwitterHandle([
  { raw: null, source: "token-metadata" },
  { raw: "https://x.com/Uniswap", source: "dexscreener" },
]);
assert.equal(dexOnly?.handle, "@Uniswap");
assert.equal(dexOnly?.source, "dexscreener");

assert.equal(twitterHandleIsVerified("token-metadata"), true);
assert.equal(twitterHandleIsVerified("curated"), true);
assert.equal(twitterHandleIsVerified("dexscreener"), false);
assert.equal(twitterHandleIsVerified("geckoterminal"), false);
assert.equal(twitterHandleIsVerified(null), false);

assert.equal(twitterTagDefaultOn("token-metadata"), true);
assert.equal(twitterTagDefaultOn("curated"), true);
assert.equal(twitterTagDefaultOn("dexscreener"), false);
assert.equal(twitterTagDefaultOn("geckoterminal"), false);
assert.equal(twitterTagDefaultOn(null), false);

const link = curatedTwitterForAddress("0x514910771AF9Ca656af840dff83E8264EcF986CA");
assert.equal(link?.handle, "@chainlink");
assert.equal(link?.source, "curated");
assert.equal(twitterHandleIsVerified(link?.source), true);

assert.equal(
  composeShareOnXText({
    grade: "A",
    scoreText: "91",
    reportUrl: "https://scan.cyre.dev/app?address=x",
    tagHandle: "@Cyredev888",
    tagEnabled: true,
  }),
  "Scanned @Cyredev888 with Guardian — grade A · 91/100\nhttps://scan.cyre.dev/app?address=x",
);

assert.equal(
  composeShareOnXText({
    grade: "A",
    scoreText: "85",
    reportUrl: "https://scan.cyre.dev/app?address=y",
    tagHandle: "@Uniswap",
    tagEnabled: false,
  }),
  "Scanned with Guardian — grade A · 85/100\nhttps://scan.cyre.dev/app?address=y",
);

console.log("twitter-handle.test.ts ok");
