/**
 * Concurrency Configuration System
 * Manages configuration options for maximum concurrent jobs
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');

/**
 * Configuration events
 */
const ConfigEvents = {
  CONFIG_LOADED: 'config_loaded',
  CONFIG_SAVED: 'config_saved',
  CONFIG_UPDATED: 'config_updated',
  CONFIG_RESET: 'config_reset',
  CONFIG_VALIDATED: 'config_validated',
  CONFIG_ERROR: 'config_error'
};

/**
 * Job type categories
 */
const JobTypeCategory = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  ARCHIVE: 'archive',
  BATCH: 'batch'
};

/**
 * System load levels
 */
const SystemLoadLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Time periods for scheduling
 */
const TimePeriod = {
  BUSINESS_HOURS: 'business_hours',
  OFF_HOURS: 'off_hours',
  WEEKEND: 'weekend',
  MAINTENANCE: 'maintenance'
};

/**
 * Default concurrency configuration
 */
const DEFAULT_CONFIG = {
  // Global limits
  global: {
    maxConcurrentJobs: 10,
    maxConcurrentHighResourceJobs: 3,
    maxConcurrentExtremeResourceJobs: 1,
    maxQueueSize: 1000,
    enableDynamicAdjustment: true
  },
  
  // Per job type limits
  jobTypes: {
    [JobTypeCategory.IMAGE]: {
      maxConcurrent: 5,
      maxPerUser: 3,
      priority: 2,
      resourceWeight: 1.0
    },
    [JobTypeCategory.VIDEO]: {
      maxConcurrent: 2,
      maxPerUser: 1,
      priority: 3,
      resourceWeight: 3.0
    },
    [JobTypeCategory.AUDIO]: {
      maxConcurrent: 4,
      maxPerUser: 2,
      priority: 2,
      resourceWeight: 1.5
    },
    [JobTypeCategory.DOCUMENT]: {
      maxConcurrent: 8,
      maxPerUser: 5,
      priority: 1,
      resourceWeight: 0.5
    },
    [JobTypeCategory.ARCHIVE]: {
      maxConcurrent: 3,
      maxPerUser: 2,
      priority: 2,
      resourceWeight: 2.0
    },
    [JobTypeCategory.BATCH]: {
      maxConcurrent: 1,
      maxPerUser: 1,
      priority: 3,
      resourceWeight: 4.0
    }
  },
  
  // System load based adjustments
  systemLoad: {
    [SystemLoadLevel.LOW]: {
      multiplier: 1.2,
      enableAllJobTypes: true,
      priorityBoost: 0
    },
    [SystemLoadLevel.MEDIUM]: {
      multiplier: 1.0,
      enableAllJobTypes: true,
      priorityBoost: 0
    },
    [SystemLoadLevel.HIGH]: {
      multiplier: 0.7,
      enableAllJobTypes: false,
      disabledJobTypes: [JobTypeCategory.BATCH],
      priorityBoost: 1
    },
    [SystemLoadLevel.CRITICAL]: {
      multiplier: 0.3,
      enableAllJobTypes: false,
      disabledJobTypes: [JobTypeCategory.VIDEO, JobTypeCategory.BATCH, JobTypeCategory.ARCHIVE],
      priorityBoost: 2
    }
  },
  
  // Time-based scheduling
  timeBasedLimits: {
    [TimePeriod.BUSINESS_HOURS]: {
      multiplier: 0.8,
      maxConcurrentJobs: 8,
      restrictedJobTypes: [JobTypeCategory.VIDEO, JobTypeCategory.BATCH]
    },
    [TimePeriod.OFF_HOURS]: {
      multiplier: 1.2,
      maxConcurrentJobs: 12,
      restrictedJobTypes: []
    },
    [TimePeriod.WEEKEND]: {
      multiplier: 1.5,
      maxConcurrentJobs: 15,
      restrictedJobTypes: []
    },
    [TimePeriod.MAINTENANCE]: {
      multiplier: 0.1,
      maxConcurrentJobs: 1,
      restrictedJobTypes: [JobTypeCategory.VIDEO, JobTypeCategory.BATCH, JobTypeCategory.ARCHIVE]
    }
  },
  
  // Resource thresholds
  resourceThresholds: {
    cpu: {
      low: 0.3,
      medium: 0.6,
      high: 0.8,
      critical: 0.9
    },
    memory: {
      low: 0.4,
      medium: 0.6,
      high: 0.8,
      critical: 0.9
    },
    disk: {
      low: 0.5,
      medium: 0.7,
      high: 0.85,
      critical: 0.95
    }
  },
  
  // User-based limits
  userLimits: {
    defaultMaxConcurrentJobs: 3,
    defaultMaxQueuedJobs: 10,
    premiumMaxConcurrentJobs: 5,
    premiumMaxQueuedJobs: 20,
    adminMaxConcurrentJobs: 10,
    adminMaxQueuedJobs: 50
  },
  
  // File size based adjustments
  fileSizeAdjustments: {
    small: {
      threshold: 10 * 1024 * 1024, // 10MB
      multiplier: 1.5
    },
    medium: {
      threshold: 100 * 1024 * 1024, // 100MB
      multiplier: 1.0
    },
    large: {
      threshold: 1024 * 1024 * 1024, // 1GB
      multiplier: 0.5
    },
    extraLarge: {
      threshold: 5 * 1024 * 1024 * 1024, // 5GB
      multiplier: 0.2
    }
  },
  
  // Advanced settings
  advanced: {
    enablePreemption: true,
    preemptionGracePeriod: 30000, // 30 seconds
    enableJobBatching: true,
    batchSize: 5,
    enableSmartScheduling: true,
    schedulingAlgorithm: 'priority_weighted',
    enableResourcePrediction: true,
    predictionWindow: 300000, // 5 minutes
    enableAdaptiveLimits: true,
    adaptationInterval: 60000, // 1 minute
    enableFailureRecovery: true,
    maxRetries: 3,
    retryDelay: 5000 // 5 seconds
  },
  
  // Business hours configuration
  businessHours: {
    start: '09:00',
    end: '17:00',
    timezone: 'UTC',
    weekdays: [1, 2, 3, 4, 5], // Monday to Friday
    holidays: [] // Array of holiday dates
  }
};

/**
 * Configuration validation schema
 */
const VALIDATION_SCHEMA = {
  global: {
    maxConcurrentJobs: { type: 'number', min: 1, max: 100 },
    maxConcurrentHighResourceJobs: { type: 'number', min: 1, max: 20 },
    maxConcurrentExtremeResourceJobs: { type: 'number', min: 1, max: 5 },
    maxQueueSize: { type: 'number', min: 10, max: 10000 },
    enableDynamicAdjustment: { type: 'boolean' }
  },
  jobTypes: {
    '*': {
      maxConcurrent: { type: 'number', min: 1, max: 50 },
      maxPerUser: { type: 'number', min: 1, max: 20 },
      priority: { type: 'number', min: 1, max: 5 },
      resourceWeight: { type: 'number', min: 0.1, max: 10.0 }
    }
  },
  systemLoad: {
    '*': {
      multiplier: { type: 'number', min: 0.1, max: 2.0 },
      enableAllJobTypes: { type: 'boolean' },
      priorityBoost: { type: 'number', min: 0, max: 5 }
    }
  }
};

/**
 * Concurrency Configuration Manager
 */
class ConcurrencyConfiguration extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Set config path
    this.configPath = options.configPath || (app && app.isPackaged ? 
      path.join(app.getPath('userData'), 'config', 'concurrency.json') : 
      path.join(process.cwd(), 'config', 'concurrency.json'));
    this.autoSave = options.autoSave !== false;
    this.validateOnLoad = options.validateOnLoad !== false;
    this.enableHotReload = options.enableHotReload || false;
    
    this.config = this._deepClone(DEFAULT_CONFIG);
    this.originalConfig = this._deepClone(DEFAULT_CONFIG);
    this.configHistory = [];
    this.maxHistorySize = 50;
    
    this.isLoaded = false;
    this.isDirty = false;
    this.lastSaved = null;
    this.lastModified = null;
    
    this.watchers = new Set();
    this.fileWatcher = null;
  }

  /**
   * Load configuration from file
   */
  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      const loadedConfig = JSON.parse(configData);
      
      if (this.validateOnLoad) {
        this._validateConfig(loadedConfig);
      }
      
      this.config = this._mergeConfigs(DEFAULT_CONFIG, loadedConfig);
      this.isLoaded = true;
      this.isDirty = false;
      this.lastModified = Date.now();
      
      this.emit(ConfigEvents.CONFIG_LOADED, {
        config: this._deepClone(this.config),
        timestamp: this.lastModified
      });
      
      if (this.enableHotReload) {
        this._setupFileWatcher();
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, use defaults and create it
        await this.saveConfig();
        this.isLoaded = true;
      } else {
        this.emit(ConfigEvents.CONFIG_ERROR, {
          error: error.message,
          operation: 'load',
          timestamp: Date.now()
        });
        throw error;
      }
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig() {
    try {
      // Ensure directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      const configData = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configPath, configData, 'utf8');
      
      this.isDirty = false;
      this.lastSaved = Date.now();
      
      this.emit(ConfigEvents.CONFIG_SAVED, {
        config: this._deepClone(this.config),
        timestamp: this.lastSaved
      });
      
    } catch (error) {
      this.emit(ConfigEvents.CONFIG_ERROR, {
        error: error.message,
        operation: 'save',
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates, saveImmediately = null) {
    const shouldSave = saveImmediately !== null ? saveImmediately : this.autoSave;
    
    // Store current config in history
    this._addToHistory();
    
    // Apply updates
    this.config = this._mergeConfigs(this.config, updates);
    this.isDirty = true;
    this.lastModified = Date.now();
    
    // Validate updated config
    if (this.validateOnLoad) {
      this._validateConfig(this.config);
    }
    
    this.emit(ConfigEvents.CONFIG_UPDATED, {
      updates,
      config: this._deepClone(this.config),
      timestamp: this.lastModified
    });
    
    if (shouldSave) {
      return this.saveConfig();
    }
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(saveImmediately = null) {
    const shouldSave = saveImmediately !== null ? saveImmediately : this.autoSave;
    
    this._addToHistory();
    
    this.config = this._deepClone(DEFAULT_CONFIG);
    this.isDirty = true;
    this.lastModified = Date.now();
    
    this.emit(ConfigEvents.CONFIG_RESET, {
      config: this._deepClone(this.config),
      timestamp: this.lastModified
    });
    
    if (shouldSave) {
      await this.saveConfig();
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this._deepClone(this.config);
  }

  /**
   * Get specific configuration section
   */
  getConfigSection(section) {
    return this._deepClone(this.config[section]);
  }

  /**
   * Get global limits
   */
  getGlobalLimits() {
    return this._deepClone(this.config.global);
  }

  /**
   * Get job type limits
   */
  getJobTypeLimits(jobType = null) {
    if (jobType) {
      return this._deepClone(this.config.jobTypes[jobType]);
    }
    return this._deepClone(this.config.jobTypes);
  }

  /**
   * Get system load adjustments
   */
  getSystemLoadAdjustments(loadLevel = null) {
    if (loadLevel) {
      return this._deepClone(this.config.systemLoad[loadLevel]);
    }
    return this._deepClone(this.config.systemLoad);
  }

  /**
   * Get time-based limits
   */
  getTimeBasedLimits(period = null) {
    if (period) {
      return this._deepClone(this.config.timeBasedLimits[period]);
    }
    return this._deepClone(this.config.timeBasedLimits);
  }

  /**
   * Get user limits
   */
  getUserLimits() {
    return this._deepClone(this.config.userLimits);
  }

  /**
   * Get resource thresholds
   */
  getResourceThresholds() {
    return this._deepClone(this.config.resourceThresholds);
  }

  /**
   * Get advanced settings
   */
  getAdvancedSettings() {
    return this._deepClone(this.config.advanced);
  }

  /**
   * Calculate effective limits based on current conditions
   */
  calculateEffectiveLimits(conditions = {}) {
    const {
      systemLoad = SystemLoadLevel.MEDIUM,
      timePeriod = this._getCurrentTimePeriod(),
      userType = 'default',
      jobType = null
    } = conditions;
    
    const baseLimits = this._deepClone(this.config.global);
    const systemAdjustment = this.config.systemLoad[systemLoad] || {};
    const timeAdjustment = this.config.timeBasedLimits[timePeriod] || {};
    
    // Apply system load multiplier
    if (systemAdjustment.multiplier) {
      baseLimits.maxConcurrentJobs = Math.floor(
        baseLimits.maxConcurrentJobs * systemAdjustment.multiplier
      );
    }
    
    // Apply time-based adjustments
    if (timeAdjustment.maxConcurrentJobs) {
      baseLimits.maxConcurrentJobs = Math.min(
        baseLimits.maxConcurrentJobs,
        timeAdjustment.maxConcurrentJobs
      );
    }
    
    if (timeAdjustment.multiplier) {
      baseLimits.maxConcurrentJobs = Math.floor(
        baseLimits.maxConcurrentJobs * timeAdjustment.multiplier
      );
    }
    
    // Job type specific limits
    let jobTypeLimits = {};
    if (jobType && this.config.jobTypes[jobType]) {
      jobTypeLimits = this._deepClone(this.config.jobTypes[jobType]);
      
      // Apply system load adjustments to job type
      if (systemAdjustment.multiplier) {
        jobTypeLimits.maxConcurrent = Math.floor(
          jobTypeLimits.maxConcurrent * systemAdjustment.multiplier
        );
      }
    }
    
    return {
      global: baseLimits,
      jobType: jobTypeLimits,
      systemLoad: systemAdjustment,
      timePeriod: timeAdjustment,
      conditions: {
        systemLoad,
        timePeriod,
        userType,
        jobType
      }
    };
  }

  /**
   * Check if job type is allowed under current conditions
   */
  isJobTypeAllowed(jobType, conditions = {}) {
    const {
      systemLoad = SystemLoadLevel.MEDIUM,
      timePeriod = this._getCurrentTimePeriod()
    } = conditions;
    
    const systemAdjustment = this.config.systemLoad[systemLoad] || {};
    const timeAdjustment = this.config.timeBasedLimits[timePeriod] || {};
    
    // Check system load restrictions
    if (!systemAdjustment.enableAllJobTypes && 
        systemAdjustment.disabledJobTypes && 
        systemAdjustment.disabledJobTypes.includes(jobType)) {
      return false;
    }
    
    // Check time-based restrictions
    if (timeAdjustment.restrictedJobTypes && 
        timeAdjustment.restrictedJobTypes.includes(jobType)) {
      return false;
    }
    
    return true;
  }

  /**
   * Get configuration status
   */
  getStatus() {
    return {
      isLoaded: this.isLoaded,
      isDirty: this.isDirty,
      lastSaved: this.lastSaved,
      lastModified: this.lastModified,
      configPath: this.configPath,
      autoSave: this.autoSave,
      enableHotReload: this.enableHotReload,
      historySize: this.configHistory.length
    };
  }

  /**
   * Get configuration history
   */
  getHistory() {
    return this._deepClone(this.configHistory);
  }

  /**
   * Rollback to previous configuration
   */
  async rollback(steps = 1) {
    if (this.configHistory.length < steps) {
      throw new Error(`Cannot rollback ${steps} steps, only ${this.configHistory.length} available`);
    }
    
    const targetConfig = this.configHistory[this.configHistory.length - steps];
    
    // Remove rolled back entries from history
    this.configHistory.splice(-steps);
    
    this.config = this._deepClone(targetConfig.config);
    this.isDirty = true;
    this.lastModified = Date.now();
    
    this.emit(ConfigEvents.CONFIG_UPDATED, {
      rollback: true,
      steps,
      config: this._deepClone(this.config),
      timestamp: this.lastModified
    });
    
    if (this.autoSave) {
      await this.saveConfig();
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config = null) {
    const configToValidate = config || this.config;
    return this._validateConfig(configToValidate);
  }

  /**
   * Get current time period
   */
  _getCurrentTimePeriod() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    const businessHours = this.config.businessHours;
    
    // Check if it's weekend
    if (!businessHours.weekdays.includes(day)) {
      return TimePeriod.WEEKEND;
    }
    
    // Check if it's business hours
    if (timeString >= businessHours.start && timeString <= businessHours.end) {
      return TimePeriod.BUSINESS_HOURS;
    }
    
    return TimePeriod.OFF_HOURS;
  }

  /**
   * Deep clone object
   */
  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Merge configurations
   */
  _mergeConfigs(base, updates) {
    const result = this._deepClone(base);
    
    function merge(target, source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          merge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    
    merge(result, updates);
    return result;
  }

  /**
   * Validate configuration against schema
   */
  _validateConfig(config) {
    const errors = [];
    
    // Validate global settings
    if (config.global) {
      const globalErrors = this._validateSection(config.global, VALIDATION_SCHEMA.global, 'global');
      errors.push(...globalErrors);
    }
    
    // Validate job types
    if (config.jobTypes) {
      for (const [jobType, settings] of Object.entries(config.jobTypes)) {
        const jobTypeErrors = this._validateSection(
          settings, 
          VALIDATION_SCHEMA.jobTypes['*'], 
          `jobTypes.${jobType}`
        );
        errors.push(...jobTypeErrors);
      }
    }
    
    if (errors.length > 0) {
      const error = new Error(`Configuration validation failed: ${errors.join(', ')}`);
      this.emit(ConfigEvents.CONFIG_ERROR, {
        error: error.message,
        validationErrors: errors,
        operation: 'validate',
        timestamp: Date.now()
      });
      throw error;
    }
    
    this.emit(ConfigEvents.CONFIG_VALIDATED, {
      config: this._deepClone(config),
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Validate configuration section
   */
  _validateSection(section, schema, path) {
    const errors = [];
    
    for (const [key, rules] of Object.entries(schema)) {
      const value = section[key];
      const fieldPath = `${path}.${key}`;
      
      if (value === undefined) continue;
      
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${fieldPath}: expected ${rules.type}, got ${typeof value}`);
        continue;
      }
      
      if (rules.type === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${fieldPath}: value ${value} is below minimum ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${fieldPath}: value ${value} is above maximum ${rules.max}`);
        }
      }
    }
    
    return errors;
  }

  /**
   * Add current config to history
   */
  _addToHistory() {
    this.configHistory.push({
      config: this._deepClone(this.config),
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.configHistory.length > this.maxHistorySize) {
      this.configHistory.shift();
    }
  }

  /**
   * Setup file watcher for hot reload
   */
  _setupFileWatcher() {
    if (this.fileWatcher) return;
    
    try {
      const fs = require('fs');
      this.fileWatcher = fs.watchFile(this.configPath, { interval: 1000 }, () => {
        this.loadConfig().catch(error => {
          this.emit(ConfigEvents.CONFIG_ERROR, {
            error: error.message,
            operation: 'hot_reload',
            timestamp: Date.now()
          });
        });
      });
    } catch (error) {
      // File watching not supported or failed
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.fileWatcher) {
      const fs = require('fs');
      fs.unwatchFile(this.configPath);
      this.fileWatcher = null;
    }
    
    this.removeAllListeners();
  }
}

/**
 * Global concurrency configuration instance
 */
let globalConcurrencyConfiguration = null;

function getGlobalConcurrencyConfiguration(options = {}) {
  if (!globalConcurrencyConfiguration) {
    globalConcurrencyConfiguration = new ConcurrencyConfiguration(options);
  }
  return globalConcurrencyConfiguration;
}

module.exports = {
  ConcurrencyConfiguration,
  ConfigEvents,
  JobTypeCategory,
  SystemLoadLevel,
  TimePeriod,
  DEFAULT_CONFIG,
  VALIDATION_SCHEMA,
  getGlobalConcurrencyConfiguration
};