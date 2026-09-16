import { useState } from 'react';
import { AuthState } from '../types';

const AUTH_KEY = 'ai-chat-auth';

export function useAuth() {
  // Browser handles Basic Auth natively
  // If we reach this point, user is already authenticated
  const [auth] = useState<AuthState>(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { isAuthenticated: true, username: '', token: '' };
      }
    }
    return { isAuthenticated: true, username: '', token: '' };
  });

  return { auth };
}
