const sharp = require('sharp');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

/**
 * Result class for Sharp operations
 */
class SharpResult {
  constructor(success = false, data = null, error = null, metadata = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
  }

  static success(data, metadata = {}) {
    return new SharpResult(true, data, null, metadata);
  }

  static error(error, metadata = {}) {
    return new SharpResult(false, null, error, metadata);
  }
}

/**
 * Event emitter for Sharp operations
 */
class SharpEvents extends EventEmitter {
  static EVENTS = {
    OPERATION_START: 'operation_start',
    OPERATION_COMPLETE: 'operation_complete',
    OPERATION_ERROR: 'operation_error',
    MEMORY_WARNING: 'memory_warning',
    CACHE_CLEARED: 'cache_cleared'
  };
}

/**
 * Default configuration for Sharp operations
 */
const DEFAULT_CONFIG = {
  // Memory management
  concurrency: 4,
  limitInputPixels: 268402689, // 16383 x 16383 pixels
  
  // Cache settings
  cache: {
    memory: 50, // MB
    files: 20,  // Number of files
    items: 100  // Number of items
  },
  
  // Quality settings
  quality: {
    jpeg: 80,
    webp: 80,
    png: 6, // Compression level 0-9
    avif: 50
  },
  
  // Format options
  formats: {
    jpeg: {
      quality: 80,
      progressive: true,
      mozjpeg: true
    },
    png: {
      compressionLevel: 6,
      adaptiveFiltering: false,
      palette: false
    },
    webp: {
      quality: 80,
      lossless: false,
      nearLossless: false,
      smartSubsample: false
    }
  },
  
  // Resize options
  resize: {
    kernel: sharp.kernel.lanczos3,
    withoutEnlargement: false,
    fastShrinkOnLoad: true
  }
};

/**
 * Sharp service for high-performance image processing
 */
class SharpService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = new SharpEvents();
    this.stats = {
      operationsCount: 0,
      errorsCount: 0,
      totalProcessingTime: 0,
      memoryUsage: {
        peak: 0,
        current: 0
      }
    };
    this.cache = new Map();
    this.isInitialized = false;
    
    this._initialize();
  }

  /**
   * Initialize Sharp with configuration
   * @private
   */
  _initialize() {
    try {
      // Set Sharp configuration
      sharp.concurrency(this.config.concurrency);
      sharp.cache(this.config.cache);
      
      // Note: limitInputPixels is set per-instance in createSharpInstance, not globally
      
      this.isInitialized = true;
      this.events.emit(SharpEvents.EVENTS.OPERATION_START, {
        type: 'initialization',
        config: this.config
      });
    } catch (error) {
      this.isInitialized = false;
      this.events.emit(SharpEvents.EVENTS.OPERATION_ERROR, {
        type: 'initialization',
        error: error.message
      });
      throw new Error(`Failed to initialize Sharp: ${error.message}`);
    }
  }

  /**
   * Check if Sharp is properly initialized
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Get Sharp instance with error handling
   * @param {Buffer|string} input - Input buffer or file path
   * @returns {Object} Sharp instance or error result
   */
  async createSharpInstance(input) {
    try {
      if (!this.isInitialized) {
        throw new Error('Sharp service not initialized');
      }

      let sharpInstance;
      
      // Prepare constructor options
      const sharpOptions = {};
      if (this.config.limitInputPixels) {
        sharpOptions.limitInputPixels = this.config.limitInputPixels;
      }
      
      if (Buffer.isBuffer(input)) {
        sharpInstance = sharp(input, sharpOptions);
      } else if (typeof input === 'string') {
        // Validate file exists
        await fs.access(input);
        sharpInstance = sharp(input, sharpOptions);
      } else {
        throw new Error('Input must be a Buffer or file path string');
      }

      return SharpResult.success(sharpInstance);
    } catch (error) {
      this.stats.errorsCount++;
      this.events.emit(SharpEvents.EVENTS.OPERATION_ERROR, {
        type: 'instance_creation',
        error: error.message,
        input: typeof input
      });
      return SharpResult.error(error);
    }
  }

  /**
   * Get image metadata
   * @param {Buffer|string} input - Input buffer or file path
   * @returns {Promise<SharpResult>} Metadata result
   */
  async getMetadata(input) {
    const startTime = Date.now();
    
    try {
      const instanceResult = await this.createSharpInstance(input);
      if (!instanceResult.success) {
        return instanceResult;
      }

      const metadata = await instanceResult.data.metadata();
      
      this.stats.operationsCount++;
      this.stats.totalProcessingTime += Date.now() - startTime;
      
      this.events.emit(SharpEvents.EVENTS.OPERATION_COMPLETE, {
        type: 'metadata',
        duration: Date.now() - startTime,
        format: metadata.format,
        size: metadata.size
      });

      return SharpResult.success(metadata, {
        processingTime: Date.now() - startTime
      });
    } catch (error) {
      this.stats.errorsCount++;
      this.events.emit(SharpEvents.EVENTS.OPERATION_ERROR, {
        type: 'metadata',
        error: error.message,
        duration: Date.now() - startTime
      });
      return SharpResult.error(error);
    }
  }

  /**
   * Convert image format
   * @param {Buffer|string} input - Input buffer or file path
   * @param {string} format - Target format (jpeg, png, webp)
   * @param {Object} options - Format-specific options
   * @returns {Promise<SharpResult>} Conversion result
   */
  async convertFormat(input, format, options = {}) {
    const startTime = Date.now();
    
    try {
      const instanceResult = await this.createSharpInstance(input);
      if (!instanceResult.success) {
        return instanceResult;
      }

      const sharpInstance = instanceResult.data;
      const formatOptions = { ...this.config.formats[format], ...options };

      let result;
      switch (format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          result = await sharpInstance.jpeg(formatOptions).toBuffer();
          break;
        case 'png':
          result = await sharpInstance.png(formatOptions).toBuffer();
          break;
        case 'webp':
          result = await sharpInstance.webp(formatOptions).toBuffer();
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      this.stats.operationsCount++;
      this.stats.totalProcessingTime += Date.now() - startTime;
      
      this.events.emit(SharpEvents.EVENTS.OPERATION_COMPLETE, {
        type: 'format_conversion',
        format,
        duration: Date.now() - startTime,
        outputSize: result.length
      });

      return SharpResult.success(result, {
        format,
        size: result.length,
        processingTime: Date.now() - startTime
      });
    } catch (error) {
      this.stats.errorsCount++;
      this.events.emit(SharpEvents.EVENTS.OPERATION_ERROR, {
        type: 'format_conversion',
        format,
        error: error.message,
        duration: Date.now() - startTime
      });
      return SharpResult.error(error);
    }
  }

  /**
   * Resize image
   * @param {Buffer|string} input - Input buffer or file path
   * @param {Object} dimensions - Width and height
   * @param {Object} options - Resize options
   * @returns {Promise<SharpResult>} Resize result
   */
  async resize(input, dimensions, options = {}) {
    const startTime = Date.now();
    
    try {
      const instanceResult = await this.createSharpInstance(input);
      if (!instanceResult.success) {
        return instanceResult;
      }

      const resizeOptions = { ...this.config.resize, ...options };
      const { width, height } = dimensions;

      const result = await instanceResult.data
        .resize(width, height, resizeOptions)
        .toBuffer();

      this.stats.operationsCount++;
      this.stats.totalProcessingTime += Date.now() - startTime;
      
      this.events.emit(SharpEvents.EVENTS.OPERATION_COMPLETE, {
        type: 'resize',
        dimensions,
        duration: Date.now() - startTime,
        outputSize: result.length
      });

      return SharpResult.success(result, {
        dimensions,
        size: result.length,
        processingTime: Date.now() - startTime
      });
    } catch (error) {
      this.stats.errorsCount++;
      this.events.emit(SharpEvents.EVENTS.OPERATION_ERROR, {
        type: 'resize',
        dimensions,
        error: error.message,
        duration: Date.now() - startTime
      });
      return SharpResult.error(error);
    }
  }

  /**
   * Crop image
   * @param {Buffer|string} input - Input buffer or file path
   * @param {Object} cropArea - Crop area {left, top, width, height}
   * @returns {Promise<SharpResult>} Crop result
   */
  async crop(input, cropArea) {
    const startTime = Date.now();
    
    try {
      const instanceResult = await this.createSharpInstance(input);
      if (!instanceResult.success) {
        return instanceResult;
      }

      const { left, top, width, height } = cropArea;
      const result = await instanceResult.data
        .extract({ left, top, width, height })
        .toBuffer();

      this.stats.operationsCount++;
      this.stats.totalProcessingTime += Date.now() - startTime;
      
      this.events.emit(SharpEvents.EVENTS.OPERATION_COMPLETE, {
        type: 'crop',
        cropArea,
        duration: Date.now() - startTime,
        outputSize: result.length
      });

      return SharpResult.success(result, {
        cropArea,
        size: result.length,
        processingTime: Date.now() - startTime
      });
    } catch (error) {
      this.stats.errorsCount++;
      this.events.emit(SharpEvents.EVENTS.OPERATION_ERROR, {
        type: 'crop',
        cropArea,
        error: error.message,
        duration: Date.now() - startTime
      });
      return SharpResult.error(error);
    }
  }

  /**
   * Apply image transformations
   * @param {Buffer|string} input - Input buffer or file path
   * @param {Object} transformations - Transformation options
   * @returns {Promise<SharpResult>} Transform result
   */
  async transform(input, transformations = {}) {
    const startTime = Date.now();
    
    try {
      const instanceResult = await this.createSharpInstance(input);
      if (!instanceResult.success) {
        return instanceResult;
      }

      let sharpInstance = instanceResult.data;

      // Apply transformations in order
      if (transformations.rotate) {
        sharpInstance = sharpInstance.rotate(transformations.rotate);
      }

      if (transformations.flip) {
        sharpInstance = sharpInstance.flip();
      }

      if (transformations.flop) {
        sharpInstance = sharpInstance.flop();
      }

      if (transformations.grayscale || transformations.greyscale) {
        sharpInstance = sharpInstance.grayscale();
      }

      if (transformations.blur) {
        sharpInstance = sharpInstance.blur(transformations.blur);
      }

      if (transformations.sharpen) {
        sharpInstance = sharpInstance.sharpen(transformations.sharpen);
      }

      const result = await sharpInstance.toBuffer();

      this.stats.operationsCount++;
      this.stats.totalProcessingTime += Date.now() - startTime;
      
      this.events.emit(SharpEvents.EVENTS.OPERATION_COMPLETE, {
        type: 'transform',
        transformations,
        duration: Date.now() - startTime,
        outputSize: result.length
      });

      return SharpResult.success(result, {
        transformations,
        size: result.length,
        processingTime: Date.now() - startTime
      });
    } catch (error) {
      this.stats.errorsCount++;
      this.events.emit(SharpEvents.EVENTS.OPERATION_ERROR, {
        type: 'transform',
        transformations,
        error: error.message,
        duration: Date.now() - startTime
      });
      return SharpResult.error(error);
    }
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Re-apply Sharp settings
    if (newConfig.concurrency) {
      sharp.concurrency(newConfig.concurrency);
    }
    
    if (newConfig.cache) {
      sharp.cache({ ...this.config.cache, ...newConfig.cache });
    }
    
    if (newConfig.limitInputPixels) {
      sharp.limitInputPixels(newConfig.limitInputPixels);
    }
  }

  /**
   * Get current statistics
   * @returns {Object} Current statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageProcessingTime: this.stats.operationsCount > 0 
        ? this.stats.totalProcessingTime / this.stats.operationsCount 
        : 0,
      errorRate: this.stats.operationsCount > 0 
        ? (this.stats.errorsCount / this.stats.operationsCount) * 100 
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      operationsCount: 0,
      errorsCount: 0,
      totalProcessingTime: 0,
      memoryUsage: {
        peak: 0,
        current: 0
      }
    };
  }

  /**
   * Clear Sharp cache
   */
  clearCache() {
    sharp.cache(false);
    sharp.cache(this.config.cache);
    this.cache.clear();
    
    this.events.emit(SharpEvents.EVENTS.CACHE_CLEARED, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get Sharp library information
   * @returns {Object} Sharp library info
   */
  getSharpInfo() {
    return {
      version: sharp.versions,
      format: sharp.format,
      cache: sharp.cache(),
      concurrency: sharp.concurrency()
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.clearCache();
    this.events.removeAllListeners();
    this.isInitialized = false;
  }
}

// Global service instance
let globalSharpService = null;

/**
 * Get global Sharp service instance
 * @param {Object} config - Configuration options
 * @returns {SharpService} Global service instance
 */
function getSharpService(config = {}) {
  if (!globalSharpService) {
    globalSharpService = new SharpService(config);
  }
  return globalSharpService;
}

module.exports = {
  SharpService,
  SharpResult,
  SharpEvents,
  DEFAULT_CONFIG,
  getSharpService
};