const { ErrorHandlingService } = require('../services/errorHandlingService');
const fs = require('fs/promises');
const logger = require('../utils/logger');

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../utils/logger');

describe('ErrorHandlingService', () => {
  let errorHandlingService;

  beforeEach(() => {
    errorHandlingService = new ErrorHandlingService();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mocks
    fs.access.mockResolvedValue();
    logger.info.mockImplementation(() => {});
    logger.error.mockImplementation(() => {});
    logger.warn.mockImplementation(() => {});
  });

  describe('executeWithRetry', () => {
    it('should execute operation successfully on first try', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await errorHandlingService.executeWithRetry(operation);
      
      expect(operation).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Another failure'))
        .mockResolvedValueOnce('success');
      
      const result = await errorHandlingService.executeWithRetry(operation, {
        maxRetries: 3,
        baseDelay: 10
      });
      
      expect(operation).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(3);
    });

    it('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      const result = await errorHandlingService.executeWithRetry(operation, {
        maxRetries: 2,
        baseDelay: 10
      });
      
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Persistent failure');
      expect(result.attempts).toBe(3);
    });

    it('should use exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce('success');
      
      const startTime = Date.now();
      await errorHandlingService.executeWithRetry(operation, {
        maxRetries: 2,
        baseDelay: 50,
        exponentialBackoff: true
      });
      const endTime = Date.now();
      
      // Should have waited at least 50ms + 100ms (exponential backoff)
      expect(endTime - startTime).toBeGreaterThan(140);
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      const operation = jest.fn().mockRejectedValue(error);
      
      const result = await errorHandlingService.executeWithRetry(operation, {
        maxRetries: 3
      });
      
      expect(operation).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });

  describe('transaction management', () => {
    it('should start a new transaction', () => {
      const transactionId = 'test-transaction';
      
      const result = errorHandlingService.startTransaction(transactionId);
      
      expect(result.success).toBe(true);
      expect(result.transactionId).toBe(transactionId);
      
      const activeTransactions = errorHandlingService.getActiveTransactions();
      expect(activeTransactions).toHaveLength(1);
      expect(activeTransactions[0].id).toBe(transactionId);
    });

    it('should add operations to transaction', () => {
      const transactionId = 'test-transaction';
      errorHandlingService.startTransaction(transactionId);
      
      const operation = {
        type: 'file-copy',
        source: '/test/source.txt',
        target: '/test/target.txt'
      };
      
      const result = errorHandlingService.addToTransaction(transactionId, operation);
      
      expect(result.success).toBe(true);
      
      const activeTransactions = errorHandlingService.getActiveTransactions();
      expect(activeTransactions[0].operations).toHaveLength(1);
      expect(activeTransactions[0].operations[0]).toEqual(operation);
    });

    it('should commit transaction successfully', () => {
      const transactionId = 'test-transaction';
      errorHandlingService.startTransaction(transactionId);
      
      const result = errorHandlingService.commitTransaction(transactionId);
      
      expect(result.success).toBe(true);
      
      const activeTransactions = errorHandlingService.getActiveTransactions();
      expect(activeTransactions).toHaveLength(0);
    });

    it('should rollback transaction with cleanup', async () => {
      const transactionId = 'test-transaction';
      errorHandlingService.startTransaction(transactionId);
      
      // Add some operations
      errorHandlingService.addToTransaction(transactionId, {
        type: 'file-create',
        path: '/test/created.txt'
      });
      
      const result = await errorHandlingService.rollbackTransaction(transactionId, 'Test rollback');
      
      expect(result.success).toBe(true);
      expect(result.rollbackReason).toBe('Test rollback');
      
      const activeTransactions = errorHandlingService.getActiveTransactions();
      expect(activeTransactions).toHaveLength(0);
    });

    it('should handle rollback of file operations', async () => {
      const transactionId = 'test-transaction';
      errorHandlingService.startTransaction(transactionId);
      
      // Mock file operations
      fs.unlink = jest.fn().mockResolvedValue();
      fs.rename = jest.fn().mockResolvedValue();
      
      // Add operations that need rollback
      errorHandlingService.addToTransaction(transactionId, {
        type: 'file-create',
        path: '/test/created.txt'
      });
      
      errorHandlingService.addToTransaction(transactionId, {
        type: 'file-move',
        source: '/test/original.txt',
        target: '/test/moved.txt'
      });
      
      await errorHandlingService.rollbackTransaction(transactionId, 'Test rollback');
      
      expect(fs.unlink).toHaveBeenCalledWith('/test/created.txt');
      expect(fs.rename).toHaveBeenCalledWith('/test/moved.txt', '/test/original.txt');
    });
  });

  describe('handleFileSystemError', () => {
    it('should categorize and handle ENOENT error', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      error.path = '/test/missing.txt';
      
      const result = errorHandlingService.handleFileSystemError(error, {
        operation: 'read',
        filePath: '/test/missing.txt'
      });
      
      expect(result.severity).toBe('medium');
      expect(result.category).toBe('file-not-found');
      expect(result.userMessage).toContain('file or directory does not exist');
      expect(result.suggestions).toContain('Verify the file path is correct');
      expect(result.retryable).toBe(false);
    });

    it('should categorize and handle EACCES error', () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      error.path = '/test/protected.txt';
      
      const result = errorHandlingService.handleFileSystemError(error, {
        operation: 'write',
        filePath: '/test/protected.txt'
      });
      
      expect(result.severity).toBe('high');
      expect(result.category).toBe('permission-denied');
      expect(result.userMessage).toContain('Permission denied');
      expect(result.suggestions).toContain('Check file permissions');
      expect(result.retryable).toBe(false);
    });

    it('should categorize and handle ENOSPC error', () => {
      const error = new Error('No space left on device');
      error.code = 'ENOSPC';
      
      const result = errorHandlingService.handleFileSystemError(error, {
        operation: 'write'
      });
      
      expect(result.severity).toBe('critical');
      expect(result.category).toBe('disk-space');
      expect(result.userMessage).toContain('insufficient disk space');
      expect(result.suggestions).toContain('Free up disk space');
      expect(result.retryable).toBe(true);
    });

    it('should handle unknown errors', () => {
      const error = new Error('Unknown error');
      error.code = 'EUNKNOWN';
      
      const result = errorHandlingService.handleFileSystemError(error);
      
      expect(result.severity).toBe('medium');
      expect(result.category).toBe('unknown');
      expect(result.userMessage).toContain('An unexpected error occurred');
      expect(result.retryable).toBe(true);
    });
  });

  describe('checkPermissions', () => {
    it('should check read permissions successfully', async () => {
      fs.access.mockResolvedValue();
      
      const result = await errorHandlingService.checkPermissions('/test/file.txt', 'read');
      
      expect(result.hasPermission).toBe(true);
      expect(result.operation).toBe('read');
      expect(fs.access).toHaveBeenCalledWith('/test/file.txt', fs.constants.R_OK);
    });

    it('should check write permissions successfully', async () => {
      fs.access.mockResolvedValue();
      
      const result = await errorHandlingService.checkPermissions('/test/file.txt', 'write');
      
      expect(result.hasPermission).toBe(true);
      expect(result.operation).toBe('write');
      expect(fs.access).toHaveBeenCalledWith('/test/file.txt', fs.constants.W_OK);
    });

    it('should detect permission denial', async () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      fs.access.mockRejectedValue(error);
      
      const result = await errorHandlingService.checkPermissions('/test/file.txt', 'read');
      
      expect(result.hasPermission).toBe(false);
      expect(result.error).toBe(error);
    });

    it('should handle file not found during permission check', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.access.mockRejectedValue(error);
      
      const result = await errorHandlingService.checkPermissions('/test/missing.txt', 'read');
      
      expect(result.hasPermission).toBe(false);
      expect(result.fileExists).toBe(false);
    });
  });

  describe('error history', () => {
    it('should track error history', () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      
      errorHandlingService.handleFileSystemError(error1, { operation: 'read' });
      errorHandlingService.handleFileSystemError(error2, { operation: 'write' });
      
      const history = errorHandlingService.getErrorHistory();
      
      expect(history).toHaveLength(2);
      expect(history[0].error.message).toBe('Error 1');
      expect(history[1].error.message).toBe('Error 2');
    });

    it('should filter error history by severity', () => {
      const criticalError = new Error('Critical error');
      criticalError.code = 'ENOSPC';
      
      const mediumError = new Error('Medium error');
      mediumError.code = 'ENOENT';
      
      errorHandlingService.handleFileSystemError(criticalError);
      errorHandlingService.handleFileSystemError(mediumError);
      
      const criticalHistory = errorHandlingService.getErrorHistory({ severity: 'critical' });
      
      expect(criticalHistory).toHaveLength(1);
      expect(criticalHistory[0].severity).toBe('critical');
    });

    it('should limit error history size', () => {
      // Add more errors than the limit
      for (let i = 0; i < 150; i++) {
        const error = new Error(`Error ${i}`);
        errorHandlingService.handleFileSystemError(error);
      }
      
      const history = errorHandlingService.getErrorHistory();
      
      expect(history.length).toBeLessThanOrEqual(100); // Default limit
    });

    it('should clear error history', () => {
      const error = new Error('Test error');
      errorHandlingService.handleFileSystemError(error);
      
      expect(errorHandlingService.getErrorHistory()).toHaveLength(1);
      
      errorHandlingService.clearErrorHistory();
      
      expect(errorHandlingService.getErrorHistory()).toHaveLength(0);
    });
  });

  describe('getStatistics', () => {
    it('should return service statistics', async () => {
      // Generate some activity
      const operation = jest.fn().mockResolvedValue('success');
      await errorHandlingService.executeWithRetry(operation);
      
      errorHandlingService.startTransaction('test-1');
      errorHandlingService.commitTransaction('test-1');
      
      const error = new Error('Test error');
      errorHandlingService.handleFileSystemError(error);
      
      const stats = errorHandlingService.getStatistics();
      
      expect(stats).toEqual({
        retryOperations: {
          total: 1,
          successful: 1,
          failed: 0,
          averageAttempts: 1
        },
        transactions: {
          total: 1,
          committed: 1,
          rolledBack: 0,
          active: 0
        },
        errors: {
          total: 1,
          bySeverity: {
            low: 0,
            medium: 1,
            high: 0,
            critical: 0
          },
          byCategory: {
            unknown: 1
          }
        },
        permissionChecks: {
          total: 0,
          successful: 0,
          failed: 0
        }
      });
    });
  });

  describe('error recovery', () => {
    it('should suggest recovery actions for disk space errors', () => {
      const error = new Error('No space left');
      error.code = 'ENOSPC';
      
      const result = errorHandlingService.handleFileSystemError(error);
      
      expect(result.suggestions).toContain('Free up disk space');
      expect(result.suggestions).toContain('Move files to a different location');
      expect(result.recoveryActions).toContain('cleanup-temp-files');
    });

    it('should suggest recovery actions for permission errors', () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      
      const result = errorHandlingService.handleFileSystemError(error, {
        filePath: '/test/file.txt'
      });
      
      expect(result.suggestions).toContain('Check file permissions');
      expect(result.suggestions).toContain('Run with appropriate privileges');
      expect(result.recoveryActions).toContain('check-permissions');
    });
  });

  describe('performance', () => {
    it('should track operation timing', async () => {
      const operation = jest.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve('success'), 50));
      });
      
      const result = await errorHandlingService.executeWithRetry(operation);
      
      expect(result.executionTime).toBeGreaterThan(40);
      expect(result.executionTime).toBeLessThan(100);
    });
  });
});