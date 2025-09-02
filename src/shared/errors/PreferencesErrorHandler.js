/**
 * Preferences Error Handler
 * Comprehensive error handling for user preferences import/export operations
 */

const { EventEmitter } = require('events');
const { ERROR_TYPES } = require('../types/ipc');

/**
 * Preferences-specific error types
 */
const PreferencesErrorTypes = {
  // Import/Export errors
  IMPORT_VALIDATION_FAILED: 'IMPORT_VALIDATION_FAILED',
  EXPORT_FAILED: 'EXPORT_FAILED',
  BACKUP_CREATION_FAILED: 'BACKUP_CREATION_FAILED',
  BACKUP_RESTORE_FAILED: 'BACKUP_RESTORE_FAILED',
  
  // Data integrity errors
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  CORRUPTED_DATA: 'CORRUPTED_DATA',
  INVALID_FORMAT: 'INVALID_FORMAT',
  VERSION_INCOMPATIBLE: 'VERSION_INCOMPATIBLE',
  
  // Merge strategy errors
  MERGE_CONFLICT: 'MERGE_CONFLICT',
  PRESET_CONFLICT: 'PRESET_CONFLICT',
  SECTION_CONFLICT: 'SECTION_CONFLICT',
  
  // Storage errors
  STORAGE_FULL: 'STORAGE_FULL',
  STORAGE_ACCESS_DENIED: 'STORAGE_ACCESS_DENIED',
  STORAGE_CORRUPTED: 'STORAGE_CORRUPTED',
  
  // Validation errors
  MISSING_REQUIRED_SECTIONS: 'MISSING_REQUIRED_SECTIONS',
  INVALID_PREFERENCES_STRUCTURE: 'INVALID_PREFERENCES_STRUCTURE',
  INVALID_PRESETS_STRUCTURE: 'INVALID_PRESETS_STRUCTURE',
  INVALID_RECENT_JOBS_STRUCTURE: 'INVALID_RECENT_JOBS_STRUCTURE',
  
  // Operation errors
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  CONCURRENT_OPERATION: 'CONCURRENT_OPERATION'
};

/**
 * Error severity levels
 */
const PreferencesErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Recovery strategies
 */
const PreferencesRecoveryStrategies = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  RESTORE_BACKUP: 'restore_backup',
  RESET_TO_DEFAULTS: 'reset_to_defaults',
  MANUAL_INTERVENTION: 'manual_intervention'
};

/**
 * Preferences Error class
 */
class PreferencesError extends Error {
  constructor(type, message, details = {}) {
    super(message);
    this.name = 'PreferencesError';
    this.type = type;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.severity = this._determineSeverity(type);
    this.recoveryStrategy = this._determineRecoveryStrategy(type);
    this.userMessage = this._generateUserMessage(type, details);
  }
  
  /**
   * Determine error severity based on type
   * @private
   */
  _determineSeverity(type) {
    const criticalErrors = [
      PreferencesErrorTypes.STORAGE_CORRUPTED,
      PreferencesErrorTypes.CORRUPTED_DATA,
      PreferencesErrorTypes.BACKUP_RESTORE_FAILED
    ];
    
    const highErrors = [
      PreferencesErrorTypes.IMPORT_VALIDATION_FAILED,
      PreferencesErrorTypes.EXPORT_FAILED,
      PreferencesErrorTypes.CHECKSUM_MISMATCH,
      PreferencesErrorTypes.VERSION_INCOMPATIBLE
    ];
    
    const mediumErrors = [
      PreferencesErrorTypes.MERGE_CONFLICT,
      PreferencesErrorTypes.PRESET_CONFLICT,
      PreferencesErrorTypes.BACKUP_CREATION_FAILED
    ];
    
    if (criticalErrors.includes(type)) return PreferencesErrorSeverity.CRITICAL;
    if (highErrors.includes(type)) return PreferencesErrorSeverity.HIGH;
    if (mediumErrors.includes(type)) return PreferencesErrorSeverity.MEDIUM;
    return PreferencesErrorSeverity.LOW;
  }
  
  /**
   * Determine recovery strategy based on error type
   * @private
   */
  _determineRecoveryStrategy(type) {
    const strategies = {
      [PreferencesErrorTypes.IMPORT_VALIDATION_FAILED]: PreferencesRecoveryStrategies.MANUAL_INTERVENTION,
      [PreferencesErrorTypes.EXPORT_FAILED]: PreferencesRecoveryStrategies.RETRY,
      [PreferencesErrorTypes.BACKUP_CREATION_FAILED]: PreferencesRecoveryStrategies.RETRY,
      [PreferencesErrorTypes.BACKUP_RESTORE_FAILED]: PreferencesRecoveryStrategies.RESET_TO_DEFAULTS,
      [PreferencesErrorTypes.CHECKSUM_MISMATCH]: PreferencesRecoveryStrategies.MANUAL_INTERVENTION,
      [PreferencesErrorTypes.CORRUPTED_DATA]: PreferencesRecoveryStrategies.RESTORE_BACKUP,
      [PreferencesErrorTypes.VERSION_INCOMPATIBLE]: PreferencesRecoveryStrategies.MANUAL_INTERVENTION,
      [PreferencesErrorTypes.MERGE_CONFLICT]: PreferencesRecoveryStrategies.MANUAL_INTERVENTION,
      [PreferencesErrorTypes.STORAGE_FULL]: PreferencesRecoveryStrategies.MANUAL_INTERVENTION,
      [PreferencesErrorTypes.STORAGE_ACCESS_DENIED]: PreferencesRecoveryStrategies.MANUAL_INTERVENTION,
      [PreferencesErrorTypes.OPERATION_TIMEOUT]: PreferencesRecoveryStrategies.RETRY
    };
    
    return strategies[type] || PreferencesRecoveryStrategies.RETRY;
  }
  
  /**
   * Generate user-friendly error message
   * @private
   */
  _generateUserMessage(type, details) {
    const messages = {
      [PreferencesErrorTypes.IMPORT_VALIDATION_FAILED]: 
        'The preferences file contains invalid data and cannot be imported. Please check the file format and try again.',
      [PreferencesErrorTypes.EXPORT_FAILED]: 
        'Failed to export preferences. Please check your permissions and available disk space.',
      [PreferencesErrorTypes.BACKUP_CREATION_FAILED]: 
        'Could not create a backup before importing. The import operation was cancelled for safety.',
      [PreferencesErrorTypes.BACKUP_RESTORE_FAILED]: 
        'Failed to restore from backup. Your preferences may need to be reset to defaults.',
      [PreferencesErrorTypes.CHECKSUM_MISMATCH]: 
        'The preferences file appears to be corrupted or modified. Import cancelled for security.',
      [PreferencesErrorTypes.CORRUPTED_DATA]: 
        'The preferences data is corrupted. Please restore from a backup or reset to defaults.',
      [PreferencesErrorTypes.INVALID_FORMAT]: 
        'The preferences file format is not recognized. Please ensure you\'re importing a valid preferences file.',
      [PreferencesErrorTypes.VERSION_INCOMPATIBLE]: 
        `The preferences file was created with an incompatible version${details.version ? ` (${details.version})` : ''}. Please update the application or use a compatible file.`,
      [PreferencesErrorTypes.MERGE_CONFLICT]: 
        'Conflicts were detected while merging preferences. Please review and resolve the conflicts manually.',
      [PreferencesErrorTypes.PRESET_CONFLICT]: 
        `Preset conflicts detected${details.conflictCount ? ` (${details.conflictCount} conflicts)` : ''}. Some presets may have been renamed or skipped.`,
      [PreferencesErrorTypes.SECTION_CONFLICT]: 
        'Some preference sections conflict with existing settings. Please choose how to resolve these conflicts.',
      [PreferencesErrorTypes.STORAGE_FULL]: 
        'Not enough disk space to complete the operation. Please free up space and try again.',
      [PreferencesErrorTypes.STORAGE_ACCESS_DENIED]: 
        'Permission denied while accessing preferences storage. Please check file permissions.',
      [PreferencesErrorTypes.STORAGE_CORRUPTED]: 
        'The preferences storage is corrupted. Your settings may need to be reset.',
      [PreferencesErrorTypes.MISSING_REQUIRED_SECTIONS]: 
        'The preferences file is missing required sections and cannot be imported.',
      [PreferencesErrorTypes.INVALID_PREFERENCES_STRUCTURE]: 
        'The preferences structure in the file is invalid. Please check the file format.',
      [PreferencesErrorTypes.INVALID_PRESETS_STRUCTURE]: 
        'The presets data in the file is invalid and cannot be imported.',
      [PreferencesErrorTypes.INVALID_RECENT_JOBS_STRUCTURE]: 
        'The recent jobs data in the file is invalid and will be skipped.',
      [PreferencesErrorTypes.OPERATION_CANCELLED]: 
        'The operation was cancelled by the user.',
      [PreferencesErrorTypes.OPERATION_TIMEOUT]: 
        'The operation timed out. Please try again or check your system performance.',
      [PreferencesErrorTypes.CONCURRENT_OPERATION]: 
        'Another preferences operation is already in progress. Please wait and try again.'
    };
    
    return messages[type] || 'An unexpected error occurred while processing preferences.';
  }
  
  /**
   * Convert to JSON for serialization
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * Preferences Error Handler class
 */
class PreferencesErrorHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      enableLogging: true,
      enableRecovery: true,
      maxRetryAttempts: 3,
      retryDelay: 1000,
      ...options
    };
    
    this.retryAttempts = new Map();
  }
  
  /**
   * Handle an error with automatic recovery attempts
   */
  async handleError(error, context = {}) {
    const preferencesError = this._normalizeError(error, context);
    
    // Log the error
    if (this.options.enableLogging) {
      this._logError(preferencesError, context);
    }
    
    // Emit error event
    this.emit('error', preferencesError, context);
    
    // Attempt recovery if enabled
    if (this.options.enableRecovery) {
      const recovered = await this._attemptRecovery(preferencesError, context);
      if (recovered) {
        this.emit('recovered', preferencesError, context);
        return { recovered: true, error: preferencesError };
      }
    }
    
    return { recovered: false, error: preferencesError };
  }
  
  /**
   * Create a preferences error
   */
  createError(type, message, details = {}) {
    return new PreferencesError(type, message, details);
  }
  
  /**
   * Normalize any error to PreferencesError
   * @private
   */
  _normalizeError(error, context) {
    if (error instanceof PreferencesError) {
      return error;
    }
    
    // Try to determine error type from message or context
    const type = this._inferErrorType(error, context);
    const details = {
      originalError: error.message,
      originalStack: error.stack,
      context
    };
    
    return new PreferencesError(type, error.message, details);
  }
  
  /**
   * Infer error type from error message and context
   * @private
   */
  _inferErrorType(error, context) {
    const message = error.message?.toLowerCase() || '';
    const operation = context.operation?.toLowerCase() || '';
    
    // Import/Export operation errors
    if (operation.includes('import')) {
      if (message.includes('validation')) return PreferencesErrorTypes.IMPORT_VALIDATION_FAILED;
      if (message.includes('checksum')) return PreferencesErrorTypes.CHECKSUM_MISMATCH;
      if (message.includes('version')) return PreferencesErrorTypes.VERSION_INCOMPATIBLE;
      if (message.includes('format')) return PreferencesErrorTypes.INVALID_FORMAT;
      return PreferencesErrorTypes.IMPORT_VALIDATION_FAILED;
    }
    
    if (operation.includes('export')) {
      return PreferencesErrorTypes.EXPORT_FAILED;
    }
    
    if (operation.includes('backup')) {
      if (operation.includes('restore')) return PreferencesErrorTypes.BACKUP_RESTORE_FAILED;
      return PreferencesErrorTypes.BACKUP_CREATION_FAILED;
    }
    
    // Storage errors
    if (message.includes('permission') || message.includes('access denied')) {
      return PreferencesErrorTypes.STORAGE_ACCESS_DENIED;
    }
    
    if (message.includes('space') || message.includes('disk full')) {
      return PreferencesErrorTypes.STORAGE_FULL;
    }
    
    if (message.includes('timeout')) {
      return PreferencesErrorTypes.OPERATION_TIMEOUT;
    }
    
    // Default to generic error type
    return ERROR_TYPES.UNKNOWN_ERROR;
  }
  
  /**
   * Log error with appropriate level
   * @private
   */
  _logError(error, context) {
    const logData = {
      type: error.type,
      message: error.message,
      severity: error.severity,
      context,
      timestamp: error.timestamp
    };
    
    switch (error.severity) {
      case PreferencesErrorSeverity.CRITICAL:
        console.error('[CRITICAL] Preferences Error:', logData);
        break;
      case PreferencesErrorSeverity.HIGH:
        console.error('[HIGH] Preferences Error:', logData);
        break;
      case PreferencesErrorSeverity.MEDIUM:
        console.warn('[MEDIUM] Preferences Error:', logData);
        break;
      default:
        console.log('[LOW] Preferences Error:', logData);
    }
  }
  
  /**
   * Attempt error recovery based on strategy
   * @private
   */
  async _attemptRecovery(error, context) {
    const { recoveryStrategy } = error;
    const operationKey = `${context.operation || 'unknown'}_${error.type}`;
    
    switch (recoveryStrategy) {
      case PreferencesRecoveryStrategies.RETRY:
        return await this._retryOperation(error, context, operationKey);
        
      case PreferencesRecoveryStrategies.FALLBACK:
        return await this._fallbackOperation(error, context);
        
      case PreferencesRecoveryStrategies.RESTORE_BACKUP:
        return await this._restoreFromBackup(error, context);
        
      case PreferencesRecoveryStrategies.RESET_TO_DEFAULTS:
        return await this._resetToDefaults(error, context);
        
      default:
        return false; // Manual intervention required
    }
  }
  
  /**
   * Retry operation with exponential backoff
   * @private
   */
  async _retryOperation(error, context, operationKey) {
    const attempts = this.retryAttempts.get(operationKey) || 0;
    
    if (attempts >= this.options.maxRetryAttempts) {
      this.retryAttempts.delete(operationKey);
      return false;
    }
    
    this.retryAttempts.set(operationKey, attempts + 1);
    
    // Exponential backoff
    const delay = this.options.retryDelay * Math.pow(2, attempts);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      // Emit retry event for the operation to be retried
      this.emit('retry', { error, context, attempt: attempts + 1 });
      return true;
    } catch (retryError) {
      return false;
    }
  }
  
  /**
   * Attempt fallback operation
   * @private
   */
  async _fallbackOperation(error, context) {
    // Emit fallback event for custom handling
    this.emit('fallback', { error, context });
    return false; // Requires external handling
  }
  
  /**
   * Restore from backup
   * @private
   */
  async _restoreFromBackup(error, context) {
    // Emit restore event for custom handling
    this.emit('restore', { error, context });
    return false; // Requires external handling
  }
  
  /**
   * Reset to defaults
   * @private
   */
  async _resetToDefaults(error, context) {
    // Emit reset event for custom handling
    this.emit('reset', { error, context });
    return false; // Requires external handling
  }
  
  /**
   * Clear retry attempts for an operation
   */
  clearRetryAttempts(operationKey) {
    this.retryAttempts.delete(operationKey);
  }
  
  /**
   * Get error statistics
   */
  getErrorStats() {
    return {
      retryAttempts: Object.fromEntries(this.retryAttempts),
      totalRetries: Array.from(this.retryAttempts.values()).reduce((sum, count) => sum + count, 0)
    };
  }
}

// Export
module.exports = {
  PreferencesError,
  PreferencesErrorHandler,
  PreferencesErrorTypes,
  PreferencesErrorSeverity,
  PreferencesRecoveryStrategies
};