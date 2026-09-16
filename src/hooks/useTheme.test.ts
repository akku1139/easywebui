import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
  });

  it('should apply dark theme to document', () => {
    renderHook(() => useTheme('dark'));
    
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('should apply light theme to document', () => {
    renderHook(() => useTheme('light'));
    
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should store theme in localStorage', () => {
    renderHook(() => useTheme('dark'));
    
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('should switch theme when prop changes', () => {
    const { rerender } = renderHook(
      ({ theme }) => useTheme(theme),
      { initialProps: { theme: 'dark' as 'light' | 'dark' } }
    );
    
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    
    rerender({ theme: 'light' });
    
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
