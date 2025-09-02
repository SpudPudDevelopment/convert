const { getSharpService, SharpEvents } = require('../services/SharpService');

/**
 * Simplified wrapper functions for common Sharp operations
 */

/**
 * Convert image to JPEG format
 * @param {Buffer|string} input - Input buffer or file path
 * @param {Object} options - JPEG options
 * @returns {Promise<Buffer>} Converted image buffer
 */
async function convertToJpeg(input, options = {}) {
  const sharpService = getSharpService();
  const result = await sharpService.convertFormat(input, 'jpeg', options);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Convert image to PNG format
 * @param {Buffer|string} input - Input buffer or file path
 * @param {Object} options - PNG options
 * @returns {Promise<Buffer>} Converted image buffer
 */
async function convertToPng(input, options = {}) {
  const sharpService = getSharpService();
  const result = await sharpService.convertFormat(input, 'png', options);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Convert image to WebP format
 * @param {Buffer|string} input - Input buffer or file path
 * @param {Object} options - WebP options
 * @returns {Promise<Buffer>} Converted image buffer
 */
async function convertToWebp(input, options = {}) {
  const sharpService = getSharpService();
  const result = await sharpService.convertFormat(input, 'webp', options);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Get image metadata
 * @param {Buffer|string} input - Input buffer or file path
 * @returns {Promise<Object>} Image metadata
 */
async function getImageMetadata(input) {
  const sharpService = getSharpService();
  const result = await sharpService.getMetadata(input);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Resize image
 * @param {Buffer|string} input - Input buffer or file path
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @param {Object} options - Resize options
 * @returns {Promise<Buffer>} Resized image buffer
 */
async function resizeImage(input, width, height, options = {}) {
  const sharpService = getSharpService();
  const result = await sharpService.resize(input, { width, height }, options);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Crop image
 * @param {Buffer|string} input - Input buffer or file path
 * @param {number} left - Left position
 * @param {number} top - Top position
 * @param {number} width - Crop width
 * @param {number} height - Crop height
 * @returns {Promise<Buffer>} Cropped image buffer
 */
async function cropImage(input, left, top, width, height) {
  const sharpService = getSharpService();
  const result = await sharpService.crop(input, { left, top, width, height });
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Rotate image
 * @param {Buffer|string} input - Input buffer or file path
 * @param {number} angle - Rotation angle in degrees
 * @returns {Promise<Buffer>} Rotated image buffer
 */
async function rotateImage(input, angle) {
  const sharpService = getSharpService();
  const result = await sharpService.transform(input, { rotate: angle });
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Convert image to grayscale
 * @param {Buffer|string} input - Input buffer or file path
 * @returns {Promise<Buffer>} Grayscale image buffer
 */
async function convertToGrayscale(input) {
  const sharpService = getSharpService();
  const result = await sharpService.transform(input, { grayscale: true });
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Flip image vertically
 * @param {Buffer|string} input - Input buffer or file path
 * @returns {Promise<Buffer>} Flipped image buffer
 */
async function flipImage(input) {
  const sharpService = getSharpService();
  const result = await sharpService.transform(input, { flip: true });
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Flop image horizontally
 * @param {Buffer|string} input - Input buffer or file path
 * @returns {Promise<Buffer>} Flopped image buffer
 */
async function flopImage(input) {
  const sharpService = getSharpService();
  const result = await sharpService.transform(input, { flop: true });
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Apply blur effect to image
 * @param {Buffer|string} input - Input buffer or file path
 * @param {number} sigma - Blur sigma (0.3 to 1000)
 * @returns {Promise<Buffer>} Blurred image buffer
 */
async function blurImage(input, sigma = 1) {
  const sharpService = getSharpService();
  const result = await sharpService.transform(input, { blur: sigma });
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Apply sharpen effect to image
 * @param {Buffer|string} input - Input buffer or file path
 * @param {number} sigma - Sharpen sigma
 * @returns {Promise<Buffer>} Sharpened image buffer
 */
async function sharpenImage(input, sigma = 1) {
  const sharpService = getSharpService();
  const result = await sharpService.transform(input, { sharpen: sigma });
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Create thumbnail with specific dimensions
 * @param {Buffer|string} input - Input buffer or file path
 * @param {number} size - Thumbnail size (width and height)
 * @param {Object} options - Thumbnail options
 * @returns {Promise<Buffer>} Thumbnail buffer
 */
async function createThumbnail(input, size = 150, options = {}) {
  const defaultOptions = {
    fit: 'cover',
    position: 'center',
    withoutEnlargement: true,
    ...options
  };
  
  return await resizeImage(input, size, size, defaultOptions);
}

/**
 * Resize image to fit within maximum dimensions
 * @param {Buffer|string} input - Input buffer or file path
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @param {Object} options - Resize options
 * @returns {Promise<Buffer>} Resized image buffer
 */
async function resizeToFit(input, maxWidth, maxHeight, options = {}) {
  const defaultOptions = {
    fit: 'inside',
    withoutEnlargement: true,
    ...options
  };
  
  return await resizeImage(input, maxWidth, maxHeight, defaultOptions);
}

/**
 * Convert image format with quality setting
 * @param {Buffer|string} input - Input buffer or file path
 * @param {string} format - Target format (jpeg, png, webp)
 * @param {number} quality - Quality setting (1-100 for JPEG/WebP, 0-9 for PNG)
 * @returns {Promise<Buffer>} Converted image buffer
 */
async function convertWithQuality(input, format, quality) {
  const sharpService = getSharpService();
  
  let options = {};
  if (format.toLowerCase() === 'png') {
    options.compressionLevel = Math.max(0, Math.min(9, quality));
  } else {
    options.quality = Math.max(1, Math.min(100, quality));
  }
  
  const result = await sharpService.convertFormat(input, format, options);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

/**
 * Batch process multiple images
 * @param {Array} inputs - Array of input buffers or file paths
 * @param {Function} operation - Operation function to apply
 * @param {Object} options - Batch processing options
 * @returns {Promise<Array>} Array of processed results
 */
async function batchProcess(inputs, operation, options = {}) {
  const { concurrency = 4, continueOnError = true } = options;
  const results = [];
  
  // Process in batches to control concurrency
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (input, index) => {
      try {
        const result = await operation(input);
        return { success: true, data: result, index: i + index };
      } catch (error) {
        if (!continueOnError) {
          throw error;
        }
        return { success: false, error, index: i + index };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Get image dimensions
 * @param {Buffer|string} input - Input buffer or file path
 * @returns {Promise<Object>} Image dimensions {width, height}
 */
async function getImageDimensions(input) {
  const metadata = await getImageMetadata(input);
  return {
    width: metadata.width,
    height: metadata.height
  };
}

/**
 * Check if image has transparency
 * @param {Buffer|string} input - Input buffer or file path
 * @returns {Promise<boolean>} True if image has transparency
 */
async function hasTransparency(input) {
  const metadata = await getImageMetadata(input);
  return metadata.hasAlpha || metadata.channels === 4;
}

/**
 * Get image format
 * @param {Buffer|string} input - Input buffer or file path
 * @returns {Promise<string>} Image format
 */
async function getImageFormat(input) {
  const metadata = await getImageMetadata(input);
  return metadata.format;
}

/**
 * Get image file size
 * @param {Buffer|string} input - Input buffer or file path
 * @returns {Promise<number>} File size in bytes
 */
async function getImageSize(input) {
  const metadata = await getImageMetadata(input);
  return metadata.size;
}

/**
 * Optimize image for web
 * @param {Buffer|string} input - Input buffer or file path
 * @param {Object} options - Optimization options
 * @returns {Promise<Buffer>} Optimized image buffer
 */
async function optimizeForWeb(input, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 85,
    format = 'auto'
  } = options;
  
  const metadata = await getImageMetadata(input);
  let targetFormat = format;
  
  if (format === 'auto') {
    // Choose optimal format based on image characteristics
    if (metadata.hasAlpha) {
      targetFormat = 'webp'; // WebP supports transparency
    } else if (metadata.channels === 1) {
      targetFormat = 'jpeg'; // Grayscale images work well with JPEG
    } else {
      targetFormat = 'webp'; // WebP generally provides better compression
    }
  }
  
  // Resize if needed
  let processedBuffer = input;
  if (metadata.width > maxWidth || metadata.height > maxHeight) {
    processedBuffer = await resizeToFit(input, maxWidth, maxHeight);
  }
  
  // Convert with quality
  return await convertWithQuality(processedBuffer, targetFormat, quality);
}

/**
 * Get Sharp service statistics
 * @returns {Object} Service statistics
 */
function getSharpStats() {
  const sharpService = getSharpService();
  return sharpService.getStats();
}

/**
 * Reset Sharp service statistics
 */
function resetSharpStats() {
  const sharpService = getSharpService();
  sharpService.resetStats();
}

/**
 * Clear Sharp cache
 */
function clearSharpCache() {
  const sharpService = getSharpService();
  sharpService.clearCache();
}

/**
 * Get Sharp library information
 * @returns {Object} Sharp library info
 */
function getSharpInfo() {
  const sharpService = getSharpService();
  return sharpService.getSharpInfo();
}

/**
 * Subscribe to Sharp events
 * @param {string} event - Event name
 * @param {Function} callback - Event callback
 */
function onSharpEvent(event, callback) {
  const sharpService = getSharpService();
  sharpService.events.on(event, callback);
}

/**
 * Unsubscribe from Sharp events
 * @param {string} event - Event name
 * @param {Function} callback - Event callback
 */
function offSharpEvent(event, callback) {
  const sharpService = getSharpService();
  sharpService.events.off(event, callback);
}

/**
 * Update Sharp configuration
 * @param {Object} config - New configuration
 */
function updateSharpConfig(config) {
  const sharpService = getSharpService();
  sharpService.updateConfig(config);
}

module.exports = {
  // Format conversion
  convertToJpeg,
  convertToPng,
  convertToWebp,
  convertWithQuality,
  
  // Image information
  getImageMetadata,
  getImageDimensions,
  getImageFormat,
  getImageSize,
  hasTransparency,
  
  // Image manipulation
  resizeImage,
  resizeToFit,
  cropImage,
  rotateImage,
  createThumbnail,
  
  // Image effects
  convertToGrayscale,
  flipImage,
  flopImage,
  blurImage,
  sharpenImage,
  
  // Optimization
  optimizeForWeb,
  
  // Batch processing
  batchProcess,
  
  // Service management
  getSharpStats,
  resetSharpStats,
  clearSharpCache,
  getSharpInfo,
  updateSharpConfig,
  
  // Events
  onSharpEvent,
  offSharpEvent,
  SharpEvents
};