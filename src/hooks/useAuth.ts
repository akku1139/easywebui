import { useState, useCallback, useEffect } from 'react';
import { AuthState } from '../types';

const AUTH_KEY = 'ai-chat-auth';

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { isAuthenticated: false, username: '', token: '' };
      }
    }
    return { isAuthenticated: false, username: '', token: '' };
  });

  // Check authentication status on mount and periodically
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/check', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json() as { username: string; token: string };
          const newAuth = {
            isAuthenticated: true,
            username: data.username,
            token: data.token,
          };
          setAuth(newAuth);
          localStorage.setItem(AUTH_KEY, JSON.stringify(newAuth));
        } else if (response.status === 401) {
          // Not authenticated
          setAuth({ isAuthenticated: false, username: '', token: '' });
          localStorage.removeItem(AUTH_KEY);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      }
    };

    checkAuth();
    // Check every 5 minutes
    const interval = setInterval(checkAuth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const logout = useCallback(() => {
    setAuth({ isAuthenticated: false, username: '', token: '' });
    localStorage.removeItem(AUTH_KEY);
    // Force browser to show Basic Auth dialog again
    window.location.href = '/';
  }, []);

  return { auth, logout };
}
