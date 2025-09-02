import React, { useState } from 'react';
import UserPreferences from './UserPreferences.js';
import './UserPreferencesButton.css';

/**
 * User Preferences Button Component
 * A button that opens the user preferences modal
 */
const UserPreferencesButton = ({ 
  variant = 'icon', // 'icon', 'text', 'both'
  size = 'medium', // 'small', 'medium', 'large'
  className = '',
  children,
  ...props 
}) => {
  const [showPreferences, setShowPreferences] = useState(false);

  const handleOpenPreferences = () => {
    setShowPreferences(true);
  };

  const handleClosePreferences = () => {
    setShowPreferences(false);
  };

  const getButtonContent = () => {
    if (children) {
      return children;
    }

    switch (variant) {
      case 'icon':
        return (
          <span className="preferences-icon" title="User Preferences">
            ⚙️
          </span>
        );
      case 'text':
        return 'Preferences';
      case 'both':
        return (
          <>
            <span className="preferences-icon">⚙️</span>
            <span className="preferences-text">Preferences</span>
          </>
        );
      default:
        return (
          <span className="preferences-icon" title="User Preferences">
            ⚙️
          </span>
        );
    }
  };

  return (
    <>
      <button
        className={`user-preferences-button ${variant} ${size} ${className}`}
        onClick={handleOpenPreferences}
        type="button"
        aria-label="Open user preferences"
        {...props}
      >
        {getButtonContent()}
      </button>
      
      {showPreferences && (
        <UserPreferences onClose={handleClosePreferences} />
      )}
    </>
  );
};

export default UserPreferencesButton;