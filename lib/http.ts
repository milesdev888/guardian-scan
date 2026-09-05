const DEFAULT_TIMEOUT_MS = 12_000;

export type FetchJsonResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number };

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<FetchJsonResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "GuardianScan/2.0",
        ...headers,
      },
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`,
      };
    }
    if (!text) {
      return { ok: true, status: response.status, data: {} as T };
    }
    try {
      return { ok: true, status: response.status, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, status: response.status, error: "Response was not JSON" };
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "Request timed out"
          : error.message
        : "Network error";
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export function flag(value: unknown): boolean | null {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return null;
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
