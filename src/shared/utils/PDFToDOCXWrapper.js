/**
 * PDF to DOCX Conversion Wrapper
 * Provides simplified interface for PDF to DOCX conversion operations
 */

const { getPDFToDOCXService, PDFToDOCXEvents } = require('../services/PDFToDOCXService');
const { handlePDFError } = require('../errors/PDFErrorHandler');
const { handleDOCXError } = require('../errors/DOCXErrorHandler');

/**
 * PDF to DOCX operation result class
 */
class PDFToDOCXOperationResult {
  constructor(data = {}) {
    this.success = data.success || false;
    this.data = data.data || null;
    this.errors = data.errors || [];
    this.warnings = data.warnings || [];
    this.metadata = data.metadata || {};
    this.statistics = data.statistics || {};
    this.performance = data.performance || {};
    this.conversionSteps = data.conversionSteps || [];
  }

  /**
   * Check if operation was successful
   */
  isSuccess() {
    return this.success && this.errors.length === 0;
  }

  /**
   * Check if operation has warnings
   */
  hasWarnings() {
    return this.warnings.length > 0;
  }

  /**
   * Get first error message
   */
  getFirstError() {
    return this.errors.length > 0 ? this.errors[0] : null;
  }

  /**
   * Get conversion summary
   */
  getSummary() {
    return {
      success: this.success,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      processingTime: this.performance.processingTime || 0,
      stepCount: this.conversionSteps.length,
      inputSize: this.statistics.inputFileSize || 0,
      outputSize: this.statistics.outputFileSize || 0,
      compressionRatio: this.statistics.compressionRatio || 0
    };
  }
}

/**
 * Convert PDF to DOCX
 * @param {string} inputPath - Path to input PDF file
 * @param {string} outputPath - Path for output DOCX file
 * @param {Object} options - Conversion options
 * @returns {Promise<PDFToDOCXOperationResult>}
 */
async function convertPDFToDOCX(inputPath, outputPath, options = {}) {
  try {
    const service = getPDFToDOCXService();
    const result = await service.convertPDFToDOCX(inputPath, outputPath, options);
    
    return new PDFToDOCXOperationResult({
      success: result.success,
      data: {
        inputPath: result.inputPath,
        outputPath: result.outputPath,
        conversionSteps: result.conversionSteps
      },
      errors: result.errors,
      warnings: result.warnings,
      metadata: result.metadata,
      statistics: result.statistics,
      performance: {
        processingTime: result.processingTime
      },
      conversionSteps: result.conversionSteps
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Conversion failed']
    });
  }
}

/**
 * Convert PDF to DOCX with progress callback
 * @param {string} inputPath - Path to input PDF file
 * @param {string} outputPath - Path for output DOCX file
 * @param {Function} progressCallback - Progress callback function
 * @param {Object} options - Conversion options
 * @returns {Promise<PDFToDOCXOperationResult>}
 */
async function convertPDFToDOCXWithProgress(inputPath, outputPath, progressCallback, options = {}) {
  try {
    const service = getPDFToDOCXService();
    
    // Set up progress listener
    const progressListener = (progress) => {
      if (progressCallback && typeof progressCallback === 'function') {
        progressCallback(progress);
      }
    };
    
    service.on(PDFToDOCXEvents.PROGRESS_UPDATE, progressListener);
    service.on(PDFToDOCXEvents.STEP_COMPLETED, progressListener);
    
    try {
      const result = await service.convertPDFToDOCX(inputPath, outputPath, {
        ...options,
        progressCallback
      });
      
      return new PDFToDOCXOperationResult({
        success: result.success,
        data: {
          inputPath: result.inputPath,
          outputPath: result.outputPath,
          conversionSteps: result.conversionSteps
        },
        errors: result.errors,
        warnings: result.warnings,
        metadata: result.metadata,
        statistics: result.statistics,
        performance: {
          processingTime: result.processingTime
        },
        conversionSteps: result.conversionSteps
      });
    } finally {
      // Clean up listeners
      service.removeListener(PDFToDOCXEvents.PROGRESS_UPDATE, progressListener);
      service.removeListener(PDFToDOCXEvents.STEP_COMPLETED, progressListener);
    }
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Conversion failed']
    });
  }
}

/**
 * Batch convert multiple PDFs to DOCX
 * @param {Array<string>} inputFiles - Array of input PDF file paths
 * @param {string} outputDir - Output directory for DOCX files
 * @param {Object} options - Conversion options
 * @returns {Promise<PDFToDOCXOperationResult>}
 */
async function batchConvertPDFToDOCX(inputFiles, outputDir, options = {}) {
  try {
    const service = getPDFToDOCXService();
    const result = await service.batchConvertPDFToDOCX(inputFiles, outputDir, options);
    
    return new PDFToDOCXOperationResult({
      success: result.failedConversions === 0,
      data: {
        totalFiles: result.totalFiles,
        successfulConversions: result.successfulConversions,
        failedConversions: result.failedConversions,
        results: result.results
      },
      errors: result.errors.map(e => e.error),
      warnings: [],
      statistics: {
        totalFiles: result.totalFiles,
        successRate: ((result.successfulConversions / result.totalFiles) * 100).toFixed(2) + '%'
      }
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Batch conversion failed']
    });
  }
}

/**
 * Validate PDF file for conversion
 * @param {string} inputPath - Path to input PDF file
 * @param {Object} options - Validation options
 * @returns {Promise<PDFToDOCXOperationResult>}
 */
async function validatePDFForConversion(inputPath, options = {}) {
  try {
    const service = getPDFToDOCXService();
    
    // Use the internal validation method
    await service._validateInput(inputPath, {
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB default
      ...options
    });
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: {
        inputPath,
        valid: true
      }
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      data: {
        inputPath,
        valid: false
      },
      errors: [error.message || 'Validation failed']
    });
  }
}

/**
 * Get conversion preview (analyze what would be converted)
 * @param {string} inputPath - Path to input PDF file
 * @param {Object} options - Preview options
 * @returns {Promise<PDFToDOCXOperationResult>}
 */
async function getConversionPreview(inputPath, options = {}) {
  try {
    const service = getPDFToDOCXService();
    
    // Extract PDF content for preview
    const pdfContent = await service._extractPDFContent(inputPath, {
      extractImages: true,
      extractMetadata: true,
      pageRange: options.pageRange || null
    });
    
    // Analyze content structure
    const preview = {
      pageCount: pdfContent.pageCount,
      estimatedWordCount: 0,
      hasImages: pdfContent.images.length > 0,
      imageCount: pdfContent.images.length,
      hasStructuredContent: false,
      contentTypes: [],
      metadata: pdfContent.metadata,
      pages: []
    };
    
    // Analyze each page
    for (const page of pdfContent.pages) {
      if (page.error) continue;
      
      const pagePreview = {
        pageNumber: page.pageNumber,
        wordCount: page.text.split(/\s+/).length,
        hasHeadings: page.structure.headings.length > 0,
        hasLists: page.structure.lists.length > 0,
        hasTables: page.structure.tables.length > 0,
        paragraphCount: page.structure.paragraphs.length
      };
      
      preview.estimatedWordCount += pagePreview.wordCount;
      
      if (pagePreview.hasHeadings) preview.contentTypes.push('headings');
      if (pagePreview.hasLists) preview.contentTypes.push('lists');
      if (pagePreview.hasTables) preview.contentTypes.push('tables');
      
      preview.pages.push(pagePreview);
    }
    
    // Remove duplicates from content types
    preview.contentTypes = [...new Set(preview.contentTypes)];
    preview.hasStructuredContent = preview.contentTypes.length > 0;
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: preview
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Preview generation failed']
    });
  }
}

/**
 * Get conversion statistics
 * @returns {PDFToDOCXOperationResult}
 */
function getConversionStatistics() {
  try {
    const service = getPDFToDOCXService();
    const stats = service.getStatistics();
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: stats
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Failed to get statistics']
    });
  }
}

/**
 * Clear conversion cache
 * @returns {PDFToDOCXOperationResult}
 */
function clearConversionCache() {
  try {
    const service = getPDFToDOCXService();
    service.clearCache();
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: { message: 'Cache cleared successfully' }
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Failed to clear cache']
    });
  }
}

/**
 * Reset conversion statistics
 * @returns {PDFToDOCXOperationResult}
 */
function resetConversionStatistics() {
  try {
    const service = getPDFToDOCXService();
    service.resetStatistics();
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: { message: 'Statistics reset successfully' }
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Failed to reset statistics']
    });
  }
}

/**
 * Listen to conversion events
 * @param {string} eventName - Event name to listen to
 * @param {Function} callback - Event callback function
 * @returns {PDFToDOCXOperationResult}
 */
function onConversionEvent(eventName, callback) {
  try {
    const service = getPDFToDOCXService();
    service.on(eventName, callback);
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: { message: `Event listener added for ${eventName}` }
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Failed to add event listener']
    });
  }
}

/**
 * Remove conversion event listener
 * @param {string} eventName - Event name
 * @param {Function} callback - Event callback function
 * @returns {PDFToDOCXOperationResult}
 */
function offConversionEvent(eventName, callback) {
  try {
    const service = getPDFToDOCXService();
    service.removeListener(eventName, callback);
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: { message: `Event listener removed for ${eventName}` }
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Failed to remove event listener']
    });
  }
}

/**
 * Convert PDF to intermediate format (HTML/Markdown)
 * @param {string} inputPath - Path to input PDF file
 * @param {string} format - Output format ('html' or 'markdown')
 * @param {Object} options - Conversion options
 * @returns {Promise<PDFToDOCXOperationResult>}
 */
async function convertPDFToIntermediate(inputPath, format = 'html', options = {}) {
  try {
    const service = getPDFToDOCXService();
    
    // Extract PDF content
    const pdfContent = await service._extractPDFContent(inputPath, {
      extractImages: options.extractImages || false,
      extractMetadata: options.extractMetadata || true,
      pageRange: options.pageRange || null
    });
    
    // Generate intermediate format
    const intermediateContent = await service._generateIntermediateFormat(pdfContent, {
      intermediateFormat: format,
      ...options
    });
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: {
        content: intermediateContent,
        format,
        metadata: pdfContent.metadata,
        statistics: {
          pageCount: pdfContent.pageCount,
          imageCount: pdfContent.images.length,
          contentLength: intermediateContent.length
        }
      }
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Intermediate conversion failed']
    });
  }
}

/**
 * Estimate conversion time
 * @param {string} inputPath - Path to input PDF file
 * @param {Object} options - Estimation options
 * @returns {Promise<PDFToDOCXOperationResult>}
 */
async function estimateConversionTime(inputPath, options = {}) {
  try {
    const fs = require('fs').promises;
    const stats = await fs.stat(inputPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    // Simple estimation based on file size and complexity
    // These are rough estimates and would need calibration based on actual performance
    const baseTimePerMB = 2000; // 2 seconds per MB
    const complexityMultiplier = options.preserveFormatting ? 1.5 : 1.0;
    const imageMultiplier = options.extractImages ? 1.3 : 1.0;
    
    const estimatedTime = Math.round(
      fileSizeMB * baseTimePerMB * complexityMultiplier * imageMultiplier
    );
    
    return new PDFToDOCXOperationResult({
      success: true,
      data: {
        estimatedTimeMs: estimatedTime,
        estimatedTimeSeconds: Math.round(estimatedTime / 1000),
        fileSizeMB: fileSizeMB.toFixed(2),
        factors: {
          baseTimePerMB,
          complexityMultiplier,
          imageMultiplier
        }
      }
    });
  } catch (error) {
    return new PDFToDOCXOperationResult({
      success: false,
      errors: [error.message || 'Time estimation failed']
    });
  }
}

/**
 * Get supported conversion options
 * @returns {PDFToDOCXOperationResult}
 */
function getSupportedOptions() {
  const options = {
    preserveFormatting: {
      type: 'boolean',
      default: true,
      description: 'Preserve original formatting when possible'
    },
    extractImages: {
      type: 'boolean',
      default: true,
      description: 'Extract and include images in conversion'
    },
    preserveMetadata: {
      type: 'boolean',
      default: true,
      description: 'Preserve document metadata'
    },
    intermediateFormat: {
      type: 'string',
      default: 'html',
      options: ['html', 'markdown', 'text'],
      description: 'Intermediate format for conversion'
    },
    qualityLevel: {
      type: 'string',
      default: 'medium',
      options: ['low', 'medium', 'high'],
      description: 'Conversion quality level'
    },
    pageRange: {
      type: 'object',
      default: null,
      schema: { start: 'number', end: 'number' },
      description: 'Page range to convert (null for all pages)'
    },
    timeout: {
      type: 'number',
      default: 300000,
      description: 'Conversion timeout in milliseconds'
    },
    maxFileSize: {
      type: 'number',
      default: 104857600,
      description: 'Maximum file size in bytes (100MB)'
    }
  };
  
  return new PDFToDOCXOperationResult({
    success: true,
    data: options
  });
}

module.exports = {
  PDFToDOCXOperationResult,
  convertPDFToDOCX,
  convertPDFToDOCXWithProgress,
  batchConvertPDFToDOCX,
  validatePDFForConversion,
  getConversionPreview,
  getConversionStatistics,
  clearConversionCache,
  resetConversionStatistics,
  onConversionEvent,
  offConversionEvent,
  convertPDFToIntermediate,
  estimateConversionTime,
  getSupportedOptions
};