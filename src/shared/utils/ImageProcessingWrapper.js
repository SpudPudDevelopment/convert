/**
 * Image Processing Wrapper
 * Simplified interface for image processing operations
 */

const { 
  ImageProcessingService, 
  ImageProcessingResult, 
  getImageProcessingService 
} = require('../services/ImageProcessingService');
const fs = require('fs').promises;
const path = require('path');

/**
 * Image processing operation result wrapper
 */
class ImageProcessingOperationResult {
  constructor(result) {
    this.success = result.success;
    this.outputPath = result.outputPath;
    this.outputBuffer = result.outputBuffer;
    this.metadata = result.metadata;
    this.statistics = result.statistics;
    this.processingTime = result.statistics.processingTime;
    this.warnings = result.warnings;
    this.errors = result.errors;
    this.steps = result.steps;
  }

  /**
   * Get processing summary
   */
  getSummary() {
    return {
      success: this.success,
      processingTime: this.processingTime,
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

  /**
   * Check if processing was successful
   */
  isSuccess() {
    return this.success && this.errors.length === 0;
  }

  /**
   * Get error messages
   */
  getErrors() {
    return this.errors.map(error => error.message);
  }

  /**
   * Get warning messages
   */
  getWarnings() {
    return this.warnings.map(warning => warning.message);
  }
}

/**
 * Process a single image with specified operations
 */
async function processImage(inputPath, outputPath = null, operations = {}, options = {}) {
  try {
    const service = getImageProcessingService();
    const result = await service.processImage(inputPath, outputPath, operations, options);
    return new ImageProcessingOperationResult(result);
  } catch (error) {
    const errorResult = new ImageProcessingResult();
    errorResult.addError(`Image processing failed: ${error.message}`);
    errorResult.finalize();
    return new ImageProcessingOperationResult(errorResult);
  }
}

/**
 * Resize an image
 */
async function resizeImage(inputPath, outputPath, width, height, options = {}) {
  const operations = {
    width,
    height,
    fit: options.fit || 'cover',
    position: options.position || 'center',
    background: options.background || { r: 255, g: 255, b: 255, alpha: 1 }
  };
  
  return await processImage(inputPath, outputPath, operations, options);
}

/**
 * Convert image format
 */
async function convertImageFormat(inputPath, outputPath, format, options = {}) {
  const operations = {
    format,
    quality: options.quality || 80
  };
  
  return await processImage(inputPath, outputPath, operations, options);
}

/**
 * Compress an image
 */
async function compressImage(inputPath, outputPath, quality = 80, options = {}) {
  const operations = {
    quality,
    optimize: true,
    strip: true
  };
  
  return await processImage(inputPath, outputPath, operations, options);
}

/**
 * Create image thumbnail
 */
async function createThumbnail(inputPath, outputPath, size = 150, options = {}) {
  const operations = {
    width: size,
    height: size,
    fit: 'cover',
    position: 'center'
  };
  
  return await processImage(inputPath, outputPath, operations, options);
}

/**
 * Apply image filters
 */
async function applyImageFilters(inputPath, outputPath, filters = {}, options = {}) {
  const operations = {};
  
  if (filters.sharpen) operations.sharpen = true;
  if (filters.blur) operations.blur = filters.blur;
  if (filters.normalize) operations.normalize = true;
  if (filters.grayscale) operations.grayscale = true;
  if (filters.negate) operations.negate = true;
  
  return await processImage(inputPath, outputPath, operations, options);
}

/**
 * Batch process multiple images
 */
async function batchProcessImages(inputs, operations = {}, options = {}) {
  try {
    const service = getImageProcessingService();
    const results = await service.batchProcessImages(inputs, operations, options);
    return results.map(result => new ImageProcessingOperationResult(result));
  } catch (error) {
    throw new Error(`Batch processing failed: ${error.message}`);
  }
}

/**
 * Batch resize images
 */
async function batchResizeImages(inputPaths, outputDir, width, height, options = {}) {
  const inputs = inputPaths.map(inputPath => {
    const filename = path.basename(inputPath);
    const outputPath = path.join(outputDir, filename);
    return {
      inputPath,
      outputPath,
      operations: {
        width,
        height,
        fit: options.fit || 'cover'
      }
    };
  });
  
  return await batchProcessImages(inputs, {}, options);
}

/**
 * Batch convert image formats
 */
async function batchConvertFormat(inputPaths, outputDir, format, options = {}) {
  const inputs = inputPaths.map(inputPath => {
    const filename = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${filename}.${format}`);
    return {
      inputPath,
      outputPath,
      operations: {
        format,
        quality: options.quality || 80
      }
    };
  });
  
  return await batchProcessImages(inputs, {}, options);
}

/**
 * Get image metadata
 */
async function getImageMetadata(inputPath) {
  try {
    const service = getImageProcessingService();
    return await service.getImageMetadata(inputPath);
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Validate image file
 */
async function validateImageFile(inputPath) {
  try {
    // Check if file exists
    await fs.access(inputPath);
    
    // Check file extension
    const ext = path.extname(inputPath).toLowerCase().substring(1);
    const supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'svg', 'tiff', 'tif', 'bmp', 'avif', 'heif'];
    
    if (!supportedFormats.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported image format: ${ext}`,
        supportedFormats
      };
    }
    
    // Check file size
    const stats = await fs.stat(inputPath);
    if (stats.size === 0) {
      return {
        valid: false,
        error: 'Image file is empty'
      };
    }
    
    // Try to get metadata to verify it's a valid image
    const metadataResult = await getImageMetadata(inputPath);
    if (!metadataResult.success) {
      return {
        valid: false,
        error: `Invalid image file: ${metadataResult.error}`
      };
    }
    
    return {
      valid: true,
      metadata: metadataResult.metadata,
      fileSize: stats.size,
      format: ext
    };
  } catch (error) {
    return {
      valid: false,
      error: `File validation failed: ${error.message}`
    };
  }
}

/**
 * Get image processing preview (metadata + basic info)
 */
async function getImageProcessingPreview(inputPath, maxPreviewSize = 200) {
  try {
    const validation = await validateImageFile(inputPath);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }
    
    const metadata = validation.metadata;
    const fileStats = await fs.stat(inputPath);
    
    // Calculate preview dimensions
    const aspectRatio = metadata.width / metadata.height;
    let previewWidth, previewHeight;
    
    if (aspectRatio > 1) {
      previewWidth = Math.min(maxPreviewSize, metadata.width);
      previewHeight = Math.round(previewWidth / aspectRatio);
    } else {
      previewHeight = Math.min(maxPreviewSize, metadata.height);
      previewWidth = Math.round(previewHeight * aspectRatio);
    }
    
    return {
      success: true,
      preview: {
        originalDimensions: `${metadata.width}x${metadata.height}`,
        previewDimensions: `${previewWidth}x${previewHeight}`,
        format: metadata.format,
        fileSize: fileStats.size,
        fileSizeFormatted: formatFileSize(fileStats.size),
        hasAlpha: metadata.hasAlpha,
        channels: metadata.channels,
        density: metadata.density,
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
 * Get processing statistics
 */
function getImageProcessingStatistics() {
  const service = getImageProcessingService();
  return service.getStatistics();
}

/**
 * Clear processing cache
 */
function clearImageProcessingCache() {
  const service = getImageProcessingService();
  service.clearCache();
}

/**
 * Get cache information
 */
function getImageProcessingCacheInfo() {
  const service = getImageProcessingService();
  return service.getCacheInfo();
}

/**
 * Get supported image formats
 */
function getSupportedImageFormats() {
  const service = getImageProcessingService();
  return service.getSupportedFormats();
}

/**
 * Listen to processing events
 */
function onImageProcessingEvent(eventName, callback) {
  const service = getImageProcessingService();
  service.on(eventName, callback);
}

/**
 * Remove event listener
 */
function offImageProcessingEvent(eventName, callback) {
  const service = getImageProcessingService();
  service.off(eventName, callback);
}

/**
 * Estimate processing time based on image size and operations
 */
function estimateProcessingTime(imageMetadata, operations = {}) {
  const baseTime = 100; // Base processing time in ms
  const pixelCount = imageMetadata.width * imageMetadata.height;
  const pixelFactor = pixelCount / (1920 * 1080); // Normalize to 1080p
  
  let estimatedTime = baseTime * Math.max(0.1, pixelFactor);
  
  // Add time for specific operations
  if (operations.resize || operations.width || operations.height) {
    estimatedTime += 50;
  }
  if (operations.format) {
    estimatedTime += 30;
  }
  if (operations.sharpen) {
    estimatedTime += 100;
  }
  if (operations.blur) {
    estimatedTime += 80;
  }
  if (operations.normalize) {
    estimatedTime += 60;
  }
  
  return Math.round(estimatedTime);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get optimal image format for web
 */
function getOptimalWebFormat(inputFormat, hasAlpha = false) {
  // Modern browsers support WebP
  if (hasAlpha) {
    return 'webp'; // WebP supports transparency
  }
  
  // For photos without transparency, WebP is usually best
  if (inputFormat === 'jpeg' || inputFormat === 'jpg') {
    return 'webp';
  }
  
  // For graphics with few colors, PNG might be better
  if (inputFormat === 'png' || inputFormat === 'gif') {
    return 'webp';
  }
  
  return 'webp'; // Default to WebP for web optimization
}

/**
 * Create responsive image variants
 */
async function createResponsiveVariants(inputPath, outputDir, options = {}) {
  const variants = options.variants || [
    { suffix: '_small', width: 480 },
    { suffix: '_medium', width: 768 },
    { suffix: '_large', width: 1200 },
    { suffix: '_xlarge', width: 1920 }
  ];
  
  const format = options.format || 'webp';
  const quality = options.quality || 80;
  
  const filename = path.basename(inputPath, path.extname(inputPath));
  const results = [];
  
  for (const variant of variants) {
    const outputPath = path.join(outputDir, `${filename}${variant.suffix}.${format}`);
    
    const operations = {
      width: variant.width,
      format,
      quality
    };
    
    const result = await processImage(inputPath, outputPath, operations, options);
    results.push({
      variant: variant.suffix,
      width: variant.width,
      outputPath,
      result
    });
  }
  
  return results;
}

module.exports = {
  ImageProcessingOperationResult,
  processImage,
  resizeImage,
  convertImageFormat,
  compressImage,
  createThumbnail,
  applyImageFilters,
  batchProcessImages,
  batchResizeImages,
  batchConvertFormat,
  getImageMetadata,
  validateImageFile,
  getImageProcessingPreview,
  getImageProcessingStatistics,
  clearImageProcessingCache,
  getImageProcessingCacheInfo,
  getSupportedImageFormats,
  onImageProcessingEvent,
  offImageProcessingEvent,
  estimateProcessingTime,
  formatFileSize,
  getOptimalWebFormat,
  createResponsiveVariants
};