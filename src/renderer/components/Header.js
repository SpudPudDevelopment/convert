import React from 'react';
import { FaCog, FaSun, FaMoon, FaPalette, FaExchangeAlt, FaList, FaCogs } from 'react-icons/fa';

const Header = ({ 
  currentTheme, 
  onThemeChange, 
  onSettingsClick,
  showThemeToggle = true 
}) => {
  const handleThemeChange = (theme) => {
    onThemeChange(theme);
  };

  return (
    <header className="header">
      <div className="nav-container">
        <div className="nav-brand">
          <div className="nav-logo">
            <FaCog />
          </div>
          <div>
            <div className="nav-title">Convert</div>
            <div className="nav-subtitle">File Conversion Tool</div>
          </div>
        </div>
        
        <div className="nav-controls">
          <div className="nav-box">
            <a href="#converter" className="nav-item active">
              <FaExchangeAlt className="nav-item-icon" />
              <span className="nav-item-text">Converter</span>
            </a>
            <a href="#presets" className="nav-item">
              <FaList className="nav-item-icon" />
              <span className="nav-item-text">Presets</span>
            </a>
            <a href="#settings" className="nav-item">
              <FaCogs className="nav-item-icon" />
              <span className="nav-item-text">Settings</span>
            </a>
          </div>
          
          {showThemeToggle && (
            <div className="theme-toggle">
              <button
                className="theme-toggle-btn"
                onClick={() => onSettingsClick()}
                aria-label="Open settings"
              >
                <FaPalette className="theme-icon" />
                <span className="theme-label">Theme</span>
              </button>
              
              <div className="theme-options">
                <button
                  className={`theme-option ${currentTheme === 'light' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('light')}
                  aria-label="Light theme"
                >
                  <FaSun className="theme-icon" />
                  Light
                </button>
                <button
                  className={`theme-option ${currentTheme === 'dark' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('dark')}
                  aria-label="Dark theme"
                >
                  <FaMoon className="theme-icon" />
                  Dark
                </button>
                <button
                  className={`theme-option ${currentTheme === 'auto' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('auto')}
                  aria-label="Auto theme"
                >
                  <FaPalette className="theme-icon" />
                  Auto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;