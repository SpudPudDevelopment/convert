const { getSharpService, SharpResult, SharpEvents } = require('./SharpService');
const { FormatDetector } = require('../utils/FormatDetector');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;
const { createImageProcessingError } = require('../errors/ImageProcessingErrorHandler');

// Document conversion services
const { convertPDFToDOCX, convertPDFToDOCXWithProgress } = require('../utils/PDFToDOCXWrapper');
const { convertDOCXToPDF, convertDOCXToPDFWithProgress } = require('../utils/DOCXToPDFWrapper');

// Audio conversion service
const audioConversionService = require('../../main/services/audioConversionService');

/**
 * Supported formats for conversion by category
 */
const SUPPORTED_FORMATS = {
  // Image formats
  IMAGE: {
    JPG: 'jpeg',
    JPEG: 'jpeg',
    PNG: 'png',
    WEBP: 'webp'
  },
  // Document formats
  DOCUMENT: {
    PDF: 'pdf',
    DOCX: 'docx',
    DOC: 'doc',
    TXT: 'txt',
    RTF: 'rtf'
  },
  // Audio formats
  AUDIO: {
    MP3: 'mp3',
    WAV: 'wav',
    AAC: 'aac',
    FLAC: 'flac',
    OGG: 'ogg'
  }
};

/**
 * File type detection by extension
 */
const FILE_TYPE_MAP = {
  // Images
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image',
  '.gif': 'image', '.bmp': 'image', '.tiff': 'image', '.svg': 'image',
  // Documents
  '.pdf': 'document', '.docx': 'document', '.doc': 'document',
  '.txt': 'document', '.rtf': 'document', '.odt': 'document',
  // Audio
  '.mp3': 'audio', '.wav': 'audio', '.aac': 'audio',
  '.flac': 'audio', '.ogg': 'audio', '.m4a': 'audio'
};

/**
 * Format conversion quality settings
 */
const DEFAULT_QUALITY_SETTINGS = {
  jpeg: {
    quality: 85,
    progressive: true,
    mozjpeg: true,
    optimiseScans: true,
    overshootDeringing: true,
    trellisQuantisation: true
  },
  png: {
    compressionLevel: 6,
    progressive: true,
    palette: false,
    adaptiveFiltering: true,
    effort: 7
  },
  webp: {
    quality: 85,
    lossless: false,
    nearLossless: false,
    smartSubsample: true,
    effort: 4,
    alphaQuality: 100
  }
};

/**
 * Transparency handling options
 */
const TRANSPARENCY_OPTIONS = {
  PRESERVE: 'preserve',
  REMOVE_WHITE: 'remove_white',
  REMOVE_BLACK: 'remove_black',
  REMOVE_CUSTOM: 'remove_custom'
};

/**
 * Background color presets for transparency removal
 */
const BACKGROUND_COLORS = {
  WHITE: { r: 255, g: 255, b: 255 },
  BLACK: { r: 0, g: 0, b: 0 },
  TRANSPARENT: { r: 0, g: 0, b: 0, alpha: 0 },
  GRAY: { r: 128, g: 128, b: 128 }
};

/**
 * Conversion presets for different use cases
 */
const CONVERSION_PRESETS = {
  WEB_OPTIMIZED: {
    jpeg: { quality: 80, progressive: true, mozjpeg: true },
    png: { compressionLevel: 9, progressive: true, palette: true },
    webp: { quality: 80, lossless: false, effort: 6 }
  },
  HIGH_QUALITY: {
    jpeg: { quality: 95, progressive: true, mozjpeg: true },
    png: { compressionLevel: 3, progressive: false, palette: false },
    webp: { quality: 95, lossless: false, effort: 6 }
  },
  SMALL_SIZE: {
    jpeg: { quality: 70, progressive: true, mozjpeg: true },
    png: { compressionLevel: 9, progressive: true, palette: true },
    webp: { quality: 70, lossless: false, effort: 6 }
  },
  LOSSLESS: {
    png: { compressionLevel: 9, progressive: false, palette: false },
    webp: { lossless: true, effort: 6 }
  }
};

/**
 * Format conversion result class
 */
class FormatConversionResult {
  constructor({
    success = false,
    outputPath = null,
    outputBuffer = null,
    originalFormat = null,
    targetFormat = null,
    originalSize = 0,
    convertedSize = 0,
    compressionRatio = 0,
    processingTime = 0,
    metadata = {},
    error = null
  } = {}) {
    this.success = success;
    this.outputPath = outputPath;
    this.outputBuffer = outputBuffer;
    this.originalFormat = originalFormat;
    this.targetFormat = targetFormat;
    this.originalSize = originalSize;
    this.convertedSize = convertedSize;
    this.compressionRatio = compressionRatio;
    this.processingTime = processingTime;
    this.metadata = metadata;
    this.error = error;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Get compression efficiency percentage
   */
  getCompressionEfficiency() {
    if (this.originalSize === 0) return 0;
    return ((this.originalSize - this.convertedSize) / this.originalSize) * 100;
  }

  /**
   * Check if conversion resulted in size reduction
   */
  isOptimized() {
    return this.convertedSize < this.originalSize;
  }

  /**
   * Get human-readable size information
   */
  getSizeInfo() {
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return {
      original: formatBytes(this.originalSize),
      converted: formatBytes(this.convertedSize),
      saved: formatBytes(this.originalSize - this.convertedSize)
    };
  }
}

/**
 * Format conversion events
 */
const FormatConversionEvents = {
  CONVERSION_STARTED: 'conversion:started',
  CONVERSION_PROGRESS: 'conversion:progress',
  CONVERSION_COMPLETED: 'conversion:completed',
  CONVERSION_FAILED: 'conversion:failed',
  BATCH_STARTED: 'batch:started',
  BATCH_PROGRESS: 'batch:progress',
  BATCH_COMPLETED: 'batch:completed'
};

/**
 * Format conversion service class
 */
class FormatConversionService extends EventEmitter {
  constructor() {
    super();
    this.conversionCache = new Map();
    this.conversionStats = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      totalProcessingTime: 0,
      formatStats: {}
    };
    this.activeConversions = new Set();
  }

  /**
   * Convert file from one format to another (supports images, documents, and audio)
   */
  async convertFormat(inputPath, outputPath, targetFormat, options = {}) {
    const startTime = Date.now();
    const conversionId = this._generateConversionId(inputPath, targetFormat);
    
    try {
      this.activeConversions.add(conversionId);
      this.emit(FormatConversionEvents.CONVERSION_STARTED, {
        conversionId,
        inputPath,
        outputPath,
        targetFormat
      });

      // Validate input
      await this._validateInput(inputPath);
      
      // Detect file type and route to appropriate service
      const fileType = this._detectFileType(inputPath);
      const normalizedFormat = this._normalizeFormat(targetFormat);
      
      // Check cache
      const cacheKey = this._generateCacheKey(inputPath, normalizedFormat, options);
      if (this.conversionCache.has(cacheKey) && !options.skipCache) {
        const cachedResult = this.conversionCache.get(cacheKey);
        this.emit(FormatConversionEvents.CONVERSION_COMPLETED, { conversionId, cached: true });
        return cachedResult;
      }

      let result;
      
      switch (fileType) {
        case 'image':
          result = await this._convertImage(inputPath, outputPath, normalizedFormat, options);
          break;
        case 'document':
          result = await this._convertDocument(inputPath, outputPath, normalizedFormat, options);
          break;
        case 'audio':
          result = await this._convertAudio(inputPath, outputPath, normalizedFormat, options);
          break;
        default:
          throw createImageProcessingError(
            `Unsupported file type: ${fileType}`,
            'UNSUPPORTED_FILE_TYPE'
          );
      }
      
      const processingTime = Date.now() - startTime;
      result.processingTime = processingTime;
      result.metadata = {
        ...result.metadata,
        conversionId,
        fileType,
        timestamp: new Date().toISOString(),
        options
      };

      // Cache result
      if (!options.skipCache) {
        this.conversionCache.set(cacheKey, result);
      }

      // Update statistics
      this._updateStats(result, processingTime);

      this.emit(FormatConversionEvents.CONVERSION_COMPLETED, {
        conversionId,
        result
      });

      return result;

    } catch (error) {
      const conversionError = createImageProcessingError(
        `Format conversion failed: ${error.message}`,
        'CONVERSION_FAILED',
        { inputPath, outputPath, targetFormat, originalError: error }
      );

      const result = new FormatConversionResult({
        success: false,
        error: conversionError
      });

      this._updateStats(result, Date.now() - startTime);
      
      this.emit(FormatConversionEvents.CONVERSION_FAILED, {
        conversionId,
        error: conversionError
      });

      throw conversionError;
    } finally {
      this.activeConversions.delete(conversionId);
    }
  }

  /**
   * Convert image buffer to target format
   */
  async convertBuffer(inputBuffer, targetFormat, options = {}) {
    const startTime = Date.now();
    
    try {
      // Validate input buffer
      if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
        throw createImageProcessingError(
          'INVALID_INPUT',
          'Input must be a non-empty buffer'
        );
      }
      
      // Detect input format
      const detectionResult = FormatDetector.detectFromBuffer(inputBuffer);
      
      if (!detectionResult.isSupported) {
        throw createImageProcessingError(
          `Unsupported input format: ${detectionResult.format || 'unknown'}`,
          'UNSUPPORTED_FORMAT'
        );
      }
      
      // Normalize target format
      const normalizedFormat = this._normalizeFormat(targetFormat);

      // Get Sharp service and metadata
      const sharpService = getSharpService();
      const metadataResult = await sharpService.getMetadata(inputBuffer);
      
      if (!metadataResult.success) {
        throw createImageProcessingError(
          metadataResult.error,
          'METADATA_ERROR'
        );
      }
      
      const originalSize = inputBuffer.length;
      
      // Perform conversion using Sharp service
      const conversionResult = await sharpService.convertFormat(
        inputBuffer,
        normalizedFormat,
        {
          ...DEFAULT_QUALITY_SETTINGS[normalizedFormat],
          ...options
        }
      );
      
      if (!conversionResult.success) {
        throw createImageProcessingError(
          conversionResult.error,
          'CONVERSION_ERROR'
        );
      }
      
      const convertedSize = conversionResult.data.length;
      const processingTime = Date.now() - startTime;
      
      const result = new FormatConversionResult({
        success: true,
        outputBuffer: conversionResult.data,
        originalFormat: detectionResult.format,
        targetFormat: normalizedFormat,
        originalSize,
        convertedSize,
        compressionRatio: originalSize > 0 ? (originalSize - convertedSize) / originalSize : 0,
        processingTime,
        metadata: metadataResult.metadata
      });

      this._updateStats(result, processingTime);
      return result;

    } catch (error) {
      const conversionError = createImageProcessingError(
        `Buffer conversion failed: ${error.message}`,
        'BUFFER_CONVERSION_FAILED',
        { targetFormat, originalError: error }
      );

      throw conversionError;
    }
  }

  /**
   * Batch convert multiple images
   */
  async batchConvert(conversions, options = {}) {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const results = [];
    const { concurrency = 3, continueOnError = true } = options;
    
    this.emit(FormatConversionEvents.BATCH_STARTED, {
      batchId,
      totalConversions: conversions.length
    });

    try {
      // Process conversions in batches
      for (let i = 0; i < conversions.length; i += concurrency) {
        const batch = conversions.slice(i, i + concurrency);
        
        const batchPromises = batch.map(async (conversion) => {
          try {
            const result = await this.convertFormat(
              conversion.inputPath,
              conversion.outputPath,
              conversion.targetFormat,
              conversion.options || {}
            );
            return { success: true, result, conversion };
          } catch (error) {
            if (!continueOnError) throw error;
            return { success: false, error, conversion };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        this.emit(FormatConversionEvents.BATCH_PROGRESS, {
          batchId,
          completed: results.length,
          total: conversions.length,
          progress: (results.length / conversions.length) * 100
        });
      }

      this.emit(FormatConversionEvents.BATCH_COMPLETED, {
        batchId,
        results,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });

      return results;

    } catch (error) {
      const batchError = createImageProcessingError(
        'BATCH_CONVERSION_FAILED',
        `Batch conversion failed: ${error.message}`,
        { batchId, originalError: error }
      );
      
      throw batchError;
    }
  }

  /**
   * Convert PNG to JPG with transparency handling
   */
  async convertPngToJpg(inputPath, outputPath, options = {}) {
    const defaultOptions = {
      backgroundColor: { r: 255, g: 255, b: 255 }, // White background
      quality: 85,
      progressive: true,
      mozjpeg: true,
      ...options
    };
    
    return this.convertFormat(inputPath, outputPath, 'jpeg', defaultOptions);
  }

  /**
   * Convert JPG to PNG with quality preservation
   */
  async convertJpgToPng(inputPath, outputPath, options = {}) {
    const defaultOptions = {
      compressionLevel: 6,
      progressive: true,
      palette: false,
      ...options
    };
    
    return this.convertFormat(inputPath, outputPath, 'png', defaultOptions);
  }

  /**
   * Convert to WebP format
   */
  async convertToWebp(inputPath, outputPath, options = {}) {
    const defaultOptions = {
      quality: 85,
      lossless: false,
      nearLossless: false,
      smartSubsample: true,
      ...options
    };
    
    return this.convertFormat(inputPath, outputPath, 'webp', defaultOptions);
  }

  /**
   * Convert from WebP format
   */
  async convertFromWebp(inputPath, outputPath, targetFormat, options = {}) {
    return this.convertFormat(inputPath, outputPath, targetFormat, options);
  }

  /**
   * Convert using a preset configuration
   */
  async convertWithPreset(inputPath, outputPath, targetFormat, preset = 'WEB_OPTIMIZED', options = {}) {
    const presetOptions = CONVERSION_PRESETS[preset];
    
    if (!presetOptions || !presetOptions[targetFormat]) {
      throw createImageProcessingError(
        `Preset '${preset}' not available for format '${targetFormat}'`,
        'INVALID_PRESET'
      );
    }
    
    const mergedOptions = {
      ...presetOptions[targetFormat],
      ...options
    };
    
    return this.convertFormat(inputPath, outputPath, targetFormat, mergedOptions);
  }

  /**
   * Get available presets for a format
   */
  getPresetsForFormat(format) {
    const normalizedFormat = this._normalizeFormat(format);
    const availablePresets = {};
    
    for (const [presetName, presetConfig] of Object.entries(CONVERSION_PRESETS)) {
      if (presetConfig[normalizedFormat]) {
        availablePresets[presetName] = presetConfig[normalizedFormat];
      }
    }
    
    return availablePresets;
  }

  /**
   * Get transparency handling options
   */
  getTransparencyOptions() {
    return { ...TRANSPARENCY_OPTIONS };
  }

  /**
   * Get background color presets
   */
  getBackgroundColors() {
    return { ...BACKGROUND_COLORS };
  }

  /**
   * Get supported conversion paths
   */
  getSupportedConversions() {
    const formats = Object.keys(SUPPORTED_FORMATS);
    const conversions = [];
    
    for (const from of formats) {
      for (const to of formats) {
        if (from !== to) {
          conversions.push({
            from: from.toLowerCase(),
            to: to.toLowerCase(),
            supported: true
          });
        }
      }
    }
    
    return conversions;
  }

  /**
   * Get conversion statistics
   */
  getConversionStats() {
    return {
      ...this.conversionStats,
      averageProcessingTime: this.conversionStats.totalConversions > 0 
        ? this.conversionStats.totalProcessingTime / this.conversionStats.totalConversions 
        : 0,
      successRate: this.conversionStats.totalConversions > 0 
        ? (this.conversionStats.successfulConversions / this.conversionStats.totalConversions) * 100 
        : 0,
      activeConversions: this.activeConversions.size,
      cacheSize: this.conversionCache.size
    };
  }

  /**
   * Clear conversion cache
   */
  clearCache() {
    this.conversionCache.clear();
  }

  /**
   * Reset conversion statistics
   */
  resetStats() {
    this.conversionStats = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      totalProcessingTime: 0,
      formatStats: {}
    };
  }

  /**
   * Get cache information
   */
  getCacheInfo() {
    return {
      size: this.conversionCache.size,
      keys: Array.from(this.conversionCache.keys())
    };
  }

  // Private methods

  async _validateInput(inputPath) {
    try {
      await fs.access(inputPath);
      const stats = await fs.stat(inputPath);
      if (!stats.isFile()) {
        throw new Error('Input path is not a file');
      }
    } catch (error) {
      throw createImageProcessingError(
        `Invalid input file: ${error.message}`,
        'INVALID_INPUT',
        { inputPath }
      );
    }
  }

  _detectFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return FILE_TYPE_MAP[ext] || 'unknown';
  }

  _normalizeFormat(format) {
    const upperFormat = format.toUpperCase();
    
    // Check all format categories
    for (const category of Object.values(SUPPORTED_FORMATS)) {
      if (category[upperFormat]) {
        return category[upperFormat];
      }
    }
    
    throw createImageProcessingError(
      `Unsupported format: ${format}`,
      'UNSUPPORTED_FORMAT',
      { format }
    );
  }

  async _convertImage(inputPath, outputPath, targetFormat, options = {}) {
    // Detect input format
    const inputBuffer = await fs.readFile(inputPath);
    const detectionResult = FormatDetector.detectFromBuffer(inputBuffer);
    
    if (!detectionResult.isSupported) {
      throw createImageProcessingError(
        `Unsupported input format: ${detectionResult.format || 'unknown'}`,
        'UNSUPPORTED_FORMAT'
      );
    }
    
    // Get Sharp service and metadata
    const sharpService = getSharpService();
    const metadataResult = await sharpService.getMetadata(inputBuffer);
    
    if (!metadataResult.success) {
      throw createImageProcessingError(
        metadataResult.error,
        'METADATA_ERROR'
      );
    }
    
    const originalSize = inputBuffer.length;
    
    // Perform conversion using Sharp service
    const conversionResult = await sharpService.convertFormat(
      inputBuffer,
      targetFormat,
      {
        ...DEFAULT_QUALITY_SETTINGS[targetFormat],
        ...options
      }
    );
    
    if (!conversionResult.success) {
      throw createImageProcessingError(
        conversionResult.error,
        'CONVERSION_ERROR'
      );
    }
    
    // Write output file
    await fs.writeFile(outputPath, conversionResult.data);
    
    const convertedSize = conversionResult.data.length;
    
    return new FormatConversionResult({
      success: true,
      outputPath,
      outputBuffer: conversionResult.data,
      originalFormat: detectionResult.format,
      targetFormat,
      originalSize,
      convertedSize,
      compressionRatio: originalSize > 0 ? (originalSize - convertedSize) / originalSize : 0,
      metadata: metadataResult.metadata
    });
  }

  async _convertDocument(inputPath, outputPath, targetFormat, options = {}) {
    const inputExt = path.extname(inputPath).toLowerCase();
    const originalSize = await this._getFileSize(inputPath);
    
    try {
      // Route to appropriate document conversion service
      if (inputExt === '.pdf' && targetFormat === 'docx') {
        if (options.withProgress) {
          await convertPDFToDOCXWithProgress(inputPath, outputPath, options.progressCallback);
        } else {
          await convertPDFToDOCX(inputPath, outputPath);
        }
      } else if (inputExt === '.docx' && targetFormat === 'pdf') {
        if (options.withProgress) {
          await convertDOCXToPDFWithProgress(inputPath, outputPath, options.progressCallback);
        } else {
          await convertDOCXToPDF(inputPath, outputPath);
        }
      } else {
        throw new Error(`Document conversion from ${inputExt} to ${targetFormat} not supported`);
      }
      
      const convertedSize = await this._getFileSize(outputPath);
      
      return new FormatConversionResult({
        success: true,
        outputPath,
        originalFormat: inputExt.substring(1),
        targetFormat,
        originalSize,
        convertedSize,
        compressionRatio: originalSize > 0 ? (originalSize - convertedSize) / originalSize : 0,
        metadata: { documentConversion: true }
      });
    } catch (error) {
      throw createImageProcessingError(
        `Document conversion failed: ${error.message}`,
        'DOCUMENT_CONVERSION_ERROR',
        { inputPath, outputPath, targetFormat }
      );
    }
  }

  async _convertAudio(inputPath, outputPath, targetFormat, options = {}) {
    const inputExt = path.extname(inputPath).toLowerCase();
    const originalSize = await this._getFileSize(inputPath);
    
    try {
      // Use audio conversion service
      const result = await audioConversionService.convertAudio({
        inputPath,
        outputPath,
        targetFormat,
        ...options
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Audio conversion failed');
      }
      
      const convertedSize = await this._getFileSize(outputPath);
      
      return new FormatConversionResult({
        success: true,
        outputPath,
        originalFormat: inputExt.substring(1),
        targetFormat,
        originalSize,
        convertedSize,
        compressionRatio: originalSize > 0 ? (originalSize - convertedSize) / originalSize : 0,
        metadata: { audioConversion: true, ...result.metadata }
      });
    } catch (error) {
      throw createImageProcessingError(
        `Audio conversion failed: ${error.message}`,
        'AUDIO_CONVERSION_ERROR',
        { inputPath, outputPath, targetFormat }
      );
    }
  }

  async _getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  async _getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  _generateConversionId(inputPath, targetFormat) {
    return `conv_${Date.now()}_${path.basename(inputPath)}_${targetFormat}`;
  }

  _generateCacheKey(inputPath, targetFormat, options) {
    const optionsHash = JSON.stringify(options);
    return `${inputPath}:${targetFormat}:${optionsHash}`;
  }

  _updateStats(result, processingTime) {
    this.conversionStats.totalConversions++;
    this.conversionStats.totalProcessingTime += processingTime;
    
    if (result.success) {
      this.conversionStats.successfulConversions++;
      
      // Update format-specific stats
      const formatPair = `${result.originalFormat}_to_${result.targetFormat}`;
      if (!this.conversionStats.formatStats[formatPair]) {
        this.conversionStats.formatStats[formatPair] = {
          count: 0,
          totalTime: 0,
          totalOriginalSize: 0,
          totalConvertedSize: 0
        };
      }
      
      const formatStat = this.conversionStats.formatStats[formatPair];
      formatStat.count++;
      formatStat.totalTime += processingTime;
      formatStat.totalOriginalSize += result.originalSize;
      formatStat.totalConvertedSize += result.convertedSize;
    } else {
      this.conversionStats.failedConversions++;
    }
  }
}

// Global service instance
let globalFormatConversionService = null;

/**
 * Get the global format conversion service instance
 */
function getFormatConversionService() {
  if (!globalFormatConversionService) {
    globalFormatConversionService = new FormatConversionService();
  }
  return globalFormatConversionService;
}

module.exports = {
  FormatConversionService,
  FormatConversionResult,
  FormatConversionEvents,
  SUPPORTED_FORMATS,
  DEFAULT_QUALITY_SETTINGS,
  TRANSPARENCY_OPTIONS,
  BACKGROUND_COLORS,
  CONVERSION_PRESETS,
  getFormatConversionService
};