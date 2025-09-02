/**
 * DOCX to PDF Error Handler
 * Comprehensive error handling for DOCX to PDF conversion operations
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * DOCX to PDF Error Types
 */
const DOCXToPDFErrorTypes = {
  // Input/Output Errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  INVALID_FILE_FORMAT: 'INVALID_FILE_FORMAT',
  CORRUPTED_DOCX: 'CORRUPTED_DOCX',
  OUTPUT_PATH_INVALID: 'OUTPUT_PATH_INVALID',
  DISK_SPACE_INSUFFICIENT: 'DISK_SPACE_INSUFFICIENT',
  
  // Processing Errors
  DOCX_PARSING_FAILED: 'DOCX_PARSING_FAILED',
  HTML_GENERATION_FAILED: 'HTML_GENERATION_FAILED',
  PDF_GENERATION_FAILED: 'PDF_GENERATION_FAILED',
  METADATA_EXTRACTION_FAILED: 'METADATA_EXTRACTION_FAILED',
  STYLE_PROCESSING_FAILED: 'STYLE_PROCESSING_FAILED',
  
  // Resource Errors
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  TIMEOUT_EXCEEDED: 'TIMEOUT_EXCEEDED',
  FILE_SIZE_LIMIT_EXCEEDED: 'FILE_SIZE_LIMIT_EXCEEDED',
  CONCURRENT_LIMIT_EXCEEDED: 'CONCURRENT_LIMIT_EXCEEDED',
  
  // Library/Dependency Errors
  MAMMOTH_ERROR: 'MAMMOTH_ERROR',
  PDF_LIB_ERROR: 'PDF_LIB_ERROR',
  JSZIP_ERROR: 'JSZIP_ERROR',
  
  // Configuration Errors
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  MISSING_DEPENDENCIES: 'MISSING_DEPENDENCIES',
  UNSUPPORTED_FEATURE: 'UNSUPPORTED_FEATURE',
  
  // Network/External Errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  
  // Unknown Errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Error Severity Levels
 */
const DOCXToPDFErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Recovery Strategies
 */
const DOCXToPDFRecoveryStrategies = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  REPAIR: 'repair',
  ALTERNATIVE: 'alternative',
  SKIP: 'skip',
  ABORT: 'abort'
};

/**
 * DOCX to PDF Error Class
 */
class DOCXToPDFError extends Error {
  constructor(message, type = DOCXToPDFErrorTypes.UNKNOWN_ERROR, severity = DOCXToPDFErrorSeverity.MEDIUM, context = {}) {
    super(message);
    this.name = 'DOCXToPDFError';
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date();
    this.recoverable = this._isRecoverable();
    this.suggestedStrategy = this._getSuggestedStrategy();
  }

  /**
   * Determine if error is recoverable
   */
  _isRecoverable() {
    const recoverableTypes = [
      DOCXToPDFErrorTypes.TIMEOUT_EXCEEDED,
      DOCXToPDFErrorTypes.MEMORY_LIMIT_EXCEEDED,
      DOCXToPDFErrorTypes.NETWORK_ERROR,
      DOCXToPDFErrorTypes.EXTERNAL_SERVICE_ERROR,
      DOCXToPDFErrorTypes.STYLE_PROCESSING_FAILED
    ];
    return recoverableTypes.includes(this.type);
  }

  /**
   * Get suggested recovery strategy
   */
  _getSuggestedStrategy() {
    const strategyMap = {
      [DOCXToPDFErrorTypes.FILE_NOT_FOUND]: DOCXToPDFRecoveryStrategies.ABORT,
      [DOCXToPDFErrorTypes.FILE_ACCESS_DENIED]: DOCXToPDFRecoveryStrategies.RETRY,
      [DOCXToPDFErrorTypes.INVALID_FILE_FORMAT]: DOCXToPDFRecoveryStrategies.ABORT,
      [DOCXToPDFErrorTypes.CORRUPTED_DOCX]: DOCXToPDFRecoveryStrategies.REPAIR,
      [DOCXToPDFErrorTypes.OUTPUT_PATH_INVALID]: DOCXToPDFRecoveryStrategies.ALTERNATIVE,
      [DOCXToPDFErrorTypes.DISK_SPACE_INSUFFICIENT]: DOCXToPDFRecoveryStrategies.ABORT,
      [DOCXToPDFErrorTypes.DOCX_PARSING_FAILED]: DOCXToPDFRecoveryStrategies.FALLBACK,
      [DOCXToPDFErrorTypes.HTML_GENERATION_FAILED]: DOCXToPDFRecoveryStrategies.FALLBACK,
      [DOCXToPDFErrorTypes.PDF_GENERATION_FAILED]: DOCXToPDFRecoveryStrategies.ALTERNATIVE,
      [DOCXToPDFErrorTypes.METADATA_EXTRACTION_FAILED]: DOCXToPDFRecoveryStrategies.SKIP,
      [DOCXToPDFErrorTypes.STYLE_PROCESSING_FAILED]: DOCXToPDFRecoveryStrategies.FALLBACK,
      [DOCXToPDFErrorTypes.MEMORY_LIMIT_EXCEEDED]: DOCXToPDFRecoveryStrategies.RETRY,
      [DOCXToPDFErrorTypes.TIMEOUT_EXCEEDED]: DOCXToPDFRecoveryStrategies.RETRY,
      [DOCXToPDFErrorTypes.FILE_SIZE_LIMIT_EXCEEDED]: DOCXToPDFRecoveryStrategies.ABORT,
      [DOCXToPDFErrorTypes.CONCURRENT_LIMIT_EXCEEDED]: DOCXToPDFRecoveryStrategies.RETRY,
      [DOCXToPDFErrorTypes.MAMMOTH_ERROR]: DOCXToPDFRecoveryStrategies.FALLBACK,
      [DOCXToPDFErrorTypes.PDF_LIB_ERROR]: DOCXToPDFRecoveryStrategies.ALTERNATIVE,
      [DOCXToPDFErrorTypes.JSZIP_ERROR]: DOCXToPDFRecoveryStrategies.REPAIR,
      [DOCXToPDFErrorTypes.INVALID_OPTIONS]: DOCXToPDFRecoveryStrategies.FALLBACK,
      [DOCXToPDFErrorTypes.MISSING_DEPENDENCIES]: DOCXToPDFRecoveryStrategies.ABORT,
      [DOCXToPDFErrorTypes.UNSUPPORTED_FEATURE]: DOCXToPDFRecoveryStrategies.SKIP,
      [DOCXToPDFErrorTypes.NETWORK_ERROR]: DOCXToPDFRecoveryStrategies.RETRY,
      [DOCXToPDFErrorTypes.EXTERNAL_SERVICE_ERROR]: DOCXToPDFRecoveryStrategies.RETRY
    };
    
    return strategyMap[this.type] || DOCXToPDFRecoveryStrategies.ABORT;
  }

  /**
   * Get error details
   */
  getDetails() {
    return {
      message: this.message,
      type: this.type,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      suggestedStrategy: this.suggestedStrategy,
      stack: this.stack
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return this.getDetails();
  }
}

/**
 * DOCX to PDF Error Handler
 */
class DOCXToPDFErrorHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      enableLogging: true,
      logLevel: 'error',
      enableRecovery: true,
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
    
    this.retryAttempts = new Map();
  }

  /**
   * Handle error with recovery attempts
   */
  async handleError(error, context = {}) {
    const docxError = this._classifyError(error, context);
    
    // Update statistics
    this._updateStatistics(docxError);
    
    // Log error
    if (this.options.enableLogging) {
      this._logError(docxError);
    }
    
    // Emit error event
    this.emit('error', docxError);
    
    // Attempt recovery if enabled and error is recoverable
    if (this.options.enableRecovery && docxError.recoverable) {
      const recoveredError = await this._attemptRecovery(docxError, context);
      if (recoveredError) {
        return recoveredError;
      }
    }
    
    return docxError;
  }

  /**
   * Classify error type and severity
   */
  _classifyError(error, context) {
    if (error instanceof DOCXToPDFError) {
      return error;
    }
    
    let type = DOCXToPDFErrorTypes.UNKNOWN_ERROR;
    let severity = DOCXToPDFErrorSeverity.MEDIUM;
    
    const message = error.message.toLowerCase();
    
    // File system errors
    if (message.includes('enoent') || message.includes('file not found')) {
      type = DOCXToPDFErrorTypes.FILE_NOT_FOUND;
      severity = DOCXToPDFErrorSeverity.HIGH;
    } else if (message.includes('eacces') || message.includes('permission denied')) {
      type = DOCXToPDFErrorTypes.FILE_ACCESS_DENIED;
      severity = DOCXToPDFErrorSeverity.HIGH;
    } else if (message.includes('enospc') || message.includes('no space left')) {
      type = DOCXToPDFErrorTypes.DISK_SPACE_INSUFFICIENT;
      severity = DOCXToPDFErrorSeverity.CRITICAL;
    }
    
    // Format errors
    else if (message.includes('invalid docx') || message.includes('not a valid zip')) {
      type = DOCXToPDFErrorTypes.CORRUPTED_DOCX;
      severity = DOCXToPDFErrorSeverity.HIGH;
    } else if (message.includes('invalid file extension')) {
      type = DOCXToPDFErrorTypes.INVALID_FILE_FORMAT;
      severity = DOCXToPDFErrorSeverity.HIGH;
    }
    
    // Processing errors
    else if (message.includes('mammoth') || message.includes('docx parsing')) {
      type = DOCXToPDFErrorTypes.DOCX_PARSING_FAILED;
      severity = DOCXToPDFErrorSeverity.MEDIUM;
    } else if (message.includes('html generation')) {
      type = DOCXToPDFErrorTypes.HTML_GENERATION_FAILED;
      severity = DOCXToPDFErrorSeverity.MEDIUM;
    } else if (message.includes('pdf generation') || message.includes('pdf-lib')) {
      type = DOCXToPDFErrorTypes.PDF_GENERATION_FAILED;
      severity = DOCXToPDFErrorSeverity.HIGH;
    }
    
    // Resource errors
    else if (message.includes('timeout') || message.includes('timed out')) {
      type = DOCXToPDFErrorTypes.TIMEOUT_EXCEEDED;
      severity = DOCXToPDFErrorSeverity.MEDIUM;
    } else if (message.includes('memory') || message.includes('heap')) {
      type = DOCXToPDFErrorTypes.MEMORY_LIMIT_EXCEEDED;
      severity = DOCXToPDFErrorSeverity.HIGH;
    } else if (message.includes('file size') && message.includes('exceeds')) {
      type = DOCXToPDFErrorTypes.FILE_SIZE_LIMIT_EXCEEDED;
      severity = DOCXToPDFErrorSeverity.MEDIUM;
    }
    
    // Library errors
    else if (message.includes('jszip')) {
      type = DOCXToPDFErrorTypes.JSZIP_ERROR;
      severity = DOCXToPDFErrorSeverity.MEDIUM;
    }
    
    // Network errors
    else if (message.includes('network') || message.includes('connection')) {
      type = DOCXToPDFErrorTypes.NETWORK_ERROR;
      severity = DOCXToPDFErrorSeverity.MEDIUM;
    }
    
    return new DOCXToPDFError(error.message, type, severity, {
      ...context,
      originalError: error,
      stack: error.stack
    });
  }

  /**
   * Attempt error recovery
   */
  async _attemptRecovery(error, context) {
    const strategy = error.suggestedStrategy;
    const retryKey = `${context.operation || 'unknown'}_${context.inputPath || 'unknown'}`;
    
    this.statistics.recoveryAttempts++;
    
    try {
      switch (strategy) {
        case DOCXToPDFRecoveryStrategies.RETRY:
          return await this._retryOperation(error, context, retryKey);
          
        case DOCXToPDFRecoveryStrategies.FALLBACK:
          return await this._fallbackOperation(error, context);
          
        case DOCXToPDFRecoveryStrategies.REPAIR:
          return await this._repairOperation(error, context);
          
        case DOCXToPDFRecoveryStrategies.ALTERNATIVE:
          return await this._alternativeOperation(error, context);
          
        case DOCXToPDFRecoveryStrategies.SKIP:
          return await this._skipOperation(error, context);
          
        default:
          return null;
      }
    } catch (recoveryError) {
      this.statistics.failedRecoveries++;
      this.emit('recovery_failed', { originalError: error, recoveryError, strategy });
      return null;
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  async _retryOperation(error, context, retryKey) {
    const attempts = this.retryAttempts.get(retryKey) || 0;
    
    if (attempts >= this.options.maxRetries) {
      this.retryAttempts.delete(retryKey);
      return null;
    }
    
    this.retryAttempts.set(retryKey, attempts + 1);
    
    // Exponential backoff
    const delay = this.options.retryDelay * Math.pow(2, attempts);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    this.emit('retry_attempt', { error, attempt: attempts + 1, delay });
    
    // Create a modified error indicating retry
    const retryError = new DOCXToPDFError(
      `Retry attempt ${attempts + 1}/${this.options.maxRetries}: ${error.message}`,
      error.type,
      DOCXToPDFErrorSeverity.LOW,
      { ...error.context, retryAttempt: attempts + 1 }
    );
    
    this.statistics.successfulRecoveries++;
    return retryError;
  }

  /**
   * Fallback operation with simplified options
   */
  async _fallbackOperation(error, context) {
    const fallbackError = new DOCXToPDFError(
      `Fallback mode: ${error.message}`,
      error.type,
      DOCXToPDFErrorSeverity.LOW,
      {
        ...error.context,
        fallbackMode: true,
        simplifiedOptions: {
          preserveFormatting: false,
          includeDefaultStyleMap: false,
          embedFonts: false,
          compressPDF: false
        }
      }
    );
    
    this.emit('fallback_mode', { originalError: error, fallbackError });
    this.statistics.successfulRecoveries++;
    return fallbackError;
  }

  /**
   * Repair operation for corrupted files
   */
  async _repairOperation(error, context) {
    if (context.inputPath && error.type === DOCXToPDFErrorTypes.CORRUPTED_DOCX) {
      const repairError = new DOCXToPDFError(
        `Attempting repair: ${error.message}`,
        error.type,
        DOCXToPDFErrorSeverity.LOW,
        {
          ...error.context,
          repairAttempt: true,
          repairOptions: {
            ignoreCorruption: true,
            skipInvalidElements: true,
            useBasicParsing: true
          }
        }
      );
      
      this.emit('repair_attempt', { originalError: error, repairError });
      this.statistics.successfulRecoveries++;
      return repairError;
    }
    
    return null;
  }

  /**
   * Alternative operation with different approach
   */
  async _alternativeOperation(error, context) {
    const alternativeError = new DOCXToPDFError(
      `Alternative approach: ${error.message}`,
      error.type,
      DOCXToPDFErrorSeverity.LOW,
      {
        ...error.context,
        alternativeApproach: true,
        alternativeOptions: {
          useSimplePDFGeneration: true,
          skipComplexFormatting: true,
          textOnlyMode: true
        }
      }
    );
    
    this.emit('alternative_approach', { originalError: error, alternativeError });
    this.statistics.successfulRecoveries++;
    return alternativeError;
  }

  /**
   * Skip operation for non-critical errors
   */
  async _skipOperation(error, context) {
    const skipError = new DOCXToPDFError(
      `Skipping non-critical error: ${error.message}`,
      error.type,
      DOCXToPDFErrorSeverity.LOW,
      {
        ...error.context,
        skipped: true,
        skipReason: 'Non-critical error'
      }
    );
    
    this.emit('error_skipped', { originalError: error, skipError });
    this.statistics.successfulRecoveries++;
    return skipError;
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
    const logData = {
      timestamp: error.timestamp,
      type: error.type,
      severity: error.severity,
      message: error.message,
      context: error.context
    };
    
    switch (error.severity) {
      case DOCXToPDFErrorSeverity.CRITICAL:
        console.error('[CRITICAL] DOCX to PDF Error:', logData);
        break;
      case DOCXToPDFErrorSeverity.HIGH:
        console.error('[HIGH] DOCX to PDF Error:', logData);
        break;
      case DOCXToPDFErrorSeverity.MEDIUM:
        console.warn('[MEDIUM] DOCX to PDF Error:', logData);
        break;
      case DOCXToPDFErrorSeverity.LOW:
        console.log('[LOW] DOCX to PDF Error:', logData);
        break;
    }
  }

  /**
   * Get error statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      recoverySuccessRate: this.statistics.recoveryAttempts > 0 ?
        (this.statistics.successfulRecoveries / this.statistics.recoveryAttempts * 100).toFixed(2) + '%' : '0%'
    };
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
    this.retryAttempts.clear();
  }

  /**
   * Clear retry attempts
   */
  clearRetryAttempts() {
    this.retryAttempts.clear();
  }
}

// Global error handler instance
let globalDOCXToPDFErrorHandler = null;

/**
 * Get global DOCX to PDF error handler instance
 */
function getDOCXToPDFErrorHandler(options = {}) {
  if (!globalDOCXToPDFErrorHandler) {
    globalDOCXToPDFErrorHandler = new DOCXToPDFErrorHandler(options);
  }
  return globalDOCXToPDFErrorHandler;
}

/**
 * Create DOCX to PDF error
 */
function createDOCXToPDFError(message, type, severity, context) {
  return new DOCXToPDFError(message, type, severity, context);
}

/**
 * Handle DOCX to PDF error
 */
async function handleDOCXToPDFError(error, context = {}) {
  const errorHandler = getDOCXToPDFErrorHandler();
  return await errorHandler.handleError(error, context);
}

module.exports = {
  DOCXToPDFError,
  DOCXToPDFErrorHandler,
  DOCXToPDFErrorTypes,
  DOCXToPDFErrorSeverity,
  DOCXToPDFRecoveryStrategies,
  getDOCXToPDFErrorHandler,
  createDOCXToPDFError,
  handleDOCXToPDFError
};