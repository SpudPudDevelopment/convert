const {
  FormatConversionService,
  FormatConversionResult,
  FormatConversionEvents,
  SUPPORTED_FORMATS,
  DEFAULT_QUALITY_SETTINGS,
  TRANSPARENCY_OPTIONS,
  BACKGROUND_COLORS,
  CONVERSION_PRESETS,
  getFormatConversionService
} = require('../services/FormatConversionService');

const {
  jpgToPng,
  pngToJpg,
  jpgToWebp,
  webpToJpg,
  pngToWebp,
  webpToPng,
  convertToFormat,
  convertBufferToFormat,
  batchConvertToFormat,
  getOptimalFormat,
  compareFormats,
  estimateConversionTime
} = require('../utils/FormatConversionWrapper');

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Test setup
let testDir;
let testImages = {};

/**
 * Helper function to create test images
 */
async function createTestImages() {
  const imageSize = { width: 200, height: 150 };
  
  // Create JPG test image
  testImages.jpg = await sharp({
    create: {
      width: imageSize.width,
      height: imageSize.height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
  .jpeg({ quality: 80 })
  .toBuffer();
  
  // Create PNG test image with transparency
  testImages.png = await sharp({
    create: {
      width: imageSize.width,
      height: imageSize.height,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 0.8 }
    }
  })
  .png()
  .toBuffer();
  
  // Create WEBP test image
  testImages.webp = await sharp({
    create: {
      width: imageSize.width,
      height: imageSize.height,
      channels: 3,
      background: { r: 0, g: 0, b: 255 }
    }
  })
  .webp({ quality: 80 })
  .toBuffer();
}

/**
 * Helper function to write test image to file
 */
async function writeTestImage(format, filename = null) {
  if (!filename) {
    filename = `test.${format === 'jpg' ? 'jpg' : format}`;
  }
  const filePath = path.join(testDir, filename);
  await fs.writeFile(filePath, testImages[format]);
  return filePath;
}

/**
 * Setup test environment
 */
beforeAll(async () => {
  testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'format-conversion-test-'));
  await createTestImages();
});

/**
 * Cleanup test environment
 */
afterAll(async () => {
  try {
    await fs.rmdir(testDir, { recursive: true });
  } catch (error) {
    console.warn('Failed to cleanup test directory:', error.message);
  }
});

/**
 * Clear service state between tests
 */
beforeEach(() => {
  const service = getFormatConversionService();
  service.clearCache();
  service.resetStats();
  service.removeAllListeners();
});

describe('FormatConversionResult', () => {
  test('should create result with default values', () => {
    const result = new FormatConversionResult();
    
    expect(result.success).toBe(false);
    expect(result.outputPath).toBeNull();
    expect(result.originalSize).toBe(0);
    expect(result.convertedSize).toBe(0);
    expect(result.compressionRatio).toBe(0);
    expect(result.timestamp).toBeDefined();
  });
  
  test('should calculate compression efficiency', () => {
    const result = new FormatConversionResult({
      originalSize: 1000,
      convertedSize: 800
    });
    
    expect(result.getCompressionEfficiency()).toBe(20);
  });
  
  test('should check if conversion is optimized', () => {
    const optimized = new FormatConversionResult({
      originalSize: 1000,
      convertedSize: 800
    });
    
    const notOptimized = new FormatConversionResult({
      originalSize: 800,
      convertedSize: 1000
    });
    
    expect(optimized.isOptimized()).toBe(true);
    expect(notOptimized.isOptimized()).toBe(false);
  });
  
  test('should format size information', () => {
    const result = new FormatConversionResult({
      originalSize: 1024,
      convertedSize: 512
    });
    
    const sizeInfo = result.getSizeInfo();
    
    expect(sizeInfo.original).toBe('1 KB');
    expect(sizeInfo.converted).toBe('512 Bytes');
    expect(sizeInfo.saved).toBe('512 Bytes');
  });
});

describe('FormatConversionService', () => {
  let service;
  
  beforeEach(() => {
    service = new FormatConversionService();
  });
  
  describe('Basic Functionality', () => {
    test('should convert JPG to PNG', async () => {
      const inputPath = await writeTestImage('jpg');
      const outputPath = path.join(testDir, 'output.png');
      
      const result = await service.convertFormat(inputPath, outputPath, 'png');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('png');
      expect(result.outputPath).toBe(outputPath);
      
      // Verify output file exists
      const outputExists = await fs.access(outputPath).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });
    
    test('should convert PNG to JPG', async () => {
      const inputPath = await writeTestImage('png');
      const outputPath = path.join(testDir, 'output.jpg');
      
      const result = await service.convertFormat(inputPath, outputPath, 'jpeg');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('jpeg');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should convert JPG to WEBP', async () => {
      const inputPath = await writeTestImage('jpg');
      const outputPath = path.join(testDir, 'output.webp');
      
      const result = await service.convertFormat(inputPath, outputPath, 'webp');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('webp');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should convert WEBP to JPG', async () => {
      const inputPath = await writeTestImage('webp');
      const outputPath = path.join(testDir, 'output.jpg');
      
      const result = await service.convertFormat(inputPath, outputPath, 'jpeg');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('jpeg');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should convert PNG to WEBP', async () => {
      const inputPath = await writeTestImage('png');
      const outputPath = path.join(testDir, 'output.webp');
      
      const result = await service.convertFormat(inputPath, outputPath, 'webp');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('webp');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should convert WEBP to PNG', async () => {
      const inputPath = await writeTestImage('webp');
      const outputPath = path.join(testDir, 'output.png');
      
      const result = await service.convertFormat(inputPath, outputPath, 'png');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('png');
      expect(result.outputPath).toBe(outputPath);
    });
  });
  
  describe('Buffer Conversion', () => {
    test('should convert buffer to different format', async () => {
      const result = await service.convertBuffer(testImages.jpg, 'png');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('png');
      expect(result.outputBuffer).toBeInstanceOf(Buffer);
      expect(result.outputBuffer.length).toBeGreaterThan(0);
    });
    
    test('should handle buffer conversion errors', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      
      await expect(service.convertBuffer(invalidBuffer, 'png'))
        .rejects.toThrow();
    });
  });
  
  describe('Batch Conversion', () => {
    test('should batch convert multiple images', async () => {
      const inputPaths = [
        await writeTestImage('jpg', 'test1.jpg'),
        await writeTestImage('png', 'test2.png'),
        await writeTestImage('webp', 'test3.webp')
      ];
      
      const conversions = inputPaths.map((inputPath, index) => ({
        inputPath,
        outputPath: path.join(testDir, `batch_output_${index}.png`),
        targetFormat: 'png'
      }));
      
      const results = await service.batchConvert(conversions);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });
    
    test('should handle batch conversion with errors', async () => {
      const conversions = [
        {
          inputPath: await writeTestImage('jpg'),
          outputPath: path.join(testDir, 'batch_good.png'),
          targetFormat: 'png'
        },
        {
          inputPath: '/nonexistent/file.jpg',
          outputPath: path.join(testDir, 'batch_bad.png'),
          targetFormat: 'png'
        }
      ];
      
      const results = await service.batchConvert(conversions, { continueOnError: true });
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  describe('Specific Conversion Methods', () => {
    test('should convert PNG to JPG with transparency handling', async () => {
      const inputPath = await writeTestImage('png');
      const outputPath = path.join(testDir, 'output_specific.jpg');
      
      const result = await service.convertPngToJpg(inputPath, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('jpeg');
      expect(result.outputPath).toBe(outputPath);
      
      // Verify output file exists
      const outputExists = await fs.access(outputPath).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
    });
    
    test('should convert JPG to PNG with quality preservation', async () => {
      const inputPath = await writeTestImage('jpg');
      const outputPath = path.join(testDir, 'output_specific.png');
      
      const result = await service.convertJpgToPng(inputPath, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('png');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should convert to WebP format', async () => {
      const inputPath = await writeTestImage('jpg');
      const outputPath = path.join(testDir, 'output_specific.webp');
      
      const result = await service.convertToWebp(inputPath, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('webp');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should convert from WebP format', async () => {
      const inputPath = await writeTestImage('webp');
      const outputPath = path.join(testDir, 'output_specific.png');
      
      const result = await service.convertFromWebp(inputPath, outputPath, 'png');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('png');
      expect(result.outputPath).toBe(outputPath);
    });
  });

  describe('Preset Conversions', () => {
    test('should convert with WEB_OPTIMIZED preset', async () => {
      const inputPath = await writeTestImage('png');
      const outputPath = path.join(testDir, 'output_web.jpg');
      
      const result = await service.convertWithPreset(inputPath, outputPath, 'jpeg', 'WEB_OPTIMIZED');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('jpeg');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should convert with HIGH_QUALITY preset', async () => {
      const inputPath = await writeTestImage('png');
      const outputPath = path.join(testDir, 'output_hq.jpg');
      
      const result = await service.convertWithPreset(inputPath, outputPath, 'jpeg', 'HIGH_QUALITY');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('jpeg');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should convert with SMALL_SIZE preset', async () => {
      const inputPath = await writeTestImage('png');
      const outputPath = path.join(testDir, 'output_small.jpg');
      
      const result = await service.convertWithPreset(inputPath, outputPath, 'jpeg', 'SMALL_SIZE');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('jpeg');
      expect(result.outputPath).toBe(outputPath);
    });
    
    test('should handle invalid preset', async () => {
      const inputPath = await writeTestImage('png');
      const outputPath = path.join(testDir, 'output_invalid.jpg');
      
      await expect(service.convertWithPreset(inputPath, outputPath, 'jpeg', 'INVALID_PRESET'))
        .rejects.toThrow('Preset \'INVALID_PRESET\' not available');
    });
  });

  describe('Utility Methods', () => {
    test('should get presets for format', () => {
      const jpegPresets = service.getPresetsForFormat('jpeg');
      
      expect(jpegPresets).toHaveProperty('WEB_OPTIMIZED');
      expect(jpegPresets).toHaveProperty('HIGH_QUALITY');
      expect(jpegPresets).toHaveProperty('SMALL_SIZE');
      
      const pngPresets = service.getPresetsForFormat('png');
      expect(pngPresets).toHaveProperty('WEB_OPTIMIZED');
      expect(pngPresets).toHaveProperty('HIGH_QUALITY');
      
      const webpPresets = service.getPresetsForFormat('webp');
      expect(webpPresets).toHaveProperty('WEB_OPTIMIZED');
      expect(webpPresets).toHaveProperty('HIGH_QUALITY');
    });
    
    test('should get transparency options', () => {
      const options = service.getTransparencyOptions();
      
      expect(options).toHaveProperty('PRESERVE');
      expect(options).toHaveProperty('REMOVE_WHITE');
      expect(options).toHaveProperty('REMOVE_BLACK');
      expect(options).toHaveProperty('REMOVE_CUSTOM');
    });
    
    test('should get background colors', () => {
      const colors = service.getBackgroundColors();
      
      expect(colors).toHaveProperty('WHITE');
      expect(colors).toHaveProperty('BLACK');
      expect(colors).toHaveProperty('TRANSPARENT');
      expect(colors).toHaveProperty('GRAY');
    });
  });

  describe('Constants Validation', () => {
    test('should have correct supported formats', () => {
      expect(SUPPORTED_FORMATS.JPG).toBe('jpeg');
      expect(SUPPORTED_FORMATS.JPEG).toBe('jpeg');
      expect(SUPPORTED_FORMATS.PNG).toBe('png');
      expect(SUPPORTED_FORMATS.WEBP).toBe('webp');
    });
    
    test('should have quality settings for all formats', () => {
      expect(DEFAULT_QUALITY_SETTINGS).toHaveProperty('jpeg');
      expect(DEFAULT_QUALITY_SETTINGS).toHaveProperty('png');
      expect(DEFAULT_QUALITY_SETTINGS).toHaveProperty('webp');
      
      expect(DEFAULT_QUALITY_SETTINGS.jpeg).toHaveProperty('quality');
      expect(DEFAULT_QUALITY_SETTINGS.png).toHaveProperty('compressionLevel');
      expect(DEFAULT_QUALITY_SETTINGS.webp).toHaveProperty('quality');
    });
    
    test('should have transparency options defined', () => {
      expect(TRANSPARENCY_OPTIONS).toHaveProperty('PRESERVE');
      expect(TRANSPARENCY_OPTIONS).toHaveProperty('REMOVE_WHITE');
      expect(TRANSPARENCY_OPTIONS).toHaveProperty('REMOVE_BLACK');
      expect(TRANSPARENCY_OPTIONS).toHaveProperty('REMOVE_CUSTOM');
    });
    
    test('should have background colors defined', () => {
      expect(BACKGROUND_COLORS).toHaveProperty('WHITE');
      expect(BACKGROUND_COLORS).toHaveProperty('BLACK');
      expect(BACKGROUND_COLORS).toHaveProperty('TRANSPARENT');
      expect(BACKGROUND_COLORS).toHaveProperty('GRAY');
    });
    
    test('should have conversion presets defined', () => {
      expect(CONVERSION_PRESETS).toHaveProperty('WEB_OPTIMIZED');
      expect(CONVERSION_PRESETS).toHaveProperty('HIGH_QUALITY');
      expect(CONVERSION_PRESETS).toHaveProperty('SMALL_SIZE');
      expect(CONVERSION_PRESETS).toHaveProperty('LOSSLESS');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid input file', async () => {
      await expect(service.convertFormat('/nonexistent/file.jpg', '/tmp/output.png', 'png'))
        .rejects.toThrow();
    });
    
    test('should handle unsupported format', async () => {
      const inputPath = await writeTestImage('jpg');
      
      await expect(service.convertFormat(inputPath, '/tmp/output.bmp', 'bmp'))
        .rejects.toThrow();
    });
  });
  
  describe('Caching', () => {
    test('should cache conversion results', async () => {
      const inputPath = await writeTestImage('jpg');
      const outputPath = path.join(testDir, 'cached.png');
      
      // First conversion
      const result1 = await service.convertFormat(inputPath, outputPath, 'png');
      
      // Second conversion (should use cache)
      const result2 = await service.convertFormat(inputPath, outputPath, 'png');
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(service.getCacheInfo().size).toBeGreaterThan(0);
    });
    
    test('should skip cache when requested', async () => {
      const inputPath = await writeTestImage('jpg');
      const outputPath = path.join(testDir, 'no_cache.png');
      
      const result = await service.convertFormat(inputPath, outputPath, 'png', { skipCache: true });
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('Events', () => {
    test('should emit conversion events', async () => {
      const inputPath = await writeTestImage('jpg');
      const outputPath = path.join(testDir, 'events.png');
      
      const events = [];
      service.on(FormatConversionEvents.CONVERSION_STARTED, (data) => {
        events.push({ type: 'started', data });
      });
      service.on(FormatConversionEvents.CONVERSION_COMPLETED, (data) => {
        events.push({ type: 'completed', data });
      });
      
      await service.convertFormat(inputPath, outputPath, 'png');
      
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('started');
      expect(events[1].type).toBe('completed');
    });
  });
  
  describe('Statistics', () => {
    test('should track conversion statistics', async () => {
      const inputPath = await writeTestImage('jpg');
      const outputPath = path.join(testDir, 'stats.png');
      
      await service.convertFormat(inputPath, outputPath, 'png');
      
      const stats = service.getConversionStats();
      
      expect(stats.totalConversions).toBe(1);
      expect(stats.successfulConversions).toBe(1);
      expect(stats.failedConversions).toBe(0);
      expect(stats.successRate).toBe(100);
    });
  });
  
  describe('Utility Methods', () => {
    test('should return supported conversions', () => {
      const conversions = service.getSupportedConversions();
      
      expect(conversions).toBeInstanceOf(Array);
      expect(conversions.length).toBeGreaterThan(0);
      expect(conversions.every(c => c.supported)).toBe(true);
    });
    
    test('should clear cache', () => {
      service.conversionCache.set('test', 'value');
      expect(service.getCacheInfo().size).toBe(1);
      
      service.clearCache();
      expect(service.getCacheInfo().size).toBe(0);
    });
  });
});

describe('FormatConversionWrapper', () => {
  describe('Direct Conversion Functions', () => {
    test('jpgToPng should convert JPG to PNG', async () => {
      const inputPath = await writeTestImage('jpg');
      const result = await jpgToPng(inputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('png');
    });
    
    test('pngToJpg should convert PNG to JPG', async () => {
      const inputPath = await writeTestImage('png');
      const result = await pngToJpg(inputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('jpeg');
    });
    
    test('jpgToWebp should convert JPG to WEBP', async () => {
      const inputPath = await writeTestImage('jpg');
      const result = await jpgToWebp(inputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('webp');
    });
    
    test('webpToJpg should convert WEBP to JPG', async () => {
      const inputPath = await writeTestImage('webp');
      const result = await webpToJpg(inputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('jpeg');
    });
    
    test('pngToWebp should convert PNG to WEBP', async () => {
      const inputPath = await writeTestImage('png');
      const result = await pngToWebp(inputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('webp');
    });
    
    test('webpToPng should convert WEBP to PNG', async () => {
      const inputPath = await writeTestImage('webp');
      const result = await webpToPng(inputPath);
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('png');
    });
  });
  
  describe('Generic Conversion Functions', () => {
    test('convertToFormat should handle any supported format', async () => {
      const inputPath = await writeTestImage('jpg');
      const result = await convertToFormat(inputPath, 'webp');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('webp');
    });
    
    test('convertBufferToFormat should convert buffer', async () => {
      const result = await convertBufferToFormat(testImages.jpg, 'png');
      
      expect(result.success).toBe(true);
      expect(result.targetFormat).toBe('png');
      expect(result.outputBuffer).toBeInstanceOf(Buffer);
    });
  });
  
  describe('Batch Operations', () => {
    test('batchConvertToFormat should convert multiple files', async () => {
      const inputPaths = [
        await writeTestImage('jpg', 'batch1.jpg'),
        await writeTestImage('png', 'batch2.png')
      ];
      
      const results = await batchConvertToFormat(inputPaths, 'webp', testDir);
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
  
  describe('Analysis Functions', () => {
    test('getOptimalFormat should recommend format', async () => {
      const inputPath = await writeTestImage('jpg');
      const recommendation = await getOptimalFormat(inputPath, { prioritizeSize: true });
      
      expect(recommendation.format).toBeDefined();
      expect(recommendation.reason).toBeDefined();
      expect(recommendation.metadata).toBeDefined();
      expect(recommendation.analysis).toBeDefined();
    });
    
    test('compareFormats should compare file sizes', async () => {
      const inputPath = await writeTestImage('jpg');
      const comparison = await compareFormats(inputPath, ['jpeg', 'png', 'webp']);
      
      expect(comparison.results).toHaveLength(3);
      expect(comparison.smallest).toBeDefined();
      expect(comparison.largest).toBeDefined();
      expect(comparison.recommendations).toBeDefined();
    });
    
    test('estimateConversionTime should provide time estimate', () => {
      const estimate = estimateConversionTime(1024 * 1024, 'jpeg', 'png'); // 1MB
      
      expect(estimate.estimatedTimeMs).toBeGreaterThan(0);
      expect(estimate.estimatedTimeSeconds).toBeGreaterThan(0);
      expect(estimate.confidence).toBeDefined();
    });
  });
});

describe('Global Service Instance', () => {
  test('should return same instance', () => {
    const service1 = getFormatConversionService();
    const service2 = getFormatConversionService();
    
    expect(service1).toBe(service2);
  });
  
  test('should maintain state across calls', async () => {
    const service = getFormatConversionService();
    const inputPath = await writeTestImage('jpg');
    const outputPath = path.join(testDir, 'global.png');
    
    await service.convertFormat(inputPath, outputPath, 'png');
    
    const stats = service.getConversionStats();
    expect(stats.totalConversions).toBeGreaterThan(0);
  });
});

describe('Integration Workflow', () => {
  test('should handle complete conversion workflow', async () => {
    const service = getFormatConversionService();
    
    // Create test images
    const jpgPath = await writeTestImage('jpg', 'workflow.jpg');
    const pngPath = await writeTestImage('png', 'workflow.png');
    
    // Test all conversion paths
    const conversions = [
      { input: jpgPath, target: 'png', output: path.join(testDir, 'jpg_to_png.png') },
      { input: pngPath, target: 'jpeg', output: path.join(testDir, 'png_to_jpg.jpg') },
      { input: jpgPath, target: 'webp', output: path.join(testDir, 'jpg_to_webp.webp') }
    ];
    
    const results = [];
    for (const conv of conversions) {
      const result = await service.convertFormat(conv.input, conv.output, conv.target);
      results.push(result);
    }
    
    // Verify all conversions succeeded
    expect(results.every(r => r.success)).toBe(true);
    
    // Check statistics
    const stats = service.getConversionStats();
    expect(stats.totalConversions).toBe(conversions.length);
    expect(stats.successfulConversions).toBe(conversions.length);
    expect(stats.successRate).toBe(100);
    
    // Verify output files exist
    for (const conv of conversions) {
      const exists = await fs.access(conv.output).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }
  });
});