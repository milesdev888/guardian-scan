import { NextResponse } from "next/server";
import type { GuardianReport } from "@/lib/guardian/types";

const PRICE = process.env.X402_PRICE ?? "$0.01";
const NETWORK = process.env.X402_NETWORK ?? "eip155:8453";
const PAY_TO =
  process.env.X402_PAY_TO_EVM ?? "0x0000000000000000000000000000000000000000";
const REQUIRE_PAYMENT = process.env.X402_REQUIRE_PAYMENT === "true";

export type PaidRoute = {
  path: string;
  method: "GET";
  description: string;
  input: Record<string, unknown>;
  inputSchema: {
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  outputExample: unknown;
};

export const PAID_ROUTES: PaidRoute[] = [
  {
    path: "/api/scan/evm/{chain}/{address}",
    method: "GET",
    description:
      "Guardian EVM scan: verified source, proxy, owner privileges, transfer tax, honeypot buy→sell simulation, LP lock/burn, top-10 holders, contract age, deployer age, same-ticker copycats. Grades and patterns, not a verdict.",
    input: { chain: "ethereum", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    inputSchema: {
      properties: {
        chain: {
          type: "string",
          description: "ethereum | base | arbitrum | robinhood",
        },
        address: { type: "string", description: "0x-prefixed 40-hex contract address" },
      },
      required: ["chain", "address"],
    },
    outputExample: {
      schema: "guardian.report.v2",
      grade: "B",
      headline: "proxy / upgradeable · owner privileges still live",
    },
  },
  {
    path: "/api/scan/solana/{address}",
    method: "GET",
    description:
      "Guardian Solana scan with the same report schema as EVM: authorities, transfer fee, LP lock, holders, age, same-ticker copycats.",
    input: { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
    inputSchema: {
      properties: {
        address: { type: "string", description: "Solana mint (base58)" },
      },
      required: ["address"],
    },
    outputExample: {
      schema: "guardian.report.v2",
      grade: "C",
    },
  },
  {
    path: "/api/scan/xrpl/{issuer}",
    method: "GET",
    description:
      "Guardian XRPL scan: issuer blackhole (mint analogue), Global Freeze / No Freeze, TransferRate, trust-line holders, Domain + xrp-ledger.toml, XLS-30 AMM LP tiers. Query currency for issued tokens (USD, RLUSD, …). No honeypot sim — it does not apply on XRPL mainnet.",
    input: {
      issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
      currency: "RLUSD",
    },
    inputSchema: {
      properties: {
        issuer: { type: "string", description: "XRPL classic address (r…)" },
        currency: {
          type: "string",
          description: "Issued currency code (USD, RLUSD, or 160-bit hex). Omit to scan a single-issuance account or the account itself.",
        },
      },
      required: ["issuer"],
    },
    outputExample: {
      schema: "guardian.report.v2",
      grade: "B",
    },
  },
];

function bazaarExtension(route: PaidRoute) {
  return {
    bazaar: {
      info: {
        input: route.input,
        inputSchema: {
          type: "object",
          properties: route.inputSchema.properties,
          required: route.inputSchema.required,
        },
        output: { example: route.outputExample },
      },
    },
  };
}

export function paymentRequiredBody(route: PaidRoute, resourceUrl: string) {
  return {
    x402Version: 2,
    error: "PAYMENT_REQUIRED",
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        price: PRICE,
        payTo: PAY_TO,
        extra: { name: "Guardian Scan", version: "2" },
      },
    ],
    resource: {
      url: resourceUrl,
      description: route.description,
      mimeType: "application/json",
    },
    description: route.description,
    mimeType: "application/json",
    extensions: bazaarExtension(route),
    bazaar: {
      status: REQUIRE_PAYMENT ? "ready-for-settlement" : "declared-not-listed",
      note: REQUIRE_PAYMENT
        ? "Complete one successful settlement through the CDP facilitator to index this resource on Bazaar."
        : "Set X402_REQUIRE_PAYMENT=true and X402_PAY_TO_EVM, then settle once to list on Bazaar.",
    },
  };
}

export function catalogPayload() {
  return {
    product: "Guardian Multichain Scan",
    version: 2,
    x402Version: 2,
    requirePayment: REQUIRE_PAYMENT,
    price: PRICE,
    network: NETWORK,
    payTo: PAY_TO,
    bazaar: {
      listWhenStable: true,
      listed: false,
      instruction:
        "Resources appear in the x402 Bazaar after a successful facilitator settlement with declareDiscovery-compatible extensions.",
    },
    resources: PAID_ROUTES.map((route) => ({
      ...route,
      accepts: [{ scheme: "exact", network: NETWORK, price: PRICE, payTo: PAY_TO }],
      extensions: bazaarExtension(route),
    })),
  };
}

export function findPaidRoute(pathname: string): PaidRoute | undefined {
  if (/^\/api\/scan\/evm\/[^/]+\/[^/]+$/.test(pathname)) {
    return PAID_ROUTES[0];
  }
  if (/^\/api\/scan\/solana\/[^/]+$/.test(pathname)) {
    return PAID_ROUTES[1];
  }
  if (/^\/api\/scan\/xrpl\/[^/]+$/.test(pathname)) {
    return PAID_ROUTES[2];
  }
  return undefined;
}

export function hasPaymentHeader(request: Request) {
  return Boolean(
    request.headers.get("payment-signature") ||
      request.headers.get("x-payment") ||
      request.headers.get("PAYMENT-SIGNATURE"),
  );
}

export function maybeRequirePayment(request: Request, pathname: string) {
  const route = findPaidRoute(pathname);
  if (!route) return null;
  if (!REQUIRE_PAYMENT) return null;
  if (hasPaymentHeader(request)) return null;
  const url = new URL(request.url);
  return NextResponse.json(paymentRequiredBody(route, `${url.origin}${pathname}`), {
    status: 402,
    headers: {
      "Cache-Control": "no-store",
      "PAYMENT-REQUIRED": "true",
    },
  });
}

export function withX402Headers(response: NextResponse, report?: GuardianReport) {
  response.headers.set("X-Guardian-Schema", "guardian.report.v2");
  if (report) response.headers.set("X-Guardian-Grade", report.grade);
  return response;
}
