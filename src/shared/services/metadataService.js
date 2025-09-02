const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../utils/logger');

class MetadataService {
  constructor() {
    this.logger = createLogger('MetadataService');
    this.supportedMetadata = {
      common: ['size', 'created', 'modified', 'accessed', 'permissions'],
      image: ['width', 'height', 'colorSpace', 'dpi', 'compression'],
      document: ['author', 'title', 'subject', 'creator', 'producer', 'keywords'],
      audio: ['duration', 'bitrate', 'sampleRate', 'channels', 'codec'],
      video: ['duration', 'width', 'height', 'framerate', 'codec', 'bitrate']
    };
    this.stats = {
      extracted: 0,
      preserved: 0,
      errors: 0,
      retries: 0
    };
  }

  /**
   * Extract metadata from a file
   * @param {string} filePath - Path to the file
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractMetadata(filePath, options = {}) {
    try {
      this.logger.info(`Extracting metadata from: ${filePath}`);
      
      const metadata = {
        filePath,
        extractedAt: new Date().toISOString(),
        common: await this._extractCommonMetadata(filePath),
        specific: await this._extractSpecificMetadata(filePath, options)
      };

      this.stats.extracted++;
      this.logger.debug('Metadata extracted successfully', { filePath, metadata });
      return metadata;
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to extract metadata', { filePath, error: error.message });
      throw new Error(`Metadata extraction failed: ${error.message}`);
    }
  }

  /**
   * Preserve metadata to a target file
   * @param {Object} metadata - Metadata to preserve
   * @param {string} targetPath - Target file path
   * @param {Object} options - Preservation options
   * @returns {Promise<boolean>} Success status
   */
  async preserveMetadata(metadata, targetPath, options = {}) {
    const maxRetries = options.maxRetries || 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        this.logger.info(`Preserving metadata to: ${targetPath} (attempt ${attempt + 1})`);
        
        // Preserve common metadata (timestamps, permissions)
        await this._preserveCommonMetadata(metadata.common, targetPath, options);
        
        // Preserve specific metadata based on file type
        if (metadata.specific && Object.keys(metadata.specific).length > 0) {
          await this._preserveSpecificMetadata(metadata.specific, targetPath, options);
        }

        this.stats.preserved++;
        this.logger.debug('Metadata preserved successfully', { targetPath });
        return true;
      } catch (error) {
        attempt++;
        this.stats.retries++;
        
        if (attempt >= maxRetries) {
          this.stats.errors++;
          this.logger.error('Failed to preserve metadata after retries', {
            targetPath,
            attempts: attempt,
            error: error.message
          });
          throw new Error(`Metadata preservation failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        this.logger.warn(`Metadata preservation attempt ${attempt} failed, retrying...`, {
          targetPath,
          error: error.message
        });
        
        // Wait before retry (exponential backoff)
        await this._delay(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }

  /**
   * Create a metadata backup
   * @param {Object} metadata - Metadata to backup
   * @param {string} backupPath - Backup file path
   * @returns {Promise<string>} Backup file path
   */
  async createMetadataBackup(metadata, backupPath) {
    try {
      const backupData = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        metadata
      };

      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
      this.logger.info('Metadata backup created', { backupPath });
      return backupPath;
    } catch (error) {
      this.logger.error('Failed to create metadata backup', {
        backupPath,
        error: error.message
      });
      throw new Error(`Metadata backup failed: ${error.message}`);
    }
  }

  /**
   * Restore metadata from backup
   * @param {string} backupPath - Backup file path
   * @returns {Promise<Object>} Restored metadata
   */
  async restoreMetadataBackup(backupPath) {
    try {
      const backupData = await fs.readFile(backupPath, 'utf8');
      const parsed = JSON.parse(backupData);
      
      this.logger.info('Metadata backup restored', { backupPath });
      return parsed.metadata;
    } catch (error) {
      this.logger.error('Failed to restore metadata backup', {
        backupPath,
        error: error.message
      });
      throw new Error(`Metadata restore failed: ${error.message}`);
    }
  }

  /**
   * Compare metadata between two files
   * @param {Object} metadata1 - First metadata object
   * @param {Object} metadata2 - Second metadata object
   * @returns {Object} Comparison result
   */
  compareMetadata(metadata1, metadata2) {
    const differences = {
      common: {},
      specific: {},
      summary: {
        identical: true,
        differenceCount: 0
      }
    };

    // Compare common metadata
    for (const key in metadata1.common) {
      if (metadata1.common[key] !== metadata2.common?.[key]) {
        differences.common[key] = {
          original: metadata1.common[key],
          current: metadata2.common?.[key]
        };
        differences.summary.identical = false;
        differences.summary.differenceCount++;
      }
    }

    // Compare specific metadata
    for (const key in metadata1.specific) {
      if (JSON.stringify(metadata1.specific[key]) !== JSON.stringify(metadata2.specific?.[key])) {
        differences.specific[key] = {
          original: metadata1.specific[key],
          current: metadata2.specific?.[key]
        };
        differences.summary.identical = false;
        differences.summary.differenceCount++;
      }
    }

    return differences;
  }

  /**
   * Get supported metadata types
   * @returns {Object} Supported metadata types
   */
  getSupportedMetadata() {
    return { ...this.supportedMetadata };
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.extracted > 0 ? 
        ((this.stats.extracted - this.stats.errors) / this.stats.extracted * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Reset service statistics
   */
  resetStats() {
    this.stats = {
      extracted: 0,
      preserved: 0,
      errors: 0,
      retries: 0
    };
    this.logger.info('Service statistics reset');
  }

  // Private methods

  /**
   * Extract common file metadata
   * @private
   */
  async _extractCommonMetadata(filePath) {
    const stats = await fs.stat(filePath);
    
    return {
      size: stats.size,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      accessed: stats.atime.toISOString(),
      permissions: stats.mode.toString(8),
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  }

  /**
   * Extract file-type specific metadata
   * @private
   */
  async _extractSpecificMetadata(filePath, options) {
    const ext = path.extname(filePath).toLowerCase();
    const specific = {};

    try {
      // Image files
      if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'].includes(ext)) {
        specific.type = 'image';
        // Note: In a real implementation, you'd use libraries like 'sharp' or 'exif-reader'
        // For now, we'll simulate basic image metadata
        specific.format = ext.substring(1);
      }
      
      // Document files
      else if (['.pdf', '.doc', '.docx', '.txt'].includes(ext)) {
        specific.type = 'document';
        specific.format = ext.substring(1);
      }
      
      // Audio files
      else if (['.mp3', '.wav', '.flac', '.aac'].includes(ext)) {
        specific.type = 'audio';
        specific.format = ext.substring(1);
      }
      
      // Video files
      else if (['.mp4', '.avi', '.mov', '.mkv'].includes(ext)) {
        specific.type = 'video';
        specific.format = ext.substring(1);
      }
      
      else {
        specific.type = 'unknown';
        specific.format = ext.substring(1) || 'none';
      }

      return specific;
    } catch (error) {
      this.logger.warn('Failed to extract specific metadata', {
        filePath,
        error: error.message
      });
      return { type: 'unknown', format: ext.substring(1) || 'none' };
    }
  }

  /**
   * Preserve common metadata
   * @private
   */
  async _preserveCommonMetadata(commonMetadata, targetPath, options) {
    if (!commonMetadata) return;

    try {
      // Preserve timestamps if requested
      if (options.preserveTimestamps !== false) {
        const atime = new Date(commonMetadata.accessed);
        const mtime = new Date(commonMetadata.modified);
        await fs.utimes(targetPath, atime, mtime);
      }

      // Preserve permissions if requested and supported
      if (options.preservePermissions !== false && commonMetadata.permissions) {
        try {
          await fs.chmod(targetPath, parseInt(commonMetadata.permissions, 8));
        } catch (error) {
          // Permission changes might fail on some systems, log but don't throw
          this.logger.warn('Failed to preserve permissions', {
            targetPath,
            permissions: commonMetadata.permissions,
            error: error.message
          });
        }
      }
    } catch (error) {
      throw new Error(`Failed to preserve common metadata: ${error.message}`);
    }
  }

  /**
   * Preserve file-type specific metadata
   * @private
   */
  async _preserveSpecificMetadata(specificMetadata, targetPath, options) {
    // In a real implementation, this would use appropriate libraries
    // to embed metadata back into files based on their type
    // For now, we'll create a sidecar metadata file if requested
    
    if (options.createSidecarFile) {
      const sidecarPath = targetPath + '.metadata.json';
      await fs.writeFile(
        sidecarPath,
        JSON.stringify(specificMetadata, null, 2),
        'utf8'
      );
      this.logger.debug('Sidecar metadata file created', { sidecarPath });
    }
  }

  /**
   * Delay utility for retry logic
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MetadataService;