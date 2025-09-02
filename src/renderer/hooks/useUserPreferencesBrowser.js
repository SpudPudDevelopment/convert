import { useState, useEffect, useCallback } from 'react';
import { UserPreferences, DEFAULT_PREFERENCES } from '../models/UserPreferences.js';

/**
 * Browser-compatible version of useUserPreferences hook
 * Uses localStorage instead of Electron IPC for web environments
 */
export const useUserPreferences = () => {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize preferences on mount
  useEffect(() => {
    const initializePreferences = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Try to load from localStorage
        const stored = localStorage.getItem('userPreferences');
        let prefsData;
        
        if (stored) {
          try {
            prefsData = JSON.parse(stored);
          } catch (parseError) {
            console.warn('Failed to parse stored preferences, using defaults:', parseError);
            prefsData = DEFAULT_PREFERENCES;
          }
        } else {
          prefsData = DEFAULT_PREFERENCES;
        }
        
        setPreferences(prefsData);
        setIsInitialized(true);
      } catch (err) {
        console.error('Failed to initialize user preferences:', err);
        setError(err.message);
        // Fallback to defaults
        setPreferences(DEFAULT_PREFERENCES);
        setIsInitialized(true);
      } finally {
        setLoading(false);
      }
    };

    initializePreferences();
  }, []);

  // Save preferences to localStorage
  const savePreferences = useCallback((newPreferences) => {
    try {
      localStorage.setItem('userPreferences', JSON.stringify(newPreferences));
      setPreferences(newPreferences);
    } catch (err) {
      console.error('Failed to save preferences:', err);
      setError(err.message);
    }
  }, []);

  // Refresh preferences from localStorage
  const refreshPreferences = useCallback(async () => {
    try {
      setError(null);
      const stored = localStorage.getItem('userPreferences');
      
      if (stored) {
        const prefsData = JSON.parse(stored);
        setPreferences(prefsData);
      }
    } catch (err) {
      console.error('Failed to refresh preferences:', err);
      setError(err.message);
    }
  }, []);

  // Update a single preference
  const updatePreference = useCallback(async (path, value) => {
    try {
      setError(null);
      
      if (!preferences) {
        throw new Error('Preferences not initialized');
      }
      
      const pathArray = path.split('.');
      const newPreferences = { ...preferences };
      
      // Navigate to the nested property
      let current = newPreferences;
      for (let i = 0; i < pathArray.length - 1; i++) {
        if (!current[pathArray[i]]) {
          current[pathArray[i]] = {};
        }
        current = current[pathArray[i]];
      }
      
      // Set the value
      current[pathArray[pathArray.length - 1]] = value;
      
      savePreferences(newPreferences);
      return newPreferences;
    } catch (err) {
      console.error('Failed to update preference:', err);
      setError(err.message);
      throw err;
    }
  }, [preferences, savePreferences]);

  // Update multiple preferences
  const updatePreferences = useCallback(async (updates) => {
    try {
      setError(null);
      
      if (!preferences) {
        throw new Error('Preferences not initialized');
      }
      
      const newPreferences = { ...preferences, ...updates };
      savePreferences(newPreferences);
      return newPreferences;
    } catch (err) {
      console.error('Failed to update preferences:', err);
      setError(err.message);
      throw err;
    }
  }, [preferences, savePreferences]);

  // Reset preferences
  const resetPreferences = useCallback(async (section = null) => {
    try {
      setError(null);
      
      let newPreferences;
      if (section) {
        newPreferences = { ...preferences, [section]: DEFAULT_PREFERENCES[section] };
      } else {
        newPreferences = { ...DEFAULT_PREFERENCES };
      }
      
      savePreferences(newPreferences);
      return newPreferences;
    } catch (err) {
      console.error('Failed to reset preferences:', err);
      setError(err.message);
      throw err;
    }
  }, [preferences, savePreferences]);

  // Add a preset
  const addPreset = useCallback(async (presetData) => {
    try {
      setError(null);
      
      if (!preferences) {
        throw new Error('Preferences not initialized');
      }
      
      const newPreset = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        ...presetData
      };
      
      const newPreferences = {
        ...preferences,
        savedPresets: [...preferences.savedPresets, newPreset]
      };
      
      savePreferences(newPreferences);
      return newPreferences;
    } catch (err) {
      console.error('Failed to add preset:', err);
      setError(err.message);
      throw err;
    }
  }, [preferences, savePreferences]);

  // Remove a preset
  const removePreset = useCallback(async (presetId) => {
    try {
      setError(null);
      
      if (!preferences) {
        throw new Error('Preferences not initialized');
      }
      
      const newPreferences = {
        ...preferences,
        savedPresets: preferences.savedPresets.filter(p => p.id !== presetId)
      };
      
      savePreferences(newPreferences);
      return newPreferences;
    } catch (err) {
      console.error('Failed to remove preset:', err);
      setError(err.message);
      throw err;
    }
  }, [preferences, savePreferences]);

  // Update a preset
  const updatePreset = useCallback(async (presetId, updates) => {
    try {
      setError(null);
      
      if (!preferences) {
        throw new Error('Preferences not initialized');
      }
      
      const newPreferences = {
        ...preferences,
        savedPresets: preferences.savedPresets.map(p => 
          p.id === presetId ? { ...p, ...updates } : p
        )
      };
      
      savePreferences(newPreferences);
      return newPreferences;
    } catch (err) {
      console.error('Failed to update preset:', err);
      setError(err.message);
      throw err;
    }
  }, [preferences, savePreferences]);

  // Add a recent job
  const addRecentJob = useCallback(async (jobData) => {
    try {
      setError(null);
      
      if (!preferences) {
        throw new Error('Preferences not initialized');
      }
      
      const newJob = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...jobData
      };
      
      const newPreferences = {
        ...preferences,
        recentJobs: [newJob, ...preferences.recentJobs.slice(0, 19)] // Keep last 20
      };
      
      savePreferences(newPreferences);
      return newPreferences;
    } catch (err) {
      console.error('Failed to add recent job:', err);
      setError(err.message);
      throw err;
    }
  }, [preferences, savePreferences]);

  // Clear recent jobs
  const clearRecentJobs = useCallback(async () => {
    try {
      setError(null);
      
      if (!preferences) {
        throw new Error('Preferences not initialized');
      }
      
      const newPreferences = {
        ...preferences,
        recentJobs: []
      };
      
      savePreferences(newPreferences);
      return newPreferences;
    } catch (err) {
      console.error('Failed to clear recent jobs:', err);
      setError(err.message);
      throw err;
    }
  }, [preferences, savePreferences]);

  // Export preferences
  const exportPreferences = useCallback(async () => {
    try {
      setError(null);
      
      if (!preferences) {
        throw new Error('Preferences not initialized');
      }
      
      return {
        success: true,
        data: preferences
      };
    } catch (err) {
      console.error('Failed to export preferences:', err);
      setError(err.message);
      return {
        success: false,
        error: { message: err.message }
      };
    }
  }, [preferences]);

  // Import preferences
  const importPreferences = useCallback(async (importData, options = {}) => {
    try {
      setError(null);
      
      if (!importData) {
        throw new Error('No import data provided');
      }
      
      let newPreferences;
      
      if (options.merge) {
        newPreferences = { ...preferences, ...importData };
      } else {
        newPreferences = { ...importData };
      }
      
      savePreferences(newPreferences);
      return {
        success: true,
        data: newPreferences
      };
    } catch (err) {
      console.error('Failed to import preferences:', err);
      setError(err.message);
      return {
        success: false,
        error: { message: err.message }
      };
    }
  }, [preferences, savePreferences]);

  return {
    preferences,
    loading,
    error,
    isInitialized,
    refreshPreferences,
    updatePreference,
    updatePreferences,
    resetPreferences,
    addPreset,
    removePreset,
    updatePreset,
    addRecentJob,
    clearRecentJobs,
    exportPreferences,
    importPreferences
  };
};