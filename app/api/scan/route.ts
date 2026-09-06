import { runScan } from "@/lib/scan";
import { jsonWithCors, optionsWithCors } from "@/lib/cors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

async function scanFrom(request: Request, address: string, chain?: string, currency?: string) {
  if (!address) {
    return jsonWithCors(
      request,
      { kind: "error", error: "Paste a contract or mint address." },
      { status: 400 },
    );
  }
  try {
    const result = await runScan({ address, chain, currency });
    const status = result.kind === "error" ? 400 : 200;
    return jsonWithCors(request, result, { status });
  } catch (error) {
    return jsonWithCors(
      request,
      {
        kind: "error",
        error: error instanceof Error ? error.message : "Scan failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  const chain = url.searchParams.get("chain")?.trim() || undefined;
  const currency = url.searchParams.get("currency")?.trim() || undefined;
  return scanFrom(request, address, chain, currency);
}

export async function POST(request: Request) {
  let body: { address?: string; chain?: string; currency?: string } = {};
  try {
    body = (await request.json()) as { address?: string; chain?: string; currency?: string };
  } catch {
    return jsonWithCors(
      request,
      { kind: "error", error: "Send JSON with an address field." },
      { status: 400 },
    );
  }
  if (!body.address || typeof body.address !== "string") {
    return jsonWithCors(
      request,
      { kind: "error", error: "Paste a contract or mint address." },
      { status: 400 },
    );
  }
  return scanFrom(request, body.address, body.chain, body.currency);
}
