const ALLOWED_ORIGINS = new Set([
  "https://cyre.dev",
  "https://www.cyre.dev",
]);

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://cyre.dev";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
}

export function jsonWithCors(
  request: Request,
  body: unknown,
  init?: { status?: number },
) {
  return Response.json(body, {
    status: init?.status ?? 200,
    headers: corsHeaders(request),
  });
}

export function optionsWithCors(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
