/**
 * User Preferences Manager
 * High-level service for managing user preferences with business logic
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');
const { UserPreferences, UserPreferencesEvents, DEFAULT_PREFERENCES } = require('../models/UserPreferences.js');
const { UserPreferencesStorage, StorageEvents } = require('./UserPreferencesStorage.js');
const { ConversionPreset } = require('../models/ConversionPreset.js');
const { 
  PreferencesError, 
  PreferencesErrorHandler, 
  PreferencesErrorTypes 
} = require('../errors/PreferencesErrorHandler');

/**
 * Manager events
 */
const ManagerEvents = {
  PREFERENCES_CHANGED: 'preferences_changed',
  PRESET_ADDED: 'preset_added',
  PRESET_REMOVED: 'preset_removed',
  PRESET_UPDATED: 'preset_updated',
  RECENT_JOB_ADDED: 'recent_job_added',
  RECENT_JOBS_CLEARED: 'recent_jobs_cleared',
  THEME_CHANGED: 'theme_changed',
  SETTINGS_IMPORTED: 'settings_imported',
  SETTINGS_EXPORTED: 'settings_exported',
  VALIDATION_ERROR: 'validation_error',
  MIGRATION_COMPLETED: 'migration_completed'
};

/**
 * Default manager configuration
 */
const DEFAULT_MANAGER_CONFIG = {
  // Auto-sync settings
  autoSync: true,
  syncInterval: 30000, // 30 seconds
  
  // Validation settings
  validateChanges: true,
  strictValidation: false,
  
  // Recent jobs settings
  maxRecentJobs: 50,
  recentJobsRetention: 30 * 24 * 60 * 60 * 1000, // 30 days
  
  // Preset settings
  maxPresets: 100,
  enablePresetSharing: true,
  
  // Performance settings
  enableCaching: true,
  cacheInvalidationTime: 5 * 60 * 1000, // 5 minutes
  
  // Migration settings
  enableAutoMigration: true,
  backupBeforeMigration: true,
  
  // Notification settings
  enableNotifications: true,
  notificationThrottleTime: 1000 // 1 second
};

/**
 * User Preferences Manager class
 */
class UserPreferencesManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
    this.storage = new UserPreferencesStorage(config.storage || {});
    this.errorHandler = new PreferencesErrorHandler({
      enableLogging: true,
      enableRecovery: true,
      maxRetryAttempts: 3,
      retryDelay: 1000
    });
    
    // Manager state
    this.isInitialized = false;
    this.currentUserId = 'default';
    this.syncTimer = null;
    this.notificationTimers = new Map();
    
    // Cache for frequently accessed data
    this.cache = {
      preferences: null,
      lastUpdate: 0
    };
    
    // Bind event handlers
    this._bindEventHandlers();
  }
  
  /**
   * Initialize the manager
   */
  async initialize(userId = 'default') {
    try {
      this.currentUserId = userId;
      
      // Initialize storage
      await this.storage.initialize();
      
      // Load current user preferences
      await this._loadCurrentPreferences();
      
      // Start auto-sync if enabled
      if (this.config.autoSync) {
        this._startAutoSync();
      }
      
      // Perform any necessary migrations
      if (this.config.enableAutoMigration) {
        await this._performMigrations();
      }
      
      this.isInitialized = true;
      
    } catch (error) {
      throw new Error(`Failed to initialize UserPreferencesManager: ${error.message}`);
    }
  }
  
  /**
   * Get current user preferences
   */
  async getPreferences() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Check cache first
    if (this.config.enableCaching && this.cache.preferences) {
      const cacheAge = Date.now() - this.cache.lastUpdate;
      if (cacheAge < this.config.cacheInvalidationTime) {
        return this.cache.preferences;
      }
    }
    
    // Load from storage
    const preferences = await this.storage.getUserPreferences(this.currentUserId);
    
    // Update cache
    if (this.config.enableCaching) {
      this.cache.preferences = preferences;
      this.cache.lastUpdate = Date.now();
    }
    
    return preferences;
  }
  
  /**
   * Update a specific preference
   */
  async updatePreference(path, value) {
    const preferences = await this.getPreferences();
    const oldValue = preferences.getPreference(path);
    
    // Validate change if enabled
    if (this.config.validateChanges) {
      const isValid = this._validatePreferenceChange(path, value, oldValue);
      if (!isValid && this.config.strictValidation) {
        throw new Error(`Invalid preference value for ${path}: ${value}`);
      }
    }
    
    // Update preference
    preferences.setPreference(path, value);
    
    // Save to storage
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    
    // Update cache
    this._invalidateCache();
    
    // Emit change event
    this._emitPreferenceChange(path, value, oldValue);
    
    return preferences;
  }
  
  /**
   * Update multiple preferences
   */
  async updatePreferences(updates) {
    const preferences = await this.getPreferences();
    const changes = [];
    
    // Collect all changes
    for (const [path, value] of Object.entries(updates)) {
      const oldValue = preferences.getPreference(path);
      
      // Validate change if enabled
      if (this.config.validateChanges) {
        const isValid = this._validatePreferenceChange(path, value, oldValue);
        if (!isValid && this.config.strictValidation) {
          throw new Error(`Invalid preference value for ${path}: ${value}`);
        }
      }
      
      changes.push({ path, value, oldValue });
    }
    
    // Apply all changes
    preferences.updatePreferences(updates);
    
    // Save to storage
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    
    // Update cache
    this._invalidateCache();
    
    // Emit change events
    for (const change of changes) {
      this._emitPreferenceChange(change.path, change.value, change.oldValue);
    }
    
    return preferences;
  }
  
  /**
   * Reset preferences to defaults
   */
  async resetPreferences(section = null) {
    const preferences = await this.getPreferences();
    preferences.resetPreferences(section);
    
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    this._invalidateCache();
    
    this.emit(ManagerEvents.PREFERENCES_CHANGED, {
      type: 'reset',
      section,
      timestamp: Date.now()
    });
    
    return preferences;
  }
  
  /**
   * Add a preset
   */
  async addPreset(preset) {
    const preferences = await this.getPreferences();
    
    // Check preset limit
    if (preferences.savedPresets.length >= this.config.maxPresets) {
      throw new Error(`Maximum number of presets (${this.config.maxPresets}) reached`);
    }
    
    // Validate preset
    if (!(preset instanceof ConversionPreset)) {
      throw new Error('Invalid preset: must be instance of ConversionPreset');
    }
    
    // Add preset
    preferences.addPreset(preset);
    
    // Save to storage
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    this._invalidateCache();
    
    this.emit(ManagerEvents.PRESET_ADDED, {
      preset: preset.toJSON(),
      timestamp: Date.now()
    });
    
    return preferences;
  }
  
  /**
   * Remove a preset
   */
  async removePreset(presetId) {
    const preferences = await this.getPreferences();
    const removedPreset = preferences.removePreset(presetId);
    
    if (!removedPreset) {
      throw new Error(`Preset with ID ${presetId} not found`);
    }
    
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    this._invalidateCache();
    
    this.emit(ManagerEvents.PRESET_REMOVED, {
      presetId,
      preset: removedPreset.toJSON(),
      timestamp: Date.now()
    });
    
    return preferences;
  }
  
  /**
   * Update a preset
   */
  async updatePreset(presetId, updates) {
    const preferences = await this.getPreferences();
    const updatedPreset = preferences.updatePreset(presetId, updates);
    
    if (!updatedPreset) {
      throw new Error(`Preset with ID ${presetId} not found`);
    }
    
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    this._invalidateCache();
    
    this.emit(ManagerEvents.PRESET_UPDATED, {
      presetId,
      preset: updatedPreset.toJSON(),
      updates,
      timestamp: Date.now()
    });
    
    return preferences;
  }
  
  /**
   * Add a recent job
   */
  async addRecentJob(jobData) {
    const preferences = await this.getPreferences();
    
    // Clean old jobs first
    await this._cleanupRecentJobs(preferences);
    
    // Add new job
    preferences.addRecentJob(jobData);
    
    // Limit recent jobs
    if (preferences.recentJobs.length > this.config.maxRecentJobs) {
      preferences.recentJobs = preferences.recentJobs.slice(-this.config.maxRecentJobs);
    }
    
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    this._invalidateCache();
    
    this.emit(ManagerEvents.RECENT_JOB_ADDED, {
      job: jobData,
      timestamp: Date.now()
    });
    
    return preferences;
  }
  
  /**
   * Clear recent jobs
   */
  async clearRecentJobs() {
    const preferences = await this.getPreferences();
    const clearedCount = preferences.recentJobs.length;
    
    preferences.clearRecentJobs();
    
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    this._invalidateCache();
    
    this.emit(ManagerEvents.RECENT_JOBS_CLEARED, {
      clearedCount,
      timestamp: Date.now()
    });
    
    return preferences;
  }
  
  /**
   * Change theme (forced to dark mode)
   */
  async changeTheme(theme) {
    const preferences = await this.getPreferences();
    const oldTheme = preferences.appearance.theme;
    
    preferences.setPreference('appearance.theme', 'dark');
    
    await this.storage.saveUserPreferences(this.currentUserId, preferences);
    this._invalidateCache();
    
    this.emit(ManagerEvents.THEME_CHANGED, {
      oldTheme,
      newTheme: 'dark',
      timestamp: Date.now()
    });
    
    return preferences;
  }
  
  /**
   * Export preferences with enhanced options
   * @param {Object} options - Export configuration
   * @param {Array} options.sections - Specific sections to export (e.g., ['appearance', 'conversion'])
   * @param {boolean} options.includePresets - Include saved presets (default: true)
   * @param {boolean} options.includeRecentJobs - Include recent jobs (default: false)
   * @param {boolean} options.includeStatistics - Include usage statistics (default: false)
   * @param {Array} options.presetIds - Specific preset IDs to export
   * @param {string} options.format - Export format ('full', 'minimal', 'presets-only')
   * @param {Object} options.metadata - Additional metadata to include
   */
  async exportPreferences(options = {}) {
    const context = { operation: 'export', options };
    
    try {
      const preferences = await this.getPreferences();
      const {
        sections,
        includePresets = true,
        includeRecentJobs = false,
        includeStatistics = false,
        presetIds,
        format = 'full',
        metadata = {}
      } = options;
      
      const exportData = {
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        userId: this.currentUserId,
        format,
        metadata: {
          appVersion: process.env.npm_package_version || '1.0.0',
          platform: process.platform,
          exportType: format,
          sectionsIncluded: sections || 'all',
          ...metadata
        }
      };
      
      // Handle different export formats
      switch (format) {
        case 'presets-only':
          exportData.presets = this._exportPresets(preferences, presetIds);
          break;
          
        case 'minimal':
          exportData.preferences = this._exportMinimalPreferences(preferences, sections);
          if (includePresets) {
            exportData.presets = this._exportPresets(preferences, presetIds);
          }
          break;
          
        case 'full':
        default:
          exportData.preferences = this._exportFullPreferences(preferences, sections);
          
          if (includePresets) {
            exportData.presets = this._exportPresets(preferences, presetIds);
          }
          
          if (includeRecentJobs) {
            exportData.recentJobs = preferences.recentJobs;
          }
          
          if (includeStatistics) {
            exportData.statistics = await this.getStatistics();
          }
          break;
      }
      
      // Add validation checksum
      exportData.checksum = this._generateChecksum(exportData);
      
      this.emit(ManagerEvents.SETTINGS_EXPORTED, {
        format,
        sections: sections || 'all',
        includePresets,
        includeRecentJobs,
        includeStatistics,
        timestamp: Date.now()
      });
      
      return exportData;
      
    } catch (error) {
      const preferencesError = this.errorHandler.createError(
        PreferencesErrorTypes.EXPORT_FAILED,
        `Failed to export preferences: ${error.message}`,
        { originalError: error, context }
      );
      
      await this.errorHandler.handleError(preferencesError, context);
      throw preferencesError;
    }
  }
  
  /**
   * Import preferences with enhanced validation and merge strategies
   * @param {Object} importData - Data to import
   * @param {Object} options - Import configuration
   * @param {string} options.strategy - Import strategy ('merge', 'replace', 'selective')
   * @param {Array} options.sections - Specific sections to import
   * @param {boolean} options.includePresets - Import presets (default: true)
   * @param {boolean} options.includeRecentJobs - Import recent jobs (default: false)
   * @param {boolean} options.createBackup - Create backup before import (default: true)
   * @param {boolean} options.validateChecksum - Validate data integrity (default: true)
   * @param {boolean} options.dryRun - Validate without applying changes (default: false)
   */
  async importPreferences(importData, options = {}) {
    const context = { operation: 'import', options };
    
    const {
      strategy = 'merge',
      sections,
      includePresets = true,
      includeRecentJobs = false,
      createBackup = true,
      validateChecksum = true,
      dryRun = false
    } = options;
    
    try {
      // Enhanced validation
      const validationResult = this._validateImportData(importData, {
        validateChecksum,
        requiredSections: sections
      });
      
      if (!validationResult.isValid) {
        const validationError = this.errorHandler.createError(
          PreferencesErrorTypes.IMPORT_VALIDATION_FAILED,
          `Import validation failed`,
          { 
            errors: validationResult.errors,
            warnings: validationResult.warnings,
            validationDetails: validationResult
          }
        );
        throw validationError;
      }
      
      if (dryRun) {
        return {
          valid: true,
          warnings: validationResult.warnings,
          preview: this._generateImportPreview(importData, options)
        };
      }
      
      const preferences = await this.getPreferences();
      
      // Create backup if requested
      if (createBackup) {
        try {
          await this.storage.createBackup();
        } catch (backupError) {
          const backupCreationError = this.errorHandler.createError(
            PreferencesErrorTypes.BACKUP_CREATION_FAILED,
            `Failed to create backup before import: ${backupError.message}`,
            { originalError: backupError, strategy }
          );
          throw backupCreationError;
        }
      }
      
      // Apply import based on strategy
      let updatedPreferences;
      switch (strategy) {
        case 'replace':
          updatedPreferences = await this._replacePreferences(importData, options);
          break;
          
        case 'selective':
          updatedPreferences = await this._selectiveImport(preferences, importData, options);
          break;
          
        case 'merge':
        default:
          updatedPreferences = await this._mergePreferences(preferences, importData, options);
          break;
      }
      
      // Save changes
      await this.storage.saveUserPreferences(this.currentUserId, updatedPreferences);
      this._invalidateCache();
      
      this.emit(ManagerEvents.SETTINGS_IMPORTED, {
        strategy,
        sections: sections || 'all',
        includePresets,
        includeRecentJobs,
        warnings: validationResult.warnings,
        timestamp: Date.now()
      });
      
      return {
        preferences: updatedPreferences,
        warnings: validationResult.warnings
      };
      
    } catch (error) {
      // Handle the error with our error handler
      const result = await this.errorHandler.handleError(error, context);
      
      // Emit the structured error
      this.emit(ManagerEvents.VALIDATION_ERROR, {
        type: result.error.type,
        message: result.error.userMessage,
        severity: result.error.severity,
        recoveryStrategy: result.error.recoveryStrategy,
        details: result.error.details,
        recovered: result.recovered,
        operation: 'import',
        strategy,
        timestamp: Date.now()
      });
      
      throw result.error;
    }
  }
  
  /**
   * Get preferences statistics
   */
  async getStatistics() {
    const preferences = await this.getPreferences();
    
    return {
      userId: this.currentUserId,
      createdAt: preferences.createdAt,
      lastModified: preferences.lastModified,
      presetCount: preferences.savedPresets.length,
      recentJobsCount: preferences.recentJobs.length,
      theme: preferences.appearance.theme,
      storageStats: this.storage.getStorageStats()
    };
  }
  
  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId) {
    try {
      const restored = await this.storage.restoreFromBackup(backupId);
      this._invalidateCache();
      
      this.emit(ManagerEvents.SETTINGS_IMPORTED, {
        strategy: 'restore',
        backupId,
        timestamp: Date.now()
      });
      
      return restored;
    } catch (error) {
      this.emit(ManagerEvents.VALIDATION_ERROR, {
        operation: 'restore',
        backupId,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * List available backups
   */
  async listBackups() {
    return await this.storage.listBackups();
  }
  
  /**
   * Cleanup resources
   */
  async cleanup() {
    // Stop auto-sync
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    
    // Clear notification timers
    for (const timer of this.notificationTimers.values()) {
      clearTimeout(timer);
    }
    this.notificationTimers.clear();
    
    // Cleanup storage
    await this.storage.cleanup();
    
    // Clear cache
    this.cache.preferences = null;
    this.cache.lastUpdate = 0;
  }
  
  // Private methods
  
  /**
   * Export presets with optional filtering
   * @private
   */
  _exportPresets(preferences, presetIds = null) {
    const allPresets = preferences.savedPresets || [];
    
    if (presetIds && Array.isArray(presetIds)) {
      return allPresets.filter(preset => presetIds.includes(preset.id));
    }
    
    return allPresets;
  }
  
  /**
   * Export minimal preferences (core settings only)
   * @private
   */
  _exportMinimalPreferences(preferences, sections = null) {
    const coreSettings = {
      appearance: preferences.appearance,
      conversion: {
        defaultFormat: preferences.conversion.defaultFormat,
        quality: preferences.conversion.quality,
        outputPath: preferences.conversion.outputPath
      },
      performance: {
        maxConcurrentJobs: preferences.performance.maxConcurrentJobs,
        enableHardwareAcceleration: preferences.performance.enableHardwareAcceleration
      }
    };
    
    if (sections && Array.isArray(sections)) {
      const filteredSettings = {};
      for (const section of sections) {
        if (coreSettings[section]) {
          filteredSettings[section] = coreSettings[section];
        }
      }
      return filteredSettings;
    }
    
    return coreSettings;
  }
  
  /**
   * Export full preferences with optional section filtering
   * @private
   */
  _exportFullPreferences(preferences, sections = null) {
    const fullPrefs = preferences.toJSON();
    
    if (sections && Array.isArray(sections)) {
      const filteredPrefs = {};
      for (const section of sections) {
        if (fullPrefs[section]) {
          filteredPrefs[section] = fullPrefs[section];
        }
      }
      return filteredPrefs;
    }
    
    return fullPrefs;
  }
  
  /**
   * Generate checksum for data integrity validation
   * @private
   */
  _generateChecksum(data) {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }
  
  /**
   * Validate import data structure and integrity with comprehensive checks
   * @private
   */
  _validateImportData(importData, options = {}) {
    const errors = [];
    const warnings = [];
    const info = [];
    
    // Check basic structure
    if (!importData || typeof importData !== 'object') {
      errors.push({
        code: 'INVALID_STRUCTURE',
        message: 'Import data must be a valid object',
        severity: 'error'
      });
      return { isValid: false, errors, warnings, info };
    }
    
    // Check version compatibility
    const versionValidation = this._validateVersion(importData.version);
    if (versionValidation.errors.length > 0) {
      errors.push(...versionValidation.errors);
    }
    if (versionValidation.warnings.length > 0) {
      warnings.push(...versionValidation.warnings);
    }
    
    // Validate checksum if required
    if (options.validateChecksum && importData.checksum) {
      const checksumValidation = this._validateChecksum(importData);
      if (!checksumValidation.isValid) {
        errors.push({
          code: 'CHECKSUM_MISMATCH',
          message: 'Data integrity check failed: file may be corrupted or tampered with',
          severity: 'error',
          details: checksumValidation.details
        });
      }
    } else if (importData.checksum) {
      info.push({
        code: 'CHECKSUM_SKIPPED',
        message: 'Checksum validation was skipped',
        severity: 'info'
      });
    }
    
    // Validate metadata
    const metadataValidation = this._validateMetadata(importData.metadata);
    warnings.push(...metadataValidation.warnings);
    info.push(...metadataValidation.info);
    
    // Check for required sections
    if (options.requiredSections && Array.isArray(options.requiredSections)) {
      for (const section of options.requiredSections) {
        if (!importData.preferences || !importData.preferences[section]) {
          errors.push({
            code: 'MISSING_REQUIRED_SECTION',
            message: `Required section '${section}' not found in import data`,
            severity: 'error',
            section
          });
        }
      }
    }
    
    // Validate preferences structure
    if (importData.preferences) {
      const prefsValidation = this._validatePreferencesStructure(importData.preferences);
      errors.push(...prefsValidation.errors);
      warnings.push(...prefsValidation.warnings);
    }
    
    // Validate presets if present
    if (importData.presets) {
      const presetsValidation = this._validatePresetsStructure(importData.presets);
      errors.push(...presetsValidation.errors);
      warnings.push(...presetsValidation.warnings);
    }
    
    // Validate recent jobs if present
    if (importData.recentJobs) {
      const jobsValidation = this._validateRecentJobsStructure(importData.recentJobs);
      errors.push(...jobsValidation.errors);
      warnings.push(...jobsValidation.warnings);
    }
    
    // Check for unknown/deprecated fields
    const unknownFields = this._checkForUnknownFields(importData);
    if (unknownFields.length > 0) {
      warnings.push({
        code: 'UNKNOWN_FIELDS',
        message: `Unknown fields detected: ${unknownFields.join(', ')}`,
        severity: 'warning',
        fields: unknownFields
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      info,
      summary: {
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        totalInfo: info.length,
        canProceed: errors.length === 0
      }
    };
  }
  
  /**
   * Validate version compatibility
   * @private
   */
  _validateVersion(version) {
    const errors = [];
    const warnings = [];
    
    if (!version) {
      warnings.push({
        code: 'NO_VERSION',
        message: 'No version information found in import data',
        severity: 'warning'
      });
    } else {
      const versionParts = version.split('.');
      const majorVersion = parseInt(versionParts[0]);
      const currentMajorVersion = 2; // Current app major version
      
      if (majorVersion < currentMajorVersion) {
        warnings.push({
          code: 'OLD_VERSION',
          message: `Importing from older format (v${version}), some features may not be available`,
          severity: 'warning',
          importVersion: version,
          currentVersion: currentMajorVersion
        });
      } else if (majorVersion > currentMajorVersion) {
        errors.push({
          code: 'FUTURE_VERSION',
          message: `Import data is from a newer version (v${version}) and may not be compatible`,
          severity: 'error',
          importVersion: version,
          currentVersion: currentMajorVersion
        });
      }
    }
    
    return { errors, warnings };
  }
  
  /**
   * Validate checksum integrity
   * @private
   */
  _validateChecksum(importData) {
    const dataWithoutChecksum = { ...importData };
    delete dataWithoutChecksum.checksum;
    const calculatedChecksum = this._generateChecksum(dataWithoutChecksum);
    
    return {
      isValid: calculatedChecksum === importData.checksum,
      details: {
        expected: importData.checksum,
        calculated: calculatedChecksum
      }
    };
  }
  
  /**
   * Validate metadata information
   * @private
   */
  _validateMetadata(metadata) {
    const warnings = [];
    const info = [];
    
    if (!metadata) {
      warnings.push({
        code: 'NO_METADATA',
        message: 'No metadata found in import data',
        severity: 'warning'
      });
      return { warnings, info };
    }
    
    // Check export date
    if (metadata.exportedAt) {
      const exportDate = new Date(metadata.exportedAt);
      const daysSinceExport = (Date.now() - exportDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceExport > 30) {
        warnings.push({
          code: 'OLD_EXPORT',
          message: `Import data is ${Math.floor(daysSinceExport)} days old`,
          severity: 'warning',
          daysSinceExport: Math.floor(daysSinceExport)
        });
      }
      
      info.push({
        code: 'EXPORT_DATE',
        message: `Data exported on ${exportDate.toLocaleDateString()}`,
        severity: 'info',
        exportDate: metadata.exportedAt
      });
    }
    
    // Check platform compatibility
    if (metadata.platform && metadata.platform !== process.platform) {
      warnings.push({
        code: 'PLATFORM_MISMATCH',
        message: `Import data from different platform (${metadata.platform})`,
        severity: 'warning',
        importPlatform: metadata.platform,
        currentPlatform: process.platform
      });
    }
    
    return { warnings, info };
  }
  
  /**
   * Validate preferences structure
   * @private
   */
  _validatePreferencesStructure(preferences) {
    const errors = [];
    const warnings = [];
    
    if (typeof preferences !== 'object') {
      errors.push({
        code: 'INVALID_PREFERENCES_TYPE',
        message: 'Preferences data must be an object',
        severity: 'error'
      });
      return { errors, warnings };
    }
    
    // Validate known sections
    const knownSections = ['appearance', 'conversion', 'performance', 'notifications', 'privacy'];
    const presentSections = Object.keys(preferences);
    
    // Check for unknown sections
    const unknownSections = presentSections.filter(section => !knownSections.includes(section));
    if (unknownSections.length > 0) {
      warnings.push({
        code: 'UNKNOWN_PREFERENCE_SECTIONS',
        message: `Unknown preference sections: ${unknownSections.join(', ')}`,
        severity: 'warning',
        unknownSections
      });
    }
    
    // Validate each section structure
    for (const [section, data] of Object.entries(preferences)) {
      if (typeof data !== 'object') {
        errors.push({
          code: 'INVALID_SECTION_TYPE',
          message: `Section '${section}' must be an object`,
          severity: 'error',
          section
        });
      }
    }
    
    return { errors, warnings };
  }
  
  /**
   * Validate presets structure
   * @private
   */
  _validatePresetsStructure(presets) {
    const errors = [];
    const warnings = [];
    
    if (!Array.isArray(presets)) {
      errors.push({
        code: 'INVALID_PRESETS_TYPE',
        message: 'Presets data must be an array',
        severity: 'error'
      });
      return { errors, warnings };
    }
    
    // Validate each preset
    presets.forEach((preset, index) => {
      if (typeof preset !== 'object') {
        errors.push({
          code: 'INVALID_PRESET_TYPE',
          message: `Preset at index ${index} must be an object`,
          severity: 'error',
          presetIndex: index
        });
        return;
      }
      
      // Check required preset fields
      const requiredFields = ['id', 'name', 'settings'];
      for (const field of requiredFields) {
        if (!preset[field]) {
          errors.push({
            code: 'MISSING_PRESET_FIELD',
            message: `Preset at index ${index} missing required field: ${field}`,
            severity: 'error',
            presetIndex: index,
            missingField: field
          });
        }
      }
      
      // Check for duplicate IDs
      const duplicateIndex = presets.findIndex((p, i) => i !== index && p.id === preset.id);
      if (duplicateIndex !== -1) {
        errors.push({
          code: 'DUPLICATE_PRESET_ID',
          message: `Duplicate preset ID '${preset.id}' found at indices ${index} and ${duplicateIndex}`,
          severity: 'error',
          presetId: preset.id,
          indices: [index, duplicateIndex]
        });
      }
    });
    
    return { errors, warnings };
  }
  
  /**
   * Validate recent jobs structure
   * @private
   */
  _validateRecentJobsStructure(recentJobs) {
    const errors = [];
    const warnings = [];
    
    if (!Array.isArray(recentJobs)) {
      errors.push({
        code: 'INVALID_RECENT_JOBS_TYPE',
        message: 'Recent jobs data must be an array',
        severity: 'error'
      });
      return { errors, warnings };
    }
    
    // Validate each job
    recentJobs.forEach((job, index) => {
      if (typeof job !== 'object') {
        errors.push({
          code: 'INVALID_JOB_TYPE',
          message: `Job at index ${index} must be an object`,
          severity: 'error',
          jobIndex: index
        });
        return;
      }
      
      // Check required job fields
      const requiredFields = ['id', 'timestamp'];
      for (const field of requiredFields) {
        if (!job[field]) {
          warnings.push({
            code: 'MISSING_JOB_FIELD',
            message: `Job at index ${index} missing field: ${field}`,
            severity: 'warning',
            jobIndex: index,
            missingField: field
          });
        }
      }
    });
    
    return { errors, warnings };
  }
  
  /**
   * Check for unknown or deprecated fields
   * @private
   */
  _checkForUnknownFields(importData) {
    const knownFields = [
      'version', 'checksum', 'metadata', 'preferences', 
      'presets', 'recentJobs', 'statistics'
    ];
    
    return Object.keys(importData).filter(field => !knownFields.includes(field));
  }
  
  /**
   * Generate preview of import changes
   * @private
   */
  _generateImportPreview(importData, options) {
    const preview = {
      sectionsToUpdate: [],
      presetsToAdd: 0,
      recentJobsToAdd: 0,
      potentialConflicts: []
    };
    
    if (importData.preferences) {
      preview.sectionsToUpdate = Object.keys(importData.preferences);
    }
    
    if (importData.presets && options.includePresets) {
      preview.presetsToAdd = importData.presets.length;
    }
    
    if (importData.recentJobs && options.includeRecentJobs) {
      preview.recentJobsToAdd = importData.recentJobs.length;
    }
    
    return preview;
  }
  
  /**
   * Replace all preferences with imported data
   * @private
   */
  async _replacePreferences(currentPreferences, importData, options) {
    const updatedPreferences = currentPreferences.clone();
    const preservedData = {};
    
    // Preserve critical data if specified
    if (options.preserveCritical) {
      preservedData.userId = updatedPreferences.userId;
      preservedData.createdAt = updatedPreferences.createdAt;
      preservedData.deviceId = updatedPreferences.deviceId;
    }
    
    // Replace preferences sections
    if (importData.preferences) {
      if (options.sections && Array.isArray(options.sections)) {
        // Replace only specified sections
        for (const section of options.sections) {
          if (importData.preferences[section]) {
            updatedPreferences[section] = importData.preferences[section];
          }
        }
      } else {
        // Replace all sections
        Object.assign(updatedPreferences, importData.preferences);
      }
    }
    
    // Replace presets
    if (importData.presets && options.includePresets) {
      updatedPreferences.savedPresets = importData.presets;
    }
    
    // Replace recent jobs
    if (importData.recentJobs && options.includeRecentJobs) {
      updatedPreferences.recentJobs = importData.recentJobs;
    }
    
    // Restore preserved data
    if (options.preserveCritical) {
      Object.assign(updatedPreferences, preservedData);
    }
    
    // Update metadata
    updatedPreferences.lastModified = Date.now();
    updatedPreferences.importedAt = Date.now();
    if (importData.metadata) {
      updatedPreferences.importSource = {
        version: importData.version,
        exportedAt: importData.metadata.exportedAt,
        platform: importData.metadata.platform
      };
    }
    
    return { preferences: updatedPreferences, conflicts: [] };
  }
  
  /**
   * Merge imported preferences with existing ones using advanced strategies
   * @private
   */
  async _mergePreferences(currentPreferences, importData, options) {
    const updatedPreferences = currentPreferences.clone();
    const mergeStrategy = options.mergeStrategy || 'smart';
    const conflicts = [];
    
    // Merge preferences sections
    if (importData.preferences) {
      const sectionsToMerge = options.sections || Object.keys(importData.preferences);
      
      for (const section of sectionsToMerge) {
        if (importData.preferences[section]) {
          const mergeResult = this._mergeSectionWithStrategy(
            updatedPreferences[section] || {},
            importData.preferences[section],
            mergeStrategy,
            section
          );
          
          updatedPreferences[section] = mergeResult.merged;
          if (mergeResult.conflicts.length > 0) {
            conflicts.push(...mergeResult.conflicts.map(c => ({ ...c, section })));
          }
        }
      }
    }
    
    // Merge presets with conflict resolution
    if (importData.presets && options.includePresets) {
      const presetMergeResult = this._mergePresetsWithStrategy(
        updatedPreferences.savedPresets,
        importData.presets,
        mergeStrategy,
        options.presetConflictResolution || 'skip'
      );
      
      updatedPreferences.savedPresets = presetMergeResult.merged;
      if (presetMergeResult.conflicts.length > 0) {
        conflicts.push(...presetMergeResult.conflicts);
      }
    }
    
    // Merge recent jobs with deduplication
    if (importData.recentJobs && options.includeRecentJobs) {
      const jobMergeResult = this._mergeRecentJobsWithStrategy(
        updatedPreferences.recentJobs,
        importData.recentJobs,
        options.jobConflictResolution || 'keep_newer'
      );
      
      updatedPreferences.recentJobs = jobMergeResult.merged;
      if (jobMergeResult.conflicts.length > 0) {
        conflicts.push(...jobMergeResult.conflicts);
      }
    }
    
    return { preferences: updatedPreferences, conflicts };
  }
  
  /**
   * Selective import with user-specified sections and items
   * @private
   */
  async _selectiveImport(currentPreferences, importData, options) {
    const updatedPreferences = currentPreferences.clone();
    const conflicts = [];
    const mergeStrategy = options.mergeStrategy || 'replace';
    
    // Import only specified sections
    if (options.sections && Array.isArray(options.sections)) {
      for (const section of options.sections) {
        if (importData.preferences && importData.preferences[section]) {
          if (mergeStrategy === 'replace') {
            updatedPreferences[section] = importData.preferences[section];
          } else {
            const mergeResult = this._mergeSectionWithStrategy(
              updatedPreferences[section] || {},
              importData.preferences[section],
              mergeStrategy,
              section
            );
            
            updatedPreferences[section] = mergeResult.merged;
            if (mergeResult.conflicts.length > 0) {
              conflicts.push(...mergeResult.conflicts.map(c => ({ ...c, section })));
            }
          }
        }
      }
    }
    
    // Import specific presets if specified
    if (importData.presets && options.includePresets) {
      if (options.presetIds && Array.isArray(options.presetIds)) {
        const selectedPresets = importData.presets.filter(preset => 
          options.presetIds.includes(preset.id)
        );
        
        const presetMergeResult = this._mergePresetsWithStrategy(
          updatedPreferences.savedPresets,
          selectedPresets,
          'smart',
          options.presetConflictResolution || 'rename'
        );
        
        updatedPreferences.savedPresets = presetMergeResult.merged;
        if (presetMergeResult.conflicts.length > 0) {
          conflicts.push(...presetMergeResult.conflicts);
        }
      }
    }
    
    // Import specific recent jobs if specified
    if (importData.recentJobs && options.includeRecentJobs && options.jobIds) {
      const selectedJobs = importData.recentJobs.filter(job => 
        options.jobIds.includes(job.id)
      );
      
      const jobMergeResult = this._mergeRecentJobsWithStrategy(
        updatedPreferences.recentJobs,
        selectedJobs,
        options.jobConflictResolution || 'keep_newer'
      );
      
      updatedPreferences.recentJobs = jobMergeResult.merged;
      if (jobMergeResult.conflicts.length > 0) {
        conflicts.push(...jobMergeResult.conflicts);
      }
    }
    
    return { preferences: updatedPreferences, conflicts };
  }
  
  /**
   * Merge section with specific strategy
   * @private
   */
  _mergeSectionWithStrategy(currentSection, importSection, strategy, sectionName) {
    const conflicts = [];
    let merged = { ...currentSection };
    
    switch (strategy) {
      case 'smart':
        // Smart merge: prefer newer values, but keep user customizations
        for (const [key, value] of Object.entries(importSection)) {
          if (currentSection[key] !== undefined && currentSection[key] !== value) {
            conflicts.push({
              type: 'value_conflict',
              key,
              currentValue: currentSection[key],
              importValue: value,
              resolution: 'kept_current'
            });
          } else {
            merged[key] = value;
          }
        }
        break;
        
      case 'import_priority':
        // Import values take priority
        merged = { ...currentSection, ...importSection };
        break;
        
      case 'current_priority':
        // Current values take priority
        for (const [key, value] of Object.entries(importSection)) {
          if (currentSection[key] === undefined) {
            merged[key] = value;
          } else {
            conflicts.push({
              type: 'value_conflict',
              key,
              currentValue: currentSection[key],
              importValue: value,
              resolution: 'kept_current'
            });
          }
        }
        break;
        
      default:
        merged = { ...currentSection, ...importSection };
    }
    
    return { merged, conflicts };
  }
  
  /**
   * Merge presets with conflict resolution
   * @private
   */
  _mergePresetsWithStrategy(currentPresets, importPresets, strategy, conflictResolution) {
    const conflicts = [];
    const merged = [...currentPresets];
    const existingPresetIds = new Set(currentPresets.map(p => p.id));
    const existingPresetNames = new Set(currentPresets.map(p => p.name));
    
    for (const importPreset of importPresets) {
      if (existingPresetIds.has(importPreset.id)) {
        // ID conflict
        const existingPreset = currentPresets.find(p => p.id === importPreset.id);
        
        switch (conflictResolution) {
          case 'skip':
            conflicts.push({
              type: 'preset_id_conflict',
              presetId: importPreset.id,
              presetName: importPreset.name,
              resolution: 'skipped'
            });
            break;
            
          case 'rename':
            const newId = this._generateUniquePresetId(existingPresetIds);
            const newName = this._generateUniquePresetName(importPreset.name, existingPresetNames);
            const renamedPreset = { ...importPreset, id: newId, name: newName };
            merged.push(renamedPreset);
            existingPresetIds.add(newId);
            existingPresetNames.add(newName);
            conflicts.push({
              type: 'preset_renamed',
              originalId: importPreset.id,
              newId,
              originalName: importPreset.name,
              newName,
              resolution: 'renamed'
            });
            break;
            
          case 'replace':
            const index = merged.findIndex(p => p.id === importPreset.id);
            merged[index] = importPreset;
            conflicts.push({
              type: 'preset_replaced',
              presetId: importPreset.id,
              presetName: importPreset.name,
              resolution: 'replaced'
            });
            break;
        }
      } else if (existingPresetNames.has(importPreset.name)) {
        // Name conflict
        switch (conflictResolution) {
          case 'skip':
            conflicts.push({
              type: 'preset_name_conflict',
              presetName: importPreset.name,
              resolution: 'skipped'
            });
            break;
            
          case 'rename':
            const newName = this._generateUniquePresetName(importPreset.name, existingPresetNames);
            const renamedPreset = { ...importPreset, name: newName };
            merged.push(renamedPreset);
            existingPresetIds.add(importPreset.id);
            existingPresetNames.add(newName);
            conflicts.push({
              type: 'preset_renamed',
              originalName: importPreset.name,
              newName,
              resolution: 'renamed'
            });
            break;
            
          case 'replace':
            const index = merged.findIndex(p => p.name === importPreset.name);
            merged[index] = importPreset;
            existingPresetIds.add(importPreset.id);
            conflicts.push({
              type: 'preset_replaced',
              presetName: importPreset.name,
              resolution: 'replaced'
            });
            break;
        }
      } else {
        // No conflict
        merged.push(importPreset);
        existingPresetIds.add(importPreset.id);
        existingPresetNames.add(importPreset.name);
      }
    }
    
    return { merged, conflicts };
  }
  
  /**
   * Merge recent jobs with deduplication
   * @private
   */
  _mergeRecentJobsWithStrategy(currentJobs, importJobs, conflictResolution) {
    const conflicts = [];
    const merged = [...currentJobs];
    const existingJobIds = new Set(currentJobs.map(job => job.id));
    
    for (const importJob of importJobs) {
      if (existingJobIds.has(importJob.id)) {
        const existingJob = currentJobs.find(job => job.id === importJob.id);
        
        switch (conflictResolution) {
          case 'keep_newer':
            if (importJob.timestamp > existingJob.timestamp) {
              const index = merged.findIndex(job => job.id === importJob.id);
              merged[index] = importJob;
              conflicts.push({
                type: 'job_updated',
                jobId: importJob.id,
                resolution: 'kept_newer'
              });
            } else {
              conflicts.push({
                type: 'job_skipped',
                jobId: importJob.id,
                resolution: 'kept_current'
              });
            }
            break;
            
          case 'skip':
            conflicts.push({
              type: 'job_skipped',
              jobId: importJob.id,
              resolution: 'skipped'
            });
            break;
            
          case 'replace':
            const index = merged.findIndex(job => job.id === importJob.id);
            merged[index] = importJob;
            conflicts.push({
              type: 'job_replaced',
              jobId: importJob.id,
              resolution: 'replaced'
            });
            break;
        }
      } else {
        merged.push(importJob);
        existingJobIds.add(importJob.id);
      }
    }
    
    return { merged, conflicts };
  }
  
  /**
   * Generate unique preset ID
   * @private
   */
  _generateUniquePresetId(existingIds) {
    let id;
    do {
      id = crypto.randomBytes(8).toString('hex');
    } while (existingIds.has(id));
    return id;
  }
  
  /**
   * Generate unique preset name
   * @private
   */
  _generateUniquePresetName(baseName, existingNames) {
    let counter = 1;
    let newName = `${baseName} (${counter})`;
    
    while (existingNames.has(newName)) {
      counter++;
      newName = `${baseName} (${counter})`;
    }
    
    return newName;
  }
  
  // Private methods
  
  /**
   * Bind event handlers
   */
  _bindEventHandlers() {
    // Listen to storage events
    this.storage.on(StorageEvents.PREFERENCES_SAVED, (data) => {
      this._invalidateCache();
    });
    
    this.storage.on(StorageEvents.STORAGE_ERROR, (data) => {
      this.emit(ManagerEvents.VALIDATION_ERROR, data);
    });
  }
  
  /**
   * Load current user preferences
   */
  async _loadCurrentPreferences() {
    const preferences = await this.storage.getUserPreferences(this.currentUserId);
    
    if (this.config.enableCaching) {
      this.cache.preferences = preferences;
      this.cache.lastUpdate = Date.now();
    }
    
    return preferences;
  }
  
  /**
   * Invalidate cache
   */
  _invalidateCache() {
    this.cache.preferences = null;
    this.cache.lastUpdate = 0;
  }
  
  /**
   * Validate preference change
   */
  _validatePreferenceChange(path, value, oldValue) {
    // Basic validation rules
    const validationRules = {
      'appearance.theme': (val) => ['light', 'dark', 'system'].includes(val),
      'processing.concurrentConversions': (val) => Number.isInteger(val) && val > 0 && val <= 10,
      'processing.defaultQuality': (val) => Number.isInteger(val) && val >= 1 && val <= 100,
      'notifications.enabled': (val) => typeof val === 'boolean',
      'notifications.types': (val) => Array.isArray(val)
    };
    
    const rule = validationRules[path];
    if (rule) {
      return rule(value);
    }
    
    return true; // No specific rule, assume valid
  }
  
  /**
   * Emit preference change event with throttling
   */
  _emitPreferenceChange(path, value, oldValue) {
    const eventKey = `change_${path}`;
    
    // Throttle notifications
    if (this.notificationTimers.has(eventKey)) {
      clearTimeout(this.notificationTimers.get(eventKey));
    }
    
    const timer = setTimeout(() => {
      this.emit(ManagerEvents.PREFERENCES_CHANGED, {
        path,
        value,
        oldValue,
        timestamp: Date.now()
      });
      
      this.notificationTimers.delete(eventKey);
    }, this.config.notificationThrottleTime);
    
    this.notificationTimers.set(eventKey, timer);
  }
  
  /**
   * Start auto-sync timer
   */
  _startAutoSync() {
    this.syncTimer = setInterval(async () => {
      try {
        // Reload preferences from storage to sync with external changes
        await this._loadCurrentPreferences();
      } catch (error) {
        // Log error but don't throw
        this.emit(ManagerEvents.VALIDATION_ERROR, {
          operation: 'auto_sync',
          error: error.message,
          timestamp: Date.now()
        });
      }
    }, this.config.syncInterval);
  }
  
  /**
   * Cleanup old recent jobs
   */
  async _cleanupRecentJobs(preferences) {
    const cutoffTime = Date.now() - this.config.recentJobsRetention;
    const originalCount = preferences.recentJobs.length;
    
    preferences.recentJobs = preferences.recentJobs.filter(
      job => job.timestamp > cutoffTime
    );
    
    return originalCount - preferences.recentJobs.length; // Return number of cleaned jobs
  }
  
  /**
   * Perform any necessary migrations
   */
  async _performMigrations() {
    // Placeholder for future migration logic
    // This would handle upgrading preferences from older versions
    
    const preferences = await this.getPreferences();
    let migrated = false;
    
    // Example migration: add new default values
    if (!preferences.processing.enableGpuAcceleration) {
      preferences.setPreference('processing.enableGpuAcceleration', false);
      migrated = true;
    }
    
    if (migrated) {
      await this.storage.saveUserPreferences(this.currentUserId, preferences);
      this.emit(ManagerEvents.MIGRATION_COMPLETED, {
        timestamp: Date.now()
      });
    }
  }
}

// Export
module.exports = {
  UserPreferencesManager,
  ManagerEvents,
  DEFAULT_MANAGER_CONFIG
};