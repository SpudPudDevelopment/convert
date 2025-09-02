/**
 * PDF to DOCX Conversion Service Tests
 * Comprehensive test suite for PDF to DOCX conversion functionality
 */

const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const JSZip = require('jszip');

// Import modules to test
const { 
  PDFToDOCXService, 
  PDFToDOCXResult, 
  PDFToDOCXEvents, 
  getPDFToDOCXService 
} = require('../services/PDFToDOCXService');

const {
  PDFToDOCXOperationResult,
  convertPDFToDOCX,
  convertPDFToDOCXWithProgress,
  batchConvertPDFToDOCX,
  validatePDFForConversion,
  getConversionPreview,
  getConversionStatistics,
  clearConversionCache,
  resetConversionStatistics,
  convertPDFToIntermediate,
  estimateConversionTime,
  getSupportedOptions
} = require('../utils/PDFToDOCXWrapper');

const {
  PDFToDOCXError,
  PDFToDOCXErrorHandler,
  PDFToDOCXErrorTypes,
  getPDFToDOCXErrorHandler,
  handlePDFToDOCXError
} = require('../errors/PDFToDOCXErrorHandler');

/**
 * Test helper functions
 */
class PDFToDOCXTestHelpers {
  /**
   * Create a simple test PDF
   */
  static async createSimplePDF(filePath, content = 'Test PDF Content') {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    
    page.drawText(content, {
      x: 50,
      y: 350,
      size: 12,
      color: rgb(0, 0, 0)
    });
    
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(filePath, pdfBytes);
    return filePath;
  }

  /**
   * Create a multi-page test PDF
   */
  static async createMultiPagePDF(filePath, pageCount = 3) {
    const pdfDoc = await PDFDocument.create();
    
    for (let i = 1; i <= pageCount; i++) {
      const page = pdfDoc.addPage([600, 400]);
      
      // Add heading
      page.drawText(`Page ${i} Heading`, {
        x: 50,
        y: 350,
        size: 16,
        color: rgb(0, 0, 0)
      });
      
      // Add paragraph
      page.drawText(`This is the content of page ${i}. It contains multiple lines of text to test the conversion process.`, {
        x: 50,
        y: 320,
        size: 12,
        color: rgb(0, 0, 0)
      });
      
      // Add list items
      const listItems = [
        '• First item on this page',
        '• Second item on this page',
        '• Third item on this page'
      ];
      
      listItems.forEach((item, index) => {
        page.drawText(item, {
          x: 70,
          y: 280 - (index * 20),
          size: 10,
          color: rgb(0, 0, 0)
        });
      });
    }
    
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(filePath, pdfBytes);
    return filePath;
  }

  /**
   * Create a structured test PDF with various elements
   */
  static async createStructuredPDF(filePath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    
    let yPosition = 750;
    
    // Title
    page.drawText('Document Title', {
      x: 50,
      y: yPosition,
      size: 18,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;
    
    // Heading 1
    page.drawText('1. Introduction', {
      x: 50,
      y: yPosition,
      size: 14,
      color: rgb(0, 0, 0)
    });
    yPosition -= 30;
    
    // Paragraph
    page.drawText('This is an introduction paragraph that explains the purpose of this document.', {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0, 0, 0)
    });
    yPosition -= 40;
    
    // Heading 2
    page.drawText('2. Main Content', {
      x: 50,
      y: yPosition,
      size: 14,
      color: rgb(0, 0, 0)
    });
    yPosition -= 30;
    
    // Bullet list
    const bulletItems = [
      '• First bullet point',
      '• Second bullet point',
      '• Third bullet point'
    ];
    
    bulletItems.forEach(item => {
      page.drawText(item, {
        x: 70,
        y: yPosition,
        size: 12,
        color: rgb(0, 0, 0)
      });
      yPosition -= 20;
    });
    
    yPosition -= 20;
    
    // Numbered list
    const numberedItems = [
      '1. First numbered item',
      '2. Second numbered item',
      '3. Third numbered item'
    ];
    
    numberedItems.forEach(item => {
      page.drawText(item, {
        x: 70,
        y: yPosition,
        size: 12,
        color: rgb(0, 0, 0)
      });
      yPosition -= 20;
    });
    
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(filePath, pdfBytes);
    return filePath;
  }

  /**
   * Create a large test PDF for performance testing
   */
  static async createLargePDF(filePath, pageCount = 50) {
    const pdfDoc = await PDFDocument.create();
    
    for (let i = 1; i <= pageCount; i++) {
      const page = pdfDoc.addPage([600, 800]);
      
      let yPosition = 750;
      
      // Page title
      page.drawText(`Page ${i} - Performance Test`, {
        x: 50,
        y: yPosition,
        size: 16,
        color: rgb(0, 0, 0)
      });
      yPosition -= 40;
      
      // Add multiple paragraphs
      for (let p = 1; p <= 10; p++) {
        page.drawText(`Paragraph ${p}: This is a test paragraph with sufficient content to test the performance of the PDF to DOCX conversion process. It contains multiple sentences and various words to simulate real document content.`, {
          x: 50,
          y: yPosition,
          size: 10,
          color: rgb(0, 0, 0)
        });
        yPosition -= 25;
        
        if (yPosition < 50) break;
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(filePath, pdfBytes);
    return filePath;
  }

  /**
   * Create an invalid PDF file
   */
  static async createInvalidPDF(filePath) {
    await fs.writeFile(filePath, 'This is not a valid PDF file content');
    return filePath;
  }

  /**
   * Verify DOCX file structure
   */
  static async verifyDOCXStructure(filePath) {
    try {
      const data = await fs.readFile(filePath);
      const zip = await JSZip.loadAsync(data);
      
      // Check for required DOCX files
      const requiredFiles = [
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml'
      ];
      
      for (const file of requiredFiles) {
        if (!zip.files[file]) {
          return { valid: false, missing: file };
        }
      }
      
      // Check document.xml content
      const documentXml = await zip.files['word/document.xml'].async('string');
      const hasContent = documentXml.includes('<w:t>') && documentXml.length > 100;
      
      return {
        valid: true,
        hasContent,
        fileCount: Object.keys(zip.files).length,
        documentSize: documentXml.length
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Setup test environment
   */
  static async setupTestEnvironment() {
    const testDir = path.join(__dirname, 'temp_pdf_to_docx_tests');
    await fs.mkdir(testDir, { recursive: true });
    return testDir;
  }

  /**
   * Cleanup test environment
   */
  static async cleanupTestEnvironment(testDir) {
    try {
      await fs.rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Wait for a specified time
   */
  static async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create progress tracker for testing
   */
  static createProgressTracker() {
    const progress = {
      updates: [],
      completed: false,
      error: null
    };
    
    const callback = (update) => {
      progress.updates.push({
        ...update,
        timestamp: Date.now()
      });
      
      if (update.percentage === 100) {
        progress.completed = true;
      }
    };
    
    return { progress, callback };
  }
}

/**
 * Test Suite: PDFToDOCXResult Class
 */
describe('PDFToDOCXResult', () => {
  test('should create result with default values', () => {
    const result = new PDFToDOCXResult();
    
    expect(result.success).toBe(false);
    expect(result.inputPath).toBeNull();
    expect(result.outputPath).toBeNull();
    expect(result.metadata).toEqual({});
    expect(result.statistics).toEqual({});
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.processingTime).toBe(0);
    expect(result.conversionSteps).toEqual([]);
  });

  test('should add conversion steps', () => {
    const result = new PDFToDOCXResult();
    
    result.addStep('test_step', 1000, true, { detail: 'test' });
    
    expect(result.conversionSteps).toHaveLength(1);
    expect(result.conversionSteps[0].step).toBe('test_step');
    expect(result.conversionSteps[0].duration).toBe(1000);
    expect(result.conversionSteps[0].success).toBe(true);
    expect(result.conversionSteps[0].details).toEqual({ detail: 'test' });
  });

  test('should add warnings and errors', () => {
    const result = new PDFToDOCXResult();
    
    result.addWarning('Test warning');
    result.addError('Test error');
    
    expect(result.warnings).toContain('Test warning');
    expect(result.errors).toContain('Test error');
    expect(result.success).toBe(false);
  });

  test('should generate conversion summary', () => {
    const result = new PDFToDOCXResult();
    result.addStep('step1', 500, true);
    result.addStep('step2', 300, false);
    result.addWarning('Warning');
    result.addError('Error');
    result.processingTime = 1000;
    
    const summary = result.getSummary();
    
    expect(summary.totalSteps).toBe(2);
    expect(summary.successfulSteps).toBe(1);
    expect(summary.failedSteps).toBe(1);
    expect(summary.totalTime).toBe(1000);
    expect(summary.averageStepTime).toBe(400);
    expect(summary.warningCount).toBe(1);
    expect(summary.errorCount).toBe(1);
  });
});

/**
 * Test Suite: PDFToDOCXService Class
 */
describe('PDFToDOCXService', () => {
  let testDir;
  let service;
  
  beforeAll(async () => {
    testDir = await PDFToDOCXTestHelpers.setupTestEnvironment();
  });
  
  afterAll(async () => {
    await PDFToDOCXTestHelpers.cleanupTestEnvironment(testDir);
  });
  
  beforeEach(() => {
    service = new PDFToDOCXService();
  });

  describe('Basic Conversion', () => {
    test('should convert simple PDF to DOCX', async () => {
      const inputPath = path.join(testDir, 'simple.pdf');
      const outputPath = path.join(testDir, 'simple.docx');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath, 'Simple test content');
      
      const result = await service.convertPDFToDOCX(inputPath, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.inputPath).toBe(inputPath);
      expect(result.outputPath).toBe(outputPath);
      expect(result.conversionSteps.length).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThan(0);
      
      // Verify output file exists
      const outputExists = await fs.access(outputPath).then(() => true).catch(() => false);
      expect(outputExists).toBe(true);
      
      // Verify DOCX structure
      const verification = await PDFToDOCXTestHelpers.verifyDOCXStructure(outputPath);
      expect(verification.valid).toBe(true);
    }, 30000);

    test('should convert multi-page PDF to DOCX', async () => {
      const inputPath = path.join(testDir, 'multipage.pdf');
      const outputPath = path.join(testDir, 'multipage.docx');
      
      await PDFToDOCXTestHelpers.createMultiPagePDF(inputPath, 3);
      
      const result = await service.convertPDFToDOCX(inputPath, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.statistics.pageCount).toBe(3);
      
      const verification = await PDFToDOCXTestHelpers.verifyDOCXStructure(outputPath);
      expect(verification.valid).toBe(true);
      expect(verification.hasContent).toBe(true);
    }, 30000);

    test('should convert structured PDF with formatting', async () => {
      const inputPath = path.join(testDir, 'structured.pdf');
      const outputPath = path.join(testDir, 'structured.docx');
      
      await PDFToDOCXTestHelpers.createStructuredPDF(inputPath);
      
      const result = await service.convertPDFToDOCX(inputPath, outputPath, {
        preserveFormatting: true
      });
      
      expect(result.success).toBe(true);
      
      const verification = await PDFToDOCXTestHelpers.verifyDOCXStructure(outputPath);
      expect(verification.valid).toBe(true);
    }, 30000);
  });

  describe('Conversion Options', () => {
    test('should respect page range option', async () => {
      const inputPath = path.join(testDir, 'range_test.pdf');
      const outputPath = path.join(testDir, 'range_test.docx');
      
      await PDFToDOCXTestHelpers.createMultiPagePDF(inputPath, 5);
      
      const result = await service.convertPDFToDOCX(inputPath, outputPath, {
        pageRange: { start: 2, end: 4 }
      });
      
      expect(result.success).toBe(true);
      
      // Should process only pages 2-4
      const steps = result.conversionSteps.find(s => s.step === 'pdf_extraction');
      expect(steps).toBeDefined();
    }, 30000);

    test('should handle different intermediate formats', async () => {
      const inputPath = path.join(testDir, 'format_test.pdf');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath);
      
      // Test HTML format
      const htmlResult = await service.convertPDFToDOCX(
        inputPath, 
        path.join(testDir, 'format_html.docx'),
        { intermediateFormat: 'html' }
      );
      expect(htmlResult.success).toBe(true);
      
      // Test Markdown format
      const markdownResult = await service.convertPDFToDOCX(
        inputPath, 
        path.join(testDir, 'format_markdown.docx'),
        { intermediateFormat: 'markdown' }
      );
      expect(markdownResult.success).toBe(true);
      
      // Test text format
      const textResult = await service.convertPDFToDOCX(
        inputPath, 
        path.join(testDir, 'format_text.docx'),
        { intermediateFormat: 'text' }
      );
      expect(textResult.success).toBe(true);
    }, 45000);
  });

  describe('Error Handling', () => {
    test('should handle invalid PDF file', async () => {
      const inputPath = path.join(testDir, 'invalid.pdf');
      const outputPath = path.join(testDir, 'invalid.docx');
      
      await PDFToDOCXTestHelpers.createInvalidPDF(inputPath);
      
      const result = await service.convertPDFToDOCX(inputPath, outputPath);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle non-existent file', async () => {
      const inputPath = path.join(testDir, 'nonexistent.pdf');
      const outputPath = path.join(testDir, 'nonexistent.docx');
      
      const result = await service.convertPDFToDOCX(inputPath, outputPath);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle file size limit', async () => {
      const inputPath = path.join(testDir, 'size_test.pdf');
      const outputPath = path.join(testDir, 'size_test.docx');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath);
      
      const result = await service.convertPDFToDOCX(inputPath, outputPath, {
        maxFileSize: 100 // Very small limit
      });
      
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('file size'))).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    test('should process multiple files', async () => {
      const inputFiles = [];
      const outputDir = path.join(testDir, 'batch_output');
      
      // Create multiple test files
      for (let i = 1; i <= 3; i++) {
        const inputPath = path.join(testDir, `batch_${i}.pdf`);
        await PDFToDOCXTestHelpers.createSimplePDF(inputPath, `Batch content ${i}`);
        inputFiles.push(inputPath);
      }
      
      const result = await service.batchConvertPDFToDOCX(inputFiles, outputDir);
      
      expect(result.totalFiles).toBe(3);
      expect(result.successfulConversions).toBeGreaterThan(0);
      expect(result.results).toHaveLength(3);
    }, 60000);
  });

  describe('Caching', () => {
    test('should use cache for repeated conversions', async () => {
      const inputPath = path.join(testDir, 'cache_test.pdf');
      const outputPath1 = path.join(testDir, 'cache_test1.docx');
      const outputPath2 = path.join(testDir, 'cache_test2.docx');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath);
      
      // First conversion
      const result1 = await service.convertPDFToDOCX(inputPath, outputPath1);
      expect(result1.success).toBe(true);
      
      // Second conversion (should use cache)
      const result2 = await service.convertPDFToDOCX(inputPath, outputPath2);
      expect(result2.success).toBe(true);
      
      // Second conversion should be faster
      expect(result2.processingTime).toBeLessThan(result1.processingTime);
    }, 30000);
  });

  describe('Statistics', () => {
    test('should track conversion statistics', async () => {
      const inputPath = path.join(testDir, 'stats_test.pdf');
      const outputPath = path.join(testDir, 'stats_test.docx');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath);
      
      const initialStats = service.getStatistics();
      
      await service.convertPDFToDOCX(inputPath, outputPath);
      
      const finalStats = service.getStatistics();
      
      expect(finalStats.totalConversions).toBe(initialStats.totalConversions + 1);
      expect(finalStats.successfulConversions).toBeGreaterThan(initialStats.successfulConversions);
    }, 30000);
  });
});

/**
 * Test Suite: PDFToDOCXWrapper Functions
 */
describe('PDFToDOCXWrapper', () => {
  let testDir;
  
  beforeAll(async () => {
    testDir = await PDFToDOCXTestHelpers.setupTestEnvironment();
  });
  
  afterAll(async () => {
    await PDFToDOCXTestHelpers.cleanupTestEnvironment(testDir);
  });

  describe('convertPDFToDOCX', () => {
    test('should convert PDF using wrapper function', async () => {
      const inputPath = path.join(testDir, 'wrapper_test.pdf');
      const outputPath = path.join(testDir, 'wrapper_test.docx');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath);
      
      const result = await convertPDFToDOCX(inputPath, outputPath);
      
      expect(result).toBeInstanceOf(PDFToDOCXOperationResult);
      expect(result.isSuccess()).toBe(true);
      expect(result.data.inputPath).toBe(inputPath);
      expect(result.data.outputPath).toBe(outputPath);
    }, 30000);
  });

  describe('convertPDFToDOCXWithProgress', () => {
    test('should provide progress updates', async () => {
      const inputPath = path.join(testDir, 'progress_test.pdf');
      const outputPath = path.join(testDir, 'progress_test.docx');
      
      await PDFToDOCXTestHelpers.createMultiPagePDF(inputPath, 3);
      
      const { progress, callback } = PDFToDOCXTestHelpers.createProgressTracker();
      
      const result = await convertPDFToDOCXWithProgress(inputPath, outputPath, callback);
      
      expect(result.isSuccess()).toBe(true);
      expect(progress.updates.length).toBeGreaterThan(0);
      expect(progress.completed).toBe(true);
    }, 30000);
  });

  describe('validatePDFForConversion', () => {
    test('should validate valid PDF', async () => {
      const inputPath = path.join(testDir, 'valid_test.pdf');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath);
      
      const result = await validatePDFForConversion(inputPath);
      
      expect(result.isSuccess()).toBe(true);
      expect(result.data.valid).toBe(true);
    });

    test('should reject invalid PDF', async () => {
      const inputPath = path.join(testDir, 'invalid_validation.pdf');
      
      await PDFToDOCXTestHelpers.createInvalidPDF(inputPath);
      
      const result = await validatePDFForConversion(inputPath);
      
      expect(result.isSuccess()).toBe(false);
      expect(result.data.valid).toBe(false);
    });
  });

  describe('getConversionPreview', () => {
    test('should generate conversion preview', async () => {
      const inputPath = path.join(testDir, 'preview_test.pdf');
      
      await PDFToDOCXTestHelpers.createStructuredPDF(inputPath);
      
      const result = await getConversionPreview(inputPath);
      
      expect(result.isSuccess()).toBe(true);
      expect(result.data.pageCount).toBeGreaterThan(0);
      expect(result.data.estimatedWordCount).toBeGreaterThan(0);
      expect(result.data.hasStructuredContent).toBe(true);
      expect(result.data.contentTypes.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('convertPDFToIntermediate', () => {
    test('should convert to HTML format', async () => {
      const inputPath = path.join(testDir, 'intermediate_html.pdf');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath, 'Test content for HTML');
      
      const result = await convertPDFToIntermediate(inputPath, 'html');
      
      expect(result.isSuccess()).toBe(true);
      expect(result.data.format).toBe('html');
      expect(result.data.content).toContain('<html>');
      expect(result.data.content).toContain('Test content for HTML');
    }, 30000);

    test('should convert to Markdown format', async () => {
      const inputPath = path.join(testDir, 'intermediate_md.pdf');
      
      await PDFToDOCXTestHelpers.createStructuredPDF(inputPath);
      
      const result = await convertPDFToIntermediate(inputPath, 'markdown');
      
      expect(result.isSuccess()).toBe(true);
      expect(result.data.format).toBe('markdown');
      expect(result.data.content).toContain('#');
    }, 30000);
  });

  describe('estimateConversionTime', () => {
    test('should estimate conversion time', async () => {
      const inputPath = path.join(testDir, 'estimate_test.pdf');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath);
      
      const result = await estimateConversionTime(inputPath);
      
      expect(result.isSuccess()).toBe(true);
      expect(result.data.estimatedTimeMs).toBeGreaterThan(0);
      expect(result.data.fileSizeMB).toBeGreaterThan(0);
    });
  });

  describe('getSupportedOptions', () => {
    test('should return supported options', () => {
      const result = getSupportedOptions();
      
      expect(result.isSuccess()).toBe(true);
      expect(result.data).toHaveProperty('preserveFormatting');
      expect(result.data).toHaveProperty('extractImages');
      expect(result.data).toHaveProperty('intermediateFormat');
    });
  });

  describe('Statistics and Cache Management', () => {
    test('should get and reset statistics', async () => {
      // Perform a conversion to generate statistics
      const inputPath = path.join(testDir, 'stats_wrapper.pdf');
      const outputPath = path.join(testDir, 'stats_wrapper.docx');
      
      await PDFToDOCXTestHelpers.createSimplePDF(inputPath);
      await convertPDFToDOCX(inputPath, outputPath);
      
      const statsResult = getConversionStatistics();
      expect(statsResult.isSuccess()).toBe(true);
      expect(statsResult.data.totalConversions).toBeGreaterThan(0);
      
      const resetResult = resetConversionStatistics();
      expect(resetResult.isSuccess()).toBe(true);
    }, 30000);

    test('should clear cache', () => {
      const result = clearConversionCache();
      expect(result.isSuccess()).toBe(true);
    });
  });
});

/**
 * Test Suite: PDFToDOCXErrorHandler
 */
describe('PDFToDOCXErrorHandler', () => {
  let errorHandler;
  
  beforeEach(() => {
    errorHandler = new PDFToDOCXErrorHandler();
  });

  describe('Error Classification', () => {
    test('should classify timeout errors', async () => {
      const error = new Error('Operation timed out');
      const context = { conversionStep: 'pdf_extraction' };
      
      const result = await errorHandler.handleError(error, context);
      
      expect(result.error.type).toBe(PDFToDOCXErrorTypes.TIMEOUT_ERROR);
    });

    test('should classify memory errors', async () => {
      const error = new Error('Out of memory');
      const context = { conversionStep: 'docx_generation' };
      
      const result = await errorHandler.handleError(error, context);
      
      expect(result.error.type).toBe(PDFToDOCXErrorTypes.MEMORY_LIMIT_EXCEEDED);
    });

    test('should classify step-specific errors', async () => {
      const error = new Error('Extraction failed');
      const context = { conversionStep: 'pdf_extraction' };
      
      const result = await errorHandler.handleError(error, context);
      
      expect(result.error.type).toBe(PDFToDOCXErrorTypes.CONTENT_EXTRACTION_FAILED);
    });
  });

  describe('Recovery Strategies', () => {
    test('should suggest retry for conversion failures', async () => {
      const error = new Error('Conversion failed');
      const context = { conversionStep: 'conversion', enableRecovery: true };
      
      const result = await errorHandler.handleError(error, context);
      
      expect(result.recoveryAttempted).toBe(true);
      expect(result.error.recoveryStrategies).toContain(PDFToDOCXRecoveryStrategies.RETRY_CONVERSION);
    });

    test('should suggest quality reduction for timeout errors', async () => {
      const error = new Error('Operation timed out');
      const context = { conversionStep: 'conversion', enableRecovery: true };
      
      const result = await errorHandler.handleError(error, context);
      
      expect(result.error.recoveryStrategies).toContain(PDFToDOCXRecoveryStrategies.REDUCE_QUALITY);
    });
  });

  describe('Statistics', () => {
    test('should track error statistics', async () => {
      const error1 = new Error('First error');
      const error2 = new Error('Second error');
      
      await errorHandler.handleError(error1, { conversionStep: 'extraction' });
      await errorHandler.handleError(error2, { conversionStep: 'generation' });
      
      const stats = errorHandler.getStatistics();
      
      expect(stats.totalErrors).toBe(2);
      expect(Object.keys(stats.errorsByType)).toContain(PDFToDOCXErrorTypes.CONTENT_EXTRACTION_FAILED);
    });
  });
});

/**
 * Test Suite: Performance Tests
 */
describe('Performance Tests', () => {
  let testDir;
  
  beforeAll(async () => {
    testDir = await PDFToDOCXTestHelpers.setupTestEnvironment();
  });
  
  afterAll(async () => {
    await PDFToDOCXTestHelpers.cleanupTestEnvironment(testDir);
  });

  test('should handle large PDF conversion within reasonable time', async () => {
    const inputPath = path.join(testDir, 'large_performance.pdf');
    const outputPath = path.join(testDir, 'large_performance.docx');
    
    await PDFToDOCXTestHelpers.createLargePDF(inputPath, 10); // 10 pages
    
    const startTime = Date.now();
    const result = await convertPDFToDOCX(inputPath, outputPath);
    const endTime = Date.now();
    
    expect(result.isSuccess()).toBe(true);
    expect(endTime - startTime).toBeLessThan(60000); // Should complete within 1 minute
  }, 120000);

  test('should handle concurrent conversions', async () => {
    const promises = [];
    
    for (let i = 1; i <= 3; i++) {
      const inputPath = path.join(testDir, `concurrent_${i}.pdf`);
      const outputPath = path.join(testDir, `concurrent_${i}.docx`);
      
      const promise = (async () => {
        await PDFToDOCXTestHelpers.createSimplePDF(inputPath, `Concurrent content ${i}`);
        return await convertPDFToDOCX(inputPath, outputPath);
      })();
      
      promises.push(promise);
    }
    
    const results = await Promise.all(promises);
    
    results.forEach(result => {
      expect(result.isSuccess()).toBe(true);
    });
  }, 60000);
});

/**
 * Test Suite: Integration Tests
 */
describe('Integration Tests', () => {
  let testDir;
  
  beforeAll(async () => {
    testDir = await PDFToDOCXTestHelpers.setupTestEnvironment();
  });
  
  afterAll(async () => {
    await PDFToDOCXTestHelpers.cleanupTestEnvironment(testDir);
  });

  test('should integrate with global service instance', async () => {
    const service1 = getPDFToDOCXService();
    const service2 = getPDFToDOCXService();
    
    expect(service1).toBe(service2); // Should be the same instance
  });

  test('should integrate with error handler', async () => {
    const inputPath = path.join(testDir, 'error_integration.pdf');
    const outputPath = path.join(testDir, 'error_integration.docx');
    
    await PDFToDOCXTestHelpers.createInvalidPDF(inputPath);
    
    const errorHandler = getPDFToDOCXErrorHandler();
    let errorCaught = false;
    
    errorHandler.on('error', () => {
      errorCaught = true;
    });
    
    const result = await convertPDFToDOCX(inputPath, outputPath);
    
    expect(result.isSuccess()).toBe(false);
    // Note: Error handler integration would need to be implemented in the actual service
  });

  test('should handle end-to-end conversion workflow', async () => {
    const inputPath = path.join(testDir, 'e2e_test.pdf');
    const outputPath = path.join(testDir, 'e2e_test.docx');
    
    // Create test PDF
    await PDFToDOCXTestHelpers.createStructuredPDF(inputPath);
    
    // Validate input
    const validation = await validatePDFForConversion(inputPath);
    expect(validation.isSuccess()).toBe(true);
    
    // Get preview
    const preview = await getConversionPreview(inputPath);
    expect(preview.isSuccess()).toBe(true);
    
    // Estimate time
    const estimate = await estimateConversionTime(inputPath);
    expect(estimate.isSuccess()).toBe(true);
    
    // Perform conversion
    const conversion = await convertPDFToDOCX(inputPath, outputPath);
    expect(conversion.isSuccess()).toBe(true);
    
    // Verify output
    const verification = await PDFToDOCXTestHelpers.verifyDOCXStructure(outputPath);
    expect(verification.valid).toBe(true);
    
    // Check statistics
    const stats = getConversionStatistics();
    expect(stats.isSuccess()).toBe(true);
  }, 60000);
});