/**
 * Image Processing Service Tests
 * Comprehensive tests for image processing functionality
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { 
  ImageProcessingService, 
  ImageProcessingResult, 
  getImageProcessingService 
} = require('../services/ImageProcessingService');
const {
  processImage,
  resizeImage,
  convertImageFormat,
  compressImage,
  createThumbnail,
  validateImageFile,
  getImageMetadata,
  batchProcessImages,
  ImageProcessingOperationResult
} = require('../utils/ImageProcessingWrapper');
const {
  ImageProcessingError,
  ImageProcessingErrorHandler,
  ImageProcessingErrorTypes,
  getImageProcessingErrorHandler
} = require('../errors/ImageProcessingErrorHandler');

// Test configuration
const TEST_CONFIG = {
  testDir: path.join(__dirname, 'temp_image_test'),
  sampleImages: {
    jpeg: 'test_image.jpg',
    png: 'test_image.png',
    webp: 'test_image.webp'
  },
  timeout: 30000
};

/**
 * Helper function to create test images
 */
async function createTestImage(filename, format = 'jpeg', width = 800, height = 600) {
  const outputPath = path.join(TEST_CONFIG.testDir, filename);
  
  // Create a simple colored rectangle
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 }
    }
  });
  
  // Add some content (text overlay would require additional setup)
  await image
    .png()
    .toFile(outputPath.replace(path.extname(outputPath), '.png'));
    
  // Convert to desired format
  if (format !== 'png') {
    await sharp(outputPath.replace(path.extname(outputPath), '.png'))
      .toFormat(format)
      .toFile(outputPath);
      
    // Remove temporary PNG
    await fs.unlink(outputPath.replace(path.extname(outputPath), '.png'));
  }
  
  return outputPath;
}

/**
 * Helper function to create corrupted image file
 */
async function createCorruptedImage(filename) {
  const outputPath = path.join(TEST_CONFIG.testDir, filename);
  await fs.writeFile(outputPath, 'This is not an image file');
  return outputPath;
}

/**
 * Setup test environment
 */
async function setupTestEnvironment() {
  try {
    await fs.mkdir(TEST_CONFIG.testDir, { recursive: true });
    
    // Create sample images
    await createTestImage(TEST_CONFIG.sampleImages.jpeg, 'jpeg');
    await createTestImage(TEST_CONFIG.sampleImages.png, 'png');
    await createTestImage(TEST_CONFIG.sampleImages.webp, 'webp');
    
    console.log('Test environment setup complete');
  } catch (error) {
    console.error('Failed to setup test environment:', error);
    throw error;
  }
}

/**
 * Cleanup test environment
 */
async function cleanupTestEnvironment() {
  try {
    await fs.rm(TEST_CONFIG.testDir, { recursive: true, force: true });
    console.log('Test environment cleaned up');
  } catch (error) {
    console.warn('Failed to cleanup test environment:', error);
  }
}

/**
 * Test ImageProcessingResult class
 */
function testImageProcessingResult() {
  console.log('\n=== Testing ImageProcessingResult ===');
  
  const result = new ImageProcessingResult();
  
  // Test initial state
  console.assert(!result.success, 'Initial success should be false');
  console.assert(result.errors.length === 0, 'Initial errors should be empty');
  console.assert(result.warnings.length === 0, 'Initial warnings should be empty');
  
  // Test adding errors and warnings
  result.addError('Test error');
  result.addWarning('Test warning');
  
  console.assert(result.errors.length === 1, 'Should have one error');
  console.assert(result.warnings.length === 1, 'Should have one warning');
  
  // Test finalization
  result.finalize();
  console.assert(result.success === false, 'Should not be successful with errors');
  
  // Test successful result
  const successResult = new ImageProcessingResult();
  successResult.outputPath = '/test/path';
  successResult.finalize();
  console.assert(successResult.success === true, 'Should be successful without errors');
  
  console.log('✓ ImageProcessingResult tests passed');
}

/**
 * Test ImageProcessingService basic functionality
 */
async function testImageProcessingServiceBasic() {
  console.log('\n=== Testing ImageProcessingService Basic ===');
  
  const service = getImageProcessingService();
  
  // Test service instance
  console.assert(service instanceof ImageProcessingService, 'Should be ImageProcessingService instance');
  
  // Test supported formats
  const formats = service.getSupportedFormats();
  console.assert(Array.isArray(formats), 'Supported formats should be array');
  console.assert(formats.includes('jpeg'), 'Should support JPEG');
  console.assert(formats.includes('png'), 'Should support PNG');
  console.assert(formats.includes('webp'), 'Should support WebP');
  
  // Test statistics
  const stats = service.getStatistics();
  console.assert(typeof stats === 'object', 'Statistics should be object');
  console.assert(typeof stats.totalProcessed === 'number', 'Should have totalProcessed count');
  
  console.log('✓ ImageProcessingService basic tests passed');
}

/**
 * Test image metadata extraction
 */
async function testImageMetadata() {
  console.log('\n=== Testing Image Metadata ===');
  
  const jpegPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  
  try {
    const metadata = await getImageMetadata(jpegPath);
    
    console.assert(metadata.success === true, 'Metadata extraction should succeed');
    console.assert(typeof metadata.metadata === 'object', 'Should have metadata object');
    console.assert(typeof metadata.metadata.width === 'number', 'Should have width');
    console.assert(typeof metadata.metadata.height === 'number', 'Should have height');
    console.assert(typeof metadata.metadata.format === 'string', 'Should have format');
    
    console.log(`✓ Metadata: ${metadata.metadata.width}x${metadata.metadata.height} ${metadata.metadata.format}`);
  } catch (error) {
    console.error('Metadata test failed:', error);
    throw error;
  }
}

/**
 * Test image validation
 */
async function testImageValidation() {
  console.log('\n=== Testing Image Validation ===');
  
  const jpegPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  const corruptedPath = await createCorruptedImage('corrupted.jpg');
  const nonExistentPath = path.join(TEST_CONFIG.testDir, 'nonexistent.jpg');
  
  try {
    // Test valid image
    const validResult = await validateImageFile(jpegPath);
    console.assert(validResult.valid === true, 'Valid image should pass validation');
    
    // Test corrupted image
    const corruptedResult = await validateImageFile(corruptedPath);
    console.assert(corruptedResult.valid === false, 'Corrupted image should fail validation');
    
    // Test non-existent image
    const nonExistentResult = await validateImageFile(nonExistentPath);
    console.assert(nonExistentResult.valid === false, 'Non-existent image should fail validation');
    
    console.log('✓ Image validation tests passed');
  } catch (error) {
    console.error('Validation test failed:', error);
    throw error;
  }
}

/**
 * Test image resizing
 */
async function testImageResizing() {
  console.log('\n=== Testing Image Resizing ===');
  
  const inputPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  const outputPath = path.join(TEST_CONFIG.testDir, 'resized.jpg');
  
  try {
    const result = await resizeImage(inputPath, outputPath, 400, 300);
    
    console.assert(result.isSuccess(), 'Resize should succeed');
    console.assert(await fs.access(outputPath).then(() => true).catch(() => false), 'Output file should exist');
    
    // Verify dimensions
    const metadata = await sharp(outputPath).metadata();
    console.assert(metadata.width === 400, 'Width should be 400');
    console.assert(metadata.height === 300, 'Height should be 300');
    
    console.log('✓ Image resizing tests passed');
  } catch (error) {
    console.error('Resizing test failed:', error);
    throw error;
  }
}

/**
 * Test format conversion
 */
async function testFormatConversion() {
  console.log('\n=== Testing Format Conversion ===');
  
  const inputPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  const outputPath = path.join(TEST_CONFIG.testDir, 'converted.webp');
  
  try {
    const result = await convertImageFormat(inputPath, outputPath, 'webp');
    
    console.assert(result.isSuccess(), 'Format conversion should succeed');
    console.assert(await fs.access(outputPath).then(() => true).catch(() => false), 'Output file should exist');
    
    // Verify format
    const metadata = await sharp(outputPath).metadata();
    console.assert(metadata.format === 'webp', 'Format should be WebP');
    
    console.log('✓ Format conversion tests passed');
  } catch (error) {
    console.error('Format conversion test failed:', error);
    throw error;
  }
}

/**
 * Test image compression
 */
async function testImageCompression() {
  console.log('\n=== Testing Image Compression ===');
  
  const inputPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  const outputPath = path.join(TEST_CONFIG.testDir, 'compressed.jpg');
  
  try {
    const result = await compressImage(inputPath, outputPath, 50);
    
    console.assert(result.isSuccess(), 'Compression should succeed');
    console.assert(await fs.access(outputPath).then(() => true).catch(() => false), 'Output file should exist');
    
    // Check file size reduction
    const originalStats = await fs.stat(inputPath);
    const compressedStats = await fs.stat(outputPath);
    console.assert(compressedStats.size < originalStats.size, 'Compressed file should be smaller');
    
    console.log(`✓ Compression: ${originalStats.size} → ${compressedStats.size} bytes`);
  } catch (error) {
    console.error('Compression test failed:', error);
    throw error;
  }
}

/**
 * Test thumbnail creation
 */
async function testThumbnailCreation() {
  console.log('\n=== Testing Thumbnail Creation ===');
  
  const inputPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  const outputPath = path.join(TEST_CONFIG.testDir, 'thumbnail.jpg');
  
  try {
    const result = await createThumbnail(inputPath, outputPath, 150);
    
    console.assert(result.isSuccess(), 'Thumbnail creation should succeed');
    console.assert(await fs.access(outputPath).then(() => true).catch(() => false), 'Thumbnail file should exist');
    
    // Verify dimensions
    const metadata = await sharp(outputPath).metadata();
    console.assert(metadata.width === 150, 'Thumbnail width should be 150');
    console.assert(metadata.height === 150, 'Thumbnail height should be 150');
    
    console.log('✓ Thumbnail creation tests passed');
  } catch (error) {
    console.error('Thumbnail test failed:', error);
    throw error;
  }
}

/**
 * Test batch processing
 */
async function testBatchProcessing() {
  console.log('\n=== Testing Batch Processing ===');
  
  const inputs = [
    {
      inputPath: path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg),
      outputPath: path.join(TEST_CONFIG.testDir, 'batch_1.webp'),
      operations: { format: 'webp', quality: 80 }
    },
    {
      inputPath: path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.png),
      outputPath: path.join(TEST_CONFIG.testDir, 'batch_2.webp'),
      operations: { format: 'webp', quality: 80 }
    }
  ];
  
  try {
    const results = await batchProcessImages(inputs);
    
    console.assert(Array.isArray(results), 'Results should be array');
    console.assert(results.length === 2, 'Should have 2 results');
    console.assert(results.every(r => r.isSuccess()), 'All results should be successful');
    
    // Verify output files exist
    for (const input of inputs) {
      const exists = await fs.access(input.outputPath).then(() => true).catch(() => false);
      console.assert(exists, `Output file should exist: ${input.outputPath}`);
    }
    
    console.log('✓ Batch processing tests passed');
  } catch (error) {
    console.error('Batch processing test failed:', error);
    throw error;
  }
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log('\n=== Testing Error Handling ===');
  
  const errorHandler = getImageProcessingErrorHandler();
  
  try {
    // Test with non-existent file
    const nonExistentPath = path.join(TEST_CONFIG.testDir, 'nonexistent.jpg');
    const outputPath = path.join(TEST_CONFIG.testDir, 'error_test.jpg');
    
    const result = await processImage(nonExistentPath, outputPath);
    console.assert(!result.isSuccess(), 'Should fail with non-existent file');
    console.assert(result.getErrors().length > 0, 'Should have error messages');
    
    // Test error classification
    const testError = new Error('ENOENT: no such file or directory');
    const handledError = await errorHandler.handleError(testError, { inputPath: nonExistentPath });
    
    console.assert(handledError.error instanceof ImageProcessingError, 'Should create ImageProcessingError');
    console.assert(handledError.error.type === ImageProcessingErrorTypes.FILE_NOT_FOUND, 'Should classify as FILE_NOT_FOUND');
    
    console.log('✓ Error handling tests passed');
  } catch (error) {
    console.error('Error handling test failed:', error);
    throw error;
  }
}

/**
 * Test performance and caching
 */
async function testPerformanceAndCaching() {
  console.log('\n=== Testing Performance and Caching ===');
  
  const service = getImageProcessingService();
  const inputPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  
  try {
    // Clear cache first
    service.clearCache();
    
    // First processing (should be slower)
    const start1 = Date.now();
    const result1 = await service.getImageMetadata(inputPath);
    const time1 = Date.now() - start1;
    
    console.assert(result1.success, 'First metadata call should succeed');
    
    // Second processing (should be faster due to caching)
    const start2 = Date.now();
    const result2 = await service.getImageMetadata(inputPath);
    const time2 = Date.now() - start2;
    
    console.assert(result2.success, 'Second metadata call should succeed');
    console.assert(time2 <= time1, 'Second call should be faster or equal (cached)');
    
    // Test cache info
    const cacheInfo = service.getCacheInfo();
    console.assert(typeof cacheInfo.size === 'number', 'Cache should have size info');
    console.assert(cacheInfo.size > 0, 'Cache should have entries');
    
    console.log(`✓ Performance: ${time1}ms → ${time2}ms (cached)`);
  } catch (error) {
    console.error('Performance test failed:', error);
    throw error;
  }
}

/**
 * Test concurrent operations
 */
async function testConcurrentOperations() {
  console.log('\n=== Testing Concurrent Operations ===');
  
  const inputPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  
  try {
    // Create multiple concurrent operations
    const operations = [];
    for (let i = 0; i < 5; i++) {
      const outputPath = path.join(TEST_CONFIG.testDir, `concurrent_${i}.jpg`);
      operations.push(resizeImage(inputPath, outputPath, 200 + i * 50, 200 + i * 50));
    }
    
    // Wait for all operations to complete
    const results = await Promise.all(operations);
    
    console.assert(results.length === 5, 'Should have 5 results');
    console.assert(results.every(r => r.isSuccess()), 'All concurrent operations should succeed');
    
    console.log('✓ Concurrent operations tests passed');
  } catch (error) {
    console.error('Concurrent operations test failed:', error);
    throw error;
  }
}

/**
 * Test integration workflow
 */
async function testIntegrationWorkflow() {
  console.log('\n=== Testing Integration Workflow ===');
  
  const inputPath = path.join(TEST_CONFIG.testDir, TEST_CONFIG.sampleImages.jpeg);
  
  try {
    // Step 1: Validate input
    const validation = await validateImageFile(inputPath);
    console.assert(validation.valid, 'Input validation should pass');
    
    // Step 2: Get metadata
    const metadata = await getImageMetadata(inputPath);
    console.assert(metadata.success, 'Metadata extraction should succeed');
    
    // Step 3: Process image (resize + convert + compress)
    const outputPath = path.join(TEST_CONFIG.testDir, 'workflow_result.webp');
    const result = await processImage(inputPath, outputPath, {
      width: 600,
      height: 400,
      format: 'webp',
      quality: 85
    });
    
    console.assert(result.isSuccess(), 'Processing should succeed');
    
    // Step 4: Verify output
    const outputValidation = await validateImageFile(outputPath);
    console.assert(outputValidation.valid, 'Output validation should pass');
    
    const outputMetadata = await getImageMetadata(outputPath);
    console.assert(outputMetadata.success, 'Output metadata should be available');
    console.assert(outputMetadata.metadata.format === 'webp', 'Output should be WebP format');
    console.assert(outputMetadata.metadata.width === 600, 'Output width should be 600');
    console.assert(outputMetadata.metadata.height === 400, 'Output height should be 400');
    
    console.log('✓ Integration workflow tests passed');
  } catch (error) {
    console.error('Integration workflow test failed:', error);
    throw error;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting Image Processing Service Tests...');
  
  try {
    // Setup
    await setupTestEnvironment();
    
    // Run tests
    testImageProcessingResult();
    await testImageProcessingServiceBasic();
    await testImageMetadata();
    await testImageValidation();
    await testImageResizing();
    await testFormatConversion();
    await testImageCompression();
    await testThumbnailCreation();
    await testBatchProcessing();
    await testErrorHandling();
    await testPerformanceAndCaching();
    await testConcurrentOperations();
    await testIntegrationWorkflow();
    
    console.log('\n🎉 All Image Processing Service tests passed!');
    
    // Show final statistics
    const service = getImageProcessingService();
    const stats = service.getStatistics();
    console.log('\nFinal Statistics:', stats);
    
    const errorHandler = getImageProcessingErrorHandler();
    const errorStats = errorHandler.getStatistics();
    console.log('Error Handler Statistics:', errorStats);
    
  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    throw error;
  } finally {
    // Cleanup
    await cleanupTestEnvironment();
  }
}

// Export for use in other test files
module.exports = {
  runAllTests,
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestImage,
  TEST_CONFIG
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}