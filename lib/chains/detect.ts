import { createHash } from "node:crypto";

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const RIPPLE_ALPHABET = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz";

export type Detected =
  | { family: "evm" | "solana" | "xrpl"; address: string; currency?: string }
  | { family: null; error: string };

export function normalizeAddress(input: string): string {
  return input.trim();
}

export function isEvmAddress(input: string): boolean {
  return EVM_RE.test(input.trim());
}

export function isXrplAddress(input: string): boolean {
  const value = input.trim();
  if (!value.startsWith("r")) return false;
  if (value.length < 25 || value.length > 35) return false;
  for (const ch of value) {
    if (!RIPPLE_ALPHABET.includes(ch)) return false;
  }
  const decoded = decodeRippleBase58(value);
  if (!decoded || decoded.length !== 25) return false;
  if (decoded[0] !== 0x00) return false;
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  const digest = sha256(sha256(payload)).subarray(0, 4);
  return checksum.equals(digest);
}

export function isSolanaAddress(input: string): boolean {
  const value = input.trim();
  if (value.startsWith("0x")) return false;
  if (isXrplAddress(value)) return false;
  return BASE58_RE.test(value);
}

export function splitXrplTokenId(input: string): { issuer: string; currency?: string } | null {
  const trimmed = input.trim();
  const colon = trimmed.lastIndexOf(":");
  if (colon > 0) {
    const issuer = trimmed.slice(0, colon);
    const currency = trimmed.slice(colon + 1).trim();
    if (isXrplAddress(issuer) && currency) return { issuer, currency };
  }
  if (isXrplAddress(trimmed)) return { issuer: trimmed };
  return null;
}

export function xrplTokenId(issuer: string, currency?: string | null) {
  return currency ? `${issuer}:${currency}` : issuer;
}

export function detectFamily(input: string): Detected {
  const raw = normalizeAddress(input);
  if (!raw) {
    return { family: null, error: "Paste a contract, mint, or XRPL classic address." };
  }

  const xrpl = splitXrplTokenId(raw);
  if (xrpl) {
    return { family: "xrpl", address: xrpl.issuer, currency: xrpl.currency };
  }

  if (isEvmAddress(raw)) {
    return { family: "evm", address: raw };
  }
  if (isSolanaAddress(raw)) {
    return { family: "solana", address: raw };
  }
  if (raw.startsWith("0x")) {
    return {
      family: null,
      error: "That looks like an EVM address, but it is not 40 hex characters after 0x.",
    };
  }
  if (raw.startsWith("r") && raw.length >= 25 && raw.length <= 35) {
    return {
      family: null,
      error: "That looks like an XRPL classic address, but the checksum did not match.",
    };
  }
  return {
    family: null,
    error:
      "Could not detect a chain from that string. Solana mints are base58; EVM contracts are 0x plus 40 hex characters; XRPL classic addresses start with r.",
  };
}

export function checksumHint(address: string): string {
  if (isEvmAddress(address)) return address.toLowerCase();
  return address;
}

function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest();
}

function decodeRippleBase58(value: string): Buffer | null {
  let zeros = 0;
  while (zeros < value.length && value[zeros] === RIPPLE_ALPHABET[0]) zeros += 1;

  const size = Math.ceil((value.length * Math.log(58)) / Math.log(256)) + 1;
  const bytes = new Uint8Array(size);
  for (const ch of value) {
    let carry = RIPPLE_ALPHABET.indexOf(ch);
    if (carry < 0) return null;
    for (let i = bytes.length - 1; i >= 0; i -= 1) {
      carry += 58 * bytes[i];
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    if (carry) return null;
  }

  let idx = 0;
  while (idx < bytes.length && bytes[idx] === 0) idx += 1;
  const out = Buffer.alloc(zeros + (bytes.length - idx));
  bytes.subarray(idx).forEach((byte, i) => {
    out[zeros + i] = byte;
  });
  return out;
}
