const { MetadataService } = require('../services/metadataService');
const fs = require('fs/promises');
const path = require('path');
const logger = require('../utils/logger');

// Mock dependencies
jest.mock('fs/promises');
jest.mock('path');
jest.mock('../utils/logger');

describe('MetadataService', () => {
  let metadataService;
  let mockStats;

  beforeEach(() => {
    metadataService = new MetadataService();
    mockStats = {
      isFile: jest.fn().mockReturnValue(true),
      isDirectory: jest.fn().mockReturnValue(false),
      size: 1024,
      mtime: new Date('2023-01-01T10:00:00Z'),
      atime: new Date('2023-01-01T09:00:00Z'),
      ctime: new Date('2023-01-01T08:00:00Z'),
      birthtime: new Date('2023-01-01T07:00:00Z'),
      mode: 0o644,
      uid: 1000,
      gid: 1000
    };

    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mocks
    fs.stat.mockResolvedValue(mockStats);
    fs.access.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
    fs.readFile.mockResolvedValue(JSON.stringify({ test: 'data' }));
    fs.utimes.mockResolvedValue();
    fs.chmod.mockResolvedValue();
    fs.chown.mockResolvedValue();
    path.extname.mockReturnValue('.txt');
    path.basename.mockReturnValue('test.txt');
    path.dirname.mockReturnValue('/test/dir');
    path.join.mockImplementation((...args) => args.join('/'));
    logger.info.mockImplementation(() => {});
    logger.error.mockImplementation(() => {});
    logger.warn.mockImplementation(() => {});
  });

  describe('extractMetadata', () => {
    it('should extract basic file metadata', async () => {
      const filePath = '/test/file.txt';
      const result = await metadataService.extractMetadata(filePath);

      expect(fs.stat).toHaveBeenCalledWith(filePath);
      expect(result).toEqual({
        common: {
          size: 1024,
          mtime: mockStats.mtime,
          atime: mockStats.atime,
          ctime: mockStats.ctime,
          birthtime: mockStats.birthtime,
          mode: 0o644,
          uid: 1000,
          gid: 1000,
          isFile: true,
          isDirectory: false
        },
        specific: {
          extension: '.txt',
          basename: 'test.txt',
          dirname: '/test/dir'
        },
        extractedAt: expect.any(Date)
      });
    });

    it('should include custom metadata when provided', async () => {
      const filePath = '/test/file.txt';
      const options = {
        includeCustom: true,
        customFields: ['author', 'title']
      };

      const result = await metadataService.extractMetadata(filePath, options);

      expect(result.specific).toHaveProperty('customFields');
      expect(result.specific.customFields).toEqual(['author', 'title']);
    });

    it('should handle file access errors', async () => {
      const filePath = '/nonexistent/file.txt';
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.stat.mockRejectedValue(error);

      await expect(metadataService.extractMetadata(filePath))
        .rejects.toThrow('Failed to extract metadata');
      
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to extract metadata from /nonexistent/file.txt:',
        error
      );
    });

    it('should update statistics on successful extraction', async () => {
      const filePath = '/test/file.txt';
      await metadataService.extractMetadata(filePath);

      const stats = metadataService.getStatistics();
      expect(stats.operationsCount.extract).toBe(1);
      expect(stats.operationsCount.total).toBe(1);
    });
  });

  describe('preserveMetadata', () => {
    it('should preserve file metadata with retry logic', async () => {
      const metadata = {
        common: {
          mtime: new Date('2023-01-01T10:00:00Z'),
          atime: new Date('2023-01-01T09:00:00Z'),
          mode: 0o644,
          uid: 1000,
          gid: 1000
        }
      };
      const targetPath = '/test/target.txt';

      const result = await metadataService.preserveMetadata(metadata, targetPath);

      expect(fs.utimes).toHaveBeenCalledWith(
        targetPath,
        metadata.common.atime,
        metadata.common.mtime
      );
      expect(fs.chmod).toHaveBeenCalledWith(targetPath, metadata.common.mode);
      expect(result.success).toBe(true);
      expect(result.preservedFields).toEqual(['timestamps', 'permissions', 'ownership']);
    });

    it('should retry on transient failures', async () => {
      const metadata = {
        common: {
          mtime: new Date('2023-01-01T10:00:00Z'),
          atime: new Date('2023-01-01T09:00:00Z'),
          mode: 0o644
        }
      };
      const targetPath = '/test/target.txt';
      
      // First call fails, second succeeds
      fs.utimes
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce();

      const result = await metadataService.preserveMetadata(metadata, targetPath, {
        maxRetries: 2,
        retryDelay: 10
      });

      expect(fs.utimes).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(1);
    });

    it('should handle permission errors gracefully', async () => {
      const metadata = {
        common: {
          mtime: new Date('2023-01-01T10:00:00Z'),
          atime: new Date('2023-01-01T09:00:00Z'),
          mode: 0o644,
          uid: 1000,
          gid: 1000
        }
      };
      const targetPath = '/test/target.txt';
      
      const permissionError = new Error('Permission denied');
      permissionError.code = 'EPERM';
      fs.chown.mockRejectedValue(permissionError);

      const result = await metadataService.preserveMetadata(metadata, targetPath);

      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Failed to preserve ownership: Permission denied');
      expect(result.preservedFields).not.toContain('ownership');
    });
  });

  describe('createMetadataBackup', () => {
    it('should create a metadata backup file', async () => {
      const metadata = { test: 'data' };
      const backupPath = '/test/backup.json';

      const result = await metadataService.createMetadataBackup(metadata, backupPath);

      expect(fs.writeFile).toHaveBeenCalledWith(
        backupPath,
        JSON.stringify({
          metadata,
          backupCreatedAt: expect.any(Date),
          version: '1.0'
        }, null, 2),
        'utf8'
      );
      expect(result.success).toBe(true);
      expect(result.backupPath).toBe(backupPath);
    });

    it('should handle backup creation errors', async () => {
      const metadata = { test: 'data' };
      const backupPath = '/invalid/backup.json';
      const error = new Error('Cannot create backup');
      fs.writeFile.mockRejectedValue(error);

      await expect(metadataService.createMetadataBackup(metadata, backupPath))
        .rejects.toThrow('Failed to create metadata backup');
    });
  });

  describe('restoreMetadataBackup', () => {
    it('should restore metadata from backup file', async () => {
      const backupData = {
        metadata: { test: 'data' },
        backupCreatedAt: new Date(),
        version: '1.0'
      };
      fs.readFile.mockResolvedValue(JSON.stringify(backupData));

      const result = await metadataService.restoreMetadataBackup('/test/backup.json');

      expect(fs.readFile).toHaveBeenCalledWith('/test/backup.json', 'utf8');
      expect(result.metadata).toEqual(backupData.metadata);
      expect(result.backupCreatedAt).toEqual(backupData.backupCreatedAt);
    });

    it('should handle invalid backup files', async () => {
      fs.readFile.mockResolvedValue('invalid json');

      await expect(metadataService.restoreMetadataBackup('/test/backup.json'))
        .rejects.toThrow('Failed to restore metadata backup');
    });
  });

  describe('compareMetadata', () => {
    it('should compare metadata and identify differences', () => {
      const metadata1 = {
        common: {
          size: 1024,
          mtime: new Date('2023-01-01T10:00:00Z')
        },
        specific: {
          extension: '.txt'
        }
      };

      const metadata2 = {
        common: {
          size: 2048,
          mtime: new Date('2023-01-02T10:00:00Z')
        },
        specific: {
          extension: '.txt'
        }
      };

      const result = metadataService.compareMetadata(metadata1, metadata2);

      expect(result.identical).toBe(false);
      expect(result.differences).toHaveLength(2);
      expect(result.differences).toContainEqual({
        field: 'common.size',
        value1: 1024,
        value2: 2048
      });
      expect(result.differences).toContainEqual({
        field: 'common.mtime',
        value1: metadata1.common.mtime,
        value2: metadata2.common.mtime
      });
    });

    it('should identify identical metadata', () => {
      const metadata1 = {
        common: { size: 1024 },
        specific: { extension: '.txt' }
      };

      const metadata2 = {
        common: { size: 1024 },
        specific: { extension: '.txt' }
      };

      const result = metadataService.compareMetadata(metadata1, metadata2);

      expect(result.identical).toBe(true);
      expect(result.differences).toHaveLength(0);
    });
  });

  describe('getSupportedMetadataTypes', () => {
    it('should return supported metadata types', () => {
      const result = metadataService.getSupportedMetadataTypes();

      expect(result).toEqual({
        common: [
          'size', 'mtime', 'atime', 'ctime', 'birthtime',
          'mode', 'uid', 'gid', 'isFile', 'isDirectory'
        ],
        specific: [
          'extension', 'basename', 'dirname', 'customFields'
        ]
      });
    });
  });

  describe('getStatistics', () => {
    it('should return service statistics', async () => {
      // Perform some operations to generate statistics
      await metadataService.extractMetadata('/test/file1.txt');
      await metadataService.preserveMetadata({}, '/test/file2.txt');
      await metadataService.createMetadataBackup({}, '/test/backup.json');

      const stats = metadataService.getStatistics();

      expect(stats).toEqual({
        operationsCount: {
          extract: 1,
          preserve: 1,
          backup: 1,
          restore: 0,
          compare: 0,
          total: 3
        },
        errorCount: 0,
        averageOperationTime: expect.any(Number),
        lastOperationTime: expect.any(Date)
      });
    });

    it('should track errors in statistics', async () => {
      fs.stat.mockRejectedValue(new Error('Test error'));

      try {
        await metadataService.extractMetadata('/test/file.txt');
      } catch (error) {
        // Expected to fail
      }

      const stats = metadataService.getStatistics();
      expect(stats.errorCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      const error = new Error('File system error');
      error.code = 'EIO';
      fs.stat.mockRejectedValue(error);

      await expect(metadataService.extractMetadata('/test/file.txt'))
        .rejects.toThrow('Failed to extract metadata');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to extract metadata from /test/file.txt:',
        error
      );
    });

    it('should validate input parameters', async () => {
      await expect(metadataService.extractMetadata(''))
        .rejects.toThrow('File path is required');

      await expect(metadataService.preserveMetadata(null, '/test/file.txt'))
        .rejects.toThrow('Metadata is required');

      await expect(metadataService.preserveMetadata({}, ''))
        .rejects.toThrow('Target path is required');
    });
  });

  describe('performance', () => {
    it('should track operation timing', async () => {
      const startTime = Date.now();
      await metadataService.extractMetadata('/test/file.txt');
      const endTime = Date.now();

      const stats = metadataService.getStatistics();
      expect(stats.averageOperationTime).toBeGreaterThan(0);
      expect(stats.averageOperationTime).toBeLessThan(endTime - startTime + 100); // Allow some margin
    });
  });
});