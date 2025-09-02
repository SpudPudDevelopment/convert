import { useState, useEffect, useCallback, useRef } from 'react';
import { IPC_CHANNELS } from '../../shared/types/ipc.js';

/**
 * Custom hook for managing user preferences in the renderer process
 * Provides a clean interface for components to interact with user preferences
 */
export const useUserPreferences = () => {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const ipcListenersRef = useRef(new Set());

  // Initialize preferences on mount
  useEffect(() => {
    const initializePreferences = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await window.electronAPI.invoke(IPC_CHANNELS.GET_USER_PREFERENCES);
        
        if (response.success) {
          setPreferences(response.data);
          setIsInitialized(true);
        } else {
          throw new Error(response.error?.message || 'Failed to load preferences');
        }
      } catch (err) {
        console.error('Failed to initialize user preferences:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializePreferences();
  }, []);

  // Set up IPC listeners for preference changes
  useEffect(() => {
    if (!isInitialized) return;

    const handlePreferencesChanged = (data) => {
      console.log('User preferences changed:', data);
      // Refresh preferences when they change
      refreshPreferences();
    };

    const handleThemeChanged = (data) => {
      console.log('Theme changed:', data);
      setPreferences(prev => prev ? {
        ...prev,
        appearance: {
          ...prev.appearance,
          theme: data.theme
        }
      } : null);
    };

    const handlePresetAdded = (data) => {
      console.log('Preset added:', data);
      setPreferences(prev => prev ? {
        ...prev,
        savedPresets: [...prev.savedPresets, data.preset]
      } : null);
    };

    const handlePresetRemoved = (data) => {
      console.log('Preset removed:', data);
      setPreferences(prev => prev ? {
        ...prev,
        savedPresets: prev.savedPresets.filter(p => p.id !== data.presetId)
      } : null);
    };

    const handlePresetUpdated = (data) => {
      console.log('Preset updated:', data);
      setPreferences(prev => prev ? {
        ...prev,
        savedPresets: prev.savedPresets.map(p => 
          p.id === data.presetId ? { ...p, ...data.updates } : p
        )
      } : null);
    };

    const handleRecentJobAdded = (data) => {
      console.log('Recent job added:', data);
      setPreferences(prev => prev ? {
        ...prev,
        recentJobs: [data.job, ...prev.recentJobs.slice(0, 19)] // Keep last 20
      } : null);
    };

    const handleRecentJobsCleared = () => {
      console.log('Recent jobs cleared');
      setPreferences(prev => prev ? {
        ...prev,
        recentJobs: []
      } : null);
    };

    // Register listeners
    const listeners = [
      { channel: IPC_CHANNELS.USER_PREFERENCES_CHANGED, handler: handlePreferencesChanged },
      { channel: IPC_CHANNELS.THEME_CHANGED_USER, handler: handleThemeChanged },
      { channel: IPC_CHANNELS.PRESET_ADDED, handler: handlePresetAdded },
      { channel: IPC_CHANNELS.PRESET_REMOVED, handler: handlePresetRemoved },
      { channel: IPC_CHANNELS.PRESET_UPDATED, handler: handlePresetUpdated },
      { channel: IPC_CHANNELS.RECENT_JOB_ADDED, handler: handleRecentJobAdded },
      { channel: IPC_CHANNELS.RECENT_JOBS_CLEARED, handler: handleRecentJobsCleared }
    ];

    listeners.forEach(({ channel, handler }) => {
      window.electronAPI.on(channel, handler);
      ipcListenersRef.current.add({ channel, handler });
    });

    // Cleanup listeners on unmount
    return () => {
      ipcListenersRef.current.forEach(({ channel, handler }) => {
        window.electronAPI.removeListener(channel, handler);
      });
      ipcListenersRef.current.clear();
    };
  }, [isInitialized]);

  // Refresh preferences from main process
  const refreshPreferences = useCallback(async () => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(IPC_CHANNELS.GET_USER_PREFERENCES);
      
      if (response.success) {
        setPreferences(response.data);
      } else {
        throw new Error(response.error?.message || 'Failed to refresh preferences');
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
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.UPDATE_USER_PREFERENCE,
        path,
        value
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to update preference');
      }
    } catch (err) {
      console.error('Failed to update preference:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Update multiple preferences
  const updatePreferences = useCallback(async (updates) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.UPDATE_USER_PREFERENCES,
        updates
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to update preferences');
      }
    } catch (err) {
      console.error('Failed to update preferences:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Reset preferences
  const resetPreferences = useCallback(async (section = null) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.RESET_USER_PREFERENCES,
        section
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to reset preferences');
      }
    } catch (err) {
      console.error('Failed to reset preferences:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Add a preset
  const addPreset = useCallback(async (presetData) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.ADD_PRESET,
        presetData
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to add preset');
      }
    } catch (err) {
      console.error('Failed to add preset:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Remove a preset
  const removePreset = useCallback(async (presetId) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.REMOVE_PRESET,
        presetId
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to remove preset');
      }
    } catch (err) {
      console.error('Failed to remove preset:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Update a preset
  const updatePreset = useCallback(async (presetId, updates) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.UPDATE_PRESET,
        presetId,
        updates
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to update preset');
      }
    } catch (err) {
      console.error('Failed to update preset:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Add a recent job
  const addRecentJob = useCallback(async (jobData) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.ADD_RECENT_JOB,
        jobData
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to add recent job');
      }
    } catch (err) {
      console.error('Failed to add recent job:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Clear recent jobs
  const clearRecentJobs = useCallback(async () => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.CLEAR_RECENT_JOBS
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to clear recent jobs');
      }
    } catch (err) {
      console.error('Failed to clear recent jobs:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Change theme
  const changeTheme = useCallback(async (theme) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.CHANGE_THEME,
        theme
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to change theme');
      }
    } catch (err) {
      console.error('Failed to change theme:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Export preferences
  const exportPreferences = useCallback(async (options = {}) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.EXPORT_PREFERENCES,
        options
      );
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to export preferences');
      }
    } catch (err) {
      console.error('Failed to export preferences:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Import preferences
  const importPreferences = useCallback(async (importData, options = {}) => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.IMPORT_PREFERENCES,
        importData,
        options
      );
      
      if (response.success) {
        setPreferences(response.data);
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to import preferences');
      }
    } catch (err) {
      console.error('Failed to import preferences:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Get preferences statistics
  const getStatistics = useCallback(async () => {
    try {
      setError(null);
      const response = await window.electronAPI.invoke(
        IPC_CHANNELS.GET_PREFERENCES_STATS
      );
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error?.message || 'Failed to get statistics');
      }
    } catch (err) {
      console.error('Failed to get statistics:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Helper functions for common operations
  const getPreference = useCallback((path, defaultValue = null) => {
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
  }, [preferences]);

  const getPresets = useCallback((category = null) => {
    if (!preferences?.savedPresets) return [];
    
    if (category) {
      return preferences.savedPresets.filter(preset => preset.category === category);
    }
    
    return preferences.savedPresets;
  }, [preferences]);

  const getRecentJobs = useCallback((limit = null) => {
    if (!preferences?.recentJobs) return [];
    
    if (limit && limit > 0) {
      return preferences.recentJobs.slice(0, limit);
    }
    
    return preferences.recentJobs;
  }, [preferences]);

  return {
    // State
    preferences,
    loading,
    error,
    isInitialized,
    
    // Actions
    refreshPreferences,
    updatePreference,
    updatePreferences,
    resetPreferences,
    
    // Preset management
    addPreset,
    removePreset,
    updatePreset,
    getPresets,
    
    // Recent jobs
    addRecentJob,
    clearRecentJobs,
    getRecentJobs,
    
    // Theme
    changeTheme,
    
    // Import/Export
    exportPreferences,
    importPreferences,
    
    // Statistics
    getStatistics,
    
    // Helpers
    getPreference
  };
};

export default useUserPreferences;