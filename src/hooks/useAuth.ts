import { useState, useCallback } from 'react';
import { AuthState } from '../types';

const AUTH_KEY = 'ai-chat-auth';
const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123'; // In production, this is handled by Cloudflare Workers Basic Auth

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

  const login = useCallback((username: string, password: string): boolean => {
    // Simple client-side auth (in production, Cloudflare Workers handles Basic Auth)
    if (username === DEFAULT_USERNAME && password === DEFAULT_PASSWORD) {
      const token = btoa(`${username}:${password}`);
      const newAuth = { isAuthenticated: true, username, token };
      setAuth(newAuth);
      localStorage.setItem(AUTH_KEY, JSON.stringify(newAuth));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setAuth({ isAuthenticated: false, username: '', token: '' });
    localStorage.removeItem(AUTH_KEY);
  }, []);

  return { auth, login, logout };
}
