import React, { useState, useEffect } from 'react';
import {
  useUserPreferencesContext,
  useThemePreferences,
  usePresetPreferences,
  useRecentJobsPreferences
} from '../contexts/UserPreferencesContext.js';
import { UserPreferences } from '../models/UserPreferences.js';
import ImportExportModal from './ImportExportModal.js';
import './UserPreferences.css';

/**
 * User Preferences Settings Component
 * Provides a comprehensive interface for managing user preferences
 */
const UserPreferencesComponent = ({ onClose }) => {
  const {
    preferences,
    loading,
    error,
    updatePreference,
    updatePreferences,
    resetPreferences,
    exportPreferences,
    importPreferences,
    getStatistics
  } = useUserPreferencesContext();
  
  const { theme, changeTheme } = useThemePreferences();
  const { getPresets } = usePresetPreferences();
  const { getRecentJobs, clearRecentJobs } = useRecentJobsPreferences();
  
  const [activeTab, setActiveTab] = useState('general');
  const [localChanges, setLocalChanges] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showClearJobsConfirm, setShowClearJobsConfirm] = useState(false);
  const [importExportStatus, setImportExportStatus] = useState(null);
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [importExportMode, setImportExportMode] = useState('export'); // 'import' or 'export'

  // Load statistics on mount
  useEffect(() => {
    const loadStatistics = async () => {
      try {
        const stats = await getStatistics();
        setStatistics(stats);
      } catch (err) {
        console.error('Failed to load statistics:', err);
      }
    };
    
    if (preferences) {
      loadStatistics();
    }
  }, [preferences, getStatistics]);

  // Handle local preference changes
  const handleLocalChange = (path, value) => {
    setLocalChanges(prev => ({
      ...prev,
      [path]: value
    }));
    setHasUnsavedChanges(true);
  };

  // Get current value (local changes take precedence)
  const getCurrentValue = (path, defaultValue = '') => {
    if (localChanges[path] !== undefined) {
      return localChanges[path];
    }
    
    if (!preferences) return defaultValue;
    
    const keys = path.split('.');
    let value = preferences;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  };

  // Save all local changes
  const saveChanges = async () => {
    try {
      if (Object.keys(localChanges).length > 0) {
        await updatePreferences(localChanges);
        setLocalChanges({});
        setHasUnsavedChanges(false);
      }
    } catch (err) {
      console.error('Failed to save preferences:', err);
    }
  };

  // Discard local changes
  const discardChanges = () => {
    setLocalChanges({});
    setHasUnsavedChanges(false);
  };

  // Reset preferences
  const handleReset = async (section = null) => {
    try {
      await resetPreferences(section);
      setLocalChanges({});
      setHasUnsavedChanges(false);
      setShowResetConfirm(false);
    } catch (err) {
      console.error('Failed to reset preferences:', err);
    }
  };

  // Open export modal
  const handleExport = () => {
    setImportExportMode('export');
    setShowImportExportModal(true);
  };
  
  // Handle enhanced export with options
  const handleEnhancedExport = async (options) => {
    try {
      const exportData = await exportPreferences(options);
      return exportData;
    } catch (err) {
      console.error('Failed to export preferences:', err);
      throw err;
    }
  };

  // Open import modal
  const handleImport = () => {
    setImportExportMode('import');
    setShowImportExportModal(true);
  };
  
  // Handle enhanced import with options
  const handleEnhancedImport = async (importData, options) => {
    try {
      await importPreferences(importData, options);
      setLocalChanges({});
      setHasUnsavedChanges(false);
      return true;
    } catch (err) {
      console.error('Failed to import preferences:', err);
      throw err;
    }
  };

  // Clear recent jobs
  const handleClearRecentJobs = async () => {
    try {
      await clearRecentJobs();
      setShowClearJobsConfirm(false);
    } catch (err) {
      console.error('Failed to clear recent jobs:', err);
    }
  };

  if (loading) {
    return (
      <div className="user-preferences loading">
        <div className="loading-spinner">Loading preferences...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-preferences error">
        <div className="error-message">
          <h3>Error Loading Preferences</h3>
          <p>{error}</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'conversion', label: 'Conversion', icon: '🔄' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'advanced', label: 'Advanced', icon: '🔧' },
    { id: 'data', label: 'Data & Privacy', icon: '🛡️' }
  ];

  return (
    <div className="user-preferences">
      <div className="preferences-header">
        <h2>User Preferences</h2>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="preferences-content">
        <div className="preferences-sidebar">
          <nav className="preferences-tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
          
          {statistics && (
            <div className="preferences-stats">
              <h4>Statistics</h4>
              <div className="stat-item">
                <span>Presets:</span>
                <span>{getPresets().length}</span>
              </div>
              <div className="stat-item">
                <span>Recent Jobs:</span>
                <span>{getRecentJobs().length}</span>
              </div>
              <div className="stat-item">
                <span>Storage Used:</span>
                <span>{statistics.storageSize || 'N/A'}</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="preferences-main">
          {activeTab === 'general' && (
            <GeneralSettings
              getCurrentValue={getCurrentValue}
              handleLocalChange={handleLocalChange}
            />
          )}
          
          {activeTab === 'appearance' && (
            <AppearanceSettings
              getCurrentValue={getCurrentValue}
              handleLocalChange={handleLocalChange}
              theme={theme}
              changeTheme={changeTheme}
            />
          )}
          
          {activeTab === 'conversion' && (
            <ConversionSettings
              getCurrentValue={getCurrentValue}
              handleLocalChange={handleLocalChange}
            />
          )}
          
          {activeTab === 'notifications' && (
            <NotificationSettings
              getCurrentValue={getCurrentValue}
              handleLocalChange={handleLocalChange}
            />
          )}
          
          {activeTab === 'advanced' && (
            <AdvancedSettings
              getCurrentValue={getCurrentValue}
              handleLocalChange={handleLocalChange}
            />
          )}
          
          {activeTab === 'data' && (
            <DataPrivacySettings
              onExport={handleExport}
              onImport={handleImport}
              onReset={() => setShowResetConfirm(true)}
              onClearRecentJobs={() => setShowClearJobsConfirm(true)}
            />
          )}
        </div>
      </div>
      
      <div className="preferences-footer">
        <div className="footer-left">
          {hasUnsavedChanges && (
            <span className="unsaved-indicator">• Unsaved changes</span>
          )}
        </div>
        <div className="footer-right">
          {hasUnsavedChanges && (
            <>
              <button className="discard-button" onClick={discardChanges}>
                Discard
              </button>
              <button className="save-button" onClick={saveChanges}>
                Save Changes
              </button>
            </>
          )}
          <button className="close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      
      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Reset Preferences</h3>
            <p>Are you sure you want to reset all preferences to their default values? This action cannot be undone.</p>
            <div className="modal-actions">
              <button onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button className="danger" onClick={() => handleReset()}>Reset All</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Clear Recent Jobs Confirmation Modal */}
      {showClearJobsConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Clear Recent Jobs</h3>
            <p>Are you sure you want to clear all recent job history? This action cannot be undone.</p>
            <div className="modal-actions">
              <button onClick={() => setShowClearJobsConfirm(false)}>Cancel</button>
              <button className="danger" onClick={handleClearRecentJobs}>Clear All</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Enhanced Import/Export Modal */}
      <ImportExportModal
        isOpen={showImportExportModal}
        onClose={() => setShowImportExportModal(false)}
        mode={importExportMode}
        onExport={handleEnhancedExport}
        onImport={handleEnhancedImport}
        preferences={preferences}
      />
    </div>
  );
};

// General Settings Component
const GeneralSettings = ({ getCurrentValue, handleLocalChange }) => {
  return (
    <div className="settings-section">
      <h3>General Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="defaultOutputDirectory">Default Output Directory</label>
        <div className="input-with-button">
          <input
            id="defaultOutputDirectory"
            type="text"
            value={getCurrentValue('defaultOutputDirectory')}
            onChange={(e) => handleLocalChange('defaultOutputDirectory', e.target.value)}
            placeholder="Choose default output directory..."
          />
          <button className="browse-button">Browse</button>
        </div>
        <small>Default location where converted files will be saved</small>
      </div>
      
      <div className="setting-group">
        <label htmlFor="concurrentConversions">Concurrent Conversions</label>
        <input
          id="concurrentConversions"
          type="number"
          min="1"
          max="8"
          value={getCurrentValue('concurrentConversions', 2)}
          onChange={(e) => handleLocalChange('concurrentConversions', parseInt(e.target.value))}
        />
        <small>Number of files to convert simultaneously (1-8)</small>
      </div>
      
      <div className="setting-group">
        <label htmlFor="autoSave">Auto-save Settings</label>
        <input
          id="autoSave"
          type="checkbox"
          checked={getCurrentValue('autoSave', true)}
          onChange={(e) => handleLocalChange('autoSave', e.target.checked)}
        />
        <small>Automatically save preferences when changed</small>
      </div>
    </div>
  );
};

// Appearance Settings Component
const AppearanceSettings = ({ getCurrentValue, handleLocalChange, theme, changeTheme }) => {
  return (
    <div className="settings-section">
      <h3>Appearance</h3>
      
      <div className="setting-group">
        <label>Theme</label>
        <div className="theme-options">
          <label className="theme-option">
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={true}
              readOnly
            />
            <span className="theme-label">
              Dark
            </span>
          </label>
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="language">Language</label>
        <select
          id="language"
          value={getCurrentValue('appearance.language', 'en')}
          onChange={(e) => handleLocalChange('appearance.language', e.target.value)}
        >
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
        </select>
      </div>
      
      <div className="setting-group">
        <label htmlFor="fontSize">Font Size</label>
        <select
          id="fontSize"
          value={getCurrentValue('appearance.fontSize', 'medium')}
          onChange={(e) => handleLocalChange('appearance.fontSize', e.target.value)}
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>
      
      <div className="setting-group">
        <label htmlFor="compactMode">Compact Mode</label>
        <input
          id="compactMode"
          type="checkbox"
          checked={getCurrentValue('appearance.compactMode', false)}
          onChange={(e) => handleLocalChange('appearance.compactMode', e.target.checked)}
        />
        <small>Use a more compact interface layout</small>
      </div>
    </div>
  );
};

// Conversion Settings Component
const ConversionSettings = ({ getCurrentValue, handleLocalChange }) => {
  return (
    <div className="settings-section">
      <h3>Conversion Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="defaultQuality">Default Quality</label>
        <select
          id="defaultQuality"
          value={getCurrentValue('conversion.defaultQuality', 'high')}
          onChange={(e) => handleLocalChange('conversion.defaultQuality', e.target.value)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="lossless">Lossless</option>
        </select>
      </div>
      
      <div className="setting-group">
        <label htmlFor="preserveMetadata">Preserve Metadata</label>
        <input
          id="preserveMetadata"
          type="checkbox"
          checked={getCurrentValue('conversion.preserveMetadata', true)}
          onChange={(e) => handleLocalChange('conversion.preserveMetadata', e.target.checked)}
        />
        <small>Keep original file metadata when converting</small>
      </div>
      
      <div className="setting-group">
        <label htmlFor="overwriteExisting">Overwrite Existing Files</label>
        <input
          id="overwriteExisting"
          type="checkbox"
          checked={getCurrentValue('conversion.overwriteExisting', false)}
          onChange={(e) => handleLocalChange('conversion.overwriteExisting', e.target.checked)}
        />
        <small>Automatically overwrite files with the same name</small>
      </div>
    </div>
  );
};

// Notification Settings Component
const NotificationSettings = ({ getCurrentValue, handleLocalChange }) => {
  return (
    <div className="settings-section">
      <h3>Notifications</h3>
      
      <div className="setting-group">
        <label htmlFor="conversionComplete">Conversion Complete</label>
        <input
          id="conversionComplete"
          type="checkbox"
          checked={getCurrentValue('notifications.conversionComplete', true)}
          onChange={(e) => handleLocalChange('notifications.conversionComplete', e.target.checked)}
        />
        <small>Show notification when conversion finishes</small>
      </div>
      
      <div className="setting-group">
        <label htmlFor="conversionError">Conversion Errors</label>
        <input
          id="conversionError"
          type="checkbox"
          checked={getCurrentValue('notifications.conversionError', true)}
          onChange={(e) => handleLocalChange('notifications.conversionError', e.target.checked)}
        />
        <small>Show notification when conversion fails</small>
      </div>
      
      <div className="setting-group">
        <label htmlFor="soundEnabled">Sound Notifications</label>
        <input
          id="soundEnabled"
          type="checkbox"
          checked={getCurrentValue('notifications.soundEnabled', false)}
          onChange={(e) => handleLocalChange('notifications.soundEnabled', e.target.checked)}
        />
        <small>Play sound with notifications</small>
      </div>
    </div>
  );
};

// Advanced Settings Component
const AdvancedSettings = ({ getCurrentValue, handleLocalChange }) => {
  return (
    <div className="settings-section">
      <h3>Advanced Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="enableLogging">Enable Logging</label>
        <input
          id="enableLogging"
          type="checkbox"
          checked={getCurrentValue('advanced.enableLogging', true)}
          onChange={(e) => handleLocalChange('advanced.enableLogging', e.target.checked)}
        />
        <small>Enable detailed logging for troubleshooting</small>
      </div>
      
      <div className="setting-group">
        <label htmlFor="logLevel">Log Level</label>
        <select
          id="logLevel"
          value={getCurrentValue('advanced.logLevel', 'info')}
          onChange={(e) => handleLocalChange('advanced.logLevel', e.target.value)}
          disabled={!getCurrentValue('advanced.enableLogging', true)}
        >
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
      </div>
      
      <div className="setting-group">
        <label htmlFor="enableExperimentalFeatures">Experimental Features</label>
        <input
          id="enableExperimentalFeatures"
          type="checkbox"
          checked={getCurrentValue('advanced.enableExperimentalFeatures', false)}
          onChange={(e) => handleLocalChange('advanced.enableExperimentalFeatures', e.target.checked)}
        />
        <small>Enable experimental features (may be unstable)</small>
      </div>
    </div>
  );
};

// Data & Privacy Settings Component
const DataPrivacySettings = ({ onExport, onImport, onReset, onClearRecentJobs }) => {
  return (
    <div className="settings-section">
      <h3>Data & Privacy</h3>
      
      <div className="setting-group">
        <h4>Export & Import</h4>
        <div className="button-group">
          <button onClick={onExport} className="export-button">
            📤 Export Preferences
          </button>
          <button onClick={onImport} className="import-button">
            📥 Import Preferences
          </button>
        </div>
        <small>Backup and restore your preferences with advanced options</small>
      </div>
      
      <div className="setting-group">
        <h4>Data Management</h4>
        <div className="button-group">
          <button onClick={onClearRecentJobs} className="warning">
            Clear Recent Jobs
          </button>
          <button onClick={onReset} className="danger">
            Reset All Preferences
          </button>
        </div>
        <small>These actions cannot be undone</small>
      </div>
    </div>
  );
};

export default UserPreferencesComponent;