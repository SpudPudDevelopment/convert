/**
 * DOCX Wrapper Functions
 * Simplified interface for common DOCX operations
 */

const { getDOCXService } = require('../services/DOCXService');
const fs = require('fs').promises;
const path = require('path');

/**
 * DOCX operation result class
 */
class DOCXOperationResult {
  constructor(data = {}) {
    this.success = data.success || false;
    this.data = data.data || null;
    this.error = data.error || null;
    this.warnings = data.warnings || [];
    this.performance = {
      startTime: data.startTime || Date.now(),
      endTime: data.endTime || Date.now(),
      duration: data.duration || 0
    };
  }

  /**
   * Set performance metrics
   */
  setPerformance(startTime, endTime) {
    this.performance.startTime = startTime;
    this.performance.endTime = endTime;
    this.performance.duration = endTime - startTime;
  }

  /**
   * Add warning
   */
  addWarning(warning) {
    this.warnings.push(warning);
  }

  /**
   * Set error
   */
  setError(error) {
    this.success = false;
    this.error = error;
  }

  /**
   * Set success data
   */
  setSuccess(data) {
    this.success = true;
    this.data = data;
  }
}

/**
 * Parse DOCX document
 */
async function parseDOCX(filePath, options = {}) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const docxService = getDOCXService();
    const docInfo = await docxService.parseDOCX(filePath, options);
    
    result.setSuccess({
      fileName: docInfo.fileName,
      fileSize: docInfo.fileSize,
      wordCount: docInfo.getWordCount(),
      characterCount: docInfo.getCharacterCount(),
      paragraphCount: docInfo.getParagraphCount(),
      imageCount: docInfo.getImageCount(),
      hasImages: docInfo.hasImages(),
      text: docInfo.getPlainText(),
      html: docInfo.getHTML(),
      markdown: docInfo.getMarkdown(),
      metadata: docInfo.metadata,
      processingTime: docInfo.processingTime
    });
    
    // Add warnings if any
    if (docInfo.warnings && docInfo.warnings.length > 0) {
      docInfo.warnings.forEach(warning => result.addWarning(warning));
    }
    
  } catch (error) {
    result.setError(error.message || 'Failed to parse DOCX document');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Extract text from DOCX
 */
async function extractTextFromDOCX(filePath, options = {}) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const docxService = getDOCXService();
    const text = await docxService.extractText(filePath, options);
    
    // Calculate text statistics
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const characterCount = text.length;
    const paragraphCount = text.trim() ? text.split(/\n\s*\n/).length : 0;
    const lineCount = text.split('\n').length;
    
    result.setSuccess({
      text,
      wordCount,
      characterCount,
      paragraphCount,
      lineCount,
      isEmpty: text.trim().length === 0
    });
    
  } catch (error) {
    result.setError(error.message || 'Failed to extract text from DOCX');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Get DOCX metadata
 */
async function getDOCXMetadata(filePath) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const docxService = getDOCXService();
    const metadata = await docxService.getMetadata(filePath);
    
    result.setSuccess(metadata);
    
  } catch (error) {
    result.setError(error.message || 'Failed to get DOCX metadata');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Convert DOCX to HTML
 */
async function convertDOCXToHTML(inputPath, outputPath, options = {}) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const docxService = getDOCXService();
    const conversionResult = await docxService.convertDOCX(inputPath, outputPath, {
      format: 'html',
      ...options
    });
    
    result.setSuccess({
      outputPath: conversionResult.outputPath,
      fileSize: conversionResult.fileSize,
      format: conversionResult.format,
      processingTime: conversionResult.processingTime,
      metadata: conversionResult.metadata
    });
    
    // Add warnings if any
    if (conversionResult.warnings && conversionResult.warnings.length > 0) {
      conversionResult.warnings.forEach(warning => result.addWarning(warning));
    }
    
  } catch (error) {
    result.setError(error.message || 'Failed to convert DOCX to HTML');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Convert DOCX to Markdown
 */
async function convertDOCXToMarkdown(inputPath, outputPath, options = {}) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const docxService = getDOCXService();
    const conversionResult = await docxService.convertDOCX(inputPath, outputPath, {
      format: 'markdown',
      ...options
    });
    
    result.setSuccess({
      outputPath: conversionResult.outputPath,
      fileSize: conversionResult.fileSize,
      format: conversionResult.format,
      processingTime: conversionResult.processingTime,
      metadata: conversionResult.metadata
    });
    
    // Add warnings if any
    if (conversionResult.warnings && conversionResult.warnings.length > 0) {
      conversionResult.warnings.forEach(warning => result.addWarning(warning));
    }
    
  } catch (error) {
    result.setError(error.message || 'Failed to convert DOCX to Markdown');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Convert DOCX to plain text
 */
async function convertDOCXToText(inputPath, outputPath, options = {}) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const docxService = getDOCXService();
    const conversionResult = await docxService.convertDOCX(inputPath, outputPath, {
      format: 'text',
      ...options
    });
    
    result.setSuccess({
      outputPath: conversionResult.outputPath,
      fileSize: conversionResult.fileSize,
      format: conversionResult.format,
      processingTime: conversionResult.processingTime,
      metadata: conversionResult.metadata
    });
    
    // Add warnings if any
    if (conversionResult.warnings && conversionResult.warnings.length > 0) {
      conversionResult.warnings.forEach(warning => result.addWarning(warning));
    }
    
  } catch (error) {
    result.setError(error.message || 'Failed to convert DOCX to text');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Extract images from DOCX
 */
async function extractDOCXImages(inputPath, outputDir, options = {}) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const docxService = getDOCXService();
    const images = await docxService.extractImages(inputPath, outputDir, options);
    
    result.setSuccess({
      imageCount: images.length,
      images: images.map(img => ({
        fileName: img.fileName,
        filePath: img.filePath,
        contentType: img.contentType,
        size: img.size
      })),
      outputDirectory: outputDir,
      totalSize: images.reduce((sum, img) => sum + img.size, 0)
    });
    
  } catch (error) {
    result.setError(error.message || 'Failed to extract images from DOCX');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Validate DOCX file
 */
async function validateDOCX(filePath) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    // Check if file exists
    const stats = await fs.stat(filePath);
    
    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.docx') {
      result.setSuccess({
        isValid: false,
        errors: [`Invalid file extension: ${ext}. Expected .docx`],
        fileSize: stats.size,
        fileName: path.basename(filePath)
      });
      return result;
    }
    
    // Try to parse the document
    const docxService = getDOCXService();
    const docInfo = await docxService.parseDOCX(filePath, {
      extractText: false,
      extractImages: false,
      extractMetadata: false
    });
    
    result.setSuccess({
      isValid: true,
      errors: [],
      warnings: docInfo.warnings || [],
      fileSize: stats.size,
      fileName: path.basename(filePath),
      wordCount: docInfo.getWordCount(),
      characterCount: docInfo.getCharacterCount(),
      imageCount: docInfo.getImageCount()
    });
    
  } catch (error) {
    result.setSuccess({
      isValid: false,
      errors: [error.message || 'Invalid DOCX file'],
      fileSize: 0,
      fileName: path.basename(filePath)
    });
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Get DOCX document info (quick overview)
 */
async function getDOCXInfo(filePath) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const docxService = getDOCXService();
    const docInfo = await docxService.parseDOCX(filePath, {
      extractText: false,
      extractImages: false,
      extractMetadata: true
    });
    
    result.setSuccess({
      fileName: docInfo.fileName,
      fileSize: docInfo.fileSize,
      wordCount: docInfo.getWordCount(),
      characterCount: docInfo.getCharacterCount(),
      paragraphCount: docInfo.getParagraphCount(),
      imageCount: docInfo.getImageCount(),
      hasImages: docInfo.hasImages(),
      metadata: docInfo.metadata,
      summary: docInfo.getSummary()
    });
    
  } catch (error) {
    result.setError(error.message || 'Failed to get DOCX info');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Batch convert multiple DOCX files
 */
async function batchConvertDOCX(inputFiles, outputDir, format = 'html', options = {}) {
  const startTime = Date.now();
  const result = new DOCXOperationResult({ startTime });
  
  try {
    const results = [];
    const errors = [];
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    for (const inputFile of inputFiles) {
      try {
        const fileName = path.basename(inputFile, '.docx');
        const outputExt = format === 'markdown' ? '.md' : format === 'text' ? '.txt' : '.html';
        const outputPath = path.join(outputDir, `${fileName}${outputExt}`);
        
        const docxService = getDOCXService();
        const conversionResult = await docxService.convertDOCX(inputFile, outputPath, {
          format,
          ...options
        });
        
        results.push({
          inputFile,
          outputPath: conversionResult.outputPath,
          success: true,
          fileSize: conversionResult.fileSize,
          processingTime: conversionResult.processingTime
        });
        
      } catch (error) {
        errors.push({
          inputFile,
          error: error.message || 'Conversion failed'
        });
        
        results.push({
          inputFile,
          success: false,
          error: error.message
        });
      }
    }
    
    result.setSuccess({
      totalFiles: inputFiles.length,
      successfulConversions: results.filter(r => r.success).length,
      failedConversions: errors.length,
      results,
      errors,
      outputDirectory: outputDir,
      format
    });
    
    // Add warnings for failed conversions
    errors.forEach(error => {
      result.addWarning(`Failed to convert ${error.inputFile}: ${error.error}`);
    });
    
  } catch (error) {
    result.setError(error.message || 'Batch conversion failed');
  }
  
  result.setPerformance(startTime, Date.now());
  return result;
}

/**
 * Get DOCX service statistics
 */
function getDOCXStatistics() {
  const docxService = getDOCXService();
  return docxService.getStatistics();
}

/**
 * Clear DOCX service cache
 */
function clearDOCXCache() {
  const docxService = getDOCXService();
  docxService.clearCache();
}

/**
 * Reset DOCX service statistics
 */
function resetDOCXStatistics() {
  const docxService = getDOCXService();
  docxService.resetStatistics();
}

/**
 * Add event listener to DOCX service
 */
function onDOCXEvent(event, listener) {
  const docxService = getDOCXService();
  docxService.on(event, listener);
}

/**
 * Remove event listener from DOCX service
 */
function offDOCXEvent(event, listener) {
  const docxService = getDOCXService();
  docxService.off(event, listener);
}

module.exports = {
  DOCXOperationResult,
  parseDOCX,
  extractTextFromDOCX,
  getDOCXMetadata,
  convertDOCXToHTML,
  convertDOCXToMarkdown,
  convertDOCXToText,
  extractDOCXImages,
  validateDOCX,
  getDOCXInfo,
  batchConvertDOCX,
  getDOCXStatistics,
  clearDOCXCache,
  resetDOCXStatistics,
  onDOCXEvent,
  offDOCXEvent
};