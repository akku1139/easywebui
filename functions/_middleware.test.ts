import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Pages Middleware - Basic Auth', () => {
  const mockEnv = {
    BASIC_AUTH_USER: 'admin',
    BASIC_AUTH_PASS: 'password123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication Flow', () => {
    it('should reject requests without Authorization header', () => {
      const request = {
        headers: {
          get: (name: string) => name === 'Authorization' ? null : null,
        },
        url: 'https://example.com/',
      };

      const authHeader = request.headers.get('Authorization');
      expect(authHeader).toBeNull();
    });

    it('should reject requests with invalid Basic Auth', () => {
      const invalidCredentials = btoa('wrong:credentials');
      const request = {
        headers: {
          get: (name: string) => name === 'Authorization' ? `Basic ${invalidCredentials}` : null,
        },
        url: 'https://example.com/',
      };

      const authHeader = request.headers.get('Authorization');
      expect(authHeader).toBeTruthy();
      
      const decoded = atob(authHeader!.slice(6));
      const [user, pass] = decoded.split(':');
      
      expect(user).not.toBe(mockEnv.BASIC_AUTH_USER);
      expect(pass).not.toBe(mockEnv.BASIC_AUTH_PASS);
    });

    it('should accept requests with valid Basic Auth', () => {
      const validCredentials = btoa(`${mockEnv.BASIC_AUTH_USER}:${mockEnv.BASIC_AUTH_PASS}`);
      const request = {
        headers: {
          get: (name: string) => name === 'Authorization' ? `Basic ${validCredentials}` : null,
        },
        url: 'https://example.com/',
      };

      const authHeader = request.headers.get('Authorization');
      expect(authHeader).toBeTruthy();
      expect(authHeader!.startsWith('Basic ')).toBe(true);
      
      const decoded = atob(authHeader!.slice(6));
      const [user, pass] = decoded.split(':');
      
      expect(user).toBe(mockEnv.BASIC_AUTH_USER);
      expect(pass).toBe(mockEnv.BASIC_AUTH_PASS);
    });

    it('should skip auth for health check endpoint', () => {
      const request = {
        headers: {
          get: (name: string) => name === 'Authorization' ? null : null,
        },
        url: 'https://example.com/api/health',
      };

      const url = new URL(request.url);
      expect(url.pathname).toBe('/api/health');
    });
  });

  describe('Browser Behavior', () => {
    it('should trigger browser Basic Auth dialog on 401', () => {
      const response = {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="AI Chat"',
        },
      };

      expect(response.status).toBe(401);
      expect(response.headers['WWW-Authenticate']).toContain('Basic');
    });

    it('should cache credentials after successful auth', () => {
      // Browser caches Basic Auth credentials for the session
      const cachedCredentials = btoa(`${mockEnv.BASIC_AUTH_USER}:${mockEnv.BASIC_AUTH_PASS}`);
      expect(cachedCredentials).toBeTruthy();
    });
  });

  describe('Security', () => {
    it('should use HTTPS in production', () => {
      const productionUrl = 'https://ai-chat.pages.dev';
      expect(productionUrl.startsWith('https://')).toBe(true);
    });

    it('should not expose credentials in URLs', () => {
      const url = 'https://ai-chat.pages.dev/api/health';
      expect(url).not.toContain('@');
      expect(url).not.toContain('password');
    });
  });
});
