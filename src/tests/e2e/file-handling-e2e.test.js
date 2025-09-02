/**
 * End-to-End File Handling and Output Management Tests
 * Tests file validation, output directory management, and file operations
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { TEST_CONFIG, TestUtils } from '../testConfig';

// Import components
import FileConverter from '../../renderer/components/FileConverter';
import UnifiedConverter from '../../renderer/components/UnifiedConverter';

// Mock services
jest.mock('../../shared/services/UnifiedConversionService');
jest.mock('../../shared/services/JobQueue');
jest.mock('../../shared/services/QueueManager');

// Mock IPC
const mockElectronAPI = {
  invoke: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  send: jest.fn(),
  retryJob: jest.fn(),
  cancelJob: jest.fn(),
  pauseJob: jest.fn(),
  resumeJob: jest.fn(),
  selectDirectory: jest.fn(),
  validatePath: jest.fn(),
  getFileInfo: jest.fn()
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
});

// Test data
const testFiles = {
  valid: {
    small: TestUtils.createMockFile('small.pdf', 'application/pdf', 1024),
    medium: TestUtils.createMockFile('medium.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024 * 1024), // 1MB
    large: TestUtils.createMockFile('large.mp4', 'video/mp4', 1024 * 1024 * 50) // 50MB
  },
  invalid: {
    corrupted: new File(['corrupted content'], 'corrupted.pdf', { type: 'application/pdf' }),
    unsupported: TestUtils.createMockFile('unsupported.xyz', 'application/unknown', 1024),
    empty: new File([], 'empty.txt', { type: 'text/plain' })
  },
  mixed: [
    TestUtils.createMockFile('doc1.pdf', 'application/pdf', 1024),
    TestUtils.createMockFile('img1.jpg', 'image/jpeg', 2048),
    TestUtils.createMockFile('audio1.mp3', 'audio/mpeg', 3072),
    TestUtils.createMockFile('video1.mp4', 'video/mp4', 4096)
  ]
};

// Helper functions
const renderWithRouter = (component) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

const mockConversionSuccess = (outputPath) => {
  return {
    success: true,
    outputPath,
    processingTime: 2000,
    metadata: {
      fileSize: 1024,
      format: 'converted',
      quality: 'high'
    }
  };
};

const mockConversionError = (errorType, message) => {
  return {
    success: false,
    error: {
      type: errorType,
      message,
      severity: 'medium',
      retryable: true,
      userActionable: false,
      recoveryStrategies: ['retry', 'retry_with_different_settings']
    }
  };
};

describe('File Handling and Output Management E2E Tests', () => {
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
    
    // Reset electron API mocks
    Object.keys(mockElectronAPI).forEach(key => {
      if (typeof mockElectronAPI[key] === 'function') {
        mockElectronAPI[key].mockReset();
      }
    });
  });

  describe('File Validation Tests', () => {
    test('should validate supported file types', async () => {
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: true,
        fileType: 'document',
        supportedFormats: ['pdf', 'docx', 'txt']
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select valid file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.valid.small);

      // Verify file validation
      await waitFor(() => {
        expect(mockElectronAPI.getFileInfo).toHaveBeenCalledWith(testFiles.valid.small.path);
      });

      // Verify file is accepted
      await waitFor(() => {
        expect(screen.getByText('small.pdf')).toBeInTheDocument();
      });
    });

    test('should reject unsupported file types', async () => {
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: false,
        error: 'Unsupported file type',
        supportedFormats: ['pdf', 'docx', 'txt']
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select unsupported file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.invalid.unsupported);

      // Verify file rejection
      await waitFor(() => {
        expect(screen.getByText('Unsupported file type')).toBeInTheDocument();
        expect(screen.getByText('Supported formats: pdf, docx, txt')).toBeInTheDocument();
      });
    });

    test('should validate file size limits', async () => {
      const oversizedFile = TestUtils.createMockFile('oversized.pdf', 'application/pdf', 1024 * 1024 * 200); // 200MB
      
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: false,
        error: 'File size exceeds maximum limit of 100MB',
        fileSize: 1024 * 1024 * 200,
        maxSize: 1024 * 1024 * 100
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select oversized file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, oversizedFile);

      // Verify size validation error
      await waitFor(() => {
        expect(screen.getByText('File size exceeds maximum limit of 100MB')).toBeInTheDocument();
      });
    });

    test('should detect corrupted files', async () => {
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: false,
        error: 'File appears to be corrupted',
        fileType: 'document'
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select corrupted file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.invalid.corrupted);

      // Verify corruption detection
      await waitFor(() => {
        expect(screen.getByText('File appears to be corrupted')).toBeInTheDocument();
      });
    });

    test('should reject empty files', async () => {
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: false,
        error: 'File is empty',
        fileSize: 0
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select empty file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.invalid.empty);

      // Verify empty file rejection
      await waitFor(() => {
        expect(screen.getByText('File is empty')).toBeInTheDocument();
      });
    });
  });

  describe('Output Directory Management Tests', () => {
    test('should allow directory selection via dialog', async () => {
      mockElectronAPI.selectDirectory.mockResolvedValue('/selected/output/path');
      mockElectronAPI.validatePath.mockResolvedValue({
        isValid: true,
        isWritable: true,
        exists: true
      });

      renderWithRouter(<FileConverter category="document" />);

      // Click directory selection button
      const selectDirButton = screen.getByText('Select Output Directory');
      await user.click(selectDirButton);

      // Verify directory dialog was opened
      await waitFor(() => {
        expect(mockElectronAPI.selectDirectory).toHaveBeenCalled();
      });

      // Verify selected path is displayed
      await waitFor(() => {
        expect(screen.getByDisplayValue('/selected/output/path')).toBeInTheDocument();
      });
    });

    test('should validate output directory permissions', async () => {
      mockElectronAPI.validatePath.mockResolvedValue({
        isValid: false,
        isWritable: false,
        exists: true,
        error: 'Directory is not writable'
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.valid.small);

      // Enter invalid directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/readonly/directory');

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Try to convert
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify directory validation
      await waitFor(() => {
        expect(mockElectronAPI.validatePath).toHaveBeenCalledWith('/readonly/directory');
      });

      // Verify validation error
      await waitFor(() => {
        expect(screen.getByText('Directory is not writable')).toBeInTheDocument();
      });
    });

    test('should create output directory if it does not exist', async () => {
      mockElectronAPI.validatePath.mockResolvedValue({
        isValid: false,
        isWritable: true,
        exists: false,
        canCreate: true
      });

      mockElectronAPI.invoke.mockResolvedValue({
        success: true,
        directoryCreated: true,
        path: '/new/output/directory'
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.valid.small);

      // Enter non-existent directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/new/output/directory');

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Try to convert
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify directory creation request
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'create-directory',
          '/new/output/directory'
        );
      });
    });

    test('should handle disk space validation', async () => {
      const largeFile = testFiles.valid.large;
      
      mockElectronAPI.validatePath.mockResolvedValue({
        isValid: true,
        isWritable: true,
        exists: true,
        availableSpace: 1024 * 1024 * 10, // 10MB available
        requiredSpace: 1024 * 1024 * 100 // 100MB required
      });

      renderWithRouter(<FileConverter category="video" />);

      // Select large file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, largeFile);

      // Enter output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/output/directory');

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'mp4');

      // Try to convert
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify disk space validation
      await waitFor(() => {
        expect(screen.getByText('Insufficient disk space')).toBeInTheDocument();
        expect(screen.getByText('Required: 100MB, Available: 10MB')).toBeInTheDocument();
      });
    });
  });

  describe('File Operations Tests', () => {
    test('should handle file drag and drop', async () => {
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: true,
        fileType: 'document',
        supportedFormats: ['pdf', 'docx', 'txt']
      });

      renderWithRouter(<FileConverter category="document" />);

      // Find drop zone
      const dropZone = screen.getByTestId('drop-zone');

      // Simulate drag and drop
      await act(async () => {
        fireEvent.dragEnter(dropZone, {
          dataTransfer: {
            files: [testFiles.valid.small]
          }
        });
      });

      await act(async () => {
        fireEvent.drop(dropZone, {
          dataTransfer: {
            files: [testFiles.valid.small]
          }
        });
      });

      // Verify file was added
      await waitFor(() => {
        expect(screen.getByText('small.pdf')).toBeInTheDocument();
      });
    });

    test('should remove files from selection', async () => {
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: true,
        fileType: 'document',
        supportedFormats: ['pdf', 'docx', 'txt']
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select multiple files
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, [testFiles.valid.small, testFiles.valid.medium]);

      // Verify files are displayed
      await waitFor(() => {
        expect(screen.getByText('small.pdf')).toBeInTheDocument();
        expect(screen.getByText('medium.docx')).toBeInTheDocument();
      });

      // Remove first file
      const removeButton = screen.getAllByText('Remove')[0];
      await user.click(removeButton);

      // Verify file was removed
      await waitFor(() => {
        expect(screen.queryByText('small.pdf')).not.toBeInTheDocument();
        expect(screen.getByText('medium.docx')).toBeInTheDocument();
      });
    });

    test('should clear all files', async () => {
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: true,
        fileType: 'document',
        supportedFormats: ['pdf', 'docx', 'txt']
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select multiple files
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, [testFiles.valid.small, testFiles.valid.medium]);

      // Verify files are displayed
      await waitFor(() => {
        expect(screen.getByText('small.pdf')).toBeInTheDocument();
        expect(screen.getByText('medium.docx')).toBeInTheDocument();
      });

      // Clear all files
      const clearButton = screen.getByText('Clear All');
      await user.click(clearButton);

      // Verify all files were removed
      await waitFor(() => {
        expect(screen.queryByText('small.pdf')).not.toBeInTheDocument();
        expect(screen.queryByText('medium.docx')).not.toBeInTheDocument();
      });
    });

    test('should handle file preview', async () => {
      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: true,
        fileType: 'image',
        supportedFormats: ['jpg', 'png', 'webp'],
        preview: 'data:image/jpeg;base64,mock-preview-data'
      });

      renderWithRouter(<FileConverter category="image" />);

      // Select image file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.valid.small);

      // Click preview button
      const previewButton = screen.getByText('Preview');
      await user.click(previewButton);

      // Verify preview is displayed
      await waitFor(() => {
        expect(screen.getByAltText('File preview')).toBeInTheDocument();
      });
    });
  });

  describe('Output File Management Tests', () => {
    test('should generate unique output filenames', async () => {
      const mockResult = mockConversionSuccess('/output/test_1.pdf');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      mockElectronAPI.validatePath.mockResolvedValue({
        isValid: true,
        isWritable: true,
        exists: true
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.valid.small);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'pdf');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify unique filename generation
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                outputFilename: expect.stringMatching(/test_\d+\.pdf$/)
              })
            ])
          })
        );
      });
    });

    test('should handle output file conflicts', async () => {
      mockElectronAPI.validatePath.mockResolvedValue({
        isValid: true,
        isWritable: true,
        exists: true,
        hasConflicts: true,
        conflictingFiles: ['test.pdf', 'test_1.pdf']
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.valid.small);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'pdf');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/output');

      // Try to convert
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conflict warning
      await waitFor(() => {
        expect(screen.getByText('Output file conflicts detected')).toBeInTheDocument();
        expect(screen.getByText('The following files already exist:')).toBeInTheDocument();
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
        expect(screen.getByText('test_1.pdf')).toBeInTheDocument();
      });

      // Verify conflict resolution options
      expect(screen.getByText('Overwrite')).toBeInTheDocument();
      expect(screen.getByText('Rename')).toBeInTheDocument();
      expect(screen.getByText('Skip')).toBeInTheDocument();
    });

    test('should preserve file metadata in output', async () => {
      const mockResult = mockConversionSuccess('/output/test.docx');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      mockElectronAPI.validatePath.mockResolvedValue({
        isValid: true,
        isWritable: true,
        exists: true
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.valid.small);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Enable metadata preservation
      const preserveMetadataCheckbox = screen.getByTestId('preserve-metadata');
      await user.click(preserveMetadataCheckbox);

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify metadata preservation
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                settings: expect.objectContaining({
                  preserveMetadata: true,
                  preserveTimestamps: true,
                  preservePermissions: true
                })
              })
            ])
          })
        );
      });
    });

    test('should handle output file cleanup on failure', async () => {
      const mockError = mockConversionError('PROCESSING_FAILED', 'Conversion failed');
      mockElectronAPI.invoke.mockResolvedValue(mockError);

      mockElectronAPI.validatePath.mockResolvedValue({
        isValid: true,
        isWritable: true,
        exists: true
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.valid.small);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Wait for error
      await waitFor(() => {
        expect(screen.getByText('Processing Failed')).toBeInTheDocument();
      });

      // Verify cleanup was requested
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'cleanup-output-files',
          expect.arrayContaining(['/output/test.docx'])
        );
      });
    });
  });

  describe('Batch File Processing Tests', () => {
    test('should process files in correct order', async () => {
      const mockResult = {
        success: true,
        results: testFiles.mixed.map((_, index) => ({
          success: true,
          outputPath: `/output/file_${index}.converted`
        }))
      };
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: true,
        fileType: 'mixed',
        supportedFormats: ['pdf', 'jpg', 'mp3', 'mp4']
      });

      renderWithRouter(<UnifiedConverter />);

      // Select mixed files
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.mixed);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'pdf');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify files are processed in order
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({ sourceFile: 'doc1.pdf', priority: 1 }),
              expect.objectContaining({ sourceFile: 'img1.jpg', priority: 2 }),
              expect.objectContaining({ sourceFile: 'audio1.mp3', priority: 3 }),
              expect.objectContaining({ sourceFile: 'video1.mp4', priority: 4 })
            ])
          })
        );
      });
    });

    test('should handle batch processing with mixed file types', async () => {
      const mixedBatch = [
        testFiles.valid.small, // document
        testFiles.valid.medium, // document
        testFiles.invalid.corrupted, // invalid
        testFiles.valid.large // video
      ];

      const mockResult = {
        success: true,
        results: [
          { success: true, outputPath: '/output/small.docx' },
          { success: true, outputPath: '/output/medium.docx' },
          { success: false, error: 'File corrupted' },
          { success: true, outputPath: '/output/large.mp4' }
        ]
      };
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      mockElectronAPI.getFileInfo
        .mockResolvedValueOnce({ isValid: true, fileType: 'document' })
        .mockResolvedValueOnce({ isValid: true, fileType: 'document' })
        .mockResolvedValueOnce({ isValid: false, error: 'File corrupted' })
        .mockResolvedValueOnce({ isValid: true, fileType: 'video' });

      renderWithRouter(<UnifiedConverter />);

      // Select mixed batch
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, mixedBatch);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'pdf');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify mixed batch processing
      await waitFor(() => {
        expect(screen.getByText('3 files converted successfully')).toBeInTheDocument();
        expect(screen.getByText('1 file failed')).toBeInTheDocument();
      });
    });

    test('should handle batch processing with progress tracking', async () => {
      const batch = testFiles.mixed;

      // Mock progress updates
      let progressCallback;
      mockElectronAPI.invoke.mockImplementation((channel, options) => {
        if (channel === 'convert-file') {
          progressCallback = options.progressCallback;
          return Promise.resolve({
            success: true,
            results: batch.map(() => ({ success: true, outputPath: '/output/converted' }))
          });
        }
        return Promise.resolve({ success: true });
      });

      mockElectronAPI.getFileInfo.mockResolvedValue({
        isValid: true,
        fileType: 'mixed'
      });

      renderWithRouter(<UnifiedConverter />);

      // Select batch files
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, batch);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'pdf');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Simulate progress updates for each file
      await act(async () => {
        if (progressCallback) {
          progressCallback(25); // 1/4 files
          progressCallback(50); // 2/4 files
          progressCallback(75); // 3/4 files
          progressCallback(100); // 4/4 files
        }
      });

      // Verify progress display
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.getByText('4 of 4 files processed')).toBeInTheDocument();
      });
    });
  });
});
