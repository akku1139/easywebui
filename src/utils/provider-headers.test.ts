import { expect, it, vi } from 'vitest';
import { chatCompletion } from './api';
import { providerHeaders } from './provider-headers';

it('attributes OpenRouter chat calls without adding headers to unrelated providers', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
  await chatCompletion({ baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'key', model: 'openai/gpt-4o' }, []);
  const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
  expect(headers.get('HTTP-Referer')).toBe('https://github.com/akku1139/easywebui');
  expect(headers.get('X-Title')).toBe('easywebui');
  expect(providerHeaders('https://api.openai.com/v1')).toEqual({});
});
