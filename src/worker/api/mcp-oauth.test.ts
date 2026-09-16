import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

describe('MCP OAuth API', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  describe('POST /api/mcp-oauth/discover', () => {
    it('should discover OAuth metadata from well-known endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/mcp-oauth/discover', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverUrl: 'https://mcp.example.com' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.authorizationEndpoint).toBe('https://auth.example.com/authorize');
      expect(data.tokenEndpoint).toBe('https://auth.example.com/token');
    });

    it('should fallback to OpenID Connect discovery', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false }) // First attempt fails
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            authorization_endpoint: 'https://oidc.example.com/authorize',
            token_endpoint: 'https://oidc.example.com/token',
          }),
        });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/mcp-oauth/discover', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverUrl: 'https://mcp.example.com' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.authorizationEndpoint).toBe('https://oidc.example.com/authorize');
    });

    it('should return 404 when OAuth metadata not found', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/mcp-oauth/discover', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverUrl: 'https://mcp.example.com' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(404);
    });

    it('should handle network errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/mcp-oauth/discover', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverUrl: 'https://mcp.example.com' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/mcp-oauth/initiate', () => {
    it('should return 404 when server not found', async () => {
      const req = new Request('http://localhost/api/mcp-oauth/initiate', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverId: 'non-existent' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(404);
    });

    it('should initiate OAuth flow with PKCE', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('mcp_servers', {
        id: 'server-1',
        name: 'OAuth Server',
        url: 'http://localhost:3001',
        enabled: 1,
        tools_json: '[]',
        status: 'disconnected',
        created_at: Date.now(),
        oauth_enabled: 1,
        oauth_client_id: 'client-123',
        oauth_auth_endpoint: 'https://auth.example.com/authorize',
        oauth_token_endpoint: 'https://auth.example.com/token',
      });

      const req = new Request('http://localhost/api/mcp-oauth/initiate', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverId: 'server-1' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.authorizationUrl).toBeDefined();
      expect(data.state).toBeDefined();
      expect(data.authorizationUrl).toContain('client-123');
      expect(data.authorizationUrl).toContain('code_challenge');
    });

    it('should store state in database', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('mcp_servers', {
        id: 'server-1',
        name: 'OAuth Server',
        url: 'http://localhost:3001',
        enabled: 1,
        tools_json: '[]',
        status: 'disconnected',
        created_at: Date.now(),
        oauth_enabled: 1,
        oauth_client_id: 'client-123',
        oauth_auth_endpoint: 'https://auth.example.com/authorize',
        oauth_token_endpoint: 'https://auth.example.com/token',
      });

      const req = new Request('http://localhost/api/mcp-oauth/initiate', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverId: 'server-1' }),
      });

      await app.fetch(req, env);
      
      const states = db._getData('oauth_states');
      expect(states.length).toBeGreaterThan(0);
      expect(states[0].server_id).toBe('server-1');
    });
  });

  describe('POST /api/mcp-oauth/callback', () => {
    it('should exchange code for tokens', async () => {
      const db = env.AI_CHAT_DB as any;
      
      // Add server
      db._addData('mcp_servers', {
        id: 'server-1',
        name: 'OAuth Server',
        url: 'http://localhost:3001',
        enabled: 1,
        tools_json: '[]',
        status: 'disconnected',
        created_at: Date.now(),
        oauth_enabled: 1,
        oauth_client_id: 'client-123',
        oauth_auth_endpoint: 'https://auth.example.com/authorize',
        oauth_token_endpoint: 'https://auth.example.com/token',
      });

      // Add state
      db._addData('oauth_states', {
        id: 'state-1',
        server_id: 'server-1',
        state: 'test-state',
        code_verifier: 'test-verifier',
        created_at: Date.now(),
        expires_at: Date.now() + 600000,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-token-123',
          refresh_token: 'refresh-token-456',
          expires_in: 3600,
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/mcp-oauth/callback', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'auth-code', state: 'test-state' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);

      // Verify tokens were stored
      const servers = db._getData('mcp_servers');
      expect(servers[0].oauth_access_token).toBe('access-token-123');
      expect(servers[0].oauth_refresh_token).toBe('refresh-token-456');
    });

    it('should return 400 for invalid state', async () => {
      const req = new Request('http://localhost/api/mcp-oauth/callback', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'auth-code', state: 'invalid-state' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(400);
    });

    it('should return 404 for expired state', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('oauth_states', {
        id: 'state-1',
        server_id: 'server-1',
        state: 'expired-state',
        code_verifier: 'test-verifier',
        created_at: Date.now() - 1000000,
        expires_at: Date.now() - 1000, // Expired
      });

      const req = new Request('http://localhost/api/mcp-oauth/callback', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'auth-code', state: 'expired-state' }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(404);
    });

    it('should delete state after use', async () => {
      const db = env.AI_CHAT_DB as any;
      
      db._addData('mcp_servers', {
        id: 'server-1',
        name: 'OAuth Server',
        url: 'http://localhost:3001',
        enabled: 1,
        tools_json: '[]',
        status: 'disconnected',
        created_at: Date.now(),
        oauth_enabled: 1,
        oauth_client_id: 'client-123',
        oauth_auth_endpoint: 'https://auth.example.com/authorize',
        oauth_token_endpoint: 'https://auth.example.com/token',
      });

      db._addData('oauth_states', {
        id: 'state-1',
        server_id: 'server-1',
        state: 'test-state',
        code_verifier: 'test-verifier',
        created_at: Date.now(),
        expires_at: Date.now() + 600000,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access-token-123',
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/mcp-oauth/callback', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'auth-code', state: 'test-state' }),
      });

      await app.fetch(req, env);
      
      const states = db._getData('oauth_states');
      expect(states.length).toBe(0);
    });
  });
});
