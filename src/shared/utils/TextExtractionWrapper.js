/**
 * Text Extraction Wrapper
 * Simplified interface for text extraction operations
 */

const { getTextExtractionService, TextExtractionEvents } = require('../services/TextExtractionService');
const path = require('path');
const fs = require('fs').promises;

/**
 * Text extraction operation result
 */
class TextExtractionOperationResult {
  constructor() {
    this.success = false;
    this.text = '';
    this.metadata = {};
    this.statistics = {};
    this.warnings = [];
    this.errors = [];
    this.outputPath = null;
    this.format = 'plain';
    this.encoding = 'utf-8';
    this.processingTime = 0;
  }

  static fromExtractionResult(extractionResult, outputPath = null) {
    const result = new TextExtractionOperationResult();
    result.success = extractionResult.success;
    result.text = extractionResult.text;
    result.metadata = extractionResult.metadata;
    result.statistics = extractionResult.statistics;
    result.warnings = extractionResult.warnings;
    result.errors = extractionResult.errors;
    result.outputPath = outputPath;
    result.format = extractionResult.format;
    result.encoding = extractionResult.encoding;
    result.processingTime = extractionResult.statistics.extractionTimeMs;
    return result;
  }

  getSummary() {
    return {
      success: this.success,
      characterCount: this.statistics.characterCount || 0,
      wordCount: this.statistics.wordCount || 0,
      lineCount: this.statistics.lineCount || 0,
      paragraphCount: this.statistics.paragraphCount || 0,
      processingTime: this.processingTime,
      warnings: this.warnings.length,
      errors: this.errors.length,
      format: this.format,
      encoding: this.encoding,
      outputPath: this.outputPath
    };
  }
}

/**
 * Extract text from a single file
 */
async function extractTextFromFile(inputPath, outputPath = null, options = {}) {
  try {
    const service = getTextExtractionService();
    const result = await service.extractText(inputPath, outputPath, options);
    return TextExtractionOperationResult.fromExtractionResult(result, outputPath);
  } catch (error) {
    const result = new TextExtractionOperationResult();
    result.errors.push({ message: error.message, timestamp: new Date().toISOString() });
    return result;
  }
}

/**
 * Extract text from PDF file
 */
async function extractTextFromPDF(inputPath, outputPath = null, options = {}) {
  try {
    const service = getTextExtractionService();
    const result = await service.extractTextFromPDF(inputPath, options);
    
    // Save to file if output path is provided
    if (outputPath && result.success) {
      await fs.writeFile(outputPath, result.text, { encoding: result.encoding });
    }
    
    return TextExtractionOperationResult.fromExtractionResult(result, outputPath);
  } catch (error) {
    const result = new TextExtractionOperationResult();
    result.errors.push({ message: error.message, timestamp: new Date().toISOString() });
    return result;
  }
}

/**
 * Extract text from DOCX file
 */
async function extractTextFromDOCX(inputPath, outputPath = null, options = {}) {
  try {
    const service = getTextExtractionService();
    const result = await service.extractTextFromDOCX(inputPath, options);
    
    // Save to file if output path is provided
    if (outputPath && result.success) {
      await fs.writeFile(outputPath, result.text, { encoding: result.encoding });
    }
    
    return TextExtractionOperationResult.fromExtractionResult(result, outputPath);
  } catch (error) {
    const result = new TextExtractionOperationResult();
    result.errors.push({ message: error.message, timestamp: new Date().toISOString() });
    return result;
  }
}

/**
 * Convert HTML to text/markdown
 */
async function convertHTMLToText(htmlContent, outputPath = null, options = {}) {
  try {
    const service = getTextExtractionService();
    const result = await service.convertHTMLToText(htmlContent, options);
    
    // Save to file if output path is provided
    if (outputPath && result.success) {
      await fs.writeFile(outputPath, result.text, { encoding: result.encoding });
    }
    
    return TextExtractionOperationResult.fromExtractionResult(result, outputPath);
  } catch (error) {
    const result = new TextExtractionOperationResult();
    result.errors.push({ message: error.message, timestamp: new Date().toISOString() });
    return result;
  }
}

/**
 * Extract text from multiple files with progress tracking
 */
async function extractTextWithProgress(inputFiles, outputDir, options = {}, progressCallback = null) {
  const results = {
    successful: 0,
    failed: 0,
    results: [],
    totalTime: 0
  };
  
  const startTime = Date.now();
  const service = getTextExtractionService();
  
  // Setup progress listener if callback provided
  if (progressCallback) {
    service.on(TextExtractionEvents.EXTRACTION_PROGRESS, progressCallback);
  }
  
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    for (let i = 0; i < inputFiles.length; i++) {
      const inputFile = inputFiles[i];
      const fileName = path.basename(inputFile, path.extname(inputFile));
      const outputFile = path.join(outputDir, `${fileName}.txt`);
      
      try {
        const result = await extractTextFromFile(inputFile, outputFile, options);
        
        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
        }
        
        results.results.push({
          inputFile,
          outputFile,
          result
        });
        
        // Call progress callback for file completion
        if (progressCallback) {
          progressCallback({
            type: 'file_completed',
            progress: (i + 1) / inputFiles.length,
            currentFile: i + 1,
            totalFiles: inputFiles.length,
            fileName: path.basename(inputFile),
            success: result.success
          });
        }
        
      } catch (error) {
        results.failed++;
        results.results.push({
          inputFile,
          outputFile,
          result: {
            success: false,
            errors: [{ message: error.message }]
          }
        });
      }
    }
    
    results.totalTime = Date.now() - startTime;
    return results;
    
  } finally {
    // Remove progress listener
    if (progressCallback) {
      service.removeListener(TextExtractionEvents.EXTRACTION_PROGRESS, progressCallback);
    }
  }
}

/**
 * Batch extract text from multiple files
 */
async function batchExtractText(inputFiles, outputDir, options = {}) {
  try {
    const service = getTextExtractionService();
    return await service.batchExtractText(inputFiles, outputDir, options);
  } catch (error) {
    throw new Error(`Batch text extraction failed: ${error.message}`);
  }
}

/**
 * Validate input file for text extraction
 */
async function validateTextExtractionInput(inputPath) {
  try {
    const stats = await fs.stat(inputPath);
    
    if (!stats.isFile()) {
      return {
        valid: false,
        error: 'Input path is not a file'
      };
    }
    
    if (stats.size === 0) {
      return {
        valid: false,
        error: 'Input file is empty'
      };
    }
    
    const ext = path.extname(inputPath).toLowerCase();
    const supportedFormats = ['.pdf', '.docx'];
    
    if (!supportedFormats.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported file format: ${ext}. Supported formats: ${supportedFormats.join(', ')}`
      };
    }
    
    return {
      valid: true,
      fileSize: stats.size,
      format: ext,
      lastModified: stats.mtime
    };
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        valid: false,
        error: 'Input file does not exist'
      };
    }
    
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Get text extraction preview (first N characters)
 */
async function getTextExtractionPreview(inputPath, maxLength = 500, options = {}) {
  try {
    const previewOptions = {
      ...options,
      maxLength,
      enableCache: false // Don't cache previews
    };
    
    const result = await extractTextFromFile(inputPath, null, previewOptions);
    
    return {
      success: result.success,
      preview: result.text,
      metadata: result.metadata,
      statistics: result.statistics,
      warnings: result.warnings,
      errors: result.errors
    };
  } catch (error) {
    return {
      success: false,
      preview: '',
      errors: [{ message: error.message }]
    };
  }
}

/**
 * Get text extraction statistics
 */
function getTextExtractionStatistics() {
  const service = getTextExtractionService();
  return service.getStatistics();
}

/**
 * Reset text extraction statistics
 */
function resetTextExtractionStatistics() {
  const service = getTextExtractionService();
  service.resetStatistics();
}

/**
 * Clear text extraction cache
 */
function clearTextExtractionCache() {
  const service = getTextExtractionService();
  service.clearCache();
}

/**
 * Listen to text extraction events
 */
function onTextExtractionEvent(eventName, callback) {
  const service = getTextExtractionService();
  service.on(eventName, callback);
  
  // Return function to remove listener
  return () => {
    service.removeListener(eventName, callback);
  };
}

/**
 * Convert text to different formats
 */
async function convertTextToFormat(text, fromFormat, toFormat, options = {}) {
  try {
    const service = getTextExtractionService();
    
    if (fromFormat === 'html') {
      const conversionOptions = {
        ...options,
        outputFormat: toFormat
      };
      
      const result = await service.convertHTMLToText(text, conversionOptions);
      return {
        success: result.success,
        text: result.text,
        format: result.format,
        statistics: result.statistics,
        warnings: result.warnings,
        errors: result.errors
      };
    }
    
    // For other conversions, return as-is for now
    return {
      success: true,
      text: text,
      format: toFormat,
      statistics: {
        characterCount: text.length,
        wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
        lineCount: text.split('\n').length,
        paragraphCount: text.split(/\n\s*\n/).filter(p => p.trim()).length
      },
      warnings: [],
      errors: []
    };
    
  } catch (error) {
    return {
      success: false,
      text: '',
      format: toFormat,
      errors: [{ message: error.message }]
    };
  }
}

/**
 * Estimate text extraction time
 */
async function estimateTextExtractionTime(inputPath) {
  try {
    const validation = await validateTextExtractionInput(inputPath);
    
    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error
      };
    }
    
    const stats = getTextExtractionStatistics();
    const avgTime = stats.averageExtractionTime || 1000; // Default 1 second
    
    // Estimate based on file size (rough approximation)
    const fileSizeMB = validation.fileSize / (1024 * 1024);
    const estimatedTime = Math.max(avgTime * fileSizeMB, 500); // Minimum 500ms
    
    return {
      valid: true,
      estimatedTimeMs: Math.round(estimatedTime),
      fileSize: validation.fileSize,
      format: validation.format,
      basedOnExtractions: stats.totalExtractions
    };
    
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Get supported text extraction options
 */
function getSupportedTextExtractionOptions() {
  return {
    general: {
      encoding: ['utf-8', 'ascii', 'latin1'],
      outputFormat: ['plain', 'markdown', 'structured'],
      preserveFormatting: [true, false],
      preserveLineBreaks: [true, false],
      preserveParagraphs: [true, false],
      trimWhitespace: [true, false],
      normalizeSpaces: [true, false],
      maxLength: 'number or null',
      enableCache: [true, false],
      enableProgress: [true, false]
    },
    pdf: {
      normalizeWhitespace: [true, false],
      disableCombineTextItems: [true, false],
      includeMarkedContent: [true, false]
    },
    docx: {
      includeHeaders: [true, false],
      includeFooters: [true, false],
      includeFootnotes: [true, false]
    },
    html: {
      headingStyle: ['atx', 'setext'],
      bulletListMarker: ['-', '*', '+'],
      codeBlockStyle: ['fenced', 'indented'],
      emDelimiter: ['_', '*'],
      strongDelimiter: ['**', '__'],
      linkStyle: ['inlined', 'referenced'],
      linkReferenceStyle: ['full', 'collapsed', 'shortcut']
    }
  };
}

/**
 * Get supported file formats
 */
function getSupportedFormats() {
  const service = getTextExtractionService();
  return service.getSupportedFormats();
}

module.exports = {
  TextExtractionOperationResult,
  extractTextFromFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  convertHTMLToText,
  extractTextWithProgress,
  batchExtractText,
  validateTextExtractionInput,
  getTextExtractionPreview,
  getTextExtractionStatistics,
  resetTextExtractionStatistics,
  clearTextExtractionCache,
  onTextExtractionEvent,
  convertTextToFormat,
  estimateTextExtractionTime,
  getSupportedTextExtractionOptions,
  getSupportedFormats,
  TextExtractionEvents
};