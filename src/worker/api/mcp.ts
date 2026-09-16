import { Context } from 'hono';
import { Env } from '../index';

export async function handleMCPServers(c: Context<{ Bindings: Env }>) {
  const db = c.env.AI_CHAT_DB;
  const method = c.req.method;
  
  if (method === 'GET') {
    const servers = await db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all();
    return c.json(servers.results);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO mcp_servers (id, name, url, enabled, tools_json, status, created_at, oauth_enabled, oauth_client_id, oauth_client_secret, oauth_token_endpoint, oauth_auth_endpoint, oauth_access_token, oauth_refresh_token, oauth_token_expires_at, oauth_scopes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      body.name,
      body.url,
      body.enabled ? 1 : 0,
      JSON.stringify(body.tools || []),
      body.status || 'disconnected',
      Date.now(),
      body.oauthEnabled ? 1 : 0,
      body.oauthClientId || null,
      body.oauthClientSecret || null,
      body.oauthTokenEndpoint || null,
      body.oauthAuthEndpoint || null,
      body.oauthAccessToken || null,
      body.oauthRefreshToken || null,
      body.oauthTokenExpiresAt || null,
      body.oauthScopes || null
    ).run();
    return c.json({ id, ...body });
  }
  
  if (method === 'PATCH') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (!id) {
      return c.json({ error: 'Missing server ID' }, 400);
    }
    
    const body = await c.req.json();
    const updates: string[] = [];
    const values: any[] = [];
    
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.url !== undefined) { updates.push('url = ?'); values.push(body.url); }
    if (body.enabled !== undefined) { updates.push('enabled = ?'); values.push(body.enabled ? 1 : 0); }
    if (body.tools !== undefined) { updates.push('tools_json = ?'); values.push(JSON.stringify(body.tools)); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
    
    if (updates.length > 0) {
      values.push(id);
      await db.prepare(`UPDATE mcp_servers SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return c.json({ ok: true });
  }
  
  if (method === 'DELETE') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (id) {
      await db.prepare('DELETE FROM mcp_servers WHERE id = ?').bind(id).run();
    }
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}

export async function handleMCPOAuth(c: Context<{ Bindings: Env }>) {
  const db = c.env.AI_CHAT_DB;
  const path = new URL(c.req.url).pathname;
  
  if (path === '/api/mcp-oauth/register') {
    const { serverId, registrationEndpoint } = await c.req.json();
    
    const server = await db.prepare(
      'SELECT * FROM mcp_servers WHERE id = ?'
    ).bind(serverId).first() as any;
    
    if (!server) {
      return c.json({ error: 'Server not found' }, 404);
    }
    
    const redirectUri = `${new URL(c.req.url).origin}/oauth-callback`;
    
    try {
      const registrationResponse = await fetch(registrationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_name: 'AI Chat MCP Client',
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
      });
      
      if (!registrationResponse.ok) {
        const errorText = await registrationResponse.text();
        return c.json({ 
          error: 'Client registration failed',
          details: errorText 
        }, 400);
      }
      
      const registrationData = await registrationResponse.json() as {
        client_id: string;
        client_secret?: string;
      };
      
      await db.prepare(
        'UPDATE mcp_servers SET oauth_client_id = ?, oauth_client_secret = ? WHERE id = ?'
      ).bind(
        registrationData.client_id,
        registrationData.client_secret || null,
        serverId
      ).run();
      
      return c.json({ 
        success: true,
        clientId: registrationData.client_id 
      });
    } catch (error) {
      console.error('Client registration failed:', error);
      return c.json({ error: 'Registration failed' }, 500);
    }
  }
  
  if (path === '/api/mcp-oauth/initiate') {
    const body = await c.req.json();
    const { serverId, redirectUri } = body;
    
    const server = await db.prepare('SELECT * FROM mcp_servers WHERE id = ?').bind(serverId).first() as any;
    
    if (!server || !server.oauth_enabled) {
      return c.json({ error: 'Server not found or OAuth not enabled' }, 404);
    }
    
    // Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000;
    
    await db.prepare(
      'INSERT INTO oauth_states (id, server_id, state, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), serverId, state, codeVerifier, now, expiresAt).run();
    
    const finalRedirectUri = redirectUri || `${new URL(c.req.url).origin}/mcp-oauth-callback`;
    const authUrl = buildAuthorizationUrl(
      server.oauth_auth_endpoint,
      server.oauth_client_id,
      finalRedirectUri,
      state,
      codeChallenge,
      server.oauth_scopes || undefined
    );
    
    return c.json({ authorizationUrl: authUrl, state });
  }
  
  if (path === '/api/mcp-oauth/callback') {
    const url = new URL(c.req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    
    if (!code || !state) {
      return c.json({ error: 'Missing code or state' }, 400);
    }
    
    const stateData = await db.prepare(
      'SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?'
    ).bind(state, Date.now()).first() as any;
    
    if (!stateData) {
      return c.json({ error: 'Invalid or expired state' }, 400);
    }
    
    await db.prepare('DELETE FROM oauth_states WHERE id = ?').bind(stateData.id).run();
    
    const server = await db.prepare('SELECT * FROM mcp_servers WHERE id = ?').bind(stateData.server_id).first() as any;
    
    if (!server || !server.oauth_token_endpoint) {
      return c.json({ error: 'Server configuration not found' }, 404);
    }
    
    const tokenResponse = await fetch(server.oauth_token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: stateData.code_verifier,
        client_id: server.oauth_client_id,
        ...(server.oauth_client_secret ? { client_secret: server.oauth_client_secret } : {}),
      }).toString(),
    });
    
    if (!tokenResponse.ok) {
      return c.json({ error: 'Token exchange failed' }, 400);
    }
    
    const tokens = await tokenResponse.json() as any;
    const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
    
    await db.prepare(
      'UPDATE mcp_servers SET oauth_access_token = ?, oauth_refresh_token = ?, oauth_token_expires_at = ?, oauth_scopes = ? WHERE id = ?'
    ).bind(
      tokens.access_token,
      tokens.refresh_token || null,
      expiresAt,
      tokens.scope || null,
      stateData.server_id
    ).run();
    
    return c.json({ success: true });
  }
  
  if (path === '/api/mcp-oauth/discover') {
    const body = await c.req.json();
    const { serverUrl } = body;
    
    try {
      const metadataUrl = new URL('/.well-known/oauth-authorization-server', serverUrl);
      const response = await fetch(metadataUrl.toString());
      
      if (response.ok) {
        const metadata = await response.json() as any;
        if (metadata.authorization_endpoint && metadata.token_endpoint) {
          return c.json({
            authorizationEndpoint: metadata.authorization_endpoint,
            tokenEndpoint: metadata.token_endpoint,
          });
        }
      }
      
      return c.json({ error: 'OAuth metadata not found' }, 404);
    } catch (error) {
      return c.json({ error: 'Discovery failed' }, 500);
    }
  }
  
  return c.json({ error: 'Not found' }, 404);
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function buildAuthorizationUrl(
  authEndpoint: string,
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  scopes?: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  
  if (scopes) {
    params.append('scope', scopes);
  }
  
  return `${authEndpoint}?${params.toString()}`;
}
