import { describe, it, expect, beforeEach } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

describe('Memory API', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe('GET /api/memory/facts', () => {
    it('should return empty array when no facts exist', async () => {
      const req = new Request('http://localhost/api/memory/facts', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toEqual([]);
    });

    it('should return user facts', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('user_facts', {
        id: 'fact-1',
        content: 'User likes TypeScript',
        category: 'preference',
        source: 'explicit',
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const req = new Request('http://localhost/api/memory/facts', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toHaveLength(1);
      expect(data[0].content).toBe('User likes TypeScript');
    });
  });

  describe('POST /api/memory/facts', () => {
    it('should create a new fact', async () => {
      const req = new Request('http://localhost/api/memory/facts', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'User prefers dark mode',
          category: 'preference',
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.content).toBe('User prefers dark mode');
      expect(data.category).toBe('preference');
      expect(data.id).toBeDefined();
    });
  });

  describe('DELETE /api/memory/facts', () => {
    it('should delete a fact by id', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('user_facts', {
        id: 'fact-1',
        content: 'User likes TypeScript',
        category: 'preference',
        source: 'explicit',
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const req = new Request('http://localhost/api/memory/facts?id=fact-1', {
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
      const facts = db._getData('user_facts');
      expect(facts).toHaveLength(0);
    });
  });

  describe('GET /api/memory/summaries', () => {
    it('should return empty array when no summaries exist', async () => {
      const req = new Request('http://localhost/api/memory/summaries', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toEqual([]);
    });
  });

  describe('POST /api/memory/summaries', () => {
    it('should create a new summary', async () => {
      const req = new Request('http://localhost/api/memory/summaries', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Chat about TypeScript',
          summary: 'Discussed TypeScript features',
          date: '2024-01-15',
          message_count: 10,
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.title).toBe('Chat about TypeScript');
      expect(data.summary).toBe('Discussed TypeScript features');
      expect(data.id).toBeDefined();
    });
  });
});
