/**
 * Unified Conversion Service
 * Integrates all conversion engines (document, image, audio, video) into a single interface
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;
const { FormatConversionService } = require('./FormatConversionService');
const { ConversionType } = require('../types/jobEnums');
const { createConversionSettings } = require('../types/ConversionSettings');
const { logger } = require('../utils/logger');
const { ConversionErrorHandler, ConversionErrorTypes } = require('./ConversionErrorHandler');

class UnifiedConversionService extends EventEmitter {
  constructor() {
    super();
    
    // Initialize the format conversion service
    this.formatConversionService = new FormatConversionService();
    
    // Initialize error handler
    this.errorHandler = new ConversionErrorHandler();
    
    // Conversion progress tracking
    this.activeConversions = new Map();
    this.conversionQueue = [];
    this.maxConcurrentConversions = 3;
    
    // Statistics
    this.stats = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      totalProcessingTime: 0
    };
    
    // Bind event handlers
    this.formatConversionService.on('conversion-started', this.handleConversionStarted.bind(this));
    this.formatConversionService.on('conversion-progress', this.handleConversionProgress.bind(this));
    this.formatConversionService.on('conversion-completed', this.handleConversionCompleted.bind(this));
    this.formatConversionService.on('conversion-error', this.handleConversionError.bind(this));
    
    // Bind error handler events
    this.errorHandler.on('error', this.handleErrorEvent.bind(this));
    this.errorHandler.on('manualInterventionRequired', this.handleManualIntervention.bind(this));
    this.errorHandler.on('conversionAborted', this.handleConversionAborted.bind(this));
  }

  /**
   * Convert files using the appropriate conversion engine
   * @param {Object} conversionOptions - Conversion options
   * @returns {Promise<Object>} Conversion results
   */
  async convertFiles(conversionOptions) {
    const {
      jobs,
      outputConfig,
      batchSettings = {},
      preset,
      signal,
      progressCallback
    } = conversionOptions;

    const startTime = Date.now();
    const conversionId = this.generateConversionId();
    
    try {
      logger.info('Starting unified conversion', { 
        jobCount: jobs.length, 
        conversionId 
      });

      // Validate inputs
      this.validateConversionOptions(conversionOptions);
      
      // Process each job
      const results = [];
      const maxConcurrent = batchSettings.maxConcurrent || this.maxConcurrentConversions;
      
      // Process jobs in batches
      for (let i = 0; i < jobs.length; i += maxConcurrent) {
        const batch = jobs.slice(i, i + maxConcurrent);
        
        // Check for cancellation
        if (signal && signal.aborted) {
          throw new Error('Conversion cancelled');
        }
        
        // Process batch concurrently
        const batchPromises = batch.map(async (job, batchIndex) => {
          const jobIndex = i + batchIndex;
          return this.processConversionJob(job, jobIndex, jobs.length, progressCallback);
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process batch results
        batchResults.forEach((result, batchIndex) => {
          const jobIndex = i + batchIndex;
          if (result.status === 'fulfilled') {
            results[jobIndex] = result.value;
          } else {
            results[jobIndex] = {
              success: false,
              error: result.reason.message,
              jobIndex
            };
          }
        });
        
        // Update overall progress
        const progress = Math.round(((i + batch.length) / jobs.length) * 100);
        if (progressCallback) {
          progressCallback(progress);
        }
      }
      
      // Calculate statistics
      const processingTime = Date.now() - startTime;
      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;
      
      this.updateStats(successful, failed, processingTime);
      
      logger.info('Unified conversion completed', {
        conversionId,
        total: results.length,
        successful,
        failed,
        processingTime
      });
      
      return {
        success: true,
        results,
        summary: {
          total: results.length,
          successful,
          failed,
          processingTime,
          conversionId
        }
      };
      
    } catch (error) {
      logger.error('Unified conversion failed', { 
        conversionId, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message,
        conversionId
      };
    }
  }

  /**
   * Process a single conversion job
   * @param {Object} job - Conversion job
   * @param {number} jobIndex - Job index
   * @param {number} totalJobs - Total number of jobs
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Object>} Job result
   */
  async processConversionJob(job, jobIndex, totalJobs, progressCallback) {
    const {
      inputPath,
      outputFormat,
      fileType,
      settings
    } = job;
    
    const jobId = `${jobIndex}-${path.basename(inputPath)}`;
    
    try {
      logger.info('Processing conversion job', { 
        jobId, 
        inputPath, 
        outputFormat, 
        fileType 
      });
      
      // Generate output path
      const outputPath = this.generateOutputPath(inputPath, outputFormat);
      
      // Create conversion settings
      const conversionSettings = createConversionSettings(fileType, settings);
      
      // Perform conversion
      const result = await this.formatConversionService.convertFormat(
        inputPath,
        outputPath,
        outputFormat,
        {
          ...settings,
          conversionType: fileType,
          jobId,
          progressCallback: (progress) => {
            // Calculate overall progress including this job
            const jobProgress = (jobIndex / totalJobs) * 100;
            const currentJobProgress = (progress / 100) * (100 / totalJobs);
            const overallProgress = Math.round(jobProgress + currentJobProgress);
            
            if (progressCallback) {
              progressCallback(overallProgress);
            }
          }
        }
      );
      
      return {
        success: true,
        inputPath,
        outputPath,
        format: outputFormat,
        fileType,
        metadata: result.metadata,
        processingTime: result.processingTime,
        jobIndex
      };
      
    } catch (error) {
      logger.error('Conversion job failed', { 
        jobId, 
        inputPath, 
        error: error.message 
      });
      
      // Handle error with comprehensive error handling
      const conversionError = this.errorHandler.handleError(error, {
        jobId,
        inputPath,
        outputFormat,
        fileType,
        settings,
        jobIndex,
        totalJobs,
        conversionType: fileType
      });
      
      // Attempt recovery if error is retryable
      if (conversionError.retryable) {
        try {
          const recoveryResult = await this.errorHandler.attemptRecovery(conversionError, {
            jobId,
            inputPath,
            outputFormat,
            fileType,
            settings,
            jobIndex,
            totalJobs
          });
          
          if (recoveryResult.success) {
            logger.info('Recovery successful, retrying conversion', { jobId, strategy: recoveryResult.strategy });
            
            // Retry with modified settings if provided
            const retrySettings = recoveryResult.modifiedSettings || settings;
            const retryResult = await this.processConversionJob({
              ...job,
              settings: retrySettings
            }, jobIndex, totalJobs, progressCallback);
            
            return {
              ...retryResult,
              recovered: true,
              recoveryStrategy: recoveryResult.strategy
            };
          }
        } catch (recoveryError) {
          logger.error('Recovery attempt failed', { jobId, error: recoveryError.message });
        }
      }
      
      return {
        success: false,
        inputPath,
        error: conversionError.message,
        errorType: conversionError.type,
        errorSeverity: conversionError.severity,
        retryable: conversionError.retryable,
        userActionable: conversionError.userActionable,
        recoveryStrategies: conversionError.recoveryStrategies,
        jobIndex
      };
    }
  }

  /**
   * Generate output path for converted file
   * @param {string} inputPath - Input file path
   * @param {string} outputFormat - Output format
   * @returns {string} Output file path
   */
  generateOutputPath(inputPath, outputFormat) {
    const inputDir = path.dirname(inputPath);
    const inputName = path.basename(inputPath, path.extname(inputPath));
    return path.join(inputDir, `${inputName}.${outputFormat}`);
  }

  /**
   * Validate conversion options
   * @param {Object} options - Conversion options
   */
  validateConversionOptions(options) {
    const { jobs, outputConfig } = options;
    
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      throw new Error('No conversion jobs provided');
    }
    
    jobs.forEach((job, index) => {
      if (!job.inputPath) {
        throw new Error(`Job ${index}: Missing input path`);
      }
      if (!job.outputFormat) {
        throw new Error(`Job ${index}: Missing output format`);
      }
      if (!job.fileType) {
        throw new Error(`Job ${index}: Missing file type`);
      }
    });
    
    if (!outputConfig || !outputConfig.outputDirectory) {
      throw new Error('Output directory not specified');
    }
  }

  /**
   * Generate unique conversion ID
   * @returns {string} Conversion ID
   */
  generateConversionId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update conversion statistics
   * @param {number} successful - Number of successful conversions
   * @param {number} failed - Number of failed conversions
   * @param {number} processingTime - Processing time in milliseconds
   */
  updateStats(successful, failed, processingTime) {
    this.stats.totalConversions += successful + failed;
    this.stats.successfulConversions += successful;
    this.stats.failedConversions += failed;
    this.stats.totalProcessingTime += processingTime;
  }

  /**
   * Get conversion statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageProcessingTime: this.stats.totalConversions > 0 
        ? this.stats.totalProcessingTime / this.stats.totalConversions 
        : 0,
      successRate: this.stats.totalConversions > 0 
        ? (this.stats.successfulConversions / this.stats.totalConversions) * 100 
        : 0
    };
  }

  /**
   * Handle conversion started event
   * @param {Object} data - Event data
   */
  handleConversionStarted(data) {
    this.emit('conversion-started', data);
  }

  /**
   * Handle conversion progress event
   * @param {Object} data - Event data
   */
  handleConversionProgress(data) {
    this.emit('conversion-progress', data);
  }

  /**
   * Handle conversion completed event
   * @param {Object} data - Event data
   */
  handleConversionCompleted(data) {
    this.emit('conversion-completed', data);
  }

  /**
   * Handle conversion error event
   * @param {Object} data - Event data
   */
  handleConversionError(data) {
    this.emit('conversion-error', data);
  }

  /**
   * Handle error events from the error handler
   * @param {Object} data - Event data
   */
  handleErrorEvent(data) {
    this.emit('error', data);
  }

  /**
   * Handle manual intervention required event from the error handler
   * @param {Object} data - Event data
   */
  handleManualIntervention(data) {
    this.emit('manualInterventionRequired', data);
  }

  /**
   * Handle conversion aborted event from the error handler
   * @param {Object} data - Event data
   */
  handleConversionAborted(data) {
    this.emit('conversionAborted', data);
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  /**
   * Clear error history
   */
  clearErrorHistory() {
    this.errorHandler.clearErrorHistory();
  }

  /**
   * Get supported formats for a file type
   * @param {string} fileType - File type
   * @returns {Array} Supported formats
   */
  getSupportedFormats(fileType) {
    switch (fileType) {
      case ConversionType.DOCUMENT:
        return ['pdf', 'docx', 'doc', 'txt', 'rtf', 'odt'];
      case ConversionType.IMAGE:
        return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'svg'];
      case ConversionType.AUDIO:
        return ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
      case ConversionType.VIDEO:
        return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'];
      default:
        return [];
    }
  }

  /**
   * Detect file type from file path
   * @param {string} filePath - File path
   * @returns {string} File type
   */
  detectFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase().substring(1);
    
    const typeMap = {
      // Documents
      'pdf': ConversionType.DOCUMENT,
      'docx': ConversionType.DOCUMENT,
      'doc': ConversionType.DOCUMENT,
      'txt': ConversionType.DOCUMENT,
      'rtf': ConversionType.DOCUMENT,
      'odt': ConversionType.DOCUMENT,
      
      // Images
      'jpg': ConversionType.IMAGE,
      'jpeg': ConversionType.IMAGE,
      'png': ConversionType.IMAGE,
      'webp': ConversionType.IMAGE,
      'gif': ConversionType.IMAGE,
      'bmp': ConversionType.IMAGE,
      'tiff': ConversionType.IMAGE,
      'svg': ConversionType.IMAGE,
      
      // Audio
      'mp3': ConversionType.AUDIO,
      'wav': ConversionType.AUDIO,
      'flac': ConversionType.AUDIO,
      'aac': ConversionType.AUDIO,
      'ogg': ConversionType.AUDIO,
      'm4a': ConversionType.AUDIO,
      
      // Video
      'mp4': ConversionType.VIDEO,
      'mov': ConversionType.VIDEO,
      'avi': ConversionType.VIDEO,
      'mkv': ConversionType.VIDEO,
      'webm': ConversionType.VIDEO,
      'wmv': ConversionType.VIDEO
    };
    
    return typeMap[ext] || 'unknown';
  }

  /**
   * Cancel active conversions
   * @param {string} conversionId - Conversion ID to cancel (optional)
   */
  cancelConversions(conversionId = null) {
    if (conversionId) {
      // Cancel specific conversion
      this.formatConversionService.cancelConversion(conversionId);
    } else {
      // Cancel all active conversions
      this.formatConversionService.cancelAllConversions();
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.formatConversionService.cleanup();
    this.activeConversions.clear();
    this.conversionQueue = [];
  }
}

// Create singleton instance
const unifiedConversionService = new UnifiedConversionService();

module.exports = {
  UnifiedConversionService,
  unifiedConversionService
};
