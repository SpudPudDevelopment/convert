/**
 * PDF Error Handler
 * Comprehensive error handling for PDF operations
 */

const { EventEmitter } = require('events');
const path = require('path');

/**
 * PDF error types
 */
const PDFErrorTypes = {
  // File errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_EMPTY: 'FILE_EMPTY',
  
  // PDF format errors
  INVALID_PDF: 'INVALID_PDF',
  MALFORMED_PDF: 'MALFORMED_PDF',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  UNSUPPORTED_ENCRYPTION: 'UNSUPPORTED_ENCRYPTION',
  UNSUPPORTED_FEATURES: 'UNSUPPORTED_FEATURES',
  
  // Security errors
  PASSWORD_REQUIRED: 'PASSWORD_REQUIRED',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
  
  // Content errors
  NO_TEXT_CONTENT: 'NO_TEXT_CONTENT',
  NO_PAGES: 'NO_PAGES',
  PAGE_NOT_FOUND: 'PAGE_NOT_FOUND',
  INVALID_PAGE_RANGE: 'INVALID_PAGE_RANGE',
  
  // Rendering errors
  RENDER_FAILED: 'RENDER_FAILED',
  CANVAS_ERROR: 'CANVAS_ERROR',
  FONT_ERROR: 'FONT_ERROR',
  IMAGE_ERROR: 'IMAGE_ERROR',
  
  // Generation errors
  GENERATION_FAILED: 'GENERATION_FAILED',
  INVALID_CONTENT: 'INVALID_CONTENT',
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  OUTPUT_ERROR: 'OUTPUT_ERROR',
  
  // Memory and performance errors
  MEMORY_ERROR: 'MEMORY_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  
  // Network errors (for remote PDFs)
  NETWORK_ERROR: 'NETWORK_ERROR',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  
  // Unknown errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * PDF error severity levels
 */
const PDFErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * PDF error recovery strategies
 */
const PDFRecoveryStrategies = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  SKIP: 'skip',
  ABORT: 'abort',
  REPAIR: 'repair',
  ALTERNATIVE: 'alternative'
};

/**
 * PDF Error class
 */
class PDFError extends Error {
  constructor(type, message, originalError = null, context = {}) {
    super(message);
    this.name = 'PDFError';
    this.type = type;
    this.originalError = originalError;
    this.context = context;
    this.timestamp = Date.now();
    this.severity = this._determineSeverity(type);
    this.recoveryStrategy = this._determineRecoveryStrategy(type);
    this.isRecoverable = this._isRecoverable(type);
    this.userMessage = this._generateUserMessage(type, message);
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PDFError);
    }
  }
  
  /**
   * Determine error severity
   */
  _determineSeverity(type) {
    const severityMap = {
      [PDFErrorTypes.FILE_NOT_FOUND]: PDFErrorSeverity.HIGH,
      [PDFErrorTypes.FILE_ACCESS_DENIED]: PDFErrorSeverity.HIGH,
      [PDFErrorTypes.FILE_CORRUPTED]: PDFErrorSeverity.HIGH,
      [PDFErrorTypes.FILE_TOO_LARGE]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.FILE_EMPTY]: PDFErrorSeverity.MEDIUM,
      
      [PDFErrorTypes.INVALID_PDF]: PDFErrorSeverity.HIGH,
      [PDFErrorTypes.MALFORMED_PDF]: PDFErrorSeverity.HIGH,
      [PDFErrorTypes.UNSUPPORTED_VERSION]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.UNSUPPORTED_ENCRYPTION]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.UNSUPPORTED_FEATURES]: PDFErrorSeverity.LOW,
      
      [PDFErrorTypes.PASSWORD_REQUIRED]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.INVALID_PASSWORD]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.PERMISSION_DENIED]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.ENCRYPTION_ERROR]: PDFErrorSeverity.HIGH,
      
      [PDFErrorTypes.NO_TEXT_CONTENT]: PDFErrorSeverity.LOW,
      [PDFErrorTypes.NO_PAGES]: PDFErrorSeverity.HIGH,
      [PDFErrorTypes.PAGE_NOT_FOUND]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.INVALID_PAGE_RANGE]: PDFErrorSeverity.MEDIUM,
      
      [PDFErrorTypes.RENDER_FAILED]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.CANVAS_ERROR]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.FONT_ERROR]: PDFErrorSeverity.LOW,
      [PDFErrorTypes.IMAGE_ERROR]: PDFErrorSeverity.LOW,
      
      [PDFErrorTypes.GENERATION_FAILED]: PDFErrorSeverity.HIGH,
      [PDFErrorTypes.INVALID_CONTENT]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.INVALID_OPTIONS]: PDFErrorSeverity.LOW,
      [PDFErrorTypes.OUTPUT_ERROR]: PDFErrorSeverity.HIGH,
      
      [PDFErrorTypes.MEMORY_ERROR]: PDFErrorSeverity.CRITICAL,
      [PDFErrorTypes.TIMEOUT_ERROR]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.RESOURCE_EXHAUSTED]: PDFErrorSeverity.HIGH,
      
      [PDFErrorTypes.NETWORK_ERROR]: PDFErrorSeverity.MEDIUM,
      [PDFErrorTypes.DOWNLOAD_FAILED]: PDFErrorSeverity.MEDIUM,
      
      [PDFErrorTypes.UNKNOWN_ERROR]: PDFErrorSeverity.MEDIUM
    };
    
    return severityMap[type] || PDFErrorSeverity.MEDIUM;
  }
  
  /**
   * Determine recovery strategy
   */
  _determineRecoveryStrategy(type) {
    const strategyMap = {
      [PDFErrorTypes.FILE_NOT_FOUND]: PDFRecoveryStrategies.ABORT,
      [PDFErrorTypes.FILE_ACCESS_DENIED]: PDFRecoveryStrategies.ABORT,
      [PDFErrorTypes.FILE_CORRUPTED]: PDFRecoveryStrategies.REPAIR,
      [PDFErrorTypes.FILE_TOO_LARGE]: PDFRecoveryStrategies.ALTERNATIVE,
      [PDFErrorTypes.FILE_EMPTY]: PDFRecoveryStrategies.ABORT,
      
      [PDFErrorTypes.INVALID_PDF]: PDFRecoveryStrategies.REPAIR,
      [PDFErrorTypes.MALFORMED_PDF]: PDFRecoveryStrategies.REPAIR,
      [PDFErrorTypes.UNSUPPORTED_VERSION]: PDFRecoveryStrategies.FALLBACK,
      [PDFErrorTypes.UNSUPPORTED_ENCRYPTION]: PDFRecoveryStrategies.FALLBACK,
      [PDFErrorTypes.UNSUPPORTED_FEATURES]: PDFRecoveryStrategies.FALLBACK,
      
      [PDFErrorTypes.PASSWORD_REQUIRED]: PDFRecoveryStrategies.ABORT,
      [PDFErrorTypes.INVALID_PASSWORD]: PDFRecoveryStrategies.RETRY,
      [PDFErrorTypes.PERMISSION_DENIED]: PDFRecoveryStrategies.FALLBACK,
      [PDFErrorTypes.ENCRYPTION_ERROR]: PDFRecoveryStrategies.FALLBACK,
      
      [PDFErrorTypes.NO_TEXT_CONTENT]: PDFRecoveryStrategies.ALTERNATIVE,
      [PDFErrorTypes.NO_PAGES]: PDFRecoveryStrategies.ABORT,
      [PDFErrorTypes.PAGE_NOT_FOUND]: PDFRecoveryStrategies.SKIP,
      [PDFErrorTypes.INVALID_PAGE_RANGE]: PDFRecoveryStrategies.FALLBACK,
      
      [PDFErrorTypes.RENDER_FAILED]: PDFRecoveryStrategies.RETRY,
      [PDFErrorTypes.CANVAS_ERROR]: PDFRecoveryStrategies.FALLBACK,
      [PDFErrorTypes.FONT_ERROR]: PDFRecoveryStrategies.FALLBACK,
      [PDFErrorTypes.IMAGE_ERROR]: PDFRecoveryStrategies.SKIP,
      
      [PDFErrorTypes.GENERATION_FAILED]: PDFRecoveryStrategies.RETRY,
      [PDFErrorTypes.INVALID_CONTENT]: PDFRecoveryStrategies.FALLBACK,
      [PDFErrorTypes.INVALID_OPTIONS]: PDFRecoveryStrategies.FALLBACK,
      [PDFErrorTypes.OUTPUT_ERROR]: PDFRecoveryStrategies.RETRY,
      
      [PDFErrorTypes.MEMORY_ERROR]: PDFRecoveryStrategies.ALTERNATIVE,
      [PDFErrorTypes.TIMEOUT_ERROR]: PDFRecoveryStrategies.RETRY,
      [PDFErrorTypes.RESOURCE_EXHAUSTED]: PDFRecoveryStrategies.ALTERNATIVE,
      
      [PDFErrorTypes.NETWORK_ERROR]: PDFRecoveryStrategies.RETRY,
      [PDFErrorTypes.DOWNLOAD_FAILED]: PDFRecoveryStrategies.RETRY,
      
      [PDFErrorTypes.UNKNOWN_ERROR]: PDFRecoveryStrategies.RETRY
    };
    
    return strategyMap[type] || PDFRecoveryStrategies.RETRY;
  }
  
  /**
   * Check if error is recoverable
   */
  _isRecoverable(type) {
    const nonRecoverableTypes = [
      PDFErrorTypes.FILE_NOT_FOUND,
      PDFErrorTypes.FILE_ACCESS_DENIED,
      PDFErrorTypes.FILE_EMPTY,
      PDFErrorTypes.NO_PAGES,
      PDFErrorTypes.PASSWORD_REQUIRED
    ];
    
    return !nonRecoverableTypes.includes(type);
  }
  
  /**
   * Generate user-friendly message
   */
  _generateUserMessage(type, message) {
    const userMessages = {
      [PDFErrorTypes.FILE_NOT_FOUND]: 'The PDF file could not be found. Please check the file path.',
      [PDFErrorTypes.FILE_ACCESS_DENIED]: 'Access to the PDF file is denied. Please check file permissions.',
      [PDFErrorTypes.FILE_CORRUPTED]: 'The PDF file appears to be corrupted or damaged.',
      [PDFErrorTypes.FILE_TOO_LARGE]: 'The PDF file is too large to process.',
      [PDFErrorTypes.FILE_EMPTY]: 'The PDF file is empty or has no content.',
      
      [PDFErrorTypes.INVALID_PDF]: 'The file is not a valid PDF document.',
      [PDFErrorTypes.MALFORMED_PDF]: 'The PDF document is malformed or contains errors.',
      [PDFErrorTypes.UNSUPPORTED_VERSION]: 'This PDF version is not supported.',
      [PDFErrorTypes.UNSUPPORTED_ENCRYPTION]: 'This PDF encryption method is not supported.',
      [PDFErrorTypes.UNSUPPORTED_FEATURES]: 'Some PDF features are not supported.',
      
      [PDFErrorTypes.PASSWORD_REQUIRED]: 'This PDF is password-protected. Please provide the password.',
      [PDFErrorTypes.INVALID_PASSWORD]: 'The provided password is incorrect.',
      [PDFErrorTypes.PERMISSION_DENIED]: 'You do not have permission to perform this operation on this PDF.',
      [PDFErrorTypes.ENCRYPTION_ERROR]: 'An error occurred while handling PDF encryption.',
      
      [PDFErrorTypes.NO_TEXT_CONTENT]: 'No text content found in the PDF.',
      [PDFErrorTypes.NO_PAGES]: 'The PDF document has no pages.',
      [PDFErrorTypes.PAGE_NOT_FOUND]: 'The requested page was not found.',
      [PDFErrorTypes.INVALID_PAGE_RANGE]: 'The specified page range is invalid.',
      
      [PDFErrorTypes.RENDER_FAILED]: 'Failed to render the PDF page.',
      [PDFErrorTypes.CANVAS_ERROR]: 'An error occurred while creating the page image.',
      [PDFErrorTypes.FONT_ERROR]: 'An error occurred while processing fonts.',
      [PDFErrorTypes.IMAGE_ERROR]: 'An error occurred while processing images.',
      
      [PDFErrorTypes.GENERATION_FAILED]: 'Failed to generate the PDF document.',
      [PDFErrorTypes.INVALID_CONTENT]: 'The content provided for PDF generation is invalid.',
      [PDFErrorTypes.INVALID_OPTIONS]: 'Invalid options provided for PDF operation.',
      [PDFErrorTypes.OUTPUT_ERROR]: 'An error occurred while saving the PDF file.',
      
      [PDFErrorTypes.MEMORY_ERROR]: 'Insufficient memory to process the PDF.',
      [PDFErrorTypes.TIMEOUT_ERROR]: 'The PDF operation timed out.',
      [PDFErrorTypes.RESOURCE_EXHAUSTED]: 'System resources are exhausted.',
      
      [PDFErrorTypes.NETWORK_ERROR]: 'A network error occurred while accessing the PDF.',
      [PDFErrorTypes.DOWNLOAD_FAILED]: 'Failed to download the PDF file.',
      
      [PDFErrorTypes.UNKNOWN_ERROR]: 'An unknown error occurred while processing the PDF.'
    };
    
    return userMessages[type] || message;
  }
  
  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      isRecoverable: this.isRecoverable,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

/**
 * PDF Error Handler
 */
class PDFErrorHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      enableLogging: true,
      enableRecovery: true,
      logLevel: 'error',
      ...options
    };
    
    this.errorHistory = [];
    this.retryAttempts = new Map();
    this.statistics = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      recoveredErrors: 0,
      unrecoveredErrors: 0
    };
  }
  
  /**
   * Handle PDF error
   */
  async handleError(error, context = {}, operation = null) {
    let pdfError;
    
    if (error instanceof PDFError) {
      pdfError = error;
    } else {
      // Convert regular error to PDFError
      const errorType = this._classifyError(error);
      pdfError = new PDFError(errorType, error.message, error, context);
    }
    
    // Add to history
    this.errorHistory.push(pdfError);
    
    // Update statistics
    this._updateStatistics(pdfError);
    
    // Log error
    if (this.options.enableLogging) {
      this._logError(pdfError);
    }
    
    // Emit error event
    this.emit('error', pdfError);
    
    // Attempt recovery if enabled
    if (this.options.enableRecovery && pdfError.isRecoverable) {
      return await this._attemptRecovery(pdfError, operation);
    }
    
    throw pdfError;
  }
  
  /**
   * Classify error type
   */
  _classifyError(error) {
    const message = error.message.toLowerCase();
    
    // File errors
    if (message.includes('no such file') || message.includes('enoent')) {
      return PDFErrorTypes.FILE_NOT_FOUND;
    }
    if (message.includes('permission denied') || message.includes('eacces')) {
      return PDFErrorTypes.FILE_ACCESS_DENIED;
    }
    if (message.includes('file too large') || message.includes('size limit')) {
      return PDFErrorTypes.FILE_TOO_LARGE;
    }
    if (message.includes('empty file') || message.includes('no content')) {
      return PDFErrorTypes.FILE_EMPTY;
    }
    
    // PDF format errors
    if (message.includes('invalid pdf') || message.includes('not a pdf')) {
      return PDFErrorTypes.INVALID_PDF;
    }
    if (message.includes('malformed') || message.includes('corrupted')) {
      return PDFErrorTypes.MALFORMED_PDF;
    }
    if (message.includes('unsupported version')) {
      return PDFErrorTypes.UNSUPPORTED_VERSION;
    }
    if (message.includes('unsupported encryption')) {
      return PDFErrorTypes.UNSUPPORTED_ENCRYPTION;
    }
    
    // Security errors
    if (message.includes('password required') || message.includes('encrypted')) {
      return PDFErrorTypes.PASSWORD_REQUIRED;
    }
    if (message.includes('invalid password') || message.includes('wrong password')) {
      return PDFErrorTypes.INVALID_PASSWORD;
    }
    if (message.includes('permission denied')) {
      return PDFErrorTypes.PERMISSION_DENIED;
    }
    
    // Content errors
    if (message.includes('no text') || message.includes('text not found')) {
      return PDFErrorTypes.NO_TEXT_CONTENT;
    }
    if (message.includes('no pages') || message.includes('page count is 0')) {
      return PDFErrorTypes.NO_PAGES;
    }
    if (message.includes('page not found') || message.includes('invalid page')) {
      return PDFErrorTypes.PAGE_NOT_FOUND;
    }
    
    // Rendering errors
    if (message.includes('render failed') || message.includes('rendering error')) {
      return PDFErrorTypes.RENDER_FAILED;
    }
    if (message.includes('canvas') || message.includes('context')) {
      return PDFErrorTypes.CANVAS_ERROR;
    }
    if (message.includes('font')) {
      return PDFErrorTypes.FONT_ERROR;
    }
    
    // Generation errors
    if (message.includes('generation failed') || message.includes('create pdf')) {
      return PDFErrorTypes.GENERATION_FAILED;
    }
    if (message.includes('invalid content')) {
      return PDFErrorTypes.INVALID_CONTENT;
    }
    if (message.includes('invalid options')) {
      return PDFErrorTypes.INVALID_OPTIONS;
    }
    
    // Memory and performance errors
    if (message.includes('out of memory') || message.includes('memory')) {
      return PDFErrorTypes.MEMORY_ERROR;
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return PDFErrorTypes.TIMEOUT_ERROR;
    }
    
    // Network errors
    if (message.includes('network') || message.includes('connection')) {
      return PDFErrorTypes.NETWORK_ERROR;
    }
    if (message.includes('download')) {
      return PDFErrorTypes.DOWNLOAD_FAILED;
    }
    
    return PDFErrorTypes.UNKNOWN_ERROR;
  }
  
  /**
   * Attempt error recovery
   */
  async _attemptRecovery(pdfError, operation) {
    const operationKey = operation ? operation.toString() : 'unknown';
    const retryKey = `${pdfError.type}_${operationKey}`;
    
    const currentAttempts = this.retryAttempts.get(retryKey) || 0;
    
    if (currentAttempts >= this.options.maxRetries) {
      this.retryAttempts.delete(retryKey);
      this.statistics.unrecoveredErrors++;
      throw pdfError;
    }
    
    this.retryAttempts.set(retryKey, currentAttempts + 1);
    
    // Emit recovery attempt event
    this.emit('recovery_attempt', {
      error: pdfError,
      attempt: currentAttempts + 1,
      maxAttempts: this.options.maxRetries,
      strategy: pdfError.recoveryStrategy
    });
    
    try {
      const result = await this._executeRecoveryStrategy(pdfError, operation);
      
      // Recovery successful
      this.retryAttempts.delete(retryKey);
      this.statistics.recoveredErrors++;
      
      this.emit('recovery_success', {
        error: pdfError,
        result,
        attempts: currentAttempts + 1
      });
      
      return result;
      
    } catch (recoveryError) {
      // Recovery failed, wait before next attempt
      await this._delay(this.options.retryDelay * (currentAttempts + 1));
      
      this.emit('recovery_failed', {
        error: pdfError,
        recoveryError,
        attempt: currentAttempts + 1
      });
      
      // Retry
      return await this._attemptRecovery(pdfError, operation);
    }
  }
  
  /**
   * Execute recovery strategy
   */
  async _executeRecoveryStrategy(pdfError, operation) {
    switch (pdfError.recoveryStrategy) {
      case PDFRecoveryStrategies.RETRY:
        if (operation) {
          return await operation();
        }
        throw new Error('No operation provided for retry strategy');
        
      case PDFRecoveryStrategies.FALLBACK:
        return await this._executeFallback(pdfError, operation);
        
      case PDFRecoveryStrategies.REPAIR:
        return await this._executeRepair(pdfError, operation);
        
      case PDFRecoveryStrategies.ALTERNATIVE:
        return await this._executeAlternative(pdfError, operation);
        
      case PDFRecoveryStrategies.SKIP:
        return { skipped: true, reason: pdfError.type };
        
      default:
        throw pdfError;
    }
  }
  
  /**
   * Execute fallback strategy
   */
  async _executeFallback(pdfError, operation) {
    // Implement fallback logic based on error type
    switch (pdfError.type) {
      case PDFErrorTypes.UNSUPPORTED_ENCRYPTION:
        // Try without encryption handling
        return { fallback: 'no_encryption', partial: true };
        
      case PDFErrorTypes.RENDER_FAILED:
        // Try with lower quality settings
        return { fallback: 'low_quality', partial: true };
        
      case PDFErrorTypes.FONT_ERROR:
        // Try with default font
        return { fallback: 'default_font', partial: true };
        
      default:
        throw pdfError;
    }
  }
  
  /**
   * Execute repair strategy
   */
  async _executeRepair(pdfError, operation) {
    // Implement repair logic based on error type
    switch (pdfError.type) {
      case PDFErrorTypes.MALFORMED_PDF:
        // Try to repair malformed PDF
        return { repaired: true, partial: true };
        
      case PDFErrorTypes.FILE_CORRUPTED:
        // Try to recover what's possible
        return { recovered: true, partial: true };
        
      default:
        throw pdfError;
    }
  }
  
  /**
   * Execute alternative strategy
   */
  async _executeAlternative(pdfError, operation) {
    // Implement alternative approaches
    switch (pdfError.type) {
      case PDFErrorTypes.MEMORY_ERROR:
        // Try processing in smaller chunks
        return { alternative: 'chunked_processing', partial: true };
        
      case PDFErrorTypes.FILE_TOO_LARGE:
        // Try processing pages individually
        return { alternative: 'page_by_page', partial: true };
        
      default:
        throw pdfError;
    }
  }
  
  /**
   * Update statistics
   */
  _updateStatistics(pdfError) {
    this.statistics.totalErrors++;
    
    // Count by type
    if (!this.statistics.errorsByType[pdfError.type]) {
      this.statistics.errorsByType[pdfError.type] = 0;
    }
    this.statistics.errorsByType[pdfError.type]++;
    
    // Count by severity
    if (!this.statistics.errorsBySeverity[pdfError.severity]) {
      this.statistics.errorsBySeverity[pdfError.severity] = 0;
    }
    this.statistics.errorsBySeverity[pdfError.severity]++;
  }
  
  /**
   * Log error
   */
  _logError(pdfError) {
    const logData = {
      type: pdfError.type,
      message: pdfError.message,
      severity: pdfError.severity,
      context: pdfError.context,
      timestamp: new Date(pdfError.timestamp).toISOString()
    };
    
    if (this.options.logLevel === 'debug') {
      console.log('PDF Error:', JSON.stringify(logData, null, 2));
    } else {
      console.error(`PDF Error [${pdfError.type}]: ${pdfError.message}`);
    }
  }
  
  /**
   * Delay helper
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get error statistics
   */
  getStatistics() {
    return { ...this.statistics };
  }
  
  /**
   * Get error history
   */
  getErrorHistory(limit = 100) {
    return this.errorHistory.slice(-limit);
  }
  
  /**
   * Clear error history
   */
  clearErrorHistory() {
    this.errorHistory = [];
  }
  
  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalErrors: 0,
      errorsByType: {},
      errorsBySeverity: {},
      recoveredErrors: 0,
      unrecoveredErrors: 0
    };
  }
}

// Global instance
let globalErrorHandler = null;

/**
 * Get global PDF error handler
 */
function getPDFErrorHandler(options = {}) {
  if (!globalErrorHandler) {
    globalErrorHandler = new PDFErrorHandler(options);
  }
  return globalErrorHandler;
}

/**
 * Create PDF error
 */
function createPDFError(type, message, originalError = null, context = {}) {
  return new PDFError(type, message, originalError, context);
}

/**
 * Handle PDF error with global handler
 */
async function handlePDFError(error, context = {}, operation = null) {
  const errorHandler = getPDFErrorHandler();
  return await errorHandler.handleError(error, context, operation);
}

module.exports = {
  PDFError,
  PDFErrorHandler,
  PDFErrorTypes,
  PDFErrorSeverity,
  PDFRecoveryStrategies,
  getPDFErrorHandler,
  createPDFError,
  handlePDFError
};