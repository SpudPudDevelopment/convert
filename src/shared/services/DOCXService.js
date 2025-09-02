/**
 * DOCX Service
 * Comprehensive service for processing DOCX documents using Mammoth.js
 */

const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const JSZip = require('jszip');

/**
 * DOCX document information class
 */
class DOCXDocumentInfo {
  constructor(data = {}) {
    this.filePath = data.filePath || null;
    this.fileName = data.fileName || null;
    this.fileSize = data.fileSize || 0;
    this.metadata = data.metadata || {};
    this.content = data.content || {};
    this.images = data.images || [];
    this.styles = data.styles || [];
    this.warnings = data.warnings || [];
    this.processedAt = new Date();
    this.processingTime = data.processingTime || 0;
  }

  /**
   * Get plain text content
   */
  getPlainText() {
    return this.content.text || '';
  }

  /**
   * Get HTML content
   */
  getHTML() {
    return this.content.html || '';
  }

  /**
   * Get markdown content
   */
  getMarkdown() {
    return this.content.markdown || '';
  }

  /**
   * Get word count
   */
  getWordCount() {
    const text = this.getPlainText();
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  /**
   * Get character count
   */
  getCharacterCount() {
    return this.getPlainText().length;
  }

  /**
   * Get paragraph count
   */
  getParagraphCount() {
    const text = this.getPlainText();
    return text.trim() ? text.split(/\n\s*\n/).length : 0;
  }

  /**
   * Check if document has images
   */
  hasImages() {
    return this.images.length > 0;
  }

  /**
   * Get image count
   */
  getImageCount() {
    return this.images.length;
  }

  /**
   * Get document summary
   */
  getSummary() {
    return {
      fileName: this.fileName,
      fileSize: this.fileSize,
      wordCount: this.getWordCount(),
      characterCount: this.getCharacterCount(),
      paragraphCount: this.getParagraphCount(),
      imageCount: this.getImageCount(),
      hasImages: this.hasImages(),
      processedAt: this.processedAt,
      processingTime: this.processingTime
    };
  }
}

/**
 * DOCX conversion result class
 */
class DOCXConversionResult {
  constructor(data = {}) {
    this.success = data.success || false;
    this.outputPath = data.outputPath || null;
    this.format = data.format || null;
    this.fileSize = data.fileSize || 0;
    this.processingTime = data.processingTime || 0;
    this.metadata = data.metadata || {};
    this.warnings = data.warnings || [];
    this.errors = data.errors || [];
    this.createdAt = new Date();
  }
}

/**
 * DOCX events enumeration
 */
const DOCXEvents = {
  PARSING_STARTED: 'parsing_started',
  PARSING_PROGRESS: 'parsing_progress',
  PARSING_COMPLETED: 'parsing_completed',
  PARSING_ERROR: 'parsing_error',
  CONVERSION_STARTED: 'conversion_started',
  CONVERSION_PROGRESS: 'conversion_progress',
  CONVERSION_COMPLETED: 'conversion_completed',
  CONVERSION_ERROR: 'conversion_error',
  IMAGE_EXTRACTED: 'image_extracted',
  STYLE_MAPPED: 'style_mapped',
  METADATA_EXTRACTED: 'metadata_extracted'
};

/**
 * Default parsing options
 */
const DEFAULT_PARSE_OPTIONS = {
  convertImage: mammoth.images.imgElement(function(image) {
    return image.read("base64").then(function(imageBuffer) {
      return {
        src: "data:" + image.contentType + ";base64," + imageBuffer
      };
    });
  }),
  includeDefaultStyleMap: true,
  includeEmbeddedStyleMap: true,
  ignoreEmptyParagraphs: false,
  preserveEmptyParagraphs: false,
  transformDocument: null,
  styleMap: [],
  extractRawText: false,
  extractImages: true,
  extractMetadata: true
};

/**
 * Default conversion options
 */
const DEFAULT_CONVERSION_OPTIONS = {
  format: 'html',
  preserveFormatting: true,
  includeImages: true,
  imageFormat: 'base64',
  customStyleMap: null,
  outputEncoding: 'utf8'
};

/**
 * Style mapping configurations
 */
const STYLE_MAPPINGS = {
  // Paragraph styles
  'p[style-name="Heading 1"]': 'h1',
  'p[style-name="Heading 2"]': 'h2',
  'p[style-name="Heading 3"]': 'h3',
  'p[style-name="Heading 4"]': 'h4',
  'p[style-name="Heading 5"]': 'h5',
  'p[style-name="Heading 6"]': 'h6',
  'p[style-name="Title"]': 'h1.title',
  'p[style-name="Subtitle"]': 'h2.subtitle',
  'p[style-name="Quote"]': 'blockquote',
  'p[style-name="Code"]': 'pre',
  
  // Character styles
  'r[style-name="Strong"]': 'strong',
  'r[style-name="Emphasis"]': 'em',
  'r[style-name="Code Char"]': 'code',
  'r[style-name="Hyperlink"]': 'a',
  
  // Table styles
  'table[style-name="Table Grid"]': 'table.table-grid',
  'table[style-name="Light Shading"]': 'table.light-shading',
  
  // List styles
  'p[style-name="List Paragraph"]': 'li',
  'p[style-name="Bullet List"]': 'li',
  'p[style-name="Number List"]': 'li'
};

/**
 * DOCX Service class
 */
class DOCXService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      ...DEFAULT_PARSE_OPTIONS,
      ...options
    };
    
    this.cache = new Map();
    this.statistics = {
      documentsProcessed: 0,
      conversionsPerformed: 0,
      totalParseTime: 0,
      totalConversionTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errorsEncountered: 0,
      imagesExtracted: 0,
      averageFileSize: 0
    };
  }

  /**
   * Parse DOCX document from file path
   */
  async parseDOCX(filePath, options = {}) {
    const startTime = Date.now();
    const parseOptions = { ...this.options, ...options };
    
    try {
      this.emit(DOCXEvents.PARSING_STARTED, { filePath, options: parseOptions });
      
      // Check cache first
      const cacheKey = this._getCacheKey(filePath, parseOptions);
      if (this.cache.has(cacheKey)) {
        this.statistics.cacheHits++;
        const cached = this.cache.get(cacheKey);
        this.emit(DOCXEvents.PARSING_COMPLETED, { filePath, cached: true });
        return cached;
      }
      
      this.statistics.cacheMisses++;
      
      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const fileStats = await fs.stat(filePath);
      
      // Parse with Mammoth
      const result = await this._parseWithMammoth(fileBuffer, parseOptions);
      
      // Extract metadata if requested
      let metadata = {};
      if (parseOptions.extractMetadata) {
        metadata = await this._extractMetadata(fileBuffer);
        this.emit(DOCXEvents.METADATA_EXTRACTED, { filePath, metadata });
      }
      
      // Create document info
      const processingTime = Date.now() - startTime;
      const docInfo = new DOCXDocumentInfo({
        filePath,
        fileName: path.basename(filePath),
        fileSize: fileStats.size,
        metadata,
        content: {
          text: result.value,
          html: result.value,
          markdown: this._convertToMarkdown(result.value)
        },
        images: result.images || [],
        styles: result.styles || [],
        warnings: result.messages || [],
        processingTime
      });
      
      // Cache result
      this.cache.set(cacheKey, docInfo);
      
      // Update statistics
      this.statistics.documentsProcessed++;
      this.statistics.totalParseTime += processingTime;
      this.statistics.averageFileSize = 
        (this.statistics.averageFileSize * (this.statistics.documentsProcessed - 1) + fileStats.size) / 
        this.statistics.documentsProcessed;
      
      this.emit(DOCXEvents.PARSING_COMPLETED, { filePath, docInfo, processingTime });
      
      return docInfo;
      
    } catch (error) {
      this.statistics.errorsEncountered++;
      this.emit(DOCXEvents.PARSING_ERROR, { filePath, error });
      throw error;
    }
  }

  /**
   * Parse DOCX from buffer
   */
  async parseDOCXFromBuffer(buffer, fileName = 'document.docx', options = {}) {
    const startTime = Date.now();
    const parseOptions = { ...this.options, ...options };
    
    try {
      this.emit(DOCXEvents.PARSING_STARTED, { fileName, buffer: true });
      
      // Parse with Mammoth
      const result = await this._parseWithMammoth(buffer, parseOptions);
      
      // Extract metadata if requested
      let metadata = {};
      if (parseOptions.extractMetadata) {
        metadata = await this._extractMetadata(buffer);
        this.emit(DOCXEvents.METADATA_EXTRACTED, { fileName, metadata });
      }
      
      // Create document info
      const processingTime = Date.now() - startTime;
      const docInfo = new DOCXDocumentInfo({
        fileName,
        fileSize: buffer.length,
        metadata,
        content: {
          text: result.value,
          html: result.value,
          markdown: this._convertToMarkdown(result.value)
        },
        images: result.images || [],
        styles: result.styles || [],
        warnings: result.messages || [],
        processingTime
      });
      
      // Update statistics
      this.statistics.documentsProcessed++;
      this.statistics.totalParseTime += processingTime;
      
      this.emit(DOCXEvents.PARSING_COMPLETED, { fileName, docInfo, processingTime });
      
      return docInfo;
      
    } catch (error) {
      this.statistics.errorsEncountered++;
      this.emit(DOCXEvents.PARSING_ERROR, { fileName, error });
      throw error;
    }
  }

  /**
   * Convert DOCX to specific format
   */
  async convertDOCX(inputPath, outputPath, options = {}) {
    const startTime = Date.now();
    const conversionOptions = { ...DEFAULT_CONVERSION_OPTIONS, ...options };
    
    try {
      this.emit(DOCXEvents.CONVERSION_STARTED, { inputPath, outputPath, options: conversionOptions });
      
      // Parse document first
      const docInfo = await this.parseDOCX(inputPath, {
        extractImages: conversionOptions.includeImages,
        extractMetadata: true,
        styleMap: conversionOptions.customStyleMap || this._getDefaultStyleMap()
      });
      
      let outputContent;
      let outputFormat = conversionOptions.format.toLowerCase();
      
      // Convert based on format
      switch (outputFormat) {
        case 'html':
          outputContent = docInfo.getHTML();
          break;
        case 'markdown':
        case 'md':
          outputContent = docInfo.getMarkdown();
          break;
        case 'txt':
        case 'text':
          outputContent = docInfo.getPlainText();
          break;
        default:
          throw new Error(`Unsupported output format: ${outputFormat}`);
      }
      
      // Write output file
      await fs.writeFile(outputPath, outputContent, conversionOptions.outputEncoding);
      const outputStats = await fs.stat(outputPath);
      
      const processingTime = Date.now() - startTime;
      
      // Create conversion result
      const result = new DOCXConversionResult({
        success: true,
        outputPath,
        format: outputFormat,
        fileSize: outputStats.size,
        processingTime,
        metadata: docInfo.metadata,
        warnings: docInfo.warnings
      });
      
      // Update statistics
      this.statistics.conversionsPerformed++;
      this.statistics.totalConversionTime += processingTime;
      
      this.emit(DOCXEvents.CONVERSION_COMPLETED, { inputPath, outputPath, result });
      
      return result;
      
    } catch (error) {
      this.statistics.errorsEncountered++;
      this.emit(DOCXEvents.CONVERSION_ERROR, { inputPath, outputPath, error });
      throw error;
    }
  }

  /**
   * Extract text from DOCX
   */
  async extractText(filePath, options = {}) {
    const docInfo = await this.parseDOCX(filePath, {
      ...options,
      extractRawText: true
    });
    
    return docInfo.getPlainText();
  }

  /**
   * Extract metadata from DOCX
   */
  async getMetadata(filePath) {
    const docInfo = await this.parseDOCX(filePath, {
      extractMetadata: true,
      extractImages: false,
      maxPages: 0
    });
    
    return {
      ...docInfo.metadata,
      fileInfo: {
        fileName: docInfo.fileName,
        fileSize: docInfo.fileSize,
        wordCount: docInfo.getWordCount(),
        characterCount: docInfo.getCharacterCount(),
        paragraphCount: docInfo.getParagraphCount(),
        imageCount: docInfo.getImageCount()
      }
    };
  }

  /**
   * Extract images from DOCX
   */
  async extractImages(filePath, outputDir, options = {}) {
    const docInfo = await this.parseDOCX(filePath, {
      extractImages: true,
      ...options
    });
    
    const extractedImages = [];
    
    for (let i = 0; i < docInfo.images.length; i++) {
      const image = docInfo.images[i];
      const imageName = `image_${i + 1}.${this._getImageExtension(image.contentType)}`;
      const imagePath = path.join(outputDir, imageName);
      
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });
      
      // Write image file
      await fs.writeFile(imagePath, image.buffer);
      
      extractedImages.push({
        originalIndex: i,
        fileName: imageName,
        filePath: imagePath,
        contentType: image.contentType,
        size: image.buffer.length
      });
      
      this.emit(DOCXEvents.IMAGE_EXTRACTED, {
        filePath,
        imagePath,
        contentType: image.contentType
      });
    }
    
    this.statistics.imagesExtracted += extractedImages.length;
    
    return extractedImages;
  }

  /**
   * Get document statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      cacheSize: this.cache.size,
      averageParseTime: this.statistics.documentsProcessed > 0 ? 
        this.statistics.totalParseTime / this.statistics.documentsProcessed : 0,
      averageConversionTime: this.statistics.conversionsPerformed > 0 ? 
        this.statistics.totalConversionTime / this.statistics.conversionsPerformed : 0
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

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      documentsProcessed: 0,
      conversionsPerformed: 0,
      totalParseTime: 0,
      totalConversionTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errorsEncountered: 0,
      imagesExtracted: 0,
      averageFileSize: 0
    };
  }

  /**
   * Parse with Mammoth.js
   * @private
   */
  async _parseWithMammoth(buffer, options) {
    const mammothOptions = {
      convertImage: options.convertImage,
      includeDefaultStyleMap: options.includeDefaultStyleMap,
      includeEmbeddedStyleMap: options.includeEmbeddedStyleMap,
      ignoreEmptyParagraphs: options.ignoreEmptyParagraphs,
      preserveEmptyParagraphs: options.preserveEmptyParagraphs,
      transformDocument: options.transformDocument,
      styleMap: options.styleMap || this._getDefaultStyleMap()
    };
    
    if (options.extractRawText) {
      return await mammoth.extractRawText({ buffer }, mammothOptions);
    } else {
      return await mammoth.convertToHtml({ buffer }, mammothOptions);
    }
  }

  /**
   * Extract metadata from DOCX buffer
   * @private
   */
  async _extractMetadata(buffer) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const metadata = {};
      
      // Extract core properties
      const corePropsFile = zip.file('docProps/core.xml');
      if (corePropsFile) {
        const corePropsXml = await corePropsFile.async('text');
        metadata.core = this._parseCoreProperties(corePropsXml);
      }
      
      // Extract app properties
      const appPropsFile = zip.file('docProps/app.xml');
      if (appPropsFile) {
        const appPropsXml = await appPropsFile.async('text');
        metadata.app = this._parseAppProperties(appPropsXml);
      }
      
      // Extract custom properties
      const customPropsFile = zip.file('docProps/custom.xml');
      if (customPropsFile) {
        const customPropsXml = await customPropsFile.async('text');
        metadata.custom = this._parseCustomProperties(customPropsXml);
      }
      
      return metadata;
    } catch (error) {
      return {};
    }
  }

  /**
   * Parse core properties XML
   * @private
   */
  _parseCoreProperties(xml) {
    const properties = {};
    
    // Simple XML parsing for common properties
    const patterns = {
      title: /<dc:title[^>]*>([^<]*)<\/dc:title>/,
      creator: /<dc:creator[^>]*>([^<]*)<\/dc:creator>/,
      subject: /<dc:subject[^>]*>([^<]*)<\/dc:subject>/,
      description: /<dc:description[^>]*>([^<]*)<\/dc:description>/,
      created: /<dcterms:created[^>]*>([^<]*)<\/dcterms:created>/,
      modified: /<dcterms:modified[^>]*>([^<]*)<\/dcterms:modified>/,
      lastModifiedBy: /<cp:lastModifiedBy[^>]*>([^<]*)<\/cp:lastModifiedBy>/
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = xml.match(pattern);
      if (match) {
        properties[key] = match[1];
      }
    }
    
    return properties;
  }

  /**
   * Parse app properties XML
   * @private
   */
  _parseAppProperties(xml) {
    const properties = {};
    
    const patterns = {
      application: /<Application[^>]*>([^<]*)<\/Application>/,
      appVersion: /<AppVersion[^>]*>([^<]*)<\/AppVersion>/,
      company: /<Company[^>]*>([^<]*)<\/Company>/,
      pages: /<Pages[^>]*>([^<]*)<\/Pages>/,
      words: /<Words[^>]*>([^<]*)<\/Words>/,
      characters: /<Characters[^>]*>([^<]*)<\/Characters>/,
      charactersWithSpaces: /<CharactersWithSpaces[^>]*>([^<]*)<\/CharactersWithSpaces>/,
      paragraphs: /<Paragraphs[^>]*>([^<]*)<\/Paragraphs>/
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = xml.match(pattern);
      if (match) {
        properties[key] = isNaN(match[1]) ? match[1] : parseInt(match[1]);
      }
    }
    
    return properties;
  }

  /**
   * Parse custom properties XML
   * @private
   */
  _parseCustomProperties(xml) {
    const properties = {};
    
    // Extract custom properties
    const propertyPattern = /<property[^>]*name="([^"]*)">([^<]*)<\/property>/g;
    let match;
    
    while ((match = propertyPattern.exec(xml)) !== null) {
      properties[match[1]] = match[2];
    }
    
    return properties;
  }

  /**
   * Convert HTML to Markdown
   * @private
   */
  _convertToMarkdown(html) {
    // Simple HTML to Markdown conversion
    let markdown = html
      .replace(/<h1[^>]*>([^<]*)<\/h1>/g, '# $1\n\n')
      .replace(/<h2[^>]*>([^<]*)<\/h2>/g, '## $1\n\n')
      .replace(/<h3[^>]*>([^<]*)<\/h3>/g, '### $1\n\n')
      .replace(/<h4[^>]*>([^<]*)<\/h4>/g, '#### $1\n\n')
      .replace(/<h5[^>]*>([^<]*)<\/h5>/g, '##### $1\n\n')
      .replace(/<h6[^>]*>([^<]*)<\/h6>/g, '###### $1\n\n')
      .replace(/<strong[^>]*>([^<]*)<\/strong>/g, '**$1**')
      .replace(/<b[^>]*>([^<]*)<\/b>/g, '**$1**')
      .replace(/<em[^>]*>([^<]*)<\/em>/g, '*$1*')
      .replace(/<i[^>]*>([^<]*)<\/i>/g, '*$1*')
      .replace(/<code[^>]*>([^<]*)<\/code>/g, '`$1`')
      .replace(/<pre[^>]*>([^<]*)<\/pre>/g, '```\n$1\n```\n')
      .replace(/<blockquote[^>]*>([^<]*)<\/blockquote>/g, '> $1\n\n')
      .replace(/<p[^>]*>([^<]*)<\/p>/g, '$1\n\n')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
      .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
      .trim();
    
    return markdown;
  }

  /**
   * Get default style map
   * @private
   */
  _getDefaultStyleMap() {
    return Object.entries(STYLE_MAPPINGS).map(([from, to]) => `${from} => ${to}`);
  }

  /**
   * Get image extension from content type
   * @private
   */
  _getImageExtension(contentType) {
    const extensions = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/webp': 'webp'
    };
    
    return extensions[contentType] || 'png';
  }

  /**
   * Generate cache key
   * @private
   */
  _getCacheKey(filePath, options) {
    const optionsHash = JSON.stringify(options);
    return `${filePath}:${optionsHash}`;
  }
}

// Global instance
let globalDOCXService = null;

/**
 * Get global DOCX service instance
 */
function getDOCXService(options = {}) {
  if (!globalDOCXService) {
    globalDOCXService = new DOCXService(options);
  }
  return globalDOCXService;
}

module.exports = {
  DOCXService,
  DOCXDocumentInfo,
  DOCXConversionResult,
  DOCXEvents,
  STYLE_MAPPINGS,
  DEFAULT_PARSE_OPTIONS,
  DEFAULT_CONVERSION_OPTIONS,
  getDOCXService
};