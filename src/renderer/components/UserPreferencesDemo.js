import React, { useState, useEffect } from 'react';
import { UserPreferencesProvider } from '../contexts/UserPreferencesContext.js';
import UserPreferencesButton from './UserPreferencesButton.js';
import {
  useUserPreferencesContext,
  useThemePreferences,
  usePresetPreferences,
  useRecentJobsPreferences
} from '../contexts/UserPreferencesContext.js';
import './UserPreferencesDemo.css';

/**
 * User Preferences Demo Component
 * Demonstrates the complete user preferences system functionality
 */
const UserPreferencesDemo = () => {
  return (
    <UserPreferencesProvider>
      <div className="user-preferences-demo">
        <DemoContent />
      </div>
    </UserPreferencesProvider>
  );
};

const DemoContent = () => {
  const {
    preferences,
    loading,
    error,
    updatePreference,
    resetPreferences,
    getStatistics
  } = useUserPreferencesContext();
  
  const { theme, changeTheme } = useThemePreferences();
  const { 
    getPresets, 
    addPreset, 
    removePreset, 
    updatePreset 
  } = usePresetPreferences();
  const { 
    getRecentJobs, 
    addRecentJob, 
    clearRecentJobs 
  } = useRecentJobsPreferences();
  
  const [statistics, setStatistics] = useState(null);
  const [demoPreset, setDemoPreset] = useState({
    name: 'Demo Preset',
    description: 'A sample conversion preset',
    category: 'image',
    settings: {
      format: 'png',
      quality: 'high',
      resize: { width: 1920, height: 1080 }
    }
  });
  const [demoJob, setDemoJob] = useState({
    id: `demo-${Date.now()}`,
    inputFile: '/path/to/demo-image.jpg',
    outputFile: '/path/to/demo-image.png',
    preset: 'Demo Preset',
    status: 'completed',
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 5000).toISOString(),
    fileSize: 2048576,
    outputSize: 1536000
  });

  // Load statistics
  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await getStatistics();
        setStatistics(stats);
      } catch (err) {
        console.error('Failed to load statistics:', err);
      }
    };
    
    if (preferences) {
      loadStats();
    }
  }, [preferences, getStatistics]);

  // Demo functions
  const handleAddDemoPreset = async () => {
    try {
      await addPreset(demoPreset);
      console.log('Demo preset added successfully');
    } catch (err) {
      console.error('Failed to add demo preset:', err);
    }
  };

  const handleAddDemoJob = async () => {
    try {
      await addRecentJob(demoJob);
      console.log('Demo job added successfully');
    } catch (err) {
      console.error('Failed to add demo job:', err);
    }
  };

  const handleUpdateConcurrency = async (value) => {
    try {
      await updatePreference('concurrentConversions', parseInt(value));
      console.log('Concurrency updated to:', value);
    } catch (err) {
      console.error('Failed to update concurrency:', err);
    }
  };

  const handleToggleAutoSave = async () => {
    try {
      const newValue = !preferences?.autoSave;
      await updatePreference('autoSave', newValue);
      console.log('Auto-save toggled to:', newValue);
    } catch (err) {
      console.error('Failed to toggle auto-save:', err);
    }
  };

  const handleResetDemo = async () => {
    try {
      await resetPreferences();
      console.log('Preferences reset successfully');
    } catch (err) {
      console.error('Failed to reset preferences:', err);
    }
  };

  if (loading) {
    return (
      <div className="demo-loading">
        <div className="loading-spinner">Loading user preferences demo...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="demo-error">
        <h3>Error Loading Demo</h3>
        <p>{error}</p>
      </div>
    );
  }

  const presets = getPresets();
  const recentJobs = getRecentJobs();

  return (
    <div className="demo-content">
      <header className="demo-header">
        <h1>User Preferences System Demo</h1>
        <p>This demo showcases the complete user preferences system functionality.</p>
        <div className="demo-actions">
          <UserPreferencesButton variant="both" size="large" />
          <UserPreferencesButton variant="icon" className="accent" />
          <UserPreferencesButton variant="text" className="ghost" />
        </div>
      </header>

      <div className="demo-grid">
        {/* Current Preferences */}
        <section className="demo-section">
          <h2>📋 Current Preferences</h2>
          <div className="preferences-display">
            <div className="pref-item">
              <span className="pref-label">Theme:</span>
              <span className="pref-value">{theme}</span>
            </div>
            <div className="pref-item">
              <span className="pref-label">Auto-save:</span>
              <span className="pref-value">
                {preferences?.autoSave ? '✅ Enabled' : '❌ Disabled'}
              </span>
            </div>
            <div className="pref-item">
              <span className="pref-label">Concurrent Conversions:</span>
              <span className="pref-value">{preferences?.concurrentConversions || 2}</span>
            </div>
            <div className="pref-item">
              <span className="pref-label">Default Output:</span>
              <span className="pref-value">
                {preferences?.defaultOutputDirectory || 'Not set'}
              </span>
            </div>
            <div className="pref-item">
              <span className="pref-label">Language:</span>
              <span className="pref-value">
                {preferences?.appearance?.language || 'en'}
              </span>
            </div>
          </div>
        </section>

        {/* Theme Controls */}
        <section className="demo-section">
          <h2>🎨 Theme Controls</h2>
          <div className="theme-controls">
            {['dark'].map(themeOption => (
              <button
                key={themeOption}
                className={`theme-button ${theme === themeOption ? 'active' : ''}`}
                onClick={() => changeTheme(themeOption)}
              >
                {themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {/* Quick Settings */}
        <section className="demo-section">
          <h2>⚡ Quick Settings</h2>
          <div className="quick-settings">
            <div className="setting-control">
              <label htmlFor="concurrency">Concurrent Conversions:</label>
              <select
                id="concurrency"
                value={preferences?.concurrentConversions || 2}
                onChange={(e) => handleUpdateConcurrency(e.target.value)}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </div>
            <div className="setting-control">
              <label>
                <input
                  type="checkbox"
                  checked={preferences?.autoSave || false}
                  onChange={handleToggleAutoSave}
                />
                Auto-save preferences
              </label>
            </div>
          </div>
        </section>

        {/* Presets Management */}
        <section className="demo-section">
          <h2>🔧 Presets ({presets.length})</h2>
          <div className="presets-list">
            {presets.length === 0 ? (
              <p className="empty-state">No presets available</p>
            ) : (
              presets.slice(0, 3).map(preset => (
                <div key={preset.id} className="preset-item">
                  <div className="preset-info">
                    <strong>{preset.name}</strong>
                    <small>{preset.category}</small>
                  </div>
                  <button
                    className="remove-button"
                    onClick={() => removePreset(preset.id)}
                    title="Remove preset"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
            {presets.length > 3 && (
              <p className="more-items">...and {presets.length - 3} more</p>
            )}
          </div>
          <button className="demo-button" onClick={handleAddDemoPreset}>
            Add Demo Preset
          </button>
        </section>

        {/* Recent Jobs */}
        <section className="demo-section">
          <h2>📁 Recent Jobs ({recentJobs.length})</h2>
          <div className="jobs-list">
            {recentJobs.length === 0 ? (
              <p className="empty-state">No recent jobs</p>
            ) : (
              recentJobs.slice(0, 3).map(job => (
                <div key={job.id} className="job-item">
                  <div className="job-info">
                    <strong>{job.inputFile.split('/').pop()}</strong>
                    <small>{job.status} • {job.preset}</small>
                  </div>
                  <span className={`job-status ${job.status}`}>
                    {job.status}
                  </span>
                </div>
              ))
            )}
            {recentJobs.length > 3 && (
              <p className="more-items">...and {recentJobs.length - 3} more</p>
            )}
          </div>
          <div className="job-actions">
            <button className="demo-button" onClick={handleAddDemoJob}>
              Add Demo Job
            </button>
            {recentJobs.length > 0 && (
              <button className="demo-button warning" onClick={clearRecentJobs}>
                Clear All
              </button>
            )}
          </div>
        </section>

        {/* Statistics */}
        <section className="demo-section">
          <h2>📊 Statistics</h2>
          <div className="statistics">
            {statistics ? (
              <>
                <div className="stat-item">
                  <span className="stat-label">Storage Used:</span>
                  <span className="stat-value">{statistics.storageSize || 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Last Updated:</span>
                  <span className="stat-value">
                    {statistics.lastUpdated 
                      ? new Date(statistics.lastUpdated).toLocaleString()
                      : 'Never'
                    }
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Presets:</span>
                  <span className="stat-value">{presets.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Jobs:</span>
                  <span className="stat-value">{recentJobs.length}</span>
                </div>
              </>
            ) : (
              <p className="loading-text">Loading statistics...</p>
            )}
          </div>
        </section>

        {/* Demo Actions */}
        <section className="demo-section">
          <h2>🧪 Demo Actions</h2>
          <div className="demo-actions-grid">
            <button className="demo-button" onClick={handleAddDemoPreset}>
              Add Sample Preset
            </button>
            <button className="demo-button" onClick={handleAddDemoJob}>
              Add Sample Job
            </button>
            <button className="demo-button warning" onClick={handleResetDemo}>
              Reset All Preferences
            </button>
            <UserPreferencesButton variant="both" className="demo-button accent">
              Open Full Settings
            </UserPreferencesButton>
          </div>
        </section>
      </div>

      <footer className="demo-footer">
        <p>
          This demo showcases the user preferences system with real-time updates,
          theme switching, preset management, and job history tracking.
        </p>
        <p>
          <strong>Features demonstrated:</strong> Theme switching, preference updates,
          preset management, recent jobs, statistics, import/export, and more.
        </p>
      </footer>
    </div>
  );
};

export default UserPreferencesDemo;