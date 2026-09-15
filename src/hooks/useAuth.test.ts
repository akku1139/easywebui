import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should start unauthenticated', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.username).toBe('');
  });

  it('should login with correct credentials', () => {
    const { result } = renderHook(() => useAuth());

    act(() => {
      const success = result.current.login('admin', 'admin123');
      expect(success).toBe(true);
    });

    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.username).toBe('admin');
    expect(result.current.auth.token).toBeTruthy();
  });

  it('should reject incorrect credentials', () => {
    const { result } = renderHook(() => useAuth());

    act(() => {
      const success = result.current.login('admin', 'wrong');
      expect(success).toBe(false);
    });

    expect(result.current.auth.isAuthenticated).toBe(false);
  });

  it('should logout', () => {
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.login('admin', 'admin123');
    });

    expect(result.current.auth.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.username).toBe('');
  });

  it('should persist auth state in localStorage', () => {
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.login('admin', 'admin123');
    });

    // Check localStorage
    const stored = localStorage.getItem('ai-chat-auth');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.isAuthenticated).toBe(true);
    expect(parsed.username).toBe('admin');
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
});
