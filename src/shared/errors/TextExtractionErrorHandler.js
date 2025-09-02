/**
 * Text Extraction Error Handler
 * Comprehensive error handling for text extraction operations
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Text extraction error types
 */
const TextExtractionErrorTypes = {
  // Input validation errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_NOT_READABLE: 'FILE_NOT_READABLE',
  INVALID_FILE_FORMAT: 'INVALID_FILE_FORMAT',
  EMPTY_FILE: 'EMPTY_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  
  // PDF-specific errors
  PDF_PARSE_ERROR: 'PDF_PARSE_ERROR',
  PDF_ENCRYPTED: 'PDF_ENCRYPTED',
  PDF_CORRUPTED: 'PDF_CORRUPTED',
  PDF_NO_TEXT: 'PDF_NO_TEXT',
  PDF_WORKER_ERROR: 'PDF_WORKER_ERROR',
  
  // DOCX-specific errors
  DOCX_PARSE_ERROR: 'DOCX_PARSE_ERROR',
  DOCX_CORRUPTED: 'DOCX_CORRUPTED',
  DOCX_NO_TEXT: 'DOCX_NO_TEXT',
  DOCX_UNSUPPORTED_VERSION: 'DOCX_UNSUPPORTED_VERSION',
  
  // HTML conversion errors
  HTML_PARSE_ERROR: 'HTML_PARSE_ERROR',
  HTML_CONVERSION_ERROR: 'HTML_CONVERSION_ERROR',
  
  // Processing errors
  TEXT_PROCESSING_ERROR: 'TEXT_PROCESSING_ERROR',
  ENCODING_ERROR: 'ENCODING_ERROR',
  OUTPUT_WRITE_ERROR: 'OUTPUT_WRITE_ERROR',
  
  // System errors
  MEMORY_ERROR: 'MEMORY_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  
  // Service errors
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  
  // Unknown errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Error severity levels
 */
const TextExtractionErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Recovery strategies
 */
const TextExtractionRecoveryStrategies = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  REPAIR: 'repair',
  ALTERNATIVE: 'alternative',
  SKIP: 'skip',
  ABORT: 'abort'
};

/**
 * Text extraction error class
 */
class TextExtractionError extends Error {
  constructor(type, message, originalError = null, context = {}) {
    super(message);
    this.name = 'TextExtractionError';
    this.type = type;
    this.originalError = originalError;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.severity = this._determineSeverity(type);
    this.recoveryStrategy = this._determineRecoveryStrategy(type);
    this.retryable = this._isRetryable(type);
    this.userFriendlyMessage = this._generateUserFriendlyMessage(type, message);
  }

  _determineSeverity(type) {
    const severityMap = {
      [TextExtractionErrorTypes.FILE_NOT_FOUND]: TextExtractionErrorSeverity.HIGH,
      [TextExtractionErrorTypes.FILE_NOT_READABLE]: TextExtractionErrorSeverity.HIGH,
      [TextExtractionErrorTypes.INVALID_FILE_FORMAT]: TextExtractionErrorSeverity.HIGH,
      [TextExtractionErrorTypes.EMPTY_FILE]: TextExtractionErrorSeverity.MEDIUM,
      [TextExtractionErrorTypes.FILE_TOO_LARGE]: TextExtractionErrorSeverity.MEDIUM,
      
      [TextExtractionErrorTypes.PDF_PARSE_ERROR]: TextExtractionErrorSeverity.HIGH,
      [TextExtractionErrorTypes.PDF_ENCRYPTED]: TextExtractionErrorSeverity.HIGH,
      [TextExtractionErrorTypes.PDF_CORRUPTED]: TextExtractionErrorSeverity.HIGH,
      [TextExtractionErrorTypes.PDF_NO_TEXT]: TextExtractionErrorSeverity.MEDIUM,
      [TextExtractionErrorTypes.PDF_WORKER_ERROR]: TextExtractionErrorSeverity.MEDIUM,
      
      [TextExtractionErrorTypes.DOCX_PARSE_ERROR]: TextExtractionErrorSeverity.HIGH,
      [TextExtractionErrorTypes.DOCX_CORRUPTED]: TextExtractionErrorSeverity.HIGH,
      [TextExtractionErrorTypes.DOCX_NO_TEXT]: TextExtractionErrorSeverity.MEDIUM,
      [TextExtractionErrorTypes.DOCX_UNSUPPORTED_VERSION]: TextExtractionErrorSeverity.MEDIUM,
      
      [TextExtractionErrorTypes.HTML_PARSE_ERROR]: TextExtractionErrorSeverity.MEDIUM,
      [TextExtractionErrorTypes.HTML_CONVERSION_ERROR]: TextExtractionErrorSeverity.MEDIUM,
      
      [TextExtractionErrorTypes.TEXT_PROCESSING_ERROR]: TextExtractionErrorSeverity.MEDIUM,
      [TextExtractionErrorTypes.ENCODING_ERROR]: TextExtractionErrorSeverity.MEDIUM,
      [TextExtractionErrorTypes.OUTPUT_WRITE_ERROR]: TextExtractionErrorSeverity.HIGH,
      
      [TextExtractionErrorTypes.MEMORY_ERROR]: TextExtractionErrorSeverity.CRITICAL,
      [TextExtractionErrorTypes.TIMEOUT_ERROR]: TextExtractionErrorSeverity.MEDIUM,
      [TextExtractionErrorTypes.NETWORK_ERROR]: TextExtractionErrorSeverity.MEDIUM,
      [TextExtractionErrorTypes.PERMISSION_ERROR]: TextExtractionErrorSeverity.HIGH,
      
      [TextExtractionErrorTypes.SERVICE_UNAVAILABLE]: TextExtractionErrorSeverity.CRITICAL,
      [TextExtractionErrorTypes.DEPENDENCY_ERROR]: TextExtractionErrorSeverity.CRITICAL,
      [TextExtractionErrorTypes.CONFIGURATION_ERROR]: TextExtractionErrorSeverity.HIGH,
      
      [TextExtractionErrorTypes.UNKNOWN_ERROR]: TextExtractionErrorSeverity.MEDIUM
    };
    
    return severityMap[type] || TextExtractionErrorSeverity.MEDIUM;
  }

  _determineRecoveryStrategy(type) {
    const strategyMap = {
      [TextExtractionErrorTypes.FILE_NOT_FOUND]: TextExtractionRecoveryStrategies.ABORT,
      [TextExtractionErrorTypes.FILE_NOT_READABLE]: TextExtractionRecoveryStrategies.REPAIR,
      [TextExtractionErrorTypes.INVALID_FILE_FORMAT]: TextExtractionRecoveryStrategies.ABORT,
      [TextExtractionErrorTypes.EMPTY_FILE]: TextExtractionRecoveryStrategies.SKIP,
      [TextExtractionErrorTypes.FILE_TOO_LARGE]: TextExtractionRecoveryStrategies.ALTERNATIVE,
      
      [TextExtractionErrorTypes.PDF_PARSE_ERROR]: TextExtractionRecoveryStrategies.FALLBACK,
      [TextExtractionErrorTypes.PDF_ENCRYPTED]: TextExtractionRecoveryStrategies.ALTERNATIVE,
      [TextExtractionErrorTypes.PDF_CORRUPTED]: TextExtractionRecoveryStrategies.REPAIR,
      [TextExtractionErrorTypes.PDF_NO_TEXT]: TextExtractionRecoveryStrategies.ALTERNATIVE,
      [TextExtractionErrorTypes.PDF_WORKER_ERROR]: TextExtractionRecoveryStrategies.RETRY,
      
      [TextExtractionErrorTypes.DOCX_PARSE_ERROR]: TextExtractionRecoveryStrategies.FALLBACK,
      [TextExtractionErrorTypes.DOCX_CORRUPTED]: TextExtractionRecoveryStrategies.REPAIR,
      [TextExtractionErrorTypes.DOCX_NO_TEXT]: TextExtractionRecoveryStrategies.SKIP,
      [TextExtractionErrorTypes.DOCX_UNSUPPORTED_VERSION]: TextExtractionRecoveryStrategies.ALTERNATIVE,
      
      [TextExtractionErrorTypes.HTML_PARSE_ERROR]: TextExtractionRecoveryStrategies.FALLBACK,
      [TextExtractionErrorTypes.HTML_CONVERSION_ERROR]: TextExtractionRecoveryStrategies.FALLBACK,
      
      [TextExtractionErrorTypes.TEXT_PROCESSING_ERROR]: TextExtractionRecoveryStrategies.FALLBACK,
      [TextExtractionErrorTypes.ENCODING_ERROR]: TextExtractionRecoveryStrategies.ALTERNATIVE,
      [TextExtractionErrorTypes.OUTPUT_WRITE_ERROR]: TextExtractionRecoveryStrategies.RETRY,
      
      [TextExtractionErrorTypes.MEMORY_ERROR]: TextExtractionRecoveryStrategies.ALTERNATIVE,
      [TextExtractionErrorTypes.TIMEOUT_ERROR]: TextExtractionRecoveryStrategies.RETRY,
      [TextExtractionErrorTypes.NETWORK_ERROR]: TextExtractionRecoveryStrategies.RETRY,
      [TextExtractionErrorTypes.PERMISSION_ERROR]: TextExtractionRecoveryStrategies.ABORT,
      
      [TextExtractionErrorTypes.SERVICE_UNAVAILABLE]: TextExtractionRecoveryStrategies.RETRY,
      [TextExtractionErrorTypes.DEPENDENCY_ERROR]: TextExtractionRecoveryStrategies.ABORT,
      [TextExtractionErrorTypes.CONFIGURATION_ERROR]: TextExtractionRecoveryStrategies.ABORT,
      
      [TextExtractionErrorTypes.UNKNOWN_ERROR]: TextExtractionRecoveryStrategies.RETRY
    };
    
    return strategyMap[type] || TextExtractionRecoveryStrategies.RETRY;
  }

  _isRetryable(type) {
    const retryableTypes = [
      TextExtractionErrorTypes.PDF_WORKER_ERROR,
      TextExtractionErrorTypes.OUTPUT_WRITE_ERROR,
      TextExtractionErrorTypes.TIMEOUT_ERROR,
      TextExtractionErrorTypes.NETWORK_ERROR,
      TextExtractionErrorTypes.SERVICE_UNAVAILABLE,
      TextExtractionErrorTypes.UNKNOWN_ERROR
    ];
    
    return retryableTypes.includes(type);
  }

  _generateUserFriendlyMessage(type, message) {
    const friendlyMessages = {
      [TextExtractionErrorTypes.FILE_NOT_FOUND]: 'The specified file could not be found. Please check the file path.',
      [TextExtractionErrorTypes.FILE_NOT_READABLE]: 'The file cannot be read. Please check file permissions.',
      [TextExtractionErrorTypes.INVALID_FILE_FORMAT]: 'The file format is not supported for text extraction.',
      [TextExtractionErrorTypes.EMPTY_FILE]: 'The file is empty and contains no text to extract.',
      [TextExtractionErrorTypes.FILE_TOO_LARGE]: 'The file is too large to process. Please try a smaller file.',
      
      [TextExtractionErrorTypes.PDF_PARSE_ERROR]: 'Failed to parse the PDF file. The file may be corrupted.',
      [TextExtractionErrorTypes.PDF_ENCRYPTED]: 'The PDF file is password-protected and cannot be processed.',
      [TextExtractionErrorTypes.PDF_CORRUPTED]: 'The PDF file appears to be corrupted.',
      [TextExtractionErrorTypes.PDF_NO_TEXT]: 'No text content was found in the PDF file.',
      [TextExtractionErrorTypes.PDF_WORKER_ERROR]: 'PDF processing service encountered an error. Please try again.',
      
      [TextExtractionErrorTypes.DOCX_PARSE_ERROR]: 'Failed to parse the DOCX file. The file may be corrupted.',
      [TextExtractionErrorTypes.DOCX_CORRUPTED]: 'The DOCX file appears to be corrupted.',
      [TextExtractionErrorTypes.DOCX_NO_TEXT]: 'No text content was found in the DOCX file.',
      [TextExtractionErrorTypes.DOCX_UNSUPPORTED_VERSION]: 'The DOCX file version is not supported.',
      
      [TextExtractionErrorTypes.HTML_PARSE_ERROR]: 'Failed to parse the HTML content.',
      [TextExtractionErrorTypes.HTML_CONVERSION_ERROR]: 'Failed to convert HTML to text.',
      
      [TextExtractionErrorTypes.TEXT_PROCESSING_ERROR]: 'An error occurred while processing the extracted text.',
      [TextExtractionErrorTypes.ENCODING_ERROR]: 'Text encoding error. The file may contain unsupported characters.',
      [TextExtractionErrorTypes.OUTPUT_WRITE_ERROR]: 'Failed to write the extracted text to the output file.',
      
      [TextExtractionErrorTypes.MEMORY_ERROR]: 'Insufficient memory to process the file.',
      [TextExtractionErrorTypes.TIMEOUT_ERROR]: 'The operation timed out. Please try again.',
      [TextExtractionErrorTypes.NETWORK_ERROR]: 'Network error occurred during processing.',
      [TextExtractionErrorTypes.PERMISSION_ERROR]: 'Permission denied. Please check file access rights.',
      
      [TextExtractionErrorTypes.SERVICE_UNAVAILABLE]: 'Text extraction service is temporarily unavailable.',
      [TextExtractionErrorTypes.DEPENDENCY_ERROR]: 'Required dependencies are missing or corrupted.',
      [TextExtractionErrorTypes.CONFIGURATION_ERROR]: 'Service configuration error.',
      
      [TextExtractionErrorTypes.UNKNOWN_ERROR]: 'An unexpected error occurred during text extraction.'
    };
    
    return friendlyMessages[type] || message;
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      userFriendlyMessage: this.userFriendlyMessage,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      retryable: this.retryable,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Text extraction error handler class
 */
class TextExtractionErrorHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      enableLogging: true,
      logLevel: 'error',
      enableRecovery: true,
      enableFallback: true,
      ...options
    };
    
    this.statistics = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      recoveryAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0
    };
    
    this.errorLog = [];
  }

  /**
   * Handle an error with automatic classification and recovery
   */
  async handleError(error, context = {}) {
    const textExtractionError = this._classifyError(error, context);
    
    // Update statistics
    this._updateStatistics(textExtractionError);
    
    // Log error
    if (this.options.enableLogging) {
      this._logError(textExtractionError);
    }
    
    // Emit error event
    this.emit('error', textExtractionError);
    
    // Attempt recovery if enabled
    if (this.options.enableRecovery) {
      const recoveryResult = await this._attemptRecovery(textExtractionError, context);
      
      if (recoveryResult.success) {
        this.emit('recovery_success', {
          error: textExtractionError,
          strategy: recoveryResult.strategy,
          result: recoveryResult.result
        });
        
        return recoveryResult;
      } else {
        this.emit('recovery_failed', {
          error: textExtractionError,
          strategy: recoveryResult.strategy,
          reason: recoveryResult.reason
        });
      }
    }
    
    return {
      success: false,
      error: textExtractionError,
      strategy: textExtractionError.recoveryStrategy
    };
  }

  /**
   * Classify error and create TextExtractionError instance
   */
  _classifyError(error, context = {}) {
    if (error instanceof TextExtractionError) {
      return error;
    }
    
    let errorType = TextExtractionErrorTypes.UNKNOWN_ERROR;
    let message = error.message || 'Unknown error occurred';
    
    // Classify based on error message and context
    if (error.code === 'ENOENT' || message.includes('no such file')) {
      errorType = TextExtractionErrorTypes.FILE_NOT_FOUND;
    } else if (error.code === 'EACCES' || message.includes('permission denied')) {
      errorType = TextExtractionErrorTypes.PERMISSION_ERROR;
    } else if (message.includes('PDF') && message.includes('encrypted')) {
      errorType = TextExtractionErrorTypes.PDF_ENCRYPTED;
    } else if (message.includes('PDF') && message.includes('corrupted')) {
      errorType = TextExtractionErrorTypes.PDF_CORRUPTED;
    } else if (message.includes('PDF')) {
      errorType = TextExtractionErrorTypes.PDF_PARSE_ERROR;
    } else if (message.includes('DOCX') || message.includes('mammoth')) {
      errorType = TextExtractionErrorTypes.DOCX_PARSE_ERROR;
    } else if (message.includes('HTML') || message.includes('turndown')) {
      errorType = TextExtractionErrorTypes.HTML_CONVERSION_ERROR;
    } else if (message.includes('timeout')) {
      errorType = TextExtractionErrorTypes.TIMEOUT_ERROR;
    } else if (message.includes('memory') || message.includes('heap')) {
      errorType = TextExtractionErrorTypes.MEMORY_ERROR;
    } else if (message.includes('encoding')) {
      errorType = TextExtractionErrorTypes.ENCODING_ERROR;
    } else if (message.includes('write') || message.includes('output')) {
      errorType = TextExtractionErrorTypes.OUTPUT_WRITE_ERROR;
    }
    
    return new TextExtractionError(errorType, message, error, context);
  }

  /**
   * Attempt error recovery based on strategy
   */
  async _attemptRecovery(error, context = {}) {
    this.statistics.recoveryAttempts++;
    
    try {
      switch (error.recoveryStrategy) {
        case TextExtractionRecoveryStrategies.RETRY:
          return await this._retryOperation(error, context);
          
        case TextExtractionRecoveryStrategies.FALLBACK:
          return await this._fallbackOperation(error, context);
          
        case TextExtractionRecoveryStrategies.REPAIR:
          return await this._repairOperation(error, context);
          
        case TextExtractionRecoveryStrategies.ALTERNATIVE:
          return await this._alternativeOperation(error, context);
          
        case TextExtractionRecoveryStrategies.SKIP:
          return this._skipOperation(error, context);
          
        case TextExtractionRecoveryStrategies.ABORT:
        default:
          return {
            success: false,
            strategy: error.recoveryStrategy,
            reason: 'Recovery strategy is abort or not implemented'
          };
      }
    } catch (recoveryError) {
      this.statistics.failedRecoveries++;
      
      return {
        success: false,
        strategy: error.recoveryStrategy,
        reason: `Recovery failed: ${recoveryError.message}`
      };
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  async _retryOperation(error, context = {}) {
    const maxRetries = context.maxRetries || this.options.maxRetries;
    const retryCount = context.retryCount || 0;
    
    if (retryCount >= maxRetries) {
      return {
        success: false,
        strategy: TextExtractionRecoveryStrategies.RETRY,
        reason: 'Maximum retry attempts exceeded'
      };
    }
    
    // Wait before retry with exponential backoff
    const delay = this.options.retryDelay * Math.pow(2, retryCount);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry the original operation if provided
    if (context.retryFunction) {
      try {
        const result = await context.retryFunction();
        this.statistics.successfulRecoveries++;
        
        return {
          success: true,
          strategy: TextExtractionRecoveryStrategies.RETRY,
          result
        };
      } catch (retryError) {
        // Recursively retry
        return await this._retryOperation(error, {
          ...context,
          retryCount: retryCount + 1
        });
      }
    }
    
    return {
      success: false,
      strategy: TextExtractionRecoveryStrategies.RETRY,
      reason: 'No retry function provided'
    };
  }

  /**
   * Fallback to alternative method
   */
  async _fallbackOperation(error, context = {}) {
    if (context.fallbackFunction) {
      try {
        const result = await context.fallbackFunction();
        this.statistics.successfulRecoveries++;
        
        return {
          success: true,
          strategy: TextExtractionRecoveryStrategies.FALLBACK,
          result
        };
      } catch (fallbackError) {
        return {
          success: false,
          strategy: TextExtractionRecoveryStrategies.FALLBACK,
          reason: `Fallback failed: ${fallbackError.message}`
        };
      }
    }
    
    return {
      success: false,
      strategy: TextExtractionRecoveryStrategies.FALLBACK,
      reason: 'No fallback function provided'
    };
  }

  /**
   * Attempt to repair the input
   */
  async _repairOperation(error, context = {}) {
    // Basic repair strategies
    if (error.type === TextExtractionErrorTypes.FILE_NOT_READABLE) {
      // Try to change file permissions (if possible)
      if (context.inputPath) {
        try {
          await fs.chmod(context.inputPath, 0o644);
          this.statistics.successfulRecoveries++;
          
          return {
            success: true,
            strategy: TextExtractionRecoveryStrategies.REPAIR,
            result: 'File permissions repaired'
          };
        } catch (chmodError) {
          return {
            success: false,
            strategy: TextExtractionRecoveryStrategies.REPAIR,
            reason: `Permission repair failed: ${chmodError.message}`
          };
        }
      }
    }
    
    return {
      success: false,
      strategy: TextExtractionRecoveryStrategies.REPAIR,
      reason: 'No repair strategy available for this error type'
    };
  }

  /**
   * Use alternative approach
   */
  async _alternativeOperation(error, context = {}) {
    if (context.alternativeFunction) {
      try {
        const result = await context.alternativeFunction();
        this.statistics.successfulRecoveries++;
        
        return {
          success: true,
          strategy: TextExtractionRecoveryStrategies.ALTERNATIVE,
          result
        };
      } catch (alternativeError) {
        return {
          success: false,
          strategy: TextExtractionRecoveryStrategies.ALTERNATIVE,
          reason: `Alternative approach failed: ${alternativeError.message}`
        };
      }
    }
    
    return {
      success: false,
      strategy: TextExtractionRecoveryStrategies.ALTERNATIVE,
      reason: 'No alternative function provided'
    };
  }

  /**
   * Skip the operation
   */
  _skipOperation(error, context = {}) {
    this.statistics.successfulRecoveries++;
    
    return {
      success: true,
      strategy: TextExtractionRecoveryStrategies.SKIP,
      result: 'Operation skipped due to error'
    };
  }

  /**
   * Update error statistics
   */
  _updateStatistics(error) {
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
   * Log error
   */
  _logError(error) {
    const logEntry = {
      timestamp: error.timestamp,
      type: error.type,
      severity: error.severity,
      message: error.message,
      context: error.context
    };
    
    this.errorLog.push(logEntry);
    
    // Keep only last 1000 entries
    if (this.errorLog.length > 1000) {
      this.errorLog = this.errorLog.slice(-1000);
    }
    
    // Console logging based on severity
    if (this.options.logLevel === 'error' || error.severity === TextExtractionErrorSeverity.CRITICAL) {
      console.error(`[TextExtraction] ${error.severity.toUpperCase()}: ${error.userFriendlyMessage}`);
    }
  }

  /**
   * Get error statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      recoverySuccessRate: this.statistics.recoveryAttempts > 0 
        ? this.statistics.successfulRecoveries / this.statistics.recoveryAttempts 
        : 0
    };
  }

  /**
   * Get error log
   */
  getErrorLog(limit = 100) {
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
      successfulRecoveries: 0,
      failedRecoveries: 0
    };
  }
}

// Global error handler instance
let globalTextExtractionErrorHandler = null;

/**
 * Get global text extraction error handler instance
 */
function getTextExtractionErrorHandler(options = {}) {
  if (!globalTextExtractionErrorHandler) {
    globalTextExtractionErrorHandler = new TextExtractionErrorHandler(options);
  }
  return globalTextExtractionErrorHandler;
}

/**
 * Create a text extraction error
 */
function createTextExtractionError(type, message, originalError = null, context = {}) {
  return new TextExtractionError(type, message, originalError, context);
}

/**
 * Handle a text extraction error
 */
async function handleTextExtractionError(error, context = {}) {
  const errorHandler = getTextExtractionErrorHandler();
  return await errorHandler.handleError(error, context);
}

module.exports = {
  TextExtractionError,
  TextExtractionErrorHandler,
  TextExtractionErrorTypes,
  TextExtractionErrorSeverity,
  TextExtractionRecoveryStrategies,
  getTextExtractionErrorHandler,
  createTextExtractionError,
  handleTextExtractionError
};