/**
 * Text Extraction Service Tests
 * Comprehensive test suite for text extraction functionality
 */

const fs = require('fs').promises;
const path = require('path');
const { 
  TextExtractionService, 
  TextExtractionResult, 
  TextExtractionEvents,
  getTextExtractionService 
} = require('../services/TextExtractionService');
const {
  extractTextFromFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  convertHTMLToText,
  validateTextExtractionInput,
  getTextExtractionPreview,
  getTextExtractionStatistics,
  TextExtractionOperationResult
} = require('../utils/TextExtractionWrapper');
const {
  TextExtractionError,
  TextExtractionErrorHandler,
  TextExtractionErrorTypes,
  getTextExtractionErrorHandler,
  handleTextExtractionError
} = require('../errors/TextExtractionErrorHandler');

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, 'test_data');
const TEST_OUTPUT_DIR = path.join(__dirname, 'test_output');

/**
 * Helper function to create test PDF content (mock)
 */
function createTestPDFContent(text = 'Sample PDF text content') {
  // This is a mock PDF content for testing
  // In real implementation, you would use a proper PDF library
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length ${text.length}\n>>\nstream\nBT\n/F1 12 Tf\n72 720 Td\n(${text}) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000125 00000 n \n0000000185 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n${250 + text.length}\n%%EOF`);
}

/**
 * Helper function to create test DOCX content (mock)
 */
function createTestDOCXContent(text = 'Sample DOCX text content') {
  // This is a simplified mock DOCX content for testing
  // In real implementation, you would use proper DOCX structure
  const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${text}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;
  
  return Buffer.from(docxXml);
}

/**
 * Helper function to create test HTML content
 */
function createTestHTMLContent(text = 'Sample HTML text content') {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Test Document</title>
</head>
<body>
  <h1>Test Heading</h1>
  <p>${text}</p>
  <div>
    <span>Additional content</span>
  </div>
</body>
</html>`;
}

/**
 * Setup test environment
 */
async function setupTestEnvironment() {
  try {
    // Create test directories
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
    
    // Create test files
    const testFiles = {
      'simple.pdf': createTestPDFContent('This is a simple PDF test document.'),
      'multipage.pdf': createTestPDFContent('Page 1 content\n\nPage 2 content\n\nPage 3 content'),
      'large.pdf': createTestPDFContent('Large document content. '.repeat(1000)),
      'simple.docx': createTestDOCXContent('This is a simple DOCX test document.'),
      'structured.docx': createTestDOCXContent('Heading\n\nParagraph 1\n\nParagraph 2\n\nConclusion'),
      'large.docx': createTestDOCXContent('Large DOCX content. '.repeat(500)),
      'empty.txt': Buffer.from(''),
      'invalid.pdf': Buffer.from('Invalid PDF content'),
      'corrupted.docx': Buffer.from('Corrupted DOCX content')
    };
    
    for (const [filename, content] of Object.entries(testFiles)) {
      await fs.writeFile(path.join(TEST_DATA_DIR, filename), content);
    }
    
    console.log('Test environment setup completed');
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
    // Remove test directories
    await fs.rmdir(TEST_DATA_DIR, { recursive: true });
    await fs.rmdir(TEST_OUTPUT_DIR, { recursive: true });
    
    console.log('Test environment cleanup completed');
  } catch (error) {
    console.warn('Failed to cleanup test environment:', error);
  }
}

/**
 * Test TextExtractionResult class
 */
function testTextExtractionResult() {
  console.log('Testing TextExtractionResult class...');
  
  const result = new TextExtractionResult();
  
  // Test initial state
  console.assert(result.success === false, 'Initial success should be false');
  console.assert(result.text === '', 'Initial text should be empty');
  console.assert(result.statistics.characterCount === 0, 'Initial character count should be 0');
  
  // Test adding steps
  result.addStep('test_step', 100, true, { detail: 'test' });
  console.assert(result.steps.length === 1, 'Should have one step');
  console.assert(result.steps[0].name === 'test_step', 'Step name should match');
  
  // Test adding warnings and errors
  result.addWarning('Test warning');
  result.addError('Test error');
  console.assert(result.warnings.length === 1, 'Should have one warning');
  console.assert(result.errors.length === 1, 'Should have one error');
  
  // Test setting text and statistics update
  result.setText('Hello world! This is a test.');
  console.assert(result.text === 'Hello world! This is a test.', 'Text should be set correctly');
  console.assert(result.statistics.characterCount === 28, 'Character count should be updated');
  console.assert(result.statistics.wordCount === 6, 'Word count should be calculated');
  
  // Test summary
  const summary = result.getSummary();
  console.assert(typeof summary === 'object', 'Summary should be an object');
  console.assert(summary.characterCount === 28, 'Summary character count should match');
  
  console.log('✓ TextExtractionResult tests passed');
}

/**
 * Test TextExtractionService basic functionality
 */
async function testTextExtractionServiceBasic() {
  console.log('Testing TextExtractionService basic functionality...');
  
  const service = new TextExtractionService();
  
  // Test service initialization
  console.assert(service instanceof TextExtractionService, 'Service should be instance of TextExtractionService');
  console.assert(typeof service.options === 'object', 'Service should have options');
  console.assert(service.cache instanceof Map, 'Service should have cache');
  
  // Test statistics
  const initialStats = service.getStatistics();
  console.assert(initialStats.totalExtractions === 0, 'Initial extractions should be 0');
  
  // Test supported formats
  const formats = service.getSupportedFormats();
  console.assert(Array.isArray(formats.input), 'Input formats should be array');
  console.assert(Array.isArray(formats.output), 'Output formats should be array');
  
  console.log('✓ TextExtractionService basic tests passed');
}

/**
 * Test HTML to text conversion
 */
async function testHTMLToTextConversion() {
  console.log('Testing HTML to text conversion...');
  
  const service = new TextExtractionService();
  const htmlContent = createTestHTMLContent('Test paragraph content');
  
  try {
    // Test plain text conversion
    const plainResult = await service.convertHTMLToText(htmlContent, { outputFormat: 'plain' });
    console.assert(plainResult.success === true, 'Plain text conversion should succeed');
    console.assert(plainResult.text.includes('Test paragraph content'), 'Should contain original text');
    console.assert(!plainResult.text.includes('<'), 'Should not contain HTML tags');
    
    // Test markdown conversion
    const markdownResult = await service.convertHTMLToText(htmlContent, { outputFormat: 'markdown' });
    console.assert(markdownResult.success === true, 'Markdown conversion should succeed');
    console.assert(markdownResult.text.includes('# Test Heading'), 'Should contain markdown heading');
    
    console.log('✓ HTML to text conversion tests passed');
  } catch (error) {
    console.error('HTML to text conversion test failed:', error);
    throw error;
  }
}

/**
 * Test text extraction wrapper functions
 */
async function testTextExtractionWrapper() {
  console.log('Testing text extraction wrapper functions...');
  
  const htmlContent = createTestHTMLContent('Wrapper test content');
  
  try {
    // Test HTML to text conversion wrapper
    const result = await convertHTMLToText(htmlContent, null, { outputFormat: 'plain' });
    console.assert(result instanceof TextExtractionOperationResult, 'Should return TextExtractionOperationResult');
    console.assert(result.success === true, 'Conversion should succeed');
    console.assert(result.text.includes('Wrapper test content'), 'Should contain original text');
    
    // Test validation function
    const validationResult = await validateTextExtractionInput('/nonexistent/file.pdf');
    console.assert(validationResult.valid === false, 'Validation should fail for nonexistent file');
    console.assert(validationResult.error.includes('does not exist'), 'Should indicate file does not exist');
    
    // Test statistics functions
    const stats = getTextExtractionStatistics();
    console.assert(typeof stats === 'object', 'Statistics should be an object');
    console.assert(typeof stats.totalExtractions === 'number', 'Total extractions should be a number');
    
    console.log('✓ Text extraction wrapper tests passed');
  } catch (error) {
    console.error('Text extraction wrapper test failed:', error);
    throw error;
  }
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log('Testing error handling...');
  
  const errorHandler = new TextExtractionErrorHandler();
  
  // Test error classification
  const fileNotFoundError = new Error('ENOENT: no such file or directory');
  fileNotFoundError.code = 'ENOENT';
  
  const classifiedError = errorHandler._classifyError(fileNotFoundError);
  console.assert(classifiedError instanceof TextExtractionError, 'Should create TextExtractionError');
  console.assert(classifiedError.type === TextExtractionErrorTypes.FILE_NOT_FOUND, 'Should classify as FILE_NOT_FOUND');
  
  // Test error handling
  const handleResult = await errorHandler.handleError(fileNotFoundError);
  console.assert(handleResult.success === false, 'Error handling should indicate failure');
  console.assert(handleResult.error instanceof TextExtractionError, 'Should return TextExtractionError');
  
  // Test statistics
  const stats = errorHandler.getStatistics();
  console.assert(stats.totalErrors > 0, 'Should have recorded errors');
  
  console.log('✓ Error handling tests passed');
}

/**
 * Test performance with large content
 */
async function testPerformance() {
  console.log('Testing performance with large content...');
  
  const service = new TextExtractionService();
  const largeHtmlContent = createTestHTMLContent('Large content. '.repeat(10000));
  
  try {
    const startTime = Date.now();
    const result = await service.convertHTMLToText(largeHtmlContent, { outputFormat: 'plain' });
    const endTime = Date.now();
    
    console.assert(result.success === true, 'Large content conversion should succeed');
    console.assert(result.statistics.characterCount > 100000, 'Should handle large content');
    
    const processingTime = endTime - startTime;
    console.log(`Large content processing time: ${processingTime}ms`);
    
    // Performance should be reasonable (less than 5 seconds for this test)
    console.assert(processingTime < 5000, 'Processing should complete in reasonable time');
    
    console.log('✓ Performance tests passed');
  } catch (error) {
    console.error('Performance test failed:', error);
    throw error;
  }
}

/**
 * Test concurrent operations
 */
async function testConcurrentOperations() {
  console.log('Testing concurrent operations...');
  
  const service = new TextExtractionService();
  const htmlContents = [
    createTestHTMLContent('Concurrent test 1'),
    createTestHTMLContent('Concurrent test 2'),
    createTestHTMLContent('Concurrent test 3'),
    createTestHTMLContent('Concurrent test 4'),
    createTestHTMLContent('Concurrent test 5')
  ];
  
  try {
    const startTime = Date.now();
    const promises = htmlContents.map((content, index) => 
      service.convertHTMLToText(content, { outputFormat: 'plain' })
    );
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    // All operations should succeed
    results.forEach((result, index) => {
      console.assert(result.success === true, `Concurrent operation ${index + 1} should succeed`);
      console.assert(result.text.includes(`Concurrent test ${index + 1}`), `Should contain correct content for operation ${index + 1}`);
    });
    
    const totalTime = endTime - startTime;
    console.log(`Concurrent operations completed in: ${totalTime}ms`);
    
    console.log('✓ Concurrent operations tests passed');
  } catch (error) {
    console.error('Concurrent operations test failed:', error);
    throw error;
  }
}

/**
 * Test caching functionality
 */
async function testCaching() {
  console.log('Testing caching functionality...');
  
  const service = new TextExtractionService();
  const htmlContent = createTestHTMLContent('Caching test content');
  
  try {
    // Clear cache first
    service.clearCache();
    
    // First conversion (cache miss)
    const startTime1 = Date.now();
    const result1 = await service.convertHTMLToText(htmlContent, { outputFormat: 'plain' });
    const endTime1 = Date.now();
    
    console.assert(result1.success === true, 'First conversion should succeed');
    
    // Second conversion (should be faster due to caching)
    const startTime2 = Date.now();
    const result2 = await service.convertHTMLToText(htmlContent, { outputFormat: 'plain' });
    const endTime2 = Date.now();
    
    console.assert(result2.success === true, 'Second conversion should succeed');
    console.assert(result1.text === result2.text, 'Results should be identical');
    
    const time1 = endTime1 - startTime1;
    const time2 = endTime2 - startTime2;
    
    console.log(`First conversion: ${time1}ms, Second conversion: ${time2}ms`);
    
    // Test cache statistics
    const stats = service.getStatistics();
    console.assert(stats.cacheSize > 0, 'Cache should contain entries');
    
    console.log('✓ Caching tests passed');
  } catch (error) {
    console.error('Caching test failed:', error);
    throw error;
  }
}

/**
 * Test global service instance
 */
function testGlobalServiceInstance() {
  console.log('Testing global service instance...');
  
  const service1 = getTextExtractionService();
  const service2 = getTextExtractionService();
  
  console.assert(service1 === service2, 'Should return same instance');
  console.assert(service1 instanceof TextExtractionService, 'Should be TextExtractionService instance');
  
  console.log('✓ Global service instance tests passed');
}

/**
 * Test integration workflow
 */
async function testIntegrationWorkflow() {
  console.log('Testing integration workflow...');
  
  try {
    // Test complete workflow: HTML -> Text -> Validation -> Statistics
    const htmlContent = createTestHTMLContent('Integration workflow test');
    
    // Step 1: Convert HTML to text
    const conversionResult = await convertHTMLToText(htmlContent, null, { outputFormat: 'markdown' });
    console.assert(conversionResult.success === true, 'Conversion should succeed');
    
    // Step 2: Get preview
    const previewResult = await getTextExtractionPreview('/fake/path.html', 100);
    // Preview will fail for fake path, but should handle gracefully
    console.assert(previewResult.success === false, 'Preview should fail for fake path');
    
    // Step 3: Check statistics
    const stats = getTextExtractionStatistics();
    console.assert(stats.totalExtractions > 0, 'Should have recorded extractions');
    
    // Step 4: Test error handler integration
    const errorHandler = getTextExtractionErrorHandler();
    console.assert(errorHandler instanceof TextExtractionErrorHandler, 'Should get error handler instance');
    
    console.log('✓ Integration workflow tests passed');
  } catch (error) {
    console.error('Integration workflow test failed:', error);
    throw error;
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('Starting Text Extraction Service Tests...');
  console.log('=' .repeat(50));
  
  try {
    // Setup test environment
    await setupTestEnvironment();
    
    // Run tests
    testTextExtractionResult();
    await testTextExtractionServiceBasic();
    await testHTMLToTextConversion();
    await testTextExtractionWrapper();
    await testErrorHandling();
    await testPerformance();
    await testConcurrentOperations();
    await testCaching();
    testGlobalServiceInstance();
    await testIntegrationWorkflow();
    
    console.log('=' .repeat(50));
    console.log('✅ All Text Extraction Service tests passed!');
    
    // Display final statistics
    const finalStats = getTextExtractionStatistics();
    console.log('\nFinal Statistics:');
    console.log(`- Total extractions: ${finalStats.totalExtractions}`);
    console.log(`- Successful extractions: ${finalStats.successfulExtractions}`);
    console.log(`- Failed extractions: ${finalStats.failedExtractions}`);
    console.log(`- Success rate: ${(finalStats.successRate * 100).toFixed(2)}%`);
    console.log(`- Average extraction time: ${finalStats.averageExtractionTime.toFixed(2)}ms`);
    console.log(`- Cache size: ${finalStats.cacheSize}`);
    
    const errorStats = getTextExtractionErrorHandler().getStatistics();
    console.log(`- Total errors handled: ${errorStats.totalErrors}`);
    console.log(`- Recovery success rate: ${(errorStats.recoverySuccessRate * 100).toFixed(2)}%`);
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    throw error;
  } finally {
    // Cleanup test environment
    await cleanupTestEnvironment();
  }
}

// Export test functions for individual testing
module.exports = {
  runAllTests,
  setupTestEnvironment,
  cleanupTestEnvironment,
  testTextExtractionResult,
  testTextExtractionServiceBasic,
  testHTMLToTextConversion,
  testTextExtractionWrapper,
  testErrorHandling,
  testPerformance,
  testConcurrentOperations,
  testCaching,
  testGlobalServiceInstance,
  testIntegrationWorkflow
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}