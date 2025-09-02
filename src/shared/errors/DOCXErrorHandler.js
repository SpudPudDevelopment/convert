/**
 * DOCX Error Handler
 * Comprehensive error handling for DOCX operations
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * DOCX error types
 */
const DOCXErrorTypes = {
  FILE_ERROR: 'file_error',
  FORMAT_ERROR: 'format_error',
  SECURITY_ERROR: 'security_error',
  CONTENT_ERROR: 'content_error',
  CONVERSION_ERROR: 'conversion_error',
  MEMORY_ERROR: 'memory_error',
  NETWORK_ERROR: 'network_error',
  UNKNOWN_ERROR: 'unknown_error'
};

/**
 * DOCX error severity levels
 */
const DOCXErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * DOCX recovery strategies
 */
const DOCXRecoveryStrategies = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  REPAIR: 'repair',
  ALTERNATIVE: 'alternative',
  SKIP: 'skip'
};

/**
 * DOCX Error class
 */
class DOCXError extends Error {
  constructor(message, type = DOCXErrorTypes.UNKNOWN_ERROR, severity = DOCXErrorSeverity.MEDIUM, details = {}) {
    super(message);
    this.name = 'DOCXError';
    this.type = type;
    this.severity = severity;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.recoverable = this.isRecoverable();
    this.suggestedStrategy = this.getSuggestedStrategy();
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable() {
    const recoverableTypes = [
      DOCXErrorTypes.NETWORK_ERROR,
      DOCXErrorTypes.MEMORY_ERROR,
      DOCXErrorTypes.CONTENT_ERROR
    ];
    return recoverableTypes.includes(this.type);
  }

  /**
   * Get suggested recovery strategy
   */
  getSuggestedStrategy() {
    switch (this.type) {
      case DOCXErrorTypes.NETWORK_ERROR:
        return DOCXRecoveryStrategies.RETRY;
      case DOCXErrorTypes.MEMORY_ERROR:
        return DOCXRecoveryStrategies.FALLBACK;
      case DOCXErrorTypes.FORMAT_ERROR:
        return DOCXRecoveryStrategies.REPAIR;
      case DOCXErrorTypes.CONTENT_ERROR:
        return DOCXRecoveryStrategies.ALTERNATIVE;
      case DOCXErrorTypes.SECURITY_ERROR:
        return DOCXRecoveryStrategies.SKIP;
      default:
        return DOCXRecoveryStrategies.RETRY;
    }
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      details: this.details,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      suggestedStrategy: this.suggestedStrategy,
      stack: this.stack
    };
  }
}

/**
 * DOCX Error Handler class
 */
class DOCXErrorHandler extends EventEmitter {
  constructor() {
    super();
    this.errorLog = [];
    this.statistics = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Handle DOCX error
   */
  async handleError(error, context = {}) {
    const docxError = this.classifyError(error, context);
    
    // Log the error
    this.logError(docxError);
    
    // Update statistics
    this.updateStatistics(docxError);
    
    // Emit error event
    this.emit('error', docxError);
    
    // Attempt recovery if possible
    if (docxError.recoverable && context.enableRecovery !== false) {
      return await this.attemptRecovery(docxError, context);
    }
    
    return {
      success: false,
      error: docxError,
      recovered: false
    };
  }

  /**
   * Classify error type and severity
   */
  classifyError(error, context = {}) {
    let type = DOCXErrorTypes.UNKNOWN_ERROR;
    let severity = DOCXErrorSeverity.MEDIUM;
    let details = { context };

    const message = error.message || error.toString();
    const lowerMessage = message.toLowerCase();

    // Classify by error message patterns
    if (lowerMessage.includes('no such file') || lowerMessage.includes('enoent')) {
      type = DOCXErrorTypes.FILE_ERROR;
      severity = DOCXErrorSeverity.HIGH;
      details.reason = 'File not found';
    } else if (lowerMessage.includes('permission denied') || lowerMessage.includes('eacces')) {
      type = DOCXErrorTypes.SECURITY_ERROR;
      severity = DOCXErrorSeverity.HIGH;
      details.reason = 'Permission denied';
    } else if (lowerMessage.includes('invalid') || lowerMessage.includes('corrupt') || lowerMessage.includes('malformed')) {
      type = DOCXErrorTypes.FORMAT_ERROR;
      severity = DOCXErrorSeverity.MEDIUM;
      details.reason = 'Invalid or corrupted DOCX format';
    } else if (lowerMessage.includes('memory') || lowerMessage.includes('heap')) {
      type = DOCXErrorTypes.MEMORY_ERROR;
      severity = DOCXErrorSeverity.HIGH;
      details.reason = 'Memory allocation error';
    } else if (lowerMessage.includes('network') || lowerMessage.includes('timeout') || lowerMessage.includes('connection')) {
      type = DOCXErrorTypes.NETWORK_ERROR;
      severity = DOCXErrorSeverity.MEDIUM;
      details.reason = 'Network connectivity issue';
    } else if (lowerMessage.includes('conversion') || lowerMessage.includes('transform')) {
      type = DOCXErrorTypes.CONVERSION_ERROR;
      severity = DOCXErrorSeverity.MEDIUM;
      details.reason = 'Document conversion failed';
    } else if (lowerMessage.includes('content') || lowerMessage.includes('parse')) {
      type = DOCXErrorTypes.CONTENT_ERROR;
      severity = DOCXErrorSeverity.LOW;
      details.reason = 'Content parsing issue';
    }

    // Add file information if available
    if (context.filePath) {
      details.filePath = context.filePath;
      details.fileName = path.basename(context.filePath);
    }

    // Add operation information
    if (context.operation) {
      details.operation = context.operation;
    }

    return new DOCXError(message, type, severity, details);
  }

  /**
   * Attempt error recovery
   */
  async attemptRecovery(docxError, context = {}) {
    this.statistics.recoveryAttempts++;
    
    const strategy = docxError.suggestedStrategy;
    const maxRetries = context.maxRetries || this.maxRetries;
    const retryDelay = context.retryDelay || this.retryDelay;
    
    this.emit('recoveryAttempt', {
      error: docxError,
      strategy,
      attempt: 1,
      maxRetries
    });

    try {
      let result;
      
      switch (strategy) {
        case DOCXRecoveryStrategies.RETRY:
          result = await this.retryOperation(context, maxRetries, retryDelay);
          break;
          
        case DOCXRecoveryStrategies.FALLBACK:
          result = await this.fallbackOperation(context);
          break;
          
        case DOCXRecoveryStrategies.REPAIR:
          result = await this.repairOperation(context);
          break;
          
        case DOCXRecoveryStrategies.ALTERNATIVE:
          result = await this.alternativeOperation(context);
          break;
          
        case DOCXRecoveryStrategies.SKIP:
          result = await this.skipOperation(context);
          break;
          
        default:
          result = { success: false, error: 'Unknown recovery strategy' };
      }
      
      if (result.success) {
        this.statistics.successfulRecoveries++;
        this.emit('recoverySuccess', {
          error: docxError,
          strategy,
          result
        });
      } else {
        this.emit('recoveryFailure', {
          error: docxError,
          strategy,
          result
        });
      }
      
      return {
        success: result.success,
        error: docxError,
        recovered: result.success,
        recoveryStrategy: strategy,
        recoveryResult: result
      };
      
    } catch (recoveryError) {
      this.emit('recoveryFailure', {
        error: docxError,
        strategy,
        recoveryError
      });
      
      return {
        success: false,
        error: docxError,
        recovered: false,
        recoveryError
      };
    }
  }

  /**
   * Retry operation
   */
  async retryOperation(context, maxRetries, retryDelay) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
        
        if (context.retryFunction && typeof context.retryFunction === 'function') {
          const result = await context.retryFunction();
          return { success: true, result, attempt };
        }
        
        return { success: false, error: 'No retry function provided' };
        
      } catch (error) {
        if (attempt === maxRetries) {
          return { success: false, error: error.message, attempts: attempt };
        }
      }
    }
    
    return { success: false, error: 'Max retries exceeded' };
  }

  /**
   * Fallback operation (use alternative method)
   */
  async fallbackOperation(context) {
    try {
      if (context.fallbackFunction && typeof context.fallbackFunction === 'function') {
        const result = await context.fallbackFunction();
        return { success: true, result, method: 'fallback' };
      }
      
      // Default fallback: try with minimal options
      if (context.originalFunction && typeof context.originalFunction === 'function') {
        const result = await context.originalFunction({
          ...context.options,
          extractImages: false,
          extractMetadata: false,
          styleMapping: false
        });
        return { success: true, result, method: 'minimal_options' };
      }
      
      return { success: false, error: 'No fallback method available' };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Repair operation (attempt to fix corrupted data)
   */
  async repairOperation(context) {
    try {
      // For DOCX files, we can try to repair by re-zipping
      if (context.filePath && context.filePath.endsWith('.docx')) {
        // This is a placeholder for actual repair logic
        // In a real implementation, you might use tools like zip repair utilities
        return { success: false, error: 'DOCX repair not implemented' };
      }
      
      return { success: false, error: 'No repair method available' };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Alternative operation (use different approach)
   */
  async alternativeOperation(context) {
    try {
      if (context.alternativeFunction && typeof context.alternativeFunction === 'function') {
        const result = await context.alternativeFunction();
        return { success: true, result, method: 'alternative' };
      }
      
      // Try extracting only text without formatting
      if (context.textOnlyFunction && typeof context.textOnlyFunction === 'function') {
        const result = await context.textOnlyFunction();
        return { success: true, result, method: 'text_only' };
      }
      
      return { success: false, error: 'No alternative method available' };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Skip operation (mark as skipped)
   */
  async skipOperation(context) {
    return {
      success: true,
      result: {
        skipped: true,
        reason: 'Operation skipped due to unrecoverable error',
        originalError: context.originalError
      },
      method: 'skip'
    };
  }

  /**
   * Log error
   */
  logError(error) {
    this.errorLog.push({
      timestamp: new Date().toISOString(),
      error: error.toJSON()
    });
    
    // Keep only last 1000 errors
    if (this.errorLog.length > 1000) {
      this.errorLog = this.errorLog.slice(-1000);
    }
  }

  /**
   * Update statistics
   */
  updateStatistics(error) {
    this.statistics.totalErrors++;
    
    // Count by type
    if (!this.statistics.errorsByType[error.type]) {
      this.statistics.errorsByType[error.type] = 0;
    }
    this.statistics.errorsByType[error.type]++;
    
    // Count by severity
    if (!this.statistics.errorsBySeverity[error.severity]) {
      this.statistics.errorsBySeverity[error.severity] = 0;
    }
    this.statistics.errorsBySeverity[error.severity]++;
  }

  /**
   * Get error statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      recoverySuccessRate: this.statistics.recoveryAttempts > 0 
        ? (this.statistics.successfulRecoveries / this.statistics.recoveryAttempts * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10) {
    return this.errorLog.slice(-limit);
  }

  /**
   * Clear error log
   */
  clearErrorLog() {
    this.errorLog = [];
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
  }

  /**
   * Export error log
   */
  async exportErrorLog(filePath) {
    try {
      const logData = {
        exportDate: new Date().toISOString(),
        statistics: this.getStatistics(),
        errors: this.errorLog
      };
      
      await fs.writeFile(filePath, JSON.stringify(logData, null, 2));
      return { success: true, filePath };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Global error handler instance
let globalDOCXErrorHandler = null;

/**
 * Get global DOCX error handler instance
 */
function getDOCXErrorHandler() {
  if (!globalDOCXErrorHandler) {
    globalDOCXErrorHandler = new DOCXErrorHandler();
  }
  return globalDOCXErrorHandler;
}

/**
 * Create DOCX error
 */
function createDOCXError(message, type, severity, details) {
  return new DOCXError(message, type, severity, details);
}

/**
 * Handle DOCX error (convenience function)
 */
async function handleDOCXError(error, context = {}) {
  const errorHandler = getDOCXErrorHandler();
  return await errorHandler.handleError(error, context);
}

module.exports = {
  DOCXErrorTypes,
  DOCXErrorSeverity,
  DOCXRecoveryStrategies,
  DOCXError,
  DOCXErrorHandler,
  getDOCXErrorHandler,
  createDOCXError,
  handleDOCXError
};