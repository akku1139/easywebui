import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

describe('MCP API', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
  });

  describe('GET /api/mcp-servers', () => {
    it('should return empty array when no servers exist', async () => {
      const req = new Request('http://localhost/api/mcp-servers', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toEqual([]);
    });

    it('should return MCP servers', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('mcp_servers', {
        id: 'server-1',
        name: 'Test Server',
        url: 'http://localhost:3001',
        enabled: 1,
        tools_json: '[]',
        status: 'connected',
        created_at: Date.now(),
        oauth_enabled: 0,
      });

      const req = new Request('http://localhost/api/mcp-servers', {
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
        },
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any[];
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('Test Server');
    });
  });

  describe('POST /api/mcp-servers', () => {
    it('should create a new MCP server', async () => {
      const req = new Request('http://localhost/api/mcp-servers', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Server',
          url: 'http://localhost:3002',
          enabled: true,
          tools: [],
          status: 'disconnected',
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.name).toBe('New Server');
      expect(data.url).toBe('http://localhost:3002');
      expect(data.id).toBeDefined();
    });

    it('should create MCP server with OAuth configuration', async () => {
      const req = new Request('http://localhost/api/mcp-servers', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'OAuth Server',
          url: 'http://localhost:3003',
          enabled: true,
          oauthEnabled: true,
          oauthClientId: 'client-123',
          oauthAuthEndpoint: 'https://auth.example.com/authorize',
          oauthTokenEndpoint: 'https://auth.example.com/token',
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.oauthEnabled).toBe(true);
      expect(data.oauthClientId).toBe('client-123');
    });
  });

  describe('PATCH /api/mcp-servers', () => {
    it('should update MCP server', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('mcp_servers', {
        id: 'server-1',
        name: 'Old Name',
        url: 'http://localhost:3001',
        enabled: 1,
        tools_json: '[]',
        status: 'disconnected',
        created_at: Date.now(),
        oauth_enabled: 0,
      });

      const req = new Request('http://localhost/api/mcp-servers?id=server-1', {
        method: 'PATCH',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Name',
          status: 'connected',
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.ok).toBe(true);
    });

    it('should return 400 when id is missing', async () => {
      const req = new Request('http://localhost/api/mcp-servers', {
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
      expect(data.error).toBe('Missing server ID');
    });
  });

  describe('DELETE /api/mcp-servers', () => {
    it('should delete MCP server by id', async () => {
      const db = env.AI_CHAT_DB as any;
      db._addData('mcp_servers', {
        id: 'server-1',
        name: 'Test Server',
        url: 'http://localhost:3001',
        enabled: 1,
        tools_json: '[]',
        status: 'connected',
        created_at: Date.now(),
        oauth_enabled: 0,
      });

      const req = new Request('http://localhost/api/mcp-servers?id=server-1', {
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
      const servers = db._getData('mcp_servers');
      expect(servers).toHaveLength(0);
    });
  });

  describe('MCP OAuth', () => {
    describe('POST /api/mcp-oauth/discover', () => {
      it('should discover OAuth metadata', async () => {
        // Mock fetch for OAuth discovery
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
          body: JSON.stringify({
            serverUrl: 'https://mcp.example.com',
          }),
        });
        const res = await app.fetch(req, env);
        
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.authorizationEndpoint).toBe('https://auth.example.com/authorize');
        expect(data.tokenEndpoint).toBe('https://auth.example.com/token');
      });

      it('should return 404 when OAuth metadata not found', async () => {
        // Mock fetch for OAuth discovery failure
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
        });
        global.fetch = mockFetch;

        const req = new Request('http://localhost/api/mcp-oauth/discover', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa('testuser:testpass'),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serverUrl: 'https://mcp.example.com',
          }),
        });
        const res = await app.fetch(req, env);
        
        expect(res.status).toBe(404);
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
          body: JSON.stringify({
            serverId: 'non-existent',
          }),
        });
        const res = await app.fetch(req, env);
        
        expect(res.status).toBe(404);
      });

      it('should initiate OAuth flow', async () => {
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
          body: JSON.stringify({
            serverId: 'server-1',
          }),
        });
        const res = await app.fetch(req, env);
        
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.authorizationUrl).toBeDefined();
        expect(data.state).toBeDefined();
        expect(data.authorizationUrl).toContain('client-123');
      });
    });
  });
});
