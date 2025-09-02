/**
 * Preferences Manager
 * Manages multiple PreferencesAPI instances and provides additional safety features
 */

const { EventEmitter } = require('events');
const { PreferencesAPI, PreferencesAPIEvents } = require('./PreferencesAPI');
const { UserPreferences } = require('../models/UserPreferences');

/**
 * Manager Events
 */
const PreferencesManagerEvents = {
  INSTANCE_CREATED: 'instance_created',
  INSTANCE_DESTROYED: 'instance_destroyed',
  GLOBAL_PREFERENCE_CHANGED: 'global_preference_changed',
  BACKUP_CREATED: 'backup_created',
  BACKUP_RESTORED: 'backup_restored',
  MANAGER_ERROR: 'manager_error'
};

/**
 * Preferences Manager class
 * Provides centralized management of preferences with safety features
 */
class PreferencesManager extends EventEmitter {
  constructor() {
    super();
    
    this._instances = new Map(); // userId -> PreferencesAPI
    this._backups = new Map(); // userId -> backup data
    this._defaultInstance = null;
    this._readOnlyMode = false;
    this._transactionMode = false;
    this._pendingTransactions = new Map();
    
    // Safety features
    this._maxInstances = 10;
    this._autoBackup = true;
    this._backupInterval = 5 * 60 * 1000; // 5 minutes
    this._backupTimer = null;
    
    this._startAutoBackup();
  }
  
  /**
   * Get or create a PreferencesAPI instance for a user
   * @param {string} userId - User identifier
   * @param {Object} options - Creation options
   * @returns {PreferencesAPI} The preferences API instance
   */
  getInstance(userId = 'default', options = {}) {
    if (this._instances.has(userId)) {
      return this._instances.get(userId);
    }
    
    // Check instance limit
    if (this._instances.size >= this._maxInstances) {
      throw new Error(`Maximum number of preference instances (${this._maxInstances}) reached`);
    }
    
    try {
      // Create UserPreferences instance
      const userPreferences = options.data 
        ? UserPreferences.fromJSON(options.data)
        : UserPreferences.createDefault(userId);
      
      // Create PreferencesAPI instance
      const api = new PreferencesAPI(userPreferences);
      
      // Setup event forwarding
      this._setupInstanceEventForwarding(api, userId);
      
      // Store instance
      this._instances.set(userId, api);
      
      // Set as default if first instance
      if (!this._defaultInstance) {
        this._defaultInstance = api;
      }
      
      this.emit(PreferencesManagerEvents.INSTANCE_CREATED, {
        userId,
        timestamp: Date.now()
      });
      
      return api;
    } catch (error) {
      this.emit(PreferencesManagerEvents.MANAGER_ERROR, {
        operation: 'getInstance',
        userId,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Setup event forwarding for an instance
   * @param {PreferencesAPI} api - The API instance
   * @param {string} userId - User identifier
   */
  _setupInstanceEventForwarding(api, userId) {
    api.on(PreferencesAPIEvents.PREFERENCE_CHANGED, (data) => {
      this.emit(PreferencesManagerEvents.GLOBAL_PREFERENCE_CHANGED, {
        userId,
        ...data
      });
    });
    
    api.on(PreferencesAPIEvents.API_ERROR, (data) => {
      this.emit(PreferencesManagerEvents.MANAGER_ERROR, {
        userId,
        source: 'api_instance',
        ...data
      });
    });
  }
  
  /**
   * Get the default preferences instance
   * @returns {PreferencesAPI} The default instance
   */
  getDefault() {
    if (!this._defaultInstance) {
      this._defaultInstance = this.getInstance('default');
    }
    return this._defaultInstance;
  }
  
  /**
   * Destroy a preferences instance
   * @param {string} userId - User identifier
   * @returns {boolean} Success status
   */
  destroyInstance(userId) {
    if (!this._instances.has(userId)) {
      return false;
    }
    
    try {
      const api = this._instances.get(userId);
      
      // Remove all listeners
      api.removeAllListeners();
      
      // Remove from instances
      this._instances.delete(userId);
      
      // Clear default if this was it
      if (this._defaultInstance === api) {
        this._defaultInstance = this._instances.size > 0 
          ? this._instances.values().next().value 
          : null;
      }
      
      this.emit(PreferencesManagerEvents.INSTANCE_DESTROYED, {
        userId,
        timestamp: Date.now()
      });
      
      return true;
    } catch (error) {
      this.emit(PreferencesManagerEvents.MANAGER_ERROR, {
        operation: 'destroyInstance',
        userId,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }
  
  /**
   * Get all active user IDs
   * @returns {string[]} Array of user IDs
   */
  getActiveUsers() {
    return Array.from(this._instances.keys());
  }
  
  /**
   * Check if an instance exists for a user
   * @param {string} userId - User identifier
   * @returns {boolean} Whether instance exists
   */
  hasInstance(userId) {
    return this._instances.has(userId);
  }
  
  /**
   * Create a backup of user preferences
   * @param {string} userId - User identifier
   * @returns {boolean} Success status
   */
  createBackup(userId) {
    if (!this._instances.has(userId)) {
      return false;
    }
    
    try {
      const api = this._instances.get(userId);
      const backup = {
        data: api.export(),
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      this._backups.set(userId, backup);
      
      this.emit(PreferencesManagerEvents.BACKUP_CREATED, {
        userId,
        timestamp: backup.timestamp
      });
      
      return true;
    } catch (error) {
      this.emit(PreferencesManagerEvents.MANAGER_ERROR, {
        operation: 'createBackup',
        userId,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }
  
  /**
   * Restore preferences from backup
   * @param {string} userId - User identifier
   * @returns {boolean} Success status
   */
  restoreBackup(userId) {
    if (!this._backups.has(userId)) {
      return false;
    }
    
    try {
      const backup = this._backups.get(userId);
      const api = this.getInstance(userId);
      
      const success = api.import(backup.data);
      
      if (success) {
        this.emit(PreferencesManagerEvents.BACKUP_RESTORED, {
          userId,
          backupTimestamp: backup.timestamp,
          timestamp: Date.now()
        });
      }
      
      return success;
    } catch (error) {
      this.emit(PreferencesManagerEvents.MANAGER_ERROR, {
        operation: 'restoreBackup',
        userId,
        error: error.message,
        timestamp: Date.now()
      });
      return false;
    }
  }
  
  /**
   * Start a transaction for batch updates
   * @param {string} userId - User identifier
   * @returns {string} Transaction ID
   */
  startTransaction(userId) {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this._pendingTransactions.set(transactionId, {
      userId,
      updates: [],
      startTime: Date.now()
    });
    
    return transactionId;
  }
  
  /**
   * Add an update to a transaction
   * @param {string} transactionId - Transaction identifier
   * @param {string} path - Preference path
   * @param {*} value - New value
   */
  addToTransaction(transactionId, path, value) {
    if (!this._pendingTransactions.has(transactionId)) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    const transaction = this._pendingTransactions.get(transactionId);
    transaction.updates.push({ path, value });
  }
  
  /**
   * Commit a transaction
   * @param {string} transactionId - Transaction identifier
   * @returns {Object} Commit result
   */
  commitTransaction(transactionId) {
    if (!this._pendingTransactions.has(transactionId)) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    const transaction = this._pendingTransactions.get(transactionId);
    const api = this.getInstance(transaction.userId);
    
    try {
      // Create backup before transaction
      this.createBackup(transaction.userId);
      
      // Apply all updates
      const updates = {};
      for (const update of transaction.updates) {
        updates[update.path] = update.value;
      }
      
      const result = api.update(updates);
      
      // Clean up transaction
      this._pendingTransactions.delete(transactionId);
      
      return {
        success: result.success,
        transactionId,
        updatesApplied: result.updated.length,
        updatesFailed: result.failed.length,
        duration: Date.now() - transaction.startTime
      };
    } catch (error) {
      // Rollback on error
      this.rollbackTransaction(transactionId);
      throw error;
    }
  }
  
  /**
   * Rollback a transaction
   * @param {string} transactionId - Transaction identifier
   * @returns {boolean} Success status
   */
  rollbackTransaction(transactionId) {
    if (!this._pendingTransactions.has(transactionId)) {
      return false;
    }
    
    const transaction = this._pendingTransactions.get(transactionId);
    
    // Restore from backup if available
    const restored = this.restoreBackup(transaction.userId);
    
    // Clean up transaction
    this._pendingTransactions.delete(transactionId);
    
    return restored;
  }
  
  /**
   * Enable or disable read-only mode
   * @param {boolean} enabled - Whether to enable read-only mode
   */
  setReadOnlyMode(enabled) {
    this._readOnlyMode = enabled;
    
    // Disable validation and caching in read-only mode
    for (const api of this._instances.values()) {
      if (enabled) {
        api.setValidationEnabled(false);
        api.setCachingEnabled(true); // Enable caching for better read performance
      } else {
        api.setValidationEnabled(true);
      }
    }
  }
  
  /**
   * Check if manager is in read-only mode
   * @returns {boolean} Read-only status
   */
  isReadOnly() {
    return this._readOnlyMode;
  }
  
  /**
   * Start automatic backup process
   */
  _startAutoBackup() {
    if (!this._autoBackup) return;
    
    this._backupTimer = setInterval(() => {
      for (const userId of this._instances.keys()) {
        this.createBackup(userId);
      }
    }, this._backupInterval);
  }
  
  /**
   * Stop automatic backup process
   */
  _stopAutoBackup() {
    if (this._backupTimer) {
      clearInterval(this._backupTimer);
      this._backupTimer = null;
    }
  }
  
  /**
   * Configure auto-backup settings
   * @param {Object} options - Backup options
   */
  configureAutoBackup(options = {}) {
    const { enabled = true, interval = 5 * 60 * 1000 } = options;
    
    this._autoBackup = enabled;
    this._backupInterval = interval;
    
    this._stopAutoBackup();
    if (enabled) {
      this._startAutoBackup();
    }
  }
  
  /**
   * Get manager statistics
   * @returns {Object} Manager statistics
   */
  getStats() {
    return {
      activeInstances: this._instances.size,
      maxInstances: this._maxInstances,
      backupsStored: this._backups.size,
      pendingTransactions: this._pendingTransactions.size,
      readOnlyMode: this._readOnlyMode,
      autoBackupEnabled: this._autoBackup,
      backupInterval: this._backupInterval
    };
  }
  
  /**
   * Cleanup resources
   */
  destroy() {
    // Stop auto-backup
    this._stopAutoBackup();
    
    // Destroy all instances
    for (const userId of this._instances.keys()) {
      this.destroyInstance(userId);
    }
    
    // Clear backups and transactions
    this._backups.clear();
    this._pendingTransactions.clear();
    
    // Remove all listeners
    this.removeAllListeners();
  }
}

module.exports = {
  PreferencesManager,
  PreferencesManagerEvents
};