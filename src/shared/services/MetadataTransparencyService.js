const sharp = require('sharp');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;

/**
 * Metadata preservation result class
 */
class MetadataResult {
    constructor(originalMetadata, preservedMetadata, transparencyInfo) {
        this.originalMetadata = originalMetadata;
        this.preservedMetadata = preservedMetadata;
        this.transparencyInfo = transparencyInfo;
        this.timestamp = new Date().toISOString();
    }

    hasTransparency() {
        return this.transparencyInfo && this.transparencyInfo.hasAlpha;
    }

    getPreservedFields() {
        return Object.keys(this.preservedMetadata || {});
    }

    getMetadataSize() {
        return JSON.stringify(this.preservedMetadata || {}).length;
    }
}

/**
 * Events emitted by the metadata and transparency service
 */
const MetadataTransparencyEvents = {
    METADATA_EXTRACTED: 'metadata_extracted',
    METADATA_PRESERVED: 'metadata_preserved',
    TRANSPARENCY_DETECTED: 'transparency_detected',
    TRANSPARENCY_PROCESSED: 'transparency_processed',
    BACKGROUND_APPLIED: 'background_applied',
    ERROR: 'error'
};

/**
 * Supported metadata fields
 */
const METADATA_FIELDS = {
    EXIF: 'exif',
    IPTC: 'iptc',
    XMP: 'xmp',
    ICC: 'icc',
    DENSITY: 'density',
    ORIENTATION: 'orientation',
    CREATION_TIME: 'creation_time',
    DESCRIPTION: 'description',
    COPYRIGHT: 'copyright',
    ARTIST: 'artist'
};

/**
 * Default metadata preservation options
 */
const DEFAULT_METADATA_OPTIONS = {
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
    stripSensitiveData: false,
    customFields: []
};

/**
 * Default transparency handling options
 */
const DEFAULT_TRANSPARENCY_OPTIONS = {
    preserveTransparency: true,
    backgroundColor: { r: 255, g: 255, b: 255 }, // White background
    alphaThreshold: 0.5,
    premultiplyAlpha: false,
    transparencyMode: 'preserve' // 'preserve', 'remove', 'background'
};

/**
 * Metadata and Transparency Service
 * Handles metadata preservation and transparency processing during image conversions
 */
class MetadataTransparencyService extends EventEmitter {
    constructor() {
        super();
        this.cache = new Map();
        this.statistics = {
            metadataExtracted: 0,
            metadataPreserved: 0,
            transparencyDetected: 0,
            transparencyProcessed: 0,
            backgroundsApplied: 0,
            errors: 0
        };
    }

    /**
     * Extract metadata from an image
     * @param {string|Buffer} input - Image file path or buffer
     * @param {Object} options - Extraction options
     * @returns {Promise<Object>} Extracted metadata
     */
    async extractMetadata(input, options = {}) {
        try {
            const sharpInstance = sharp(input);
            const metadata = await sharpInstance.metadata();
            
            // Extract additional metadata if available
            const extractedMetadata = {
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                channels: metadata.channels,
                density: metadata.density,
                hasAlpha: metadata.hasAlpha,
                orientation: metadata.orientation,
                space: metadata.space,
                depth: metadata.depth,
                isProgressive: metadata.isProgressive,
                compression: metadata.compression,
                resolutionUnit: metadata.resolutionUnit
            };

            // Extract EXIF data if present
            if (metadata.exif) {
                extractedMetadata.exif = metadata.exif;
            }

            // Extract IPTC data if present
            if (metadata.iptc) {
                extractedMetadata.iptc = metadata.iptc;
            }

            // Extract XMP data if present
            if (metadata.xmp) {
                extractedMetadata.xmp = metadata.xmp;
            }

            // Extract ICC profile if present
            if (metadata.icc) {
                extractedMetadata.icc = metadata.icc;
            }

            this.statistics.metadataExtracted++;
            this.emit(MetadataTransparencyEvents.METADATA_EXTRACTED, {
                metadata: extractedMetadata,
                input: typeof input === 'string' ? path.basename(input) : 'buffer'
            });

            return extractedMetadata;
        } catch (error) {
            this.statistics.errors++;
            this.emit(MetadataTransparencyEvents.ERROR, {
                operation: 'extractMetadata',
                error: error.message,
                input: typeof input === 'string' ? path.basename(input) : 'buffer'
            });
            throw error;
        }
    }

    /**
     * Analyze transparency information in an image
     * @param {string|Buffer} input - Image file path or buffer
     * @returns {Promise<Object>} Transparency analysis
     */
    async analyzeTransparency(input) {
        try {
            const sharpInstance = sharp(input);
            const metadata = await sharpInstance.metadata();
            
            const transparencyInfo = {
                hasAlpha: metadata.hasAlpha || false,
                channels: metadata.channels,
                format: metadata.format,
                supportsTransparency: ['png', 'webp', 'gif', 'tiff'].includes(metadata.format?.toLowerCase()),
                alphaChannel: null
            };

            // If image has alpha channel, analyze it
            if (transparencyInfo.hasAlpha) {
                const { data, info } = await sharpInstance
                    .ensureAlpha()
                    .raw()
                    .toBuffer({ resolveWithObject: true });

                // Analyze alpha channel values
                const alphaValues = [];
                const pixelCount = info.width * info.height;
                const channels = info.channels;
                
                for (let i = channels - 1; i < data.length; i += channels) {
                    alphaValues.push(data[i]);
                }

                const uniqueAlphaValues = [...new Set(alphaValues)];
                const hasPartialTransparency = uniqueAlphaValues.some(val => val > 0 && val < 255);
                const hasFullTransparency = uniqueAlphaValues.includes(0);
                const hasOpaquePixels = uniqueAlphaValues.includes(255);

                transparencyInfo.alphaChannel = {
                    uniqueValues: uniqueAlphaValues.length,
                    hasPartialTransparency,
                    hasFullTransparency,
                    hasOpaquePixels,
                    averageAlpha: alphaValues.reduce((sum, val) => sum + val, 0) / alphaValues.length,
                    minAlpha: Math.min(...alphaValues),
                    maxAlpha: Math.max(...alphaValues)
                };
            }

            if (transparencyInfo.hasAlpha) {
                this.statistics.transparencyDetected++;
                this.emit(MetadataTransparencyEvents.TRANSPARENCY_DETECTED, {
                    transparencyInfo,
                    input: typeof input === 'string' ? path.basename(input) : 'buffer'
                });
            }

            return transparencyInfo;
        } catch (error) {
            this.statistics.errors++;
            this.emit(MetadataTransparencyEvents.ERROR, {
                operation: 'analyzeTransparency',
                error: error.message,
                input: typeof input === 'string' ? path.basename(input) : 'buffer'
            });
            throw error;
        }
    }

    /**
     * Preserve metadata during image conversion
     * @param {Object} sharpInstance - Sharp instance
     * @param {Object} originalMetadata - Original image metadata
     * @param {Object} options - Preservation options
     * @returns {Object} Sharp instance with preserved metadata
     */
    preserveMetadata(sharpInstance, originalMetadata, options = {}) {
        const preservationOptions = { ...DEFAULT_METADATA_OPTIONS, ...options };
        const preservedMetadata = {};

        try {
            // Preserve EXIF data
            if (preservationOptions.preserveExif && originalMetadata.exif) {
                if (!preservationOptions.stripSensitiveData) {
                    sharpInstance = sharpInstance.withMetadata({ exif: originalMetadata.exif });
                    preservedMetadata.exif = true;
                }
            }

            // Preserve ICC profile
            if (preservationOptions.preserveIcc && originalMetadata.icc) {
                sharpInstance = sharpInstance.withMetadata({ icc: originalMetadata.icc });
                preservedMetadata.icc = true;
            }

            // Preserve density information
            if (preservationOptions.preserveDensity && originalMetadata.density) {
                sharpInstance = sharpInstance.withMetadata({ density: originalMetadata.density });
                preservedMetadata.density = originalMetadata.density;
            }

            // Preserve orientation
            if (preservationOptions.preserveOrientation && originalMetadata.orientation) {
                sharpInstance = sharpInstance.withMetadata({ orientation: originalMetadata.orientation });
                preservedMetadata.orientation = originalMetadata.orientation;
            }

            this.statistics.metadataPreserved++;
            this.emit(MetadataTransparencyEvents.METADATA_PRESERVED, {
                preservedFields: Object.keys(preservedMetadata),
                options: preservationOptions
            });

            return { sharpInstance, preservedMetadata };
        } catch (error) {
            this.statistics.errors++;
            this.emit(MetadataTransparencyEvents.ERROR, {
                operation: 'preserveMetadata',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Handle transparency during format conversion
     * @param {Object} sharpInstance - Sharp instance
     * @param {Object} transparencyInfo - Transparency information
     * @param {string} targetFormat - Target image format
     * @param {Object} options - Transparency handling options
     * @returns {Object} Sharp instance with transparency handled
     */
    handleTransparency(sharpInstance, transparencyInfo, targetFormat, options = {}) {
        const transparencyOptions = { ...DEFAULT_TRANSPARENCY_OPTIONS, ...options };
        const targetSupportsTransparency = ['png', 'webp', 'gif', 'tiff'].includes(targetFormat.toLowerCase());

        try {
            if (!transparencyInfo.hasAlpha) {
                // No transparency to handle
                return { sharpInstance, transparencyHandled: false };
            }

            if (targetSupportsTransparency && transparencyOptions.preserveTransparency) {
                // Target format supports transparency and we want to preserve it
                if (transparencyOptions.premultiplyAlpha) {
                    sharpInstance = sharpInstance.premultiply();
                }
                
                this.emit(MetadataTransparencyEvents.TRANSPARENCY_PROCESSED, {
                    action: 'preserved',
                    targetFormat,
                    hasAlpha: true
                });
                
                return { sharpInstance, transparencyHandled: true, preservedTransparency: true };
            } else {
                // Remove transparency by applying background
                const bg = transparencyOptions.backgroundColor;
                sharpInstance = sharpInstance.flatten({ background: bg });
                
                this.statistics.backgroundsApplied++;
                this.emit(MetadataTransparencyEvents.BACKGROUND_APPLIED, {
                    backgroundColor: bg,
                    targetFormat,
                    originalHasAlpha: true
                });
                
                this.emit(MetadataTransparencyEvents.TRANSPARENCY_PROCESSED, {
                    action: 'removed',
                    targetFormat,
                    backgroundColor: bg
                });
                
                return { sharpInstance, transparencyHandled: true, preservedTransparency: false };
            }
        } catch (error) {
            this.statistics.errors++;
            this.emit(MetadataTransparencyEvents.ERROR, {
                operation: 'handleTransparency',
                error: error.message,
                targetFormat
            });
            throw error;
        }
    }

    /**
     * Process image with metadata and transparency handling
     * @param {string|Buffer} input - Input image
     * @param {string} outputPath - Output file path
     * @param {string} targetFormat - Target format
     * @param {Object} options - Processing options
     * @returns {Promise<MetadataResult>} Processing result
     */
    async processImageWithMetadata(input, outputPath, targetFormat, options = {}) {
        try {
            // Extract original metadata and transparency info
            const [originalMetadata, transparencyInfo] = await Promise.all([
                this.extractMetadata(input),
                this.analyzeTransparency(input)
            ]);

            // Create Sharp instance
            let sharpInstance = sharp(input);

            // Handle transparency
            const { sharpInstance: transparencyProcessed, transparencyHandled, preservedTransparency } = 
                this.handleTransparency(sharpInstance, transparencyInfo, targetFormat, options.transparency);
            sharpInstance = transparencyProcessed;

            // Preserve metadata
            const { sharpInstance: metadataProcessed, preservedMetadata } = 
                this.preserveMetadata(sharpInstance, originalMetadata, options.metadata);
            sharpInstance = metadataProcessed;

            // Apply format-specific options
            sharpInstance = this._applyFormatOptions(sharpInstance, targetFormat, options.format);

            // Save the processed image
            await sharpInstance.toFile(outputPath);

            // Update statistics
            if (transparencyHandled) {
                this.statistics.transparencyProcessed++;
            }

            // Create result
            const result = new MetadataResult(
                originalMetadata,
                preservedMetadata,
                {
                    ...transparencyInfo,
                    handled: transparencyHandled,
                    preserved: preservedTransparency
                }
            );

            return result;
        } catch (error) {
            this.statistics.errors++;
            this.emit(MetadataTransparencyEvents.ERROR, {
                operation: 'processImageWithMetadata',
                error: error.message,
                input: typeof input === 'string' ? path.basename(input) : 'buffer',
                outputPath: path.basename(outputPath)
            });
            throw error;
        }
    }

    /**
     * Apply format-specific options
     * @private
     */
    _applyFormatOptions(sharpInstance, format, options = {}) {
        const formatLower = format.toLowerCase();
        
        switch (formatLower) {
            case 'jpeg':
            case 'jpg':
                return sharpInstance.jpeg({
                    quality: options.quality || 90,
                    progressive: options.progressive !== false,
                    mozjpeg: options.mozjpeg || false
                });
            
            case 'png':
                return sharpInstance.png({
                    quality: options.quality || 90,
                    progressive: options.progressive || false,
                    compressionLevel: options.compressionLevel || 6,
                    adaptiveFiltering: options.adaptiveFiltering !== false
                });
            
            case 'webp':
                return sharpInstance.webp({
                    quality: options.quality || 90,
                    lossless: options.lossless || false,
                    nearLossless: options.nearLossless || false,
                    alphaQuality: options.alphaQuality || 100
                });
            
            default:
                return sharpInstance;
        }
    }

    /**
     * Get processing statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        return { ...this.statistics };
    }

    /**
     * Reset statistics
     */
    resetStatistics() {
        this.statistics = {
            metadataExtracted: 0,
            metadataPreserved: 0,
            transparencyDetected: 0,
            transparencyProcessed: 0,
            backgroundsApplied: 0,
            errors: 0
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache information
     * @returns {Object} Cache info
     */
    getCacheInfo() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Global service instance
let globalMetadataTransparencyService = null;

/**
 * Get the global metadata and transparency service instance
 * @returns {MetadataTransparencyService} Service instance
 */
function getMetadataTransparencyService() {
    if (!globalMetadataTransparencyService) {
        globalMetadataTransparencyService = new MetadataTransparencyService();
    }
    return globalMetadataTransparencyService;
}

module.exports = {
    MetadataTransparencyService,
    MetadataResult,
    MetadataTransparencyEvents,
    METADATA_FIELDS,
    DEFAULT_METADATA_OPTIONS,
    DEFAULT_TRANSPARENCY_OPTIONS,
    getMetadataTransparencyService
};