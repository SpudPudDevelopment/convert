/**
 * User Preferences Model - Browser Compatible Version
 * Manages user preferences, settings, and application configuration for renderer process
 */

/**
 * User preferences events
 */
export const UserPreferencesEvents = {
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
export const ThemeType = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark'
};

/**
 * Quality presets
 */
export const QualityPreset = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  LOSSLESS: 'lossless',
  CUSTOM: 'custom'
};

/**
 * Output format options
 */
export const OutputFormat = {
  AUTO: 'auto',
  PRESERVE: 'preserve',
  CUSTOM: 'custom'
};

/**
 * Notification types
 */
export const NotificationType = {
  COMPLETION: 'completion',
  ERROR: 'error',
  WARNING: 'warning',
  PROGRESS: 'progress'
};

/**
 * Default user preferences
 */
export const DEFAULT_PREFERENCES = {
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
 * Browser-compatible ID generation
 */
function generateId() {
  // Use crypto.getRandomValues if available, fallback to Math.random
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    // Fallback for environments without crypto.getRandomValues
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
}

/**
 * Recent job entry structure
 */
export class RecentJob {
  constructor(data = {}) {
    this.id = data.id || generateId();
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
 * User Preferences class - Browser Compatible
 */
export class UserPreferences {
  constructor(data = {}) {
    this.userId = data.userId || 'default';
    this.version = data.version || '1.0.0';
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    
    // Initialize preferences with defaults and user data
    this.preferences = this._mergePreferences(DEFAULT_PREFERENCES, data.preferences || {});
    
    // Initialize collections
    this.savedPresets = data.savedPresets || [];
    this.recentJobs = (data.recentJobs || []).map(job => 
      job instanceof RecentJob ? job : new RecentJob(job)
    );
    
    // Recent jobs settings
    this.recentJobsSettings = {
      maxCount: 50,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      autoCleanup: true,
      ...data.recentJobsSettings
    };
  }
  
  /**
   * Deep merge preferences with defaults
   * @private
   */
  _mergePreferences(defaults, userPrefs) {
    const merged = {};
    
    for (const [key, value] of Object.entries(defaults)) {
      if (userPrefs[key] && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this._mergePreferences(value, userPrefs[key]);
      } else {
        merged[key] = userPrefs[key] !== undefined ? userPrefs[key] : value;
      }
    }
    
    return merged;
  }
  
  /**
   * Get a specific preference value
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
   * Set a specific preference value
   */
  setPreference(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = this.preferences;
    
    // Navigate to the parent object
    for (const key of keys) {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the value
    current[lastKey] = value;
    this.updatedAt = Date.now();
    
    return this;
  }
  
  /**
   * Update multiple preferences at once
   */
  updatePreferences(updates) {
    this.preferences = this._mergePreferences(this.preferences, updates);
    this.updatedAt = Date.now();
    return this;
  }
  
  /**
   * Reset preferences to defaults
   */
  resetPreferences() {
    this.preferences = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
    this.updatedAt = Date.now();
    return this;
  }
  
  /**
   * Add a recent job
   */
  addRecentJob(jobData) {
    const job = jobData instanceof RecentJob ? jobData : new RecentJob(jobData);
    
    // Remove existing job with same ID if it exists
    this.recentJobs = this.recentJobs.filter(existingJob => existingJob.id !== job.id);
    
    // Add to beginning of array
    this.recentJobs.unshift(job);
    
    // Trim to max count
    if (this.recentJobs.length > this.recentJobsSettings.maxCount) {
      this.recentJobs = this.recentJobs.slice(0, this.recentJobsSettings.maxCount);
    }
    
    this.updatedAt = Date.now();
    return this;
  }
  
  /**
   * Remove a recent job
   */
  removeRecentJob(jobId) {
    const initialLength = this.recentJobs.length;
    this.recentJobs = this.recentJobs.filter(job => job.id !== jobId);
    
    if (this.recentJobs.length < initialLength) {
      this.updatedAt = Date.now();
      return true;
    }
    
    return false;
  }
  
  /**
   * Clear all recent jobs
   */
  clearRecentJobs() {
    this.recentJobs = [];
    this.updatedAt = Date.now();
    return this;
  }
  
  /**
   * Get recent jobs with filtering
   */
  getRecentJobs(filter = {}) {
    let jobs = [...this.recentJobs];
    
    // Apply filters
    if (filter.type) {
      jobs = jobs.filter(job => job.type === filter.type);
    }
    
    if (filter.status) {
      jobs = jobs.filter(job => job.status === filter.status);
    }
    
    if (filter.limit) {
      jobs = jobs.slice(0, filter.limit);
    }
    
    return jobs;
  }
  
  /**
   * Add a saved preset
   */
  addPreset(preset) {
    const existingIndex = this.savedPresets.findIndex(p => p.id === preset.id);
    
    if (existingIndex >= 0) {
      this.savedPresets[existingIndex] = preset;
    } else {
      this.savedPresets.push(preset);
    }
    
    this.updatedAt = Date.now();
    return this;
  }
  
  /**
   * Remove a saved preset
   */
  removePreset(presetId) {
    const initialLength = this.savedPresets.length;
    this.savedPresets = this.savedPresets.filter(preset => preset.id !== presetId);
    
    if (this.savedPresets.length < initialLength) {
      this.updatedAt = Date.now();
      return true;
    }
    
    return false;
  }
  
  /**
   * Get saved presets
   */
  getPresets() {
    return [...this.savedPresets];
  }
  
  /**
   * Validate preferences structure
   */
  validate() {
    const errors = [];
    
    // Basic structure validation
    if (!this.userId || typeof this.userId !== 'string') {
      errors.push('Invalid userId');
    }
    
    if (!this.preferences || typeof this.preferences !== 'object') {
      errors.push('Invalid preferences structure');
    }
    
    // Validate required sections
    const requiredSections = ['general', 'appearance', 'conversion', 'notifications'];
    for (const section of requiredSections) {
      if (!this.preferences[section]) {
        errors.push(`Missing required section: ${section}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Create a deep copy of this instance
   */
  clone() {
    return new UserPreferences(this.toJSON());
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

// Export default
export default UserPreferences;