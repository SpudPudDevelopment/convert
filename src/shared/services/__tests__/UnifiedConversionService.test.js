/**
 * Tests for UnifiedConversionService
 */

// Mock dependencies
jest.mock('../FormatConversionService', () => ({
  FormatConversionService: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    convertFormat: jest.fn(),
    cancelConversion: jest.fn(),
    cancelAllConversions: jest.fn(),
    cleanup: jest.fn()
  }))
}));

jest.mock('../../types/ConversionSettings', () => ({
  createConversionSettings: jest.fn().mockReturnValue({})
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

const { UnifiedConversionService } = require('../UnifiedConversionService');
const { ConversionType } = require('../../types/jobEnums');

describe('UnifiedConversionService', () => {
  let service;

  beforeEach(() => {
    service = new UnifiedConversionService();
  });

  afterEach(() => {
    if (service && typeof service.cleanup === 'function') {
      service.cleanup();
    }
  });

  describe('detectFileType', () => {
    test('should detect document types correctly', () => {
      expect(service.detectFileType('document.pdf')).toBe(ConversionType.DOCUMENT);
      expect(service.detectFileType('file.docx')).toBe(ConversionType.DOCUMENT);
      expect(service.detectFileType('text.txt')).toBe(ConversionType.DOCUMENT);
    });

    test('should detect image types correctly', () => {
      expect(service.detectFileType('image.jpg')).toBe(ConversionType.IMAGE);
      expect(service.detectFileType('photo.png')).toBe(ConversionType.IMAGE);
      expect(service.detectFileType('icon.svg')).toBe(ConversionType.IMAGE);
    });

    test('should detect audio types correctly', () => {
      expect(service.detectFileType('music.mp3')).toBe(ConversionType.AUDIO);
      expect(service.detectFileType('sound.wav')).toBe(ConversionType.AUDIO);
      expect(service.detectFileType('audio.flac')).toBe(ConversionType.AUDIO);
    });

    test('should detect video types correctly', () => {
      expect(service.detectFileType('video.mp4')).toBe(ConversionType.VIDEO);
      expect(service.detectFileType('movie.mov')).toBe(ConversionType.VIDEO);
      expect(service.detectFileType('clip.avi')).toBe(ConversionType.VIDEO);
    });

    test('should return unknown for unsupported types', () => {
      expect(service.detectFileType('file.xyz')).toBe('unknown');
      expect(service.detectFileType('noextension')).toBe('unknown');
    });
  });

  describe('getSupportedFormats', () => {
    test('should return document formats', () => {
      const formats = service.getSupportedFormats(ConversionType.DOCUMENT);
      expect(formats).toContain('pdf');
      expect(formats).toContain('docx');
      expect(formats).toContain('txt');
    });

    test('should return image formats', () => {
      const formats = service.getSupportedFormats(ConversionType.IMAGE);
      expect(formats).toContain('jpg');
      expect(formats).toContain('png');
      expect(formats).toContain('webp');
    });

    test('should return audio formats', () => {
      const formats = service.getSupportedFormats(ConversionType.AUDIO);
      expect(formats).toContain('mp3');
      expect(formats).toContain('wav');
      expect(formats).toContain('flac');
    });

    test('should return video formats', () => {
      const formats = service.getSupportedFormats(ConversionType.VIDEO);
      expect(formats).toContain('mp4');
      expect(formats).toContain('mov');
      expect(formats).toContain('avi');
    });

    test('should return empty array for unknown type', () => {
      const formats = service.getSupportedFormats('unknown');
      expect(formats).toEqual([]);
    });
  });

  describe('generateOutputPath', () => {
    test('should generate correct output path', () => {
      const inputPath = '/path/to/file.jpg';
      const outputFormat = 'png';
      const expected = '/path/to/file.png';
      
      expect(service.generateOutputPath(inputPath, outputFormat)).toBe(expected);
    });

    test('should handle paths with multiple dots', () => {
      const inputPath = '/path/to/file.backup.jpg';
      const outputFormat = 'png';
      const expected = '/path/to/file.backup.png';
      
      expect(service.generateOutputPath(inputPath, outputFormat)).toBe(expected);
    });
  });

  describe('validateConversionOptions', () => {
    test('should throw error for empty jobs array', () => {
      const options = {
        jobs: [],
        outputConfig: { outputDirectory: '/output' }
      };
      
      expect(() => service.validateConversionOptions(options)).toThrow('No conversion jobs provided');
    });

    test('should throw error for missing input path', () => {
      const options = {
        jobs: [{ outputFormat: 'png', fileType: 'image' }],
        outputConfig: { outputDirectory: '/output' }
      };
      
      expect(() => service.validateConversionOptions(options)).toThrow('Job 0: Missing input path');
    });

    test('should throw error for missing output format', () => {
      const options = {
        jobs: [{ inputPath: '/input/file.jpg', fileType: 'image' }],
        outputConfig: { outputDirectory: '/output' }
      };
      
      expect(() => service.validateConversionOptions(options)).toThrow('Job 0: Missing output format');
    });

    test('should throw error for missing file type', () => {
      const options = {
        jobs: [{ inputPath: '/input/file.jpg', outputFormat: 'png' }],
        outputConfig: { outputDirectory: '/output' }
      };
      
      expect(() => service.validateConversionOptions(options)).toThrow('Job 0: Missing file type');
    });

    test('should throw error for missing output directory', () => {
      const options = {
        jobs: [{ inputPath: '/input/file.jpg', outputFormat: 'png', fileType: 'image' }],
        outputConfig: {}
      };
      
      expect(() => service.validateConversionOptions(options)).toThrow('Output directory not specified');
    });

    test('should not throw error for valid options', () => {
      const options = {
        jobs: [{ inputPath: '/input/file.jpg', outputFormat: 'png', fileType: 'image' }],
        outputConfig: { outputDirectory: '/output' }
      };
      
      expect(() => service.validateConversionOptions(options)).not.toThrow();
    });
  });

  describe('generateConversionId', () => {
    test('should generate unique IDs', () => {
      const id1 = service.generateConversionId();
      const id2 = service.generateConversionId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^conv_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^conv_\d+_[a-z0-9]+$/);
    });
  });

  describe('updateStats', () => {
    test('should update statistics correctly', () => {
      service.updateStats(5, 2, 1000);
      
      expect(service.stats.totalConversions).toBe(7);
      expect(service.stats.successfulConversions).toBe(5);
      expect(service.stats.failedConversions).toBe(2);
      expect(service.stats.totalProcessingTime).toBe(1000);
    });
  });

  describe('getStats', () => {
    test('should return correct statistics', () => {
      service.updateStats(10, 2, 5000);
      
      const stats = service.getStats();
      
      expect(stats.totalConversions).toBe(12);
      expect(stats.successfulConversions).toBe(10);
      expect(stats.failedConversions).toBe(2);
      expect(stats.totalProcessingTime).toBe(5000);
      expect(stats.averageProcessingTime).toBe(5000 / 12);
      expect(stats.successRate).toBe((10 / 12) * 100);
    });

    test('should handle zero conversions', () => {
      const stats = service.getStats();
      
      expect(stats.averageProcessingTime).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('event handling', () => {
    test('should emit conversion events', (done) => {
      const testData = { conversionId: 'test', inputPath: '/test' };
      
      service.on('conversion-started', (data) => {
        expect(data).toEqual(testData);
        done();
      });
      
      service.handleConversionStarted(testData);
    });
  });
});
