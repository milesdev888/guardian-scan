import { NextResponse } from "next/server";
import { catalogPayload } from "@/lib/x402/protocol";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(catalogPayload());
}
