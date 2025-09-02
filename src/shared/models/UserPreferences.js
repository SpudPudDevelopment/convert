/**
 * User Preferences Model
 * Manages user preferences, settings, and application configuration
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

/**
 * User preferences events
 */
const UserPreferencesEvents = {
  PREFERENCES_UPDATED: 'preferences_updated',
  PRESET_ADDED: 'preset_added',
  PRESET_REMOVED: 'preset_removed',
  RECENT_JOB_ADDED: 'recent_job_added',
  RECENT_JOBS_CLEARED: 'recent_jobs_cleared',
  SETTINGS_RESET: 'settings_reset',
  STORAGE_ERROR: 'storage_error',
  VALIDATION_ERROR: 'validation_error'
};

/**
 * Theme types
 */
const ThemeType = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark'
};

/**
 * Quality presets
 */
const QualityPreset = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  LOSSLESS: 'lossless',
  CUSTOM: 'custom'
};

/**
 * Output format options
 */
const OutputFormat = {
  AUTO: 'auto',
  PRESERVE: 'preserve',
  CUSTOM: 'custom'
};

/**
 * Notification types
 */
const NotificationType = {
  COMPLETION: 'completion',
  ERROR: 'error',
  WARNING: 'warning',
  PROGRESS: 'progress'
};

/**
 * Default user preferences
 */
const DEFAULT_PREFERENCES = {
  // General settings
  general: {
    defaultOutputDirectory: '',
    autoSave: true,
    autoOpenOutput: false,
    confirmBeforeDelete: true,
    rememberWindowState: true,
    checkForUpdates: true
  },
  
  // Appearance settings
  appearance: {
    theme: ThemeType.DARK,
    language: 'en',
    fontSize: 'medium',
    compactMode: false,
    showPreviewThumbnails: true,
    animationsEnabled: true
  },
  
  // Conversion settings
  conversion: {
    concurrentConversions: 2,
    defaultQuality: QualityPreset.MEDIUM,
    defaultOutputFormat: OutputFormat.AUTO,
    preserveMetadata: true,
    overwriteExisting: false,
    createBackups: false,
    compressionLevel: 'medium'
  },
  
  // Notification settings
  notifications: {
    enabled: true,
    types: {
      [NotificationType.COMPLETION]: true,
      [NotificationType.ERROR]: true,
      [NotificationType.WARNING]: true,
      [NotificationType.PROGRESS]: false
    },
    sound: true,
    desktop: true,
    inApp: true
  },
  
  // Performance settings
  performance: {
    maxMemoryUsage: '2GB',
    enableHardwareAcceleration: true,
    tempDirectory: '',
    cleanupTempFiles: true,
    cacheSize: '500MB',
    enableCaching: true
  },
  
  // Privacy settings
  privacy: {
    collectUsageStats: false,
    shareErrorReports: false,
    enableTelemetry: false,
    clearHistoryOnExit: false
  },
  
  // Advanced settings
  advanced: {
    enableDebugMode: false,
    logLevel: 'info',
    maxLogFiles: 10,
    enableExperimentalFeatures: false,
    customFFmpegPath: '',
    customSharpOptions: {}
  }
};

/**
 * Recent job entry structure
 */
class RecentJob {
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.name = data.name || '';
    this.type = data.type || 'unknown';
    this.sourceFiles = data.sourceFiles || [];
    this.targetFormat = data.targetFormat || '';
    this.outputPath = data.outputPath || '';
    this.status = data.status || 'completed';
    this.duration = data.duration || 0;
    this.fileSize = data.fileSize || 0;
    this.createdAt = data.createdAt || Date.now();
    this.settings = data.settings || {};
    this.presetUsed = data.presetUsed || null;
    this.metadata = data.metadata || {};
  }
  
  _generateId() {
    return crypto.randomBytes(8).toString('hex');
  }
  
  /**
   * Convert to JSON-serializable object
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      sourceFiles: this.sourceFiles,
      targetFormat: this.targetFormat,
      outputPath: this.outputPath,
      status: this.status,
      duration: this.duration,
      fileSize: this.fileSize,
      createdAt: this.createdAt,
      settings: this.settings,
      presetUsed: this.presetUsed,
      metadata: this.metadata
    };
  }
}

/**
 * User Preferences class
 */
class UserPreferences extends EventEmitter {
  constructor(data = {}) {
    super();
    
    this.userId = data.userId || 'default';
    this.version = data.version || '1.0.0';
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    
    // Initialize preferences with defaults and user data
    this.preferences = this._mergePreferences(DEFAULT_PREFERENCES, data.preferences || {});
    
    // Saved presets (references to ConversionPreset IDs)
    this.savedPresets = data.savedPresets || [];
    
    // Recent jobs history
    this.recentJobs = (data.recentJobs || []).map(job => 
      job instanceof RecentJob ? job : new RecentJob(job)
    );
    
    // Settings for recent jobs management
    this.recentJobsSettings = {
      maxCount: data.recentJobsSettings?.maxCount || 50,
      maxAge: data.recentJobsSettings?.maxAge || 30 * 24 * 60 * 60 * 1000, // 30 days
      autoCleanup: data.recentJobsSettings?.autoCleanup !== false
    };
    
    // Validation settings
    this.validation = {
      enabled: true,
      strictMode: false
    };
  }
  
  /**
   * Generate unique ID
   */
  _generateId() {
    return crypto.randomBytes(16).toString('hex');
  }
  
  /**
   * Deep merge preferences objects
   */
  _mergePreferences(defaults, userPrefs) {
    const result = {};
    
    for (const [key, value] of Object.entries(defaults)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this._mergePreferences(value, userPrefs[key] || {});
      } else {
        result[key] = userPrefs[key] !== undefined ? userPrefs[key] : value;
      }
    }
    
    // Add any additional user preferences not in defaults
    for (const [key, value] of Object.entries(userPrefs)) {
      if (!(key in defaults)) {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  /**
   * Get a preference value by path (e.g., 'appearance.theme')
   */
  getPreference(path) {
    const keys = path.split('.');
    let current = this.preferences;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
  
  /**
   * Set a preference value by path
   */
  setPreference(path, value) {
    const keys = path.split('.');
    let current = this.preferences;
    
    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the final value
    const finalKey = keys[keys.length - 1];
    const oldValue = current[finalKey];
    current[finalKey] = value;
    
    this.updatedAt = Date.now();
    
    this.emit(UserPreferencesEvents.PREFERENCES_UPDATED, {
      path,
      oldValue,
      newValue: value,
      timestamp: this.updatedAt
    });
    
    return this;
  }
  
  /**
   * Update multiple preferences at once
   */
  updatePreferences(updates) {
    const changes = [];
    
    for (const [path, value] of Object.entries(updates)) {
      const oldValue = this.getPreference(path);
      this.setPreference(path, value);
      changes.push({ path, oldValue, newValue: value });
    }
    
    return changes;
  }
  
  /**
   * Reset preferences to defaults
   */
  resetPreferences(section = null) {
    if (section) {
      if (section in DEFAULT_PREFERENCES) {
        this.preferences[section] = { ...DEFAULT_PREFERENCES[section] };
      }
    } else {
      this.preferences = this._mergePreferences(DEFAULT_PREFERENCES, {});
    }
    
    this.updatedAt = Date.now();
    
    this.emit(UserPreferencesEvents.SETTINGS_RESET, {
      section,
      timestamp: this.updatedAt
    });
    
    return this;
  }
  
  /**
   * Add a preset to saved presets
   */
  addSavedPreset(presetId) {
    if (!this.savedPresets.includes(presetId)) {
      this.savedPresets.push(presetId);
      this.updatedAt = Date.now();
      
      this.emit(UserPreferencesEvents.PRESET_ADDED, {
        presetId,
        timestamp: this.updatedAt
      });
    }
    
    return this;
  }
  
  /**
   * Remove a preset from saved presets
   */
  removeSavedPreset(presetId) {
    const index = this.savedPresets.indexOf(presetId);
    if (index > -1) {
      this.savedPresets.splice(index, 1);
      this.updatedAt = Date.now();
      
      this.emit(UserPreferencesEvents.PRESET_REMOVED, {
        presetId,
        timestamp: this.updatedAt
      });
    }
    
    return this;
  }
  
  /**
   * Add a job to recent jobs history
   */
  addRecentJob(jobData) {
    const job = jobData instanceof RecentJob ? jobData : new RecentJob(jobData);
    
    // Remove existing job with same ID if it exists
    this.recentJobs = this.recentJobs.filter(j => j.id !== job.id);
    
    // Add to beginning of array
    this.recentJobs.unshift(job);
    
    // Trim to max count
    if (this.recentJobs.length > this.recentJobsSettings.maxCount) {
      this.recentJobs = this.recentJobs.slice(0, this.recentJobsSettings.maxCount);
    }
    
    this.updatedAt = Date.now();
    
    this.emit(UserPreferencesEvents.RECENT_JOB_ADDED, {
      job: job.toJSON(),
      timestamp: this.updatedAt
    });
    
    // Auto-cleanup if enabled
    if (this.recentJobsSettings.autoCleanup) {
      this.cleanupRecentJobs();
    }
    
    return this;
  }
  
  /**
   * Get recent jobs with optional filtering
   */
  getRecentJobs(options = {}) {
    let jobs = [...this.recentJobs];
    
    // Filter by type
    if (options.type) {
      jobs = jobs.filter(job => job.type === options.type);
    }
    
    // Filter by status
    if (options.status) {
      jobs = jobs.filter(job => job.status === options.status);
    }
    
    // Filter by date range
    if (options.since) {
      jobs = jobs.filter(job => job.createdAt >= options.since);
    }
    
    // Limit results
    if (options.limit) {
      jobs = jobs.slice(0, options.limit);
    }
    
    return jobs;
  }
  
  /**
   * Clear recent jobs history
   */
  clearRecentJobs() {
    this.recentJobs = [];
    this.updatedAt = Date.now();
    
    this.emit(UserPreferencesEvents.RECENT_JOBS_CLEARED, {
      timestamp: this.updatedAt
    });
    
    return this;
  }
  
  /**
   * Cleanup old recent jobs based on settings
   */
  cleanupRecentJobs() {
    const now = Date.now();
    const maxAge = this.recentJobsSettings.maxAge;
    
    const originalCount = this.recentJobs.length;
    this.recentJobs = this.recentJobs.filter(job => 
      (now - job.createdAt) <= maxAge
    );
    
    if (this.recentJobs.length !== originalCount) {
      this.updatedAt = Date.now();
    }
    
    return this;
  }
  
  /**
   * Validate preferences structure
   */
  validate() {
    const errors = [];
    
    // Validate concurrent conversions
    const concurrent = this.getPreference('conversion.concurrentConversions');
    if (typeof concurrent !== 'number' || concurrent < 1 || concurrent > 10) {
      errors.push('conversion.concurrentConversions must be a number between 1 and 10');
    }
    
    // Validate theme
    const theme = this.getPreference('appearance.theme');
    if (!Object.values(ThemeType).includes(theme)) {
      errors.push('appearance.theme must be one of: system, light, dark');
    }
    
    // Validate output directory if set
    const outputDir = this.getPreference('general.defaultOutputDirectory');
    if (outputDir && typeof outputDir !== 'string') {
      errors.push('general.defaultOutputDirectory must be a string');
    }
    
    if (errors.length > 0) {
      this.emit(UserPreferencesEvents.VALIDATION_ERROR, {
        errors,
        timestamp: Date.now()
      });
    }
    
    return errors;
  }
  
  /**
   * Create a deep copy of this UserPreferences instance
   */
  clone() {
    const clonedData = {
      userId: this.userId,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      preferences: JSON.parse(JSON.stringify(this.preferences)),
      savedPresets: JSON.parse(JSON.stringify(this.savedPresets)),
      recentJobs: this.recentJobs.map(job => job.toJSON()),
      recentJobsSettings: JSON.parse(JSON.stringify(this.recentJobsSettings))
    };
    
    return new UserPreferences(clonedData);
  }
  
  /**
   * Export preferences to JSON
   */
  toJSON() {
    return {
      userId: this.userId,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      preferences: this.preferences,
      savedPresets: this.savedPresets,
      recentJobs: this.recentJobs.map(job => job.toJSON()),
      recentJobsSettings: this.recentJobsSettings
    };
  }
  
  /**
   * Create UserPreferences instance from JSON data
   */
  static fromJSON(data) {
    return new UserPreferences(data);
  }
  
  /**
   * Create default preferences for a user
   */
  static createDefault(userId = 'default') {
    return new UserPreferences({ userId });
  }
}

// Export classes and constants
module.exports = {
  UserPreferences,
  RecentJob,
  UserPreferencesEvents,
  ThemeType,
  QualityPreset,
  OutputFormat,
  NotificationType,
  DEFAULT_PREFERENCES
};