/**
 * DOCX to PDF Wrapper Utility
 * Simplified interface for DOCX to PDF conversion operations
 */

const path = require('path');
const fs = require('fs').promises;
const { getDOCXToPDFService, DOCXToPDFEvents } = require('../services/DOCXToPDFService');
const { getDOCXToPDFErrorHandler } = require('../errors/DOCXToPDFErrorHandler');

/**
 * Result class for DOCX to PDF operations
 */
class DOCXToPDFOperationResult {
  constructor() {
    this.success = false;
    this.message = '';
    this.data = null;
    this.errors = [];
    this.warnings = [];
    this.metadata = {};
    this.statistics = {};
    this.processingTime = 0;
  }

  /**
   * Create success result
   */
  static success(message, data = null) {
    const result = new DOCXToPDFOperationResult();
    result.success = true;
    result.message = message;
    result.data = data;
    return result;
  }

  /**
   * Create error result
   */
  static error(message, errors = []) {
    const result = new DOCXToPDFOperationResult();
    result.success = false;
    result.message = message;
    result.errors = Array.isArray(errors) ? errors : [errors];
    return result;
  }

  /**
   * Add warning
   */
  addWarning(warning) {
    this.warnings.push(warning);
  }

  /**
   * Add error
   */
  addError(error) {
    this.errors.push(error);
    this.success = false;
  }
}

/**
 * Convert single DOCX file to PDF
 */
async function convertDOCXToPDF(inputPath, outputPath, options = {}) {
  try {
    const service = getDOCXToPDFService();
    const result = await service.convertDOCXToPDF(inputPath, outputPath, options);
    
    if (result.success) {
      return DOCXToPDFOperationResult.success(
        `Successfully converted DOCX to PDF: ${path.basename(outputPath)}`,
        {
          inputPath,
          outputPath,
          metadata: result.metadata,
          statistics: result.getSummary(),
          processingTime: result.processingTime
        }
      );
    } else {
      return DOCXToPDFOperationResult.error(
        `Failed to convert DOCX to PDF: ${result.errors.join(', ')}`,
        result.errors
      );
    }
  } catch (error) {
    const errorHandler = getDOCXToPDFErrorHandler();
    const handledError = await errorHandler.handleError(error, {
      operation: 'convertDOCXToPDF',
      inputPath,
      outputPath
    });
    
    return DOCXToPDFOperationResult.error(
      `Conversion failed: ${handledError.message}`,
      [handledError.message]
    );
  }
}

/**
 * Convert multiple DOCX files to PDF
 */
async function batchConvertDOCXToPDF(inputFiles, outputDir, options = {}) {
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    const service = getDOCXToPDFService();
    const batchResult = await service.batchConvertDOCXToPDF(inputFiles, outputDir, options);
    
    const operationResult = DOCXToPDFOperationResult.success(
      `Batch conversion completed: ${batchResult.successfulConversions}/${batchResult.totalFiles} files converted`,
      {
        totalFiles: batchResult.totalFiles,
        successfulConversions: batchResult.successfulConversions,
        failedConversions: batchResult.failedConversions,
        results: batchResult.results,
        outputDir
      }
    );
    
    // Add warnings for failed conversions
    batchResult.results.forEach(result => {
      if (!result.success) {
        operationResult.addWarning(`Failed to convert ${path.basename(result.inputPath)}: ${result.errors.join(', ')}`);
      }
    });
    
    return operationResult;
  } catch (error) {
    const errorHandler = getDOCXToPDFErrorHandler();
    const handledError = await errorHandler.handleError(error, {
      operation: 'batchConvertDOCXToPDF',
      inputFiles,
      outputDir
    });
    
    return DOCXToPDFOperationResult.error(
      `Batch conversion failed: ${handledError.message}`,
      [handledError.message]
    );
  }
}

/**
 * Convert DOCX to PDF with progress reporting
 */
async function convertDOCXToPDFWithProgress(inputPath, outputPath, options = {}, progressCallback = null) {
  try {
    const service = getDOCXToPDFService();
    
    // Set up progress listener
    if (progressCallback) {
      const progressListener = (data) => {
        progressCallback({
          stage: 'conversion',
          progress: data.percentage || 0,
          message: data.message || 'Converting...',
          details: data
        });
      };
      
      service.on(DOCXToPDFEvents.PROGRESS_UPDATE, progressListener);
      service.on(DOCXToPDFEvents.DOCX_PARSED, () => progressCallback({ stage: 'parsing', progress: 25, message: 'DOCX parsed' }));
      service.on(DOCXToPDFEvents.HTML_GENERATED, () => progressCallback({ stage: 'html_generation', progress: 50, message: 'HTML generated' }));
      service.on(DOCXToPDFEvents.PDF_GENERATION_STARTED, () => progressCallback({ stage: 'pdf_generation', progress: 75, message: 'Generating PDF' }));
      service.on(DOCXToPDFEvents.PDF_GENERATED, () => progressCallback({ stage: 'completion', progress: 100, message: 'PDF generated' }));
      
      try {
        const result = await service.convertDOCXToPDF(inputPath, outputPath, options);
        
        // Clean up listeners
        service.removeListener(DOCXToPDFEvents.PROGRESS_UPDATE, progressListener);
        
        return result.success ? 
          DOCXToPDFOperationResult.success('Conversion completed with progress tracking', result) :
          DOCXToPDFOperationResult.error('Conversion failed', result.errors);
      } finally {
        // Ensure listeners are removed
        service.removeListener(DOCXToPDFEvents.PROGRESS_UPDATE, progressListener);
      }
    } else {
      return await convertDOCXToPDF(inputPath, outputPath, options);
    }
  } catch (error) {
    const errorHandler = getDOCXToPDFErrorHandler();
    const handledError = await errorHandler.handleError(error, {
      operation: 'convertDOCXToPDFWithProgress',
      inputPath,
      outputPath
    });
    
    return DOCXToPDFOperationResult.error(
      `Progress conversion failed: ${handledError.message}`,
      [handledError.message]
    );
  }
}

/**
 * Validate DOCX file for conversion
 */
async function validateDOCXForConversion(inputPath) {
  try {
    const service = getDOCXToPDFService();
    await service._validateInput(inputPath, service.options);
    
    return DOCXToPDFOperationResult.success(
      `DOCX file is valid for conversion: ${path.basename(inputPath)}`,
      { inputPath, valid: true }
    );
  } catch (error) {
    return DOCXToPDFOperationResult.error(
      `DOCX validation failed: ${error.message}`,
      [error.message]
    );
  }
}

/**
 * Get conversion preview information
 */
async function getDOCXConversionPreview(inputPath, options = {}) {
  try {
    const service = getDOCXToPDFService();
    
    // Extract content for preview
    const { htmlContent, metadata } = await service._extractDOCXContent(inputPath, {
      ...service.options,
      ...options
    });
    
    // Generate preview statistics
    const textContent = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textContent.split(' ').filter(word => word.length > 0).length;
    const characterCount = textContent.length;
    const estimatedPages = Math.max(1, Math.ceil(wordCount / 250)); // Rough estimate
    
    const preview = {
      metadata,
      statistics: {
        wordCount,
        characterCount,
        estimatedPages,
        htmlLength: htmlContent.length
      },
      htmlPreview: htmlContent.substring(0, 1000) + (htmlContent.length > 1000 ? '...' : ''),
      textPreview: textContent.substring(0, 500) + (textContent.length > 500 ? '...' : '')
    };
    
    return DOCXToPDFOperationResult.success(
      `Preview generated for: ${path.basename(inputPath)}`,
      preview
    );
  } catch (error) {
    const errorHandler = getDOCXToPDFErrorHandler();
    const handledError = await errorHandler.handleError(error, {
      operation: 'getDOCXConversionPreview',
      inputPath
    });
    
    return DOCXToPDFOperationResult.error(
      `Preview generation failed: ${handledError.message}`,
      [handledError.message]
    );
  }
}

/**
 * Get service statistics
 */
function getDOCXToPDFStatistics() {
  try {
    const service = getDOCXToPDFService();
    const stats = service.getStatistics();
    
    return DOCXToPDFOperationResult.success(
      'Statistics retrieved successfully',
      {
        ...stats,
        cacheSize: service.getCacheSize(),
        successRate: stats.totalConversions > 0 ? 
          (stats.successfulConversions / stats.totalConversions * 100).toFixed(2) + '%' : '0%'
      }
    );
  } catch (error) {
    return DOCXToPDFOperationResult.error(
      `Failed to retrieve statistics: ${error.message}`,
      [error.message]
    );
  }
}

/**
 * Reset service statistics
 */
function resetDOCXToPDFStatistics() {
  try {
    const service = getDOCXToPDFService();
    service.resetStatistics();
    
    return DOCXToPDFOperationResult.success(
      'Statistics reset successfully',
      { reset: true }
    );
  } catch (error) {
    return DOCXToPDFOperationResult.error(
      `Failed to reset statistics: ${error.message}`,
      [error.message]
    );
  }
}

/**
 * Clear service cache
 */
function clearDOCXToPDFCache() {
  try {
    const service = getDOCXToPDFService();
    const cacheSize = service.getCacheSize();
    service.clearCache();
    
    return DOCXToPDFOperationResult.success(
      `Cache cleared successfully (${cacheSize} items removed)`,
      { clearedItems: cacheSize }
    );
  } catch (error) {
    return DOCXToPDFOperationResult.error(
      `Failed to clear cache: ${error.message}`,
      [error.message]
    );
  }
}

/**
 * Listen to conversion events
 */
function listenToDOCXToPDFEvents(eventCallback) {
  try {
    const service = getDOCXToPDFService();
    
    // Set up event listeners
    Object.values(DOCXToPDFEvents).forEach(eventName => {
      service.on(eventName, (data) => {
        eventCallback({
          event: eventName,
          timestamp: Date.now(),
          data
        });
      });
    });
    
    return DOCXToPDFOperationResult.success(
      'Event listeners set up successfully',
      { eventsListening: Object.values(DOCXToPDFEvents) }
    );
  } catch (error) {
    return DOCXToPDFOperationResult.error(
      `Failed to set up event listeners: ${error.message}`,
      [error.message]
    );
  }
}

/**
 * Convert DOCX to intermediate format (HTML)
 */
async function convertDOCXToHTML(inputPath, outputPath, options = {}) {
  try {
    const service = getDOCXToPDFService();
    
    // Extract DOCX content
    const { htmlContent, metadata } = await service._extractDOCXContent(inputPath, {
      ...service.options,
      ...options
    });
    
    // Generate styled HTML
    const styledHtml = await service._generateStyledHTML(htmlContent, {
      ...service.options,
      ...options
    });
    
    // Save HTML file
    await fs.writeFile(outputPath, styledHtml, 'utf8');
    
    return DOCXToPDFOperationResult.success(
      `Successfully converted DOCX to HTML: ${path.basename(outputPath)}`,
      {
        inputPath,
        outputPath,
        metadata,
        htmlLength: styledHtml.length
      }
    );
  } catch (error) {
    const errorHandler = getDOCXToPDFErrorHandler();
    const handledError = await errorHandler.handleError(error, {
      operation: 'convertDOCXToHTML',
      inputPath,
      outputPath
    });
    
    return DOCXToPDFOperationResult.error(
      `DOCX to HTML conversion failed: ${handledError.message}`,
      [handledError.message]
    );
  }
}

/**
 * Estimate conversion time
 */
async function estimateDOCXToPDFConversionTime(inputPath, options = {}) {
  try {
    const stats = await fs.stat(inputPath);
    const fileSizeKB = stats.size / 1024;
    
    // Get service statistics for better estimation
    const service = getDOCXToPDFService();
    const serviceStats = service.getStatistics();
    
    let estimatedTime;
    
    if (serviceStats.totalConversions > 0 && serviceStats.averageProcessingTime > 0) {
      // Use historical data for estimation
      const avgTimePerKB = serviceStats.averageProcessingTime / 100; // Assume average file is 100KB
      estimatedTime = Math.max(1000, fileSizeKB * avgTimePerKB); // Minimum 1 second
    } else {
      // Use default estimation
      estimatedTime = Math.max(2000, fileSizeKB * 50); // ~50ms per KB, minimum 2 seconds
    }
    
    return DOCXToPDFOperationResult.success(
      `Estimated conversion time: ${Math.round(estimatedTime / 1000)} seconds`,
      {
        inputPath,
        fileSizeKB: Math.round(fileSizeKB),
        estimatedTimeMs: Math.round(estimatedTime),
        estimatedTimeSeconds: Math.round(estimatedTime / 1000),
        basedOnHistoricalData: serviceStats.totalConversions > 0
      }
    );
  } catch (error) {
    return DOCXToPDFOperationResult.error(
      `Failed to estimate conversion time: ${error.message}`,
      [error.message]
    );
  }
}

/**
 * Get supported conversion options
 */
function getSupportedDOCXToPDFOptions() {
  try {
    const service = getDOCXToPDFService();
    const defaultOptions = service.options;
    
    const supportedOptions = {
      htmlGeneration: {
        preserveFormatting: { type: 'boolean', default: defaultOptions.preserveFormatting },
        includeDefaultStyleMap: { type: 'boolean', default: defaultOptions.includeDefaultStyleMap }
      },
      pdfGeneration: {
        pageSize: { type: 'string', default: defaultOptions.pageSize, options: ['A4', 'Letter', 'Legal'] },
        fontSize: { type: 'number', default: defaultOptions.fontSize, min: 8, max: 24 },
        fontFamily: { type: 'string', default: defaultOptions.fontFamily, options: ['Helvetica', 'Times-Roman', 'Courier'] },
        lineHeight: { type: 'number', default: defaultOptions.lineHeight, min: 1.0, max: 2.0 },
        margins: {
          type: 'object',
          default: defaultOptions.margins,
          properties: {
            top: { type: 'number', min: 36, max: 144 },
            bottom: { type: 'number', min: 36, max: 144 },
            left: { type: 'number', min: 36, max: 144 },
            right: { type: 'number', min: 36, max: 144 }
          }
        }
      },
      performance: {
        enableCache: { type: 'boolean', default: defaultOptions.enableCache },
        maxFileSize: { type: 'number', default: defaultOptions.maxFileSize },
        timeout: { type: 'number', default: defaultOptions.timeout }
      },
      quality: {
        embedFonts: { type: 'boolean', default: defaultOptions.embedFonts },
        compressPDF: { type: 'boolean', default: defaultOptions.compressPDF },
        preserveImages: { type: 'boolean', default: defaultOptions.preserveImages },
        imageQuality: { type: 'number', default: defaultOptions.imageQuality, min: 0.1, max: 1.0 }
      }
    };
    
    return DOCXToPDFOperationResult.success(
      'Supported options retrieved successfully',
      supportedOptions
    );
  } catch (error) {
    return DOCXToPDFOperationResult.error(
      `Failed to retrieve supported options: ${error.message}`,
      [error.message]
    );
  }
}

module.exports = {
  DOCXToPDFOperationResult,
  convertDOCXToPDF,
  batchConvertDOCXToPDF,
  convertDOCXToPDFWithProgress,
  validateDOCXForConversion,
  getDOCXConversionPreview,
  getDOCXToPDFStatistics,
  resetDOCXToPDFStatistics,
  clearDOCXToPDFCache,
  listenToDOCXToPDFEvents,
  convertDOCXToHTML,
  estimateDOCXToPDFConversionTime,
  getSupportedDOCXToPDFOptions
};