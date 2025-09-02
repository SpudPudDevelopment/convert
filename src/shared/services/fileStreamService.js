/**
 * File Stream Service (Main Process)
 * Handles streaming file operations for large files with proper buffering
 */

const fs = require('fs');
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');

class FileStreamService {
  constructor() {
    this.activeStreams = new Map();
    this.defaultChunkSize = 64 * 1024; // 64KB
    this.maxConcurrentStreams = 5;
  }

  /**
   * Create a readable stream for a file
   * @param {string} filePath - Path to file
   * @param {Object} options - Stream options
   * @returns {Promise<Object>} Stream info and metadata
   */
  async createReadStream(filePath, options = {}) {
    const {
      encoding = 'utf8',
      start = 0,
      end = null,
      highWaterMark = this.defaultChunkSize
    } = options;

    try {
      // Validate file exists and get stats
      const stats = await fs.promises.stat(filePath);
      
      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      const streamOptions = {
        encoding,
        highWaterMark,
        start
      };

      if (end !== null) {
        streamOptions.end = end;
      }

      const readStream = createReadStream(filePath, streamOptions);
      const streamId = this.generateStreamId('read', filePath);
      
      this.activeStreams.set(streamId, {
        stream: readStream,
        type: 'read',
        filePath,
        startTime: Date.now()
      });

      return {
        streamId,
        fileSize: stats.size,
        fileName: path.basename(filePath),
        mimeType: this.getMimeType(filePath),
        lastModified: stats.mtime
      };

    } catch (error) {
      throw new Error(`Failed to create read stream: ${error.message}`);
    }
  }

  /**
   * Create a writable stream for a file
   * @param {string} filePath - Path to write to
   * @param {Object} options - Stream options
   * @returns {Promise<Object>} Stream info
   */
  async createWriteStream(filePath, options = {}) {
    const {
      encoding = 'utf8',
      flags = 'w',
      mode = 0o666,
      highWaterMark = this.defaultChunkSize,
      createDirectories = true
    } = options;

    try {
      // Create directories if needed
      if (createDirectories) {
        const dir = path.dirname(filePath);
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const streamOptions = {
        encoding,
        flags,
        mode,
        highWaterMark
      };

      const writeStream = createWriteStream(filePath, streamOptions);
      const streamId = this.generateStreamId('write', filePath);
      
      this.activeStreams.set(streamId, {
        stream: writeStream,
        type: 'write',
        filePath,
        startTime: Date.now(),
        bytesWritten: 0
      });

      return {
        streamId,
        fileName: path.basename(filePath)
      };

    } catch (error) {
      throw new Error(`Failed to create write stream: ${error.message}`);
    }
  }

  /**
   * Read file in chunks with progress tracking
   * @param {string} filePath - File path
   * @param {Object} options - Reading options
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Buffer>} File content
   */
  async readFileChunked(filePath, options = {}, progressCallback = null) {
    const {
      chunkSize = this.defaultChunkSize,
      encoding = null // null for binary, 'utf8' for text
    } = options;

    try {
      const stats = await fs.promises.stat(filePath);
      const fileSize = stats.size;
      const chunks = [];
      let bytesRead = 0;

      const readStream = createReadStream(filePath, {
        highWaterMark: chunkSize,
        encoding
      });

      return new Promise((resolve, reject) => {
        readStream.on('data', (chunk) => {
          chunks.push(chunk);
          bytesRead += chunk.length;
          
          if (progressCallback) {
            progressCallback({
              bytesRead,
              totalBytes: fileSize,
              progress: (bytesRead / fileSize) * 100,
              chunk: chunk
            });
          }
        });

        readStream.on('end', () => {
          const result = encoding ? chunks.join('') : Buffer.concat(chunks);
          resolve(result);
        });

        readStream.on('error', (error) => {
          reject(new Error(`Read error: ${error.message}`));
        });
      });

    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Write file in chunks with progress tracking
   * @param {string} filePath - File path
   * @param {Buffer|string} data - Data to write
   * @param {Object} options - Writing options
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Object>} Write result
   */
  async writeFileChunked(filePath, data, options = {}, progressCallback = null) {
    const {
      chunkSize = this.defaultChunkSize,
      encoding = 'utf8',
      createDirectories = true
    } = options;

    try {
      // Create directories if needed
      if (createDirectories) {
        const dir = path.dirname(filePath);
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const totalSize = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, encoding);
      let bytesWritten = 0;

      const writeStream = createWriteStream(filePath, { encoding });

      return new Promise((resolve, reject) => {
        writeStream.on('error', (error) => {
          reject(new Error(`Write error: ${error.message}`));
        });

        writeStream.on('finish', async () => {
          try {
            const stats = await fs.promises.stat(filePath);
            resolve({
              filePath,
              size: stats.size,
              bytesWritten: totalSize,
              lastModified: stats.mtime
            });
          } catch (error) {
            reject(error);
          }
        });

        // Write data in chunks
        const writeChunks = async () => {
          try {
            if (Buffer.isBuffer(data)) {
              // Handle Buffer data
              for (let offset = 0; offset < data.length; offset += chunkSize) {
                const chunk = data.slice(offset, offset + chunkSize);
                
                await new Promise((resolveChunk, rejectChunk) => {
                  writeStream.write(chunk, (error) => {
                    if (error) {
                      rejectChunk(error);
                    } else {
                      bytesWritten += chunk.length;
                      
                      if (progressCallback) {
                        progressCallback({
                          bytesWritten,
                          totalBytes: totalSize,
                          progress: (bytesWritten / totalSize) * 100
                        });
                      }
                      
                      resolveChunk();
                    }
                  });
                });
              }
            } else {
              // Handle string data
              const buffer = Buffer.from(data, encoding);
              for (let offset = 0; offset < buffer.length; offset += chunkSize) {
                const chunk = buffer.slice(offset, offset + chunkSize);
                
                await new Promise((resolveChunk, rejectChunk) => {
                  writeStream.write(chunk, (error) => {
                    if (error) {
                      rejectChunk(error);
                    } else {
                      bytesWritten += chunk.length;
                      
                      if (progressCallback) {
                        progressCallback({
                          bytesWritten,
                          totalBytes: totalSize,
                          progress: (bytesWritten / totalSize) * 100
                        });
                      }
                      
                      resolveChunk();
                    }
                  });
                });
              }
            }
            
            writeStream.end();
          } catch (error) {
            writeStream.destroy();
            reject(error);
          }
        };

        writeChunks();
      });

    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  /**
   * Copy file with progress tracking
   * @param {string} sourcePath - Source file path
   * @param {string} destPath - Destination file path
   * @param {Object} options - Copy options
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Object>} Copy result
   */
  async copyFile(sourcePath, destPath, options = {}, progressCallback = null) {
    const {
      chunkSize = this.defaultChunkSize,
      overwrite = false,
      createDirectories = true
    } = options;

    try {
      // Check if destination exists
      if (!overwrite) {
        try {
          await fs.promises.access(destPath);
          throw new Error('Destination file already exists');
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
      }

      // Create directories if needed
      if (createDirectories) {
        const dir = path.dirname(destPath);
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const stats = await fs.promises.stat(sourcePath);
      const fileSize = stats.size;
      let bytesCopied = 0;

      const readStream = createReadStream(sourcePath, { highWaterMark: chunkSize });
      const writeStream = createWriteStream(destPath);

      // Create progress tracking transform stream
      const progressTransform = new Transform({
        transform(chunk, encoding, callback) {
          bytesCopied += chunk.length;
          
          if (progressCallback) {
            progressCallback({
              bytesCopied,
              totalBytes: fileSize,
              progress: (bytesCopied / fileSize) * 100
            });
          }
          
          callback(null, chunk);
        }
      });

      await pipeline(readStream, progressTransform, writeStream);

      const destStats = await fs.promises.stat(destPath);
      
      return {
        sourcePath,
        destPath,
        sourceSize: fileSize,
        destSize: destStats.size,
        bytesCopied,
        success: true
      };

    } catch (error) {
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  /**
   * Get file information with detailed metadata
   * @param {string} filePath - File path
   * @returns {Promise<Object>} File information
   */
  async getFileInfo(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      
      return {
        path: filePath,
        name: path.basename(filePath),
        extension: path.extname(filePath).toLowerCase(),
        directory: path.dirname(filePath),
        size: stats.size,
        sizeFormatted: this.formatFileSize(stats.size),
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        permissions: stats.mode,
        mimeType: this.getMimeType(filePath)
      };
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Validate file integrity
   * @param {string} filePath - File path
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateFile(filePath, options = {}) {
    const {
      checkSize = true,
      checkReadability = true,
      maxSize = 100 * 1024 * 1024, // 100MB
      allowedExtensions = null
    } = options;

    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      fileInfo: null
    };

    try {
      // Get file info
      validation.fileInfo = await this.getFileInfo(filePath);
      
      // Check if it's a file
      if (!validation.fileInfo.isFile) {
        validation.isValid = false;
        validation.errors.push('Path is not a file');
        return validation;
      }

      // Check file size
      if (checkSize && validation.fileInfo.size > maxSize) {
        validation.isValid = false;
        validation.errors.push(`File size (${validation.fileInfo.sizeFormatted}) exceeds maximum allowed size`);
      }

      // Check file extension
      if (allowedExtensions && Array.isArray(allowedExtensions)) {
        const ext = validation.fileInfo.extension.replace('.', '');
        if (!allowedExtensions.includes(ext)) {
          validation.isValid = false;
          validation.errors.push(`File extension '${ext}' is not allowed`);
        }
      }

      // Check readability
      if (checkReadability) {
        try {
          await fs.promises.access(filePath, fs.constants.R_OK);
        } catch (error) {
          validation.isValid = false;
          validation.errors.push('File is not readable');
        }
      }

      // Add warnings for large files
      if (validation.fileInfo.size > 10 * 1024 * 1024) { // 10MB
        validation.warnings.push('Large file detected - processing may take longer');
      }

    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Validation failed: ${error.message}`);
    }

    return validation;
  }

  /**
   * Close a stream
   * @param {string} streamId - Stream ID
   * @returns {boolean} Success status
   */
  closeStream(streamId) {
    const streamInfo = this.activeStreams.get(streamId);
    if (streamInfo) {
      streamInfo.stream.destroy();
      this.activeStreams.delete(streamId);
      return true;
    }
    return false;
  }

  /**
   * Get active streams
   * @returns {Object[]} Array of active streams
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.entries()).map(([id, info]) => ({
      id,
      type: info.type,
      filePath: info.filePath,
      duration: Date.now() - info.startTime
    }));
  }

  /**
   * Cleanup all streams
   */
  cleanup() {
    for (const [streamId] of this.activeStreams) {
      this.closeStream(streamId);
    }
  }

  // Private methods

  /**
   * Generate unique stream ID
   * @param {string} type - Stream type
   * @param {string} filePath - File path
   * @returns {string} Unique stream ID
   */
  generateStreamId(type, filePath) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const fileName = path.basename(filePath);
    return `${type}_${fileName}_${timestamp}_${random}`;
  }

  /**
   * Get MIME type for file
   * @param {string} filePath - File path
   * @returns {string} MIME type
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Format file size
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new FileStreamService();
module.exports.FileStreamService = FileStreamService;