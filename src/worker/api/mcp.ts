import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { mcpServers, oauthStates } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

export async function handleMCPServers(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;
  
  if (method === 'GET') {
    const servers = await db.select().from(mcpServers).orderBy(desc(mcpServers.createdAt));
    return c.json(servers);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(mcpServers).values({
      id,
      name: body.name,
      url: body.url,
      enabled: body.enabled ?? true,
      toolsJson: JSON.stringify(body.tools || []),
      status: body.status || 'disconnected',
      createdAt: now,
      oauthEnabled: body.oauthEnabled || false,
      oauthClientId: body.oauthClientId || null,
      oauthClientSecret: body.oauthClientSecret || null,
      oauthTokenEndpoint: body.oauthTokenEndpoint || null,
      oauthAuthEndpoint: body.oauthAuthEndpoint || null,
      oauthRegistrationEndpoint: body.oauthRegistrationEndpoint || null,
      oauthAccessToken: body.oauthAccessToken || null,
      oauthRefreshToken: body.oauthRefreshToken || null,
      oauthTokenExpiresAt: body.oauthTokenExpiresAt ? new Date(body.oauthTokenExpiresAt) : null,
      oauthScopes: body.oauthScopes || null,
    });
    return c.json({ id, ...body });
  }
  
  if (method === 'PATCH') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (!id) {
      return c.json({ error: 'Missing server ID' }, 400);
    }
    
    const body = await c.req.json();
    const updates: any = {};
    
    if (body.name !== undefined) updates.name = body.name;
    if (body.url !== undefined) updates.url = body.url;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.tools !== undefined) updates.toolsJson = JSON.stringify(body.tools);
    if (body.status !== undefined) updates.status = body.status;
    
    if (Object.keys(updates).length > 0) {
      await db.update(mcpServers).set(updates).where(eq(mcpServers.id, id));
    }
    
    return c.json({ ok: true });
  }
  
  if (method === 'DELETE') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (id) {
      await db.delete(mcpServers).where(eq(mcpServers.id, id));
    }
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}

export async function handleMCPOAuth(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const path = new URL(c.req.url).pathname;
  
  if (path === '/api/mcp-oauth/register') {
    const { serverId, registrationEndpoint } = await c.req.json();
    
    const servers = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId));
    const server = servers[0];
    
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
      
      await db.update(mcpServers)
        .set({
          oauthClientId: registrationData.client_id,
          oauthClientSecret: registrationData.client_secret || null,
        })
        .where(eq(mcpServers.id, serverId));
      
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
    
    const servers = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId));
    const server = servers[0];
    
    if (!server || !server.oauthEnabled) {
      return c.json({ error: 'Server not found or OAuth not enabled' }, 404);
    }
    
    // Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    
    await db.insert(oauthStates).values({
      id: crypto.randomUUID(),
      serverId,
      state,
      codeVerifier,
      createdAt: now,
      expiresAt,
    });
    
    const finalRedirectUri = redirectUri || `${new URL(c.req.url).origin}/mcp-oauth-callback`;
    const authUrl = buildAuthorizationUrl(
      server.oauthAuthEndpoint!,
      server.oauthClientId!,
      finalRedirectUri,
      state,
      codeChallenge,
      server.oauthScopes || undefined
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
    
    const now = new Date();
    const stateRecords = await db.select().from(oauthStates)
      .where(eq(oauthStates.state, state));
    const stateData = stateRecords.find(s => s.expiresAt > now);
    
    if (!stateData) {
      return c.json({ error: 'Invalid or expired state' }, 400);
    }
    
    await db.delete(oauthStates).where(eq(oauthStates.id, stateData.id));
    
    const servers = await db.select().from(mcpServers).where(eq(mcpServers.id, stateData.serverId));
    const server = servers[0];
    
    if (!server || !server.oauthTokenEndpoint) {
      return c.json({ error: 'Server configuration not found' }, 404);
    }
    
    const tokenResponse = await fetch(server.oauthTokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: stateData.codeVerifier,
        client_id: server.oauthClientId!,
        ...(server.oauthClientSecret ? { client_secret: server.oauthClientSecret } : {}),
      }).toString(),
    });
    
    if (!tokenResponse.ok) {
      return c.json({ error: 'Token exchange failed' }, 400);
    }
    
    const tokens = await tokenResponse.json() as any;
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    
    await db.update(mcpServers)
      .set({
        oauthAccessToken: tokens.access_token,
        oauthRefreshToken: tokens.refresh_token || null,
        oauthTokenExpiresAt: expiresAt,
        oauthScopes: tokens.scope || null,
      })
      .where(eq(mcpServers.id, stateData.serverId));
    
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
