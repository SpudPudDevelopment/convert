/**
 * PDF Wrapper Functions
 * Simplified interface for common PDF operations
 */

const { getPDFService, PDFEvents } = require('../services/PDFService');
const path = require('path');
const fs = require('fs').promises;

/**
 * PDF operation result
 */
class PDFOperationResult {
  constructor() {
    this.success = false;
    this.data = null;
    this.error = null;
    this.warnings = [];
    this.metadata = {};
    this.performance = {
      startTime: Date.now(),
      endTime: null,
      duration: 0
    };
  }
  
  /**
   * Mark operation as successful
   */
  markSuccess(data, metadata = {}) {
    this.success = true;
    this.data = data;
    this.metadata = metadata;
    this.performance.endTime = Date.now();
    this.performance.duration = this.performance.endTime - this.performance.startTime;
  }
  
  /**
   * Mark operation as failed
   */
  markError(error) {
    this.success = false;
    this.error = error;
    this.performance.endTime = Date.now();
    this.performance.duration = this.performance.endTime - this.performance.startTime;
  }
  
  /**
   * Add warning
   */
  addWarning(warning) {
    this.warnings.push(warning);
  }
}

/**
 * Parse PDF and extract information
 * @param {string|Buffer} input - PDF file path or buffer
 * @param {Object} options - Parsing options
 * @returns {Promise<PDFOperationResult>}
 */
async function parsePDF(input, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const pdfService = getPDFService();
    const docInfo = await pdfService.parsePDF(input, options);
    
    result.markSuccess({
      pageCount: docInfo.pageCount,
      pages: docInfo.pages.map(page => ({
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        text: page.text,
        hasImages: page.images.length > 0,
        hasAnnotations: page.annotations.length > 0,
        isLandscape: page.isLandscape()
      })),
      text: docInfo.getAllText(),
      metadata: docInfo.metadata,
      info: docInfo.info,
      summary: docInfo.getSummary()
    }, {
      fileSize: docInfo.fileSize,
      parseTime: docInfo.parseTime,
      isEncrypted: docInfo.isEncrypted,
      version: docInfo.version
    });
    
    // Add warnings if any
    docInfo.warnings.forEach(warning => result.addWarning(warning));
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Extract text from PDF
 * @param {string|Buffer} input - PDF file path or buffer
 * @param {Object} options - Extraction options
 * @returns {Promise<PDFOperationResult>}
 */
async function extractTextFromPDF(input, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const pdfService = getPDFService();
    const text = await pdfService.extractText(input, options);
    
    result.markSuccess({
      text,
      wordCount: text.split(/\s+/).length,
      characterCount: text.length,
      lineCount: text.split('\n').length
    });
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Get PDF metadata
 * @param {string|Buffer} input - PDF file path or buffer
 * @param {Object} options - Options
 * @returns {Promise<PDFOperationResult>}
 */
async function getPDFMetadata(input, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const pdfService = getPDFService();
    const metadata = await pdfService.getMetadata(input, options);
    
    result.markSuccess(metadata);
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Render PDF pages to images
 * @param {string|Buffer} input - PDF file path or buffer
 * @param {Object} options - Rendering options
 * @returns {Promise<PDFOperationResult>}
 */
async function renderPDFPages(input, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const pdfService = getPDFService();
    const pages = await pdfService.renderPages(input, {
      renderScale: 1.5,
      renderFormat: 'png',
      ...options
    });
    
    result.markSuccess({
      pages,
      totalPages: pages.length,
      format: options.renderFormat || 'png',
      scale: options.renderScale || 1.5
    });
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Generate PDF from text
 * @param {string} text - Text content
 * @param {string} outputPath - Output file path
 * @param {Object} options - Generation options
 * @returns {Promise<PDFOperationResult>}
 */
async function generatePDFFromText(text, outputPath, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const pdfService = getPDFService();
    const genResult = await pdfService.generatePDF(text, outputPath, {
      title: 'Generated Document',
      author: 'Convert App',
      pageSize: 'A4',
      pageOrientation: 'portrait',
      fontSize: 12,
      fontFamily: 'Helvetica',
      ...options
    });
    
    if (genResult.success) {
      result.markSuccess({
        outputPath: genResult.outputPath,
        fileSize: genResult.fileSize,
        pageCount: genResult.pageCount,
        generationTime: genResult.generationTime
      }, genResult.metadata);
    } else {
      result.markError(genResult.errors.map(e => e.message).join('; '));
      genResult.warnings.forEach(w => result.addWarning(w.message));
    }
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Generate PDF from structured content
 * @param {Object|Array} content - Structured content
 * @param {string} outputPath - Output file path
 * @param {Object} options - Generation options
 * @returns {Promise<PDFOperationResult>}
 */
async function generatePDFFromContent(content, outputPath, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const pdfService = getPDFService();
    const genResult = await pdfService.generatePDF(content, outputPath, {
      title: 'Generated Document',
      author: 'Convert App',
      pageSize: 'A4',
      pageOrientation: 'portrait',
      fontSize: 12,
      fontFamily: 'Helvetica',
      ...options
    });
    
    if (genResult.success) {
      result.markSuccess({
        outputPath: genResult.outputPath,
        fileSize: genResult.fileSize,
        pageCount: genResult.pageCount,
        generationTime: genResult.generationTime
      }, genResult.metadata);
    } else {
      result.markError(genResult.errors.map(e => e.message).join('; '));
      genResult.warnings.forEach(w => result.addWarning(w.message));
    }
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Merge multiple PDFs
 * @param {string[]} inputPaths - Array of input PDF paths
 * @param {string} outputPath - Output file path
 * @param {Object} options - Merge options
 * @returns {Promise<PDFOperationResult>}
 */
async function mergePDFs(inputPaths, outputPath, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    // Validate input files
    for (const inputPath of inputPaths) {
      try {
        await fs.access(inputPath);
      } catch (error) {
        throw new Error(`Input file not found: ${inputPath}`);
      }
    }
    
    const pdfService = getPDFService();
    const mergeResult = await pdfService.mergePDFs(inputPaths, outputPath, options);
    
    result.markSuccess({
      outputPath: mergeResult.outputPath,
      pageCount: mergeResult.pageCount,
      fileSize: mergeResult.fileSize,
      inputFiles: inputPaths.length
    });
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Split PDF into separate files
 * @param {string} inputPath - Input PDF path
 * @param {string} outputDir - Output directory
 * @param {Object} options - Split options
 * @returns {Promise<PDFOperationResult>}
 */
async function splitPDF(inputPath, outputDir, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    // Validate input file
    await fs.access(inputPath);
    
    const pdfService = getPDFService();
    const splitResults = await pdfService.splitPDF(inputPath, outputDir, options);
    
    result.markSuccess({
      outputDir,
      files: splitResults,
      totalPages: splitResults.length,
      totalSize: splitResults.reduce((sum, file) => sum + file.fileSize, 0)
    });
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Validate PDF file
 * @param {string|Buffer} input - PDF file path or buffer
 * @param {Object} options - Validation options
 * @returns {Promise<PDFOperationResult>}
 */
async function validatePDF(input, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const pdfService = getPDFService();
    const docInfo = await pdfService.parsePDF(input, {
      extractText: false,
      extractImages: false,
      renderPages: false,
      extractMetadata: true,
      maxPages: 1, // Only check first page for validation
      ...options
    });
    
    const validation = {
      isValid: docInfo.errors.length === 0,
      pageCount: docInfo.pageCount,
      fileSize: docInfo.fileSize,
      isEncrypted: docInfo.isEncrypted,
      version: docInfo.version,
      errors: docInfo.errors,
      warnings: docInfo.warnings,
      hasMetadata: Object.keys(docInfo.metadata).length > 0 || Object.keys(docInfo.info).length > 0,
      fingerprint: docInfo.fingerprint
    };
    
    result.markSuccess(validation);
    
    // Add warnings
    docInfo.warnings.forEach(warning => result.addWarning(warning));
    
  } catch (error) {
    result.markSuccess({
      isValid: false,
      error: error.message || error,
      pageCount: 0,
      fileSize: 0,
      isEncrypted: false,
      version: null,
      errors: [error.message || error],
      warnings: [],
      hasMetadata: false,
      fingerprint: null
    });
  }
  
  return result;
}

/**
 * Get PDF information (quick overview)
 * @param {string|Buffer} input - PDF file path or buffer
 * @param {Object} options - Options
 * @returns {Promise<PDFOperationResult>}
 */
async function getPDFInfo(input, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const pdfService = getPDFService();
    const docInfo = await pdfService.parsePDF(input, {
      extractText: false,
      extractImages: false,
      renderPages: false,
      extractMetadata: true,
      maxPages: 0, // Don't process pages, just get document info
      ...options
    });
    
    const info = {
      pageCount: docInfo.pageCount,
      fileSize: docInfo.fileSize,
      isEncrypted: docInfo.isEncrypted,
      version: docInfo.version,
      title: docInfo.info.Title || docInfo.metadata.title || 'Untitled',
      author: docInfo.info.Author || docInfo.metadata.author || 'Unknown',
      subject: docInfo.info.Subject || docInfo.metadata.subject || '',
      creator: docInfo.info.Creator || docInfo.metadata.creator || '',
      producer: docInfo.info.Producer || docInfo.metadata.producer || '',
      creationDate: docInfo.info.CreationDate || docInfo.metadata.creationDate,
      modificationDate: docInfo.info.ModDate || docInfo.metadata.modificationDate,
      keywords: docInfo.info.Keywords || docInfo.metadata.keywords || '',
      fingerprint: docInfo.fingerprint,
      permissions: docInfo.permissions
    };
    
    result.markSuccess(info);
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Convert PDF to text file
 * @param {string} inputPath - Input PDF path
 * @param {string} outputPath - Output text file path
 * @param {Object} options - Conversion options
 * @returns {Promise<PDFOperationResult>}
 */
async function convertPDFToText(inputPath, outputPath, options = {}) {
  const result = new PDFOperationResult();
  
  try {
    const textResult = await extractTextFromPDF(inputPath, options);
    
    if (!textResult.success) {
      result.markError(textResult.error);
      return result;
    }
    
    // Write text to file
    await fs.writeFile(outputPath, textResult.data.text, 'utf8');
    
    // Get file stats
    const stats = await fs.stat(outputPath);
    
    result.markSuccess({
      outputPath,
      fileSize: stats.size,
      wordCount: textResult.data.wordCount,
      characterCount: textResult.data.characterCount,
      lineCount: textResult.data.lineCount
    });
    
  } catch (error) {
    result.markError(error.message || error);
  }
  
  return result;
}

/**
 * Create event listener for PDF operations
 * @param {Function} callback - Event callback
 * @returns {Function} - Cleanup function
 */
function createPDFEventListener(callback) {
  const pdfService = getPDFService();
  
  const eventHandler = (eventName, data) => {
    callback(eventName, data);
  };
  
  // Listen to all PDF events
  Object.values(PDFEvents).forEach(event => {
    pdfService.on(event, (data) => eventHandler(event, data));
  });
  
  // Return cleanup function
  return () => {
    Object.values(PDFEvents).forEach(event => {
      pdfService.removeListener(event, eventHandler);
    });
  };
}

/**
 * Get PDF service statistics
 * @returns {Object} - Statistics
 */
function getPDFStatistics() {
  const pdfService = getPDFService();
  return pdfService.getStatistics();
}

/**
 * Clear PDF service cache
 */
function clearPDFCache() {
  const pdfService = getPDFService();
  pdfService.clearCache();
}

/**
 * Reset PDF service statistics
 */
function resetPDFStatistics() {
  const pdfService = getPDFService();
  pdfService.resetStatistics();
}

module.exports = {
  // Core operations
  parsePDF,
  extractTextFromPDF,
  getPDFMetadata,
  renderPDFPages,
  generatePDFFromText,
  generatePDFFromContent,
  
  // Document operations
  mergePDFs,
  splitPDF,
  validatePDF,
  getPDFInfo,
  convertPDFToText,
  
  // Utility functions
  createPDFEventListener,
  getPDFStatistics,
  clearPDFCache,
  resetPDFStatistics,
  
  // Classes
  PDFOperationResult,
  
  // Events
  PDFEvents
};