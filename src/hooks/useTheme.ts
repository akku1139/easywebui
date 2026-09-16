import { useEffect } from 'react';

export function useTheme(theme: 'light' | 'dark') {
  useEffect(() => {
    // Apply theme to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    
    // Store in localStorage for persistence
    localStorage.setItem('theme', theme);
  }, [theme]);
}
