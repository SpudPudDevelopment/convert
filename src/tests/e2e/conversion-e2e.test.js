/**
 * End-to-End Conversion Tests
 * Tests all conversion types through the UI with real file handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { TEST_CONFIG, TestUtils } from '../testConfig';

// Import components
import FileConverter from '../../renderer/components/FileConverter';
import UnifiedConverter from '../../renderer/components/UnifiedConverter';
import ErrorHandler from '../../renderer/components/ErrorHandler';

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
  resumeJob: jest.fn()
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
});

// Test data
const testFiles = {
  document: {
    pdf: TestUtils.createMockFile('test.pdf', 'application/pdf', 1024),
    docx: TestUtils.createMockFile('test.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 2048),
    txt: TestUtils.createMockFile('test.txt', 'text/plain', 512)
  },
  image: {
    jpg: TestUtils.createMockFile('test.jpg', 'image/jpeg', 1024),
    png: TestUtils.createMockFile('test.png', 'image/png', 1536),
    webp: TestUtils.createMockFile('test.webp', 'image/webp', 768)
  },
  audio: {
    mp3: TestUtils.createMockFile('test.mp3', 'audio/mpeg', 2048),
    wav: TestUtils.createMockFile('test.wav', 'audio/wav', 3072),
    flac: TestUtils.createMockFile('test.flac', 'audio/flac', 4096)
  },
  video: {
    mp4: TestUtils.createMockFile('test.mp4', 'video/mp4', 5120),
    mov: TestUtils.createMockFile('test.mov', 'video/quicktime', 6144),
    avi: TestUtils.createMockFile('test.avi', 'video/x-msvideo', 4096)
  }
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

describe('End-to-End Conversion Tests', () => {
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
    
    // Reset electron API mocks
    mockElectronAPI.invoke.mockReset();
    mockElectronAPI.retryJob.mockReset();
    mockElectronAPI.cancelJob.mockReset();
    mockElectronAPI.pauseJob.mockReset();
    mockElectronAPI.resumeJob.mockReset();
  });

  describe('Document Conversion Tests', () => {
    test('should convert PDF to DOCX successfully', async () => {
      const mockResult = mockConversionSuccess('/output/test.docx');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="document" />);

      // Select PDF file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.document.pdf);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conversion started
      await waitFor(() => {
        expect(screen.getByText('Converting...')).toBeInTheDocument();
      });

      // Verify success
      await waitFor(() => {
        expect(screen.getByText('Conversion completed successfully')).toBeInTheDocument();
      });
    });

    test('should handle PDF to DOCX conversion error', async () => {
      const mockResult = mockConversionError('DOCUMENT_ENCRYPTED', 'Document is encrypted');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="document" />);

      // Select PDF file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.document.pdf);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify error handling
      await waitFor(() => {
        expect(screen.getByText('Document Encrypted')).toBeInTheDocument();
        expect(screen.getByText('The document is encrypted and requires a password.')).toBeInTheDocument();
      });

      // Verify retry options
      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Manual Intervention')).toBeInTheDocument();
    });

    test('should convert DOCX to PDF with custom settings', async () => {
      const mockResult = mockConversionSuccess('/output/test.pdf');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="document" />);

      // Select DOCX file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.document.docx);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'pdf');

      // Configure custom settings
      const dpiInput = screen.getByTestId('dpi-setting');
      await user.clear(dpiInput);
      await user.type(dpiInput, '300');

      const qualitySelect = screen.getByTestId('quality-setting');
      await user.selectOptions(qualitySelect, 'high');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conversion with custom settings
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                settings: expect.objectContaining({
                  dpi: '300',
                  quality: 'high'
                })
              })
            ])
          })
        );
      });
    });
  });

  describe('Image Conversion Tests', () => {
    test('should convert JPG to PNG successfully', async () => {
      const mockResult = mockConversionSuccess('/output/test.png');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="image" />);

      // Select JPG file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.image.jpg);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'png');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conversion started
      await waitFor(() => {
        expect(screen.getByText('Converting...')).toBeInTheDocument();
      });

      // Verify success
      await waitFor(() => {
        expect(screen.getByText('Conversion completed successfully')).toBeInTheDocument();
      });
    });

    test('should handle image corruption error', async () => {
      const mockResult = mockConversionError('IMAGE_CORRUPTED', 'Image file is corrupted');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="image" />);

      // Select corrupted image file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.image.jpg);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'png');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify error handling
      await waitFor(() => {
        expect(screen.getByText('Image Corrupted')).toBeInTheDocument();
        expect(screen.getByText('The image file is corrupted and cannot be processed.')).toBeInTheDocument();
      });

      // Verify skip file option
      expect(screen.getByText('Skip File')).toBeInTheDocument();
    });

    test('should convert PNG to WebP with quality settings', async () => {
      const mockResult = mockConversionSuccess('/output/test.webp');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="image" />);

      // Select PNG file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.image.png);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'webp');

      // Configure quality settings
      const qualityInput = screen.getByTestId('quality-setting');
      await user.clear(qualityInput);
      await user.type(qualityInput, '85');

      const compressionSelect = screen.getByTestId('compression-setting');
      await user.selectOptions(compressionSelect, 'high');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conversion with quality settings
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                settings: expect.objectContaining({
                  quality: '85',
                  compression: 'high'
                })
              })
            ])
          })
        );
      });
    });
  });

  describe('Audio Conversion Tests', () => {
    test('should convert MP3 to WAV successfully', async () => {
      const mockResult = mockConversionSuccess('/output/test.wav');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="audio" />);

      // Select MP3 file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.audio.mp3);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'wav');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conversion started
      await waitFor(() => {
        expect(screen.getByText('Converting...')).toBeInTheDocument();
      });

      // Verify success
      await waitFor(() => {
        expect(screen.getByText('Conversion completed successfully')).toBeInTheDocument();
      });
    });

    test('should handle audio codec error', async () => {
      const mockResult = mockConversionError('AUDIO_CODEC_ERROR', 'Unsupported audio codec');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="audio" />);

      // Select audio file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.audio.mp3);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'wav');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify error handling
      await waitFor(() => {
        expect(screen.getByText('Audio Codec Error')).toBeInTheDocument();
        expect(screen.getByText('An error occurred with the audio codec during conversion.')).toBeInTheDocument();
      });

      // Verify retry options
      expect(screen.getByText('Retry with Different Settings')).toBeInTheDocument();
      expect(screen.getByText('Try Different Format')).toBeInTheDocument();
    });

    test('should convert WAV to FLAC with audio settings', async () => {
      const mockResult = mockConversionSuccess('/output/test.flac');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="audio" />);

      // Select WAV file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.audio.wav);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'flac');

      // Configure audio settings
      const bitrateSelect = screen.getByTestId('bitrate-setting');
      await user.selectOptions(bitrateSelect, '320');

      const sampleRateSelect = screen.getByTestId('sample-rate-setting');
      await user.selectOptions(sampleRateSelect, '48000');

      const channelsSelect = screen.getByTestId('channels-setting');
      await user.selectOptions(channelsSelect, 'stereo');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conversion with audio settings
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                settings: expect.objectContaining({
                  bitrate: '320',
                  sampleRate: '48000',
                  channels: 'stereo'
                })
              })
            ])
          })
        );
      });
    });
  });

  describe('Video Conversion Tests', () => {
    test('should convert MP4 to MOV successfully', async () => {
      const mockResult = mockConversionSuccess('/output/test.mov');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="video" />);

      // Select MP4 file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.video.mp4);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'mov');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conversion started
      await waitFor(() => {
        expect(screen.getByText('Converting...')).toBeInTheDocument();
      });

      // Verify success
      await waitFor(() => {
        expect(screen.getByText('Conversion completed successfully')).toBeInTheDocument();
      });
    });

    test('should handle video codec error', async () => {
      const mockResult = mockConversionError('VIDEO_CODEC_ERROR', 'Unsupported video codec');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="video" />);

      // Select video file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.video.mp4);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'mov');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify error handling
      await waitFor(() => {
        expect(screen.getByText('Video Codec Error')).toBeInTheDocument();
        expect(screen.getByText('An error occurred with the video codec during conversion.')).toBeInTheDocument();
      });

      // Verify retry options
      expect(screen.getByText('Retry with Different Settings')).toBeInTheDocument();
      expect(screen.getByText('Try Different Format')).toBeInTheDocument();
    });

    test('should convert MOV to AVI with video settings', async () => {
      const mockResult = mockConversionSuccess('/output/test.avi');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="video" />);

      // Select MOV file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.video.mov);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'avi');

      // Configure video settings
      const videoQualitySelect = screen.getByTestId('video-quality-setting');
      await user.selectOptions(videoQualitySelect, 'high');

      const frameRateSelect = screen.getByTestId('frame-rate-setting');
      await user.selectOptions(frameRateSelect, '30');

      const videoCodecSelect = screen.getByTestId('video-codec-setting');
      await user.selectOptions(videoCodecSelect, 'h264');

      const audioCodecSelect = screen.getByTestId('audio-codec-setting');
      await user.selectOptions(audioCodecSelect, 'aac');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify conversion with video settings
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                settings: expect.objectContaining({
                  videoQuality: 'high',
                  frameRate: '30',
                  videoCodec: 'h264',
                  audioCodec: 'aac'
                })
              })
            ])
          })
        );
      });
    });
  });

  describe('Unified Converter Tests', () => {
    test('should detect and convert mixed file types', async () => {
      const mockResult = mockConversionSuccess('/output/mixed-conversion');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<UnifiedConverter />);

      // Select mixed files
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, [
        testFiles.document.pdf,
        testFiles.image.jpg,
        testFiles.audio.mp3,
        testFiles.video.mp4
      ]);

      // Verify mixed category detection
      await waitFor(() => {
        expect(screen.getByText('Mixed File Types')).toBeInTheDocument();
      });

      // Select output format for each category
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx'); // Default for mixed

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify batch conversion
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({ fileType: 'document' }),
              expect.objectContaining({ fileType: 'image' }),
              expect.objectContaining({ fileType: 'audio' }),
              expect.objectContaining({ fileType: 'video' })
            ])
          })
        );
      });
    });

    test('should handle batch conversion with partial failures', async () => {
      const mockResult = {
        success: true,
        results: [
          { success: true, outputPath: '/output/test1.docx' },
          { success: false, error: 'File corrupted' },
          { success: true, outputPath: '/output/test3.png' },
          { success: false, error: 'Unsupported format' }
        ]
      };
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<UnifiedConverter />);

      // Select multiple files
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, [
        testFiles.document.docx,
        testFiles.document.pdf,
        testFiles.image.png,
        testFiles.audio.mp3
      ]);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'pdf');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify partial success handling
      await waitFor(() => {
        expect(screen.getByText('2 files converted successfully')).toBeInTheDocument();
        expect(screen.getByText('2 files failed')).toBeInTheDocument();
      });
    });
  });

  describe('Batch Processing Tests', () => {
    test('should process large batch of files', async () => {
      const largeBatch = Array.from({ length: 50 }, (_, i) => 
        TestUtils.createMockFile(`file${i}.pdf`, 'application/pdf', 1024)
      );
      
      const mockResult = {
        success: true,
        results: largeBatch.map(() => ({ success: true, outputPath: '/output/converted' }))
      };
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="document" />);

      // Select large batch
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, largeBatch);

      // Verify batch size display
      await waitFor(() => {
        expect(screen.getByText('Selected Files (50):')).toBeInTheDocument();
      });

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify batch processing
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining(
              largeBatch.map(file => expect.objectContaining({
                sourceFile: file.name
              }))
            )
          })
        );
      });
    });

    test('should handle batch processing with progress updates', async () => {
      const batch = [
        testFiles.document.pdf,
        testFiles.image.jpg,
        testFiles.audio.mp3
      ];

      // Mock progress updates
      let progressCallback;
      mockElectronAPI.invoke.mockImplementation((channel, options) => {
        if (channel === 'convert-file') {
          progressCallback = options.progressCallback;
          return Promise.resolve(mockConversionSuccess('/output/batch'));
        }
        return Promise.resolve({ success: true });
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
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Simulate progress updates
      await act(async () => {
        if (progressCallback) {
          progressCallback(33); // 33% progress
          progressCallback(66); // 66% progress
          progressCallback(100); // 100% progress
        }
      });

      // Verify progress display
      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
    });
  });

  describe('Error Recovery Tests', () => {
    test('should retry failed conversion', async () => {
      // First attempt fails
      const mockError = mockConversionError('PROCESSING_TIMEOUT', 'Conversion timed out');
      mockElectronAPI.invoke.mockResolvedValueOnce(mockError);

      // Retry succeeds
      const mockSuccess = mockConversionSuccess('/output/retry-success.pdf');
      mockElectronAPI.invoke.mockResolvedValueOnce(mockSuccess);

      // Mock retry job
      mockElectronAPI.retryJob.mockResolvedValue({
        success: true,
        queuePosition: 1,
        estimatedWaitTime: 5000
      });

      renderWithRouter(<FileConverter category="document" />);

      // Select file and start conversion
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.document.pdf);

      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Wait for error
      await waitFor(() => {
        expect(screen.getByText('Processing Timeout')).toBeInTheDocument();
      });

      // Click retry
      const retryButton = screen.getByText('Retry');
      await user.click(retryButton);

      // Verify retry was called
      await waitFor(() => {
        expect(mockElectronAPI.retryJob).toHaveBeenCalled();
      });

      // Verify success after retry
      await waitFor(() => {
        expect(screen.getByText('Conversion completed successfully')).toBeInTheDocument();
      });
    });

    test('should handle manual intervention requests', async () => {
      const mockError = mockConversionError('DOCUMENT_PASSWORD_REQUIRED', 'Password required');
      mockElectronAPI.invoke.mockResolvedValue(mockError);

      renderWithRouter(<FileConverter category="document" />);

      // Select file and start conversion
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.document.pdf);

      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Wait for error
      await waitFor(() => {
        expect(screen.getByText('Password Required')).toBeInTheDocument();
      });

      // Click manual intervention
      const manualButton = screen.getByText('Manual Intervention');
      await user.click(manualButton);

      // Verify manual intervention dialog
      await waitFor(() => {
        expect(screen.getByText('Manual Intervention Required')).toBeInTheDocument();
        expect(screen.getByText('Please provide the password for the encrypted document.')).toBeInTheDocument();
      });
    });
  });

  describe('File Handling and Output Management Tests', () => {
    test('should validate output directory', async () => {
      renderWithRouter(<FileConverter category="document" />);

      // Select file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.document.pdf);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Try to convert without output directory
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify validation error
      await waitFor(() => {
        expect(screen.getByText('Please select an output directory')).toBeInTheDocument();
      });

      // Enter invalid directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/invalid/path');

      // Mock directory validation failure
      mockElectronAPI.invoke.mockResolvedValue({
        success: false,
        error: 'Output directory does not exist or is not writable'
      });

      await user.click(convertButton);

      // Verify directory validation error
      await waitFor(() => {
        expect(screen.getByText('Output directory does not exist or is not writable')).toBeInTheDocument();
      });
    });

    test('should handle file size limits', async () => {
      const largeFile = TestUtils.createMockFile('large.pdf', 'application/pdf', 1024 * 1024 * 100); // 100MB
      
      const mockError = mockConversionError('FILE_TOO_LARGE', 'File size exceeds limit');
      mockElectronAPI.invoke.mockResolvedValue(mockError);

      renderWithRouter(<FileConverter category="document" />);

      // Select large file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, largeFile);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify file size error
      await waitFor(() => {
        expect(screen.getByText('File Too Large')).toBeInTheDocument();
        expect(screen.getByText('The file is too large to process with current settings.')).toBeInTheDocument();
      });

      // Verify recovery options
      expect(screen.getByText('Split File')).toBeInTheDocument();
      expect(screen.getByText('Reduce Quality')).toBeInTheDocument();
    });

    test('should preserve file metadata', async () => {
      const mockResult = mockConversionSuccess('/output/test.docx');
      mockElectronAPI.invoke.mockResolvedValue(mockResult);

      renderWithRouter(<FileConverter category="document" />);

      // Select file
      const fileInput = screen.getByTestId('file-input');
      await user.upload(fileInput, testFiles.document.pdf);

      // Select output format
      const formatSelect = screen.getByDisplayValue('Select output format');
      await user.selectOptions(formatSelect, 'docx');

      // Enable metadata preservation
      const preserveMetadataCheckbox = screen.getByTestId('preserve-metadata');
      await user.click(preserveMetadataCheckbox);

      // Configure output directory
      const outputDirInput = screen.getByTestId('output-directory');
      await user.type(outputDirInput, '/test/output');

      // Start conversion
      const convertButton = screen.getByText('Convert Files');
      await user.click(convertButton);

      // Verify metadata preservation setting
      await waitFor(() => {
        expect(mockElectronAPI.invoke).toHaveBeenCalledWith(
          'convert-file',
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                settings: expect.objectContaining({
                  preserveMetadata: true
                })
              })
            ])
          })
        );
      });
    });
  });
});
