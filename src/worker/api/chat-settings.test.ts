import { expect, it, vi } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

function setup() {
  const env = createMockEnv();
  env.AI_CHAT_DB._addData('settings', { id: 's',
    providers_json: JSON.stringify([{ id: 'p', baseUrl: 'https://openrouter.ai/custom/v2', apiKey: 'saved-key' }]),
    models_json: JSON.stringify([{ id: 'm', providerId: 'p', name: 'saved-model' }]),
    active_model_id: 'm', memory_enabled: 1, auto_memory: 1, custom_system_prompt: 'Saved prompt',
  });
  return env;
}
const request = (env: ReturnType<typeof setup>) => app.fetch(new Request('https://app.test/api/v1/chat/completions', {
  method: 'POST', headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'ignored-model', endpoint_id: 'ignored-endpoint', stream: false,
    messages: [{ role: 'user', content: 'I like typescript' }], tools: [{ type: 'function', function: { name: 'search' } }] }),
}), env);

it('uses saved provider/model for chat and extraction, with attribution on both', async () => {
  const env = setup();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Great!' } }] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'User likes TypeScript' } }] })));
  expect((await request(env)).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, init] of vi.mocked(fetch).mock.calls) {
    expect(url).toBe('https://openrouter.ai/custom/v2/chat/completions');
    expect(JSON.parse(String(init?.body)).model).toBe('saved-model');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer saved-key');
    expect(new Headers(init?.headers).get('HTTP-Referer')).toBe('https://github.com/akku1139/easywebui');
  }
  const main = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
  expect(main.tools[0].function.name).toBe('search');
  expect(main.messages[0]).toEqual({ role: 'system', content: 'Saved prompt' });
  expect(env.AI_CHAT_DB._getData('user_facts')[0]).toMatchObject({ content: 'User likes TypeScript', source: 'auto_detected' });
});

it('honors memory switches and never silently falls back to environment config', async () => {
  const env = setup();
  Object.assign(env.AI_CHAT_DB._getData('settings')[0], { memory_enabled: 0 });
  env.AI_CHAT_DB._addData('user_facts', { id: 'f', content: 'Private memory', updated_at: 1 });
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Hello' } }] })));
  expect((await request(env)).status).toBe(200);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(vi.mocked(fetch).mock.calls[0][1]?.body)).not.toContain('Private memory');
  env.AI_CHAT_DB._clear(); vi.mocked(fetch).mockClear();
  expect((await request(env)).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it('preserves a long upstream Retry-After and does not attempt extraction on 429', async () => {
  const env = setup();
  vi.mocked(fetch).mockResolvedValueOnce(new Response('limited', { status: 429, headers: { 'Retry-After': '120' } }));
  const result = await request(env);
  expect(result.status).toBe(429);
  expect(result.headers.get('Retry-After')).toBe('120');
  expect(await result.text()).toBe('limited');
  expect(fetch).toHaveBeenCalledTimes(1);
});
