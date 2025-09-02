/**
 * Image Processing Error Handler
 * Comprehensive error handling for image processing operations
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Image processing error types
 */
const ImageProcessingErrorTypes = {
  INVALID_INPUT: 'INVALID_INPUT',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CORRUPTED_IMAGE: 'CORRUPTED_IMAGE',
  MEMORY_ERROR: 'MEMORY_ERROR',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  OUTPUT_ERROR: 'OUTPUT_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR'
};

/**
 * Error severity levels
 */
const ImageProcessingErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Recovery strategies
 */
const ImageProcessingRecoveryStrategies = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  SKIP: 'skip',
  REPAIR: 'repair',
  ALTERNATIVE: 'alternative'
};

/**
 * Image processing error class
 */
class ImageProcessingError extends Error {
  constructor(message, type = ImageProcessingErrorTypes.PROCESSING_FAILED, details = {}) {
    super(message);
    this.name = 'ImageProcessingError';
    this.type = type;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.severity = this.determineSeverity(type);
    this.recoveryStrategy = this.determineRecoveryStrategy(type);
    this.retryable = this.isRetryable(type);
  }

  /**
   * Determine error severity based on type
   */
  determineSeverity(type) {
    const severityMap = {
      [ImageProcessingErrorTypes.INVALID_INPUT]: ImageProcessingErrorSeverity.MEDIUM,
      [ImageProcessingErrorTypes.UNSUPPORTED_FORMAT]: ImageProcessingErrorSeverity.MEDIUM,
      [ImageProcessingErrorTypes.FILE_NOT_FOUND]: ImageProcessingErrorSeverity.HIGH,
      [ImageProcessingErrorTypes.PERMISSION_DENIED]: ImageProcessingErrorSeverity.HIGH,
      [ImageProcessingErrorTypes.CORRUPTED_IMAGE]: ImageProcessingErrorSeverity.MEDIUM,
      [ImageProcessingErrorTypes.MEMORY_ERROR]: ImageProcessingErrorSeverity.CRITICAL,
      [ImageProcessingErrorTypes.PROCESSING_FAILED]: ImageProcessingErrorSeverity.MEDIUM,
      [ImageProcessingErrorTypes.OUTPUT_ERROR]: ImageProcessingErrorSeverity.HIGH,
      [ImageProcessingErrorTypes.TIMEOUT_ERROR]: ImageProcessingErrorSeverity.MEDIUM,
      [ImageProcessingErrorTypes.NETWORK_ERROR]: ImageProcessingErrorSeverity.MEDIUM,
      [ImageProcessingErrorTypes.VALIDATION_ERROR]: ImageProcessingErrorSeverity.LOW,
      [ImageProcessingErrorTypes.CONFIGURATION_ERROR]: ImageProcessingErrorSeverity.HIGH
    };
    
    return severityMap[type] || ImageProcessingErrorSeverity.MEDIUM;
  }

  /**
   * Determine recovery strategy based on type
   */
  determineRecoveryStrategy(type) {
    const strategyMap = {
      [ImageProcessingErrorTypes.INVALID_INPUT]: ImageProcessingRecoveryStrategies.REPAIR,
      [ImageProcessingErrorTypes.UNSUPPORTED_FORMAT]: ImageProcessingRecoveryStrategies.ALTERNATIVE,
      [ImageProcessingErrorTypes.FILE_NOT_FOUND]: ImageProcessingRecoveryStrategies.SKIP,
      [ImageProcessingErrorTypes.PERMISSION_DENIED]: ImageProcessingRecoveryStrategies.SKIP,
      [ImageProcessingErrorTypes.CORRUPTED_IMAGE]: ImageProcessingRecoveryStrategies.REPAIR,
      [ImageProcessingErrorTypes.MEMORY_ERROR]: ImageProcessingRecoveryStrategies.FALLBACK,
      [ImageProcessingErrorTypes.PROCESSING_FAILED]: ImageProcessingRecoveryStrategies.RETRY,
      [ImageProcessingErrorTypes.OUTPUT_ERROR]: ImageProcessingRecoveryStrategies.RETRY,
      [ImageProcessingErrorTypes.TIMEOUT_ERROR]: ImageProcessingRecoveryStrategies.RETRY,
      [ImageProcessingErrorTypes.NETWORK_ERROR]: ImageProcessingRecoveryStrategies.RETRY,
      [ImageProcessingErrorTypes.VALIDATION_ERROR]: ImageProcessingRecoveryStrategies.REPAIR,
      [ImageProcessingErrorTypes.CONFIGURATION_ERROR]: ImageProcessingRecoveryStrategies.FALLBACK
    };
    
    return strategyMap[type] || ImageProcessingRecoveryStrategies.SKIP;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(type) {
    const retryableTypes = [
      ImageProcessingErrorTypes.PROCESSING_FAILED,
      ImageProcessingErrorTypes.OUTPUT_ERROR,
      ImageProcessingErrorTypes.TIMEOUT_ERROR,
      ImageProcessingErrorTypes.NETWORK_ERROR,
      ImageProcessingErrorTypes.MEMORY_ERROR
    ];
    
    return retryableTypes.includes(type);
  }

  /**
   * Get error summary
   */
  getSummary() {
    return {
      message: this.message,
      type: this.type,
      severity: this.severity,
      recoveryStrategy: this.recoveryStrategy,
      retryable: this.retryable,
      timestamp: this.timestamp,
      details: this.details
    };
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
      recoveryStrategy: this.recoveryStrategy,
      retryable: this.retryable,
      timestamp: this.timestamp,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * Image processing error handler
 */
class ImageProcessingErrorHandler extends EventEmitter {
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
    this.maxLogSize = 1000;
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2
    };
  }

  /**
   * Handle an error
   */
  async handleError(error, context = {}) {
    let processedError;
    
    if (error instanceof ImageProcessingError) {
      processedError = error;
    } else {
      processedError = this.classifyError(error, context);
    }
    
    // Log the error
    this.logError(processedError, context);
    
    // Update statistics
    this.updateStatistics(processedError);
    
    // Emit error event
    this.emit('error', processedError, context);
    
    // Attempt recovery if applicable
    const recoveryResult = await this.attemptRecovery(processedError, context);
    
    return {
      error: processedError,
      recovery: recoveryResult
    };
  }

  /**
   * Classify unknown errors
   */
  classifyError(error, context = {}) {
    let type = ImageProcessingErrorTypes.PROCESSING_FAILED;
    let details = { originalError: error.message, context };
    
    // Classify based on error message patterns
    const message = error.message.toLowerCase();
    
    if (message.includes('no such file') || message.includes('enoent')) {
      type = ImageProcessingErrorTypes.FILE_NOT_FOUND;
    } else if (message.includes('permission denied') || message.includes('eacces')) {
      type = ImageProcessingErrorTypes.PERMISSION_DENIED;
    } else if (message.includes('unsupported') || message.includes('format')) {
      type = ImageProcessingErrorTypes.UNSUPPORTED_FORMAT;
    } else if (message.includes('memory') || message.includes('heap')) {
      type = ImageProcessingErrorTypes.MEMORY_ERROR;
    } else if (message.includes('timeout')) {
      type = ImageProcessingErrorTypes.TIMEOUT_ERROR;
    } else if (message.includes('network') || message.includes('connection')) {
      type = ImageProcessingErrorTypes.NETWORK_ERROR;
    } else if (message.includes('corrupt') || message.includes('invalid')) {
      type = ImageProcessingErrorTypes.CORRUPTED_IMAGE;
    } else if (message.includes('validation')) {
      type = ImageProcessingErrorTypes.VALIDATION_ERROR;
    }
    
    return new ImageProcessingError(error.message, type, details);
  }

  /**
   * Log error
   */
  logError(error, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: error.getSummary(),
      context,
      id: this.generateErrorId()
    };
    
    this.errorLog.push(logEntry);
    
    // Maintain log size limit
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
    
    // Emit log event
    this.emit('errorLogged', logEntry);
  }

  /**
   * Update error statistics
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
   * Attempt error recovery
   */
  async attemptRecovery(error, context = {}) {
    this.statistics.recoveryAttempts++;
    
    const recoveryResult = {
      attempted: true,
      strategy: error.recoveryStrategy,
      success: false,
      result: null,
      message: ''
    };
    
    try {
      switch (error.recoveryStrategy) {
        case ImageProcessingRecoveryStrategies.RETRY:
          recoveryResult.result = await this.retryOperation(context);
          break;
          
        case ImageProcessingRecoveryStrategies.FALLBACK:
          recoveryResult.result = await this.fallbackOperation(context);
          break;
          
        case ImageProcessingRecoveryStrategies.REPAIR:
          recoveryResult.result = await this.repairOperation(context);
          break;
          
        case ImageProcessingRecoveryStrategies.ALTERNATIVE:
          recoveryResult.result = await this.alternativeOperation(context);
          break;
          
        case ImageProcessingRecoveryStrategies.SKIP:
          recoveryResult.result = await this.skipOperation(context);
          break;
          
        default:
          recoveryResult.message = 'No recovery strategy available';
          return recoveryResult;
      }
      
      recoveryResult.success = true;
      recoveryResult.message = 'Recovery successful';
      this.statistics.successfulRecoveries++;
      
    } catch (recoveryError) {
      recoveryResult.message = `Recovery failed: ${recoveryError.message}`;
    }
    
    // Emit recovery event
    this.emit('recoveryAttempted', recoveryResult, error, context);
    
    return recoveryResult;
  }

  /**
   * Retry operation with backoff
   */
  async retryOperation(context) {
    const { operation, retryCount = 0 } = context;
    
    if (!operation || retryCount >= this.retryConfig.maxRetries) {
      throw new Error('Maximum retry attempts exceeded');
    }
    
    // Calculate delay with exponential backoff
    const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount);
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry the operation
    return await operation({ ...context, retryCount: retryCount + 1 });
  }

  /**
   * Fallback operation with reduced quality/features
   */
  async fallbackOperation(context) {
    const { operation, options = {} } = context;
    
    if (!operation) {
      throw new Error('No fallback operation available');
    }
    
    // Use fallback options (reduced quality, simpler operations)
    const fallbackOptions = {
      ...options,
      quality: Math.min(options.quality || 80, 60),
      optimize: false,
      progressive: false,
      strip: true
    };
    
    return await operation({ ...context, options: fallbackOptions });
  }

  /**
   * Repair operation (fix input or parameters)
   */
  async repairOperation(context) {
    const { inputPath, operations = {} } = context;
    
    // Try to repair common issues
    const repairedContext = { ...context };
    
    // Validate and fix file path
    if (inputPath) {
      try {
        await fs.access(inputPath);
      } catch {
        throw new Error('Cannot repair: file not accessible');
      }
    }
    
    // Fix invalid operations
    const repairedOperations = { ...operations };
    
    // Remove invalid dimensions
    if (repairedOperations.width && repairedOperations.width <= 0) {
      delete repairedOperations.width;
    }
    if (repairedOperations.height && repairedOperations.height <= 0) {
      delete repairedOperations.height;
    }
    
    // Fix invalid quality
    if (repairedOperations.quality && (repairedOperations.quality < 1 || repairedOperations.quality > 100)) {
      repairedOperations.quality = 80;
    }
    
    repairedContext.operations = repairedOperations;
    
    return repairedContext;
  }

  /**
   * Alternative operation (different approach)
   */
  async alternativeOperation(context) {
    const { operations = {} } = context;
    
    // Try alternative formats or methods
    const alternativeOperations = { ...operations };
    
    // Use alternative format if current one is unsupported
    if (alternativeOperations.format) {
      const formatAlternatives = {
        'webp': 'jpeg',
        'avif': 'jpeg',
        'heif': 'jpeg',
        'svg': 'png'
      };
      
      if (formatAlternatives[alternativeOperations.format]) {
        alternativeOperations.format = formatAlternatives[alternativeOperations.format];
      }
    }
    
    return { ...context, operations: alternativeOperations };
  }

  /**
   * Skip operation (mark as skipped)
   */
  async skipOperation(context) {
    return {
      skipped: true,
      reason: 'Operation skipped due to error',
      context
    };
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `img_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    return this.errorLog.slice(-limit).reverse();
  }

  /**
   * Get errors by type
   */
  getErrorsByType(type) {
    return this.errorLog.filter(entry => entry.error.type === type);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity) {
    return this.errorLog.filter(entry => entry.error.severity === severity);
  }

  /**
   * Clear error log
   */
  clearErrorLog() {
    this.errorLog = [];
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
  exportErrorLog() {
    return {
      timestamp: new Date().toISOString(),
      statistics: this.getStatistics(),
      errors: this.errorLog
    };
  }

  /**
   * Set retry configuration
   */
  setRetryConfig(config) {
    this.retryConfig = { ...this.retryConfig, ...config };
  }
}

// Global error handler instance
let globalImageProcessingErrorHandler = null;

/**
 * Get global image processing error handler
 */
function getImageProcessingErrorHandler() {
  if (!globalImageProcessingErrorHandler) {
    globalImageProcessingErrorHandler = new ImageProcessingErrorHandler();
  }
  return globalImageProcessingErrorHandler;
}

/**
 * Create image processing error
 */
function createImageProcessingError(message, type, details) {
  return new ImageProcessingError(message, type, details);
}

/**
 * Handle image processing error
 */
async function handleImageProcessingError(error, context) {
  const handler = getImageProcessingErrorHandler();
  return await handler.handleError(error, context);
}

module.exports = {
  ImageProcessingError,
  ImageProcessingErrorHandler,
  ImageProcessingErrorTypes,
  ImageProcessingErrorSeverity,
  ImageProcessingRecoveryStrategies,
  getImageProcessingErrorHandler,
  createImageProcessingError,
  handleImageProcessingError
};