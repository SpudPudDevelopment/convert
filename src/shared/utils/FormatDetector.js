const path = require('path');
const { getSharpService } = require('../services/SharpService');

/**
 * Supported image formats
 */
const SUPPORTED_FORMATS = {
  JPEG: 'jpeg',
  JPG: 'jpeg', // Alias for JPEG
  PNG: 'png',
  WEBP: 'webp'
};

/**
 * File extension to format mapping
 */
const EXTENSION_MAP = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp'
};

/**
 * MIME type to format mapping
 */
const MIME_TYPE_MAP = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp'
};

/**
 * Magic bytes for format detection
 */
const MAGIC_BYTES = {
  jpeg: [
    [0xFF, 0xD8, 0xFF], // JPEG/JFIF
    [0xFF, 0xD8, 0xFF, 0xE0], // JPEG with JFIF marker
    [0xFF, 0xD8, 0xFF, 0xE1] // JPEG with EXIF marker
  ],
  png: [
    [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] // PNG signature
  ],
  webp: [
    [0x52, 0x49, 0x46, 0x46] // RIFF header (WebP starts with RIFF)
  ]
};

/**
 * WebP specific validation (checks for WEBP after RIFF)
 */
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

/**
 * Result class for format detection
 */
class FormatDetectionResult {
  constructor(format, confidence, method, metadata = {}) {
    this.format = format;
    this.confidence = confidence; // 0-1 scale
    this.method = method; // 'magic_bytes', 'extension', 'mime_type', 'metadata'
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Check if detection is reliable
   */
  isReliable() {
    return this.confidence >= 0.8;
  }

  /**
   * Check if format is supported
   */
  isSupported() {
    return Object.values(SUPPORTED_FORMATS).includes(this.format);
  }
}

/**
 * Format detection utility class
 */
class FormatDetector {
  /**
   * Detect format from buffer using magic bytes
   * @param {Buffer} buffer - Image buffer
   * @returns {FormatDetectionResult|null}
   */
  static detectFromBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
      return null;
    }

    // Check JPEG
    for (const signature of MAGIC_BYTES.jpeg) {
      if (this._matchesSignature(buffer, signature)) {
        return new FormatDetectionResult('jpeg', 0.95, 'magic_bytes', {
          signature: signature.map(b => `0x${b.toString(16).toUpperCase()}`).join(' ')
        });
      }
    }

    // Check PNG
    for (const signature of MAGIC_BYTES.png) {
      if (this._matchesSignature(buffer, signature)) {
        return new FormatDetectionResult('png', 0.95, 'magic_bytes', {
          signature: signature.map(b => `0x${b.toString(16).toUpperCase()}`).join(' ')
        });
      }
    }

    // Check WebP (more complex - need to check RIFF + WEBP)
    if (this._matchesSignature(buffer, MAGIC_BYTES.webp[0])) {
      // Check if WEBP signature appears at offset 8
      if (buffer.length >= 12 && this._matchesSignature(buffer.slice(8), WEBP_SIGNATURE)) {
        return new FormatDetectionResult('webp', 0.95, 'magic_bytes', {
          signature: 'RIFF...WEBP'
        });
      }
    }

    return null;
  }

  /**
   * Detect format from file extension
   * @param {string} filename - File name or path
   * @returns {FormatDetectionResult|null}
   */
  static detectFromExtension(filename) {
    if (!filename || typeof filename !== 'string') {
      return null;
    }

    const ext = path.extname(filename).toLowerCase();
    const format = EXTENSION_MAP[ext];

    if (format) {
      return new FormatDetectionResult(format, 0.7, 'extension', {
        extension: ext,
        filename: path.basename(filename)
      });
    }

    return null;
  }

  /**
   * Detect format from MIME type
   * @param {string} mimeType - MIME type string
   * @returns {FormatDetectionResult|null}
   */
  static detectFromMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
      return null;
    }

    const format = MIME_TYPE_MAP[mimeType.toLowerCase()];

    if (format) {
      return new FormatDetectionResult(format, 0.8, 'mime_type', {
        mimeType: mimeType
      });
    }

    return null;
  }

  /**
   * Detect format using Sharp metadata (most reliable)
   * @param {Buffer} buffer - Image buffer
   * @returns {Promise<FormatDetectionResult|null>}
   */
  static async detectFromMetadata(buffer) {
    try {
      const sharpService = getSharpService();
      const result = await sharpService.getMetadata(buffer);

      if (result.success && result.data.format) {
        return new FormatDetectionResult(result.data.format, 1.0, 'metadata', {
          width: result.data.width,
          height: result.data.height,
          channels: result.data.channels,
          hasAlpha: result.data.hasAlpha
        });
      }
    } catch (error) {
      // Metadata detection failed, return null
    }

    return null;
  }

  /**
   * Comprehensive format detection using multiple methods
   * @param {Buffer} buffer - Image buffer
   * @param {string} [filename] - Optional filename
   * @param {string} [mimeType] - Optional MIME type
   * @returns {Promise<FormatDetectionResult>}
   */
  static async detectFormat(buffer, filename = null, mimeType = null) {
    const results = [];

    // Try metadata detection first (most reliable)
    try {
      const metadataResult = await this.detectFromMetadata(buffer);
      if (metadataResult) {
        results.push(metadataResult);
      }
    } catch (error) {
      // Continue with other methods
    }

    // Try magic bytes detection
    const bufferResult = this.detectFromBuffer(buffer);
    if (bufferResult) {
      results.push(bufferResult);
    }

    // Try MIME type detection
    if (mimeType) {
      const mimeResult = this.detectFromMimeType(mimeType);
      if (mimeResult) {
        results.push(mimeResult);
      }
    }

    // Try extension detection
    if (filename) {
      const extensionResult = this.detectFromExtension(filename);
      if (extensionResult) {
        results.push(extensionResult);
      }
    }

    // Return the most confident result
    if (results.length > 0) {
      const bestResult = results.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );

      // Add consensus information if multiple methods agree
      const consensus = results.filter(r => r.format === bestResult.format);
      if (consensus.length > 1) {
        bestResult.metadata.consensus = {
          agreeing_methods: consensus.map(r => r.method),
          confidence_boost: Math.min(0.1 * (consensus.length - 1), 0.2)
        };
        bestResult.confidence = Math.min(bestResult.confidence + bestResult.metadata.consensus.confidence_boost, 1.0);
      }

      return bestResult;
    }

    // No format detected
    throw new Error('Unable to detect image format');
  }

  /**
   * Check if a format is supported for conversion
   * @param {string} format - Format to check
   * @returns {boolean}
   */
  static isFormatSupported(format) {
    return Object.values(SUPPORTED_FORMATS).includes(format?.toLowerCase());
  }

  /**
   * Get all supported formats
   * @returns {string[]}
   */
  static getSupportedFormats() {
    return Object.values(SUPPORTED_FORMATS);
  }

  /**
   * Get format extensions
   * @param {string} format - Format name
   * @returns {string[]}
   */
  static getFormatExtensions(format) {
    return Object.keys(EXTENSION_MAP).filter(ext => EXTENSION_MAP[ext] === format);
  }

  /**
   * Get format MIME types
   * @param {string} format - Format name
   * @returns {string[]}
   */
  static getFormatMimeTypes(format) {
    return Object.keys(MIME_TYPE_MAP).filter(mime => MIME_TYPE_MAP[mime] === format);
  }

  /**
   * Validate conversion path
   * @param {string} fromFormat - Source format
   * @param {string} toFormat - Target format
   * @returns {boolean}
   */
  static isConversionSupported(fromFormat, toFormat) {
    return this.isFormatSupported(fromFormat) && this.isFormatSupported(toFormat);
  }

  /**
   * Helper method to match byte signatures
   * @private
   */
  static _matchesSignature(buffer, signature) {
    if (buffer.length < signature.length) {
      return false;
    }

    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }
}

module.exports = {
  FormatDetector,
  FormatDetectionResult,
  SUPPORTED_FORMATS,
  EXTENSION_MAP,
  MIME_TYPE_MAP
};