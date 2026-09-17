import { afterEach, expect, it, vi } from 'vitest';
import { fetchCompletionWithRetry, completionUrl } from './completion-request';
import { chatCompletion } from './api';

afterEach(() => vi.useRealTimers());

it('retries HTTP 429 only after Retry-After and preserves body and attribution', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValueOnce(new Response('limited', { status: 429, headers: { 'Retry-After': '2' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
  const notice = vi.fn();
  const pending = chatCompletion({ baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'key', model: 'configured-model' }, [], undefined, undefined, notice);
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(notice).toHaveBeenCalledWith(2000, 1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toMatchObject({ content: 'ok' });
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, init] of vi.mocked(fetch).mock.calls) {
    expect(JSON.parse(String(init?.body)).model).toBe('configured-model');
    expect(new Headers(init?.headers).get('X-OpenRouter-Title')).toBe('easywebui');
    expect(new Headers(init?.headers).get('HTTP-Referer')).toBe('https://github.com/akku1139/easywebui');
  }
});

it('returns a long Retry-After without retrying early', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
  await expect(chatCompletion({ baseUrl: 'https://example.com/custom/v2', apiKey: 'k', model: 'm' }, [])).rejects.toThrow('120 seconds');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('limits retries to two and returns the final 429 with its headers', async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockImplementation(async () => new Response('', { status: 429, headers: { 'Retry-After': '1' } }));
  const pending = fetchCompletionWithRetry('https://example.com', { method: 'POST' });
  await vi.advanceTimersByTimeAsync(2000);
  expect((await pending).status).toBe(429);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('honors HTTP-date Retry-After', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': 'Thu, 01 Jan 2026 00:00:03 GMT' } }))
    .mockResolvedValueOnce(new Response('ok'));
  const pending = fetchCompletionWithRetry('https://example.com', {});
  await vi.advanceTimersByTimeAsync(2999); expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect((await pending).status).toBe(200);
});

it('does not retry other failures', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 401 }));
  expect((await fetchCompletionWithRetry('https://example.com', {})).status).toBe(401);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('preserves custom configured API paths rather than forcing v1', () => {
  expect(completionUrl('https://example.com/custom/v2/')).toBe('https://example.com/custom/v2/chat/completions');
  expect(completionUrl('https://example.com')).toBe('https://example.com/v1/chat/completions');
});
