/**
 * Test suite for FileIOService
 * Tests core file reading and writing functionality
 */

import { FileIOService } from '../services/fileIOService.js';
import { jest } from '@jest/globals';

// Mock electron API
const mockElectronAPI = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  getFileInfo: jest.fn(),
  validateFile: jest.fn(),
  copyFile: jest.fn(),
  readMultipleFiles: jest.fn()
};

// Mock window.electronAPI
global.window = {
  electronAPI: mockElectronAPI
};

describe('FileIOService', () => {
  let fileIOService;

  beforeEach(() => {
    fileIOService = new FileIOService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    fileIOService.cleanup();
  });

  describe('readFile', () => {
    it('should read file successfully', async () => {
      const mockResult = {
        success: true,
        data: {
          content: 'test content',
          filePath: '/test/file.txt',
          size: 12,
          sizeFormatted: '12 B',
          lastModified: new Date().toISOString(),
          encoding: 'utf8',
          mimeType: 'text/plain'
        }
      };

      mockElectronAPI.readFile.mockResolvedValue(mockResult);
      mockElectronAPI.validateFile.mockResolvedValue({
        success: true,
        data: { isValid: true, errors: [] }
      });

      const result = await fileIOService.readFile('/test/file.txt');

      expect(result.success).toBe(true);
      expect(result.content).toBe('test content');
      expect(result.filePath).toBe('/test/file.txt');
      expect(result.size).toBe(12);
      expect(mockElectronAPI.readFile).toHaveBeenCalledWith('/test/file.txt', {
        encoding: 'utf8',
        useStreaming: false,
        chunkSize: 65536,
        maxSize: 104857600
      });
    });

    it('should handle file validation failure', async () => {
      mockElectronAPI.validateFile.mockResolvedValue({
        success: true,
        data: { isValid: false, errors: ['File not readable'] }
      });

      await expect(fileIOService.readFile('/test/invalid.txt'))
        .rejects.toThrow('File validation failed: File not readable');
    });

    it('should handle read errors', async () => {
      mockElectronAPI.validateFile.mockResolvedValue({
        success: true,
        data: { isValid: true, errors: [] }
      });
      mockElectronAPI.readFile.mockRejectedValue(new Error('File not found'));

      await expect(fileIOService.readFile('/test/missing.txt'))
        .rejects.toThrow('Failed to read file: File not found');
    });
  });

  describe('writeFile', () => {
    it('should write file successfully', async () => {
      const mockResult = {
        success: true,
        data: {
          filePath: '/test/output.txt',
          size: 12,
          sizeFormatted: '12 B',
          lastModified: new Date().toISOString(),
          bytesWritten: 12,
          mimeType: 'text/plain'
        }
      };

      mockElectronAPI.writeFile.mockResolvedValue(mockResult);

      const result = await fileIOService.writeFile('/test/output.txt', 'test content');

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('/test/output.txt');
      expect(result.size).toBe(12);
      expect(result.bytesWritten).toBe(12);
      expect(mockElectronAPI.writeFile).toHaveBeenCalledWith('/test/output.txt', 'test content', {
        encoding: 'utf8',
        useStreaming: false,
        chunkSize: 65536,
        createDirectories: true,
        overwrite: true
      });
    });

    it('should create backup when requested', async () => {
      const existingContent = {
        success: true,
        data: { content: 'existing content' }
      };
      const writeResult = {
        success: true,
        data: {
          filePath: '/test/output.txt',
          size: 12,
          lastModified: new Date().toISOString()
        }
      };

      mockElectronAPI.readFile.mockResolvedValue(existingContent);
      mockElectronAPI.writeFile.mockResolvedValue(writeResult);

      await fileIOService.writeFile('/test/output.txt', 'new content', {
        createBackup: true
      });

      expect(mockElectronAPI.readFile).toHaveBeenCalledWith('/test/output.txt');
      expect(mockElectronAPI.writeFile).toHaveBeenCalledTimes(2); // backup + main write
    });

    it('should handle write errors', async () => {
      mockElectronAPI.writeFile.mockRejectedValue(new Error('Permission denied'));

      await expect(fileIOService.writeFile('/test/readonly.txt', 'content'))
        .rejects.toThrow('Failed to write file: Permission denied');
    });
  });

  describe('readMultipleFiles', () => {
    it('should read multiple files successfully', async () => {
      const mockResult = {
        success: true,
        data: {
          results: [
            { success: true, filePath: '/test/file1.txt', content: 'content1' },
            { success: true, filePath: '/test/file2.txt', content: 'content2' }
          ]
        }
      };

      mockElectronAPI.readMultipleFiles.mockResolvedValue(mockResult);

      const result = await fileIOService.readMultipleFiles(['/test/file1.txt', '/test/file2.txt']);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
    });

    it('should handle partial failures', async () => {
      const mockResult = {
        success: true,
        data: {
          results: [
            { success: true, filePath: '/test/file1.txt', content: 'content1' },
            { success: false, filePath: '/test/file2.txt', error: 'File not found' }
          ]
        }
      };

      mockElectronAPI.readMultipleFiles.mockResolvedValue(mockResult);

      const result = await fileIOService.readMultipleFiles(['/test/file1.txt', '/test/file2.txt']);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(2);
      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
    });
  });

  describe('getFileInfo', () => {
    it('should get file information successfully', async () => {
      const mockResult = {
        success: true,
        data: {
          path: '/test/file.txt',
          size: 1024,
          sizeFormatted: '1.0 KB',
          lastModified: new Date().toISOString(),
          mimeType: 'text/plain',
          encoding: 'utf8'
        }
      };

      mockElectronAPI.getFileInfo.mockResolvedValue(mockResult);

      const result = await fileIOService.getFileInfo('/test/file.txt');

      expect(result.success).toBe(true);
      expect(result.data.size).toBe(1024);
      expect(result.data.mimeType).toBe('text/plain');
    });
  });

  describe('validateFile', () => {
    it('should validate file successfully', async () => {
      const mockResult = {
        success: true,
        data: {
          isValid: true,
          errors: [],
          warnings: []
        }
      };

      mockElectronAPI.validateFile.mockResolvedValue(mockResult);

      const result = await fileIOService.validateFile('/test/file.txt');

      expect(result.success).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle validation failures', async () => {
      const mockResult = {
        success: true,
        data: {
          isValid: false,
          errors: ['File is corrupted'],
          warnings: ['Large file size']
        }
      };

      mockElectronAPI.validateFile.mockResolvedValue(mockResult);

      const result = await fileIOService.validateFile('/test/file.txt');

      expect(result.success).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(['File is corrupted']);
      expect(result.warnings).toEqual(['Large file size']);
    });
  });

  describe('copyFile', () => {
    it('should copy file successfully', async () => {
      const mockResult = {
        success: true,
        data: {
          sourcePath: '/test/source.txt',
          destinationPath: '/test/dest.txt',
          size: 1024
        }
      };

      mockElectronAPI.copyFile.mockResolvedValue(mockResult);

      const result = await fileIOService.copyFile('/test/source.txt', '/test/dest.txt');

      expect(result.success).toBe(true);
      expect(result.sourcePath).toBe('/test/source.txt');
      expect(result.destinationPath).toBe('/test/dest.txt');
      expect(result.size).toBe(1024);
    });
  });

  describe('operation management', () => {
    it('should track active operations', async () => {
      const mockResult = {
        success: true,
        data: { content: 'test', filePath: '/test/file.txt', size: 4 }
      };
      mockElectronAPI.readFile.mockResolvedValue(mockResult);
      mockElectronAPI.validateFile.mockResolvedValue({
        success: true,
        data: { isValid: true, errors: [] }
      });

      const readPromise = fileIOService.readFile('/test/file.txt');
      
      // Check that operation is tracked
      const stats = fileIOService.getOperationStats();
      expect(stats.active.total).toBe(1);
      expect(stats.active.byType.read).toBe(1);

      await readPromise;

      // Check that operation is completed
      const finalStats = fileIOService.getOperationStats();
      expect(finalStats.active.total).toBe(0);
    });

    it('should emit events for operations', async () => {
      const mockResult = {
        success: true,
        data: { content: 'test', filePath: '/test/file.txt', size: 4 }
      };
      mockElectronAPI.readFile.mockResolvedValue(mockResult);
      mockElectronAPI.validateFile.mockResolvedValue({
        success: true,
        data: { isValid: true, errors: [] }
      });

      const eventSpy = jest.fn();
      fileIOService.on('fileRead', eventSpy);

      await fileIOService.readFile('/test/file.txt');

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        filePath: '/test/file.txt',
        size: 4,
        success: true
      }));
    });

    it('should set max concurrent operations', () => {
      fileIOService.setMaxConcurrentOperations(10);
      const stats = fileIOService.getOperationStats();
      expect(stats.maxConcurrent).toBe(10);

      // Test bounds
      fileIOService.setMaxConcurrentOperations(0);
      expect(fileIOService.getOperationStats().maxConcurrent).toBe(1);

      fileIOService.setMaxConcurrentOperations(25);
      expect(fileIOService.getOperationStats().maxConcurrent).toBe(20);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all operations and listeners', () => {
      const eventSpy = jest.fn();
      fileIOService.on('test', eventSpy);

      fileIOService.cleanup();

      expect(fileIOService.listenerCount('test')).toBe(0);
      expect(fileIOService.getOperationStats().active.total).toBe(0);
    });
  });
});