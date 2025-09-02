import React, { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';

const Header = () => {
  const [version, setVersion] = useState('');
  const [theme, setTheme] = useState('system');

  useEffect(() => {
    if (window.electronAPI) {
      // Electron environment
      // Get app version
      const getVersion = async () => {
        try {
          const response = await window.electronAPI.getAppVersion();
          if (response.success) {
            setVersion(response.data);
          } else {
            console.error('Failed to get app version:', response.error);
          }
        } catch (error) {
          console.error('Failed to get app version:', error);
        }
      };

      // Get theme info
      const getTheme = async () => {
        try {
          const response = await window.electronAPI.getSystemTheme();
          if (response.success) {
            setTheme(response.data.themeSource);
          } else {
            console.error('Failed to get theme info:', response.error);
          }
        } catch (error) {
          console.error('Failed to get theme info:', error);
        }
      };

      getVersion();
      getTheme();

      // Listen for theme changes
      const unsubscribeTheme = window.electronAPI.onThemeChanged((themeData) => {
        setTheme(themeData.themeSource);
      });

      return () => {
        unsubscribeTheme();
      };
    } else {
      // Web environment fallback
      setVersion('1.0.0'); // Default version for web
      setTheme('system'); // Default theme
    }
  }, []);

  const handleSettingsClick = () => {
    // Dispatch custom event to open privacy settings
    window.dispatchEvent(new CustomEvent('openPrivacySettings'));
  };

  return (
    <header className={`app-header theme-${theme}`}>
      <div className="header-left">
        <ThemeToggle />
      </div>
      <div className="header-content">
        <h1>Convert</h1>
        <p>Universal File Converter</p>
        {version && <span className="version">v{version}</span>}
      </div>
      <div className="header-right">
        <button 
          className="settings-button"
          onClick={handleSettingsClick}
          title="Privacy & Permissions Settings"
          aria-label="Open privacy and permissions settings"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
};

export default Header;