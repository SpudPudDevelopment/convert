/**
 * PDF Service
 * Comprehensive PDF handling using PDF.js and pdf-lib
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const { createCanvas } = require('canvas');

// PDF.js imports
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { PDFLib, rgb, StandardFonts } = require('pdf-lib');

// Configure PDF.js worker
if (typeof window === 'undefined') {
  // Node.js environment
  const pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.entry.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

/**
 * PDF events
 */
const PDFEvents = {
  PARSING_STARTED: 'parsing_started',
  PARSING_PROGRESS: 'parsing_progress',
  PARSING_COMPLETED: 'parsing_completed',
  PARSING_FAILED: 'parsing_failed',
  GENERATION_STARTED: 'generation_started',
  GENERATION_PROGRESS: 'generation_progress',
  GENERATION_COMPLETED: 'generation_completed',
  GENERATION_FAILED: 'generation_failed',
  PAGE_RENDERED: 'page_rendered',
  TEXT_EXTRACTED: 'text_extracted',
  METADATA_EXTRACTED: 'metadata_extracted'
};

/**
 * PDF parsing options
 */
const DEFAULT_PARSE_OPTIONS = {
  extractText: true,
  extractImages: false,
  extractMetadata: true,
  renderPages: false,
  renderScale: 1.5,
  renderFormat: 'png',
  maxPages: null,
  password: null,
  enableXfa: false,
  disableFontFace: false,
  disableRange: false,
  disableStream: false,
  disableAutoFetch: false
};

/**
 * PDF generation options
 */
const DEFAULT_GENERATION_OPTIONS = {
  title: '',
  author: '',
  subject: '',
  creator: 'Convert App',
  producer: 'Convert App PDF Service',
  keywords: [],
  creationDate: new Date(),
  modificationDate: new Date(),
  pageSize: 'A4',
  pageOrientation: 'portrait',
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  fontSize: 12,
  fontFamily: 'Helvetica',
  lineHeight: 1.2,
  compress: true
};

/**
 * PDF page information
 */
class PDFPageInfo {
  constructor(pageNumber, viewport, text = '', images = [], annotations = []) {
    this.pageNumber = pageNumber;
    this.width = viewport.width;
    this.height = viewport.height;
    this.rotation = viewport.rotation;
    this.text = text;
    this.images = images;
    this.annotations = annotations;
    this.renderData = null;
  }
  
  /**
   * Set rendered page data
   */
  setRenderData(imageData, format = 'png') {
    this.renderData = {
      data: imageData,
      format,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get page aspect ratio
   */
  getAspectRatio() {
    return this.width / this.height;
  }
  
  /**
   * Check if page is landscape
   */
  isLandscape() {
    return this.width > this.height;
  }
}

/**
 * PDF document information
 */
class PDFDocumentInfo {
  constructor() {
    this.metadata = {};
    this.info = {};
    this.pages = [];
    this.pageCount = 0;
    this.fileSize = 0;
    this.version = null;
    this.isEncrypted = false;
    this.permissions = {};
    this.fingerprint = null;
    this.parseTime = 0;
    this.errors = [];
    this.warnings = [];
  }
  
  /**
   * Add page information
   */
  addPage(pageInfo) {
    this.pages.push(pageInfo);
    this.pageCount = this.pages.length;
  }
  
  /**
   * Get page by number
   */
  getPage(pageNumber) {
    return this.pages.find(page => page.pageNumber === pageNumber);
  }
  
  /**
   * Get all text content
   */
  getAllText() {
    return this.pages.map(page => page.text).join('\n\n');
  }
  
  /**
   * Get document summary
   */
  getSummary() {
    return {
      pageCount: this.pageCount,
      fileSize: this.fileSize,
      version: this.version,
      isEncrypted: this.isEncrypted,
      title: this.info.Title || this.metadata.title || 'Untitled',
      author: this.info.Author || this.metadata.author || 'Unknown',
      subject: this.info.Subject || this.metadata.subject || '',
      creator: this.info.Creator || this.metadata.creator || '',
      producer: this.info.Producer || this.metadata.producer || '',
      creationDate: this.info.CreationDate || this.metadata.creationDate,
      modificationDate: this.info.ModDate || this.metadata.modificationDate,
      keywords: this.info.Keywords || this.metadata.keywords || '',
      parseTime: this.parseTime,
      errorCount: this.errors.length,
      warningCount: this.warnings.length
    };
  }
}

/**
 * PDF generation result
 */
class PDFGenerationResult {
  constructor() {
    this.success = false;
    this.outputPath = null;
    this.fileSize = 0;
    this.pageCount = 0;
    this.generationTime = 0;
    this.errors = [];
    this.warnings = [];
    this.metadata = {};
  }
  
  /**
   * Mark as successful
   */
  markSuccess(outputPath, fileSize, pageCount, generationTime) {
    this.success = true;
    this.outputPath = outputPath;
    this.fileSize = fileSize;
    this.pageCount = pageCount;
    this.generationTime = generationTime;
  }
  
  /**
   * Add error
   */
  addError(error) {
    this.errors.push({
      message: error.message || error,
      timestamp: Date.now()
    });
  }
  
  /**
   * Add warning
   */
  addWarning(warning) {
    this.warnings.push({
      message: warning.message || warning,
      timestamp: Date.now()
    });
  }
}

/**
 * PDF Service
 */
class PDFService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      ...DEFAULT_PARSE_OPTIONS,
      ...DEFAULT_GENERATION_OPTIONS,
      ...options
    };
    
    this.cache = new Map();
    this.statistics = {
      documentsProcessed: 0,
      documentsGenerated: 0,
      totalParseTime: 0,
      totalGenerationTime: 0,
      averageParseTime: 0,
      averageGenerationTime: 0,
      errorCount: 0,
      cacheHits: 0
    };
  }
  
  /**
   * Parse PDF document
   */
  async parsePDF(input, options = {}) {
    const parseOptions = { ...this.options, ...options };
    const startTime = Date.now();
    const operationId = this._generateOperationId();
    
    this.emit(PDFEvents.PARSING_STARTED, {
      operationId,
      options: parseOptions
    });
    
    try {
      // Load PDF data
      let pdfData;
      if (typeof input === 'string') {
        // File path
        pdfData = await fs.readFile(input);
      } else if (Buffer.isBuffer(input)) {
        // Buffer data
        pdfData = input;
      } else if (input instanceof Uint8Array) {
        // Uint8Array data
        pdfData = input;
      } else {
        throw new Error('Invalid input type. Expected file path, Buffer, or Uint8Array');
      }
      
      // Check cache
      const cacheKey = this._generateCacheKey(pdfData, parseOptions);
      if (this.cache.has(cacheKey)) {
        this.statistics.cacheHits++;
        return this.cache.get(cacheKey);
      }
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: pdfData,
        password: parseOptions.password,
        disableFontFace: parseOptions.disableFontFace,
        disableRange: parseOptions.disableRange,
        disableStream: parseOptions.disableStream,
        disableAutoFetch: parseOptions.disableAutoFetch,
        enableXfa: parseOptions.enableXfa
      });
      
      const pdfDocument = await loadingTask.promise;
      
      // Create document info
      const docInfo = new PDFDocumentInfo();
      docInfo.pageCount = pdfDocument.numPages;
      docInfo.fingerprint = pdfDocument.fingerprint;
      
      // Extract metadata
      if (parseOptions.extractMetadata) {
        try {
          const metadata = await pdfDocument.getMetadata();
          docInfo.metadata = metadata.metadata || {};
          docInfo.info = metadata.info || {};
          
          this.emit(PDFEvents.METADATA_EXTRACTED, {
            operationId,
            metadata: docInfo.metadata,
            info: docInfo.info
          });
        } catch (error) {
          docInfo.warnings.push(`Failed to extract metadata: ${error.message}`);
        }
      }
      
      // Check if encrypted
      docInfo.isEncrypted = pdfDocument.isEncrypted || false;
      
      // Get permissions
      try {
        const permissions = await pdfDocument.getPermissions();
        docInfo.permissions = permissions || {};
      } catch (error) {
        docInfo.warnings.push(`Failed to get permissions: ${error.message}`);
      }
      
      // Process pages
      const maxPages = parseOptions.maxPages || docInfo.pageCount;
      const pagesToProcess = Math.min(maxPages, docInfo.pageCount);
      
      for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.0 });
          
          const pageInfo = new PDFPageInfo(pageNum, viewport);
          
          // Extract text
          if (parseOptions.extractText) {
            const textContent = await page.getTextContent();
            pageInfo.text = textContent.items
              .map(item => item.str)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            this.emit(PDFEvents.TEXT_EXTRACTED, {
              operationId,
              pageNumber: pageNum,
              textLength: pageInfo.text.length
            });
          }
          
          // Extract annotations
          try {
            const annotations = await page.getAnnotations();
            pageInfo.annotations = annotations || [];
          } catch (error) {
            docInfo.warnings.push(`Failed to extract annotations from page ${pageNum}: ${error.message}`);
          }
          
          // Render page
          if (parseOptions.renderPages) {
            try {
              const renderData = await this._renderPage(page, parseOptions);
              pageInfo.setRenderData(renderData, parseOptions.renderFormat);
              
              this.emit(PDFEvents.PAGE_RENDERED, {
                operationId,
                pageNumber: pageNum,
                format: parseOptions.renderFormat
              });
            } catch (error) {
              docInfo.warnings.push(`Failed to render page ${pageNum}: ${error.message}`);
            }
          }
          
          docInfo.addPage(pageInfo);
          
          // Emit progress
          this.emit(PDFEvents.PARSING_PROGRESS, {
            operationId,
            pageNumber: pageNum,
            totalPages: pagesToProcess,
            progress: (pageNum / pagesToProcess) * 100
          });
          
        } catch (error) {
          docInfo.errors.push(`Failed to process page ${pageNum}: ${error.message}`);
        }
      }
      
      // Calculate parse time
      const parseTime = Date.now() - startTime;
      docInfo.parseTime = parseTime;
      docInfo.fileSize = pdfData.length;
      
      // Update statistics
      this.statistics.documentsProcessed++;
      this.statistics.totalParseTime += parseTime;
      this.statistics.averageParseTime = this.statistics.totalParseTime / this.statistics.documentsProcessed;
      
      if (docInfo.errors.length > 0) {
        this.statistics.errorCount++;
      }
      
      // Cache result
      this.cache.set(cacheKey, docInfo);
      
      this.emit(PDFEvents.PARSING_COMPLETED, {
        operationId,
        documentInfo: docInfo.getSummary(),
        parseTime
      });
      
      return docInfo;
      
    } catch (error) {
      this.statistics.errorCount++;
      
      this.emit(PDFEvents.PARSING_FAILED, {
        operationId,
        error: error.message,
        parseTime: Date.now() - startTime
      });
      
      throw error;
    }
  }
  
  /**
   * Generate PDF document
   */
  async generatePDF(content, outputPath, options = {}) {
    const genOptions = { ...this.options, ...options };
    const startTime = Date.now();
    const operationId = this._generateOperationId();
    const result = new PDFGenerationResult();
    
    this.emit(PDFEvents.GENERATION_STARTED, {
      operationId,
      outputPath,
      options: genOptions
    });
    
    try {
      // Create new PDF document
      const pdfDoc = await PDFLib.PDFDocument.create();
      
      // Set metadata
      if (genOptions.title) pdfDoc.setTitle(genOptions.title);
      if (genOptions.author) pdfDoc.setAuthor(genOptions.author);
      if (genOptions.subject) pdfDoc.setSubject(genOptions.subject);
      if (genOptions.creator) pdfDoc.setCreator(genOptions.creator);
      if (genOptions.producer) pdfDoc.setProducer(genOptions.producer);
      if (genOptions.keywords.length > 0) pdfDoc.setKeywords(genOptions.keywords);
      if (genOptions.creationDate) pdfDoc.setCreationDate(genOptions.creationDate);
      if (genOptions.modificationDate) pdfDoc.setModificationDate(genOptions.modificationDate);
      
      // Get page dimensions
      const pageDimensions = this._getPageDimensions(genOptions.pageSize, genOptions.pageOrientation);
      
      // Embed font
      const font = await pdfDoc.embedFont(StandardFonts[genOptions.fontFamily] || StandardFonts.Helvetica);
      
      // Process content
      if (typeof content === 'string') {
        // Text content
        await this._addTextContent(pdfDoc, content, font, pageDimensions, genOptions, operationId);
      } else if (Array.isArray(content)) {
        // Array of content items
        await this._addArrayContent(pdfDoc, content, font, pageDimensions, genOptions, operationId);
      } else if (typeof content === 'object') {
        // Structured content
        await this._addStructuredContent(pdfDoc, content, font, pageDimensions, genOptions, operationId);
      } else {
        throw new Error('Invalid content type');
      }
      
      // Serialize PDF
      const pdfBytes = await pdfDoc.save({
        useObjectStreams: genOptions.compress
      });
      
      // Write to file
      await fs.writeFile(outputPath, pdfBytes);
      
      // Get file stats
      const stats = await fs.stat(outputPath);
      const generationTime = Date.now() - startTime;
      
      result.markSuccess(outputPath, stats.size, pdfDoc.getPageCount(), generationTime);
      result.metadata = {
        title: genOptions.title,
        author: genOptions.author,
        subject: genOptions.subject,
        creator: genOptions.creator,
        producer: genOptions.producer,
        keywords: genOptions.keywords,
        pageSize: genOptions.pageSize,
        pageOrientation: genOptions.pageOrientation
      };
      
      // Update statistics
      this.statistics.documentsGenerated++;
      this.statistics.totalGenerationTime += generationTime;
      this.statistics.averageGenerationTime = this.statistics.totalGenerationTime / this.statistics.documentsGenerated;
      
      this.emit(PDFEvents.GENERATION_COMPLETED, {
        operationId,
        outputPath,
        fileSize: stats.size,
        pageCount: pdfDoc.getPageCount(),
        generationTime
      });
      
      return result;
      
    } catch (error) {
      result.addError(error);
      this.statistics.errorCount++;
      
      this.emit(PDFEvents.GENERATION_FAILED, {
        operationId,
        error: error.message,
        generationTime: Date.now() - startTime
      });
      
      return result;
    }
  }
  
  /**
   * Extract text from PDF
   */
  async extractText(input, options = {}) {
    const docInfo = await this.parsePDF(input, {
      ...options,
      extractText: true,
      extractImages: false,
      renderPages: false
    });
    
    return docInfo.getAllText();
  }
  
  /**
   * Get PDF metadata
   */
  async getMetadata(input, options = {}) {
    const docInfo = await this.parsePDF(input, {
      ...options,
      extractText: false,
      extractImages: false,
      renderPages: false,
      extractMetadata: true
    });
    
    return {
      metadata: docInfo.metadata,
      info: docInfo.info,
      pageCount: docInfo.pageCount,
      fileSize: docInfo.fileSize,
      version: docInfo.version,
      isEncrypted: docInfo.isEncrypted,
      permissions: docInfo.permissions,
      fingerprint: docInfo.fingerprint
    };
  }
  
  /**
   * Render PDF pages to images
   */
  async renderPages(input, options = {}) {
    const renderOptions = {
      ...options,
      renderPages: true,
      extractText: false,
      extractImages: false
    };
    
    const docInfo = await this.parsePDF(input, renderOptions);
    
    return docInfo.pages.map(page => ({
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      renderData: page.renderData
    }));
  }
  
  /**
   * Merge multiple PDFs
   */
  async mergePDFs(inputPaths, outputPath, options = {}) {
    const mergedPdf = await PDFLib.PDFDocument.create();
    const operationId = this._generateOperationId();
    
    for (let i = 0; i < inputPaths.length; i++) {
      const inputPath = inputPaths[i];
      const pdfBytes = await fs.readFile(inputPath);
      const pdf = await PDFLib.PDFDocument.load(pdfBytes);
      
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
      
      this.emit(PDFEvents.GENERATION_PROGRESS, {
        operationId,
        fileIndex: i + 1,
        totalFiles: inputPaths.length,
        progress: ((i + 1) / inputPaths.length) * 100
      });
    }
    
    const pdfBytes = await mergedPdf.save();
    await fs.writeFile(outputPath, pdfBytes);
    
    return {
      outputPath,
      pageCount: mergedPdf.getPageCount(),
      fileSize: pdfBytes.length
    };
  }
  
  /**
   * Split PDF into separate files
   */
  async splitPDF(inputPath, outputDir, options = {}) {
    const pdfBytes = await fs.readFile(inputPath);
    const pdf = await PDFLib.PDFDocument.load(pdfBytes);
    const pageCount = pdf.getPageCount();
    const results = [];
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    for (let i = 0; i < pageCount; i++) {
      const newPdf = await PDFLib.PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdf, [i]);
      newPdf.addPage(copiedPage);
      
      const outputPath = path.join(outputDir, `page-${i + 1}.pdf`);
      const newPdfBytes = await newPdf.save();
      await fs.writeFile(outputPath, newPdfBytes);
      
      results.push({
        pageNumber: i + 1,
        outputPath,
        fileSize: newPdfBytes.length
      });
    }
    
    return results;
  }
  
  /**
   * Render a single page
   */
  async _renderPage(page, options) {
    const viewport = page.getViewport({ scale: options.renderScale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    if (options.renderFormat === 'png') {
      return canvas.toBuffer('image/png');
    } else if (options.renderFormat === 'jpeg') {
      return canvas.toBuffer('image/jpeg');
    } else {
      return canvas.toDataURL();
    }
  }
  
  /**
   * Add text content to PDF
   */
  async _addTextContent(pdfDoc, text, font, pageDimensions, options, operationId) {
    const lines = this._wrapText(text, font, options.fontSize, pageDimensions.width - options.margins.left - options.margins.right);
    const lineHeight = options.fontSize * options.lineHeight;
    const maxLinesPerPage = Math.floor((pageDimensions.height - options.margins.top - options.margins.bottom) / lineHeight);
    
    let currentPage = null;
    let currentY = 0;
    let lineIndex = 0;
    
    for (const line of lines) {
      if (!currentPage || lineIndex >= maxLinesPerPage) {
        currentPage = pdfDoc.addPage([pageDimensions.width, pageDimensions.height]);
        currentY = pageDimensions.height - options.margins.top;
        lineIndex = 0;
        
        this.emit(PDFEvents.GENERATION_PROGRESS, {
          operationId,
          pageCount: pdfDoc.getPageCount(),
          linesProcessed: lines.indexOf(line) + 1,
          totalLines: lines.length
        });
      }
      
      currentPage.drawText(line, {
        x: options.margins.left,
        y: currentY,
        size: options.fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
      
      currentY -= lineHeight;
      lineIndex++;
    }
  }
  
  /**
   * Add array content to PDF
   */
  async _addArrayContent(pdfDoc, contentArray, font, pageDimensions, options, operationId) {
    for (const item of contentArray) {
      if (typeof item === 'string') {
        await this._addTextContent(pdfDoc, item, font, pageDimensions, options, operationId);
      } else if (typeof item === 'object' && item.type === 'text') {
        await this._addTextContent(pdfDoc, item.content, font, pageDimensions, options, operationId);
      }
      // Add support for other content types (images, tables, etc.) here
    }
  }
  
  /**
   * Add structured content to PDF
   */
  async _addStructuredContent(pdfDoc, content, font, pageDimensions, options, operationId) {
    if (content.pages) {
      for (const pageContent of content.pages) {
        await this._addArrayContent(pdfDoc, pageContent, font, pageDimensions, options, operationId);
      }
    } else if (content.text) {
      await this._addTextContent(pdfDoc, content.text, font, pageDimensions, options, operationId);
    }
  }
  
  /**
   * Wrap text to fit page width
   */
  _wrapText(text, font, fontSize, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is too long, break it
          lines.push(word);
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }
  
  /**
   * Get page dimensions
   */
  _getPageDimensions(pageSize, orientation) {
    const sizes = {
      'A4': { width: 595, height: 842 },
      'A3': { width: 842, height: 1191 },
      'A5': { width: 420, height: 595 },
      'Letter': { width: 612, height: 792 },
      'Legal': { width: 612, height: 1008 }
    };
    
    const size = sizes[pageSize] || sizes['A4'];
    
    if (orientation === 'landscape') {
      return { width: size.height, height: size.width };
    }
    
    return size;
  }
  
  /**
   * Generate cache key
   */
  _generateCacheKey(data, options) {
    const hash = require('crypto').createHash('md5');
    hash.update(data);
    hash.update(JSON.stringify(options));
    return hash.digest('hex');
  }
  
  /**
   * Generate operation ID
   */
  _generateOperationId() {
    return Math.random().toString(36).substr(2, 9);
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
  
  /**
   * Get statistics
   */
  getStatistics() {
    return { ...this.statistics };
  }
  
  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      documentsProcessed: 0,
      documentsGenerated: 0,
      totalParseTime: 0,
      totalGenerationTime: 0,
      averageParseTime: 0,
      averageGenerationTime: 0,
      errorCount: 0,
      cacheHits: 0
    };
  }
}

// Global instance
let globalInstance = null;

/**
 * Get global PDF service instance
 */
function getPDFService(options = {}) {
  if (!globalInstance) {
    globalInstance = new PDFService(options);
  }
  return globalInstance;
}

module.exports = {
  PDFService,
  PDFDocumentInfo,
  PDFPageInfo,
  PDFGenerationResult,
  PDFEvents,
  DEFAULT_PARSE_OPTIONS,
  DEFAULT_GENERATION_OPTIONS,
  getPDFService
};