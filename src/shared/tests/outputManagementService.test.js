const { OutputManagementService } = require('../services/outputManagementService');
const fs = require('fs/promises');
const path = require('path');
const { dialog } = require('electron');
const { createLogger } = require('../utils/logger');

// Mock dependencies
jest.mock('fs/promises');
jest.mock('path');
jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: jest.fn()
  }
}));
jest.mock('../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

describe('OutputManagementService', () => {
  let service;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    createLogger.mockReturnValue(mockLogger);
    service = new OutputManagementService();
  });

  describe('selectOutputDirectory', () => {
    it('should select output directory successfully', async () => {
      const mockPath = '/selected/output/directory';
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [mockPath]
      });

      const result = await service.selectOutputDirectory();

      expect(result).toEqual({
        success: true,
        path: mockPath
      });
      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Output Directory'
      });
    });

    it('should handle canceled selection', async () => {
      dialog.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const result = await service.selectOutputDirectory();

      expect(result).toEqual({
        success: false,
        error: 'Selection canceled'
      });
    });

    it('should handle selection errors', async () => {
      const error = new Error('Dialog error');
      dialog.showOpenDialog.mockRejectedValue(error);

      const result = await service.selectOutputDirectory();

      expect(result).toEqual({
        success: false,
        error: 'Dialog error'
      });
    });
  });

  describe('validateOutputDirectory', () => {
    it('should validate existing writable directory', async () => {
      const dirPath = '/valid/directory';
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue({ isDirectory: () => true });

      const result = await service.validateOutputDirectory(dirPath);

      expect(result).toEqual({
        valid: true,
        path: dirPath,
        exists: true,
        writable: true
      });
    });

    it('should handle non-existent directory', async () => {
      const dirPath = '/non/existent/directory';
      fs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await service.validateOutputDirectory(dirPath);

      expect(result).toEqual({
        valid: false,
        path: dirPath,
        exists: false,
        writable: false,
        error: 'Directory does not exist'
      });
    });

    it('should handle file instead of directory', async () => {
      const filePath = '/path/to/file.txt';
      fs.access.mockResolvedValue();
      fs.stat.mockResolvedValue({ isDirectory: () => false });

      const result = await service.validateOutputDirectory(filePath);

      expect(result).toEqual({
        valid: false,
        path: filePath,
        exists: true,
        writable: false,
        error: 'Path is not a directory'
      });
    });

    it('should handle invalid path', async () => {
      const result = await service.validateOutputDirectory('');

      expect(result).toEqual({
        valid: false,
        path: '',
        exists: false,
        writable: false,
        error: 'Invalid directory path'
      });
    });
  });

  describe('generateOutputPath', () => {
    beforeEach(() => {
      path.parse.mockImplementation((filePath) => {
        if (filePath === '/input/document.pdf') {
          return {
            dir: '/input',
            name: 'document',
            ext: '.pdf',
            base: 'document.pdf'
          };
        }
        return { dir: '', name: '', ext: '', base: '' };
      });
      path.join.mockImplementation((...args) => args.join('/'));
    });

    it('should generate path with default pattern', async () => {
      const result = await service.generateOutputPath(
        '/input/document.pdf',
        '/output',
        '{name}.{ext}',
        { ext: 'docx' }
      );

      expect(result).toEqual({
        success: true,
        path: '/output/document.docx'
      });
    });

    it('should generate path with custom variables', async () => {
      const result = await service.generateOutputPath(
        '/input/document.pdf',
        '/output',
        '{name}_{timestamp}.{ext}',
        { ext: 'docx', timestamp: '20231201' }
      );

      expect(result).toEqual({
        success: true,
        path: '/output/document_20231201.docx'
      });
    });

    it('should handle missing variables', async () => {
      const result = await service.generateOutputPath(
        '/input/document.pdf',
        '/output',
        '{name}_{missing}.{ext}',
        { ext: 'docx' }
      );

      expect(result).toEqual({
        success: true,
        path: '/output/document_{missing}.docx'
      });
    });

    it('should handle invalid input path', async () => {
      const result = await service.generateOutputPath(
        '',
        '/output',
        '{name}.{ext}',
        { ext: 'docx' }
      );

      expect(result).toEqual({
        success: false,
        error: 'Invalid input path'
      });
    });
  });

  describe('previewOutputPaths', () => {
    beforeEach(() => {
      path.parse.mockImplementation((filePath) => {
        const files = {
          '/input/doc1.pdf': { dir: '/input', name: 'doc1', ext: '.pdf', base: 'doc1.pdf' },
          '/input/doc2.pdf': { dir: '/input', name: 'doc2', ext: '.pdf', base: 'doc2.pdf' }
        };
        return files[filePath] || { dir: '', name: '', ext: '', base: '' };
      });
      path.join.mockImplementation((...args) => args.join('/'));
    });

    it('should preview multiple output paths', async () => {
      const result = await service.previewOutputPaths(
        ['/input/doc1.pdf', '/input/doc2.pdf'],
        '/output',
        '{name}.{ext}',
        { ext: 'docx' }
      );

      expect(result).toEqual({
        success: true,
        previews: [
          {
            input: '/input/doc1.pdf',
            output: '/output/doc1.docx',
            success: true
          },
          {
            input: '/input/doc2.pdf',
            output: '/output/doc2.docx',
            success: true
          }
        ]
      });
    });

    it('should handle empty input array', async () => {
      const result = await service.previewOutputPaths(
        [],
        '/output',
        '{name}.{ext}',
        { ext: 'docx' }
      );

      expect(result).toEqual({
        success: false,
        error: 'No input paths provided'
      });
    });
  });

  describe('resolveConflict', () => {
    it('should auto-rename conflicting file', async () => {
      const outputPath = '/output/document.docx';
      fs.access.mockResolvedValue(); // File exists
      path.parse.mockReturnValue({
        dir: '/output',
        name: 'document',
        ext: '.docx'
      });
      path.join.mockImplementation((...args) => args.join('/'));

      const result = await service.resolveConflict(outputPath, 'auto-rename');

      expect(result).toEqual({
        success: true,
        action: 'auto-rename',
        originalPath: outputPath,
        resolvedPath: expect.stringMatching(/\/output\/document_\d+\.docx/)
      });
    });

    it('should overwrite existing file', async () => {
      const outputPath = '/output/document.docx';
      fs.access.mockResolvedValue(); // File exists

      const result = await service.resolveConflict(outputPath, 'overwrite');

      expect(result).toEqual({
        success: true,
        action: 'overwrite',
        originalPath: outputPath,
        resolvedPath: outputPath
      });
    });

    it('should skip existing file', async () => {
      const outputPath = '/output/document.docx';
      fs.access.mockResolvedValue(); // File exists

      const result = await service.resolveConflict(outputPath, 'skip');

      expect(result).toEqual({
        success: true,
        action: 'skip',
        originalPath: outputPath,
        resolvedPath: null
      });
    });

    it('should handle non-existent file', async () => {
      const outputPath = '/output/document.docx';
      fs.access.mockRejectedValue(new Error('ENOENT')); // File doesn't exist

      const result = await service.resolveConflict(outputPath, 'auto-rename');

      expect(result).toEqual({
        success: true,
        action: 'none',
        originalPath: outputPath,
        resolvedPath: outputPath
      });
    });
  });

  describe('ensureDirectoryExists', () => {
    it('should create directory if it does not exist', async () => {
      const dirPath = '/new/directory';
      fs.access.mockRejectedValue(new Error('ENOENT'));
      fs.mkdir.mockResolvedValue();

      await service.ensureDirectoryExists(dirPath);

      expect(fs.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should not create directory if it exists', async () => {
      const dirPath = '/existing/directory';
      fs.access.mockResolvedValue();

      await service.ensureDirectoryExists(dirPath);

      expect(fs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('processOutput', () => {
    beforeEach(() => {
      path.parse.mockReturnValue({
        dir: '/input',
        name: 'document',
        ext: '.pdf',
        base: 'document.pdf'
      });
      path.join.mockImplementation((...args) => args.join('/'));
      path.dirname.mockReturnValue('/output');
      fs.access.mockRejectedValue(new Error('ENOENT')); // File doesn't exist
      fs.mkdir.mockResolvedValue();
    });

    it('should process single output successfully', async () => {
      const result = await service.processOutput(
        '/input/document.pdf',
        '/output',
        '{name}.{ext}',
        { ext: 'docx' },
        'auto-rename'
      );

      expect(result).toEqual({
        success: true,
        inputPath: '/input/document.pdf',
        outputPath: '/output/document.docx',
        conflict: {
          success: true,
          action: 'none',
          originalPath: '/output/document.docx',
          resolvedPath: '/output/document.docx'
        }
      });
    });

    it('should handle path generation error', async () => {
      const result = await service.processOutput(
        '', // Invalid input
        '/output',
        '{name}.{ext}',
        { ext: 'docx' },
        'auto-rename'
      );

      expect(result).toEqual({
        success: false,
        inputPath: '',
        error: 'Invalid input path'
      });
    });
  });

  describe('processBatchOutput', () => {
    beforeEach(() => {
      path.parse.mockImplementation((filePath) => {
        const files = {
          '/input/doc1.pdf': { dir: '/input', name: 'doc1', ext: '.pdf', base: 'doc1.pdf' },
          '/input/doc2.pdf': { dir: '/input', name: 'doc2', ext: '.pdf', base: 'doc2.pdf' }
        };
        return files[filePath] || { dir: '', name: '', ext: '', base: '' };
      });
      path.join.mockImplementation((...args) => args.join('/'));
      path.dirname.mockReturnValue('/output');
      fs.access.mockRejectedValue(new Error('ENOENT'));
      fs.mkdir.mockResolvedValue();
    });

    it('should process batch output successfully', async () => {
      const result = await service.processBatchOutput(
        ['/input/doc1.pdf', '/input/doc2.pdf'],
        '/output',
        '{name}.{ext}',
        { ext: 'docx' },
        'auto-rename'
      );

      expect(result).toEqual({
        success: true,
        results: [
          {
            success: true,
            inputPath: '/input/doc1.pdf',
            outputPath: '/output/doc1.docx',
            conflict: expect.any(Object)
          },
          {
            success: true,
            inputPath: '/input/doc2.pdf',
            outputPath: '/output/doc2.docx',
            conflict: expect.any(Object)
          }
        ],
        summary: {
          total: 2,
          successful: 2,
          failed: 0
        }
      });
    });

    it('should handle empty input array', async () => {
      const result = await service.processBatchOutput(
        [],
        '/output',
        '{name}.{ext}',
        { ext: 'docx' },
        'auto-rename'
      );

      expect(result).toEqual({
        success: false,
        error: 'No input paths provided'
      });
    });
  });

  describe('getNamingPatterns', () => {
    it('should return available naming patterns', () => {
      const patterns = service.getNamingPatterns();

      expect(patterns).toEqual([
        {
          name: 'Original Name',
          pattern: '{name}.{ext}',
          description: 'Keep original filename with new extension'
        },
        {
          name: 'With Timestamp',
          pattern: '{name}_{timestamp}.{ext}',
          description: 'Add timestamp to filename'
        },
        {
          name: 'With Date',
          pattern: '{name}_{date}.{ext}',
          description: 'Add date to filename'
        },
        {
          name: 'With Counter',
          pattern: '{name}_{counter}.{ext}',
          description: 'Add counter to filename'
        },
        {
          name: 'Custom',
          pattern: '{custom}',
          description: 'Custom naming pattern'
        }
      ]);
    });
  });

  describe('getConflictStrategies', () => {
    it('should return available conflict strategies', () => {
      const strategies = service.getConflictStrategies();

      expect(strategies).toEqual([
        {
          value: 'auto-rename',
          label: 'Auto Rename',
          description: 'Automatically rename file if conflict exists'
        },
        {
          value: 'overwrite',
          label: 'Overwrite',
          description: 'Overwrite existing file'
        },
        {
          value: 'skip',
          label: 'Skip',
          description: 'Skip file if conflict exists'
        },
        {
          value: 'prompt',
          label: 'Prompt User',
          description: 'Ask user what to do for each conflict'
        }
      ]);
    });
  });

  describe('getStats', () => {
    it('should return service statistics', () => {
      const stats = service.getStats();

      expect(stats).toEqual({
        totalProcessed: 0,
        successfulProcessed: 0,
        conflictsResolved: 0,
        directoriesCreated: 0,
        lastActivity: null
      });
    });
  });
});