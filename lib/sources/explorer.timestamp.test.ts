import assert from "node:assert/strict";
import {
  parseExplorerTimestamp,
  sanitizeTimestampMs,
} from "./explorer";

assert.equal(sanitizeTimestampMs(null), null);
assert.equal(sanitizeTimestampMs(0), null);
assert.equal(sanitizeTimestampMs(1e47), null); // hex-hash-as-number garbage
assert.equal(sanitizeTimestampMs(3.82e76), null);

const linkMs = Date.parse("2017-09-16T21:26:29.000Z");
assert.equal(sanitizeTimestampMs(linkMs), linkMs);
assert.equal(sanitizeTimestampMs(Math.floor(linkMs / 1000)), linkMs); // seconds

assert.equal(parseExplorerTimestamp("0x5488510df045770efbff57f25d0c6d2c1404d58c1199b21eb8dc5072b22d91d7"), null);
assert.equal(parseExplorerTimestamp("2017-09-16T21:26:29.000000Z"), linkMs);
assert.equal(parseExplorerTimestamp(1505597189), linkMs);

console.log("explorer.timestamp.test.ts ok");
