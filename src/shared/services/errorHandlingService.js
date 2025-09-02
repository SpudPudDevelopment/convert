const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../utils/logger');

class ErrorHandlingService {
  constructor() {
    this.logger = createLogger('ErrorHandlingService');
    this.activeTransactions = new Map();
    this.errorHistory = [];
    this.maxHistorySize = 1000;
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    };
    this.stats = {
      totalErrors: 0,
      recoveredErrors: 0,
      criticalErrors: 0,
      retryAttempts: 0,
      transactionsStarted: 0,
      transactionsCompleted: 0,
      transactionsRolledBack: 0
    };
  }

  /**
   * Execute an operation with retry logic
   * @param {Function} operation - The operation to execute
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Operation result
   */
  async executeWithRetry(operation, options = {}) {
    const config = { ...this.retryConfig, ...options };
    let lastError;
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        this.logger.debug(`Executing operation (attempt ${attempt}/${config.maxRetries})`);
        const result = await operation();
        
        if (attempt > 1) {
          this.stats.recoveredErrors++;
          this.logger.info(`Operation succeeded after ${attempt} attempts`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        this.stats.retryAttempts++;
        
        if (attempt === config.maxRetries) {
          this.stats.totalErrors++;
          this.logger.error(`Operation failed after ${config.maxRetries} attempts`, {
            error: error.message,
            stack: error.stack
          });
          break;
        }
        
        if (!this._isRetryableError(error)) {
          this.stats.totalErrors++;
          this.logger.error('Non-retryable error encountered', {
            error: error.message,
            attempt
          });
          break;
        }
        
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        
        this.logger.warn(`Operation failed, retrying in ${delay}ms`, {
          attempt,
          error: error.message
        });
        
        await this._delay(delay);
      }
    }
    
    throw this._enhanceError(lastError, {
      operation: operation.name || 'anonymous',
      attempts: config.maxRetries
    });
  }

  /**
   * Start a transaction for related file operations
   * @param {string} transactionId - Unique transaction identifier
   * @param {Object} options - Transaction options
   * @returns {Object} Transaction context
   */
  async startTransaction(transactionId, options = {}) {
    if (this.activeTransactions.has(transactionId)) {
      throw new Error(`Transaction ${transactionId} already exists`);
    }

    const transaction = {
      id: transactionId,
      startTime: Date.now(),
      operations: [],
      rollbackActions: [],
      status: 'active',
      options: {
        autoRollback: true,
        createBackups: true,
        ...options
      }
    };

    this.activeTransactions.set(transactionId, transaction);
    this.stats.transactionsStarted++;
    
    this.logger.info(`Transaction started: ${transactionId}`, {
      options: transaction.options
    });
    
    return transaction;
  }

  /**
   * Add an operation to a transaction
   * @param {string} transactionId - Transaction identifier
   * @param {Object} operation - Operation details
   * @param {Function} rollbackAction - Function to rollback this operation
   */
  async addTransactionOperation(transactionId, operation, rollbackAction) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.status !== 'active') {
      throw new Error(`Transaction ${transactionId} is not active`);
    }

    transaction.operations.push({
      ...operation,
      timestamp: Date.now()
    });
    
    if (rollbackAction) {
      transaction.rollbackActions.unshift(rollbackAction); // LIFO order
    }

    this.logger.debug(`Operation added to transaction: ${transactionId}`, {
      operation: operation.type || 'unknown'
    });
  }

  /**
   * Commit a transaction
   * @param {string} transactionId - Transaction identifier
   * @returns {Promise<Object>} Transaction result
   */
  async commitTransaction(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    try {
      transaction.status = 'committing';
      transaction.endTime = Date.now();
      transaction.duration = transaction.endTime - transaction.startTime;
      
      this.activeTransactions.delete(transactionId);
      this.stats.transactionsCompleted++;
      
      this.logger.info(`Transaction committed: ${transactionId}`, {
        operations: transaction.operations.length,
        duration: transaction.duration
      });
      
      return {
        id: transactionId,
        status: 'committed',
        operations: transaction.operations.length,
        duration: transaction.duration
      };
    } catch (error) {
      transaction.status = 'failed';
      this.logger.error(`Failed to commit transaction: ${transactionId}`, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Rollback a transaction
   * @param {string} transactionId - Transaction identifier
   * @param {string} reason - Rollback reason
   * @returns {Promise<Object>} Rollback result
   */
  async rollbackTransaction(transactionId, reason = 'Manual rollback') {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    try {
      transaction.status = 'rolling_back';
      
      this.logger.info(`Rolling back transaction: ${transactionId}`, {
        reason,
        operations: transaction.operations.length
      });
      
      const rollbackResults = [];
      
      // Execute rollback actions in reverse order
      for (const rollbackAction of transaction.rollbackActions) {
        try {
          await rollbackAction();
          rollbackResults.push({ status: 'success' });
        } catch (error) {
          rollbackResults.push({ 
            status: 'failed', 
            error: error.message 
          });
          this.logger.error('Rollback action failed', {
            transactionId,
            error: error.message
          });
        }
      }
      
      transaction.status = 'rolled_back';
      transaction.endTime = Date.now();
      transaction.duration = transaction.endTime - transaction.startTime;
      
      this.activeTransactions.delete(transactionId);
      this.stats.transactionsRolledBack++;
      
      return {
        id: transactionId,
        status: 'rolled_back',
        reason,
        rollbackResults,
        duration: transaction.duration
      };
    } catch (error) {
      transaction.status = 'rollback_failed';
      this.logger.error(`Failed to rollback transaction: ${transactionId}`, {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle file system errors with context
   * @param {Error} error - The error to handle
   * @param {Object} context - Error context
   * @returns {Object} Enhanced error information
   */
  handleFileSystemError(error, context = {}) {
    const errorInfo = {
      originalError: error,
      code: error.code,
      message: error.message,
      context,
      timestamp: new Date().toISOString(),
      severity: this._determineSeverity(error),
      userMessage: this._generateUserMessage(error, context),
      suggestions: this._generateSuggestions(error, context),
      recoverable: this._isRecoverable(error)
    };

    this._addToHistory(errorInfo);
    
    if (errorInfo.severity === 'critical') {
      this.stats.criticalErrors++;
    }
    
    this.logger.error('File system error handled', {
      code: error.code,
      message: error.message,
      context,
      severity: errorInfo.severity
    });
    
    return errorInfo;
  }

  /**
   * Check file permissions and suggest elevation if needed
   * @param {string} filePath - File path to check
   * @param {string} operation - Intended operation (read, write, delete)
   * @returns {Promise<Object>} Permission check result
   */
  async checkPermissions(filePath, operation = 'read') {
    try {
      const stats = await fs.stat(filePath);
      const result = {
        path: filePath,
        operation,
        hasPermission: true,
        needsElevation: false,
        suggestions: []
      };

      // Test actual access
      try {
        switch (operation) {
          case 'read':
            await fs.access(filePath, fs.constants.R_OK);
            break;
          case 'write':
            await fs.access(filePath, fs.constants.W_OK);
            break;
          case 'delete':
            await fs.access(path.dirname(filePath), fs.constants.W_OK);
            break;
        }
      } catch (accessError) {
        result.hasPermission = false;
        result.needsElevation = accessError.code === 'EACCES';
        result.suggestions = this._generatePermissionSuggestions(accessError, filePath, operation);
      }

      return result;
    } catch (error) {
      return {
        path: filePath,
        operation,
        hasPermission: false,
        needsElevation: false,
        error: error.message,
        suggestions: [`File does not exist or is inaccessible: ${filePath}`]
      };
    }
  }

  /**
   * Get error history
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered error history
   */
  getErrorHistory(filters = {}) {
    let history = [...this.errorHistory];
    
    if (filters.severity) {
      history = history.filter(error => error.severity === filters.severity);
    }
    
    if (filters.since) {
      const since = new Date(filters.since);
      history = history.filter(error => new Date(error.timestamp) >= since);
    }
    
    if (filters.limit) {
      history = history.slice(-filters.limit);
    }
    
    return history;
  }

  /**
   * Get active transactions
   * @returns {Array} Active transactions
   */
  getActiveTransactions() {
    return Array.from(this.activeTransactions.values()).map(transaction => ({
      id: transaction.id,
      status: transaction.status,
      operations: transaction.operations.length,
      duration: Date.now() - transaction.startTime
    }));
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeTransactions: this.activeTransactions.size,
      errorHistorySize: this.errorHistory.length,
      recoveryRate: this.stats.totalErrors > 0 ? 
        ((this.stats.recoveredErrors / this.stats.totalErrors) * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Clear error history
   */
  clearErrorHistory() {
    this.errorHistory = [];
    this.logger.info('Error history cleared');
  }

  // Private methods

  /**
   * Check if an error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableCodes = [
      'EBUSY',    // Resource busy
      'EMFILE',   // Too many open files
      'ENFILE',   // File table overflow
      'EAGAIN',   // Resource temporarily unavailable
      'ETIMEDOUT' // Operation timed out
    ];
    
    return retryableCodes.includes(error.code) || 
           error.message.includes('timeout') ||
           error.message.includes('busy');
  }

  /**
   * Check if an error is recoverable
   * @private
   */
  _isRecoverable(error) {
    const unrecoverableCodes = [
      'ENOENT',   // File not found (unless creating)
      'EISDIR',   // Is a directory
      'ENOTDIR',  // Not a directory
      'EINVAL'    // Invalid argument
    ];
    
    return !unrecoverableCodes.includes(error.code);
  }

  /**
   * Determine error severity
   * @private
   */
  _determineSeverity(error) {
    const criticalCodes = ['ENOSPC', 'EIO', 'EROFS'];
    const warningCodes = ['EEXIST', 'ENOTEMPTY'];
    
    if (criticalCodes.includes(error.code)) {
      return 'critical';
    } else if (warningCodes.includes(error.code)) {
      return 'warning';
    } else {
      return 'error';
    }
  }

  /**
   * Generate user-friendly error message
   * @private
   */
  _generateUserMessage(error, context) {
    const messages = {
      'ENOENT': `File or directory not found: ${context.path || 'unknown'}`,
      'EACCES': `Permission denied accessing: ${context.path || 'unknown'}`,
      'ENOSPC': 'Not enough disk space to complete the operation',
      'EMFILE': 'Too many files are open. Please close some applications and try again',
      'EBUSY': `File is currently in use: ${context.path || 'unknown'}`,
      'EEXIST': `File already exists: ${context.path || 'unknown'}`,
      'EISDIR': `Expected a file but found a directory: ${context.path || 'unknown'}`,
      'ENOTDIR': `Expected a directory but found a file: ${context.path || 'unknown'}`,
      'EROFS': 'Cannot write to read-only file system',
      'EIO': 'Input/output error occurred while accessing the file system'
    };
    
    return messages[error.code] || `File system error: ${error.message}`;
  }

  /**
   * Generate suggestions for error resolution
   * @private
   */
  _generateSuggestions(error, context) {
    const suggestions = {
      'ENOENT': [
        'Verify the file path is correct',
        'Check if the file was moved or deleted',
        'Ensure the parent directory exists'
      ],
      'EACCES': [
        'Check file permissions',
        'Run the application with elevated privileges if necessary',
        'Ensure the file is not locked by another application'
      ],
      'ENOSPC': [
        'Free up disk space',
        'Choose a different output location',
        'Delete temporary files'
      ],
      'EMFILE': [
        'Close unnecessary applications',
        'Restart the application',
        'Increase system file limits'
      ],
      'EBUSY': [
        'Close the file in other applications',
        'Wait a moment and try again',
        'Restart the application using the file'
      ]
    };
    
    return suggestions[error.code] || ['Contact support if the problem persists'];
  }

  /**
   * Generate permission-specific suggestions
   * @private
   */
  _generatePermissionSuggestions(error, filePath, operation) {
    const suggestions = [];
    
    if (error.code === 'EACCES') {
      suggestions.push(`Cannot ${operation} file: ${filePath}`);
      suggestions.push('Check file permissions and ownership');
      
      if (process.platform === 'win32') {
        suggestions.push('Try running as Administrator');
      } else {
        suggestions.push('Try running with sudo or check file ownership');
      }
    }
    
    return suggestions;
  }

  /**
   * Enhance error with additional context
   * @private
   */
  _enhanceError(error, context) {
    const enhanced = new Error(error.message);
    enhanced.name = error.name;
    enhanced.code = error.code;
    enhanced.stack = error.stack;
    enhanced.context = context;
    enhanced.timestamp = new Date().toISOString();
    
    return enhanced;
  }

  /**
   * Add error to history
   * @private
   */
  _addToHistory(errorInfo) {
    this.errorHistory.push(errorInfo);
    
    // Maintain history size limit
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Delay utility
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ErrorHandlingService;