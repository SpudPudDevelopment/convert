/**
 * DOCX Service Tests
 * Comprehensive tests for DOCX parsing, conversion, and error handling
 */

const fs = require('fs').promises;
const path = require('path');
const { getDOCXService, DOCXService, DOCXDocumentInfo } = require('../services/DOCXService');
const {
  parseDOCX,
  extractTextFromDOCX,
  getDOCXMetadata,
  convertDOCXToHTML,
  convertDOCXToMarkdown,
  convertDOCXToText,
  validateDOCX,
  getDOCXInfo,
  batchConvertDOCX,
  DOCXOperationResult
} = require('../utils/DOCXWrapper');
const {
  DOCXErrorHandler,
  DOCXError,
  DOCXErrorTypes,
  getDOCXErrorHandler,
  handleDOCXError
} = require('../errors/DOCXErrorHandler');

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, 'test-data');
const TEST_OUTPUT_DIR = path.join(__dirname, 'test-output');

/**
 * Helper function to create a simple DOCX file for testing
 * Note: This creates a minimal DOCX structure for testing purposes
 */
async function createTestDOCX(fileName, content = 'Test document content') {
  const filePath = path.join(TEST_DATA_DIR, fileName);
  
  // Create a minimal DOCX structure
  const JSZip = require('jszip');
  const zip = new JSZip();
  
  // Add required DOCX files
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${content}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`);
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
  
  return filePath;
}

/**
 * Helper function to create a multi-page DOCX for testing
 */
async function createMultiPageDOCX(fileName) {
  const content = `
    <w:p><w:r><w:t>Page 1 content</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:r><w:t>Page 2 content</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:r><w:t>Page 3 content</w:t></w:r></w:p>
  `;
  
  const filePath = path.join(TEST_DATA_DIR, fileName);
  const JSZip = require('jszip');
  const zip = new JSZip();
  
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${content}
  </w:body>
</w:document>`);
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
  
  return filePath;
}

/**
 * Helper function to create a corrupted DOCX for testing
 */
async function createCorruptedDOCX(fileName) {
  const filePath = path.join(TEST_DATA_DIR, fileName);
  // Write invalid content
  await fs.writeFile(filePath, 'This is not a valid DOCX file');
  return filePath;
}

/**
 * Setup test environment
 */
async function setupTests() {
  // Create test directories
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  
  // Create test files
  await createTestDOCX('simple.docx', 'This is a simple test document with some content.');
  await createMultiPageDOCX('multipage.docx');
  await createCorruptedDOCX('corrupted.docx');
  
  console.log('Test environment setup complete');
}

/**
 * Cleanup test environment
 */
async function cleanupTests() {
  try {
    // Remove test directories
    await fs.rmdir(TEST_DATA_DIR, { recursive: true });
    await fs.rmdir(TEST_OUTPUT_DIR, { recursive: true });
    console.log('Test environment cleanup complete');
  } catch (error) {
    console.warn('Cleanup warning:', error.message);
  }
}

/**
 * Test DOCXService class
 */
async function testDOCXService() {
  console.log('\n=== Testing DOCXService ===');
  
  const docxService = getDOCXService();
  
  // Test service instance
  console.log('✓ DOCXService instance created');
  
  // Test parsing
  try {
    const simplePath = path.join(TEST_DATA_DIR, 'simple.docx');
    const docInfo = await docxService.parseDOCX(simplePath);
    
    console.log('✓ DOCX parsing successful');
    console.log(`  - File: ${docInfo.fileName}`);
    console.log(`  - Size: ${docInfo.fileSize} bytes`);
    console.log(`  - Word count: ${docInfo.getWordCount()}`);
    console.log(`  - Character count: ${docInfo.getCharacterCount()}`);
    
  } catch (error) {
    console.error('✗ DOCX parsing failed:', error.message);
  }
  
  // Test text extraction
  try {
    const simplePath = path.join(TEST_DATA_DIR, 'simple.docx');
    const text = await docxService.extractText(simplePath);
    
    console.log('✓ Text extraction successful');
    console.log(`  - Extracted text: "${text.substring(0, 50)}..."`);
    
  } catch (error) {
    console.error('✗ Text extraction failed:', error.message);
  }
  
  // Test conversion
  try {
    const simplePath = path.join(TEST_DATA_DIR, 'simple.docx');
    const outputPath = path.join(TEST_OUTPUT_DIR, 'simple.html');
    const result = await docxService.convertDOCX(simplePath, outputPath, { format: 'html' });
    
    console.log('✓ DOCX conversion successful');
    console.log(`  - Output: ${result.outputPath}`);
    console.log(`  - Format: ${result.format}`);
    
  } catch (error) {
    console.error('✗ DOCX conversion failed:', error.message);
  }
  
  // Test statistics
  const stats = docxService.getStatistics();
  console.log('✓ Statistics retrieved');
  console.log(`  - Total operations: ${stats.totalOperations}`);
  console.log(`  - Cache hits: ${stats.cacheHits}`);
}

/**
 * Test DOCX wrapper functions
 */
async function testDOCXWrapper() {
  console.log('\n=== Testing DOCX Wrapper Functions ===');
  
  // Test parseDOCX
  try {
    const simplePath = path.join(TEST_DATA_DIR, 'simple.docx');
    const result = await parseDOCX(simplePath);
    
    if (result.success) {
      console.log('✓ parseDOCX successful');
      console.log(`  - Word count: ${result.data.wordCount}`);
      console.log(`  - Has images: ${result.data.hasImages}`);
    } else {
      console.error('✗ parseDOCX failed:', result.error);
    }
    
  } catch (error) {
    console.error('✗ parseDOCX exception:', error.message);
  }
  
  // Test extractTextFromDOCX
  try {
    const simplePath = path.join(TEST_DATA_DIR, 'simple.docx');
    const result = await extractTextFromDOCX(simplePath);
    
    if (result.success) {
      console.log('✓ extractTextFromDOCX successful');
      console.log(`  - Text length: ${result.data.text.length}`);
      console.log(`  - Word count: ${result.data.wordCount}`);
    } else {
      console.error('✗ extractTextFromDOCX failed:', result.error);
    }
    
  } catch (error) {
    console.error('✗ extractTextFromDOCX exception:', error.message);
  }
  
  // Test convertDOCXToHTML
  try {
    const simplePath = path.join(TEST_DATA_DIR, 'simple.docx');
    const outputPath = path.join(TEST_OUTPUT_DIR, 'wrapper-test.html');
    const result = await convertDOCXToHTML(simplePath, outputPath);
    
    if (result.success) {
      console.log('✓ convertDOCXToHTML successful');
      console.log(`  - Output: ${result.data.outputPath}`);
    } else {
      console.error('✗ convertDOCXToHTML failed:', result.error);
    }
    
  } catch (error) {
    console.error('✗ convertDOCXToHTML exception:', error.message);
  }
  
  // Test validateDOCX
  try {
    const simplePath = path.join(TEST_DATA_DIR, 'simple.docx');
    const result = await validateDOCX(simplePath);
    
    console.log('✓ validateDOCX completed');
    console.log(`  - Valid: ${result.data.isValid}`);
    console.log(`  - Errors: ${result.data.errors.length}`);
    
  } catch (error) {
    console.error('✗ validateDOCX exception:', error.message);
  }
  
  // Test with corrupted file
  try {
    const corruptedPath = path.join(TEST_DATA_DIR, 'corrupted.docx');
    const result = await validateDOCX(corruptedPath);
    
    console.log('✓ validateDOCX with corrupted file completed');
    console.log(`  - Valid: ${result.data.isValid}`);
    console.log(`  - Errors: ${result.data.errors.length}`);
    
  } catch (error) {
    console.error('✗ validateDOCX with corrupted file exception:', error.message);
  }
}

/**
 * Test DOCX error handling
 */
async function testDOCXErrorHandler() {
  console.log('\n=== Testing DOCX Error Handler ===');
  
  const errorHandler = getDOCXErrorHandler();
  
  // Test error classification
  try {
    const fileError = new Error('ENOENT: no such file or directory');
    const result = await errorHandler.handleError(fileError, {
      filePath: '/nonexistent/file.docx',
      operation: 'parse'
    });
    
    console.log('✓ File error handling completed');
    console.log(`  - Error type: ${result.error.type}`);
    console.log(`  - Recoverable: ${result.error.recoverable}`);
    console.log(`  - Suggested strategy: ${result.error.suggestedStrategy}`);
    
  } catch (error) {
    console.error('✗ Error handling failed:', error.message);
  }
  
  // Test format error
  try {
    const formatError = new Error('Invalid DOCX format: corrupted file');
    const result = await errorHandler.handleError(formatError, {
      filePath: path.join(TEST_DATA_DIR, 'corrupted.docx'),
      operation: 'parse'
    });
    
    console.log('✓ Format error handling completed');
    console.log(`  - Error type: ${result.error.type}`);
    console.log(`  - Severity: ${result.error.severity}`);
    
  } catch (error) {
    console.error('✗ Format error handling failed:', error.message);
  }
  
  // Test statistics
  const stats = errorHandler.getStatistics();
  console.log('✓ Error statistics retrieved');
  console.log(`  - Total errors: ${stats.totalErrors}`);
  console.log(`  - Recovery attempts: ${stats.recoveryAttempts}`);
  console.log(`  - Success rate: ${stats.recoverySuccessRate}`);
}

/**
 * Test batch operations
 */
async function testBatchOperations() {
  console.log('\n=== Testing Batch Operations ===');
  
  try {
    const inputFiles = [
      path.join(TEST_DATA_DIR, 'simple.docx'),
      path.join(TEST_DATA_DIR, 'multipage.docx')
    ];
    
    const result = await batchConvertDOCX(
      inputFiles,
      TEST_OUTPUT_DIR,
      'html',
      { preserveFormatting: true }
    );
    
    if (result.success) {
      console.log('✓ Batch conversion successful');
      console.log(`  - Total files: ${result.data.totalFiles}`);
      console.log(`  - Successful: ${result.data.successfulConversions}`);
      console.log(`  - Failed: ${result.data.failedConversions}`);
    } else {
      console.error('✗ Batch conversion failed:', result.error);
    }
    
  } catch (error) {
    console.error('✗ Batch conversion exception:', error.message);
  }
}

/**
 * Test performance
 */
async function testPerformance() {
  console.log('\n=== Testing Performance ===');
  
  const iterations = 5;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();
    
    try {
      const simplePath = path.join(TEST_DATA_DIR, 'simple.docx');
      await parseDOCX(simplePath);
      
      const endTime = Date.now();
      times.push(endTime - startTime);
      
    } catch (error) {
      console.error(`✗ Performance test iteration ${i + 1} failed:`, error.message);
    }
  }
  
  if (times.length > 0) {
    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    console.log('✓ Performance test completed');
    console.log(`  - Iterations: ${times.length}`);
    console.log(`  - Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`  - Min time: ${minTime}ms`);
    console.log(`  - Max time: ${maxTime}ms`);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting DOCX Service Tests...');
  
  try {
    // Setup
    await setupTests();
    
    // Run tests
    await testDOCXService();
    await testDOCXWrapper();
    await testDOCXErrorHandler();
    await testBatchOperations();
    await testPerformance();
    
    console.log('\n=== Test Summary ===');
    console.log('All DOCX service tests completed!');
    
  } catch (error) {
    console.error('Test suite failed:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    await cleanupTests();
  }
}

// Export test functions for individual testing
module.exports = {
  setupTests,
  cleanupTests,
  testDOCXService,
  testDOCXWrapper,
  testDOCXErrorHandler,
  testBatchOperations,
  testPerformance,
  runAllTests,
  createTestDOCX,
  createMultiPageDOCX,
  createCorruptedDOCX
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}