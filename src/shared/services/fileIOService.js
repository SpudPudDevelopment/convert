/**
 * File I/O Service
 * Comprehensive file reading and writing functionality with streaming, buffering, and progress tracking
 */

const { EventEmitter } = require('events');
const { withRetry, withTimeout, batchIPCOperations, createProgressTracker, fileValidation } = require('../utils/ipcUtils.js');
const { IPC_CHANNELS, ERROR_TYPES } = require('../types/ipc.js');

class FileIOService extends EventEmitter {
  constructor() {
    super();
    this.activeOperations = new Map();
    this.operationQueue = new Map();
    this.maxConcurrentOperations = 5;
    this.defaultChunkSize = 64 * 1024; // 64KB
    this.maxRetries = 3;
    this.operationTimeout = 30000; // 30 seconds
    this.queueProcessingInterval = null;
    this.isProcessingQueue = false;
  }

  /**
   * Read file with enhanced options
   * @param {string} filePath - File path
   * @param {Object} options - Read options
   * @returns {Promise<Object>} File content and metadata
   */
  async readFile(filePath, options = {}) {
    const operationId = this.generateOperationId('read', filePath);
    
    try {
      this.activeOperations.set(operationId, {
        type: 'read',
        filePath,
        startTime: Date.now(),
        status: 'running'
      });
      
      const {
        encoding = 'utf8',
        timeout = this.operationTimeout,
        retries = this.maxRetries,
        validateFile = true,
        useStreaming = false,
        chunkSize = this.defaultChunkSize,
        maxSize = 100 * 1024 * 1024,
        trackProgress = true
      } = options;
      
      // Validate file if requested
      if (validateFile) {
        const validation = await window.electronAPI.invoke(IPC_CHANNELS.VALIDATE_FILE, filePath, {
          checkSize: true,
          checkReadability: true,
          maxSize
        });
        
        if (!validation.success || !validation.data.isValid) {
          throw new Error(`File validation failed: ${validation.data.errors.join(', ')}`);
        }
      }
      
      // Create progress tracker
      let progressTracker = null;
      if (trackProgress) {
        progressTracker = createProgressTracker(operationId);
        this.activeOperations.set(operationId, progressTracker);
      }
      
      // Read file with enhanced options
      const result = await withTimeout(
        withRetry(
          () => window.electronAPI.invoke(IPC_CHANNELS.READ_FILE, filePath, {
            encoding,
            useStreaming,
            chunkSize,
            maxSize
          }),
          retries
        ),
        timeout
      );
      
      if (progressTracker) {
        progressTracker.complete();
        this.activeOperations.delete(operationId);
      }
      
      this.emit('fileRead', {
        operationId,
        filePath,
        size: result.data.size,
        success: true
      });
      
      return {
        success: true,
        content: result.data.content,
        filePath: result.data.filePath || result.data.path,
        size: result.data.size,
        sizeFormatted: result.data.sizeFormatted,
        lastModified: result.data.lastModified || result.data.modified,
        encoding: result.data.encoding,
        mimeType: result.data.mimeType,
        operationId
      };
      
    } catch (error) {
      this.activeOperations.delete(operationId);
      this.emit('fileReadError', {
        operationId,
        filePath,
        error: error.message
      });
      
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Write file with enhanced options
   * @param {string} filePath - File path
   * @param {string|Buffer} data - File content
   * @param {Object} options - Write options
   * @returns {Promise<Object>} Write result
   */
  async writeFile(filePath, data, options = {}) {
    const operationId = this.generateOperationId('write', filePath);
    
    try {
      this.activeOperations.set(operationId, {
        type: 'write',
        filePath,
        startTime: Date.now(),
        status: 'running'
      });
      
      const {
        encoding = 'utf8',
        timeout = this.operationTimeout,
        retries = this.maxRetries,
        createBackup = false,
        useStreaming = false,
        chunkSize = this.defaultChunkSize,
        createDirectories = true,
        overwrite = true,
        trackProgress = true
      } = options;
      
      // Create backup if requested
      if (createBackup) {
        try {
          const backupPath = `${filePath}.backup.${Date.now()}`;
          const existingContent = await window.electronAPI.invoke(IPC_CHANNELS.READ_FILE, filePath);
          if (existingContent.success) {
            await window.electronAPI.invoke(IPC_CHANNELS.WRITE_FILE, backupPath, existingContent.data.content);
          }
        } catch (error) {
          // Ignore backup errors for new files
        }
      }
      
      // Create progress tracker
      let progressTracker = null;
      if (trackProgress) {
        progressTracker = createProgressTracker(operationId);
        this.activeOperations.set(operationId, progressTracker);
      }
      
      // Write file with enhanced options
      const result = await withTimeout(
        withRetry(
          () => window.electronAPI.invoke(IPC_CHANNELS.WRITE_FILE, filePath, data, {
            encoding,
            useStreaming,
            chunkSize,
            createDirectories,
            overwrite
          }),
          retries
        ),
        timeout
      );
      
      if (progressTracker) {
        progressTracker.complete();
        this.activeOperations.delete(operationId);
      }
      
      this.emit('fileWritten', {
        operationId,
        filePath,
        size: result.data.size,
        success: true
      });
      
      return {
        success: true,
        filePath: result.data.filePath || result.data.path,
        size: result.data.size,
        sizeFormatted: result.data.sizeFormatted,
        lastModified: result.data.lastModified || result.data.modified,
        bytesWritten: result.data.bytesWritten,
        mimeType: result.data.mimeType,
        operationId
      };
      
    } catch (error) {
      this.activeOperations.delete(operationId);
      this.emit('fileWriteError', {
        operationId,
        filePath,
        error: error.message
      });
      
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  /**
   * Read multiple files with queue management
   * @param {string[]} filePaths - Array of file paths
   * @param {Object} options - Reading options
   * @returns {Promise<Object[]>} Array of file results
   */
  async readMultipleFiles(filePaths, options = {}) {
    const {
      concurrency = this.maxConcurrentOperations,
      continueOnError = true,
      trackProgress = true,
      priority = 'normal'
    } = options;

    const operationId = this.generateOperationId('readMultiple', 'batch');
    const results = [];
    const errors = [];

    try {
      this.activeOperations.set(operationId, {
        type: 'readMultiple',
        filePaths,
        startTime: Date.now(),
        status: 'running',
        completed: 0,
        total: filePaths.length,
        priority
      });

      // Add to queue if needed
      if (this.activeOperations.size > this.maxConcurrentOperations) {
        await this.addToQueue(operationId, 'readMultiple', { filePaths, options });
        return this.getQueuedOperationPromise(operationId);
      }

      // Create progress tracker for batch operation
      let progressTracker = null;
      if (trackProgress) {
        progressTracker = createProgressTracker(operationId);
        progressTracker.setTotal(filePaths.length);
        this.activeOperations.set(operationId, progressTracker);
      }

      // Process files in batches
      for (let i = 0; i < filePaths.length; i += concurrency) {
        const batch = filePaths.slice(i, i + concurrency);
        const batchPromises = batch.map(async (filePath, index) => {
          try {
            const result = await this.readFile(filePath, {
              ...options,
              trackProgress: false // We're tracking at batch level
            });
            
            if (progressTracker) {
              progressTracker.increment();
            }
            
            // Update operation progress
            const operation = this.activeOperations.get(operationId);
            if (operation && operation.completed !== undefined) {
              operation.completed++;
              this.emit('progress', {
                operationId,
                type: 'readMultiple',
                progress: (operation.completed / operation.total) * 100,
                completed: operation.completed,
                total: operation.total
              });
            }
            
            return { filePath, result, success: true };
          } catch (error) {
            if (progressTracker) {
              progressTracker.increment();
            }
            
            const errorResult = { filePath, error: error.message, success: false };
            
            if (continueOnError) {
              errors.push(errorResult);
              return errorResult;
            } else {
              throw error;
            }
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      // Clean up
      if (progressTracker) {
        progressTracker.complete();
        this.activeOperations.delete(operationId);
      }

      this.emit('multipleFilesRead', {
        operationId,
        totalFiles: filePaths.length,
        successCount: results.filter(r => r.success).length,
        errorCount: errors.length
      });

      return {
        results,
        errors,
        success: errors.length === 0 || continueOnError,
        operationId,
        totalFiles: filePaths.length,
        successCount: results.filter(r => r.success).length,
        errorCount: errors.length
      };

    } catch (error) {
      this.activeOperations.delete(operationId);
      this.emit('multipleFilesReadError', {
        operationId,
        error: error.message
      });
      
      this.emit('operationError', {
        operationId,
        type: 'readMultiple',
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Stream file reading for large files
   * @param {string} filePath - Path to file
   * @param {Object} options - Streaming options
   * @returns {AsyncGenerator} File content chunks
   */
  async* streamFileRead(filePath, options = {}) {
    const {
      chunkSize = this.defaultChunkSize,
      encoding = 'utf8',
      trackProgress = true
    } = options;

    const operationId = this.generateOperationId('stream', filePath);
    let progressTracker = null;

    try {
      // Get file size for progress tracking
      const fileInfo = await this.getFileInfo(filePath);
      
      if (trackProgress) {
        progressTracker = createProgressTracker(operationId);
        progressTracker.setTotal(fileInfo.size);
        this.activeOperations.set(operationId, progressTracker);
      }

      // Stream file in chunks
      let offset = 0;
      while (offset < fileInfo.size) {
        const currentChunkSize = Math.min(chunkSize, fileInfo.size - offset);
        
        const chunk = await this.readFileChunk(filePath, offset, currentChunkSize, encoding);
        
        if (progressTracker) {
          progressTracker.update(offset + currentChunkSize);
        }
        
        yield {
          chunk,
          offset,
          size: currentChunkSize,
          isLast: offset + currentChunkSize >= fileInfo.size
        };
        
        offset += currentChunkSize;
      }

      if (progressTracker) {
        progressTracker.complete();
        this.activeOperations.delete(operationId);
      }

    } catch (error) {
      this.activeOperations.delete(operationId);
      throw error;
    }
  }

  /**
   * Get file information
   * @param {string} filePath - Path to file
   * @returns {Promise<Object>} File metadata
   */
  async getFileInfo(filePath) {
    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.READ_FILE, filePath);
      if (result.success) {
        return {
          size: result.data.size,
          modified: result.data.modified,
          name: result.data.name,
          path: result.data.path
        };
      } else {
        throw new Error(result.error.message);
      }
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Cancel an active operation
   * @param {string} operationId - Operation to cancel
   * @returns {boolean} Success status
   */
  cancelOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.cancel();
      this.activeOperations.delete(operationId);
      this.emit('operationCancelled', { operationId });
      return true;
    }
    return false;
  }

  /**
   * Get progress for an operation
   * @param {string} operationId - Operation ID
   * @returns {Object|null} Progress information
   */
  getOperationProgress(operationId) {
    const operation = this.activeOperations.get(operationId);
    return operation ? operation.getProgress() : null;
  }

  /**
   * Get all active operations
   * @returns {Object[]} Array of active operations
   */
  getActiveOperations() {
    return Array.from(this.activeOperations.entries()).map(([id, operation]) => ({
      id,
      progress: operation.getProgress()
    }));
  }

  /**
   * Set maximum concurrent operations
   * @param {number} max - Maximum concurrent operations
   */
  setMaxConcurrentOperations(max) {
    this.maxConcurrentOperations = Math.max(1, max);
  }

  /**
   * Set default chunk size
   * @param {number} size - Chunk size in bytes
   */
  setDefaultChunkSize(size) {
    this.defaultChunkSize = Math.max(1024, size); // Minimum 1KB
  }

  // Private methods

  /**
   * Generate unique operation ID
   * @param {string} type - Operation type
   * @param {string} target - Target file/identifier
   * @returns {string} Unique operation ID
   */
  generateOperationId(type, target) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${type}_${timestamp}_${random}`;
  }

  /**
   * Perform actual file read operation
   * @param {string} filePath - File path
   * @param {string} encoding - File encoding
   * @param {Object} progressTracker - Progress tracker
   * @returns {Promise<Object>} File content and metadata
   */
  async performFileRead(filePath, encoding, progressTracker) {
    if (progressTracker) {
      progressTracker.start();
    }

    const result = await window.electronAPI.invoke(IPC_CHANNELS.READ_FILE, filePath);
    
    if (result.success) {
      if (progressTracker) {
        progressTracker.update(result.data.size);
      }
      return result.data;
    } else {
      throw new Error(result.error.message);
    }
  }

  /**
   * Perform actual file write operation
   * @param {string} filePath - File path
   * @param {string|Buffer} data - Data to write
   * @param {string} encoding - File encoding
   * @param {Object} progressTracker - Progress tracker
   * @param {Object} options - Write options
   * @returns {Promise<Object>} Write result
   */
  async performFileWrite(filePath, data, encoding, progressTracker, options) {
    if (progressTracker) {
      progressTracker.start();
      progressTracker.setTotal(data.length);
    }

    const result = await window.electronAPI.invoke(IPC_CHANNELS.WRITE_FILE, filePath, data);
    
    if (result.success) {
      if (progressTracker) {
        progressTracker.update(data.length);
      }
      return result.data;
    } else {
      throw new Error(result.error.message);
    }
  }

  /**
   * Read a chunk of file data
   * @param {string} filePath - File path
   * @param {number} offset - Byte offset
   * @param {number} size - Chunk size
   * @param {string} encoding - File encoding
   * @returns {Promise<string|Buffer>} Chunk data
   */
  async readFileChunk(filePath, offset, size, encoding) {
    // For now, we'll read the entire file and slice it
    // In a full implementation, this would use proper streaming
    const result = await window.electronAPI.invoke(IPC_CHANNELS.READ_FILE, filePath);
    
    if (result.success) {
      const content = result.data.content;
      return content.slice(offset, offset + size);
    } else {
      throw new Error(result.error.message);
    }
  }

  /**
   * Add operation to queue
   * @param {string} operationId - Operation ID
   * @param {string} type - Operation type
   * @param {Object} data - Operation data
   * @returns {Promise} Queue promise
   */
  async addToQueue(operationId, type, data) {
    return new Promise((resolve, reject) => {
      this.operationQueue.set(operationId, {
        type,
        data,
        resolve,
        reject,
        priority: data.options?.priority || 'normal',
        timestamp: Date.now()
      });
      
      this.emit('operationQueued', { operationId, type });
      this.processQueue();
    });
  }

  /**
   * Get queued operation promise
   * @param {string} operationId - Operation ID
   * @returns {Promise} Operation promise
   */
  getQueuedOperationPromise(operationId) {
    const queuedOperation = this.operationQueue.get(operationId);
    if (queuedOperation) {
      return new Promise((resolve, reject) => {
        queuedOperation.resolve = resolve;
        queuedOperation.reject = reject;
      });
    }
    return Promise.reject(new Error('Operation not found in queue'));
  }

  /**
   * Process operation queue
   */
  async processQueue() {
    if (this.activeOperations.size >= this.maxConcurrentOperations) {
      return;
    }

    // Sort queue by priority and timestamp
    const sortedQueue = Array.from(this.operationQueue.entries())
      .sort(([, a], [, b]) => {
        const priorityOrder = { high: 3, normal: 2, low: 1 };
        const aPriority = priorityOrder[a.priority] || 2;
        const bPriority = priorityOrder[b.priority] || 2;
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        return a.timestamp - b.timestamp;
      });

    for (const [operationId, operation] of sortedQueue) {
      if (this.activeOperations.size >= this.maxConcurrentOperations) {
        break;
      }

      this.operationQueue.delete(operationId);
      
      try {
        let result;
        switch (operation.type) {
          case 'readMultiple':
            result = await this.readMultipleFiles(
              operation.data.filePaths,
              operation.data.options
            );
            break;
          default:
            throw new Error(`Unknown operation type: ${operation.type}`);
        }
        operation.resolve(result);
      } catch (error) {
        operation.reject(error);
      }
    }
  }

  /**
   * Get file information
   * @param {string} filePath - File path
   * @returns {Promise<Object>} File information
   */
  async getFileInfo(filePath) {
    try {
      const result = await window.electronAPI.getFileInfo(filePath);
      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Validate file
   * @param {string} filePath - File path
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateFile(filePath, options = {}) {
    try {
      const result = await window.electronAPI.validateFile(filePath, options);
      return {
        success: true,
        isValid: result.data.isValid,
        errors: result.data.errors || [],
        warnings: result.data.warnings || []
      };
    } catch (error) {
      throw new Error(`Failed to validate file: ${error.message}`);
    }
  }

  /**
   * Copy file
   * @param {string} sourcePath - Source file path
   * @param {string} destinationPath - Destination file path
   * @param {Object} options - Copy options
   * @returns {Promise<Object>} Copy result
   */
  async copyFile(sourcePath, destinationPath, options = {}) {
    const operationId = this.generateOperationId('copy', sourcePath);
    
    try {
      this.activeOperations.set(operationId, {
        type: 'copy',
        sourcePath,
        destinationPath,
        startTime: Date.now(),
        status: 'running'
      });
      
      const result = await window.electronAPI.copyFile(sourcePath, destinationPath, options);
      
      this.activeOperations.delete(operationId);
      
      this.emit('fileCopied', {
        operationId,
        sourcePath,
        destinationPath,
        size: result.data.size
      });
      
      return {
        success: true,
        sourcePath: result.data.sourcePath,
        destinationPath: result.data.destinationPath,
        size: result.data.size,
        operationId
      };
      
    } catch (error) {
      this.activeOperations.delete(operationId);
      
      this.emit('operationError', {
        operationId,
        type: 'copy',
        error: error.message
      });
      
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  /**
    * Set maximum concurrent operations
    * @param {number} max - Maximum concurrent operations
    */
   setMaxConcurrentOperations(max) {
     this.maxConcurrentOperations = Math.max(1, Math.min(max, 20));
     this.processQueue(); // Process queue with new limit
   }

   /**
    * Get operation statistics
    * @returns {Object} Operation statistics
    */
   getOperationStats() {
     const active = Array.from(this.activeOperations.values());
     const queued = Array.from(this.operationQueue.values());
     
     return {
       active: {
         total: active.length,
         byType: active.reduce((acc, op) => {
           acc[op.type] = (acc[op.type] || 0) + 1;
           return acc;
         }, {})
       },
       queued: {
         total: queued.length,
         byPriority: queued.reduce((acc, op) => {
           acc[op.priority] = (acc[op.priority] || 0) + 1;
           return acc;
         }, {})
       },
       maxConcurrent: this.maxConcurrentOperations
     };
   }

  /**
   * Cleanup service
   */
  cleanup() {
    // Cancel all active operations
    for (const [operationId] of this.activeOperations) {
      this.cancelOperation(operationId);
    }
    
    // Reject all queued operations
    for (const [operationId, operation] of this.operationQueue) {
      operation.reject(new Error('Service cleanup - operation cancelled'));
    }
    
    // Clear queue processing interval
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval);
      this.queueProcessingInterval = null;
    }
    
    this.activeOperations.clear();
    this.operationQueue.clear();
    this.removeAllListeners();
  }
}

// Export singleton instance
module.exports = new FileIOService();
module.exports.FileIOService = FileIOService;