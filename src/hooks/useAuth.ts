import { useState, useCallback } from 'react';
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

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      // Verify credentials with backend API
      const token = btoa(`${username}:${password}`);
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${token}`,
        },
      });

      if (response.ok) {
        const newAuth = { isAuthenticated: true, username, token };
        setAuth(newAuth);
        localStorage.setItem(AUTH_KEY, JSON.stringify(newAuth));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setAuth({ isAuthenticated: false, username: '', token: '' });
    localStorage.removeItem(AUTH_KEY);
  }, []);

  return { auth, login, logout };
}
