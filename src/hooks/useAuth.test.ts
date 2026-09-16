import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should be authenticated by default (browser handles Basic Auth)', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.auth.isAuthenticated).toBe(true);
  });

  it('should restore auth state from localStorage', () => {
    // Pre-populate localStorage
    localStorage.setItem('ai-chat-auth', JSON.stringify({
      isAuthenticated: true,
      username: 'admin',
      token: 'test-token',
    }));

    const { result } = renderHook(() => useAuth());
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.username).toBe('admin');
  });

  it('should provide logout function', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.logout).toBe('function');
  });
});
