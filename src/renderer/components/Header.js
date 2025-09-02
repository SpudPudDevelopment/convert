import React from 'react';
import { FaCog, FaSun, FaMoon, FaPalette, FaExchangeAlt, FaList, FaCogs, FaShieldAlt } from 'react-icons/fa';

const Header = ({ 
  theme, 
  onThemeToggle, 
  onPrivacySettingsClick,
  showThemeToggle = true 
}) => {
  return (
    <header className="header">
      <div className="nav-container">
        <div className="nav-brand">
          <div className="nav-logo">
            <FaCog />
          </div>
          <div>
            <div className="nav-title">Convert</div>
            <div className="nav-subtitle">Universal File Converter</div>
          </div>
        </div>
        
        <div className="nav-controls">
          {showThemeToggle && (
            <div className="theme-toggle">
              <button
                className="theme-toggle-btn"
                onClick={onThemeToggle}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <FaSun className="theme-icon" /> : <FaMoon className="theme-icon" />}
                <span className="theme-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
            </div>
          )}
          
          <div className="nav-box">
            <button
              className="nav-item"
              onClick={onPrivacySettingsClick}
              aria-label="Privacy settings"
            >
              <FaShieldAlt className="nav-item-icon" />
              <span className="nav-item-text">Privacy</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;