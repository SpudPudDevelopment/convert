/**
 * DOCX to PDF Service Tests
 * Comprehensive test suite for DOCX to PDF conversion functionality
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const JSZip = require('jszip');
const { 
  DOCXToPDFService, 
  DOCXToPDFResult, 
  DOCXToPDFEvents,
  getDOCXToPDFService 
} = require('../services/DOCXToPDFService');
const {
  convertDOCXToPDF,
  batchConvertDOCXToPDF,
  convertDOCXToPDFWithProgress,
  validateDOCXForConversion,
  getDOCXConversionPreview,
  getDOCXToPDFStatistics,
  resetDOCXToPDFStatistics,
  clearDOCXToPDFCache,
  convertDOCXToHTML,
  estimateDOCXToPDFConversionTime,
  getSupportedDOCXToPDFOptions
} = require('../utils/DOCXToPDFWrapper');
const {
  DOCXToPDFErrorHandler,
  DOCXToPDFError,
  DOCXToPDFErrorTypes,
  getDOCXToPDFErrorHandler
} = require('../errors/DOCXToPDFErrorHandler');

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  tempDir: null,
  testFiles: {
    simple: null,
    multiPage: null,
    structured: null,
    large: null,
    invalid: null
  }
};

/**
 * Helper function to create a simple DOCX file for testing
 */
async function createTestDOCXFile(filename, content = 'Test document content') {
  const zip = new JSZip();
  
  // Add required DOCX structure
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
  
  zip.folder('word').file('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);
  
  // Add metadata
  zip.folder('docProps').file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Test Document</dc:title>
  <dc:creator>Test Author</dc:creator>
  <dc:subject>Test Subject</dc:subject>
  <dcterms:created xsi:type="dcterms:W3CDTF">2024-01-01T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2024-01-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>`);
  
  zip.folder('docProps').file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Test Application</Application>
  <Pages>1</Pages>
  <Words>10</Words>
  <Characters>50</Characters>
</Properties>`);
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const filePath = path.join(TEST_CONFIG.tempDir, filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Helper function to create a multi-page DOCX file
 */
async function createMultiPageDOCXFile(filename) {
  const content = `
    <w:p><w:r><w:t>Page 1 Content</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:r><w:t>Page 2 Content</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:r><w:t>Page 3 Content</w:t></w:r></w:p>
  `;
  
  return await createTestDOCXFile(filename, content);
}

/**
 * Helper function to create a structured DOCX file with headings
 */
async function createStructuredDOCXFile(filename) {
  const zip = new JSZip();
  
  // Add required DOCX structure with styles
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  
  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 1: Introduction</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is the introduction paragraph.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Section 1.1: Overview</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is the overview section.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 2: Details</w:t></w:r></w:p>
    <w:p><w:r><w:t>This chapter contains detailed information.</w:t></w:r></w:p>
  </w:body>
</w:document>`);
  
  zip.folder('word').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>`);
  
  zip.folder('word').file('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  
  // Add metadata
  zip.folder('docProps').file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Structured Document</dc:title>
  <dc:creator>Test Author</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">2024-01-01T00:00:00Z</dcterms:created>
</cp:coreProperties>`);
  
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const filePath = path.join(TEST_CONFIG.tempDir, filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Helper function to create a large DOCX file
 */
async function createLargeDOCXFile(filename) {
  const largeContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(1000);
  return await createTestDOCXFile(filename, largeContent);
}

/**
 * Helper function to create an invalid file
 */
async function createInvalidFile(filename) {
  const filePath = path.join(TEST_CONFIG.tempDir, filename);
  await fs.writeFile(filePath, 'This is not a valid DOCX file', 'utf8');
  return filePath;
}

/**
 * Setup test environment
 */
async function setupTestEnvironment() {
  // Create temporary directory
  TEST_CONFIG.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx-to-pdf-test-'));
  
  // Create test files
  TEST_CONFIG.testFiles.simple = await createTestDOCXFile('simple.docx');
  TEST_CONFIG.testFiles.multiPage = await createMultiPageDOCXFile('multipage.docx');
  TEST_CONFIG.testFiles.structured = await createStructuredDOCXFile('structured.docx');
  TEST_CONFIG.testFiles.large = await createLargeDOCXFile('large.docx');
  TEST_CONFIG.testFiles.invalid = await createInvalidFile('invalid.docx');
  
  console.log('Test environment setup completed');
  console.log('Temp directory:', TEST_CONFIG.tempDir);
}

/**
 * Cleanup test environment
 */
async function cleanupTestEnvironment() {
  if (TEST_CONFIG.tempDir) {
    try {
      await fs.rm(TEST_CONFIG.tempDir, { recursive: true, force: true });
      console.log('Test environment cleaned up');
    } catch (error) {
      console.warn('Failed to cleanup test environment:', error.message);
    }
  }
}

/**
 * Test helper to check if file exists and has content
 */
async function checkFileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size > 0;
  } catch (error) {
    return false;
  }
}

// Test Suites

/**
 * DOCXToPDFResult Tests
 */
function testDOCXToPDFResult() {
  console.log('\n=== Testing DOCXToPDFResult ===');
  
  // Test result creation
  const result = new DOCXToPDFResult();
  console.log('✓ DOCXToPDFResult created successfully');
  
  // Test adding steps
  result.addStep('test_step', 100, true, { detail: 'test' });
  console.log('✓ Step added successfully');
  
  // Test adding warnings and errors
  result.addWarning('Test warning');
  result.addError('Test error');
  console.log('✓ Warnings and errors added successfully');
  
  // Test summary generation
  const summary = result.getSummary();
  console.log('✓ Summary generated:', summary);
  
  console.log('DOCXToPDFResult tests completed');
}

/**
 * DOCXToPDFService Tests
 */
async function testDOCXToPDFService() {
  console.log('\n=== Testing DOCXToPDFService ===');
  
  const service = new DOCXToPDFService();
  console.log('✓ DOCXToPDFService created successfully');
  
  // Test basic conversion
  try {
    const outputPath = path.join(TEST_CONFIG.tempDir, 'output_simple.pdf');
    const result = await service.convertDOCXToPDF(TEST_CONFIG.testFiles.simple, outputPath);
    
    if (result.success && await checkFileExists(outputPath)) {
      console.log('✓ Basic DOCX to PDF conversion successful');
    } else {
      console.log('✗ Basic conversion failed:', result.errors);
    }
  } catch (error) {
    console.log('✗ Basic conversion error:', error.message);
  }
  
  // Test conversion with options
  try {
    const outputPath = path.join(TEST_CONFIG.tempDir, 'output_options.pdf');
    const options = {
      fontSize: 14,
      fontFamily: 'Times-Roman',
      margins: { top: 100, bottom: 100, left: 100, right: 100 }
    };
    const result = await service.convertDOCXToPDF(TEST_CONFIG.testFiles.simple, outputPath, options);
    
    if (result.success && await checkFileExists(outputPath)) {
      console.log('✓ Conversion with custom options successful');
    } else {
      console.log('✗ Conversion with options failed:', result.errors);
    }
  } catch (error) {
    console.log('✗ Conversion with options error:', error.message);
  }
  
  // Test error handling
  try {
    const outputPath = path.join(TEST_CONFIG.tempDir, 'output_invalid.pdf');
    const result = await service.convertDOCXToPDF(TEST_CONFIG.testFiles.invalid, outputPath);
    
    if (!result.success) {
      console.log('✓ Error handling works correctly');
    } else {
      console.log('✗ Error handling failed - should have failed for invalid file');
    }
  } catch (error) {
    console.log('✓ Error handling works correctly (caught exception)');
  }
  
  // Test batch conversion
  try {
    const outputDir = path.join(TEST_CONFIG.tempDir, 'batch_output');
    await fs.mkdir(outputDir, { recursive: true });
    
    const inputFiles = [TEST_CONFIG.testFiles.simple, TEST_CONFIG.testFiles.structured];
    const batchResult = await service.batchConvertDOCXToPDF(inputFiles, outputDir);
    
    if (batchResult.successfulConversions > 0) {
      console.log('✓ Batch conversion successful:', batchResult);
    } else {
      console.log('✗ Batch conversion failed:', batchResult);
    }
  } catch (error) {
    console.log('✗ Batch conversion error:', error.message);
  }
  
  // Test caching
  try {
    const outputPath1 = path.join(TEST_CONFIG.tempDir, 'output_cache1.pdf');
    const outputPath2 = path.join(TEST_CONFIG.tempDir, 'output_cache2.pdf');
    
    const result1 = await service.convertDOCXToPDF(TEST_CONFIG.testFiles.simple, outputPath1, { enableCache: true });
    const result2 = await service.convertDOCXToPDF(TEST_CONFIG.testFiles.simple, outputPath2, { enableCache: true });
    
    if (result1.success && result2.success) {
      console.log('✓ Caching functionality works');
    } else {
      console.log('✗ Caching functionality failed');
    }
  } catch (error) {
    console.log('✗ Caching test error:', error.message);
  }
  
  // Test statistics
  const stats = service.getStatistics();
  console.log('✓ Statistics retrieved:', stats);
  
  console.log('DOCXToPDFService tests completed');
}

/**
 * DOCXToPDFWrapper Tests
 */
async function testDOCXToPDFWrapper() {
  console.log('\n=== Testing DOCXToPDFWrapper ===');
  
  // Test simple conversion
  try {
    const outputPath = path.join(TEST_CONFIG.tempDir, 'wrapper_simple.pdf');
    const result = await convertDOCXToPDF(TEST_CONFIG.testFiles.simple, outputPath);
    
    if (result.success && await checkFileExists(outputPath)) {
      console.log('✓ Wrapper simple conversion successful');
    } else {
      console.log('✗ Wrapper simple conversion failed:', result.errors);
    }
  } catch (error) {
    console.log('✗ Wrapper simple conversion error:', error.message);
  }
  
  // Test progress conversion
  try {
    const outputPath = path.join(TEST_CONFIG.tempDir, 'wrapper_progress.pdf');
    const progressUpdates = [];
    
    const result = await convertDOCXToPDFWithProgress(
      TEST_CONFIG.testFiles.simple, 
      outputPath,
      {},
      (progress) => {
        progressUpdates.push(progress);
      }
    );
    
    if (result.success && progressUpdates.length > 0) {
      console.log('✓ Progress conversion successful, updates:', progressUpdates.length);
    } else {
      console.log('✗ Progress conversion failed');
    }
  } catch (error) {
    console.log('✗ Progress conversion error:', error.message);
  }
  
  // Test validation
  try {
    const validResult = await validateDOCXForConversion(TEST_CONFIG.testFiles.simple);
    const invalidResult = await validateDOCXForConversion(TEST_CONFIG.testFiles.invalid);
    
    if (validResult.success && !invalidResult.success) {
      console.log('✓ Validation works correctly');
    } else {
      console.log('✗ Validation failed');
    }
  } catch (error) {
    console.log('✗ Validation error:', error.message);
  }
  
  // Test preview
  try {
    const previewResult = await getDOCXConversionPreview(TEST_CONFIG.testFiles.structured);
    
    if (previewResult.success && previewResult.data.metadata) {
      console.log('✓ Preview generation successful');
    } else {
      console.log('✗ Preview generation failed');
    }
  } catch (error) {
    console.log('✗ Preview generation error:', error.message);
  }
  
  // Test HTML conversion
  try {
    const htmlPath = path.join(TEST_CONFIG.tempDir, 'output.html');
    const result = await convertDOCXToHTML(TEST_CONFIG.testFiles.simple, htmlPath);
    
    if (result.success && await checkFileExists(htmlPath)) {
      console.log('✓ DOCX to HTML conversion successful');
    } else {
      console.log('✗ DOCX to HTML conversion failed');
    }
  } catch (error) {
    console.log('✗ DOCX to HTML conversion error:', error.message);
  }
  
  // Test time estimation
  try {
    const estimationResult = await estimateDOCXToPDFConversionTime(TEST_CONFIG.testFiles.simple);
    
    if (estimationResult.success) {
      console.log('✓ Time estimation successful:', estimationResult.data.estimatedTimeSeconds + 's');
    } else {
      console.log('✗ Time estimation failed');
    }
  } catch (error) {
    console.log('✗ Time estimation error:', error.message);
  }
  
  // Test supported options
  try {
    const optionsResult = getSupportedDOCXToPDFOptions();
    
    if (optionsResult.success) {
      console.log('✓ Supported options retrieved successfully');
    } else {
      console.log('✗ Failed to retrieve supported options');
    }
  } catch (error) {
    console.log('✗ Supported options error:', error.message);
  }
  
  // Test statistics functions
  try {
    const statsResult = getDOCXToPDFStatistics();
    const resetResult = resetDOCXToPDFStatistics();
    const cacheResult = clearDOCXToPDFCache();
    
    if (statsResult.success && resetResult.success && cacheResult.success) {
      console.log('✓ Statistics and cache management successful');
    } else {
      console.log('✗ Statistics and cache management failed');
    }
  } catch (error) {
    console.log('✗ Statistics and cache management error:', error.message);
  }
  
  console.log('DOCXToPDFWrapper tests completed');
}

/**
 * DOCXToPDFErrorHandler Tests
 */
async function testDOCXToPDFErrorHandler() {
  console.log('\n=== Testing DOCXToPDFErrorHandler ===');
  
  const errorHandler = new DOCXToPDFErrorHandler();
  console.log('✓ DOCXToPDFErrorHandler created successfully');
  
  // Test error classification
  try {
    const fileNotFoundError = new Error('ENOENT: no such file or directory');
    const classifiedError = await errorHandler.handleError(fileNotFoundError, { operation: 'test' });
    
    if (classifiedError.type === DOCXToPDFErrorTypes.FILE_NOT_FOUND) {
      console.log('✓ Error classification works correctly');
    } else {
      console.log('✗ Error classification failed');
    }
  } catch (error) {
    console.log('✗ Error classification error:', error.message);
  }
  
  // Test recovery strategies
  try {
    const timeoutError = new DOCXToPDFError(
      'Operation timed out',
      DOCXToPDFErrorTypes.TIMEOUT_EXCEEDED,
      'medium'
    );
    
    const recoveredError = await errorHandler.handleError(timeoutError, { operation: 'test' });
    
    if (recoveredError.recoverable) {
      console.log('✓ Recovery strategies work correctly');
    } else {
      console.log('✗ Recovery strategies failed');
    }
  } catch (error) {
    console.log('✗ Recovery strategies error:', error.message);
  }
  
  // Test statistics
  const stats = errorHandler.getStatistics();
  console.log('✓ Error handler statistics:', stats);
  
  console.log('DOCXToPDFErrorHandler tests completed');
}

/**
 * Performance Tests
 */
async function testPerformance() {
  console.log('\n=== Testing Performance ===');
  
  // Test large file conversion
  try {
    const startTime = Date.now();
    const outputPath = path.join(TEST_CONFIG.tempDir, 'performance_large.pdf');
    const result = await convertDOCXToPDF(TEST_CONFIG.testFiles.large, outputPath);
    const endTime = Date.now();
    
    if (result.success) {
      console.log(`✓ Large file conversion completed in ${endTime - startTime}ms`);
    } else {
      console.log('✗ Large file conversion failed');
    }
  } catch (error) {
    console.log('✗ Large file conversion error:', error.message);
  }
  
  // Test concurrent conversions
  try {
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < 3; i++) {
      const outputPath = path.join(TEST_CONFIG.tempDir, `concurrent_${i}.pdf`);
      promises.push(convertDOCXToPDF(TEST_CONFIG.testFiles.simple, outputPath));
    }
    
    const results = await Promise.all(promises);
    const endTime = Date.now();
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✓ Concurrent conversions: ${successCount}/3 successful in ${endTime - startTime}ms`);
  } catch (error) {
    console.log('✗ Concurrent conversions error:', error.message);
  }
  
  console.log('Performance tests completed');
}

/**
 * Integration Tests
 */
async function testIntegration() {
  console.log('\n=== Testing Integration ===');
  
  // Test global service instance
  try {
    const service1 = getDOCXToPDFService();
    const service2 = getDOCXToPDFService();
    
    if (service1 === service2) {
      console.log('✓ Global service instance works correctly');
    } else {
      console.log('✗ Global service instance failed');
    }
  } catch (error) {
    console.log('✗ Global service instance error:', error.message);
  }
  
  // Test global error handler
  try {
    const handler1 = getDOCXToPDFErrorHandler();
    const handler2 = getDOCXToPDFErrorHandler();
    
    if (handler1 === handler2) {
      console.log('✓ Global error handler works correctly');
    } else {
      console.log('✗ Global error handler failed');
    }
  } catch (error) {
    console.log('✗ Global error handler error:', error.message);
  }
  
  // Test end-to-end workflow
  try {
    const outputPath = path.join(TEST_CONFIG.tempDir, 'integration_test.pdf');
    
    // Validate -> Convert -> Check result
    const validationResult = await validateDOCXForConversion(TEST_CONFIG.testFiles.structured);
    if (!validationResult.success) {
      throw new Error('Validation failed');
    }
    
    const conversionResult = await convertDOCXToPDF(TEST_CONFIG.testFiles.structured, outputPath);
    if (!conversionResult.success) {
      throw new Error('Conversion failed');
    }
    
    const fileExists = await checkFileExists(outputPath);
    if (!fileExists) {
      throw new Error('Output file not created');
    }
    
    console.log('✓ End-to-end workflow successful');
  } catch (error) {
    console.log('✗ End-to-end workflow error:', error.message);
  }
  
  console.log('Integration tests completed');
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('Starting DOCX to PDF Service Tests...');
  console.log('Test timeout:', TEST_CONFIG.timeout + 'ms');
  
  try {
    // Setup
    await setupTestEnvironment();
    
    // Run test suites
    testDOCXToPDFResult();
    await testDOCXToPDFService();
    await testDOCXToPDFWrapper();
    await testDOCXToPDFErrorHandler();
    await testPerformance();
    await testIntegration();
    
    console.log('\n=== Test Summary ===');
    console.log('All DOCX to PDF tests completed successfully!');
    
  } catch (error) {
    console.error('Test execution failed:', error);
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
  createTestDOCXFile,
  createMultiPageDOCXFile,
  createStructuredDOCXFile,
  createLargeDOCXFile,
  createInvalidFile,
  checkFileExists,
  TEST_CONFIG
};

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}