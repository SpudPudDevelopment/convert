const { SharpService, SharpResult, SharpEvents, getSharpService } = require('../services/SharpService');
const {
  convertToJpeg,
  convertToPng,
  convertToWebp,
  getImageMetadata,
  resizeImage,
  cropImage,
  rotateImage,
  convertToGrayscale,
  createThumbnail,
  optimizeForWeb,
  batchProcess,
  getSharpStats,
  clearSharpCache
} = require('../utils/SharpWrapper');
const sharp = require('sharp');

// Test image data - 1x1 pixel images in different formats
const TEST_IMAGES = {
  // 1x1 red pixel JPEG
  jpeg: Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
    0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
    0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x80, 0xFF, 0xD9
  ]),
  
  // 1x1 red pixel PNG
  png: Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x5C, 0xCD, 0xFF, 0x8D, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ])
};

// Create a larger test image for more complex operations
const createTestImage = async (width = 100, height = 100, format = 'png') => {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })[format]().toBuffer();
};

describe('SharpResult', () => {
  test('should create success result', () => {
    const data = { test: 'data' };
    const metadata = { info: 'test' };
    const result = SharpResult.success(data, metadata);
    
    expect(result.success).toBe(true);
    expect(result.data).toBe(data);
    expect(result.error).toBeNull();
    expect(result.metadata).toBe(metadata);
    expect(result.timestamp).toBeDefined();
  });
  
  test('should create error result', () => {
    const error = new Error('Test error');
    const metadata = { info: 'test' };
    const result = SharpResult.error(error, metadata);
    
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBe(error);
    expect(result.metadata).toBe(metadata);
    expect(result.timestamp).toBeDefined();
  });
});

describe('SharpService', () => {
  let sharpService;
  
  beforeEach(() => {
    sharpService = new SharpService();
  });
  
  afterEach(() => {
    sharpService.cleanup();
  });
  
  describe('Initialization', () => {
    test('should initialize successfully', () => {
      expect(sharpService.isReady()).toBe(true);
    });
    
    test('should have default configuration', () => {
      expect(sharpService.config).toBeDefined();
      expect(sharpService.config.concurrency).toBe(4);
      expect(sharpService.config.quality.jpeg).toBe(80);
    });
    
    test('should emit initialization event', (done) => {
      const newService = new SharpService();
      newService.events.on(SharpEvents.EVENTS.OPERATION_START, (data) => {
        expect(data.type).toBe('initialization');
        newService.cleanup();
        done();
      });
    });
  });
  
  describe('Sharp Instance Creation', () => {
    test('should create instance from buffer', async () => {
      const result = await sharpService.createSharpInstance(TEST_IMAGES.png);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
    
    test('should handle invalid input', async () => {
      const result = await sharpService.createSharpInstance(null);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('Metadata Extraction', () => {
    test('should extract PNG metadata', async () => {
      const result = await sharpService.getMetadata(TEST_IMAGES.png);
      expect(result.success).toBe(true);
      expect(result.data.format).toBe('png');
      expect(result.data.width).toBe(1);
      expect(result.data.height).toBe(1);
    });
    
    test('should extract JPEG metadata', async () => {
      const result = await sharpService.getMetadata(TEST_IMAGES.jpeg);
      expect(result.success).toBe(true);
      expect(result.data.format).toBe('jpeg');
    });
    
    test('should handle metadata extraction error', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      const result = await sharpService.getMetadata(invalidBuffer);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('Format Conversion', () => {
    test('should convert PNG to JPEG', async () => {
      const result = await sharpService.convertFormat(TEST_IMAGES.png, 'jpeg');
      expect(result.success).toBe(true);
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.metadata.format).toBe('jpeg');
    });
    
    test('should convert PNG to WebP', async () => {
      const result = await sharpService.convertFormat(TEST_IMAGES.png, 'webp');
      expect(result.success).toBe(true);
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.metadata.format).toBe('webp');
    });
    
    test('should handle unsupported format', async () => {
      const result = await sharpService.convertFormat(TEST_IMAGES.png, 'invalid');
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Unsupported format');
    });
    
    test('should apply custom quality settings', async () => {
      const result = await sharpService.convertFormat(TEST_IMAGES.png, 'jpeg', { quality: 50 });
      expect(result.success).toBe(true);
    });
  });
  
  describe('Image Resizing', () => {
    test('should resize image', async () => {
      const testImage = await createTestImage(100, 100);
      const result = await sharpService.resize(testImage, { width: 50, height: 50 });
      
      expect(result.success).toBe(true);
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.metadata.dimensions).toEqual({ width: 50, height: 50 });
    });
    
    test('should handle resize with custom options', async () => {
      const testImage = await createTestImage(100, 100);
      const result = await sharpService.resize(testImage, { width: 200, height: 200 }, {
        withoutEnlargement: true
      });
      
      expect(result.success).toBe(true);
    });
  });
  
  describe('Image Cropping', () => {
    test('should crop image', async () => {
      const testImage = await createTestImage(100, 100);
      const cropArea = { left: 10, top: 10, width: 50, height: 50 };
      const result = await sharpService.crop(testImage, cropArea);
      
      expect(result.success).toBe(true);
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.metadata.cropArea).toEqual(cropArea);
    });
  });
  
  describe('Image Transformations', () => {
    test('should rotate image', async () => {
      const testImage = await createTestImage(100, 100);
      const result = await sharpService.transform(testImage, { rotate: 90 });
      
      expect(result.success).toBe(true);
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });
    
    test('should convert to grayscale', async () => {
      const testImage = await createTestImage(100, 100);
      const result = await sharpService.transform(testImage, { grayscale: true });
      
      expect(result.success).toBe(true);
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });
    
    test('should apply multiple transformations', async () => {
      const testImage = await createTestImage(100, 100);
      const result = await sharpService.transform(testImage, {
        rotate: 90,
        flip: true,
        grayscale: true
      });
      
      expect(result.success).toBe(true);
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });
  });
  
  describe('Configuration Management', () => {
    test('should update configuration', () => {
      const newConfig = { concurrency: 8, quality: { jpeg: 90 } };
      sharpService.updateConfig(newConfig);
      
      expect(sharpService.config.concurrency).toBe(8);
      expect(sharpService.config.quality.jpeg).toBe(90);
    });
  });
  
  describe('Statistics', () => {
    test('should track operation statistics', async () => {
      const initialStats = sharpService.getStats();
      expect(initialStats.operationsCount).toBe(0);
      
      await sharpService.getMetadata(TEST_IMAGES.png);
      
      const updatedStats = sharpService.getStats();
      expect(updatedStats.operationsCount).toBe(1);
      expect(updatedStats.totalProcessingTime).toBeGreaterThan(0);
    });
    
    test('should reset statistics', async () => {
      await sharpService.getMetadata(TEST_IMAGES.png);
      sharpService.resetStats();
      
      const stats = sharpService.getStats();
      expect(stats.operationsCount).toBe(0);
      expect(stats.totalProcessingTime).toBe(0);
    });
  });
  
  describe('Cache Management', () => {
    test('should clear cache', () => {
      expect(() => sharpService.clearCache()).not.toThrow();
    });
  });
  
  describe('Sharp Info', () => {
    test('should get Sharp library information', () => {
      const info = sharpService.getSharpInfo();
      expect(info.version).toBeDefined();
      expect(info.format).toBeDefined();
    });
  });
});

describe('SharpWrapper', () => {
  beforeEach(() => {
    clearSharpCache();
  });
  
  describe('Format Conversion Functions', () => {
    test('should convert to JPEG', async () => {
      const result = await convertToJpeg(TEST_IMAGES.png);
      expect(Buffer.isBuffer(result)).toBe(true);
      
      // Verify it's actually JPEG
      const metadata = await getImageMetadata(result);
      expect(metadata.format).toBe('jpeg');
    });
    
    test('should convert to PNG', async () => {
      const result = await convertToPng(TEST_IMAGES.jpeg);
      expect(Buffer.isBuffer(result)).toBe(true);
      
      const metadata = await getImageMetadata(result);
      expect(metadata.format).toBe('png');
    });
    
    test('should convert to WebP', async () => {
      const result = await convertToWebp(TEST_IMAGES.png);
      expect(Buffer.isBuffer(result)).toBe(true);
      
      const metadata = await getImageMetadata(result);
      expect(metadata.format).toBe('webp');
    });
    
    test('should handle conversion errors', async () => {
      const invalidBuffer = Buffer.from('invalid');
      await expect(convertToJpeg(invalidBuffer)).rejects.toThrow();
    });
  });
  
  describe('Image Information Functions', () => {
    test('should get image metadata', async () => {
      const metadata = await getImageMetadata(TEST_IMAGES.png);
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(1);
      expect(metadata.height).toBe(1);
    });
  });
  
  describe('Image Manipulation Functions', () => {
    test('should resize image', async () => {
      const testImage = await createTestImage(100, 100);
      const result = await resizeImage(testImage, 50, 50);
      
      expect(Buffer.isBuffer(result)).toBe(true);
      
      const metadata = await getImageMetadata(result);
      expect(metadata.width).toBe(50);
      expect(metadata.height).toBe(50);
    });
    
    test('should crop image', async () => {
      const testImage = await createTestImage(100, 100);
      const result = await cropImage(testImage, 10, 10, 50, 50);
      
      expect(Buffer.isBuffer(result)).toBe(true);
      
      const metadata = await getImageMetadata(result);
      expect(metadata.width).toBe(50);
      expect(metadata.height).toBe(50);
    });
    
    test('should rotate image', async () => {
      const testImage = await createTestImage(100, 50);
      const result = await rotateImage(testImage, 90);
      
      expect(Buffer.isBuffer(result)).toBe(true);
      
      const metadata = await getImageMetadata(result);
      // After 90-degree rotation, dimensions should swap
      expect(metadata.width).toBe(50);
      expect(metadata.height).toBe(100);
    });
    
    test('should convert to grayscale', async () => {
      const testImage = await createTestImage(100, 100);
      const result = await convertToGrayscale(testImage);
      
      expect(Buffer.isBuffer(result)).toBe(true);
      
      const metadata = await getImageMetadata(result);
      expect(metadata.channels).toBe(1); // Grayscale has 1 channel
    });
    
    test('should create thumbnail', async () => {
      const testImage = await createTestImage(200, 200);
      const result = await createThumbnail(testImage, 100);
      
      expect(Buffer.isBuffer(result)).toBe(true);
      
      const metadata = await getImageMetadata(result);
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
    });
  });
  
  describe('Optimization Functions', () => {
    test('should optimize for web', async () => {
      const testImage = await createTestImage(2000, 2000);
      const result = await optimizeForWeb(testImage, {
        maxWidth: 1000,
        maxHeight: 1000,
        quality: 80
      });
      
      expect(Buffer.isBuffer(result)).toBe(true);
      
      const metadata = await getImageMetadata(result);
      expect(metadata.width).toBeLessThanOrEqual(1000);
      expect(metadata.height).toBeLessThanOrEqual(1000);
    });
  });
  
  describe('Batch Processing', () => {
    test('should process multiple images', async () => {
      const testImages = [
        await createTestImage(100, 100),
        await createTestImage(200, 200),
        await createTestImage(150, 150)
      ];
      
      const results = await batchProcess(testImages, async (image) => {
        return await convertToJpeg(image);
      });
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(Buffer.isBuffer(result.data)).toBe(true);
      });
    });
    
    test('should handle batch processing errors', async () => {
      const testInputs = [
        await createTestImage(100, 100),
        Buffer.from('invalid'),
        await createTestImage(200, 200)
      ];
      
      const results = await batchProcess(testInputs, async (image) => {
        return await convertToJpeg(image);
      }, { continueOnError: true });
      
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });
  
  describe('Statistics Functions', () => {
    test('should get and reset statistics', async () => {
      await convertToJpeg(TEST_IMAGES.png);
      
      const stats = getSharpStats();
      expect(stats.operationsCount).toBeGreaterThan(0);
      
      resetSharpStats();
      
      const resetStats = getSharpStats();
      expect(resetStats.operationsCount).toBe(0);
    });
  });
});

describe('Global Service Instance', () => {
  test('should return same instance', () => {
    const service1 = getSharpService();
    const service2 = getSharpService();
    
    expect(service1).toBe(service2);
  });
  
  test('should accept configuration on first call', () => {
    // Note: This test might interfere with other tests if global instance is already created
    const config = { concurrency: 2 };
    const service = getSharpService(config);
    
    expect(service.config.concurrency).toBe(2);
  });
});

describe('Integration Workflow', () => {
  test('should perform complete image processing workflow', async () => {
    // Create a test image
    const originalImage = await createTestImage(400, 300, 'png');
    
    // Get original metadata
    const originalMetadata = await getImageMetadata(originalImage);
    expect(originalMetadata.format).toBe('png');
    expect(originalMetadata.width).toBe(400);
    expect(originalMetadata.height).toBe(300);
    
    // Resize the image
    const resizedImage = await resizeImage(originalImage, 200, 150);
    const resizedMetadata = await getImageMetadata(resizedImage);
    expect(resizedMetadata.width).toBe(200);
    expect(resizedMetadata.height).toBe(150);
    
    // Convert to JPEG
    const jpegImage = await convertToJpeg(resizedImage, { quality: 85 });
    const jpegMetadata = await getImageMetadata(jpegImage);
    expect(jpegMetadata.format).toBe('jpeg');
    
    // Apply transformations
    const transformedImage = await convertToGrayscale(jpegImage);
    const transformedMetadata = await getImageMetadata(transformedImage);
    expect(transformedMetadata.channels).toBe(1);
    
    // Create thumbnail
    const thumbnail = await createThumbnail(transformedImage, 64);
    const thumbnailMetadata = await getImageMetadata(thumbnail);
    expect(thumbnailMetadata.width).toBe(64);
    expect(thumbnailMetadata.height).toBe(64);
    
    // Verify all operations produced valid buffers
    expect(Buffer.isBuffer(originalImage)).toBe(true);
    expect(Buffer.isBuffer(resizedImage)).toBe(true);
    expect(Buffer.isBuffer(jpegImage)).toBe(true);
    expect(Buffer.isBuffer(transformedImage)).toBe(true);
    expect(Buffer.isBuffer(thumbnail)).toBe(true);
  });
});