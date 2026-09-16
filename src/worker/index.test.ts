import { describe, it, expect, beforeEach } from 'vitest';
import app from './index';
import { createMockEnv } from './test-helpers';

describe('Hono Worker - Main App', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
  });

  describe('Health Check', () => {
    it('should return health status with authentication', async () => {
      const req = new Request('http://localhost/api/health', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ status: 'ok' });
    });
  });

  describe('Basic Authentication', () => {
    it('should reject requests without auth', async () => {
      const req = new Request('http://localhost/api/memory/facts');
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid credentials', async () => {
      const req = new Request('http://localhost/api/memory/facts', {
        headers: {
          'Authorization': 'Basic ' + btoa('wrong:credentials'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(401);
    });

    it('should accept requests with valid credentials', async () => {
      const req = new Request('http://localhost/api/memory/facts', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const req = new Request('http://localhost/api/unknown', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(404);
      const data = await res.json() as { error: string };
      expect(data.error).toBe('Not Found');
    });
  });
});
