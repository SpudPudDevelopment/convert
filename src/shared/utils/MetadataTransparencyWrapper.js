const { getMetadataTransparencyService, DEFAULT_METADATA_OPTIONS, DEFAULT_TRANSPARENCY_OPTIONS } = require('../services/MetadataTransparencyService');
const path = require('path');

/**
 * Simplified wrapper functions for metadata and transparency operations
 */

/**
 * Extract metadata from an image file
 * @param {string|Buffer} imagePath - Path to image file or buffer
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} Extracted metadata
 */
async function extractImageMetadata(imagePath, options = {}) {
    const service = getMetadataTransparencyService();
    return await service.extractMetadata(imagePath, options);
}

/**
 * Analyze transparency information in an image
 * @param {string|Buffer} imagePath - Path to image file or buffer
 * @returns {Promise<Object>} Transparency analysis
 */
async function analyzeImageTransparency(imagePath) {
    const service = getMetadataTransparencyService();
    return await service.analyzeTransparency(imagePath);
}

/**
 * Convert image with metadata preservation
 * @param {string|Buffer} inputPath - Input image path or buffer
 * @param {string} outputPath - Output image path
 * @param {string} targetFormat - Target format (jpg, png, webp)
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} Conversion result with metadata info
 */
async function convertWithMetadata(inputPath, outputPath, targetFormat, options = {}) {
    const service = getMetadataTransparencyService();
    
    const conversionOptions = {
        metadata: { ...DEFAULT_METADATA_OPTIONS, ...options.metadata },
        transparency: { ...DEFAULT_TRANSPARENCY_OPTIONS, ...options.transparency },
        format: options.format || {}
    };
    
    return await service.processImageWithMetadata(inputPath, outputPath, targetFormat, conversionOptions);
}

/**
 * Convert image preserving all metadata
 * @param {string|Buffer} inputPath - Input image path or buffer
 * @param {string} outputPath - Output image path
 * @param {string} targetFormat - Target format
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Conversion result
 */
async function convertPreservingMetadata(inputPath, outputPath, targetFormat, options = {}) {
    return await convertWithMetadata(inputPath, outputPath, targetFormat, {
        ...options,
        metadata: {
            preserveExif: true,
            preserveIptc: true,
            preserveXmp: true,
            preserveIcc: true,
            preserveDensity: true,
            preserveOrientation: true,
            preserveCreationTime: true,
            preserveDescription: true,
            preserveCopyright: true,
            preserveArtist: true,
            stripSensitiveData: false
        }
    });
}

/**
 * Convert image stripping all metadata
 * @param {string|Buffer} inputPath - Input image path or buffer
 * @param {string} outputPath - Output image path
 * @param {string} targetFormat - Target format
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Conversion result
 */
async function convertStrippingMetadata(inputPath, outputPath, targetFormat, options = {}) {
    return await convertWithMetadata(inputPath, outputPath, targetFormat, {
        ...options,
        metadata: {
            preserveExif: false,
            preserveIptc: false,
            preserveXmp: false,
            preserveIcc: false,
            preserveDensity: false,
            preserveOrientation: false,
            preserveCreationTime: false,
            preserveDescription: false,
            preserveCopyright: false,
            preserveArtist: false,
            stripSensitiveData: true
        }
    });
}

/**
 * Convert image preserving transparency
 * @param {string|Buffer} inputPath - Input image path or buffer
 * @param {string} outputPath - Output image path
 * @param {string} targetFormat - Target format
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Conversion result
 */
async function convertPreservingTransparency(inputPath, outputPath, targetFormat, options = {}) {
    return await convertWithMetadata(inputPath, outputPath, targetFormat, {
        ...options,
        transparency: {
            preserveTransparency: true,
            transparencyMode: 'preserve'
        }
    });
}

/**
 * Convert image removing transparency with white background
 * @param {string|Buffer} inputPath - Input image path or buffer
 * @param {string} outputPath - Output image path
 * @param {string} targetFormat - Target format
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Conversion result
 */
async function convertRemovingTransparency(inputPath, outputPath, targetFormat, options = {}) {
    return await convertWithMetadata(inputPath, outputPath, targetFormat, {
        ...options,
        transparency: {
            preserveTransparency: false,
            backgroundColor: { r: 255, g: 255, b: 255 },
            transparencyMode: 'background'
        }
    });
}

/**
 * Convert image removing transparency with custom background
 * @param {string|Buffer} inputPath - Input image path or buffer
 * @param {string} outputPath - Output image path
 * @param {string} targetFormat - Target format
 * @param {Object} backgroundColor - Background color {r, g, b}
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Conversion result
 */
async function convertWithBackground(inputPath, outputPath, targetFormat, backgroundColor, options = {}) {
    return await convertWithMetadata(inputPath, outputPath, targetFormat, {
        ...options,
        transparency: {
            preserveTransparency: false,
            backgroundColor: backgroundColor,
            transparencyMode: 'background'
        }
    });
}

/**
 * Batch convert images with metadata preservation
 * @param {Array} conversions - Array of {input, output, format} objects
 * @param {Object} options - Conversion options
 * @param {number} concurrency - Number of concurrent conversions
 * @returns {Promise<Array>} Array of conversion results
 */
async function batchConvertWithMetadata(conversions, options = {}, concurrency = 3) {
    const service = getMetadataTransparencyService();
    const results = [];
    
    // Process conversions in batches
    for (let i = 0; i < conversions.length; i += concurrency) {
        const batch = conversions.slice(i, i + concurrency);
        const batchPromises = batch.map(async (conversion) => {
            try {
                const result = await convertWithMetadata(
                    conversion.input,
                    conversion.output,
                    conversion.format,
                    options
                );
                return {
                    success: true,
                    input: conversion.input,
                    output: conversion.output,
                    format: conversion.format,
                    result
                };
            } catch (error) {
                return {
                    success: false,
                    input: conversion.input,
                    output: conversion.output,
                    format: conversion.format,
                    error: error.message
                };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }
    
    return results;
}

/**
 * Get comprehensive image information including metadata and transparency
 * @param {string|Buffer} imagePath - Path to image file or buffer
 * @returns {Promise<Object>} Complete image information
 */
async function getImageInfo(imagePath) {
    const service = getMetadataTransparencyService();
    
    const [metadata, transparency] = await Promise.all([
        service.extractMetadata(imagePath),
        service.analyzeTransparency(imagePath)
    ]);
    
    return {
        metadata,
        transparency,
        filename: typeof imagePath === 'string' ? path.basename(imagePath) : 'buffer',
        hasMetadata: Object.keys(metadata).length > 0,
        hasTransparency: transparency.hasAlpha,
        supportsTransparency: transparency.supportsTransparency,
        recommendedFormats: getRecommendedFormats(metadata, transparency)
    };
}

/**
 * Get recommended formats based on image characteristics
 * @param {Object} metadata - Image metadata
 * @param {Object} transparency - Transparency information
 * @returns {Array} Recommended formats with reasons
 */
function getRecommendedFormats(metadata, transparency) {
    const recommendations = [];
    
    // PNG recommendations
    if (transparency.hasAlpha) {
        recommendations.push({
            format: 'png',
            reason: 'Preserves transparency',
            priority: 'high'
        });
    }
    
    if (metadata.channels === 1 || metadata.channels === 2) {
        recommendations.push({
            format: 'png',
            reason: 'Optimal for grayscale images',
            priority: 'medium'
        });
    }
    
    // WEBP recommendations
    recommendations.push({
        format: 'webp',
        reason: 'Modern format with excellent compression',
        priority: transparency.hasAlpha ? 'high' : 'medium'
    });
    
    // JPEG recommendations
    if (!transparency.hasAlpha && metadata.channels >= 3) {
        recommendations.push({
            format: 'jpeg',
            reason: 'Excellent for photos without transparency',
            priority: 'medium'
        });
    }
    
    return recommendations.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
}

/**
 * Compare metadata between two images
 * @param {string|Buffer} image1 - First image
 * @param {string|Buffer} image2 - Second image
 * @returns {Promise<Object>} Metadata comparison
 */
async function compareMetadata(image1, image2) {
    const service = getMetadataTransparencyService();
    
    const [metadata1, metadata2] = await Promise.all([
        service.extractMetadata(image1),
        service.extractMetadata(image2)
    ]);
    
    const comparison = {
        identical: JSON.stringify(metadata1) === JSON.stringify(metadata2),
        differences: [],
        commonFields: [],
        uniqueToFirst: [],
        uniqueToSecond: []
    };
    
    const allKeys = new Set([...Object.keys(metadata1), ...Object.keys(metadata2)]);
    
    for (const key of allKeys) {
        if (key in metadata1 && key in metadata2) {
            if (JSON.stringify(metadata1[key]) === JSON.stringify(metadata2[key])) {
                comparison.commonFields.push(key);
            } else {
                comparison.differences.push({
                    field: key,
                    value1: metadata1[key],
                    value2: metadata2[key]
                });
            }
        } else if (key in metadata1) {
            comparison.uniqueToFirst.push({ field: key, value: metadata1[key] });
        } else {
            comparison.uniqueToSecond.push({ field: key, value: metadata2[key] });
        }
    }
    
    return comparison;
}

/**
 * Estimate metadata size in bytes
 * @param {Object} metadata - Metadata object
 * @returns {number} Estimated size in bytes
 */
function estimateMetadataSize(metadata) {
    return JSON.stringify(metadata).length;
}

/**
 * Check if format supports transparency
 * @param {string} format - Image format
 * @returns {boolean} Whether format supports transparency
 */
function formatSupportsTransparency(format) {
    return ['png', 'webp', 'gif', 'tiff'].includes(format.toLowerCase());
}

/**
 * Get optimal background color for transparency removal
 * @param {Object} transparencyInfo - Transparency analysis
 * @param {string} targetFormat - Target format
 * @returns {Object} Recommended background color
 */
function getOptimalBackgroundColor(transparencyInfo, targetFormat) {
    // Default to white for most cases
    let backgroundColor = { r: 255, g: 255, b: 255 };
    
    // For JPEG, always use white as it doesn't support transparency
    if (targetFormat.toLowerCase() === 'jpeg' || targetFormat.toLowerCase() === 'jpg') {
        backgroundColor = { r: 255, g: 255, b: 255 };
    }
    
    return backgroundColor;
}

/**
 * Get service statistics
 * @returns {Object} Processing statistics
 */
function getMetadataStatistics() {
    const service = getMetadataTransparencyService();
    return service.getStatistics();
}

/**
 * Reset service statistics
 */
function resetMetadataStatistics() {
    const service = getMetadataTransparencyService();
    service.resetStatistics();
}

/**
 * Clear service cache
 */
function clearMetadataCache() {
    const service = getMetadataTransparencyService();
    service.clearCache();
}

/**
 * Get cache information
 * @returns {Object} Cache information
 */
function getMetadataCacheInfo() {
    const service = getMetadataTransparencyService();
    return service.getCacheInfo();
}

/**
 * Set up event listeners for metadata operations
 * @param {Object} handlers - Event handler functions
 */
function setupMetadataEventListeners(handlers) {
    const service = getMetadataTransparencyService();
    
    if (handlers.onMetadataExtracted) {
        service.on('metadata_extracted', handlers.onMetadataExtracted);
    }
    
    if (handlers.onMetadataPreserved) {
        service.on('metadata_preserved', handlers.onMetadataPreserved);
    }
    
    if (handlers.onTransparencyDetected) {
        service.on('transparency_detected', handlers.onTransparencyDetected);
    }
    
    if (handlers.onTransparencyProcessed) {
        service.on('transparency_processed', handlers.onTransparencyProcessed);
    }
    
    if (handlers.onBackgroundApplied) {
        service.on('background_applied', handlers.onBackgroundApplied);
    }
    
    if (handlers.onError) {
        service.on('error', handlers.onError);
    }
}

module.exports = {
    // Core functions
    extractImageMetadata,
    analyzeImageTransparency,
    convertWithMetadata,
    
    // Convenience functions
    convertPreservingMetadata,
    convertStrippingMetadata,
    convertPreservingTransparency,
    convertRemovingTransparency,
    convertWithBackground,
    
    // Batch operations
    batchConvertWithMetadata,
    
    // Analysis functions
    getImageInfo,
    compareMetadata,
    getRecommendedFormats,
    
    // Utility functions
    estimateMetadataSize,
    formatSupportsTransparency,
    getOptimalBackgroundColor,
    
    // Statistics and cache
    getMetadataStatistics,
    resetMetadataStatistics,
    clearMetadataCache,
    getMetadataCacheInfo,
    
    // Events
    setupMetadataEventListeners
};