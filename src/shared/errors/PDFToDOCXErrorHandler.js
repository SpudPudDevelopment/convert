/**
 * PDF to DOCX Conversion Error Handler
 * Specialized error handling for PDF to DOCX conversion operations
 */

const { EventEmitter } = require('events');
const { PDFErrorTypes } = require('./PDFErrorHandler');
const { DOCXErrorTypes } = require('./DOCXErrorHandler');

/**
 * PDF to DOCX specific error types
 */
const PDFToDOCXErrorTypes = {
  // Conversion pipeline errors
  CONVERSION_FAILED: 'conversion_failed',
  PIPELINE_ERROR: 'pipeline_error',
  STEP_FAILED: 'step_failed',
  
  // Content extraction errors
  CONTENT_EXTRACTION_FAILED: 'content_extraction_failed',
  STRUCTURE_ANALYSIS_FAILED: 'structure_analysis_failed',
  METADATA_EXTRACTION_FAILED: 'metadata_extraction_failed',
  
  // Intermediate format errors
  INTERMEDIATE_GENERATION_FAILED: 'intermediate_generation_failed',
  HTML_GENERATION_FAILED: 'html_generation_failed',
  MARKDOWN_GENERATION_FAILED: 'markdown_generation_failed',
  
  // DOCX generation errors
  DOCX_GENERATION_FAILED: 'docx_generation_failed',
  FORMATTING_PRESERVATION_FAILED: 'formatting_preservation_failed',
  IMAGE_EMBEDDING_FAILED: 'image_embedding_failed',
  
  // Performance and resource errors
  TIMEOUT_ERROR: 'timeout_error',
  MEMORY_LIMIT_EXCEEDED: 'memory_limit_exceeded',
  FILE_SIZE_LIMIT_EXCEEDED: 'file_size_limit_exceeded',
  
  // Quality and validation errors
  QUALITY_CHECK_FAILED: 'quality_check_failed',
  VALIDATION_FAILED: 'validation_failed',
  COMPATIBILITY_ERROR: 'compatibility_error',
  
  // Batch processing errors
  BATCH_PROCESSING_FAILED: 'batch_processing_failed',
  PARTIAL_BATCH_FAILURE: 'partial_batch_failure',
  
  // Cache and optimization errors
  CACHE_ERROR: 'cache_error',
  OPTIMIZATION_FAILED: 'optimization_failed',
  
  // Unknown conversion error
  UNKNOWN_CONVERSION_ERROR: 'unknown_conversion_error'
};

/**
 * PDF to DOCX error severity levels
 */
const PDFToDOCXErrorSeverity = {
  LOW: 'low',           // Minor issues, conversion can continue
  MEDIUM: 'medium',     // Moderate issues, some features may be lost
  HIGH: 'high',         // Serious issues, conversion quality affected
  CRITICAL: 'critical'  // Fatal errors, conversion cannot complete
};

/**
 * PDF to DOCX recovery strategies
 */
const PDFToDOCXRecoveryStrategies = {
  RETRY_CONVERSION: 'retry_conversion',
  FALLBACK_FORMAT: 'fallback_format',
  SKIP_PROBLEMATIC_CONTENT: 'skip_problematic_content',
  REDUCE_QUALITY: 'reduce_quality',
  SPLIT_DOCUMENT: 'split_document',
  ALTERNATIVE_PIPELINE: 'alternative_pipeline',
  MANUAL_INTERVENTION: 'manual_intervention',
  ABORT_CONVERSION: 'abort_conversion'
};

/**
 * PDF to DOCX Error class
 */
class PDFToDOCXError extends Error {
  constructor(message, type = PDFToDOCXErrorTypes.UNKNOWN_CONVERSION_ERROR, details = {}) {
    super(message);
    this.name = 'PDFToDOCXError';
    this.type = type;
    this.severity = this._determineSeverity(type);
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.recoveryStrategies = this._getRecoveryStrategies(type);
    this.conversionStep = details.conversionStep || 'unknown';
    this.inputFile = details.inputFile || null;
    this.outputFile = details.outputFile || null;
  }

  /**
   * Determine error severity based on type
   */
  _determineSeverity(type) {
    const criticalErrors = [
      PDFToDOCXErrorTypes.MEMORY_LIMIT_EXCEEDED,
      PDFToDOCXErrorTypes.FILE_SIZE_LIMIT_EXCEEDED,
      PDFToDOCXErrorTypes.TIMEOUT_ERROR,
      PDFToDOCXErrorTypes.PIPELINE_ERROR
    ];

    const highErrors = [
      PDFToDOCXErrorTypes.CONVERSION_FAILED,
      PDFToDOCXErrorTypes.DOCX_GENERATION_FAILED,
      PDFToDOCXErrorTypes.CONTENT_EXTRACTION_FAILED
    ];

    const mediumErrors = [
      PDFToDOCXErrorTypes.FORMATTING_PRESERVATION_FAILED,
      PDFToDOCXErrorTypes.IMAGE_EMBEDDING_FAILED,
      PDFToDOCXErrorTypes.INTERMEDIATE_GENERATION_FAILED
    ];

    if (criticalErrors.includes(type)) {
      return PDFToDOCXErrorSeverity.CRITICAL;
    } else if (highErrors.includes(type)) {
      return PDFToDOCXErrorSeverity.HIGH;
    } else if (mediumErrors.includes(type)) {
      return PDFToDOCXErrorSeverity.MEDIUM;
    } else {
      return PDFToDOCXErrorSeverity.LOW;
    }
  }

  /**
   * Get recovery strategies for error type
   */
  _getRecoveryStrategies(type) {
    const strategies = {
      [PDFToDOCXErrorTypes.CONVERSION_FAILED]: [
        PDFToDOCXRecoveryStrategies.RETRY_CONVERSION,
        PDFToDOCXRecoveryStrategies.ALTERNATIVE_PIPELINE,
        PDFToDOCXRecoveryStrategies.FALLBACK_FORMAT
      ],
      [PDFToDOCXErrorTypes.TIMEOUT_ERROR]: [
        PDFToDOCXRecoveryStrategies.SPLIT_DOCUMENT,
        PDFToDOCXRecoveryStrategies.REDUCE_QUALITY,
        PDFToDOCXRecoveryStrategies.RETRY_CONVERSION
      ],
      [PDFToDOCXErrorTypes.MEMORY_LIMIT_EXCEEDED]: [
        PDFToDOCXRecoveryStrategies.SPLIT_DOCUMENT,
        PDFToDOCXRecoveryStrategies.REDUCE_QUALITY,
        PDFToDOCXRecoveryStrategies.ABORT_CONVERSION
      ],
      [PDFToDOCXErrorTypes.FORMATTING_PRESERVATION_FAILED]: [
        PDFToDOCXRecoveryStrategies.REDUCE_QUALITY,
        PDFToDOCXRecoveryStrategies.SKIP_PROBLEMATIC_CONTENT,
        PDFToDOCXRecoveryStrategies.FALLBACK_FORMAT
      ],
      [PDFToDOCXErrorTypes.IMAGE_EMBEDDING_FAILED]: [
        PDFToDOCXRecoveryStrategies.SKIP_PROBLEMATIC_CONTENT,
        PDFToDOCXRecoveryStrategies.RETRY_CONVERSION
      ],
      [PDFToDOCXErrorTypes.BATCH_PROCESSING_FAILED]: [
        PDFToDOCXRecoveryStrategies.RETRY_CONVERSION,
        PDFToDOCXRecoveryStrategies.SKIP_PROBLEMATIC_CONTENT
      ]
    };

    return strategies[type] || [PDFToDOCXRecoveryStrategies.RETRY_CONVERSION];
  }

  /**
   * Get error context information
   */
  getContext() {
    return {
      type: this.type,
      severity: this.severity,
      conversionStep: this.conversionStep,
      inputFile: this.inputFile,
      outputFile: this.outputFile,
      timestamp: this.timestamp,
      recoveryStrategies: this.recoveryStrategies,
      details: this.details
    };
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable() {
    return this.severity !== PDFToDOCXErrorSeverity.CRITICAL &&
           this.recoveryStrategies.length > 0;
  }

  /**
   * Get recommended recovery strategy
   */
  getRecommendedRecovery() {
    return this.recoveryStrategies[0] || null;
  }
}

/**
 * PDF to DOCX Error Handler class
 */
class PDFToDOCXErrorHandler extends EventEmitter {
  constructor() {
    super();
    this.errorHistory = [];
    this.recoveryAttempts = new Map();
    this.statistics = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      recoveryAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0
    };
    this.maxRetryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Handle PDF to DOCX conversion error
   */
  async handleError(error, context = {}) {
    const pdfToDOCXError = this._createPDFToDOCXError(error, context);
    
    // Log error
    this._logError(pdfToDOCXError);
    
    // Update statistics
    this._updateStatistics(pdfToDOCXError);
    
    // Store in history
    this.errorHistory.push(pdfToDOCXError);
    
    // Emit error event
    this.emit('error', pdfToDOCXError);
    
    // Attempt recovery if possible
    if (pdfToDOCXError.isRecoverable() && context.enableRecovery !== false) {
      return await this._attemptRecovery(pdfToDOCXError, context);
    }
    
    return {
      success: false,
      error: pdfToDOCXError,
      recoveryAttempted: false
    };
  }

  /**
   * Create PDF to DOCX error from generic error
   */
  _createPDFToDOCXError(error, context) {
    if (error instanceof PDFToDOCXError) {
      return error;
    }

    // Classify error type based on message and context
    const errorType = this._classifyError(error, context);
    
    return new PDFToDOCXError(
      error.message || 'Unknown conversion error',
      errorType,
      {
        originalError: error,
        conversionStep: context.conversionStep,
        inputFile: context.inputFile,
        outputFile: context.outputFile,
        options: context.options,
        stack: error.stack
      }
    );
  }

  /**
   * Classify error type based on error message and context
   */
  _classifyError(error, context) {
    const message = (error.message || '').toLowerCase();
    const step = (context.conversionStep || '').toLowerCase();

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return PDFToDOCXErrorTypes.TIMEOUT_ERROR;
    }

    // Memory errors
    if (message.includes('memory') || message.includes('heap') || message.includes('out of memory')) {
      return PDFToDOCXErrorTypes.MEMORY_LIMIT_EXCEEDED;
    }

    // File size errors
    if (message.includes('file size') || message.includes('too large')) {
      return PDFToDOCXErrorTypes.FILE_SIZE_LIMIT_EXCEEDED;
    }

    // Step-specific errors
    if (step.includes('extraction') || step.includes('pdf')) {
      return PDFToDOCXErrorTypes.CONTENT_EXTRACTION_FAILED;
    }

    if (step.includes('intermediate') || step.includes('html') || step.includes('markdown')) {
      return PDFToDOCXErrorTypes.INTERMEDIATE_GENERATION_FAILED;
    }

    if (step.includes('docx') || step.includes('generation')) {
      return PDFToDOCXErrorTypes.DOCX_GENERATION_FAILED;
    }

    if (step.includes('formatting') || step.includes('style')) {
      return PDFToDOCXErrorTypes.FORMATTING_PRESERVATION_FAILED;
    }

    if (step.includes('image') || step.includes('media')) {
      return PDFToDOCXErrorTypes.IMAGE_EMBEDDING_FAILED;
    }

    // Validation errors
    if (message.includes('invalid') || message.includes('corrupt') || message.includes('malformed')) {
      return PDFToDOCXErrorTypes.VALIDATION_FAILED;
    }

    // Cache errors
    if (message.includes('cache')) {
      return PDFToDOCXErrorTypes.CACHE_ERROR;
    }

    // Batch processing errors
    if (context.batchProcessing) {
      return PDFToDOCXErrorTypes.BATCH_PROCESSING_FAILED;
    }

    // Default to general conversion failure
    return PDFToDOCXErrorTypes.CONVERSION_FAILED;
  }

  /**
   * Attempt error recovery
   */
  async _attemptRecovery(error, context) {
    const errorKey = this._getErrorKey(error, context);
    const attempts = this.recoveryAttempts.get(errorKey) || 0;
    
    if (attempts >= this.maxRetryAttempts) {
      return {
        success: false,
        error,
        recoveryAttempted: true,
        reason: 'Maximum retry attempts exceeded'
      };
    }

    this.recoveryAttempts.set(errorKey, attempts + 1);
    this.statistics.recoveryAttempts++;

    const strategy = error.getRecommendedRecovery();
    
    try {
      const result = await this._executeRecoveryStrategy(strategy, error, context);
      
      if (result.success) {
        this.statistics.successfulRecoveries++;
        this.emit('recovery_success', { error, strategy, result });
      } else {
        this.statistics.failedRecoveries++;
        this.emit('recovery_failed', { error, strategy, result });
      }
      
      return result;
    } catch (recoveryError) {
      this.statistics.failedRecoveries++;
      this.emit('recovery_failed', { error, strategy, error: recoveryError });
      
      return {
        success: false,
        error,
        recoveryAttempted: true,
        recoveryError: recoveryError.message
      };
    }
  }

  /**
   * Execute recovery strategy
   */
  async _executeRecoveryStrategy(strategy, error, context) {
    switch (strategy) {
      case PDFToDOCXRecoveryStrategies.RETRY_CONVERSION:
        return await this._retryConversion(error, context);
        
      case PDFToDOCXRecoveryStrategies.FALLBACK_FORMAT:
        return await this._fallbackFormat(error, context);
        
      case PDFToDOCXRecoveryStrategies.REDUCE_QUALITY:
        return await this._reduceQuality(error, context);
        
      case PDFToDOCXRecoveryStrategies.SKIP_PROBLEMATIC_CONTENT:
        return await this._skipProblematicContent(error, context);
        
      case PDFToDOCXRecoveryStrategies.SPLIT_DOCUMENT:
        return await this._splitDocument(error, context);
        
      case PDFToDOCXRecoveryStrategies.ALTERNATIVE_PIPELINE:
        return await this._alternativePipeline(error, context);
        
      default:
        return {
          success: false,
          reason: `Unknown recovery strategy: ${strategy}`
        };
    }
  }

  /**
   * Retry conversion with delay
   */
  async _retryConversion(error, context) {
    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
    
    return {
      success: true,
      action: 'retry',
      message: 'Retrying conversion after delay'
    };
  }

  /**
   * Fallback to simpler format
   */
  async _fallbackFormat(error, context) {
    const fallbackOptions = {
      ...context.options,
      intermediateFormat: 'text',
      preserveFormatting: false,
      extractImages: false
    };
    
    return {
      success: true,
      action: 'fallback_format',
      message: 'Using simplified conversion options',
      modifiedOptions: fallbackOptions
    };
  }

  /**
   * Reduce conversion quality
   */
  async _reduceQuality(error, context) {
    const qualityOptions = {
      ...context.options,
      qualityLevel: 'low',
      preserveFormatting: false,
      optimizeForSize: true
    };
    
    return {
      success: true,
      action: 'reduce_quality',
      message: 'Reducing conversion quality for better performance',
      modifiedOptions: qualityOptions
    };
  }

  /**
   * Skip problematic content
   */
  async _skipProblematicContent(error, context) {
    const skipOptions = {
      ...context.options,
      extractImages: false,
      skipErrors: true,
      continueOnError: true
    };
    
    return {
      success: true,
      action: 'skip_content',
      message: 'Skipping problematic content to continue conversion',
      modifiedOptions: skipOptions
    };
  }

  /**
   * Split document into smaller parts
   */
  async _splitDocument(error, context) {
    // This would require implementing document splitting logic
    return {
      success: true,
      action: 'split_document',
      message: 'Document splitting recommended for large files',
      recommendation: 'Split document into smaller sections and convert separately'
    };
  }

  /**
   * Use alternative conversion pipeline
   */
  async _alternativePipeline(error, context) {
    const alternativeOptions = {
      ...context.options,
      intermediateFormat: 'markdown',
      useAlternativePipeline: true
    };
    
    return {
      success: true,
      action: 'alternative_pipeline',
      message: 'Using alternative conversion pipeline',
      modifiedOptions: alternativeOptions
    };
  }

  /**
   * Generate error key for tracking retry attempts
   */
  _getErrorKey(error, context) {
    return `${error.type}_${context.inputFile || 'unknown'}_${context.conversionStep || 'unknown'}`;
  }

  /**
   * Log error with appropriate level
   */
  _logError(error) {
    const logLevel = this._getLogLevel(error.severity);
    const message = `[${error.type}] ${error.message}`;
    const details = {
      severity: error.severity,
      step: error.conversionStep,
      input: error.inputFile,
      output: error.outputFile,
      timestamp: error.timestamp
    };

    console[logLevel](message, details);
  }

  /**
   * Get log level based on error severity
   */
  _getLogLevel(severity) {
    switch (severity) {
      case PDFToDOCXErrorSeverity.CRITICAL:
        return 'error';
      case PDFToDOCXErrorSeverity.HIGH:
        return 'error';
      case PDFToDOCXErrorSeverity.MEDIUM:
        return 'warn';
      case PDFToDOCXErrorSeverity.LOW:
        return 'info';
      default:
        return 'log';
    }
  }

  /**
   * Update error statistics
   */
  _updateStatistics(error) {
    this.statistics.totalErrors++;
    
    // Update by type
    const typeCount = this.statistics.errorsByType.get(error.type) || 0;
    this.statistics.errorsByType.set(error.type, typeCount + 1);
    
    // Update by severity
    const severityCount = this.statistics.errorsBySeverity.get(error.severity) || 0;
    this.statistics.errorsBySeverity.set(error.severity, severityCount + 1);
  }

  /**
   * Get error statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      errorsByType: Object.fromEntries(this.statistics.errorsByType),
      errorsBySeverity: Object.fromEntries(this.statistics.errorsBySeverity),
      recoverySuccessRate: this.statistics.recoveryAttempts > 0 
        ? (this.statistics.successfulRecoveries / this.statistics.recoveryAttempts * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10) {
    return this.errorHistory
      .slice(-limit)
      .map(error => error.getContext());
  }

  /**
   * Clear error history
   */
  clearHistory() {
    this.errorHistory = [];
    this.recoveryAttempts.clear();
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      recoveryAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0
    };
  }
}

// Global error handler instance
let globalPDFToDOCXErrorHandler = null;

/**
 * Get global PDF to DOCX error handler instance
 */
function getPDFToDOCXErrorHandler() {
  if (!globalPDFToDOCXErrorHandler) {
    globalPDFToDOCXErrorHandler = new PDFToDOCXErrorHandler();
  }
  return globalPDFToDOCXErrorHandler;
}

/**
 * Create PDF to DOCX error
 */
function createPDFToDOCXError(message, type, details) {
  return new PDFToDOCXError(message, type, details);
}

/**
 * Handle PDF to DOCX error
 */
async function handlePDFToDOCXError(error, context) {
  const handler = getPDFToDOCXErrorHandler();
  return await handler.handleError(error, context);
}

module.exports = {
  PDFToDOCXError,
  PDFToDOCXErrorHandler,
  PDFToDOCXErrorTypes,
  PDFToDOCXErrorSeverity,
  PDFToDOCXRecoveryStrategies,
  getPDFToDOCXErrorHandler,
  createPDFToDOCXError,
  handlePDFToDOCXError
};