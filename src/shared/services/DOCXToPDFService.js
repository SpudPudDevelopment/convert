/**
 * DOCX to PDF Conversion Service
 * Comprehensive service for converting Microsoft Word documents to PDF format
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const mammoth = require('mammoth');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const JSZip = require('jszip');

/**
 * Result class for DOCX to PDF conversion operations
 */
class DOCXToPDFResult {
  constructor() {
    this.success = false;
    this.inputPath = null;
    this.outputPath = null;
    this.metadata = {};
    this.statistics = {};
    this.warnings = [];
    this.errors = [];
    this.processingTime = 0;
    this.conversionSteps = [];
    this.htmlContent = null;
    this.pdfSize = 0;
  }

  /**
   * Add a conversion step
   */
  addStep(step, duration, success = true, details = {}) {
    this.conversionSteps.push({
      step,
      duration,
      success,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Add warning message
   */
  addWarning(message) {
    this.warnings.push(message);
  }

  /**
   * Add error message
   */
  addError(message) {
    this.errors.push(message);
    this.success = false;
  }

  /**
   * Get conversion summary
   */
  getSummary() {
    return {
      totalSteps: this.conversionSteps.length,
      successfulSteps: this.conversionSteps.filter(s => s.success).length,
      failedSteps: this.conversionSteps.filter(s => !s.success).length,
      totalTime: this.processingTime,
      averageStepTime: this.conversionSteps.length > 0 ? 
        this.conversionSteps.reduce((sum, s) => sum + s.duration, 0) / this.conversionSteps.length : 0,
      warningCount: this.warnings.length,
      errorCount: this.errors.length,
      outputSizeKB: Math.round(this.pdfSize / 1024)
    };
  }
}

/**
 * Events emitted by the DOCX to PDF service
 */
const DOCXToPDFEvents = {
  CONVERSION_STARTED: 'conversion_started',
  DOCX_PARSED: 'docx_parsed',
  HTML_GENERATED: 'html_generated',
  PDF_GENERATION_STARTED: 'pdf_generation_started',
  PDF_GENERATED: 'pdf_generated',
  CONVERSION_COMPLETED: 'conversion_completed',
  CONVERSION_FAILED: 'conversion_failed',
  PROGRESS_UPDATE: 'progress_update',
  WARNING: 'warning',
  ERROR: 'error'
};

/**
 * Default conversion options
 */
const DEFAULT_CONVERSION_OPTIONS = {
  // HTML generation options
  preserveFormatting: true,
  includeDefaultStyleMap: true,
  convertImage: mammoth.images.imgElement(function(image) {
    return image.read("base64").then(function(imageBuffer) {
      return {
        src: "data:" + image.contentType + ";base64," + imageBuffer
      };
    });
  }),
  
  // PDF generation options
  pageSize: 'A4',
  margins: {
    top: 72,    // 1 inch
    bottom: 72,
    left: 72,
    right: 72
  },
  fontSize: 12,
  fontFamily: 'Helvetica',
  lineHeight: 1.2,
  
  // Performance options
  enableCache: true,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  timeout: 300000, // 5 minutes
  
  // Quality options
  embedFonts: true,
  compressPDF: true,
  preserveImages: true,
  imageQuality: 0.8
};

/**
 * Style mapping for better HTML to PDF conversion
 */
const STYLE_MAPPINGS = {
  'p[style-name="Heading 1"]': {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8
  },
  'p[style-name="Heading 2"]': {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 6
  },
  'p[style-name="Heading 3"]': {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 4
  },
  'p[style-name="Normal"]': {
    fontSize: 12,
    marginTop: 0,
    marginBottom: 6
  },
  'ul, ol': {
    marginTop: 6,
    marginBottom: 6,
    paddingLeft: 20
  },
  'li': {
    marginBottom: 3
  },
  'table': {
    borderCollapse: 'collapse',
    marginTop: 8,
    marginBottom: 8
  },
  'td, th': {
    border: '1px solid #ccc',
    padding: 4
  }
};

/**
 * DOCX to PDF Conversion Service
 */
class DOCXToPDFService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { ...DEFAULT_CONVERSION_OPTIONS, ...options };
    this.cache = new Map();
    this.statistics = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Convert DOCX file to PDF
   */
  async convertDOCXToPDF(inputPath, outputPath, options = {}) {
    const startTime = Date.now();
    const result = new DOCXToPDFResult();
    result.inputPath = inputPath;
    result.outputPath = outputPath;
    
    const conversionOptions = { ...this.options, ...options };
    
    try {
      this.emit(DOCXToPDFEvents.CONVERSION_STARTED, { inputPath, outputPath });
      
      // Step 1: Validate input
      const validationStart = Date.now();
      await this._validateInput(inputPath, conversionOptions);
      result.addStep('input_validation', Date.now() - validationStart, true);
      
      // Step 2: Check cache
      const cacheKey = await this._generateCacheKey(inputPath, conversionOptions);
      if (conversionOptions.enableCache && this.cache.has(cacheKey)) {
        const cachedResult = this.cache.get(cacheKey);
        await fs.copyFile(cachedResult.outputPath, outputPath);
        result.success = true;
        result.processingTime = Date.now() - startTime;
        this.statistics.cacheHits++;
        this.emit(DOCXToPDFEvents.CONVERSION_COMPLETED, result);
        return result;
      }
      this.statistics.cacheMisses++;
      
      // Step 3: Extract DOCX content
      const extractionStart = Date.now();
      const { htmlContent, metadata } = await this._extractDOCXContent(inputPath, conversionOptions);
      result.htmlContent = htmlContent;
      result.metadata = metadata;
      result.addStep('docx_extraction', Date.now() - extractionStart, true);
      this.emit(DOCXToPDFEvents.DOCX_PARSED, { metadata });
      
      // Step 4: Generate HTML with styling
      const htmlStart = Date.now();
      const styledHtml = await this._generateStyledHTML(htmlContent, conversionOptions);
      result.addStep('html_generation', Date.now() - htmlStart, true);
      this.emit(DOCXToPDFEvents.HTML_GENERATED, { htmlLength: styledHtml.length });
      
      // Step 5: Convert HTML to PDF
      const pdfStart = Date.now();
      this.emit(DOCXToPDFEvents.PDF_GENERATION_STARTED);
      const pdfBuffer = await this._generatePDFFromHTML(styledHtml, conversionOptions);
      result.addStep('pdf_generation', Date.now() - pdfStart, true);
      
      // Step 6: Save PDF file
      const saveStart = Date.now();
      await fs.writeFile(outputPath, pdfBuffer);
      result.pdfSize = pdfBuffer.length;
      result.addStep('file_save', Date.now() - saveStart, true);
      
      // Step 7: Post-processing
      const postStart = Date.now();
      await this._postProcessPDF(outputPath, conversionOptions);
      result.addStep('post_processing', Date.now() - postStart, true);
      
      result.success = true;
      result.processingTime = Date.now() - startTime;
      
      // Update statistics
      this.statistics.totalConversions++;
      this.statistics.successfulConversions++;
      this.statistics.totalProcessingTime += result.processingTime;
      this.statistics.averageProcessingTime = 
        this.statistics.totalProcessingTime / this.statistics.totalConversions;
      
      // Cache result
      if (conversionOptions.enableCache) {
        this.cache.set(cacheKey, { outputPath, result });
      }
      
      this.emit(DOCXToPDFEvents.PDF_GENERATED, { outputPath, size: result.pdfSize });
      this.emit(DOCXToPDFEvents.CONVERSION_COMPLETED, result);
      
      return result;
      
    } catch (error) {
      result.addError(error.message);
      result.processingTime = Date.now() - startTime;
      
      this.statistics.totalConversions++;
      this.statistics.failedConversions++;
      
      this.emit(DOCXToPDFEvents.CONVERSION_FAILED, { error: error.message, result });
      this.emit(DOCXToPDFEvents.ERROR, error);
      
      return result;
    }
  }

  /**
   * Batch convert multiple DOCX files to PDF
   */
  async batchConvertDOCXToPDF(inputFiles, outputDir, options = {}) {
    const results = [];
    let successfulConversions = 0;
    let failedConversions = 0;
    
    for (let i = 0; i < inputFiles.length; i++) {
      const inputPath = inputFiles[i];
      const fileName = path.basename(inputPath, path.extname(inputPath));
      const outputPath = path.join(outputDir, `${fileName}.pdf`);
      
      try {
        this.emit(DOCXToPDFEvents.PROGRESS_UPDATE, {
          current: i + 1,
          total: inputFiles.length,
          percentage: Math.round(((i + 1) / inputFiles.length) * 100),
          currentFile: inputPath
        });
        
        const result = await this.convertDOCXToPDF(inputPath, outputPath, options);
        results.push(result);
        
        if (result.success) {
          successfulConversions++;
        } else {
          failedConversions++;
        }
        
      } catch (error) {
        const errorResult = new DOCXToPDFResult();
        errorResult.inputPath = inputPath;
        errorResult.outputPath = outputPath;
        errorResult.addError(error.message);
        results.push(errorResult);
        failedConversions++;
      }
    }
    
    return {
      totalFiles: inputFiles.length,
      successfulConversions,
      failedConversions,
      results
    };
  }

  /**
   * Validate input file
   */
  async _validateInput(inputPath, options) {
    // Check if file exists
    try {
      await fs.access(inputPath);
    } catch (error) {
      throw new Error(`Input file does not exist: ${inputPath}`);
    }
    
    // Check file extension
    const ext = path.extname(inputPath).toLowerCase();
    if (ext !== '.docx') {
      throw new Error(`Invalid file extension. Expected .docx, got ${ext}`);
    }
    
    // Check file size
    const stats = await fs.stat(inputPath);
    if (stats.size > options.maxFileSize) {
      throw new Error(`File size (${stats.size} bytes) exceeds maximum allowed size (${options.maxFileSize} bytes)`);
    }
    
    // Validate DOCX structure
    try {
      const data = await fs.readFile(inputPath);
      const zip = await JSZip.loadAsync(data);
      
      if (!zip.files['word/document.xml']) {
        throw new Error('Invalid DOCX file: missing document.xml');
      }
    } catch (error) {
      if (error.message.includes('Invalid DOCX')) {
        throw error;
      }
      throw new Error('Invalid DOCX file: corrupted or not a valid ZIP archive');
    }
  }

  /**
   * Extract content from DOCX file
   */
  async _extractDOCXContent(inputPath, options) {
    const data = await fs.readFile(inputPath);
    
    const mammothOptions = {
      convertImage: options.convertImage,
      includeDefaultStyleMap: options.includeDefaultStyleMap,
      styleMap: this._generateStyleMap()
    };
    
    const result = await mammoth.convertToHtml(data, mammothOptions);
    
    // Extract metadata
    const metadata = await this._extractDOCXMetadata(inputPath);
    
    return {
      htmlContent: result.value,
      metadata,
      warnings: result.messages
    };
  }

  /**
   * Extract metadata from DOCX file
   */
  async _extractDOCXMetadata(inputPath) {
    try {
      const data = await fs.readFile(inputPath);
      const zip = await JSZip.loadAsync(data);
      
      const metadata = {
        title: '',
        author: '',
        subject: '',
        creator: '',
        created: null,
        modified: null,
        pages: 1,
        words: 0,
        characters: 0
      };
      
      // Extract core properties
      if (zip.files['docProps/core.xml']) {
        const coreXml = await zip.files['docProps/core.xml'].async('string');
        metadata.title = this._extractXMLValue(coreXml, 'dc:title') || '';
        metadata.author = this._extractXMLValue(coreXml, 'dc:creator') || '';
        metadata.subject = this._extractXMLValue(coreXml, 'dc:subject') || '';
        metadata.created = this._extractXMLValue(coreXml, 'dcterms:created');
        metadata.modified = this._extractXMLValue(coreXml, 'dcterms:modified');
      }
      
      // Extract app properties
      if (zip.files['docProps/app.xml']) {
        const appXml = await zip.files['docProps/app.xml'].async('string');
        const pages = this._extractXMLValue(appXml, 'Pages');
        const words = this._extractXMLValue(appXml, 'Words');
        const characters = this._extractXMLValue(appXml, 'Characters');
        
        if (pages) metadata.pages = parseInt(pages, 10) || 1;
        if (words) metadata.words = parseInt(words, 10) || 0;
        if (characters) metadata.characters = parseInt(characters, 10) || 0;
      }
      
      return metadata;
    } catch (error) {
      return {
        title: '',
        author: '',
        subject: '',
        creator: 'Unknown',
        created: null,
        modified: null,
        pages: 1,
        words: 0,
        characters: 0
      };
    }
  }

  /**
   * Generate styled HTML for PDF conversion
   */
  async _generateStyledHTML(htmlContent, options) {
    const css = this._generateCSS(options);
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>DOCX to PDF Conversion</title>
    <style>
        ${css}
    </style>
</head>
<body>
    <div class="document">
        ${htmlContent}
    </div>
</body>
</html>`;
  }

  /**
   * Generate CSS for HTML styling
   */
  _generateCSS(options) {
    return `
        body {
            font-family: ${options.fontFamily}, sans-serif;
            font-size: ${options.fontSize}px;
            line-height: ${options.lineHeight};
            margin: 0;
            padding: ${options.margins.top}px ${options.margins.right}px ${options.margins.bottom}px ${options.margins.left}px;
            color: #000;
        }
        
        .document {
            max-width: 100%;
            margin: 0 auto;
        }
        
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1em;
            margin-bottom: 0.5em;
            font-weight: bold;
        }
        
        h1 { font-size: 1.5em; }
        h2 { font-size: 1.3em; }
        h3 { font-size: 1.1em; }
        
        p {
            margin: 0 0 0.5em 0;
        }
        
        ul, ol {
            margin: 0.5em 0;
            padding-left: 1.5em;
        }
        
        li {
            margin-bottom: 0.25em;
        }
        
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 0.5em 0;
        }
        
        td, th {
            border: 1px solid #ccc;
            padding: 0.25em;
            text-align: left;
        }
        
        th {
            background-color: #f5f5f5;
            font-weight: bold;
        }
        
        img {
            max-width: 100%;
            height: auto;
        }
        
        .page-break {
            page-break-before: always;
        }
    `;
  }

  /**
   * Generate PDF from HTML content
   */
  async _generatePDFFromHTML(htmlContent, options) {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Set document metadata
    pdfDoc.setTitle(options.title || 'DOCX to PDF Conversion');
    pdfDoc.setAuthor(options.author || 'DOCX to PDF Service');
    pdfDoc.setCreator('DOCX to PDF Service');
    pdfDoc.setProducer('DOCX to PDF Service');
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());
    
    // Parse HTML and convert to PDF content
    const pages = await this._parseHTMLToPDFPages(htmlContent, options);
    
    // Add pages to PDF
    for (const pageContent of pages) {
      const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points
      await this._renderPageContent(page, pageContent, options);
    }
    
    // Serialize PDF
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Parse HTML content into PDF pages
   */
  async _parseHTMLToPDFPages(htmlContent, options) {
    // Simple HTML parsing for basic content
    // This is a simplified implementation - in production, you might want to use a more sophisticated HTML parser
    
    const pages = [];
    let currentPage = [];
    let currentY = options.margins.top;
    const pageHeight = 841.89 - options.margins.top - options.margins.bottom;
    const lineHeight = options.fontSize * options.lineHeight;
    
    // Remove HTML tags and extract text content
    const textContent = htmlContent
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Split into paragraphs
    const paragraphs = textContent.split(/\n\s*\n/).filter(p => p.trim());
    
    for (const paragraph of paragraphs) {
      const words = paragraph.split(' ');
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const lineWidth = testLine.length * (options.fontSize * 0.6); // Approximate character width
        const maxWidth = 595.28 - options.margins.left - options.margins.right;
        
        if (lineWidth > maxWidth && currentLine) {
          // Add current line to page
          currentPage.push({
            type: 'text',
            content: currentLine,
            x: options.margins.left,
            y: currentY,
            fontSize: options.fontSize
          });
          
          currentY += lineHeight;
          currentLine = word;
          
          // Check if we need a new page
          if (currentY > pageHeight) {
            pages.push([...currentPage]);
            currentPage = [];
            currentY = options.margins.top;
          }
        } else {
          currentLine = testLine;
        }
      }
      
      // Add remaining line
      if (currentLine) {
        currentPage.push({
          type: 'text',
          content: currentLine,
          x: options.margins.left,
          y: currentY,
          fontSize: options.fontSize
        });
        
        currentY += lineHeight;
      }
      
      // Add paragraph spacing
      currentY += lineHeight * 0.5;
      
      // Check if we need a new page
      if (currentY > pageHeight) {
        pages.push([...currentPage]);
        currentPage = [];
        currentY = options.margins.top;
      }
    }
    
    // Add final page if it has content
    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    
    return pages.length > 0 ? pages : [[]];
  }

  /**
   * Render content on a PDF page
   */
  async _renderPageContent(page, pageContent, options) {
    const font = await page.doc.embedFont(StandardFonts.Helvetica);
    
    for (const item of pageContent) {
      if (item.type === 'text') {
        page.drawText(item.content, {
          x: item.x,
          y: 841.89 - item.y, // Convert to PDF coordinate system
          size: item.fontSize,
          font: font,
          color: rgb(0, 0, 0)
        });
      }
    }
  }

  /**
   * Post-process PDF file
   */
  async _postProcessPDF(outputPath, options) {
    // Placeholder for post-processing operations
    // Could include compression, optimization, etc.
    return true;
  }

  /**
   * Generate style map for Mammoth.js
   */
  _generateStyleMap() {
    return [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Title'] => h1.title:fresh",
      "p[style-name='Subtitle'] => h2.subtitle:fresh"
    ];
  }

  /**
   * Extract value from XML content
   */
  _extractXMLValue(xml, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Generate cache key for conversion
   */
  async _generateCacheKey(inputPath, options) {
    const stats = await fs.stat(inputPath);
    const optionsHash = JSON.stringify(options);
    return `${inputPath}_${stats.mtime.getTime()}_${Buffer.from(optionsHash).toString('base64')}`;
  }

  /**
   * Get conversion statistics
   */
  getStatistics() {
    return { ...this.statistics };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize() {
    return this.cache.size;
  }
}

// Global service instance
let globalDOCXToPDFService = null;

/**
 * Get global DOCX to PDF service instance
 */
function getDOCXToPDFService(options = {}) {
  if (!globalDOCXToPDFService) {
    globalDOCXToPDFService = new DOCXToPDFService(options);
  }
  return globalDOCXToPDFService;
}

module.exports = {
  DOCXToPDFService,
  DOCXToPDFResult,
  DOCXToPDFEvents,
  DEFAULT_CONVERSION_OPTIONS,
  STYLE_MAPPINGS,
  getDOCXToPDFService
};