/**
 * Preferences API
 * Provides a clean interface for other application modules to access and modify preferences
 */

const { EventEmitter } = require('events');
const { UserPreferences, UserPreferencesEvents } = require('../models/UserPreferences');

/**
 * API Events for external modules
 */
const PreferencesAPIEvents = {
  PREFERENCE_CHANGED: 'preference_changed',
  PREFERENCES_UPDATED: 'preferences_updated',
  VALIDATION_FAILED: 'validation_failed',
  API_ERROR: 'api_error'
};

/**
 * Preferences API class
 * Provides a simplified, safe interface for accessing user preferences
 */
class PreferencesAPI extends EventEmitter {
  constructor(userPreferences = null) {
    super();
    
    this._userPreferences = userPreferences || UserPreferences.createDefault();
    this._cache = new Map();
    this._cacheEnabled = true;
    this._validationEnabled = true;
    
    // Subscribe to UserPreferences events and re-emit as API events
    this._setupEventForwarding();
  }
  
  /**
   * Setup event forwarding from UserPreferences to API events
   */
  _setupEventForwarding() {
    this._userPreferences.on(UserPreferencesEvents.PREFERENCES_UPDATED, (data) => {
      // Clear cache for updated preference
      if (this._cacheEnabled && data.path) {
        this._cache.delete(data.path);
      }
      
      this.emit(PreferencesAPIEvents.PREFERENCE_CHANGED, {
        path: data.path,
        oldValue: data.oldValue,
        newValue: data.newValue,
        timestamp: data.timestamp
      });
      
      this.emit(PreferencesAPIEvents.PREFERENCES_UPDATED, data);
    });
    
    this._userPreferences.on(UserPreferencesEvents.VALIDATION_ERROR, (data) => {
      this.emit(PreferencesAPIEvents.VALIDATION_FAILED, data);
    });
  }
  
  /**
   * Get a preference value by path
   * @param {string} path - Dot-separated path to preference (e.g., 'appearance.theme')
   * @param {*} defaultValue - Default value if preference doesn't exist
   * @returns {*} The preference value
   */
  get(path, defaultValue = undefined) {
    try {
      // Check cache first
      if (this._cacheEnabled && this._cache.has(path)) {
        return this._cache.get(path);
      }
      
      const value = this._userPreferences.getPreference(path);
      const result = value !== undefined ? value : defaultValue;
      
      // Cache the result
      if (this._cacheEnabled && result !== undefined) {
        this._cache.set(path, result);
      }
      
      return result;
    } catch (error) {
      this.emit(PreferencesAPIEvents.API_ERROR, {
        operation: 'get',
        path,
        error: error.message,
        timestamp: Date.now()
      });
      return defaultValue;
    }
  }
  
  /**
   * Set a preference value by path
   * @param {string} path - Dot-separated path to preference
   * @param {*} value - Value to set
   * @param {Object} options - Options for setting preference
   * @param {boolean} options.validate - Whether to validate the value (default: true)
   * @param {boolean} options.silent - Whether to suppress events (default: false)
   * @returns {boolean} Success status
   */
  set(path, value, options = {}) {
    const { validate = this._validationEnabled, silent = false } = options;
    
    try {
      // Validate if enabled
      if (validate) {
        const validationResult = this._validatePreferenceValue(path, value);
        if (!validationResult.valid) {
          this.emit(PreferencesAPIEvents.VALIDATION_FAILED, {
            path,
            value,
            errors: validationResult.errors,
            timestamp: Date.now()
          });
          return false;
        }
      }
      
      // Clear cache for this path
      if (this._cacheEnabled) {
        this._cache.delete(path);
      }
      
      // Set the preference
      this._userPreferences.setPreference(path, value);
      
      return true;
    } catch (error) {
      this.emit(PreferencesAPIEvents.API_ERROR, {
        operation: 'set',
        path,
        value,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }
  
  /**
   * Update multiple preferences at once
   * @param {Object} updates - Object with path-value pairs
   * @param {Object} options - Options for updating preferences
   * @returns {Object} Result with success status and any errors
   */
  update(updates, options = {}) {
    const results = {
      success: true,
      updated: [],
      failed: [],
      errors: []
    };
    
    try {
      for (const [path, value] of Object.entries(updates)) {
        const success = this.set(path, value, options);
        if (success) {
          results.updated.push(path);
        } else {
          results.failed.push(path);
          results.success = false;
        }
      }
      
      return results;
    } catch (error) {
      this.emit(PreferencesAPIEvents.API_ERROR, {
        operation: 'update',
        updates,
        error: error.message,
        timestamp: Date.now()
      });
      
      results.success = false;
      results.errors.push(error.message);
      return results;
    }
  }
  
  /**
   * Get multiple preferences at once
   * @param {string[]} paths - Array of preference paths
   * @param {Object} defaultValues - Default values for each path
   * @returns {Object} Object with path-value pairs
   */
  getMultiple(paths, defaultValues = {}) {
    const result = {};
    
    for (const path of paths) {
      result[path] = this.get(path, defaultValues[path]);
    }
    
    return result;
  }
  
  /**
   * Check if a preference exists
   * @param {string} path - Preference path
   * @returns {boolean} Whether the preference exists
   */
  has(path) {
    return this._userPreferences.getPreference(path) !== undefined;
  }
  
  /**
   * Reset preferences to defaults
   * @param {string|null} section - Section to reset (null for all)
   * @returns {boolean} Success status
   */
  reset(section = null) {
    try {
      this._userPreferences.resetPreferences(section);
      
      // Clear relevant cache entries
      if (this._cacheEnabled) {
        if (section) {
          // Clear cache entries that start with the section
          for (const key of this._cache.keys()) {
            if (key.startsWith(section + '.')) {
              this._cache.delete(key);
            }
          }
        } else {
          // Clear entire cache
          this._cache.clear();
        }
      }
      
      return true;
    } catch (error) {
      this.emit(PreferencesAPIEvents.API_ERROR, {
        operation: 'reset',
        section,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }
  
  /**
   * Subscribe to preference changes
   * @param {string|string[]} paths - Preference path(s) to watch
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(paths, callback) {
    const pathArray = Array.isArray(paths) ? paths : [paths];
    
    const listener = (data) => {
      if (pathArray.includes(data.path) || pathArray.includes('*')) {
        callback(data);
      }
    };
    
    this.on(PreferencesAPIEvents.PREFERENCE_CHANGED, listener);
    
    // Return unsubscribe function
    return () => {
      this.off(PreferencesAPIEvents.PREFERENCE_CHANGED, listener);
    };
  }
  
  /**
   * Get all preferences in a section
   * @param {string} section - Section name (e.g., 'appearance')
   * @returns {Object} Section preferences
   */
  getSection(section) {
    return this.get(section, {});
  }
  
  /**
   * Update an entire section
   * @param {string} section - Section name
   * @param {Object} values - New values for the section
   * @param {Object} options - Update options
   * @returns {boolean} Success status
   */
  setSection(section, values, options = {}) {
    const updates = {};
    
    for (const [key, value] of Object.entries(values)) {
      updates[`${section}.${key}`] = value;
    }
    
    const result = this.update(updates, options);
    return result.success;
  }
  
  /**
   * Validate a preference value
   * @param {string} path - Preference path
   * @param {*} value - Value to validate
   * @returns {Object} Validation result
   */
  _validatePreferenceValue(path, value) {
    const errors = [];
    
    // Basic type validation based on path
    if (path.includes('concurrentConversions')) {
      if (typeof value !== 'number' || value < 1 || value > 10) {
        errors.push('Concurrent conversions must be a number between 1 and 10');
      }
    }
    
    if (path.includes('theme')) {
      const validThemes = ['system', 'light', 'dark'];
      if (!validThemes.includes(value)) {
        errors.push(`Theme must be one of: ${validThemes.join(', ')}`);
      }
    }
    
    if (path.includes('language')) {
      if (typeof value !== 'string' || value.length < 2) {
        errors.push('Language must be a valid language code');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Enable or disable caching
   * @param {boolean} enabled - Whether to enable caching
   */
  setCachingEnabled(enabled) {
    this._cacheEnabled = enabled;
    if (!enabled) {
      this._cache.clear();
    }
  }
  
  /**
   * Clear the cache
   */
  clearCache() {
    this._cache.clear();
  }
  
  /**
   * Enable or disable validation
   * @param {boolean} enabled - Whether to enable validation
   */
  setValidationEnabled(enabled) {
    this._validationEnabled = enabled;
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this._cache.size,
      enabled: this._cacheEnabled,
      keys: Array.from(this._cache.keys())
    };
  }
  
  /**
   * Get the underlying UserPreferences instance (for advanced usage)
   * @returns {UserPreferences} The UserPreferences instance
   */
  getUserPreferences() {
    return this._userPreferences;
  }
  
  /**
   * Export all preferences
   * @returns {Object} Exported preferences data
   */
  export() {
    return this._userPreferences.toJSON();
  }
  
  /**
   * Import preferences data
   * @param {Object} data - Preferences data to import
   * @param {Object} options - Import options
   * @returns {boolean} Success status
   */
  import(data, options = {}) {
    try {
      this._userPreferences = UserPreferences.fromJSON(data);
      this._setupEventForwarding();
      
      if (this._cacheEnabled) {
        this._cache.clear();
      }
      
      return true;
    } catch (error) {
      this.emit(PreferencesAPIEvents.API_ERROR, {
        operation: 'import',
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }
}

module.exports = {
  PreferencesAPI,
  PreferencesAPIEvents
};