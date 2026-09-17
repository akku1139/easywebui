import { Context } from 'hono';
import { Env } from '../index';

export async function handleMCPOAuth(c: Context<{ Bindings: Env }>) {
  const path = c.req.path;
  const db = c.env.AI_CHAT_DB;

  // Discover OAuth metadata
  if (path === '/api/mcp-oauth/discover') {
    const { serverUrl } = await c.req.json();
    
    try {
      // Try well-known OAuth metadata endpoint
      const metadataUrl = new URL('/.well-known/oauth-authorization-server', serverUrl);
      const response = await fetch(metadataUrl.toString());
      
      if (response.ok) {
        const metadata = await response.json() as {
          authorization_endpoint?: string;
          token_endpoint?: string;
          registration_endpoint?: string;
        };
        
        if (metadata.authorization_endpoint && metadata.token_endpoint) {
          return c.json({
            authorizationEndpoint: metadata.authorization_endpoint,
            tokenEndpoint: metadata.token_endpoint,
            registrationEndpoint: metadata.registration_endpoint,
          });
        }
      }
      
      // Try OpenID Connect discovery
      const oidcUrl = new URL('/.well-known/openid-configuration', serverUrl);
      const oidcResponse = await fetch(oidcUrl.toString());
      
      if (oidcResponse.ok) {
        const oidcMetadata = await oidcResponse.json() as {
          authorization_endpoint?: string;
          token_endpoint?: string;
          registration_endpoint?: string;
        };
        
        if (oidcMetadata.authorization_endpoint && oidcMetadata.token_endpoint) {
          return c.json({
            authorizationEndpoint: oidcMetadata.authorization_endpoint,
            tokenEndpoint: oidcMetadata.token_endpoint,
            registrationEndpoint: oidcMetadata.registration_endpoint,
          });
        }
      }
      
      return c.json({ error: 'OAuth metadata not found' }, 404);
    } catch (error) {
      console.error('OAuth discovery failed:', error);
      return c.json({ error: 'Discovery failed' }, 500);
    }
  }

  // Dynamic Client Registration
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
      // Register client with the authorization server
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
          token_endpoint_auth_method: 'none', // Public client
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
        registration_access_token?: string;
      };
      
      // Update server with client credentials
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

  // Initiate OAuth flow
  if (path === '/api/mcp-oauth/initiate') {
    const { serverId } = await c.req.json();
    
    const server = await db.prepare(
      'SELECT * FROM mcp_servers WHERE id = ?'
    ).bind(serverId).first() as any;
    
    if (!server || !server.oauth_enabled) {
      return c.json({ error: 'Server not found or OAuth not enabled' }, 404);
    }
    
    // If no client_id, try to register dynamically
    if (!server.oauth_client_id && server.oauth_registration_endpoint) {
      const redirectUri = `${new URL(c.req.url).origin}/oauth-callback`;
      
      try {
        const registrationResponse = await fetch(server.oauth_registration_endpoint, {
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
        
        if (registrationResponse.ok) {
          const registrationData = await registrationResponse.json() as {
            client_id: string;
            client_secret?: string;
          };
          
          // Update server with client credentials
          await db.prepare(
            'UPDATE mcp_servers SET oauth_client_id = ?, oauth_client_secret = ? WHERE id = ?'
          ).bind(
            registrationData.client_id,
            registrationData.client_secret || null,
            serverId
          ).run();
          
          server.oauth_client_id = registrationData.client_id;
          server.oauth_client_secret = registrationData.client_secret || null;
        }
      } catch (error) {
        console.error('Dynamic client registration failed:', error);
        return c.json({ error: 'Client registration required' }, 400);
      }
    }
    
    if (!server.oauth_client_id) {
      return c.json({ error: 'Client ID required' }, 400);
    }
    
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    
    // Store state in database
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes
    
    await db.prepare(
      'INSERT INTO oauth_states (id, server_id, state, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(),
      serverId,
      state,
      codeVerifier,
      now,
      expiresAt
    ).run();
    
    // Build authorization URL
    const redirectUri = `${new URL(c.req.url).origin}/oauth-callback`;
    const authUrl = buildAuthorizationUrl(
      server.oauth_auth_endpoint,
      server.oauth_client_id,
      redirectUri,
      state,
      codeChallenge,
      server.oauth_scopes || undefined
    );
    
    return c.json({ authorizationUrl: authUrl, state });
  }

  // Handle OAuth callback
  if (path === '/api/mcp-oauth/callback') {
    const method = c.req.method;
    
    if (method === 'GET') {
      // Browser redirect from OAuth provider
      const code = c.req.query('code');
      const state = c.req.query('state');
      const error = c.req.query('error');
      
      if (error) {
        return c.html(`
          <html>
            <body>
              <h1>OAuth Error</h1>
              <p>${error}</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
      }
      
      if (!code || !state) {
        return c.html(`
          <html>
            <body>
              <h1>OAuth Error</h1>
              <p>Missing code or state parameter</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
      }
      
      // Redirect to frontend callback page
      return c.redirect(`/oauth-callback?code=${code}&state=${state}`);
    }
    
    if (method === 'POST') {
      // Frontend callback
      const { code, state } = await c.req.json();
      
      if (!code || !state) {
        return c.json({ error: 'Missing code or state' }, 400);
      }
      
      // Retrieve state from database
      const stateData = await db.prepare(
        'SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?'
      ).bind(state, Date.now()).first() as any;

      if (!stateData) {
        return c.json({ error: 'Invalid or expired state' }, 400);
      }
      
      // Delete used state
      await db.prepare('DELETE FROM oauth_states WHERE id = ?').bind(stateData.id).run();
      
      // Get server configuration
      const server = await db.prepare(
        'SELECT * FROM mcp_servers WHERE id = ?'
      ).bind(stateData.server_id).first() as any;
      
      if (!server || !server.oauth_token_endpoint) {
        return c.json({ error: 'Server configuration not found' }, 404);
      }
      
      // Exchange code for tokens
      try {
        const redirectUri = `${new URL(c.req.url).origin}/oauth-callback`;
        
        const tokenResponse = await fetch(server.oauth_token_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            code_verifier: stateData.code_verifier,
            client_id: server.oauth_client_id,
            redirect_uri: redirectUri,
            ...(server.oauth_client_secret ? { client_secret: server.oauth_client_secret } : {}),
          }).toString(),
        });
        
        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          return c.json({ error: `Token exchange failed: ${errorText}` }, 400);
        }
        
        const tokens = await tokenResponse.json() as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
        };
        
        // Schema uses timestamp (seconds) mode; store epoch seconds
        const expiresAt = tokens.expires_in
          ? Math.floor(Date.now() / 1000) + tokens.expires_in
          : null;
        
        // Update server with tokens
        await db.prepare(
          'UPDATE mcp_servers SET oauth_access_token = ?, oauth_refresh_token = ?, oauth_token_expires_at = ?, oauth_scopes = ? WHERE id = ?'
        ).bind(
          tokens.access_token,
          tokens.refresh_token || null,
          expiresAt,
          tokens.scope || null,
          stateData.server_id
        ).run();
        
        return c.json({ success: true, serverId: stateData.server_id });
      } catch (error) {
        console.error('Token exchange failed:', error);
        return c.json({ error: 'Token exchange failed' }, 500);
      }
    }
  }
  
  return c.json({ error: 'Not found' }, 404);
}

// PKCE utility functions
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
  
  const url = new URL(authEndpoint);
  params.forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
}
