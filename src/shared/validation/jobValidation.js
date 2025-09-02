import {
  ConversionType,
  JobStatus,
  JobPriority,
  getSupportedFormats,
  isValidFormat
} from '../types/jobEnums.js';
import { ConversionSettings } from '../types/ConversionSettings.js';
import path from 'path';
import fs from 'fs';

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message, field = null, code = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
  }
}

/**
 * File validation utilities
 */
export class FileValidator {
  /**
   * Check if file exists and is accessible
   */
  static async validateFileExists(filePath) {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch (error) {
      throw new ValidationError(`File does not exist: ${filePath}`, 'sourceFile', 'FILE_NOT_FOUND');
    }
  }

  /**
   * Check if file is readable
   */
  static async validateFileReadable(filePath) {
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      return true;
    } catch (error) {
      throw new ValidationError(`File is not readable: ${filePath}`, 'sourceFile', 'FILE_NOT_READABLE');
    }
  }

  /**
   * Get file size and validate it's not empty
   */
  static async validateFileSize(filePath, maxSize = null) {
    try {
      const stats = await fs.promises.stat(filePath);
      
      if (stats.size === 0) {
        throw new ValidationError(`File is empty: ${filePath}`, 'sourceFile', 'FILE_EMPTY');
      }
      
      if (maxSize && stats.size > maxSize) {
        const maxSizeMB = Math.round(maxSize / (1024 * 1024));
        const fileSizeMB = Math.round(stats.size / (1024 * 1024));
        throw new ValidationError(
          `File size (${fileSizeMB}MB) exceeds maximum allowed size (${maxSizeMB}MB)`,
          'sourceFile',
          'FILE_TOO_LARGE'
        );
      }
      
      return stats.size;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`Cannot access file: ${filePath}`, 'sourceFile', 'FILE_ACCESS_ERROR');
    }
  }

  /**
   * Validate file extension matches expected format
   */
  static validateFileExtension(filePath, expectedFormat) {
    const extension = path.extname(filePath).toLowerCase().slice(1);
    
    if (!extension) {
      throw new ValidationError(
        `File has no extension: ${filePath}`,
        'sourceFile',
        'NO_FILE_EXTENSION'
      );
    }
    
    // Handle special cases where format names don't match extensions
    const formatExtensionMap = {
      'jpeg': ['jpg', 'jpeg'],
      'tiff': ['tif', 'tiff'],
      'mpeg': ['mpg', 'mpeg'],
      'quicktime': ['mov', 'qt']
    };
    
    const validExtensions = formatExtensionMap[expectedFormat.toLowerCase()] || [expectedFormat.toLowerCase()];
    
    if (!validExtensions.includes(extension)) {
      throw new ValidationError(
        `File extension '${extension}' does not match expected format '${expectedFormat}'`,
        'sourceFile',
        'EXTENSION_MISMATCH'
      );
    }
    
    return true;
  }

  /**
   * Validate output directory is writable
   */
  static async validateOutputPath(outputPath) {
    if (!outputPath) return true;
    
    const outputDir = path.dirname(outputPath);
    
    try {
      await fs.promises.access(outputDir, fs.constants.W_OK);
      return true;
    } catch (error) {
      throw new ValidationError(
        `Output directory is not writable: ${outputDir}`,
        'outputPath',
        'OUTPUT_NOT_WRITABLE'
      );
    }
  }

  /**
   * Check if output file already exists
   */
  static async validateOutputNotExists(outputPath, allowOverwrite = false) {
    if (!outputPath) return true;
    
    try {
      await fs.promises.access(outputPath, fs.constants.F_OK);
      
      if (!allowOverwrite) {
        throw new ValidationError(
          `Output file already exists: ${outputPath}`,
          'outputPath',
          'OUTPUT_EXISTS'
        );
      }
      
      return true;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      // File doesn't exist, which is good
      return true;
    }
  }
}

/**
 * Job parameter validation utilities
 */
export class JobParameterValidator {
  /**
   * Validate job priority
   */
  static validatePriority(priority) {
    if (!Object.values(JobPriority).includes(priority)) {
      throw new ValidationError(
        `Invalid priority '${priority}'. Must be one of: ${Object.values(JobPriority).join(', ')}`,
        'priority',
        'INVALID_PRIORITY'
      );
    }
    return true;
  }

  /**
   * Validate job status
   */
  static validateStatus(status) {
    if (!Object.values(JobStatus).includes(status)) {
      throw new ValidationError(
        `Invalid status '${status}'. Must be one of: ${Object.values(JobStatus).join(', ')}`,
        'status',
        'INVALID_STATUS'
      );
    }
    return true;
  }

  /**
   * Validate conversion type
   */
  static validateConversionType(conversionType) {
    if (!Object.values(ConversionType).includes(conversionType)) {
      throw new ValidationError(
        `Invalid conversion type '${conversionType}'. Must be one of: ${Object.values(ConversionType).join(', ')}`,
        'conversionType',
        'INVALID_CONVERSION_TYPE'
      );
    }
    return true;
  }

  /**
   * Validate format for conversion type
   */
  static validateFormat(format, conversionType, fieldName = 'format') {
    if (!isValidFormat(format, conversionType)) {
      const supportedFormats = getSupportedFormats(conversionType);
      throw new ValidationError(
        `Invalid ${fieldName} '${format}' for ${conversionType}. Supported formats: ${supportedFormats.join(', ')}`,
        fieldName,
        'INVALID_FORMAT'
      );
    }
    return true;
  }

  /**
   * Validate retry configuration
   */
  static validateRetryConfig(retryCount, maxRetries) {
    if (typeof retryCount !== 'number' || retryCount < 0) {
      throw new ValidationError(
        'Retry count must be a non-negative number',
        'retryCount',
        'INVALID_RETRY_COUNT'
      );
    }
    
    if (typeof maxRetries !== 'number' || maxRetries < 0) {
      throw new ValidationError(
        'Max retries must be a non-negative number',
        'maxRetries',
        'INVALID_MAX_RETRIES'
      );
    }
    
    if (retryCount > maxRetries) {
      throw new ValidationError(
        'Retry count cannot exceed max retries',
        'retryCount',
        'RETRY_COUNT_EXCEEDS_MAX'
      );
    }
    
    return true;
  }

  /**
   * Validate dependencies array
   */
  static validateDependencies(dependencies) {
    if (!Array.isArray(dependencies)) {
      throw new ValidationError(
        'Dependencies must be an array',
        'dependencies',
        'INVALID_DEPENDENCIES_TYPE'
      );
    }
    
    for (const dep of dependencies) {
      if (typeof dep !== 'string' || dep.trim() === '') {
        throw new ValidationError(
          'Each dependency must be a non-empty string',
          'dependencies',
          'INVALID_DEPENDENCY_ID'
        );
      }
    }
    
    // Check for duplicate dependencies
    const uniqueDeps = new Set(dependencies);
    if (uniqueDeps.size !== dependencies.length) {
      throw new ValidationError(
        'Dependencies array contains duplicates',
        'dependencies',
        'DUPLICATE_DEPENDENCIES'
      );
    }
    
    return true;
  }

  /**
   * Validate metadata object
   */
  static validateMetadata(metadata) {
    if (metadata !== null && typeof metadata !== 'object') {
      throw new ValidationError(
        'Metadata must be an object or null',
        'metadata',
        'INVALID_METADATA_TYPE'
      );
    }
    
    if (metadata) {
      // Check for circular references
      try {
        JSON.stringify(metadata);
      } catch (error) {
        throw new ValidationError(
          'Metadata contains circular references or non-serializable values',
          'metadata',
          'METADATA_NOT_SERIALIZABLE'
        );
      }
    }
    
    return true;
  }
}

/**
 * Settings-specific validation
 */
export class SettingsValidator {
  /**
   * Validate quality setting
   */
  static validateQuality(quality) {
    const validQualities = ['low', 'medium', 'high', 'maximum'];
    if (!validQualities.includes(quality)) {
      throw new ValidationError(
        `Invalid quality '${quality}'. Must be one of: ${validQualities.join(', ')}`,
        'quality',
        'INVALID_QUALITY'
      );
    }
    return true;
  }

  /**
   * Validate image dimensions
   */
  static validateImageDimensions(width, height) {
    if (width !== null && (typeof width !== 'number' || width <= 0)) {
      throw new ValidationError(
        'Width must be a positive number or null',
        'width',
        'INVALID_WIDTH'
      );
    }
    
    if (height !== null && (typeof height !== 'number' || height <= 0)) {
      throw new ValidationError(
        'Height must be a positive number or null',
        'height',
        'INVALID_HEIGHT'
      );
    }
    
    // Check for reasonable maximum dimensions
    const maxDimension = 50000; // 50k pixels
    if (width > maxDimension || height > maxDimension) {
      throw new ValidationError(
        `Dimensions cannot exceed ${maxDimension} pixels`,
        'dimensions',
        'DIMENSIONS_TOO_LARGE'
      );
    }
    
    return true;
  }

  /**
   * Validate audio settings
   */
  static validateAudioSettings({ bitrate, sampleRate, channels }) {
    if (bitrate !== null && (typeof bitrate !== 'number' || bitrate <= 0)) {
      throw new ValidationError(
        'Bitrate must be a positive number',
        'bitrate',
        'INVALID_BITRATE'
      );
    }
    
    const validSampleRates = [8000, 11025, 16000, 22050, 44100, 48000, 96000, 192000];
    if (sampleRate !== null && !validSampleRates.includes(sampleRate)) {
      throw new ValidationError(
        `Invalid sample rate '${sampleRate}'. Must be one of: ${validSampleRates.join(', ')}`,
        'sampleRate',
        'INVALID_SAMPLE_RATE'
      );
    }
    
    if (channels !== null && (typeof channels !== 'number' || ![1, 2, 6, 8].includes(channels))) {
      throw new ValidationError(
        'Channels must be 1 (mono), 2 (stereo), 6 (5.1), or 8 (7.1)',
        'channels',
        'INVALID_CHANNELS'
      );
    }
    
    return true;
  }

  /**
   * Validate video settings
   */
  static validateVideoSettings({ frameRate, videoBitrate, audioBitrate }) {
    if (frameRate !== null && (typeof frameRate !== 'number' || frameRate <= 0 || frameRate > 120)) {
      throw new ValidationError(
        'Frame rate must be between 1 and 120 fps',
        'frameRate',
        'INVALID_FRAME_RATE'
      );
    }
    
    if (videoBitrate !== null && (typeof videoBitrate !== 'number' || videoBitrate <= 0)) {
      throw new ValidationError(
        'Video bitrate must be a positive number',
        'videoBitrate',
        'INVALID_VIDEO_BITRATE'
      );
    }
    
    if (audioBitrate !== null && (typeof audioBitrate !== 'number' || audioBitrate <= 0)) {
      throw new ValidationError(
        'Audio bitrate must be a positive number',
        'audioBitrate',
        'INVALID_AUDIO_BITRATE'
      );
    }
    
    return true;
  }
}

/**
 * Main job validation orchestrator
 */
export class JobValidator {
  /**
   * Validate complete job creation parameters
   */
  static async validateJobCreation({
    sourceFile,
    targetFile = null,
    settings,
    priority = JobPriority.NORMAL,
    metadata = {},
    dependencies = [],
    retryCount = 0,
    maxRetries = 3,
    allowOverwrite = false,
    maxFileSize = null
  } = {}) {
    const errors = [];
    
    try {
      // Validate required parameters
      if (!sourceFile) {
        throw new ValidationError('Source file is required', 'sourceFile', 'MISSING_SOURCE_FILE');
      }
      
      if (!settings) {
        throw new ValidationError('Conversion settings are required', 'settings', 'MISSING_SETTINGS');
      }
      
      // File validation
      await FileValidator.validateFileExists(sourceFile);
      await FileValidator.validateFileReadable(sourceFile);
      await FileValidator.validateFileSize(sourceFile, maxFileSize);
      
      // Settings validation
      if (!(settings instanceof ConversionSettings)) {
        throw new ValidationError('Settings must be a ConversionSettings instance', 'settings', 'INVALID_SETTINGS_TYPE');
      }
      
      const settingsValidation = settings.validate();
      if (!settingsValidation.isValid) {
        settingsValidation.errors.forEach(error => {
          errors.push(new ValidationError(error, 'settings', 'INVALID_SETTINGS'));
        });
      }
      
      // Validate file format matches settings
      if (settings.sourceFormat) {
        FileValidator.validateFileExtension(sourceFile, settings.sourceFormat);
      }
      
      // Parameter validation
      JobParameterValidator.validatePriority(priority);
      JobParameterValidator.validateRetryConfig(retryCount, maxRetries);
      JobParameterValidator.validateDependencies(dependencies);
      JobParameterValidator.validateMetadata(metadata);
      
      // Output validation
      if (targetFile) {
        await FileValidator.validateOutputPath(targetFile);
        await FileValidator.validateOutputNotExists(targetFile, allowOverwrite);
      }
      
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error);
      } else {
        errors.push(new ValidationError(`Unexpected validation error: ${error.message}`, null, 'UNEXPECTED_ERROR'));
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate job re-queue operation
   */
  static async validateJobRequeue(job, options = {}) {
    const errors = [];
    
    try {
      // Check if job can be re-queued
      if (!job) {
        throw new ValidationError('Job is required', 'job', 'MISSING_JOB');
      }
      
      // Check if job is in a state that allows re-queueing
      const allowedStates = [
        JobStatus.FAILED,
        JobStatus.CANCELLED,
        JobStatus.COMPLETED,
        JobStatus.PAUSED
      ];
      
      if (!allowedStates.includes(job.status)) {
        throw new ValidationError(
          `Job cannot be re-queued from status: ${job.status}`,
          'status',
          'INVALID_STATUS_FOR_REQUEUE'
        );
      }
      
      // Validate source file still exists
      if (job.sourceFile) {
        await FileValidator.validateFileExists(job.sourceFile);
        await FileValidator.validateFileReadable(job.sourceFile);
      }
      
      // Validate new settings if provided
      if (options.settings) {
        if (!(options.settings instanceof ConversionSettings)) {
          throw new ValidationError('Settings must be a ConversionSettings instance', 'settings', 'INVALID_SETTINGS_TYPE');
        }
        
        const settingsValidation = options.settings.validate();
        if (!settingsValidation.isValid) {
          settingsValidation.errors.forEach(error => {
            errors.push(new ValidationError(error, 'settings', 'INVALID_SETTINGS'));
          });
        }
      }
      
      // Validate priority if provided
      if (options.priority) {
        JobParameterValidator.validatePriority(options.priority);
      }
      
      // Validate retry count
      if (job.retryCount >= job.maxRetries) {
        throw new ValidationError(
          `Job has exceeded maximum retry count (${job.maxRetries})`,
          'retryCount',
          'MAX_RETRIES_EXCEEDED'
        );
      }
      
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error);
      } else {
        errors.push(new ValidationError(`Unexpected validation error: ${error.message}`, null, 'UNEXPECTED_ERROR'));
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate job update parameters
   */
  static validateJobUpdate(updates) {
    const errors = [];
    
    try {
      if (updates.status !== undefined) {
        JobParameterValidator.validateStatus(updates.status);
      }
      
      if (updates.priority !== undefined) {
        JobParameterValidator.validatePriority(updates.priority);
      }
      
      if (updates.metadata !== undefined) {
        JobParameterValidator.validateMetadata(updates.metadata);
      }
      
      if (updates.dependencies !== undefined) {
        JobParameterValidator.validateDependencies(updates.dependencies);
      }
      
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error);
      } else {
        errors.push(new ValidationError(`Unexpected validation error: ${error.message}`, null, 'UNEXPECTED_ERROR'));
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default JobValidator;