/**
 * Text Extraction Service
 * Comprehensive service for extracting plain text from various document formats
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const TurndownService = require('turndown');
const mammoth = require('mammoth');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Configure PDF.js worker
if (typeof window === 'undefined') {
  // Node.js environment
  const { createCanvas } = require('canvas');
  const NodeCanvasFactory = require('pdfjs-dist/legacy/build/pdf.js').NodeCanvasFactory;
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
}

/**
 * Text extraction result class
 */
class TextExtractionResult {
  constructor() {
    this.success = false;
    this.text = '';
    this.metadata = {};
    this.statistics = {
      characterCount: 0,
      wordCount: 0,
      lineCount: 0,
      paragraphCount: 0,
      extractionTimeMs: 0
    };
    this.warnings = [];
    this.errors = [];
    this.steps = [];
    this.encoding = 'utf-8';
    this.format = 'plain';
    this.sourceFormat = null;
  }

  addStep(name, duration, success, details = {}) {
    this.steps.push({
      name,
      duration,
      success,
      details,
      timestamp: new Date().toISOString()
    });
  }

  addWarning(message) {
    this.warnings.push({
      message,
      timestamp: new Date().toISOString()
    });
  }

  addError(message) {
    this.errors.push({
      message,
      timestamp: new Date().toISOString()
    });
  }

  setText(text) {
    this.text = text;
    this.updateStatistics();
  }

  updateStatistics() {
    this.statistics.characterCount = this.text.length;
    this.statistics.wordCount = this.text.trim() ? this.text.trim().split(/\s+/).length : 0;
    this.statistics.lineCount = this.text.split('\n').length;
    this.statistics.paragraphCount = this.text.split(/\n\s*\n/).filter(p => p.trim()).length;
  }

  getSummary() {
    return {
      success: this.success,
      characterCount: this.statistics.characterCount,
      wordCount: this.statistics.wordCount,
      lineCount: this.statistics.lineCount,
      paragraphCount: this.statistics.paragraphCount,
      extractionTime: this.statistics.extractionTimeMs,
      warnings: this.warnings.length,
      errors: this.errors.length,
      format: this.format,
      encoding: this.encoding
    };
  }
}

/**
 * Text extraction events
 */
const TextExtractionEvents = {
  EXTRACTION_STARTED: 'extraction_started',
  EXTRACTION_PROGRESS: 'extraction_progress',
  EXTRACTION_COMPLETED: 'extraction_completed',
  EXTRACTION_FAILED: 'extraction_failed',
  STEP_COMPLETED: 'step_completed',
  WARNING: 'warning',
  ERROR: 'error'
};

/**
 * Default text extraction options
 */
const DEFAULT_EXTRACTION_OPTIONS = {
  // General options
  encoding: 'utf-8',
  preserveFormatting: false,
  preserveLineBreaks: true,
  preserveParagraphs: true,
  trimWhitespace: true,
  normalizeSpaces: true,
  
  // PDF-specific options
  pdfOptions: {
    normalizeWhitespace: true,
    disableCombineTextItems: false,
    includeMarkedContent: false
  },
  
  // DOCX-specific options
  docxOptions: {
    includeHeaders: true,
    includeFooters: false,
    includeFootnotes: false,
    convertImage: () => '' // Skip images by default
  },
  
  // HTML/Markdown options
  htmlOptions: {
    headingStyle: 'atx', // or 'setext'
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full'
  },
  
  // Output options
  outputFormat: 'plain', // 'plain', 'markdown', 'structured'
  maxLength: null,
  enableCache: true,
  enableProgress: true
};

/**
 * Main text extraction service class
 */
class TextExtractionService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
    this.cache = new Map();
    this.statistics = {
      totalExtractions: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      totalCharactersExtracted: 0,
      totalExtractionTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    // Initialize turndown service
    this.turndownService = new TurndownService(this.options.htmlOptions);
    this.setupTurndownRules();
  }

  /**
   * Setup custom turndown rules for better text conversion
   */
  setupTurndownRules() {
    // Custom rule for preserving line breaks
    this.turndownService.addRule('lineBreak', {
      filter: 'br',
      replacement: () => '\n'
    });
    
    // Custom rule for handling divs as paragraphs
    this.turndownService.addRule('divParagraph', {
      filter: 'div',
      replacement: (content) => content ? `\n\n${content}\n\n` : ''
    });
    
    // Custom rule for handling spans
    this.turndownService.addRule('span', {
      filter: 'span',
      replacement: (content) => content
    });
  }

  /**
   * Extract text from PDF file
   */
  async extractTextFromPDF(inputPath, options = {}) {
    const result = new TextExtractionResult();
    result.sourceFormat = 'pdf';
    const startTime = Date.now();
    
    try {
      this.emit(TextExtractionEvents.EXTRACTION_STARTED, { inputPath, format: 'pdf' });
      
      // Validate input
      const stepStart = Date.now();
      await this._validateInput(inputPath);
      result.addStep('validation', Date.now() - stepStart, true);
      
      // Check cache
      const cacheKey = await this._generateCacheKey(inputPath, options);
      if (options.enableCache !== false && this.cache.has(cacheKey)) {
        this.statistics.cacheHits++;
        const cachedResult = this.cache.get(cacheKey);
        this.emit(TextExtractionEvents.EXTRACTION_COMPLETED, cachedResult);
        return cachedResult;
      }
      this.statistics.cacheMisses++;
      
      // Load PDF document
      const loadStart = Date.now();
      const data = await fs.readFile(inputPath);
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;
      result.addStep('pdf_load', Date.now() - loadStart, true, { pages: pdf.numPages });
      
      // Extract metadata
      const metadataStart = Date.now();
      try {
        const metadata = await pdf.getMetadata();
        result.metadata = {
          title: metadata.info?.Title || '',
          author: metadata.info?.Author || '',
          subject: metadata.info?.Subject || '',
          creator: metadata.info?.Creator || '',
          producer: metadata.info?.Producer || '',
          creationDate: metadata.info?.CreationDate || null,
          modificationDate: metadata.info?.ModDate || null,
          pages: pdf.numPages
        };
      } catch (error) {
        result.addWarning(`Failed to extract PDF metadata: ${error.message}`);
      }
      result.addStep('metadata_extraction', Date.now() - metadataStart, true);
      
      // Extract text from all pages
      const textExtractionStart = Date.now();
      let fullText = '';
      const pdfOptions = { ...this.options.pdfOptions, ...options.pdfOptions };
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent(pdfOptions);
          
          let pageText = '';
          for (const item of textContent.items) {
            if (item.str) {
              pageText += item.str;
              if (item.hasEOL) {
                pageText += '\n';
              }
            }
          }
          
          fullText += pageText;
          if (pageNum < pdf.numPages) {
            fullText += '\n\n'; // Page separator
          }
          
          // Emit progress
          if (options.enableProgress !== false) {
            this.emit(TextExtractionEvents.EXTRACTION_PROGRESS, {
              progress: pageNum / pdf.numPages,
              currentPage: pageNum,
              totalPages: pdf.numPages
            });
          }
        } catch (error) {
          result.addError(`Failed to extract text from page ${pageNum}: ${error.message}`);
        }
      }
      
      result.addStep('text_extraction', Date.now() - textExtractionStart, true, { pages: pdf.numPages });
      
      // Process extracted text
      const processStart = Date.now();
      const processedText = this._processExtractedText(fullText, options);
      result.setText(processedText);
      result.format = options.outputFormat || 'plain';
      result.addStep('text_processing', Date.now() - processStart, true);
      
      // Finalize result
      result.success = true;
      result.statistics.extractionTimeMs = Date.now() - startTime;
      
      // Cache result
      if (options.enableCache !== false) {
        this.cache.set(cacheKey, result);
      }
      
      // Update statistics
      this.statistics.totalExtractions++;
      this.statistics.successfulExtractions++;
      this.statistics.totalCharactersExtracted += result.statistics.characterCount;
      this.statistics.totalExtractionTime += result.statistics.extractionTimeMs;
      
      this.emit(TextExtractionEvents.EXTRACTION_COMPLETED, result);
      return result;
      
    } catch (error) {
      result.success = false;
      result.addError(`PDF text extraction failed: ${error.message}`);
      result.statistics.extractionTimeMs = Date.now() - startTime;
      
      this.statistics.totalExtractions++;
      this.statistics.failedExtractions++;
      
      this.emit(TextExtractionEvents.EXTRACTION_FAILED, { error, result });
      return result;
    }
  }

  /**
   * Extract text from DOCX file
   */
  async extractTextFromDOCX(inputPath, options = {}) {
    const result = new TextExtractionResult();
    result.sourceFormat = 'docx';
    const startTime = Date.now();
    
    try {
      this.emit(TextExtractionEvents.EXTRACTION_STARTED, { inputPath, format: 'docx' });
      
      // Validate input
      const stepStart = Date.now();
      await this._validateInput(inputPath);
      result.addStep('validation', Date.now() - stepStart, true);
      
      // Check cache
      const cacheKey = await this._generateCacheKey(inputPath, options);
      if (options.enableCache !== false && this.cache.has(cacheKey)) {
        this.statistics.cacheHits++;
        const cachedResult = this.cache.get(cacheKey);
        this.emit(TextExtractionEvents.EXTRACTION_COMPLETED, cachedResult);
        return cachedResult;
      }
      this.statistics.cacheMisses++;
      
      // Extract text using Mammoth
      const extractionStart = Date.now();
      const docxOptions = { ...this.options.docxOptions, ...options.docxOptions };
      
      let extractedText = '';
      let extractedMetadata = {};
      
      if (options.outputFormat === 'markdown') {
        // Extract as HTML first, then convert to markdown
        const htmlResult = await mammoth.convertToHtml({ path: inputPath }, docxOptions);
        extractedText = this.turndownService.turndown(htmlResult.value);
        extractedMetadata = htmlResult.messages;
      } else {
        // Extract as plain text
        const textResult = await mammoth.extractRawText({ path: inputPath }, docxOptions);
        extractedText = textResult.value;
        extractedMetadata = textResult.messages;
      }
      
      result.addStep('docx_extraction', Date.now() - extractionStart, true);
      
      // Extract metadata from DOCX properties
      const metadataStart = Date.now();
      try {
        // Note: Mammoth doesn't directly provide document properties
        // This is a placeholder for potential future enhancement
        result.metadata = {
          title: '',
          author: '',
          subject: '',
          creator: 'Microsoft Word',
          creationDate: null,
          modificationDate: null,
          messages: extractedMetadata
        };
      } catch (error) {
        result.addWarning(`Failed to extract DOCX metadata: ${error.message}`);
      }
      result.addStep('metadata_extraction', Date.now() - metadataStart, true);
      
      // Process extracted text
      const processStart = Date.now();
      const processedText = this._processExtractedText(extractedText, options);
      result.setText(processedText);
      result.format = options.outputFormat || 'plain';
      result.addStep('text_processing', Date.now() - processStart, true);
      
      // Finalize result
      result.success = true;
      result.statistics.extractionTimeMs = Date.now() - startTime;
      
      // Cache result
      if (options.enableCache !== false) {
        this.cache.set(cacheKey, result);
      }
      
      // Update statistics
      this.statistics.totalExtractions++;
      this.statistics.successfulExtractions++;
      this.statistics.totalCharactersExtracted += result.statistics.characterCount;
      this.statistics.totalExtractionTime += result.statistics.extractionTimeMs;
      
      this.emit(TextExtractionEvents.EXTRACTION_COMPLETED, result);
      return result;
      
    } catch (error) {
      result.success = false;
      result.addError(`DOCX text extraction failed: ${error.message}`);
      result.statistics.extractionTimeMs = Date.now() - startTime;
      
      this.statistics.totalExtractions++;
      this.statistics.failedExtractions++;
      
      this.emit(TextExtractionEvents.EXTRACTION_FAILED, { error, result });
      return result;
    }
  }

  /**
   * Convert HTML to text/markdown
   */
  async convertHTMLToText(htmlContent, options = {}) {
    const result = new TextExtractionResult();
    result.sourceFormat = 'html';
    const startTime = Date.now();
    
    try {
      this.emit(TextExtractionEvents.EXTRACTION_STARTED, { format: 'html' });
      
      // Convert HTML to text/markdown
      const conversionStart = Date.now();
      let convertedText = '';
      
      if (options.outputFormat === 'markdown') {
        convertedText = this.turndownService.turndown(htmlContent);
      } else {
        // Convert to plain text by removing HTML tags
        convertedText = htmlContent
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
          .replace(/<[^>]+>/g, ' ') // Remove HTML tags
          .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
          .replace(/&amp;/g, '&') // Replace HTML entities
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }
      
      result.addStep('html_conversion', Date.now() - conversionStart, true);
      
      // Process extracted text
      const processStart = Date.now();
      const processedText = this._processExtractedText(convertedText, options);
      result.setText(processedText);
      result.format = options.outputFormat || 'plain';
      result.addStep('text_processing', Date.now() - processStart, true);
      
      // Finalize result
      result.success = true;
      result.statistics.extractionTimeMs = Date.now() - startTime;
      
      // Update statistics
      this.statistics.totalExtractions++;
      this.statistics.successfulExtractions++;
      this.statistics.totalCharactersExtracted += result.statistics.characterCount;
      this.statistics.totalExtractionTime += result.statistics.extractionTimeMs;
      
      this.emit(TextExtractionEvents.EXTRACTION_COMPLETED, result);
      return result;
      
    } catch (error) {
      result.success = false;
      result.addError(`HTML text conversion failed: ${error.message}`);
      result.statistics.extractionTimeMs = Date.now() - startTime;
      
      this.statistics.totalExtractions++;
      this.statistics.failedExtractions++;
      
      this.emit(TextExtractionEvents.EXTRACTION_FAILED, { error, result });
      return result;
    }
  }

  /**
   * Batch text extraction from multiple files
   */
  async batchExtractText(inputFiles, outputDir, options = {}) {
    const results = {
      successfulExtractions: 0,
      failedExtractions: 0,
      results: [],
      totalTime: 0
    };
    
    const startTime = Date.now();
    
    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });
      
      for (let i = 0; i < inputFiles.length; i++) {
        const inputFile = inputFiles[i];
        const fileName = path.basename(inputFile, path.extname(inputFile));
        const outputFile = path.join(outputDir, `${fileName}.txt`);
        
        try {
          const result = await this.extractText(inputFile, outputFile, options);
          
          if (result.success) {
            results.successfulExtractions++;
          } else {
            results.failedExtractions++;
          }
          
          results.results.push({
            inputFile,
            outputFile,
            result
          });
          
          // Emit progress
          if (options.enableProgress !== false) {
            this.emit(TextExtractionEvents.EXTRACTION_PROGRESS, {
              progress: (i + 1) / inputFiles.length,
              currentFile: i + 1,
              totalFiles: inputFiles.length,
              fileName: path.basename(inputFile)
            });
          }
          
        } catch (error) {
          results.failedExtractions++;
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
      
    } catch (error) {
      throw new Error(`Batch text extraction failed: ${error.message}`);
    }
  }

  /**
   * Main text extraction method that auto-detects format
   */
  async extractText(inputPath, outputPath = null, options = {}) {
    const ext = path.extname(inputPath).toLowerCase();
    let result;
    
    switch (ext) {
      case '.pdf':
        result = await this.extractTextFromPDF(inputPath, options);
        break;
      case '.docx':
        result = await this.extractTextFromDOCX(inputPath, options);
        break;
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
    
    // Save to file if output path is provided
    if (outputPath && result.success) {
      await fs.writeFile(outputPath, result.text, { encoding: result.encoding });
    }
    
    return result;
  }

  /**
   * Process extracted text according to options
   */
  _processExtractedText(text, options = {}) {
    let processedText = text;
    
    // Normalize spaces
    if (options.normalizeSpaces !== false) {
      processedText = processedText.replace(/[ \t]+/g, ' ');
    }
    
    // Handle line breaks
    if (options.preserveLineBreaks !== false) {
      // Preserve existing line breaks
    } else {
      processedText = processedText.replace(/\n+/g, ' ');
    }
    
    // Handle paragraphs
    if (options.preserveParagraphs !== false) {
      processedText = processedText.replace(/\n\s*\n/g, '\n\n');
    }
    
    // Trim whitespace
    if (options.trimWhitespace !== false) {
      processedText = processedText.trim();
      processedText = processedText.replace(/^\s+|\s+$/gm, ''); // Trim each line
    }
    
    // Apply max length limit
    if (options.maxLength && processedText.length > options.maxLength) {
      processedText = processedText.substring(0, options.maxLength) + '...';
    }
    
    return processedText;
  }

  /**
   * Validate input file
   */
  async _validateInput(inputPath) {
    try {
      const stats = await fs.stat(inputPath);
      if (!stats.isFile()) {
        throw new Error('Input path is not a file');
      }
      if (stats.size === 0) {
        throw new Error('Input file is empty');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Input file does not exist');
      }
      throw error;
    }
  }

  /**
   * Generate cache key for caching
   */
  async _generateCacheKey(inputPath, options) {
    const stats = await fs.stat(inputPath);
    const optionsHash = crypto.createHash('md5')
      .update(JSON.stringify(options))
      .digest('hex');
    
    return `${inputPath}_${stats.mtime.getTime()}_${stats.size}_${optionsHash}`;
  }

  /**
   * Get service statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      cacheSize: this.cache.size,
      averageExtractionTime: this.statistics.totalExtractions > 0 
        ? this.statistics.totalExtractionTime / this.statistics.totalExtractions 
        : 0,
      successRate: this.statistics.totalExtractions > 0 
        ? this.statistics.successfulExtractions / this.statistics.totalExtractions 
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalExtractions: 0,
      successfulExtractions: 0,
      failedExtractions: 0,
      totalCharactersExtracted: 0,
      totalExtractionTime: 0,
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
   * Get supported formats
   */
  getSupportedFormats() {
    return {
      input: ['.pdf', '.docx'],
      output: ['plain', 'markdown', 'structured']
    };
  }
}

// Global service instance
let globalTextExtractionService = null;

/**
 * Get global text extraction service instance
 */
function getTextExtractionService(options = {}) {
  if (!globalTextExtractionService) {
    globalTextExtractionService = new TextExtractionService(options);
  }
  return globalTextExtractionService;
}

// Export classes and functions
module.exports = {
  TextExtractionService,
  TextExtractionResult,
  TextExtractionEvents,
  DEFAULT_EXTRACTION_OPTIONS,
  getTextExtractionService
};