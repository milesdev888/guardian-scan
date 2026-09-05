const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function normalizeAddress(input: string): string {
  return input.trim();
}

export function isEvmAddress(input: string): boolean {
  return EVM_RE.test(input.trim());
}

export function isSolanaAddress(input: string): boolean {
  const value = input.trim();
  if (value.startsWith("0x")) return false;
  return BASE58_RE.test(value);
}

export function detectFamily(
  input: string,
): { family: "evm" | "solana"; address: string } | { family: null; error: string } {
  const address = normalizeAddress(input);
  if (!address) {
    return { family: null, error: "Paste a contract or mint address." };
  }
  if (isEvmAddress(address)) {
    return { family: "evm", address };
  }
  if (isSolanaAddress(address)) {
    return { family: "solana", address };
  }
  if (address.startsWith("0x")) {
    return {
      family: null,
      error: "That looks like an EVM address, but it is not 40 hex characters after 0x.",
    };
  }
  return {
    family: null,
    error:
      "Could not detect a chain from that string. Solana mints are base58; EVM contracts are 0x plus 40 hex characters.",
  };
}

export function checksumHint(address: string): string {
  return isEvmAddress(address) ? address.toLowerCase() : address;
}
