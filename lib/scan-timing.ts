/**
 * Per-sub-check duration logging for scan diagnostics.
 * Emits one structured line per timed span; totals roll up at end.
 */

export type TimingSpan = {
  name: string;
  ms: number;
  ok: boolean;
  error?: string;
  timedOut?: boolean;
};

export class ScanTimer {
  readonly startedAt = Date.now();
  readonly spans: TimingSpan[] = [];
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  async time<T>(
    name: string,
    fn: () => Promise<T>,
    classify?: (result: T) => { ok: boolean; error?: string },
  ): Promise<T> {
    const t0 = Date.now();
    try {
      const result = await fn();
      const classed = classify?.(result) ?? { ok: true };
      this.spans.push({
        name,
        ms: Date.now() - t0,
        ok: classed.ok,
        error: classed.error,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.spans.push({
        name,
        ms: Date.now() - t0,
        ok: false,
        error: message,
        timedOut: /timed out|timeout|abort/i.test(message),
      });
      throw error;
    }
  }

  mark(name: string, ms: number, ok: boolean, error?: string, timedOut?: boolean) {
    this.spans.push({ name, ms, ok, error, timedOut });
  }

  totalMs() {
    return Date.now() - this.startedAt;
  }

  /** Compact breakdown for logs / artifacts. */
  breakdown(): Record<string, number | string | boolean> {
    const out: Record<string, number | string | boolean> = {
      label: this.label,
      totalMs: this.totalMs(),
    };
    for (const span of this.spans) {
      out[`${span.name}Ms`] = span.ms;
      if (!span.ok) out[`${span.name}Ok`] = false;
      if (span.error) out[`${span.name}Error`] = span.error.slice(0, 160);
      if (span.timedOut) out[`${span.name}TimedOut`] = true;
    }
    return out;
  }

  log(extra?: Record<string, unknown>) {
    const payload = { ...this.breakdown(), ...extra };
    console.info(`[scan-timing] ${JSON.stringify(payload)}`);
  }
}

/**
 * Race a promise against a hard timeout. On timeout, returns the fallback
 * and does not cancel the underlying work (fetch abort is caller's job when needed).
 */
export async function withTimeout<T>(
  ms: number,
  fn: () => Promise<T>,
  onTimeout: () => T,
): Promise<{ value: T; timedOut: boolean; ms: number }> {
  const t0 = Date.now();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      fn(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve(onTimeout());
        }, ms);
      }),
    ]);
    return { value, timedOut, ms: Date.now() - t0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
