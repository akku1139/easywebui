import { eq, and } from 'drizzle-orm';
import { Database } from './db';
import * as schema from '../src/db/schema';

// OAuth 2.1 utilities for MCP servers
// Based on MCP Authorization Specification (2025-06-18)

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  authEndpoint: string;
  scopes?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string;
}

// Generate PKCE code verifier (43-128 characters)
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// Generate PKCE code challenge from verifier
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

// Base64 URL encode (no padding, URL-safe)
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Generate random state parameter
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// Store OAuth state for PKCE flow
export async function storeOAuthState(
  db: Database,
  serverId: string,
  state: string,
  codeVerifier: string,
  expiresInMinutes: number = 10
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000);

  await db.insert(schema.oauthStates).values({
    id: crypto.randomUUID(),
    serverId,
    state,
    codeVerifier,
    createdAt: now,
    expiresAt,
  });
}

// Retrieve and validate OAuth state
export async function retrieveOAuthState(
  db: Database,
  state: string
): Promise<{ serverId: string; codeVerifier: string } | null> {
  const now = new Date();
  
  const result = await db
    .select()
    .from(schema.oauthStates)
    .where(and(
      eq(schema.oauthStates.state, state),
      // Only return non-expired states
    ))
    .get();

  if (!result || result.expiresAt < now) {
    // Clean up expired state if found
    if (result) {
      await db.delete(schema.oauthStates).where(eq(schema.oauthStates.id, result.id));
    }
    return null;
  }

  // Delete used state (one-time use)
  await db.delete(schema.oauthStates).where(eq(schema.oauthStates.id, result.id));

  return {
    serverId: result.serverId,
    codeVerifier: result.codeVerifier,
  };
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  tokenEndpoint: string,
  code: string,
  codeVerifier: string,
  clientId: string,
  clientSecret?: string,
  redirectUri?: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: clientId,
  });

  if (clientSecret) {
    body.append('client_secret', clientSecret);
  }

  if (redirectUri) {
    body.append('redirect_uri', redirectUri);
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scopes: data.scope,
  };
}

// Refresh access token
export async function refreshAccessToken(
  tokenEndpoint: string,
  refreshToken: string,
  clientId: string,
  clientSecret?: string
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  if (clientSecret) {
    body.append('client_secret', clientSecret);
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scopes: data.scope,
  };
}

// Update MCP server with new OAuth tokens
export async function updateMCPServerTokens(
  db: Database,
  serverId: string,
  tokens: OAuthTokens
): Promise<void> {
  await db
    .update(schema.mcpServers)
    .set({
      oauthAccessToken: tokens.accessToken,
      oauthRefreshToken: tokens.refreshToken,
      oauthTokenExpiresAt: tokens.expiresAt,
      oauthScopes: tokens.scopes,
    })
    .where(eq(schema.mcpServers.id, serverId));
}

// Get valid access token for MCP server (refresh if needed)
export async function getValidAccessToken(
  db: Database,
  serverId: string
): Promise<string | null> {
  const server = await db
    .select()
    .from(schema.mcpServers)
    .where(eq(schema.mcpServers.id, serverId))
    .get();

  if (!server || !server.oauthEnabled) {
    return null;
  }

  const now = new Date();
  
  // Check if current token is still valid (with 5 minute buffer)
  if (server.oauthAccessToken && server.oauthTokenExpiresAt) {
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    if (server.oauthTokenExpiresAt.getTime() - bufferTime > now.getTime()) {
      return server.oauthAccessToken;
    }
  }

  // Token expired or missing, try to refresh
  if (server.oauthRefreshToken && server.oauthTokenEndpoint && server.oauthClientId) {
    try {
      const tokens = await refreshAccessToken(
        server.oauthTokenEndpoint,
        server.oauthRefreshToken,
        server.oauthClientId,
        server.oauthClientSecret || undefined
      );

      await updateMCPServerTokens(db, serverId, tokens);
      return tokens.accessToken;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  return null;
}

// Build OAuth authorization URL
export function buildAuthorizationUrl(
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

// Discover OAuth metadata from MCP server
export async function discoverOAuthMetadata(serverUrl: string): Promise<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
} | null> {
  try {
    // Try well-known OAuth metadata endpoint
    const metadataUrl = new URL('/.well-known/oauth-authorization-server', serverUrl);
    const response = await fetch(metadataUrl.toString());

    if (response.ok) {
      const metadata = await response.json() as {
        authorization_endpoint?: string;
        token_endpoint?: string;
      };

      if (metadata.authorization_endpoint && metadata.token_endpoint) {
        return {
          authorizationEndpoint: metadata.authorization_endpoint,
          tokenEndpoint: metadata.token_endpoint,
        };
      }
    }

    // Fallback: try OpenID Connect discovery
    const oidcUrl = new URL('/.well-known/openid-configuration', serverUrl);
    const oidcResponse = await fetch(oidcUrl.toString());

    if (oidcResponse.ok) {
      const oidcMetadata = await oidcResponse.json() as {
        authorization_endpoint?: string;
        token_endpoint?: string;
      };

      if (oidcMetadata.authorization_endpoint && oidcMetadata.token_endpoint) {
        return {
          authorizationEndpoint: oidcMetadata.authorization_endpoint,
          tokenEndpoint: oidcMetadata.token_endpoint,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('OAuth metadata discovery failed:', error);
    return null;
  }
}
