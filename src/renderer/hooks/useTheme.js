import { useState, useEffect } from 'react';

const useTheme = () => {
  const [theme, setTheme] = useState('dark');
  const [isSystemTheme, setIsSystemTheme] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      // Electron environment - force dark theme
      window.electronAPI.setTheme('dark');
    } else {
      // Web environment - force dark theme
      localStorage.setItem('theme', 'dark');
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.className = `theme-${theme}`;
  }, [theme]);

  const toggleTheme = async () => {
    // Theme is locked to dark mode - no action needed
    return;
  };

  const setSystemTheme = async () => {
    // Theme is locked to dark mode - no action needed
    return;
  };

  return {
    theme,
    isSystemTheme,
    toggleTheme,
    setSystemTheme,
    isDark: theme === 'dark'
  };
};

export default useTheme;