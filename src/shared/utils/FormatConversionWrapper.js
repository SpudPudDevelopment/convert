const { getFormatConversionService } = require('../services/FormatConversionService');
const path = require('path');

/**
 * Simplified wrapper functions for format conversion operations
 */

/**
 * Convert JPG/JPEG to PNG
 */
async function jpgToPng(inputPath, outputPath = null, options = {}) {
  const service = getFormatConversionService();
  
  if (!outputPath) {
    outputPath = _generateOutputPath(inputPath, 'png');
  }
  
  const conversionOptions = {
    compressionLevel: options.compressionLevel || 6,
    progressive: options.progressive !== false,
    palette: options.palette || false,
    ...options
  };
  
  return await service.convertFormat(inputPath, outputPath, 'png', conversionOptions);
}

/**
 * Convert PNG to JPG/JPEG
 */
async function pngToJpg(inputPath, outputPath = null, options = {}) {
  const service = getFormatConversionService();
  
  if (!outputPath) {
    outputPath = _generateOutputPath(inputPath, 'jpg');
  }
  
  const conversionOptions = {
    quality: options.quality || 85,
    progressive: options.progressive !== false,
    mozjpeg: options.mozjpeg !== false,
    ...options
  };
  
  return await service.convertFormat(inputPath, outputPath, 'jpeg', conversionOptions);
}

/**
 * Convert JPG/JPEG to WEBP
 */
async function jpgToWebp(inputPath, outputPath = null, options = {}) {
  const service = getFormatConversionService();
  
  if (!outputPath) {
    outputPath = _generateOutputPath(inputPath, 'webp');
  }
  
  const conversionOptions = {
    quality: options.quality || 85,
    lossless: options.lossless || false,
    nearLossless: options.nearLossless || false,
    smartSubsample: options.smartSubsample !== false,
    ...options
  };
  
  return await service.convertFormat(inputPath, outputPath, 'webp', conversionOptions);
}

/**
 * Convert WEBP to JPG/JPEG
 */
async function webpToJpg(inputPath, outputPath = null, options = {}) {
  const service = getFormatConversionService();
  
  if (!outputPath) {
    outputPath = _generateOutputPath(inputPath, 'jpg');
  }
  
  const conversionOptions = {
    quality: options.quality || 85,
    progressive: options.progressive !== false,
    mozjpeg: options.mozjpeg !== false,
    ...options
  };
  
  return await service.convertFormat(inputPath, outputPath, 'jpeg', conversionOptions);
}

/**
 * Convert PNG to WEBP
 */
async function pngToWebp(inputPath, outputPath = null, options = {}) {
  const service = getFormatConversionService();
  
  if (!outputPath) {
    outputPath = _generateOutputPath(inputPath, 'webp');
  }
  
  const conversionOptions = {
    quality: options.quality || 85,
    lossless: options.lossless || false,
    nearLossless: options.nearLossless || false,
    smartSubsample: options.smartSubsample !== false,
    ...options
  };
  
  return await service.convertFormat(inputPath, outputPath, 'webp', conversionOptions);
}

/**
 * Convert WEBP to PNG
 */
async function webpToPng(inputPath, outputPath = null, options = {}) {
  const service = getFormatConversionService();
  
  if (!outputPath) {
    outputPath = _generateOutputPath(inputPath, 'png');
  }
  
  const conversionOptions = {
    compressionLevel: options.compressionLevel || 6,
    progressive: options.progressive !== false,
    palette: options.palette || false,
    ...options
  };
  
  return await service.convertFormat(inputPath, outputPath, 'png', conversionOptions);
}

/**
 * Auto-detect format and convert to target format
 */
async function convertToFormat(inputPath, targetFormat, outputPath = null, options = {}) {
  const service = getFormatConversionService();
  
  if (!outputPath) {
    outputPath = _generateOutputPath(inputPath, targetFormat.toLowerCase());
  }
  
  return await service.convertFormat(inputPath, outputPath, targetFormat, options);
}

/**
 * Convert image buffer to target format
 */
async function convertBufferToFormat(inputBuffer, targetFormat, options = {}) {
  const service = getFormatConversionService();
  return await service.convertBuffer(inputBuffer, targetFormat, options);
}

/**
 * Batch convert multiple images with the same target format
 */
async function batchConvertToFormat(inputPaths, targetFormat, outputDir = null, options = {}) {
  const service = getFormatConversionService();
  
  const conversions = inputPaths.map(inputPath => {
    const outputPath = outputDir 
      ? path.join(outputDir, _generateOutputFilename(inputPath, targetFormat))
      : _generateOutputPath(inputPath, targetFormat);
    
    return {
      inputPath,
      outputPath,
      targetFormat,
      options: options.conversionOptions || {}
    };
  });
  
  return await service.batchConvert(conversions, options);
}

/**
 * Batch convert with different target formats for each file
 */
async function batchConvertMixed(conversions, options = {}) {
  const service = getFormatConversionService();
  
  const normalizedConversions = conversions.map(conv => {
    const outputPath = conv.outputPath || _generateOutputPath(conv.inputPath, conv.targetFormat);
    return {
      inputPath: conv.inputPath,
      outputPath,
      targetFormat: conv.targetFormat,
      options: conv.options || {}
    };
  });
  
  return await service.batchConvert(normalizedConversions, options);
}

/**
 * Get optimal format recommendation based on image characteristics
 */
async function getOptimalFormat(inputPath, criteria = {}) {
  const service = getFormatConversionService();
  
  try {
    // Get image metadata to analyze characteristics
    const sharp = require('sharp');
    const metadata = await sharp(inputPath).metadata();
    
    const {
      prioritizeSize = false,
      prioritizeQuality = false,
      supportTransparency = false,
      targetUse = 'web' // 'web', 'print', 'archive'
    } = criteria;
    
    // Analyze image characteristics
    const hasTransparency = metadata.channels === 4 || metadata.hasAlpha;
    const isPhotographic = metadata.density && metadata.density > 150;
    const isLargeImage = (metadata.width * metadata.height) > 1000000; // > 1MP
    
    let recommendation = {
      format: 'jpeg',
      reason: 'Default choice for photographs',
      alternatives: []
    };
    
    // Decision logic
    if (hasTransparency && supportTransparency) {
      if (prioritizeSize) {
        recommendation = {
          format: 'webp',
          reason: 'Best compression with transparency support',
          alternatives: ['png']
        };
      } else {
        recommendation = {
          format: 'png',
          reason: 'Lossless transparency support',
          alternatives: ['webp']
        };
      }
    } else if (prioritizeSize) {
      recommendation = {
        format: 'webp',
        reason: 'Superior compression efficiency',
        alternatives: ['jpeg']
      };
    } else if (prioritizeQuality && !isPhotographic) {
      recommendation = {
        format: 'png',
        reason: 'Lossless quality for non-photographic content',
        alternatives: ['webp']
      };
    } else if (targetUse === 'web' && isLargeImage) {
      recommendation = {
        format: 'webp',
        reason: 'Optimal for large web images',
        alternatives: ['jpeg']
      };
    }
    
    return {
      ...recommendation,
      metadata,
      analysis: {
        hasTransparency,
        isPhotographic,
        isLargeImage,
        originalFormat: metadata.format
      }
    };
    
  } catch (error) {
    throw new Error(`Failed to analyze image for format recommendation: ${error.message}`);
  }
}

/**
 * Compare file sizes across different formats
 */
async function compareFormats(inputPath, formats = ['jpeg', 'png', 'webp'], options = {}) {
  const service = getFormatConversionService();
  const results = [];
  
  for (const format of formats) {
    try {
      const result = await service.convertBuffer(
        await require('fs').promises.readFile(inputPath),
        format,
        options[format] || {}
      );
      
      results.push({
        format,
        size: result.convertedSize,
        compressionRatio: result.compressionRatio,
        success: true
      });
    } catch (error) {
      results.push({
        format,
        size: 0,
        compressionRatio: 0,
        success: false,
        error: error.message
      });
    }
  }
  
  // Sort by size (smallest first)
  results.sort((a, b) => a.size - b.size);
  
  return {
    results,
    smallest: results.find(r => r.success),
    largest: results.filter(r => r.success).pop(),
    recommendations: {
      bestCompression: results.find(r => r.success),
      balanced: results.find(r => r.success && r.format === 'webp') || results.find(r => r.success)
    }
  };
}

/**
 * Get conversion statistics
 */
function getConversionStats() {
  const service = getFormatConversionService();
  return service.getConversionStats();
}

/**
 * Get supported conversion paths
 */
function getSupportedConversions() {
  const service = getFormatConversionService();
  return service.getSupportedConversions();
}

/**
 * Clear conversion cache
 */
function clearConversionCache() {
  const service = getFormatConversionService();
  return service.clearCache();
}

/**
 * Get cache information
 */
function getConversionCacheInfo() {
  const service = getFormatConversionService();
  return service.getCacheInfo();
}

/**
 * Listen to conversion events
 */
function onConversionEvent(eventName, callback) {
  const service = getFormatConversionService();
  service.on(eventName, callback);
  
  // Return unsubscribe function
  return () => service.off(eventName, callback);
}

/**
 * Estimate conversion time based on file size and format
 */
function estimateConversionTime(fileSizeBytes, sourceFormat, targetFormat) {
  // Base processing time per MB (in milliseconds)
  const baseTimePerMB = {
    'jpeg_to_png': 150,
    'png_to_jpeg': 100,
    'jpeg_to_webp': 120,
    'webp_to_jpeg': 110,
    'png_to_webp': 130,
    'webp_to_png': 140
  };
  
  const fileSizeMB = fileSizeBytes / (1024 * 1024);
  const conversionKey = `${sourceFormat}_to_${targetFormat}`;
  const timePerMB = baseTimePerMB[conversionKey] || 125; // Default
  
  const estimatedTime = Math.max(50, fileSizeMB * timePerMB); // Minimum 50ms
  
  return {
    estimatedTimeMs: Math.round(estimatedTime),
    estimatedTimeSeconds: Math.round(estimatedTime / 1000 * 10) / 10,
    confidence: baseTimePerMB[conversionKey] ? 'high' : 'medium'
  };
}

// Helper functions

function _generateOutputPath(inputPath, targetFormat) {
  const parsedPath = path.parse(inputPath);
  const extension = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
  return path.join(parsedPath.dir, `${parsedPath.name}.${extension}`);
}

function _generateOutputFilename(inputPath, targetFormat) {
  const parsedPath = path.parse(inputPath);
  const extension = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
  return `${parsedPath.name}.${extension}`;
}

module.exports = {
  // Direct conversion functions
  jpgToPng,
  pngToJpg,
  jpgToWebp,
  webpToJpg,
  pngToWebp,
  webpToPng,
  
  // Generic conversion functions
  convertToFormat,
  convertBufferToFormat,
  
  // Batch operations
  batchConvertToFormat,
  batchConvertMixed,
  
  // Analysis and optimization
  getOptimalFormat,
  compareFormats,
  estimateConversionTime,
  
  // Utility functions
  getConversionStats,
  getSupportedConversions,
  clearConversionCache,
  getConversionCacheInfo,
  onConversionEvent
};