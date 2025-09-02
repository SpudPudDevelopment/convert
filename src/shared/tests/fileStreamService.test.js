/**
 * Test suite for FileStreamService
 * Tests streaming file operations in the main process
 */

import { FileStreamService } from '../services/fileStreamService.js';
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';

// Mock fs modules
jest.mock('fs/promises');
jest.mock('fs');
jest.mock('path');

describe('FileStreamService', () => {
  let fileStreamService;
  let mockReadStream;
  let mockWriteStream;

  beforeEach(() => {
    fileStreamService = new FileStreamService();
    
    // Mock streams
    mockReadStream = {
      on: jest.fn(),
      pipe: jest.fn(),
      destroy: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn()
    };
    
    mockWriteStream = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn()
    };
    
    createReadStream.mockReturnValue(mockReadStream);
    createWriteStream.mockReturnValue(mockWriteStream);
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    fileStreamService.cleanup();
  });

  describe('createReadStream', () => {
    it('should create a readable stream successfully', async () => {
      const mockStats = {
        isFile: () => true,
        size: 1024,
        mtime: new Date()
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      path.extname.mockReturnValue('.txt');
      
      const result = await fileStreamService.createReadStream('/test/file.txt');
      
      expect(result.success).toBe(true);
      expect(result.streamId).toBeDefined();
      expect(result.fileInfo.size).toBe(1024);
      expect(createReadStream).toHaveBeenCalledWith('/test/file.txt', {
        encoding: 'utf8',
        highWaterMark: 65536
      });
    });

    it('should handle file access errors', async () => {
      fs.access.mockRejectedValue(new Error('File not found'));
      
      const result = await fileStreamService.createReadStream('/test/missing.txt');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should validate file is not a directory', async () => {
      const mockStats = {
        isFile: () => false,
        isDirectory: () => true
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      
      const result = await fileStreamService.createReadStream('/test/directory');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a file');
    });
  });

  describe('createWriteStream', () => {
    it('should create a writable stream successfully', async () => {
      fs.access.mockRejectedValue(new Error('File does not exist')); // File doesn't exist, which is fine
      path.dirname.mockReturnValue('/test');
      fs.mkdir.mockResolvedValue();
      
      const result = await fileStreamService.createWriteStream('/test/output.txt');
      
      expect(result.success).toBe(true);
      expect(result.streamId).toBeDefined();
      expect(createWriteStream).toHaveBeenCalledWith('/test/output.txt', {
        encoding: 'utf8',
        highWaterMark: 65536
      });
    });

    it('should handle existing file when overwrite is false', async () => {
      fs.access.mockResolvedValue(); // File exists
      
      const result = await fileStreamService.createWriteStream('/test/existing.txt', {
        overwrite: false
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should create directories when needed', async () => {
      fs.access.mockRejectedValue(new Error('File does not exist'));
      path.dirname.mockReturnValue('/test/nested/path');
      fs.mkdir.mockResolvedValue();
      
      const result = await fileStreamService.createWriteStream('/test/nested/path/file.txt', {
        createDirectories: true
      });
      
      expect(result.success).toBe(true);
      expect(fs.mkdir).toHaveBeenCalledWith('/test/nested/path', { recursive: true });
    });
  });

  describe('readFileChunked', () => {
    it('should read file in chunks with progress tracking', async () => {
      const mockStats = {
        isFile: () => true,
        size: 1000,
        mtime: new Date()
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      path.extname.mockReturnValue('.txt');
      
      // Mock stream events
      let dataCallback, endCallback;
      mockReadStream.on.mockImplementation((event, callback) => {
        if (event === 'data') dataCallback = callback;
        if (event === 'end') endCallback = callback;
        return mockReadStream;
      });
      
      const progressCallback = jest.fn();
      const resultPromise = fileStreamService.readFileChunked('/test/file.txt', {
        onProgress: progressCallback
      });
      
      // Simulate data chunks
      setTimeout(() => {
        dataCallback(Buffer.from('chunk1'));
        dataCallback(Buffer.from('chunk2'));
        endCallback();
      }, 10);
      
      const result = await resultPromise;
      
      expect(result.success).toBe(true);
      expect(result.content).toBe('chunk1chunk2');
      expect(result.totalBytes).toBe(12);
      expect(progressCallback).toHaveBeenCalled();
    });

    it('should handle read stream errors', async () => {
      const mockStats = {
        isFile: () => true,
        size: 1000,
        mtime: new Date()
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      
      let errorCallback;
      mockReadStream.on.mockImplementation((event, callback) => {
        if (event === 'error') errorCallback = callback;
        return mockReadStream;
      });
      
      const resultPromise = fileStreamService.readFileChunked('/test/file.txt');
      
      // Simulate error
      setTimeout(() => {
        errorCallback(new Error('Read error'));
      }, 10);
      
      const result = await resultPromise;
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Read error');
    });
  });

  describe('writeFileChunked', () => {
    it('should write file in chunks with progress tracking', async () => {
      fs.access.mockRejectedValue(new Error('File does not exist'));
      path.dirname.mockReturnValue('/test');
      fs.mkdir.mockResolvedValue();
      
      let finishCallback;
      mockWriteStream.on.mockImplementation((event, callback) => {
        if (event === 'finish') finishCallback = callback;
        return mockWriteStream;
      });
      
      mockWriteStream.write.mockReturnValue(true);
      
      const progressCallback = jest.fn();
      const content = 'This is test content for chunked writing';
      
      const resultPromise = fileStreamService.writeFileChunked('/test/output.txt', content, {
        chunkSize: 10,
        onProgress: progressCallback
      });
      
      // Simulate finish event
      setTimeout(() => {
        finishCallback();
      }, 10);
      
      const result = await resultPromise;
      
      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBe(content.length);
      expect(progressCallback).toHaveBeenCalled();
      expect(mockWriteStream.write).toHaveBeenCalledTimes(Math.ceil(content.length / 10));
    });

    it('should handle write stream errors', async () => {
      fs.access.mockRejectedValue(new Error('File does not exist'));
      path.dirname.mockReturnValue('/test');
      fs.mkdir.mockResolvedValue();
      
      let errorCallback;
      mockWriteStream.on.mockImplementation((event, callback) => {
        if (event === 'error') errorCallback = callback;
        return mockWriteStream;
      });
      
      const resultPromise = fileStreamService.writeFileChunked('/test/output.txt', 'content');
      
      // Simulate error
      setTimeout(() => {
        errorCallback(new Error('Write error'));
      }, 10);
      
      const result = await resultPromise;
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Write error');
    });
  });

  describe('copyFile', () => {
    it('should copy file successfully', async () => {
      const mockStats = {
        isFile: () => true,
        size: 1000,
        mtime: new Date()
      };
      
      fs.access.mockResolvedValueOnce(); // Source exists
      fs.access.mockRejectedValueOnce(new Error('Dest does not exist')); // Dest doesn't exist
      fs.stat.mockResolvedValue(mockStats);
      path.dirname.mockReturnValue('/test/dest');
      fs.mkdir.mockResolvedValue();
      
      // Mock pipe operation
      let pipeCallback;
      mockReadStream.pipe.mockImplementation((writeStream) => {
        setTimeout(() => {
          // Simulate successful pipe
          writeStream.emit('finish');
        }, 10);
        return writeStream;
      });
      
      mockWriteStream.on.mockImplementation((event, callback) => {
        if (event === 'finish') pipeCallback = callback;
        return mockWriteStream;
      });
      
      const progressCallback = jest.fn();
      const result = await fileStreamService.copyFile('/test/source.txt', '/test/dest.txt', {
        onProgress: progressCallback
      });
      
      expect(result.success).toBe(true);
      expect(result.sourcePath).toBe('/test/source.txt');
      expect(result.destinationPath).toBe('/test/dest.txt');
      expect(mockReadStream.pipe).toHaveBeenCalledWith(mockWriteStream);
    });

    it('should handle copy errors', async () => {
      fs.access.mockRejectedValue(new Error('Source file not found'));
      
      const result = await fileStreamService.copyFile('/test/missing.txt', '/test/dest.txt');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Source file not found');
    });
  });

  describe('getFileInfo', () => {
    it('should get detailed file information', async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
        size: 2048,
        mtime: new Date('2023-01-01'),
        atime: new Date('2023-01-02'),
        ctime: new Date('2023-01-03'),
        mode: 0o644
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      path.extname.mockReturnValue('.txt');
      path.basename.mockReturnValue('file.txt');
      
      const result = await fileStreamService.getFileInfo('/test/file.txt');
      
      expect(result.success).toBe(true);
      expect(result.data.size).toBe(2048);
      expect(result.data.sizeFormatted).toBe('2.0 KB');
      expect(result.data.extension).toBe('.txt');
      expect(result.data.name).toBe('file.txt');
      expect(result.data.mimeType).toBe('text/plain');
    });

    it('should handle file info errors', async () => {
      fs.access.mockRejectedValue(new Error('File not accessible'));
      
      const result = await fileStreamService.getFileInfo('/test/missing.txt');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('File not accessible');
    });
  });

  describe('validateFile', () => {
    it('should validate file successfully', async () => {
      const mockStats = {
        isFile: () => true,
        size: 1024
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      path.extname.mockReturnValue('.txt');
      
      const result = await fileStreamService.validateFile('/test/file.txt', {
        maxSize: 2048,
        allowedExtensions: ['.txt', '.md']
      });
      
      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(true);
      expect(result.data.errors).toEqual([]);
    });

    it('should detect validation errors', async () => {
      const mockStats = {
        isFile: () => true,
        size: 3072 // Exceeds max size
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      path.extname.mockReturnValue('.exe'); // Not allowed extension
      
      const result = await fileStreamService.validateFile('/test/file.exe', {
        maxSize: 2048,
        allowedExtensions: ['.txt', '.md']
      });
      
      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(false);
      expect(result.data.errors).toContain('File size (3.0 KB) exceeds maximum allowed size (2.0 KB)');
      expect(result.data.errors).toContain('File extension .exe is not allowed');
    });
  });

  describe('stream management', () => {
    it('should track active streams', async () => {
      const mockStats = {
        isFile: () => true,
        size: 1024,
        mtime: new Date()
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      
      const result = await fileStreamService.createReadStream('/test/file.txt');
      
      expect(result.success).toBe(true);
      
      const activeStreams = fileStreamService.getActiveStreams();
      expect(activeStreams.length).toBe(1);
      expect(activeStreams[0].id).toBe(result.streamId);
      expect(activeStreams[0].type).toBe('read');
    });

    it('should close streams', async () => {
      const mockStats = {
        isFile: () => true,
        size: 1024,
        mtime: new Date()
      };
      
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue(mockStats);
      
      const result = await fileStreamService.createReadStream('/test/file.txt');
      const closeResult = fileStreamService.closeStream(result.streamId);
      
      expect(closeResult.success).toBe(true);
      expect(mockReadStream.destroy).toHaveBeenCalled();
      
      const activeStreams = fileStreamService.getActiveStreams();
      expect(activeStreams.length).toBe(0);
    });

    it('should cleanup all streams', () => {
      // Add some mock streams
      fileStreamService.activeStreams.set('stream1', {
        stream: mockReadStream,
        type: 'read',
        filePath: '/test/file1.txt'
      });
      fileStreamService.activeStreams.set('stream2', {
        stream: mockWriteStream,
        type: 'write',
        filePath: '/test/file2.txt'
      });
      
      fileStreamService.cleanup();
      
      expect(mockReadStream.destroy).toHaveBeenCalled();
      expect(mockWriteStream.destroy).toHaveBeenCalled();
      expect(fileStreamService.activeStreams.size).toBe(0);
    });
  });

  describe('utility functions', () => {
    it('should format file sizes correctly', () => {
      expect(fileStreamService.formatFileSize(1024)).toBe('1.0 KB');
      expect(fileStreamService.formatFileSize(1048576)).toBe('1.0 MB');
      expect(fileStreamService.formatFileSize(1073741824)).toBe('1.0 GB');
      expect(fileStreamService.formatFileSize(500)).toBe('500 B');
    });

    it('should detect MIME types correctly', () => {
      expect(fileStreamService.getMimeType('.txt')).toBe('text/plain');
      expect(fileStreamService.getMimeType('.json')).toBe('application/json');
      expect(fileStreamService.getMimeType('.html')).toBe('text/html');
      expect(fileStreamService.getMimeType('.unknown')).toBe('application/octet-stream');
    });
  });
});