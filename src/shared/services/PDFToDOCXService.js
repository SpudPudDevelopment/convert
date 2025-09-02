/**
 * PDF to DOCX Conversion Service
 * Handles the complete pipeline for converting PDF documents to DOCX format
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const { getPDFService } = require('./PDFService');
const { getDOCXService } = require('./DOCXService');
const { handlePDFError } = require('../errors/PDFErrorHandler');
const { handleDOCXError } = require('../errors/DOCXErrorHandler');

/**
 * PDF to DOCX conversion result class
 */
class PDFToDOCXResult {
  constructor(data = {}) {
    this.success = data.success || false;
    this.inputPath = data.inputPath || null;
    this.outputPath = data.outputPath || null;
    this.metadata = data.metadata || {};
    this.statistics = data.statistics || {};
    this.warnings = data.warnings || [];
    this.errors = data.errors || [];
    this.processingTime = data.processingTime || 0;
    this.conversionSteps = data.conversionSteps || [];
  }

  /**
   * Add conversion step
   */
  addStep(step, duration, success = true, details = {}) {
    this.conversionSteps.push({
      step,
      duration,
      success,
      details,
      timestamp: new Date().toISOString()
    });
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

  /**
   * Get conversion summary
   */
  getSummary() {
    return {
      success: this.success,
      totalSteps: this.conversionSteps.length,
      successfulSteps: this.conversionSteps.filter(s => s.success).length,
      failedSteps: this.conversionSteps.filter(s => !s.success).length,
      totalTime: this.processingTime,
      averageStepTime: this.conversionSteps.length > 0 
        ? this.conversionSteps.reduce((sum, s) => sum + s.duration, 0) / this.conversionSteps.length 
        : 0,
      warningCount: this.warnings.length,
      errorCount: this.errors.length
    };
  }
}

/**
 * PDF to DOCX conversion events
 */
const PDFToDOCXEvents = {
  CONVERSION_STARTED: 'conversionStarted',
  STEP_COMPLETED: 'stepCompleted',
  PROGRESS_UPDATE: 'progressUpdate',
  CONVERSION_COMPLETED: 'conversionCompleted',
  CONVERSION_FAILED: 'conversionFailed',
  WARNING: 'warning',
  ERROR: 'error'
};

/**
 * Default conversion options
 */
const DEFAULT_CONVERSION_OPTIONS = {
  preserveFormatting: true,
  extractImages: true,
  preserveMetadata: true,
  optimizeForSize: false,
  progressCallback: null,
  intermediateFormat: 'html', // html, markdown, text
  qualityLevel: 'medium', // low, medium, high
  pageRange: null, // { start: 1, end: 10 } or null for all pages
  timeout: 300000, // 5 minutes
  maxFileSize: 100 * 1024 * 1024, // 100MB
  enableOCR: false, // For scanned PDFs
  language: 'en' // For OCR
};

/**
 * PDF to DOCX Conversion Service
 */
class PDFToDOCXService extends EventEmitter {
  constructor() {
    super();
    this.pdfService = getPDFService();
    this.docxService = getDOCXService();
    this.conversionCache = new Map();
    this.statistics = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Convert PDF to DOCX
   */
  async convertPDFToDOCX(inputPath, outputPath, options = {}) {
    const startTime = Date.now();
    const opts = { ...DEFAULT_CONVERSION_OPTIONS, ...options };
    const result = new PDFToDOCXResult({
      inputPath,
      outputPath
    });

    this.emit(PDFToDOCXEvents.CONVERSION_STARTED, {
      inputPath,
      outputPath,
      options: opts
    });

    try {
      // Validate input file
      await this._validateInput(inputPath, opts);
      result.addStep('validation', Date.now() - startTime, true);

      // Check cache
      const cacheKey = this._generateCacheKey(inputPath, opts);
      if (this.conversionCache.has(cacheKey) && !opts.bypassCache) {
        this.statistics.cacheHits++;
        const cachedResult = this.conversionCache.get(cacheKey);
        result.addStep('cache_retrieval', Date.now() - startTime, true);
        
        // Copy cached file to output path
        await fs.copyFile(cachedResult.outputPath, outputPath);
        result.outputPath = outputPath;
        result.success = true;
        result.processingTime = Date.now() - startTime;
        
        this.emit(PDFToDOCXEvents.CONVERSION_COMPLETED, result);
        return result;
      }
      this.statistics.cacheMisses++;

      // Step 1: Extract PDF content
      const stepStart = Date.now();
      const pdfContent = await this._extractPDFContent(inputPath, opts);
      result.addStep('pdf_extraction', Date.now() - stepStart, true, {
        pageCount: pdfContent.pageCount,
        textLength: pdfContent.text.length,
        imageCount: pdfContent.images.length
      });
      result.metadata.source = pdfContent.metadata;

      this._emitProgress(25, 'PDF content extracted');

      // Step 2: Generate intermediate format
      const intermediateStart = Date.now();
      const intermediateContent = await this._generateIntermediateFormat(pdfContent, opts);
      result.addStep('intermediate_generation', Date.now() - intermediateStart, true, {
        format: opts.intermediateFormat,
        contentLength: intermediateContent.length
      });

      this._emitProgress(50, 'Intermediate format generated');

      // Step 3: Generate DOCX
      const docxStart = Date.now();
      const docxResult = await this._generateDOCX(intermediateContent, outputPath, pdfContent, opts);
      result.addStep('docx_generation', Date.now() - docxStart, true, {
        fileSize: docxResult.fileSize,
        wordCount: docxResult.wordCount
      });
      result.metadata.target = docxResult.metadata;

      this._emitProgress(75, 'DOCX document generated');

      // Step 4: Post-processing
      const postStart = Date.now();
      await this._postProcessDOCX(outputPath, pdfContent, opts);
      result.addStep('post_processing', Date.now() - postStart, true);

      this._emitProgress(100, 'Conversion completed');

      // Update result
      result.success = true;
      result.processingTime = Date.now() - startTime;
      result.statistics = {
        inputFileSize: (await fs.stat(inputPath)).size,
        outputFileSize: (await fs.stat(outputPath)).size,
        compressionRatio: 0,
        pageCount: pdfContent.pageCount,
        wordCount: docxResult.wordCount || 0,
        imageCount: pdfContent.images.length
      };
      result.statistics.compressionRatio = result.statistics.inputFileSize > 0 
        ? (result.statistics.outputFileSize / result.statistics.inputFileSize).toFixed(2)
        : 0;

      // Cache result
      if (!opts.bypassCache) {
        this.conversionCache.set(cacheKey, {
          outputPath,
          timestamp: Date.now(),
          metadata: result.metadata
        });
      }

      // Update statistics
      this._updateStatistics(result);

      this.emit(PDFToDOCXEvents.CONVERSION_COMPLETED, result);
      return result;

    } catch (error) {
      result.addError(error.message || 'Conversion failed');
      result.processingTime = Date.now() - startTime;
      
      this._updateStatistics(result);
      this.emit(PDFToDOCXEvents.CONVERSION_FAILED, { error, result });
      
      return result;
    }
  }

  /**
   * Batch convert multiple PDFs to DOCX
   */
  async batchConvertPDFToDOCX(inputFiles, outputDir, options = {}) {
    const results = [];
    const errors = [];
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    for (let i = 0; i < inputFiles.length; i++) {
      const inputFile = inputFiles[i];
      
      try {
        const fileName = path.basename(inputFile, '.pdf');
        const outputPath = path.join(outputDir, `${fileName}.docx`);
        
        const result = await this.convertPDFToDOCX(inputFile, outputPath, options);
        results.push({
          inputFile,
          outputPath,
          success: result.success,
          result
        });
        
        // Emit batch progress
        this.emit(PDFToDOCXEvents.PROGRESS_UPDATE, {
          type: 'batch',
          completed: i + 1,
          total: inputFiles.length,
          currentFile: inputFile,
          progress: ((i + 1) / inputFiles.length * 100).toFixed(1)
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
    
    return {
      totalFiles: inputFiles.length,
      successfulConversions: results.filter(r => r.success).length,
      failedConversions: errors.length,
      results,
      errors
    };
  }

  /**
   * Validate input file
   */
  async _validateInput(inputPath, options) {
    // Check if file exists
    const stats = await fs.stat(inputPath);
    
    // Check file size
    if (stats.size > options.maxFileSize) {
      throw new Error(`File size (${stats.size}) exceeds maximum allowed size (${options.maxFileSize})`);
    }
    
    // Check file extension
    const ext = path.extname(inputPath).toLowerCase();
    if (ext !== '.pdf') {
      throw new Error(`Invalid file extension: ${ext}. Expected .pdf`);
    }
    
    // Validate PDF structure
    try {
      await this.pdfService.parsePDF(inputPath, { extractText: false, extractImages: false });
    } catch (error) {
      throw new Error(`Invalid PDF file: ${error.message}`);
    }
  }

  /**
   * Extract content from PDF
   */
  async _extractPDFContent(inputPath, options) {
    const pdfInfo = await this.pdfService.parsePDF(inputPath, {
      extractText: true,
      extractImages: options.extractImages,
      extractMetadata: options.preserveMetadata,
      pageRange: options.pageRange
    });

    // Extract structured content
    const content = {
      text: pdfInfo.getPlainText(),
      pages: [],
      images: [],
      metadata: pdfInfo.metadata,
      pageCount: pdfInfo.getPageCount()
    };

    // Extract page-by-page content for better structure preservation
    for (let i = 1; i <= content.pageCount; i++) {
      if (options.pageRange && (i < options.pageRange.start || i > options.pageRange.end)) {
        continue;
      }

      try {
        const pageText = await this.pdfService.extractTextFromPage(inputPath, i);
        const pageStructure = this._analyzePageStructure(pageText);
        
        content.pages.push({
          pageNumber: i,
          text: pageText,
          structure: pageStructure
        });
      } catch (error) {
        content.pages.push({
          pageNumber: i,
          text: '',
          structure: { paragraphs: [], headings: [], lists: [] },
          error: error.message
        });
      }
    }

    // Extract images if requested
    if (options.extractImages) {
      try {
        const images = await this.pdfService.extractImages(inputPath);
        content.images = images;
      } catch (error) {
        // Images extraction is optional, continue without them
        content.images = [];
      }
    }

    return content;
  }

  /**
   * Analyze page structure for formatting preservation
   */
  _analyzePageStructure(text) {
    const lines = text.split('\n');
    const structure = {
      paragraphs: [],
      headings: [],
      lists: [],
      tables: []
    };

    let currentParagraph = '';
    let inList = false;
    let listItems = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) {
        if (currentParagraph) {
          structure.paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
        if (inList && listItems.length > 0) {
          structure.lists.push(listItems);
          listItems = [];
          inList = false;
        }
        continue;
      }

      // Detect headings (simple heuristic)
      if (this._isHeading(line)) {
        if (currentParagraph) {
          structure.paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
        structure.headings.push({
          text: line,
          level: this._getHeadingLevel(line)
        });
        continue;
      }

      // Detect list items
      if (this._isListItem(line)) {
        if (currentParagraph) {
          structure.paragraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
        inList = true;
        listItems.push(line);
        continue;
      }

      // Regular text
      if (inList && listItems.length > 0) {
        structure.lists.push(listItems);
        listItems = [];
        inList = false;
      }
      
      currentParagraph += (currentParagraph ? ' ' : '') + line;
    }

    // Add remaining content
    if (currentParagraph) {
      structure.paragraphs.push(currentParagraph.trim());
    }
    if (inList && listItems.length > 0) {
      structure.lists.push(listItems);
    }

    return structure;
  }

  /**
   * Check if line is a heading
   */
  _isHeading(line) {
    // Simple heuristics for heading detection
    return (
      line.length < 100 && // Short lines
      (line.toUpperCase() === line || // All caps
       /^\d+\.\s/.test(line) || // Numbered sections
       /^[A-Z][a-z]+:/.test(line)) // Title case with colon
    );
  }

  /**
   * Get heading level
   */
  _getHeadingLevel(line) {
    if (/^\d+\.\s/.test(line)) return 1;
    if (/^\d+\.\d+\.\s/.test(line)) return 2;
    if (/^\d+\.\d+\.\d+\.\s/.test(line)) return 3;
    if (line.toUpperCase() === line) return 1;
    return 2;
  }

  /**
   * Check if line is a list item
   */
  _isListItem(line) {
    return (
      /^[•·▪▫-]\s/.test(line) || // Bullet points
      /^\d+\.\s/.test(line) || // Numbered lists
      /^[a-zA-Z]\)\s/.test(line) // Lettered lists
    );
  }

  /**
   * Generate intermediate format
   */
  async _generateIntermediateFormat(pdfContent, options) {
    switch (options.intermediateFormat) {
      case 'html':
        return this._generateHTML(pdfContent, options);
      case 'markdown':
        return this._generateMarkdown(pdfContent, options);
      case 'text':
        return pdfContent.text;
      default:
        throw new Error(`Unsupported intermediate format: ${options.intermediateFormat}`);
    }
  }

  /**
   * Generate HTML from PDF content
   */
  _generateHTML(pdfContent, options) {
    let html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>Converted Document</title>\n</head>\n<body>\n';

    for (const page of pdfContent.pages) {
      if (page.error) continue;

      const structure = page.structure;

      // Add headings
      for (const heading of structure.headings) {
        html += `<h${heading.level}>${this._escapeHtml(heading.text)}</h${heading.level}>\n`;
      }

      // Add paragraphs
      for (const paragraph of structure.paragraphs) {
        html += `<p>${this._escapeHtml(paragraph)}</p>\n`;
      }

      // Add lists
      for (const list of structure.lists) {
        const isNumbered = /^\d+\./.test(list[0]);
        const tag = isNumbered ? 'ol' : 'ul';
        html += `<${tag}>\n`;
        for (const item of list) {
          const cleanItem = item.replace(/^[•·▪▫-]\s|^\d+\.\s|^[a-zA-Z]\)\s/, '');
          html += `<li>${this._escapeHtml(cleanItem)}</li>\n`;
        }
        html += `</${tag}>\n`;
      }
    }

    html += '</body>\n</html>';
    return html;
  }

  /**
   * Generate Markdown from PDF content
   */
  _generateMarkdown(pdfContent, options) {
    let markdown = '';

    for (const page of pdfContent.pages) {
      if (page.error) continue;

      const structure = page.structure;

      // Add headings
      for (const heading of structure.headings) {
        const prefix = '#'.repeat(heading.level);
        markdown += `${prefix} ${heading.text}\n\n`;
      }

      // Add paragraphs
      for (const paragraph of structure.paragraphs) {
        markdown += `${paragraph}\n\n`;
      }

      // Add lists
      for (const list of structure.lists) {
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const isNumbered = /^\d+\./.test(item);
          const cleanItem = item.replace(/^[•·▪▫-]\s|^\d+\.\s|^[a-zA-Z]\)\s/, '');
          
          if (isNumbered) {
            markdown += `${i + 1}. ${cleanItem}\n`;
          } else {
            markdown += `- ${cleanItem}\n`;
          }
        }
        markdown += '\n';
      }
    }

    return markdown;
  }

  /**
   * Escape HTML characters
   */
  _escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Generate DOCX from intermediate content
   */
  async _generateDOCX(intermediateContent, outputPath, pdfContent, options) {
    // For now, we'll create a simple DOCX with the content
    // In a full implementation, you would use a library like docx or officegen
    
    // Create a temporary HTML file
    const tempHtmlPath = outputPath.replace('.docx', '.temp.html');
    await fs.writeFile(tempHtmlPath, intermediateContent);
    
    try {
      // Use a hypothetical HTML to DOCX converter
      // This would need to be implemented with a proper library
      const docxContent = await this._convertHTMLToDOCX(intermediateContent, options);
      
      // Write DOCX file
      await fs.writeFile(outputPath, docxContent);
      
      // Get file stats
      const stats = await fs.stat(outputPath);
      
      return {
        fileSize: stats.size,
        wordCount: this._estimateWordCount(intermediateContent),
        metadata: {
          creator: 'PDF to DOCX Converter',
          created: new Date().toISOString(),
          modified: new Date().toISOString(),
          title: pdfContent.metadata.title || 'Converted Document'
        }
      };
      
    } finally {
      // Clean up temporary file
      try {
        await fs.unlink(tempHtmlPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Convert HTML to DOCX (placeholder implementation)
   */
  async _convertHTMLToDOCX(htmlContent, options) {
    // This is a placeholder implementation
    // In a real implementation, you would use a library like:
    // - html-docx-js
    // - mammoth (reverse)
    // - pandoc
    // - or build a custom converter
    
    // For now, return a minimal DOCX structure
    const JSZip = require('jszip');
    const zip = new JSZip();
    
    // Extract text from HTML
    const textContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Create minimal DOCX structure
    zip.file('[Content_Types].xml', this._getContentTypesXML());
    zip.folder('_rels').file('.rels', this._getRelsXML());
    zip.folder('word').file('document.xml', this._getDocumentXML(textContent));
    zip.folder('word').file('styles.xml', this._getStylesXML());
    zip.folder('word/_rels').file('document.xml.rels', this._getDocumentRelsXML());
    
    return await zip.generateAsync({ type: 'nodebuffer' });
  }

  /**
   * Get Content Types XML
   */
  _getContentTypesXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  }

  /**
   * Get Rels XML
   */
  _getRelsXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  }

  /**
   * Get Document XML
   */
  _getDocumentXML(textContent) {
    const escapedText = textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${escapedText}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;
  }

  /**
   * Get Styles XML
   */
  _getStylesXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
        <w:sz w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;
  }

  /**
   * Get Document Rels XML
   */
  _getDocumentRelsXML() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  /**
   * Estimate word count from content
   */
  _estimateWordCount(content) {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.split(' ').length : 0;
  }

  /**
   * Post-process DOCX file
   */
  async _postProcessDOCX(outputPath, pdfContent, options) {
    // Placeholder for post-processing steps
    // Could include:
    // - Metadata injection
    // - Image embedding
    // - Style optimization
    // - Compression
  }

  /**
   * Generate cache key
   */
  _generateCacheKey(inputPath, options) {
    const crypto = require('crypto');
    const keyData = {
      inputPath,
      options: {
        preserveFormatting: options.preserveFormatting,
        extractImages: options.extractImages,
        intermediateFormat: options.intermediateFormat,
        qualityLevel: options.qualityLevel,
        pageRange: options.pageRange
      }
    };
    return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }

  /**
   * Emit progress update
   */
  _emitProgress(percentage, message) {
    this.emit(PDFToDOCXEvents.PROGRESS_UPDATE, {
      type: 'conversion',
      percentage,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Update statistics
   */
  _updateStatistics(result) {
    this.statistics.totalConversions++;
    
    if (result.success) {
      this.statistics.successfulConversions++;
    } else {
      this.statistics.failedConversions++;
    }
    
    this.statistics.totalProcessingTime += result.processingTime;
    this.statistics.averageProcessingTime = 
      this.statistics.totalProcessingTime / this.statistics.totalConversions;
  }

  /**
   * Get conversion statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      successRate: this.statistics.totalConversions > 0 
        ? (this.statistics.successfulConversions / this.statistics.totalConversions * 100).toFixed(2) + '%'
        : '0%',
      cacheHitRate: (this.statistics.cacheHits + this.statistics.cacheMisses) > 0
        ? (this.statistics.cacheHits / (this.statistics.cacheHits + this.statistics.cacheMisses) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear conversion cache
   */
  clearCache() {
    this.conversionCache.clear();
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }
}

// Global service instance
let globalPDFToDOCXService = null;

/**
 * Get global PDF to DOCX service instance
 */
function getPDFToDOCXService() {
  if (!globalPDFToDOCXService) {
    globalPDFToDOCXService = new PDFToDOCXService();
  }
  return globalPDFToDOCXService;
}

module.exports = {
  PDFToDOCXService,
  PDFToDOCXResult,
  PDFToDOCXEvents,
  DEFAULT_CONVERSION_OPTIONS,
  getPDFToDOCXService
};