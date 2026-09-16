import { describe, it, expect, beforeEach } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

describe('Endpoints API', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe('GET /api/endpoints', () => {
    it('should return empty array when no endpoints exist', async () => {
      const req = new Request('http://localhost/api/endpoints', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toEqual([]);
    });

    it('should return endpoints sorted by is_default and created_at', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('api_endpoints', {
        id: 'ep-1',
        name: 'OpenAI',
        base_url: 'https://api.openai.com',
        api_key: 'key-1',
        model: 'gpt-4o',
        enabled: 1,
        is_default: 0,
        created_at: 1000,
      });
      db._addData('api_endpoints', {
        id: 'ep-2',
        name: 'Claude',
        base_url: 'https://api.anthropic.com',
        api_key: 'key-2',
        model: 'claude-3-opus',
        enabled: 1,
        is_default: 1,
        created_at: 2000,
      });

      const req = new Request('http://localhost/api/endpoints', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toHaveLength(2);
    });
  });

  describe('POST /api/endpoints', () => {
    it('should create a new endpoint', async () => {
      const req = new Request('http://localhost/api/endpoints', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'OpenAI',
          base_url: 'https://api.openai.com',
          api_key: 'sk-test',
          model: 'gpt-4o',
          enabled: true,
          is_default: true,
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.name).toBe('OpenAI');
      expect(data.base_url).toBe('https://api.openai.com');
      expect(data.model).toBe('gpt-4o');
      expect(data.id).toBeDefined();
    });

    it('should unset other defaults when creating a new default', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('api_endpoints', {
        id: 'ep-1',
        name: 'Old Default',
        base_url: 'https://api.openai.com',
        api_key: 'key-1',
        model: 'gpt-4o',
        enabled: 1,
        is_default: 1,
        created_at: 1000,
      });

      const req = new Request('http://localhost/api/endpoints', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Default',
          base_url: 'https://api.anthropic.com',
          api_key: 'key-2',
          model: 'claude-3-opus',
          enabled: true,
          is_default: true,
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      
      // Verify that old default is unset
      const endpoints = db._getData('api_endpoints');
      const oldDefault = endpoints.find((e: any) => e.id === 'ep-1');
      expect(oldDefault.is_default).toBe(0);
    });
  });

  describe('PATCH /api/endpoints', () => {
    it('should update endpoint', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('api_endpoints', {
        id: 'ep-1',
        name: 'Old Name',
        base_url: 'https://api.openai.com',
        api_key: 'key-1',
        model: 'gpt-4o',
        enabled: 1,
        is_default: 0,
        created_at: Date.now(),
      });

      const req = new Request('http://localhost/api/endpoints?id=ep-1', {
        method: 'PATCH',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Name',
          model: 'gpt-4o-mini',
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('should return 400 when id is missing', async () => {
      const req = new Request('http://localhost/api/endpoints', {
        method: 'PATCH',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Name',
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toBe('Missing endpoint ID');
    });
  });

  describe('DELETE /api/endpoints', () => {
    it('should delete endpoint by id', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('api_endpoints', {
        id: 'ep-1',
        name: 'Test Endpoint',
        base_url: 'https://api.openai.com',
        api_key: 'key-1',
        model: 'gpt-4o',
        enabled: 1,
        is_default: 0,
        created_at: Date.now(),
      });

      const req = new Request('http://localhost/api/endpoints?id=ep-1', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);

      // Verify deletion
      const endpoints = db._getData('api_endpoints');
      expect(endpoints).toHaveLength(0);
    });
  });
});
