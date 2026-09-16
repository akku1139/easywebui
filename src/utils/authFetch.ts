// Authenticated fetch wrapper
// Adds Basic Auth header to all API requests

const AUTH_KEY = 'ai-chat-auth';

export function getAuthHeaders(): Record<string, string> {
  const stored = localStorage.getItem(AUTH_KEY);
  if (stored) {
    try {
      const auth = JSON.parse(stored);
      if (auth.token) {
        return {
          'Authorization': `Basic ${auth.token}`,
        };
      }
    } catch {
      // Ignore parse errors
    }
  }
  return {};
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
}
