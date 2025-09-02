/**
 * Image Processing Service
 * Core service for image processing operations using Sharp library
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { createHash } = require('crypto');

/**
 * Image processing result class
 */
class ImageProcessingResult {
  constructor() {
    this.success = false;
    this.outputPath = null;
    this.outputBuffer = null;
    this.metadata = null;
    this.statistics = {
      originalSize: 0,
      processedSize: 0,
      compressionRatio: 0,
      processingTime: 0,
      width: 0,
      height: 0,
      format: null,
      channels: 0,
      hasAlpha: false
    };
    this.steps = [];
    this.warnings = [];
    this.errors = [];
    this.startTime = Date.now();
  }

  /**
   * Add a processing step
   */
  addStep(name, duration, success, details = {}) {
    this.steps.push({
      name,
      duration,
      success,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Add a warning
   */
  addWarning(message) {
    this.warnings.push({
      message,
      timestamp: Date.now()
    });
  }

  /**
   * Add an error
   */
  addError(message) {
    this.errors.push({
      message,
      timestamp: Date.now()
    });
  }

  /**
   * Set the output data
   */
  setOutput(outputPath, outputBuffer, metadata) {
    this.outputPath = outputPath;
    this.outputBuffer = outputBuffer;
    this.metadata = metadata;
    
    if (metadata) {
      this.statistics.width = metadata.width || 0;
      this.statistics.height = metadata.height || 0;
      this.statistics.format = metadata.format || null;
      this.statistics.channels = metadata.channels || 0;
      this.statistics.hasAlpha = metadata.hasAlpha || false;
      this.statistics.processedSize = metadata.size || (outputBuffer ? outputBuffer.length : 0);
    }
    
    this.success = true;
  }

  /**
   * Finalize the result
   */
  finalize() {
    this.statistics.processingTime = Date.now() - this.startTime;
    
    if (this.statistics.originalSize > 0 && this.statistics.processedSize > 0) {
      this.statistics.compressionRatio = this.statistics.originalSize / this.statistics.processedSize;
    }
  }

  /**
   * Get processing summary
   */
  getSummary() {
    return {
      success: this.success,
      processingTime: this.statistics.processingTime,
      originalSize: this.statistics.originalSize,
      processedSize: this.statistics.processedSize,
      compressionRatio: this.statistics.compressionRatio,
      dimensions: `${this.statistics.width}x${this.statistics.height}`,
      format: this.statistics.format,
      stepsCount: this.steps.length,
      warningsCount: this.warnings.length,
      errorsCount: this.errors.length
    };
  }
}

/**
 * Image processing events
 */
const ImageProcessingEvents = {
  PROCESSING_STARTED: 'processing_started',
  PROCESSING_PROGRESS: 'processing_progress',
  PROCESSING_COMPLETED: 'processing_completed',
  PROCESSING_FAILED: 'processing_failed',
  STEP_COMPLETED: 'step_completed',
  WARNING: 'warning',
  ERROR: 'error'
};

/**
 * Default processing options
 */
const DEFAULT_PROCESSING_OPTIONS = {
  // Output format options
  format: null, // auto-detect from extension or keep original
  quality: 80, // JPEG quality (1-100)
  progressive: false, // Progressive JPEG
  
  // Resize options
  width: null,
  height: null,
  fit: 'cover', // cover, contain, fill, inside, outside
  position: 'center', // center, top, bottom, left, right, etc.
  background: { r: 255, g: 255, b: 255, alpha: 1 }, // Background color for letterboxing
  
  // Processing options
  sharpen: false, // Apply sharpening
  blur: false, // Apply blur (radius)
  normalize: false, // Normalize image
  grayscale: false, // Convert to grayscale
  negate: false, // Negate colors
  
  // Optimization options
  optimize: true, // Optimize output
  strip: true, // Remove metadata
  
  // Caching options
  useCache: true,
  cacheMaxAge: 3600000, // 1 hour in milliseconds
  
  // Progress reporting
  reportProgress: true,
  progressInterval: 100 // milliseconds
};

/**
 * Image Processing Service
 */
class ImageProcessingService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = { ...DEFAULT_PROCESSING_OPTIONS, ...options };
    this.cache = new Map();
    this.statistics = {
      totalProcessed: 0,
      successfulProcessed: 0,
      failedProcessed: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheSize: 0
    };
    
    // Supported input formats
    this.supportedInputFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'svg', 'tiff', 'tif', 'bmp', 'avif', 'heif'];
    this.supportedOutputFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'tif', 'bmp', 'avif'];
  }

  /**
   * Process an image with specified operations
   */
  async processImage(inputPath, outputPath = null, operations = {}, options = {}) {
    const result = new ImageProcessingResult();
    const processingOptions = { ...this.options, ...options };
    
    try {
      this.emit(ImageProcessingEvents.PROCESSING_STARTED, { inputPath, outputPath, operations });
      
      // Validate input
      const validationStep = await this._validateInput(inputPath, result);
      if (!validationStep.success) {
        throw new Error(`Input validation failed: ${validationStep.error}`);
      }
      
      // Check cache if enabled
      const cacheKey = this._generateCacheKey(inputPath, operations, processingOptions);
      if (processingOptions.useCache && this.cache.has(cacheKey)) {
        const cachedResult = this.cache.get(cacheKey);
        if (Date.now() - cachedResult.timestamp < processingOptions.cacheMaxAge) {
          this.statistics.cacheHits++;
          result.addStep('cache_hit', 0, true, { cacheKey });
          
          // Copy cached result
          Object.assign(result, cachedResult.result);
          result.finalize();
          
          this.emit(ImageProcessingEvents.PROCESSING_COMPLETED, result);
          return result;
        } else {
          // Remove expired cache entry
          this.cache.delete(cacheKey);
        }
      }
      
      this.statistics.cacheMisses++;
      
      // Load and get metadata
      const { sharpInstance, metadata } = await this._loadImage(inputPath, result);
      result.statistics.originalSize = metadata.size || 0;
      
      // Apply operations
      const processedSharp = await this._applyOperations(sharpInstance, operations, result, processingOptions);
      
      // Generate output
      const outputData = await this._generateOutput(processedSharp, outputPath, result, processingOptions);
      
      // Set result data
      result.setOutput(outputData.outputPath, outputData.buffer, outputData.metadata);
      result.finalize();
      
      // Cache result if enabled
      if (processingOptions.useCache) {
        this.cache.set(cacheKey, {
          result: { ...result },
          timestamp: Date.now()
        });
        this.statistics.cacheSize = this.cache.size;
      }
      
      // Update statistics
      this.statistics.totalProcessed++;
      this.statistics.successfulProcessed++;
      this.statistics.totalProcessingTime += result.statistics.processingTime;
      this.statistics.averageProcessingTime = this.statistics.totalProcessingTime / this.statistics.totalProcessed;
      
      this.emit(ImageProcessingEvents.PROCESSING_COMPLETED, result);
      return result;
      
    } catch (error) {
      result.addError(error.message);
      result.finalize();
      
      this.statistics.totalProcessed++;
      this.statistics.failedProcessed++;
      
      this.emit(ImageProcessingEvents.PROCESSING_FAILED, { error, result });
      return result;
    }
  }

  /**
   * Batch process multiple images
   */
  async batchProcessImages(inputs, operations = {}, options = {}) {
    const results = [];
    const batchOptions = { ...this.options, ...options };
    
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      const inputPath = typeof input === 'string' ? input : input.inputPath;
      const outputPath = typeof input === 'string' ? null : input.outputPath;
      const inputOperations = typeof input === 'string' ? operations : { ...operations, ...input.operations };
      
      try {
        const result = await this.processImage(inputPath, outputPath, inputOperations, batchOptions);
        results.push(result);
        
        // Report batch progress
        if (batchOptions.reportProgress) {
          this.emit(ImageProcessingEvents.PROCESSING_PROGRESS, {
            completed: i + 1,
            total: inputs.length,
            percentage: ((i + 1) / inputs.length) * 100,
            currentResult: result
          });
        }
      } catch (error) {
        const errorResult = new ImageProcessingResult();
        errorResult.addError(`Batch processing failed for ${inputPath}: ${error.message}`);
        results.push(errorResult);
      }
    }
    
    return results;
  }

  /**
   * Get image metadata without processing
   */
  async getImageMetadata(inputPath) {
    try {
      const sharpInstance = sharp(inputPath);
      const metadata = await sharpInstance.metadata();
      
      return {
        success: true,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: metadata.size,
          channels: metadata.channels,
          hasAlpha: metadata.hasAlpha,
          orientation: metadata.orientation,
          density: metadata.density,
          chromaSubsampling: metadata.chromaSubsampling,
          isProgressive: metadata.isProgressive
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate input file
   */
  async _validateInput(inputPath, result) {
    const stepStart = Date.now();
    
    try {
      // Check if file exists
      await fs.access(inputPath);
      
      // Check file extension
      const ext = path.extname(inputPath).toLowerCase().substring(1);
      if (!this.supportedInputFormats.includes(ext)) {
        throw new Error(`Unsupported input format: ${ext}`);
      }
      
      // Check file size (basic validation)
      const stats = await fs.stat(inputPath);
      if (stats.size === 0) {
        throw new Error('Input file is empty');
      }
      
      if (stats.size > 100 * 1024 * 1024) { // 100MB limit
        result.addWarning('Large file detected, processing may take longer');
      }
      
      const duration = Date.now() - stepStart;
      result.addStep('input_validation', duration, true, { fileSize: stats.size, format: ext });
      
      return { success: true };
    } catch (error) {
      const duration = Date.now() - stepStart;
      result.addStep('input_validation', duration, false, { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Load image and get metadata
   */
  async _loadImage(inputPath, result) {
    const stepStart = Date.now();
    
    try {
      const sharpInstance = sharp(inputPath);
      const metadata = await sharpInstance.metadata();
      
      const duration = Date.now() - stepStart;
      result.addStep('image_loading', duration, true, { 
        width: metadata.width, 
        height: metadata.height, 
        format: metadata.format 
      });
      
      return { sharpInstance, metadata };
    } catch (error) {
      const duration = Date.now() - stepStart;
      result.addStep('image_loading', duration, false, { error: error.message });
      throw error;
    }
  }

  /**
   * Apply processing operations
   */
  async _applyOperations(sharpInstance, operations, result, options) {
    let processedSharp = sharpInstance;
    
    // Resize operations
    if (operations.resize || operations.width || operations.height) {
      const stepStart = Date.now();
      
      const resizeOptions = {
        width: operations.width || operations.resize?.width,
        height: operations.height || operations.resize?.height,
        fit: operations.fit || options.fit,
        position: operations.position || options.position,
        background: operations.background || options.background
      };
      
      processedSharp = processedSharp.resize(resizeOptions);
      
      const duration = Date.now() - stepStart;
      result.addStep('resize', duration, true, resizeOptions);
    }
    
    // Format conversion
    if (operations.format || options.format) {
      const stepStart = Date.now();
      const format = operations.format || options.format;
      
      const formatOptions = {
        quality: operations.quality || options.quality
      };
      
      if (format === 'jpeg' || format === 'jpg') {
        processedSharp = processedSharp.jpeg(formatOptions);
      } else if (format === 'png') {
        processedSharp = processedSharp.png({ compressionLevel: 9 });
      } else if (format === 'webp') {
        processedSharp = processedSharp.webp(formatOptions);
      }
      
      const duration = Date.now() - stepStart;
      result.addStep('format_conversion', duration, true, { format, ...formatOptions });
    }
    
    // Image enhancements
    if (operations.sharpen || options.sharpen) {
      const stepStart = Date.now();
      processedSharp = processedSharp.sharpen();
      const duration = Date.now() - stepStart;
      result.addStep('sharpen', duration, true);
    }
    
    if (operations.blur || options.blur) {
      const stepStart = Date.now();
      const blurRadius = typeof operations.blur === 'number' ? operations.blur : 1;
      processedSharp = processedSharp.blur(blurRadius);
      const duration = Date.now() - stepStart;
      result.addStep('blur', duration, true, { radius: blurRadius });
    }
    
    if (operations.normalize || options.normalize) {
      const stepStart = Date.now();
      processedSharp = processedSharp.normalize();
      const duration = Date.now() - stepStart;
      result.addStep('normalize', duration, true);
    }
    
    if (operations.grayscale || options.grayscale) {
      const stepStart = Date.now();
      processedSharp = processedSharp.grayscale();
      const duration = Date.now() - stepStart;
      result.addStep('grayscale', duration, true);
    }
    
    if (operations.negate || options.negate) {
      const stepStart = Date.now();
      processedSharp = processedSharp.negate();
      const duration = Date.now() - stepStart;
      result.addStep('negate', duration, true);
    }
    
    return processedSharp;
  }

  /**
   * Generate output
   */
  async _generateOutput(sharpInstance, outputPath, result, options) {
    const stepStart = Date.now();
    
    try {
      let buffer, metadata;
      
      if (outputPath) {
        // Save to file
        await sharpInstance.toFile(outputPath);
        buffer = await fs.readFile(outputPath);
        metadata = await sharp(outputPath).metadata();
      } else {
        // Return buffer
        buffer = await sharpInstance.toBuffer({ resolveWithObject: true });
        metadata = buffer.info;
        buffer = buffer.data;
      }
      
      const duration = Date.now() - stepStart;
      result.addStep('output_generation', duration, true, { 
        outputPath, 
        bufferSize: buffer.length 
      });
      
      return { outputPath, buffer, metadata };
    } catch (error) {
      const duration = Date.now() - stepStart;
      result.addStep('output_generation', duration, false, { error: error.message });
      throw error;
    }
  }

  /**
   * Generate cache key
   */
  _generateCacheKey(inputPath, operations, options) {
    const keyData = {
      inputPath,
      operations,
      options: {
        format: options.format,
        quality: options.quality,
        width: options.width,
        height: options.height,
        fit: options.fit
      }
    };
    
    return createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }

  /**
   * Get supported formats
   */
  getSupportedFormats() {
    return {
      input: [...this.supportedInputFormats],
      output: [...this.supportedOutputFormats]
    };
  }

  /**
   * Get processing statistics
   */
  getStatistics() {
    return { ...this.statistics };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.statistics.cacheSize = 0;
  }

  /**
   * Get cache information
   */
  getCacheInfo() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      totalHits: this.statistics.cacheHits,
      totalMisses: this.statistics.cacheMisses,
      hitRate: this.statistics.cacheHits / (this.statistics.cacheHits + this.statistics.cacheMisses) || 0
    };
  }
}

// Global service instance
let globalImageProcessingService = null;

/**
 * Get global image processing service instance
 */
function getImageProcessingService(options = {}) {
  if (!globalImageProcessingService) {
    globalImageProcessingService = new ImageProcessingService(options);
  }
  return globalImageProcessingService;
}

module.exports = {
  ImageProcessingService,
  ImageProcessingResult,
  ImageProcessingEvents,
  DEFAULT_PROCESSING_OPTIONS,
  getImageProcessingService
};