import React from 'react';
import useTheme from '../hooks/useTheme';

const ThemeToggle = () => {
  const { theme } = useTheme();

  return (
    <div className="theme-toggle">
      <div className="theme-indicator">
        <span className="theme-icon" aria-hidden="true">
          🌙
        </span>
        <span className="theme-label">
          Dark
        </span>
      </div>
    </div>
  );
};

export default ThemeToggle;