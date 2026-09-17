/** Preserve configured API paths; support legacy root-only OpenAI-compatible URLs. */
export function completionUrl(baseUrl: string): string {
  const url = new URL(baseUrl.trim());
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid provider HTTP URL');
  if (url.search || url.hash || url.username || url.password) throw new Error('Provider base URL must not contain query, fragment, or credentials');
  let path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/api') path += '/v1';
  url.pathname = `${path}/chat/completions`;
  return url.toString();
}

export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value?.trim()) return null;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Math.ceil(Number(value) * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(readonly retryAfter: string | null) {
    const delay = retryAfterMs(retryAfter);
    super(`API rate limit (429). ${delay === null ? 'Please wait before trying again.' : `Try again in ${Math.ceil(delay / 1000)} seconds.`}`);
    this.name = 'RateLimitError';
  }
}

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new Error('Request cancelled')); return; }
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason ?? new Error('Request cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Retry only explicit HTTP 429s before streaming starts, never network errors
 * or partially consumed completions. Not for MCP or other side-effecting calls.
 * Two retries, <=30s total wait; long Retry-After values are returned unchanged.
 */
export async function fetchCompletionWithRetry(
  input: string, init: RequestInit, onRetry?: (delayMs: number, retry: number) => void,
): Promise<Response> {
  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init);
    if (response.status !== 429 || attempt >= 2) return response;
    const delay = retryAfterMs(response.headers.get('Retry-After')) ?? (1000 * 2 ** attempt + Math.floor(Math.random() * 250));
    if (!Number.isFinite(delay) || waited + delay > 30_000) return response;
    await response.body?.cancel();
    waited += delay;
    onRetry?.(delay, attempt + 1);
    await wait(delay, init.signal);
  }
}
