import { NextResponse } from "next/server";
import { runScan } from "@/lib/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { address?: string; chain?: string } = {};
  try {
    body = (await request.json()) as { address?: string; chain?: string };
  } catch {
    return NextResponse.json(
      { kind: "error", error: "Send JSON with an address field." },
      { status: 400 },
    );
  }
  if (!body.address || typeof body.address !== "string") {
    return NextResponse.json(
      { kind: "error", error: "Paste a contract or mint address." },
      { status: 400 },
    );
  }
  try {
    const result = await runScan({
      address: body.address,
      chain: body.chain,
    });
    const status = result.kind === "error" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json(
      {
        kind: "error",
        error: error instanceof Error ? error.message : "Scan failed",
      },
      { status: 500 },
    );
  }
}
