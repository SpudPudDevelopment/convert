/**
 * PDF Service Tests
 * Comprehensive tests for PDF parsing and generation
 */

const { describe, it, beforeEach, afterEach, expect } = require('@jest/globals');
const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const {
  PDFService,
  PDFDocumentInfo,
  PDFPageInfo,
  PDFGenerationResult,
  PDFEvents,
  getPDFService
} = require('../services/PDFService');
const {
  parsePDF,
  extractTextFromPDF,
  getPDFMetadata,
  renderPDFPages,
  generatePDFFromText,
  mergePDFs,
  splitPDF,
  validatePDF,
  getPDFInfo,
  convertPDFToText
} = require('../utils/PDFWrapper');
const {
  PDFError,
  PDFErrorTypes,
  handlePDFError
} = require('../errors/PDFErrorHandler');

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, 'test-data');
const TEST_OUTPUT_DIR = path.join(__dirname, 'test-output');

/**
 * Helper function to create test PDF
 */
async function createTestPDF(filename, content = 'Test PDF Content', options = {}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  page.drawText(content, {
    x: 50,
    y: 750,
    size: 12,
    font,
    color: rgb(0, 0, 0)
  });
  
  // Set metadata if provided
  if (options.title) pdfDoc.setTitle(options.title);
  if (options.author) pdfDoc.setAuthor(options.author);
  if (options.subject) pdfDoc.setSubject(options.subject);
  
  const pdfBytes = await pdfDoc.save();
  const filePath = path.join(TEST_DATA_DIR, filename);
  await fs.writeFile(filePath, pdfBytes);
  
  return filePath;
}

/**
 * Helper function to create multi-page test PDF
 */
async function createMultiPageTestPDF(filename, pageCount = 3) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  for (let i = 1; i <= pageCount; i++) {
    const page = pdfDoc.addPage();
    page.drawText(`Page ${i} content`, {
      x: 50,
      y: 750,
      size: 12,
      font,
      color: rgb(0, 0, 0)
    });
  }
  
  const pdfBytes = await pdfDoc.save();
  const filePath = path.join(TEST_DATA_DIR, filename);
  await fs.writeFile(filePath, pdfBytes);
  
  return filePath;
}

/**
 * Helper function to create encrypted test PDF
 */
async function createEncryptedTestPDF(filename, password = 'test123') {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  page.drawText('Encrypted PDF Content', {
    x: 50,
    y: 750,
    size: 12,
    font,
    color: rgb(0, 0, 0)
  });
  
  // Note: pdf-lib doesn't support encryption directly
  // This is a placeholder for testing encrypted PDF handling
  const pdfBytes = await pdfDoc.save();
  const filePath = path.join(TEST_DATA_DIR, filename);
  await fs.writeFile(filePath, pdfBytes);
  
  return filePath;
}

/**
 * Setup test environment
 */
beforeEach(async () => {
  // Create test directories
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
});

/**
 * Cleanup test environment
 */
afterEach(async () => {
  try {
    // Clean up test files
    const testFiles = await fs.readdir(TEST_DATA_DIR);
    for (const file of testFiles) {
      await fs.unlink(path.join(TEST_DATA_DIR, file));
    }
    
    const outputFiles = await fs.readdir(TEST_OUTPUT_DIR);
    for (const file of outputFiles) {
      await fs.unlink(path.join(TEST_OUTPUT_DIR, file));
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});

describe('PDFService', () => {
  let pdfService;
  
  beforeEach(() => {
    pdfService = new PDFService();
  });
  
  describe('PDF Parsing', () => {
    it('should parse a simple PDF document', async () => {
      const testPDF = await createTestPDF('simple.pdf', 'Hello World PDF');
      
      const docInfo = await pdfService.parsePDF(testPDF);
      
      expect(docInfo).toBeInstanceOf(PDFDocumentInfo);
      expect(docInfo.pageCount).toBe(1);
      expect(docInfo.pages).toHaveLength(1);
      expect(docInfo.getAllText()).toContain('Hello World PDF');
      expect(docInfo.fileSize).toBeGreaterThan(0);
    });
    
    it('should parse PDF with metadata', async () => {
      const testPDF = await createTestPDF('metadata.pdf', 'Test Content', {
        title: 'Test Document',
        author: 'Test Author',
        subject: 'Test Subject'
      });
      
      const docInfo = await pdfService.parsePDF(testPDF, {
        extractMetadata: true
      });
      
      expect(docInfo.info.Title).toBe('Test Document');
      expect(docInfo.info.Author).toBe('Test Author');
      expect(docInfo.info.Subject).toBe('Test Subject');
    });
    
    it('should parse multi-page PDF', async () => {
      const testPDF = await createMultiPageTestPDF('multipage.pdf', 5);
      
      const docInfo = await pdfService.parsePDF(testPDF);
      
      expect(docInfo.pageCount).toBe(5);
      expect(docInfo.pages).toHaveLength(5);
      
      for (let i = 0; i < 5; i++) {
        expect(docInfo.pages[i].pageNumber).toBe(i + 1);
        expect(docInfo.pages[i].text).toContain(`Page ${i + 1}`);
      }
    });
    
    it('should handle parsing options', async () => {
      const testPDF = await createTestPDF('options.pdf', 'Test Content');
      
      const docInfo = await pdfService.parsePDF(testPDF, {
        extractText: false,
        extractMetadata: false,
        maxPages: 0
      });
      
      expect(docInfo.pageCount).toBe(1);
      expect(docInfo.pages).toHaveLength(0); // No pages processed
    });
    
    it('should emit parsing events', async () => {
      const testPDF = await createTestPDF('events.pdf', 'Event Test');
      const events = [];
      
      pdfService.on(PDFEvents.PARSING_STARTED, (data) => events.push('started'));
      pdfService.on(PDFEvents.PARSING_COMPLETED, (data) => events.push('completed'));
      
      await pdfService.parsePDF(testPDF);
      
      expect(events).toContain('started');
      expect(events).toContain('completed');
    });
    
    it('should handle parsing errors', async () => {
      const invalidFile = path.join(TEST_DATA_DIR, 'invalid.pdf');
      await fs.writeFile(invalidFile, 'Not a PDF file');
      
      await expect(pdfService.parsePDF(invalidFile)).rejects.toThrow();
    });
  });
  
  describe('PDF Generation', () => {
    it('should generate PDF from text', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'generated.pdf');
      const text = 'This is a generated PDF document.';
      
      const result = await pdfService.generatePDF(text, outputPath);
      
      expect(result).toBeInstanceOf(PDFGenerationResult);
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(outputPath);
      expect(result.pageCount).toBeGreaterThan(0);
      expect(result.fileSize).toBeGreaterThan(0);
      
      // Verify file exists
      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });
    
    it('should generate PDF with custom options', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'custom.pdf');
      const text = 'Custom PDF document.';
      
      const result = await pdfService.generatePDF(text, outputPath, {
        title: 'Custom Document',
        author: 'Test Author',
        pageSize: 'A4',
        pageOrientation: 'landscape',
        fontSize: 14
      });
      
      expect(result.success).toBe(true);
      expect(result.metadata.title).toBe('Custom Document');
      expect(result.metadata.author).toBe('Test Author');
    });
    
    it('should generate PDF from array content', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'array.pdf');
      const content = [
        'First paragraph',
        'Second paragraph',
        { type: 'text', content: 'Third paragraph' }
      ];
      
      const result = await pdfService.generatePDF(content, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.pageCount).toBeGreaterThan(0);
    });
    
    it('should emit generation events', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'events.pdf');
      const events = [];
      
      pdfService.on(PDFEvents.GENERATION_STARTED, () => events.push('started'));
      pdfService.on(PDFEvents.GENERATION_COMPLETED, () => events.push('completed'));
      
      await pdfService.generatePDF('Test content', outputPath);
      
      expect(events).toContain('started');
      expect(events).toContain('completed');
    });
  });
  
  describe('PDF Operations', () => {
    it('should extract text from PDF', async () => {
      const testPDF = await createTestPDF('extract.pdf', 'Text to extract');
      
      const text = await pdfService.extractText(testPDF);
      
      expect(text).toContain('Text to extract');
    });
    
    it('should get PDF metadata', async () => {
      const testPDF = await createTestPDF('metadata.pdf', 'Content', {
        title: 'Metadata Test',
        author: 'Test Author'
      });
      
      const metadata = await pdfService.getMetadata(testPDF);
      
      expect(metadata.info.Title).toBe('Metadata Test');
      expect(metadata.info.Author).toBe('Test Author');
      expect(metadata.pageCount).toBe(1);
    });
    
    it('should merge multiple PDFs', async () => {
      const pdf1 = await createTestPDF('merge1.pdf', 'First PDF');
      const pdf2 = await createTestPDF('merge2.pdf', 'Second PDF');
      const outputPath = path.join(TEST_OUTPUT_DIR, 'merged.pdf');
      
      const result = await pdfService.mergePDFs([pdf1, pdf2], outputPath);
      
      expect(result.pageCount).toBe(2);
      expect(result.outputPath).toBe(outputPath);
      
      // Verify merged content
      const mergedDoc = await pdfService.parsePDF(outputPath);
      expect(mergedDoc.pageCount).toBe(2);
    });
    
    it('should split PDF into separate files', async () => {
      const testPDF = await createMultiPageTestPDF('split.pdf', 3);
      const outputDir = path.join(TEST_OUTPUT_DIR, 'split');
      
      const results = await pdfService.splitPDF(testPDF, outputDir);
      
      expect(results).toHaveLength(3);
      
      for (let i = 0; i < 3; i++) {
        expect(results[i].pageNumber).toBe(i + 1);
        expect(results[i].outputPath).toContain(`page-${i + 1}.pdf`);
        
        // Verify file exists
        const stats = await fs.stat(results[i].outputPath);
        expect(stats.size).toBeGreaterThan(0);
      }
    });
  });
  
  describe('Caching and Statistics', () => {
    it('should cache parsing results', async () => {
      const testPDF = await createTestPDF('cache.pdf', 'Cache test');
      
      // First parse
      const start1 = Date.now();
      await pdfService.parsePDF(testPDF);
      const time1 = Date.now() - start1;
      
      // Second parse (should be cached)
      const start2 = Date.now();
      await pdfService.parsePDF(testPDF);
      const time2 = Date.now() - start2;
      
      // Second parse should be faster due to caching
      expect(time2).toBeLessThan(time1);
      
      const stats = pdfService.getStatistics();
      expect(stats.cacheHits).toBeGreaterThan(0);
    });
    
    it('should track statistics', async () => {
      const testPDF = await createTestPDF('stats.pdf', 'Stats test');
      const outputPath = path.join(TEST_OUTPUT_DIR, 'stats.pdf');
      
      // Reset statistics
      pdfService.resetStatistics();
      
      // Perform operations
      await pdfService.parsePDF(testPDF);
      await pdfService.generatePDF('Test content', outputPath);
      
      const stats = pdfService.getStatistics();
      expect(stats.documentsProcessed).toBe(1);
      expect(stats.documentsGenerated).toBe(1);
      expect(stats.totalParseTime).toBeGreaterThan(0);
      expect(stats.totalGenerationTime).toBeGreaterThan(0);
    });
    
    it('should clear cache', async () => {
      const testPDF = await createTestPDF('clear.pdf', 'Clear test');
      
      await pdfService.parsePDF(testPDF);
      expect(pdfService.getCacheSize()).toBeGreaterThan(0);
      
      pdfService.clearCache();
      expect(pdfService.getCacheSize()).toBe(0);
    });
  });
});

describe('PDF Wrapper Functions', () => {
  describe('parsePDF', () => {
    it('should parse PDF and return operation result', async () => {
      const testPDF = await createTestPDF('wrapper.pdf', 'Wrapper test');
      
      const result = await parsePDF(testPDF);
      
      expect(result.success).toBe(true);
      expect(result.data.pageCount).toBe(1);
      expect(result.data.text).toContain('Wrapper test');
      expect(result.performance.duration).toBeGreaterThan(0);
    });
    
    it('should handle parsing errors gracefully', async () => {
      const invalidFile = path.join(TEST_DATA_DIR, 'invalid.pdf');
      await fs.writeFile(invalidFile, 'Not a PDF');
      
      const result = await parsePDF(invalidFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('extractTextFromPDF', () => {
    it('should extract text and return statistics', async () => {
      const testPDF = await createTestPDF('text.pdf', 'Hello world test document');
      
      const result = await extractTextFromPDF(testPDF);
      
      expect(result.success).toBe(true);
      expect(result.data.text).toContain('Hello world test document');
      expect(result.data.wordCount).toBeGreaterThan(0);
      expect(result.data.characterCount).toBeGreaterThan(0);
    });
  });
  
  describe('generatePDFFromText', () => {
    it('should generate PDF from text', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'wrapper-gen.pdf');
      const text = 'Generated by wrapper function';
      
      const result = await generatePDFFromText(text, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.data.outputPath).toBe(outputPath);
      expect(result.data.fileSize).toBeGreaterThan(0);
    });
  });
  
  describe('validatePDF', () => {
    it('should validate valid PDF', async () => {
      const testPDF = await createTestPDF('valid.pdf', 'Valid PDF');
      
      const result = await validatePDF(testPDF);
      
      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(true);
      expect(result.data.pageCount).toBe(1);
    });
    
    it('should detect invalid PDF', async () => {
      const invalidFile = path.join(TEST_DATA_DIR, 'invalid.pdf');
      await fs.writeFile(invalidFile, 'Not a PDF file');
      
      const result = await validatePDF(invalidFile);
      
      expect(result.success).toBe(true);
      expect(result.data.isValid).toBe(false);
      expect(result.data.errors).toHaveLength(1);
    });
  });
  
  describe('mergePDFs', () => {
    it('should merge multiple PDFs', async () => {
      const pdf1 = await createTestPDF('merge1.pdf', 'First');
      const pdf2 = await createTestPDF('merge2.pdf', 'Second');
      const outputPath = path.join(TEST_OUTPUT_DIR, 'merged-wrapper.pdf');
      
      const result = await mergePDFs([pdf1, pdf2], outputPath);
      
      expect(result.success).toBe(true);
      expect(result.data.pageCount).toBe(2);
      expect(result.data.inputFiles).toBe(2);
    });
  });
  
  describe('convertPDFToText', () => {
    it('should convert PDF to text file', async () => {
      const testPDF = await createTestPDF('convert.pdf', 'Convert to text');
      const outputPath = path.join(TEST_OUTPUT_DIR, 'converted.txt');
      
      const result = await convertPDFToText(testPDF, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.data.outputPath).toBe(outputPath);
      
      // Verify text file content
      const textContent = await fs.readFile(outputPath, 'utf8');
      expect(textContent).toContain('Convert to text');
    });
  });
});

describe('PDF Error Handling', () => {
  describe('PDFError', () => {
    it('should create PDF error with correct properties', () => {
      const error = new PDFError(
        PDFErrorTypes.INVALID_PDF,
        'Test error message',
        new Error('Original error'),
        { file: 'test.pdf' }
      );
      
      expect(error.type).toBe(PDFErrorTypes.INVALID_PDF);
      expect(error.message).toBe('Test error message');
      expect(error.context.file).toBe('test.pdf');
      expect(error.severity).toBeDefined();
      expect(error.recoveryStrategy).toBeDefined();
      expect(error.userMessage).toBeDefined();
    });
  });
  
  describe('Error Recovery', () => {
    it('should attempt error recovery', async () => {
      const invalidFile = path.join(TEST_DATA_DIR, 'recovery.pdf');
      await fs.writeFile(invalidFile, 'Invalid PDF content');
      
      try {
        await handlePDFError(
          new Error('Invalid PDF'),
          { file: invalidFile },
          async () => {
            throw new Error('Operation failed');
          }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(PDFError);
      }
    });
  });
});

describe('Global PDF Service', () => {
  it('should return singleton instance', () => {
    const service1 = getPDFService();
    const service2 = getPDFService();
    
    expect(service1).toBe(service2);
    expect(service1).toBeInstanceOf(PDFService);
  });
});

describe('Performance Tests', () => {
  it('should handle large text generation efficiently', async () => {
    const largeText = 'Lorem ipsum '.repeat(10000);
    const outputPath = path.join(TEST_OUTPUT_DIR, 'large.pdf');
    
    const start = Date.now();
    const result = await generatePDFFromText(largeText, outputPath);
    const duration = Date.now() - start;
    
    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
  });
  
  it('should handle multiple concurrent operations', async () => {
    const operations = [];
    
    for (let i = 0; i < 5; i++) {
      const testPDF = createTestPDF(`concurrent-${i}.pdf`, `Content ${i}`);
      operations.push(testPDF.then(path => parsePDF(path)));
    }
    
    const results = await Promise.all(operations);
    
    results.forEach((result, index) => {
      expect(result.success).toBe(true);
      expect(result.data.text).toContain(`Content ${index}`);
    });
  });
});