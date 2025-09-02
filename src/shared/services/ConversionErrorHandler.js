/**
 * Comprehensive Conversion Error Handler
 * Handles errors for all conversion types (audio, video, document, image)
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;

/**
 * Conversion error types
 */
const ConversionErrorTypes = {
  // File system errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_CORRUPTED: 'FILE_CORRUPTED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  DISK_SPACE_INSUFFICIENT: 'DISK_SPACE_INSUFFICIENT',
  OUTPUT_PATH_INVALID: 'OUTPUT_PATH_INVALID',
  
  // Format errors
  UNSUPPORTED_INPUT_FORMAT: 'UNSUPPORTED_INPUT_FORMAT',
  UNSUPPORTED_OUTPUT_FORMAT: 'UNSUPPORTED_OUTPUT_FORMAT',
  INCOMPATIBLE_FORMATS: 'INCOMPATIBLE_FORMATS',
  FORMAT_DETECTION_FAILED: 'FORMAT_DETECTION_FAILED',
  
  // Conversion engine errors
  CONVERSION_ENGINE_ERROR: 'CONVERSION_ENGINE_ERROR',
  FFMPEG_ERROR: 'FFMPEG_ERROR',
  SHARP_ERROR: 'SHARP_ERROR',
  LIBREOFFICE_ERROR: 'LIBREOFFICE_ERROR',
  PANDOC_ERROR: 'PANDOC_ERROR',
  
  // Processing errors
  PROCESSING_TIMEOUT: 'PROCESSING_TIMEOUT',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  CPU_LIMIT_EXCEEDED: 'CPU_LIMIT_EXCEEDED',
  CONCURRENT_LIMIT_EXCEEDED: 'CONCURRENT_LIMIT_EXCEEDED',
  
  // Quality and validation errors
  QUALITY_CHECK_FAILED: 'QUALITY_CHECK_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  METADATA_EXTRACTION_FAILED: 'METADATA_EXTRACTION_FAILED',
  
  // Audio-specific errors
  AUDIO_CODEC_ERROR: 'AUDIO_CODEC_ERROR',
  AUDIO_BITRATE_ERROR: 'AUDIO_BITRATE_ERROR',
  AUDIO_SAMPLE_RATE_ERROR: 'AUDIO_SAMPLE_RATE_ERROR',
  AUDIO_CHANNEL_ERROR: 'AUDIO_CHANNEL_ERROR',
  AUDIO_DURATION_ERROR: 'AUDIO_DURATION_ERROR',
  
  // Video-specific errors
  VIDEO_CODEC_ERROR: 'VIDEO_CODEC_ERROR',
  VIDEO_FRAME_RATE_ERROR: 'VIDEO_FRAME_RATE_ERROR',
  VIDEO_RESOLUTION_ERROR: 'VIDEO_RESOLUTION_ERROR',
  VIDEO_BITRATE_ERROR: 'VIDEO_BITRATE_ERROR',
  VIDEO_DURATION_ERROR: 'VIDEO_DURATION_ERROR',
  
  // Document-specific errors
  DOCUMENT_PARSE_ERROR: 'DOCUMENT_PARSE_ERROR',
  DOCUMENT_ENCRYPTED: 'DOCUMENT_ENCRYPTED',
  DOCUMENT_PASSWORD_REQUIRED: 'DOCUMENT_PASSWORD_REQUIRED',
  DOCUMENT_CORRUPTED: 'DOCUMENT_CORRUPTED',
  DOCUMENT_TOO_COMPLEX: 'DOCUMENT_TOO_COMPLEX',
  
  // Image-specific errors
  IMAGE_CORRUPTED: 'IMAGE_CORRUPTED',
  IMAGE_RESOLUTION_TOO_HIGH: 'IMAGE_RESOLUTION_TOO_HIGH',
  IMAGE_COLOR_SPACE_ERROR: 'IMAGE_COLOR_SPACE_ERROR',
  IMAGE_FORMAT_UNSUPPORTED: 'IMAGE_FORMAT_UNSUPPORTED',
  
  // Network and external service errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  API_LIMIT_EXCEEDED: 'API_LIMIT_EXCEEDED',
  
  // System errors
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  TEMPORARY_FILE_ERROR: 'TEMPORARY_FILE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  
  // User cancellation
  USER_CANCELLED: 'USER_CANCELLED',
  
  // Unknown errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Error severity levels
 */
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Recovery strategies
 */
const RecoveryStrategies = {
  RETRY: 'retry',
  RETRY_WITH_DIFFERENT_SETTINGS: 'retry_with_different_settings',
  FALLBACK_FORMAT: 'fallback_format',
  REDUCE_QUALITY: 'reduce_quality',
  SPLIT_FILE: 'split_file',
  SKIP_FILE: 'skip_file',
  MANUAL_INTERVENTION: 'manual_intervention',
  ABORT_CONVERSION: 'abort_conversion'
};

/**
 * Conversion Error class
 */
class ConversionError extends Error {
  constructor(message, type = ConversionErrorTypes.UNKNOWN_ERROR, severity = ErrorSeverity.MEDIUM, context = {}) {
    super(message);
    this.name = 'ConversionError';
    this.type = type;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.recoveryStrategies = this.getRecoveryStrategies(type);
    this.retryable = this.isRetryable(type);
    this.userActionable = this.isUserActionable(type);
  }

  /**
   * Get recovery strategies for error type
   */
  getRecoveryStrategies(type) {
    const strategyMap = {
      [ConversionErrorTypes.FILE_NOT_FOUND]: [RecoveryStrategies.MANUAL_INTERVENTION],
      [ConversionErrorTypes.FILE_ACCESS_DENIED]: [RecoveryStrategies.MANUAL_INTERVENTION],
      [ConversionErrorTypes.FILE_CORRUPTED]: [RecoveryStrategies.SKIP_FILE],
      [ConversionErrorTypes.FILE_TOO_LARGE]: [RecoveryStrategies.SPLIT_FILE, RecoveryStrategies.REDUCE_QUALITY],
      [ConversionErrorTypes.DISK_SPACE_INSUFFICIENT]: [RecoveryStrategies.MANUAL_INTERVENTION],
      [ConversionErrorTypes.UNSUPPORTED_INPUT_FORMAT]: [RecoveryStrategies.FALLBACK_FORMAT, RecoveryStrategies.SKIP_FILE],
      [ConversionErrorTypes.UNSUPPORTED_OUTPUT_FORMAT]: [RecoveryStrategies.FALLBACK_FORMAT],
      [ConversionErrorTypes.CONVERSION_ENGINE_ERROR]: [RecoveryStrategies.RETRY, RecoveryStrategies.RETRY_WITH_DIFFERENT_SETTINGS],
      [ConversionErrorTypes.PROCESSING_TIMEOUT]: [RecoveryStrategies.RETRY, RecoveryStrategies.REDUCE_QUALITY],
      [ConversionErrorTypes.MEMORY_LIMIT_EXCEEDED]: [RecoveryStrategies.REDUCE_QUALITY, RecoveryStrategies.SPLIT_FILE],
      [ConversionErrorTypes.AUDIO_CODEC_ERROR]: [RecoveryStrategies.RETRY_WITH_DIFFERENT_SETTINGS, RecoveryStrategies.FALLBACK_FORMAT],
      [ConversionErrorTypes.VIDEO_CODEC_ERROR]: [RecoveryStrategies.RETRY_WITH_DIFFERENT_SETTINGS, RecoveryStrategies.FALLBACK_FORMAT],
      [ConversionErrorTypes.DOCUMENT_ENCRYPTED]: [RecoveryStrategies.MANUAL_INTERVENTION],
      [ConversionErrorTypes.DOCUMENT_PASSWORD_REQUIRED]: [RecoveryStrategies.MANUAL_INTERVENTION],
      [ConversionErrorTypes.IMAGE_CORRUPTED]: [RecoveryStrategies.SKIP_FILE],
      [ConversionErrorTypes.USER_CANCELLED]: [RecoveryStrategies.ABORT_CONVERSION],
      [ConversionErrorTypes.UNKNOWN_ERROR]: [RecoveryStrategies.RETRY, RecoveryStrategies.MANUAL_INTERVENTION]
    };

    return strategyMap[type] || [RecoveryStrategies.MANUAL_INTERVENTION];
  }

  /**
   * Check if error is retryable
   */
  isRetryable(type) {
    const retryableErrors = [
      ConversionErrorTypes.CONVERSION_ENGINE_ERROR,
      ConversionErrorTypes.PROCESSING_TIMEOUT,
      ConversionErrorTypes.NETWORK_ERROR,
      ConversionErrorTypes.EXTERNAL_SERVICE_ERROR,
      ConversionErrorTypes.API_LIMIT_EXCEEDED,
      ConversionErrorTypes.TEMPORARY_FILE_ERROR,
      ConversionErrorTypes.UNKNOWN_ERROR
    ];

    return retryableErrors.includes(type);
  }

  /**
   * Check if error requires user action
   */
  isUserActionable(type) {
    const userActionableErrors = [
      ConversionErrorTypes.FILE_NOT_FOUND,
      ConversionErrorTypes.FILE_ACCESS_DENIED,
      ConversionErrorTypes.DISK_SPACE_INSUFFICIENT,
      ConversionErrorTypes.DOCUMENT_ENCRYPTED,
      ConversionErrorTypes.DOCUMENT_PASSWORD_REQUIRED,
      ConversionErrorTypes.UNSUPPORTED_INPUT_FORMAT,
      ConversionErrorTypes.UNSUPPORTED_OUTPUT_FORMAT
    ];

    return userActionableErrors.includes(type);
  }

  /**
   * Convert to plain object
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      recoveryStrategies: this.recoveryStrategies,
      retryable: this.retryable,
      userActionable: this.userActionable,
      stack: this.stack
    };
  }
}

/**
 * Conversion Error Handler class
 */
class ConversionErrorHandler extends EventEmitter {
  constructor() {
    super();
    this.errorHistory = new Map();
    this.recoveryAttempts = new Map();
    this.maxRecoveryAttempts = 3;
  }

  /**
   * Handle conversion error
   * @param {Error} error - Original error
   * @param {Object} context - Error context
   * @returns {ConversionError} Processed error
   */
  handleError(error, context = {}) {
    const conversionError = this.createConversionError(error, context);
    
    // Store error in history
    this.errorHistory.set(conversionError.timestamp, conversionError);
    
    // Emit error event
    this.emit('error', conversionError);
    
    // Log error
    this.logError(conversionError);
    
    return conversionError;
  }

  /**
   * Create conversion error from original error
   * @param {Error} error - Original error
   * @param {Object} context - Error context
   * @returns {ConversionError} Conversion error
   */
  createConversionError(error, context) {
    const type = this.classifyError(error, context);
    const severity = this.determineSeverity(type, context);
    
    return new ConversionError(
      error.message || 'Unknown conversion error',
      type,
      severity,
      {
        originalError: error,
        ...context
      }
    );
  }

  /**
   * Classify error type based on error message and context
   * @param {Error} error - Original error
   * @param {Object} context - Error context
   * @returns {string} Error type
   */
  classifyError(error, context) {
    const message = (error.message || '').toLowerCase();
    const conversionType = context.conversionType || 'unknown';
    const filePath = context.filePath || '';

    // File system errors
    if (message.includes('no such file') || message.includes('file not found')) {
      return ConversionErrorTypes.FILE_NOT_FOUND;
    }
    if (message.includes('permission denied') || message.includes('access denied')) {
      return ConversionErrorTypes.FILE_ACCESS_DENIED;
    }
    if (message.includes('corrupt') || message.includes('malformed')) {
      return ConversionErrorTypes.FILE_CORRUPTED;
    }
    if (message.includes('file too large') || message.includes('size limit')) {
      return ConversionErrorTypes.FILE_TOO_LARGE;
    }
    if (message.includes('disk space') || message.includes('no space left')) {
      return ConversionErrorTypes.DISK_SPACE_INSUFFICIENT;
    }

    // Format errors
    if (message.includes('unsupported format') || message.includes('format not supported')) {
      return ConversionErrorTypes.UNSUPPORTED_INPUT_FORMAT;
    }
    if (message.includes('incompatible format')) {
      return ConversionErrorTypes.INCOMPATIBLE_FORMATS;
    }

    // Engine-specific errors
    if (message.includes('ffmpeg') || message.includes('ffprobe')) {
      return ConversionErrorTypes.FFMPEG_ERROR;
    }
    if (message.includes('sharp') || message.includes('image processing')) {
      return ConversionErrorTypes.SHARP_ERROR;
    }
    if (message.includes('libreoffice') || message.includes('soffice')) {
      return ConversionErrorTypes.LIBREOFFICE_ERROR;
    }
    if (message.includes('pandoc')) {
      return ConversionErrorTypes.PANDOC_ERROR;
    }

    // Processing errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return ConversionErrorTypes.PROCESSING_TIMEOUT;
    }
    if (message.includes('memory') || message.includes('heap') || message.includes('out of memory')) {
      return ConversionErrorTypes.MEMORY_LIMIT_EXCEEDED;
    }
    if (message.includes('cpu') || message.includes('resource limit')) {
      return ConversionErrorTypes.CPU_LIMIT_EXCEEDED;
    }

    // Conversion type specific errors
    if (conversionType === 'audio') {
      if (message.includes('codec') || message.includes('encoder')) {
        return ConversionErrorTypes.AUDIO_CODEC_ERROR;
      }
      if (message.includes('bitrate')) {
        return ConversionErrorTypes.AUDIO_BITRATE_ERROR;
      }
      if (message.includes('sample rate')) {
        return ConversionErrorTypes.AUDIO_SAMPLE_RATE_ERROR;
      }
    }

    if (conversionType === 'video') {
      if (message.includes('codec') || message.includes('encoder')) {
        return ConversionErrorTypes.VIDEO_CODEC_ERROR;
      }
      if (message.includes('frame rate')) {
        return ConversionErrorTypes.VIDEO_FRAME_RATE_ERROR;
      }
      if (message.includes('resolution')) {
        return ConversionErrorTypes.VIDEO_RESOLUTION_ERROR;
      }
    }

    if (conversionType === 'document') {
      if (message.includes('encrypted') || message.includes('password')) {
        return ConversionErrorTypes.DOCUMENT_ENCRYPTED;
      }
      if (message.includes('parse') || message.includes('read')) {
        return ConversionErrorTypes.DOCUMENT_PARSE_ERROR;
      }
    }

    if (conversionType === 'image') {
      if (message.includes('corrupt') || message.includes('invalid image')) {
        return ConversionErrorTypes.IMAGE_CORRUPTED;
      }
      if (message.includes('resolution') || message.includes('dimensions')) {
        return ConversionErrorTypes.IMAGE_RESOLUTION_TOO_HIGH;
      }
    }

    // Network errors
    if (message.includes('network') || message.includes('connection')) {
      return ConversionErrorTypes.NETWORK_ERROR;
    }

    // User cancellation
    if (message.includes('cancelled') || message.includes('aborted')) {
      return ConversionErrorTypes.USER_CANCELLED;
    }

    return ConversionErrorTypes.UNKNOWN_ERROR;
  }

  /**
   * Determine error severity
   * @param {string} type - Error type
   * @param {Object} context - Error context
   * @returns {string} Error severity
   */
  determineSeverity(type, context) {
    const criticalErrors = [
      ConversionErrorTypes.MEMORY_LIMIT_EXCEEDED,
      ConversionErrorTypes.DISK_SPACE_INSUFFICIENT,
      ConversionErrorTypes.FILE_ACCESS_DENIED
    ];

    const highErrors = [
      ConversionErrorTypes.FILE_CORRUPTED,
      ConversionErrorTypes.DOCUMENT_ENCRYPTED,
      ConversionErrorTypes.UNSUPPORTED_INPUT_FORMAT,
      ConversionErrorTypes.CONVERSION_ENGINE_ERROR
    ];

    if (criticalErrors.includes(type)) {
      return ErrorSeverity.CRITICAL;
    }
    if (highErrors.includes(type)) {
      return ErrorSeverity.HIGH;
    }
    if (type === ConversionErrorTypes.USER_CANCELLED) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  /**
   * Attempt error recovery
   * @param {ConversionError} error - Conversion error
   * @param {Object} context - Recovery context
   * @returns {Promise<Object>} Recovery result
   */
  async attemptRecovery(error, context = {}) {
    const jobId = context.jobId;
    const attempts = this.recoveryAttempts.get(jobId) || 0;

    if (attempts >= this.maxRecoveryAttempts) {
      return {
        success: false,
        error: 'Maximum recovery attempts exceeded',
        strategy: null
      };
    }

    // Increment attempts
    this.recoveryAttempts.set(jobId, attempts + 1);

    // Try recovery strategies in order
    for (const strategy of error.recoveryStrategies) {
      try {
        const result = await this.executeRecoveryStrategy(strategy, error, context);
        if (result.success) {
          return result;
        }
      } catch (recoveryError) {
        console.error(`Recovery strategy ${strategy} failed:`, recoveryError);
      }
    }

    return {
      success: false,
      error: 'All recovery strategies failed',
      strategy: null
    };
  }

  /**
   * Execute recovery strategy
   * @param {string} strategy - Recovery strategy
   * @param {ConversionError} error - Conversion error
   * @param {Object} context - Recovery context
   * @returns {Promise<Object>} Strategy result
   */
  async executeRecoveryStrategy(strategy, error, context) {
    switch (strategy) {
      case RecoveryStrategies.RETRY:
        return this.retryConversion(context);
      
      case RecoveryStrategies.RETRY_WITH_DIFFERENT_SETTINGS:
        return this.retryWithDifferentSettings(context);
      
      case RecoveryStrategies.FALLBACK_FORMAT:
        return this.tryFallbackFormat(context);
      
      case RecoveryStrategies.REDUCE_QUALITY:
        return this.reduceQuality(context);
      
      case RecoveryStrategies.SPLIT_FILE:
        return this.splitFile(context);
      
      case RecoveryStrategies.SKIP_FILE:
        return this.skipFile(context);
      
      case RecoveryStrategies.MANUAL_INTERVENTION:
        return this.requestManualIntervention(error, context);
      
      case RecoveryStrategies.ABORT_CONVERSION:
        return this.abortConversion(context);
      
      default:
        return { success: false, error: 'Unknown recovery strategy' };
    }
  }

  /**
   * Retry conversion
   */
  async retryConversion(context) {
    // This would be implemented by the calling code
    return { success: true, strategy: RecoveryStrategies.RETRY };
  }

  /**
   * Retry with different settings
   */
  async retryWithDifferentSettings(context) {
    // Modify settings and retry
    const modifiedSettings = this.getModifiedSettings(context.settings, context.conversionType);
    return { 
      success: true, 
      strategy: RecoveryStrategies.RETRY_WITH_DIFFERENT_SETTINGS,
      modifiedSettings 
    };
  }

  /**
   * Try fallback format
   */
  async tryFallbackFormat(context) {
    const fallbackFormat = this.getFallbackFormat(context.outputFormat, context.conversionType);
    return { 
      success: true, 
      strategy: RecoveryStrategies.FALLBACK_FORMAT,
      fallbackFormat 
    };
  }

  /**
   * Reduce quality
   */
  async reduceQuality(context) {
    const reducedSettings = this.getReducedQualitySettings(context.settings, context.conversionType);
    return { 
      success: true, 
      strategy: RecoveryStrategies.REDUCE_QUALITY,
      reducedSettings 
    };
  }

  /**
   * Split file
   */
  async splitFile(context) {
    // This would split large files into smaller chunks
    return { success: true, strategy: RecoveryStrategies.SPLIT_FILE };
  }

  /**
   * Skip file
   */
  async skipFile(context) {
    return { success: true, strategy: RecoveryStrategies.SKIP_FILE };
  }

  /**
   * Request manual intervention
   */
  async requestManualIntervention(error, context) {
    this.emit('manualInterventionRequired', { error, context });
    return { success: false, strategy: RecoveryStrategies.MANUAL_INTERVENTION };
  }

  /**
   * Abort conversion
   */
  async abortConversion(context) {
    this.emit('conversionAborted', { context });
    return { success: false, strategy: RecoveryStrategies.ABORT_CONVERSION };
  }

  /**
   * Get modified settings for retry
   */
  getModifiedSettings(settings, conversionType) {
    const modified = { ...settings };
    
    switch (conversionType) {
      case 'audio':
        modified.bitrate = Math.floor(parseInt(settings.bitrate || '320') * 0.8);
        modified.sampleRate = '22050';
        break;
      case 'video':
        modified.videoQuality = 'medium';
        modified.frameRate = '24';
        break;
      case 'image':
        modified.quality = 'medium';
        modified.compression = 'high';
        break;
      case 'document':
        modified.dpi = Math.floor(parseInt(settings.dpi || '300') * 0.7);
        break;
    }
    
    return modified;
  }

  /**
   * Get fallback format
   */
  getFallbackFormat(outputFormat, conversionType) {
    const fallbackMap = {
      audio: {
        'aac': 'mp3',
        'flac': 'wav',
        'ogg': 'mp3'
      },
      video: {
        'webm': 'mp4',
        'mkv': 'mp4',
        'avi': 'mp4'
      },
      image: {
        'webp': 'png',
        'tiff': 'jpeg',
        'bmp': 'jpeg'
      },
      document: {
        'odt': 'docx',
        'rtf': 'txt'
      }
    };

    return fallbackMap[conversionType]?.[outputFormat] || outputFormat;
  }

  /**
   * Get reduced quality settings
   */
  getReducedQualitySettings(settings, conversionType) {
    const reduced = { ...settings };
    
    switch (conversionType) {
      case 'audio':
        reduced.bitrate = '128';
        reduced.sampleRate = '22050';
        reduced.channels = 'mono';
        break;
      case 'video':
        reduced.videoQuality = 'low';
        reduced.frameRate = '15';
        reduced.videoBitrate = '500k';
        break;
      case 'image':
        reduced.quality = 'low';
        reduced.compression = 'high';
        reduced.resolution = 'medium';
        break;
      case 'document':
        reduced.dpi = '150';
        break;
    }
    
    return reduced;
  }

  /**
   * Log error
   */
  logError(error) {
    console.error('Conversion Error:', {
      type: error.type,
      severity: error.severity,
      message: error.message,
      context: error.context,
      recoveryStrategies: error.recoveryStrategies,
      retryable: error.retryable,
      userActionable: error.userActionable
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      total: this.errorHistory.size,
      byType: {},
      bySeverity: {},
      retryable: 0,
      userActionable: 0
    };

    for (const error of this.errorHistory.values()) {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
      if (error.retryable) stats.retryable++;
      if (error.userActionable) stats.userActionable++;
    }

    return stats;
  }

  /**
   * Clear error history
   */
  clearErrorHistory() {
    this.errorHistory.clear();
    this.recoveryAttempts.clear();
  }
}

module.exports = {
  ConversionError,
  ConversionErrorHandler,
  ConversionErrorTypes,
  ErrorSeverity,
  RecoveryStrategies
};
