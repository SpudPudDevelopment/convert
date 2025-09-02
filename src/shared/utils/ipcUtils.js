/**
 * IPC Utility Functions
 * Common patterns and utilities for IPC communication
 */

const {
  IPC_CHANNELS,
  MESSAGE_TYPES,
  ERROR_TYPES,
  CONVERSION_STATUS,
  createIPCMessage,
  createIPCResponse
} = require('../types/ipc.js');

/**
 * Retry mechanism for IPC calls
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise} Result of the function
 */
const withRetry = async (fn, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i === maxRetries) {
        throw lastError;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

/**
 * Timeout wrapper for IPC calls
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeout - Timeout in ms
 * @returns {Promise} Promise with timeout
 */
const withTimeout = (promise, timeout = 30000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
    })
  ]);
};

/**
 * Batch IPC operations
 * @param {Array} operations - Array of IPC operations
 * @param {number} concurrency - Maximum concurrent operations
 * @returns {Promise<Array>} Results of all operations
 */
const batchIPCOperations = async (operations, concurrency = 5) => {
  const results = [];
  const executing = [];
  
  for (const operation of operations) {
    const promise = operation().then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });
    
    results.push(promise);
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
};

/**
 * Validate IPC message structure
 * @param {Object} message - IPC message to validate
 * @returns {boolean} Is valid message
 */
const validateIPCMessage = (message) => {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  const requiredFields = ['channel', 'type', 'requestId', 'timestamp'];
  return requiredFields.every(field => message.hasOwnProperty(field));
};

/**
 * Validate IPC response structure
 * @param {Object} response - IPC response to validate
 * @returns {boolean} Is valid response
 */
const validateIPCResponse = (response) => {
  if (!response || typeof response !== 'object') {
    return false;
  }
  
  const requiredFields = ['requestId', 'success', 'timestamp'];
  return requiredFields.every(field => response.hasOwnProperty(field));
};

/**
 * Create a safe IPC wrapper that handles errors gracefully
 * @param {Function} ipcFunction - IPC function to wrap
 * @param {*} defaultValue - Default value to return on error
 * @returns {Function} Wrapped function
 */
const safeIPC = (ipcFunction, defaultValue = null) => {
  return async (...args) => {
    try {
      return await ipcFunction(...args);
    } catch (error) {
      console.error('IPC operation failed:', error);
      return defaultValue;
    }
  };
};

/**
 * Debounce IPC calls to prevent excessive requests
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Debounce delay in ms
 * @returns {Function} Debounced function
 */
const debounceIPC = (fn, delay = 300) => {
  let timeoutId;
  
  return (...args) => {
    clearTimeout(timeoutId);
    
    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  };
};

/**
 * Throttle IPC calls to limit frequency
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
const throttleIPC = (fn, limit = 1000) => {
  let inThrottle;
  
  return (...args) => {
    if (!inThrottle) {
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
      }, limit);
      
      return fn(...args);
    }
    
    return Promise.reject(new Error('Function is throttled'));
  };
};

/**
 * Create a progress tracker for long-running operations
 * @param {string} operationId - Unique operation identifier
 * @returns {Object} Progress tracker
 */
const createProgressTracker = (operationId) => {
  const listeners = new Set();
  let currentProgress = 0;
  let status = CONVERSION_STATUS.PENDING;
  let error = null;
  
  return {
    id: operationId,
    
    updateProgress(progress, message = '') {
      currentProgress = Math.max(0, Math.min(100, progress));
      status = CONVERSION_STATUS.IN_PROGRESS;
      
      const progressData = {
        id: operationId,
        progress: currentProgress,
        message,
        status,
        timestamp: new Date().toISOString()
      };
      
      listeners.forEach(listener => {
        try {
          listener(progressData);
        } catch (err) {
          console.error('Progress listener error:', err);
        }
      });
    },
    
    complete(result = null) {
      currentProgress = 100;
      status = CONVERSION_STATUS.COMPLETED;
      
      const completionData = {
        id: operationId,
        progress: 100,
        status,
        result,
        timestamp: new Date().toISOString()
      };
      
      listeners.forEach(listener => {
        try {
          listener(completionData);
        } catch (err) {
          console.error('Progress listener error:', err);
        }
      });
    },
    
    fail(errorMessage, errorData = null) {
      status = CONVERSION_STATUS.FAILED;
      error = { message: errorMessage, data: errorData };
      
      const errorInfo = {
        id: operationId,
        progress: currentProgress,
        status,
        error,
        timestamp: new Date().toISOString()
      };
      
      listeners.forEach(listener => {
        try {
          listener(errorInfo);
        } catch (err) {
          console.error('Progress listener error:', err);
        }
      });
    },
    
    onProgress(listener) {
      listeners.add(listener);
      
      // Return unsubscribe function
      return () => {
        listeners.delete(listener);
      };
    },
    
    getStatus() {
      return {
        id: operationId,
        progress: currentProgress,
        status,
        error
      };
    },
    
    cleanup() {
      listeners.clear();
    }
  };
};

/**
 * File validation utilities
 */
const fileValidation = {
  /**
   * Check if file exists and is accessible
   * @param {string} filePath - Path to file
   * @returns {Promise<boolean>} File exists and is accessible
   */
  async isAccessible(filePath) {
    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.invoke(IPC_CHANNELS.READ_FILE, filePath);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  },
  
  /**
   * Validate file size
   * @param {number} size - File size in bytes
   * @param {number} maxSize - Maximum allowed size in bytes
   * @returns {boolean} Is valid size
   */
  isValidSize(size, maxSize = 100 * 1024 * 1024) { // 100MB default
    return size > 0 && size <= maxSize;
  },
  
  /**
   * Validate file extension
   * @param {string} filePath - File path
   * @param {string[]} allowedExtensions - Allowed extensions
   * @returns {boolean} Is valid extension
   */
  isValidExtension(filePath, allowedExtensions) {
    if (!filePath || !allowedExtensions || !Array.isArray(allowedExtensions)) {
      return false;
    }
    
    const extension = filePath.split('.').pop()?.toLowerCase();
    return allowedExtensions.includes(extension);
  }
};

/**
 * Error handling utilities
 */
const errorHandling = {
  /**
   * Create standardized error object
   * @param {string} type - Error type
   * @param {string} message - Error message
   * @param {*} data - Additional error data
   * @returns {Object} Standardized error
   */
  createError(type, message, data = null) {
    return {
      type: type || ERROR_TYPES.UNKNOWN_ERROR,
      message: message || 'An unknown error occurred',
      data,
      timestamp: new Date().toISOString()
    };
  },
  
  /**
   * Check if error is recoverable
   * @param {Object} error - Error object
   * @returns {boolean} Is recoverable
   */
  isRecoverable(error) {
    const recoverableTypes = [
      ERROR_TYPES.NETWORK_ERROR,
      ERROR_TYPES.PERMISSION_DENIED
    ];
    
    return recoverableTypes.includes(error?.type);
  },
  
  /**
   * Get user-friendly error message
   * @param {Object} error - Error object
   * @returns {string} User-friendly message
   */
  getUserMessage(error) {
    const messages = {
      [ERROR_TYPES.FILE_NOT_FOUND]: 'The selected file could not be found.',
      [ERROR_TYPES.PERMISSION_DENIED]: 'Permission denied. Please check file permissions.',
      [ERROR_TYPES.CONVERSION_FAILED]: 'File conversion failed. Please try again.',
      [ERROR_TYPES.INVALID_FILE_TYPE]: 'This file type is not supported.',
      [ERROR_TYPES.NETWORK_ERROR]: 'Network error. Please check your connection.',
      [ERROR_TYPES.UNKNOWN_ERROR]: 'An unexpected error occurred.'
    };
    
    return messages[error?.type] || messages[ERROR_TYPES.UNKNOWN_ERROR];
  }
};

/**
 * Performance monitoring utilities
 */
const performance = {
  /**
   * Measure IPC operation performance
   * @param {Function} operation - Operation to measure
   * @param {string} operationName - Name for logging
   * @returns {Promise} Operation result with timing
   */
  async measure(operation, operationName = 'IPC Operation') {
    const startTime = Date.now();
    
    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      
      console.log(`${operationName} completed in ${duration}ms`);
      
      return {
        result,
        duration,
        success: true
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`${operationName} failed after ${duration}ms:`, error);
      
      return {
        error,
        duration,
        success: false
      };
    }
  }
};

// Export all utilities
module.exports = {
  withRetry,
  withTimeout,
  batchIPCOperations,
  validateIPCMessage,
  validateIPCResponse,
  safeIPC,
  debounceIPC,
  throttleIPC,
  createProgressTracker,
  fileValidation,
  errorHandling,
  performance
};