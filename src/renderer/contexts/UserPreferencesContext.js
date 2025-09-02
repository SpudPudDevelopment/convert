import React, { createContext, useContext, useEffect, useState } from 'react';
import { useUserPreferences } from '../hooks/useUserPreferencesBrowser.js';

/**
 * Context for user preferences
 */
const UserPreferencesContext = createContext(null);

/**
 * Hook to use user preferences context
 * @returns {Object} User preferences context value
 */
export const useUserPreferencesContext = () => {
  const context = useContext(UserPreferencesContext);
  
  if (!context) {
    throw new Error('useUserPreferencesContext must be used within a UserPreferencesProvider');
  }
  
  return context;
};

/**
 * User preferences provider component
 * Provides user preferences state and actions to child components
 */
export const UserPreferencesProvider = ({ children }) => {
  const userPreferences = useUserPreferences();
  const [isReady, setIsReady] = useState(false);

  // Mark as ready when preferences are loaded
  useEffect(() => {
    if (userPreferences.isInitialized && !userPreferences.loading) {
      setIsReady(true);
    }
  }, [userPreferences.isInitialized, userPreferences.loading]);

  // Apply theme changes to document
  useEffect(() => {
    if (userPreferences.preferences?.appearance?.theme) {
      const theme = userPreferences.preferences.appearance.theme;
      document.documentElement.setAttribute('data-theme', theme);
      
      // Also set class for compatibility
      document.documentElement.className = document.documentElement.className
        .replace(/theme-\w+/g, '')
        .trim();
      document.documentElement.classList.add(`theme-${theme}`);
    }
  }, [userPreferences.preferences?.appearance?.theme]);

  // Apply language changes
  useEffect(() => {
    if (userPreferences.preferences?.appearance?.language) {
      const language = userPreferences.preferences.appearance.language;
      document.documentElement.setAttribute('lang', language);
    }
  }, [userPreferences.preferences?.appearance?.language]);

  const contextValue = {
    ...userPreferences,
    isReady,
    
    // Convenience getters
    theme: 'dark',
    language: userPreferences.preferences?.appearance?.language || 'en',
    defaultOutputDirectory: userPreferences.preferences?.defaultOutputDirectory || '',
    concurrentConversions: userPreferences.preferences?.concurrentConversions || 2,
    
    // Quick access to common preferences
    getTheme: () => 'dark',
    getLanguage: () => userPreferences.getPreference('appearance.language', 'en'),
    getDefaultOutputDirectory: () => userPreferences.getPreference('defaultOutputDirectory', ''),
    getConcurrentConversions: () => userPreferences.getPreference('concurrentConversions', 2),
    getNotificationSettings: () => userPreferences.getPreference('notifications', {}),
    getAdvancedSettings: () => userPreferences.getPreference('advanced', {}),
    
    // Theme helpers (forced to dark mode)
    isDarkTheme: () => true,
    
    isLightTheme: () => false,
    
    // Preset helpers
    getFavoritePresets: () => {
      const presets = userPreferences.getPresets();
      return presets.filter(preset => preset.metadata?.tags?.includes('favorite'));
    },
    
    getPresetsByCategory: (category) => {
      return userPreferences.getPresets(category);
    },
    
    // Recent jobs helpers
    getRecentJobsByType: (type) => {
      const recentJobs = userPreferences.getRecentJobs();
      return recentJobs.filter(job => job.type === type);
    },
    
    getRecentJobsToday: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const recentJobs = userPreferences.getRecentJobs();
      return recentJobs.filter(job => {
        const jobDate = new Date(job.timestamp);
        jobDate.setHours(0, 0, 0, 0);
        return jobDate.getTime() === today.getTime();
      });
    },
    
    // Settings helpers
    isNotificationEnabled: (type) => {
      const notifications = userPreferences.getPreference('notifications', {});
      return notifications[type] !== false; // Default to enabled
    },
    
    isAdvancedFeatureEnabled: (feature) => {
      const advanced = userPreferences.getPreference('advanced', {});
      return advanced[feature] === true;
    },
    
    // Batch operations
    updateMultiplePreferences: async (updates) => {
      try {
        return await userPreferences.updatePreferences(updates);
      } catch (error) {
        console.error('Failed to update multiple preferences:', error);
        throw error;
      }
    },
    
    // Safe preference updates with validation
    safeUpdatePreference: async (path, value, validator = null) => {
      try {
        if (validator && !validator(value)) {
          throw new Error(`Invalid value for preference ${path}`);
        }
        return await userPreferences.updatePreference(path, value);
      } catch (error) {
        console.error(`Failed to update preference ${path}:`, error);
        throw error;
      }
    }
  };

  return (
    <UserPreferencesContext.Provider value={contextValue}>
      {children}
    </UserPreferencesContext.Provider>
  );
};

/**
 * HOC to wrap components with user preferences context
 */
export const withUserPreferences = (Component) => {
  return function WrappedComponent(props) {
    return (
      <UserPreferencesProvider>
        <Component {...props} />
      </UserPreferencesProvider>
    );
  };
};

/**
 * Hook for components that need to wait for preferences to be ready
 */
export const useUserPreferencesReady = () => {
  const { isReady, loading, error } = useUserPreferencesContext();
  return { isReady, loading, error };
};

/**
 * Hook for theme-related functionality
 */
export const useThemePreferences = () => {
  const {
    theme,
    changeTheme,
    isDarkTheme,
    isLightTheme,
    getTheme
  } = useUserPreferencesContext();
  
  return {
    theme,
    changeTheme,
    isDarkTheme: isDarkTheme(),
    isLightTheme: isLightTheme(),
    getTheme
  };
};

/**
 * Hook for preset-related functionality
 */
export const usePresetPreferences = () => {
  const {
    addPreset,
    removePreset,
    updatePreset,
    getPresets,
    getFavoritePresets,
    getPresetsByCategory
  } = useUserPreferencesContext();
  
  return {
    addPreset,
    removePreset,
    updatePreset,
    getPresets,
    getFavoritePresets,
    getPresetsByCategory
  };
};

/**
 * Hook for recent jobs functionality
 */
export const useRecentJobsPreferences = () => {
  const {
    addRecentJob,
    clearRecentJobs,
    getRecentJobs,
    getRecentJobsByType,
    getRecentJobsToday
  } = useUserPreferencesContext();
  
  return {
    addRecentJob,
    clearRecentJobs,
    getRecentJobs,
    getRecentJobsByType,
    getRecentJobsToday
  };
};

export default UserPreferencesContext;