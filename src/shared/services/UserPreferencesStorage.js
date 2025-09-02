/**
 * User Preferences Storage Service
 * Handles persistence, loading, and management of user preferences
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { UserPreferences, UserPreferencesEvents } = require('../models/UserPreferences.js');
const { app } = require('electron');

/**
 * Storage events
 */
const StorageEvents = {
  PREFERENCES_LOADED: 'preferences_loaded',
  PREFERENCES_SAVED: 'preferences_saved',
  BACKUP_CREATED: 'backup_created',
  STORAGE_ERROR: 'storage_error',
  MIGRATION_COMPLETED: 'migration_completed',
  VALIDATION_FAILED: 'validation_failed'
};

/**
 * Storage backends
 */
const StorageBackend = {
  FILE_SYSTEM: 'file_system',
  MEMORY: 'memory',
  SQLITE: 'sqlite'
};

/**
 * Default storage configuration
 */
const DEFAULT_CONFIG = {
  // Storage settings
  backend: StorageBackend.FILE_SYSTEM,
  basePath: path.join(process.cwd(), 'data', 'preferences'),
  fileName: 'user-preferences.json',
  backupDir: 'backups',
  
  // Auto-save settings
  autoSave: true,
  autoSaveDelay: 1000, // 1 second debounce
  saveOnChange: true,
  
  // Backup settings
  enableBackups: true,
  maxBackups: 10,
  backupInterval: 24 * 60 * 60 * 1000, // 24 hours
  
  // Security settings
  enableEncryption: false,
  encryptionKey: null,
  
  // Validation settings
  validateOnLoad: true,
  validateOnSave: true,
  strictValidation: false,
  
  // Migration settings
  enableMigration: true,
  currentVersion: '1.0.0',
  
  // Performance settings
  enableCaching: true,
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
  enableCompression: false
};

/**
 * User Preferences Storage class
 */
class UserPreferencesStorage extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      basePath: app && app.isPackaged ? 
        path.join(app.getPath('userData'), 'data', 'preferences') : 
        path.join(process.cwd(), 'data', 'preferences'),
      ...DEFAULT_CONFIG,
      ...config
    };
    this.preferences = new Map(); // userId -> UserPreferences
    this.cache = new Map();
    this.saveTimers = new Map(); // userId -> timer
    
    // Storage state
    this.isInitialized = false;
    this.lastBackupTime = 0;
    this.backupTimer = null;
    
    // File paths
    this.preferencesPath = path.join(this.config.basePath, this.config.fileName);
    this.backupPath = path.join(this.config.basePath, this.config.backupDir);
    
    // Bind event handlers
    this._bindEventHandlers();
  }
  
  /**
   * Initialize storage
   */
  async initialize() {
    try {
      // Ensure directories exist
      await fs.mkdir(this.config.basePath, { recursive: true });
      if (this.config.enableBackups) {
        await fs.mkdir(this.backupPath, { recursive: true });
      }
      
      // Load existing preferences
      await this._loadAllPreferences();
      
      // Start backup timer if enabled
      if (this.config.enableBackups) {
        this._startBackupTimer();
      }
      
      this.isInitialized = true;
      
      this.emit(StorageEvents.PREFERENCES_LOADED, {
        userCount: this.preferences.size,
        timestamp: Date.now()
      });
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'initialize',
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Get user preferences
   */
  async getUserPreferences(userId = 'default') {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Check cache first
    if (this.config.enableCaching && this.cache.has(userId)) {
      const cached = this.cache.get(userId);
      if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
        return cached.preferences;
      }
    }
    
    // Get from memory or create default
    let userPrefs = this.preferences.get(userId);
    if (!userPrefs) {
      userPrefs = UserPreferences.createDefault(userId);
      this.preferences.set(userId, userPrefs);
      
      // Auto-save new preferences
      if (this.config.autoSave) {
        await this._scheduleSave(userId);
      }
    }
    
    // Update cache
    if (this.config.enableCaching) {
      this.cache.set(userId, {
        preferences: userPrefs,
        timestamp: Date.now()
      });
    }
    
    return userPrefs;
  }
  
  /**
   * Save user preferences
   */
  async saveUserPreferences(userId, preferences) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      // Validate if enabled
      if (this.config.validateOnSave) {
        const errors = preferences.validate();
        if (errors.length > 0 && this.config.strictValidation) {
          throw new Error(`Validation failed: ${errors.join(', ')}`);
        }
      }
      
      // Update in memory
      this.preferences.set(userId, preferences);
      
      // Update cache
      if (this.config.enableCaching) {
        this.cache.set(userId, {
          preferences,
          timestamp: Date.now()
        });
      }
      
      // Schedule save to disk
      if (this.config.autoSave) {
        await this._scheduleSave(userId);
      } else {
        await this._saveToFile(userId, preferences);
      }
      
      this.emit(StorageEvents.PREFERENCES_SAVED, {
        userId,
        timestamp: Date.now()
      });
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'save',
        userId,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Update specific preference
   */
  async updatePreference(userId, path, value) {
    const preferences = await this.getUserPreferences(userId);
    preferences.setPreference(path, value);
    await this.saveUserPreferences(userId, preferences);
    return preferences;
  }
  
  /**
   * Update multiple preferences
   */
  async updatePreferences(userId, updates) {
    const preferences = await this.getUserPreferences(userId);
    preferences.updatePreferences(updates);
    await this.saveUserPreferences(userId, preferences);
    return preferences;
  }
  
  /**
   * Reset user preferences to defaults
   */
  async resetUserPreferences(userId, section = null) {
    const preferences = await this.getUserPreferences(userId);
    preferences.resetPreferences(section);
    await this.saveUserPreferences(userId, preferences);
    return preferences;
  }
  
  /**
   * Delete user preferences
   */
  async deleteUserPreferences(userId) {
    try {
      // Remove from memory and cache
      this.preferences.delete(userId);
      this.cache.delete(userId);
      
      // Cancel any pending saves
      if (this.saveTimers.has(userId)) {
        clearTimeout(this.saveTimers.get(userId));
        this.saveTimers.delete(userId);
      }
      
      // Remove from file system
      const userFilePath = this._getUserFilePath(userId);
      try {
        await fs.unlink(userFilePath);
      } catch (error) {
        // File might not exist, which is fine
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'delete',
        userId,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Create backup of all preferences
   */
  async createBackup() {
    if (!this.config.enableBackups) {
      return null;
    }
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `preferences-backup-${timestamp}.json`;
      const backupFilePath = path.join(this.backupPath, backupFileName);
      
      // Collect all preferences
      const allPreferences = {};
      for (const [userId, preferences] of this.preferences) {
        allPreferences[userId] = preferences.toJSON();
      }
      
      const backupData = {
        version: this.config.currentVersion,
        timestamp: Date.now(),
        preferences: allPreferences
      };
      
      // Write backup file
      await fs.writeFile(
        backupFilePath,
        JSON.stringify(backupData, null, 2),
        'utf8'
      );
      
      // Cleanup old backups
      await this._cleanupOldBackups();
      
      this.lastBackupTime = Date.now();
      
      this.emit(StorageEvents.BACKUP_CREATED, {
        filePath: backupFilePath,
        timestamp: this.lastBackupTime
      });
      
      return backupFilePath;
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'backup',
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Restore from backup
   */
  async restoreFromBackup(backupFilePath) {
    try {
      const backupData = JSON.parse(
        await fs.readFile(backupFilePath, 'utf8')
      );
      
      // Validate backup format
      if (!backupData.preferences || typeof backupData.preferences !== 'object') {
        throw new Error('Invalid backup format');
      }
      
      // Clear current preferences
      this.preferences.clear();
      this.cache.clear();
      
      // Restore preferences
      for (const [userId, prefsData] of Object.entries(backupData.preferences)) {
        const preferences = UserPreferences.fromJSON(prefsData);
        this.preferences.set(userId, preferences);
      }
      
      // Save all restored preferences
      for (const [userId, preferences] of this.preferences) {
        await this._saveToFile(userId, preferences);
      }
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'restore',
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Get all user IDs
   */
  getAllUserIds() {
    return Array.from(this.preferences.keys());
  }
  
  /**
   * Get storage statistics
   */
  getStorageStats() {
    return {
      userCount: this.preferences.size,
      cacheSize: this.cache.size,
      lastBackupTime: this.lastBackupTime,
      isInitialized: this.isInitialized,
      pendingSaves: this.saveTimers.size
    };
  }
  
  /**
   * Cleanup resources
   */
  async cleanup() {
    // Clear timers
    for (const timer of this.saveTimers.values()) {
      clearTimeout(timer);
    }
    this.saveTimers.clear();
    
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    
    // Save any pending changes
    for (const [userId, preferences] of this.preferences) {
      await this._saveToFile(userId, preferences);
    }
    
    // Clear caches
    this.cache.clear();
  }
  
  // Private methods
  
  /**
   * Bind event handlers
   */
  _bindEventHandlers() {
    // Listen for preference changes to trigger auto-save
    this.on('newListener', (event, listener) => {
      if (event === UserPreferencesEvents.PREFERENCES_UPDATED) {
        // Auto-save when preferences are updated
        listener.autoSave = true;
      }
    });
  }
  
  /**
   * Load all preferences from storage
   */
  async _loadAllPreferences() {
    try {
      // Check if main preferences file exists
      try {
        await fs.access(this.preferencesPath);
      } catch (error) {
        // File doesn't exist, start with empty preferences
        return;
      }
      
      const data = await fs.readFile(this.preferencesPath, 'utf8');
      const allPreferences = JSON.parse(data);
      
      // Load each user's preferences
      for (const [userId, prefsData] of Object.entries(allPreferences)) {
        try {
          const preferences = UserPreferences.fromJSON(prefsData);
          
          // Validate if enabled
          if (this.config.validateOnLoad) {
            const errors = preferences.validate();
            if (errors.length > 0) {
              this.emit(StorageEvents.VALIDATION_FAILED, {
                userId,
                errors,
                timestamp: Date.now()
              });
              
              if (this.config.strictValidation) {
                continue; // Skip invalid preferences
              }
            }
          }
          
          this.preferences.set(userId, preferences);
          
        } catch (error) {
          this.emit(StorageEvents.STORAGE_ERROR, {
            operation: 'load_user',
            userId,
            error: error.message,
            timestamp: Date.now()
          });
        }
      }
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'load_all',
        error: error.message,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * Schedule save with debouncing
   */
  async _scheduleSave(userId) {
    // Clear existing timer
    if (this.saveTimers.has(userId)) {
      clearTimeout(this.saveTimers.get(userId));
    }
    
    // Set new timer
    const timer = setTimeout(async () => {
      try {
        const preferences = this.preferences.get(userId);
        if (preferences) {
          await this._saveToFile(userId, preferences);
        }
        this.saveTimers.delete(userId);
      } catch (error) {
        this.emit(StorageEvents.STORAGE_ERROR, {
          operation: 'scheduled_save',
          userId,
          error: error.message,
          timestamp: Date.now()
        });
      }
    }, this.config.autoSaveDelay);
    
    this.saveTimers.set(userId, timer);
  }
  
  /**
   * Save to file
   */
  async _saveToFile(userId, preferences) {
    // For now, save all preferences to a single file
    // In the future, could save individual user files
    const allPreferences = {};
    for (const [uid, prefs] of this.preferences) {
      allPreferences[uid] = prefs.toJSON();
    }
    
    const data = JSON.stringify(allPreferences, null, 2);
    await fs.writeFile(this.preferencesPath, data, 'utf8');
  }
  
  /**
   * Get file path for specific user
   */
  _getUserFilePath(userId) {
    return path.join(this.config.basePath, `${userId}-preferences.json`);
  }
  
  /**
   * Start backup timer
   */
  _startBackupTimer() {
    this.backupTimer = setInterval(async () => {
      try {
        await this.createBackup();
      } catch (error) {
        // Error already emitted in createBackup
      }
    }, this.config.backupInterval);
  }
  
  /**
   * Cleanup old backup files
   */
  async _cleanupOldBackups() {
    try {
      const files = await fs.readdir(this.backupPath);
      const backupFiles = files
        .filter(file => file.startsWith('preferences-backup-'))
        .map(file => ({
          name: file,
          path: path.join(this.backupPath, file)
        }));
      
      if (backupFiles.length > this.config.maxBackups) {
        // Sort by name (which includes timestamp) and remove oldest
        backupFiles.sort((a, b) => a.name.localeCompare(b.name));
        const filesToDelete = backupFiles.slice(0, backupFiles.length - this.config.maxBackups);
        
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      // Non-critical error, just log it
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'cleanup_backups',
        error: error.message,
        timestamp: Date.now()
      });
    }
  }
}

// Export
module.exports = {
  UserPreferencesStorage,
  StorageEvents,
  StorageBackend,
  DEFAULT_CONFIG
};