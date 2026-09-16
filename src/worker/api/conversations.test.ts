import { describe, it, expect, beforeEach } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

describe('Conversations API', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe('GET /api/conversations', () => {
    it('should return empty array when no conversations exist', async () => {
      const req = new Request('http://localhost/api/conversations', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toEqual([]);
    });

    it('should return conversations sorted by pinned and updated_at', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('conversations', {
        id: 'conv-1',
        title: 'Old Chat',
        model: 'gpt-4o',
        pinned: 0,
        created_at: 1000,
        updated_at: 1000,
      });
      db._addData('conversations', {
        id: 'conv-2',
        title: 'Pinned Chat',
        model: 'gpt-4o',
        pinned: 1,
        created_at: 2000,
        updated_at: 2000,
      });

      const req = new Request('http://localhost/api/conversations', {
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

  describe('POST /api/conversations', () => {
    it('should create a new conversation', async () => {
      const req = new Request('http://localhost/api/conversations', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'New Chat',
          messages: [],
          model: 'gpt-4o',
          pinned: false,
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.title).toBe('New Chat');
      expect(data.model).toBe('gpt-4o');
      expect(data.id).toBeDefined();
    });
  });

  describe('PATCH /api/conversations', () => {
    it('should update conversation pin status', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('conversations', {
        id: 'conv-1',
        title: 'Test Chat',
        model: 'gpt-4o',
        pinned: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const req = new Request('http://localhost/api/conversations?id=conv-1', {
        method: 'PATCH',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pinned: true,
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('should update conversation title', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('conversations', {
        id: 'conv-1',
        title: 'Old Title',
        model: 'gpt-4o',
        pinned: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const req = new Request('http://localhost/api/conversations?id=conv-1', {
        method: 'PATCH',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'New Title',
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('should return 400 when id is missing', async () => {
      const req = new Request('http://localhost/api/conversations', {
        method: 'PATCH',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'New Title',
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error).toBe('Missing conversation ID');
    });
  });
});
