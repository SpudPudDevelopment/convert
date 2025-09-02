/**
 * Preset Import/Export Service
 * Handles importing and exporting conversion presets with validation and format support
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { ConversionPreset, PresetCategory } = require('../models/ConversionPreset');

/**
 * Import/Export events
 */
const ImportExportEvents = {
  EXPORT_STARTED: 'export_started',
  EXPORT_COMPLETED: 'export_completed',
  EXPORT_FAILED: 'export_failed',
  IMPORT_STARTED: 'import_started',
  IMPORT_COMPLETED: 'import_completed',
  IMPORT_FAILED: 'import_failed',
  PRESET_IMPORTED: 'preset_imported',
  PRESET_EXPORTED: 'preset_exported',
  VALIDATION_WARNING: 'validation_warning',
  BATCH_PROGRESS: 'batch_progress'
};

/**
 * Export formats
 */
const ExportFormat = {
  JSON: 'json',
  YAML: 'yaml',
  XML: 'xml',
  CSV: 'csv',
  PRESET_PACK: 'preset_pack' // Custom format with metadata
};

/**
 * Import sources
 */
const ImportSource = {
  FILE: 'file',
  URL: 'url',
  TEXT: 'text',
  CLIPBOARD: 'clipboard'
};

/**
 * Validation levels
 */
const ValidationLevel = {
  STRICT: 'strict',     // Reject any invalid presets
  MODERATE: 'moderate', // Fix minor issues, warn about major ones
  LENIENT: 'lenient'    // Accept most presets with warnings
};

/**
 * Export options
 */
const DEFAULT_EXPORT_OPTIONS = {
  format: ExportFormat.JSON,
  includeUsageStats: false,
  includeSharing: false,
  includeMetadata: true,
  compression: false,
  encryption: false,
  password: null,
  categories: [], // Empty = all categories
  tags: [], // Empty = all tags
  dateRange: null, // { start, end }
  maxFileSize: 50 * 1024 * 1024, // 50MB
  prettyPrint: true
};

/**
 * Import options
 */
const DEFAULT_IMPORT_OPTIONS = {
  validationLevel: ValidationLevel.MODERATE,
  overwriteExisting: false,
  mergeSettings: false,
  preserveIds: false,
  autoCategories: true,
  defaultOwner: null,
  skipDuplicates: true,
  maxPresets: 1000,
  allowSystemPresets: false
};

/**
 * Preset pack metadata
 */
class PresetPack {
  constructor(data = {}) {
    this.version = data.version || '1.0.0';
    this.name = data.name || 'Preset Pack';
    this.description = data.description || '';
    this.author = data.author || '';
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.presets = data.presets || [];
    this.categories = data.categories || [];
    this.tags = data.tags || [];
    this.metadata = data.metadata || {};
    this.checksum = data.checksum || '';
    this.signature = data.signature || '';
  }
  
  /**
   * Calculate checksum
   */
  calculateChecksum() {
    const content = JSON.stringify({
      version: this.version,
      name: this.name,
      presets: this.presets,
      categories: this.categories
    });
    
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  
  /**
   * Validate pack integrity
   */
  validateIntegrity() {
    const calculatedChecksum = this.calculateChecksum();
    return this.checksum === calculatedChecksum;
  }
}

/**
 * Import/Export result
 */
class ImportExportResult {
  constructor() {
    this.success = false;
    this.processed = 0;
    this.imported = 0;
    this.exported = 0;
    this.skipped = 0;
    this.errors = [];
    this.warnings = [];
    this.presets = [];
    this.filePath = null;
    this.fileSize = 0;
    this.duration = 0;
    this.metadata = {};
  }
  
  /**
   * Add error
   */
  addError(error, presetId = null) {
    this.errors.push({
      message: error.message || error,
      presetId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Add warning
   */
  addWarning(warning, presetId = null) {
    this.warnings.push({
      message: warning.message || warning,
      presetId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Get summary
   */
  getSummary() {
    return {
      success: this.success,
      processed: this.processed,
      imported: this.imported,
      exported: this.exported,
      skipped: this.skipped,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      duration: this.duration
    };
  }
}

/**
 * Preset Import/Export Service
 */
class PresetImportExportService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      tempDirectory: options.tempDirectory || '/tmp/preset-import-export',
      maxConcurrentOperations: options.maxConcurrentOperations || 5,
      enableEncryption: options.enableEncryption || false,
      enableCompression: options.enableCompression || true,
      ...options
    };
    
    this.activeOperations = new Map();
    this.statistics = {
      totalExports: 0,
      totalImports: 0,
      totalPresets: 0,
      averageExportTime: 0,
      averageImportTime: 0
    };
    
    this._ensureTempDirectory();
  }
  
  /**
   * Ensure temp directory exists
   */
  async _ensureTempDirectory() {
    try {
      await fs.mkdir(this.options.tempDirectory, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
  
  /**
   * Export presets
   */
  async exportPresets(presets, filePath, options = {}) {
    const startTime = Date.now();
    const operationId = this._generateOperationId();
    const exportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    const result = new ImportExportResult();
    
    try {
      this.emit(ImportExportEvents.EXPORT_STARTED, {
        operationId,
        presetCount: presets.length,
        filePath,
        options: exportOptions
      });
      
      this.activeOperations.set(operationId, {
        type: 'export',
        startTime,
        presetCount: presets.length
      });
      
      // Filter presets based on options
      const filteredPresets = this._filterPresets(presets, exportOptions);
      result.processed = filteredPresets.length;
      
      // Prepare export data
      const exportData = await this._prepareExportData(filteredPresets, exportOptions);
      
      // Write to file
      await this._writeExportFile(exportData, filePath, exportOptions);
      
      // Get file stats
      const stats = await fs.stat(filePath);
      result.fileSize = stats.size;
      result.filePath = filePath;
      result.exported = filteredPresets.length;
      result.success = true;
      
      // Update statistics
      this.statistics.totalExports++;
      this.statistics.totalPresets += result.exported;
      
      const duration = Date.now() - startTime;
      result.duration = duration;
      this.statistics.averageExportTime = 
        (this.statistics.averageExportTime * (this.statistics.totalExports - 1) + duration) / 
        this.statistics.totalExports;
      
      this.emit(ImportExportEvents.EXPORT_COMPLETED, {
        operationId,
        result
      });
      
    } catch (error) {
      result.addError(error);
      result.success = false;
      
      this.emit(ImportExportEvents.EXPORT_FAILED, {
        operationId,
        error,
        result
      });
    } finally {
      this.activeOperations.delete(operationId);
    }
    
    return result;
  }
  
  /**
   * Import presets
   */
  async importPresets(source, sourceType = ImportSource.FILE, options = {}) {
    const startTime = Date.now();
    const operationId = this._generateOperationId();
    const importOptions = { ...DEFAULT_IMPORT_OPTIONS, ...options };
    const result = new ImportExportResult();
    
    try {
      this.emit(ImportExportEvents.IMPORT_STARTED, {
        operationId,
        source,
        sourceType,
        options: importOptions
      });
      
      this.activeOperations.set(operationId, {
        type: 'import',
        startTime,
        source
      });
      
      // Load import data
      const importData = await this._loadImportData(source, sourceType, importOptions);
      
      // Parse and validate presets
      const parsedPresets = await this._parseImportData(importData, importOptions, result);
      result.processed = parsedPresets.length;
      
      // Process presets
      const processedPresets = [];
      for (let i = 0; i < parsedPresets.length; i++) {
        try {
          const preset = await this._processImportedPreset(parsedPresets[i], importOptions, result);
          if (preset) {
            processedPresets.push(preset);
            result.imported++;
            
            this.emit(ImportExportEvents.PRESET_IMPORTED, {
              operationId,
              preset,
              index: i,
              total: parsedPresets.length
            });
          } else {
            result.skipped++;
          }
        } catch (error) {
          result.addError(error, parsedPresets[i]?.id || `preset_${i}`);
        }
        
        // Emit progress
        if (i % 10 === 0 || i === parsedPresets.length - 1) {
          this.emit(ImportExportEvents.BATCH_PROGRESS, {
            operationId,
            processed: i + 1,
            total: parsedPresets.length,
            imported: result.imported,
            skipped: result.skipped,
            errors: result.errors.length
          });
        }
      }
      
      result.presets = processedPresets;
      result.success = result.imported > 0 || result.errors.length === 0;
      
      // Update statistics
      this.statistics.totalImports++;
      this.statistics.totalPresets += result.imported;
      
      const duration = Date.now() - startTime;
      result.duration = duration;
      this.statistics.averageImportTime = 
        (this.statistics.averageImportTime * (this.statistics.totalImports - 1) + duration) / 
        this.statistics.totalImports;
      
      this.emit(ImportExportEvents.IMPORT_COMPLETED, {
        operationId,
        result
      });
      
    } catch (error) {
      result.addError(error);
      result.success = false;
      
      this.emit(ImportExportEvents.IMPORT_FAILED, {
        operationId,
        error,
        result
      });
    } finally {
      this.activeOperations.delete(operationId);
    }
    
    return result;
  }
  
  /**
   * Export single preset
   */
  async exportPreset(preset, filePath, options = {}) {
    return this.exportPresets([preset], filePath, options);
  }
  
  /**
   * Import single preset from text
   */
  async importPresetFromText(presetText, options = {}) {
    return this.importPresets(presetText, ImportSource.TEXT, options);
  }
  
  /**
   * Create preset pack
   */
  async createPresetPack(presets, packInfo, filePath, options = {}) {
    const pack = new PresetPack({
      ...packInfo,
      presets: presets.map(p => p.export(options.includeUsageStats, options.includeSharing)),
      categories: [...new Set(presets.map(p => p.category))],
      tags: [...new Set(presets.flatMap(p => p.tags))]
    });
    
    pack.checksum = pack.calculateChecksum();
    
    const exportOptions = {
      ...options,
      format: ExportFormat.PRESET_PACK
    };
    
    return this.exportPresets(presets, filePath, exportOptions);
  }
  
  /**
   * Import preset pack
   */
  async importPresetPack(filePath, options = {}) {
    const importOptions = {
      ...options,
      expectedFormat: ExportFormat.PRESET_PACK
    };
    
    return this.importPresets(filePath, ImportSource.FILE, importOptions);
  }
  
  /**
   * Filter presets based on export options
   */
  _filterPresets(presets, options) {
    let filtered = [...presets];
    
    // Filter by categories
    if (options.categories && options.categories.length > 0) {
      filtered = filtered.filter(p => options.categories.includes(p.category));
    }
    
    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter(p => 
        options.tags.some(tag => p.tags.includes(tag))
      );
    }
    
    // Filter by date range
    if (options.dateRange) {
      const { start, end } = options.dateRange;
      filtered = filtered.filter(p => {
        const date = p.updatedAt || p.createdAt;
        return date >= start && date <= end;
      });
    }
    
    return filtered;
  }
  
  /**
   * Prepare export data
   */
  async _prepareExportData(presets, options) {
    const exportData = {
      metadata: {
        version: '1.0.0',
        exportedAt: Date.now(),
        exportedBy: 'PresetImportExportService',
        format: options.format,
        presetCount: presets.length,
        options: {
          includeUsageStats: options.includeUsageStats,
          includeSharing: options.includeSharing,
          includeMetadata: options.includeMetadata
        }
      },
      presets: presets.map(preset => 
        preset.export(options.includeUsageStats, options.includeSharing)
      )
    };
    
    if (options.format === ExportFormat.PRESET_PACK) {
      const pack = new PresetPack({
        name: options.packName || 'Exported Presets',
        description: options.packDescription || '',
        author: options.packAuthor || '',
        presets: exportData.presets,
        categories: [...new Set(presets.map(p => p.category))],
        tags: [...new Set(presets.flatMap(p => p.tags))],
        metadata: exportData.metadata
      });
      
      pack.checksum = pack.calculateChecksum();
      return pack;
    }
    
    return exportData;
  }
  
  /**
   * Write export file
   */
  async _writeExportFile(data, filePath, options) {
    let content;
    
    switch (options.format) {
      case ExportFormat.JSON:
      case ExportFormat.PRESET_PACK:
        content = JSON.stringify(data, null, options.prettyPrint ? 2 : 0);
        break;
      
      case ExportFormat.YAML:
        // Would need yaml library
        throw new Error('YAML export not implemented');
      
      case ExportFormat.XML:
        content = this._convertToXML(data);
        break;
      
      case ExportFormat.CSV:
        content = this._convertToCSV(data.presets || data);
        break;
      
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
    
    // Apply compression if requested
    if (options.compression) {
      // Would need compression library
      throw new Error('Compression not implemented');
    }
    
    // Apply encryption if requested
    if (options.encryption && options.password) {
      content = this._encryptContent(content, options.password);
    }
    
    await fs.writeFile(filePath, content, 'utf8');
  }
  
  /**
   * Load import data
   */
  async _loadImportData(source, sourceType, options) {
    switch (sourceType) {
      case ImportSource.FILE:
        return await fs.readFile(source, 'utf8');
      
      case ImportSource.URL:
        // Would need HTTP client
        throw new Error('URL import not implemented');
      
      case ImportSource.TEXT:
        return source;
      
      case ImportSource.CLIPBOARD:
        // Would need clipboard access
        throw new Error('Clipboard import not implemented');
      
      default:
        throw new Error(`Unsupported import source: ${sourceType}`);
    }
  }
  
  /**
   * Parse import data
   */
  async _parseImportData(data, options, result) {
    let parsedData;
    
    try {
      // Try JSON first
      parsedData = JSON.parse(data);
    } catch (error) {
      // Try other formats
      throw new Error('Failed to parse import data: ' + error.message);
    }
    
    // Handle different data structures
    let presets = [];
    
    if (Array.isArray(parsedData)) {
      // Direct array of presets
      presets = parsedData;
    } else if (parsedData.presets) {
      // Wrapped in metadata object
      presets = parsedData.presets;
      
      // Validate preset pack if applicable
      if (parsedData.version && parsedData.checksum) {
        const pack = new PresetPack(parsedData);
        if (!pack.validateIntegrity()) {
          result.addWarning('Preset pack checksum validation failed');
        }
      }
    } else if (parsedData.name && parsedData.settings) {
      // Single preset
      presets = [parsedData];
    } else {
      throw new Error('Invalid preset data structure');
    }
    
    // Limit number of presets
    if (presets.length > options.maxPresets) {
      result.addWarning(`Too many presets (${presets.length}), limiting to ${options.maxPresets}`);
      presets = presets.slice(0, options.maxPresets);
    }
    
    return presets;
  }
  
  /**
   * Process imported preset
   */
  async _processImportedPreset(presetData, options, result) {
    try {
      // Create preset instance
      let preset;
      
      if (presetData instanceof ConversionPreset) {
        preset = presetData;
      } else {
        preset = ConversionPreset.import(presetData, options.defaultOwner);
      }
      
      // Validate preset
      const validation = preset.validate();
      
      if (!validation.isValid) {
        if (options.validationLevel === ValidationLevel.STRICT) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        } else {
          validation.errors.forEach(error => 
            result.addWarning(`Validation warning: ${error}`, preset.id)
          );
        }
      }
      
      // Handle ID conflicts
      if (!options.preserveIds) {
        preset.id = preset._generateId();
      }
      
      // Auto-categorize if requested
      if (options.autoCategories && preset.category === PresetCategory.CUSTOM) {
        // Would integrate with categorization service
        // const categorization = await this.categorizationService.categorizePreset(preset);
      }
      
      // Set owner
      if (options.defaultOwner && !preset.ownerId) {
        preset.ownerId = options.defaultOwner;
      }
      
      // Check for duplicates
      if (options.skipDuplicates) {
        // Would need access to existing presets to check
        // This would be implemented by the calling service
      }
      
      return preset;
      
    } catch (error) {
      if (options.validationLevel === ValidationLevel.LENIENT) {
        result.addWarning(`Failed to process preset: ${error.message}`, presetData.id);
        return null;
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Convert to XML
   */
  _convertToXML(data) {
    // Simple XML conversion - would need proper XML library for production
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<presets>\n';
    
    const presets = data.presets || data;
    for (const preset of presets) {
      xml += '  <preset>\n';
      xml += `    <id>${this._escapeXML(preset.id || '')}</id>\n`;
      xml += `    <name>${this._escapeXML(preset.name || '')}</name>\n`;
      xml += `    <description>${this._escapeXML(preset.description || '')}</description>\n`;
      xml += `    <category>${this._escapeXML(preset.category || '')}</category>\n`;
      xml += '    <settings>\n';
      
      for (const [key, value] of Object.entries(preset.settings || {})) {
        xml += `      <${key}>${this._escapeXML(String(value))}</${key}>\n`;
      }
      
      xml += '    </settings>\n';
      xml += '  </preset>\n';
    }
    
    xml += '</presets>';
    return xml;
  }
  
  /**
   * Convert to CSV
   */
  _convertToCSV(presets) {
    if (!presets || presets.length === 0) {
      return 'id,name,description,category,format,settings\n';
    }
    
    const headers = ['id', 'name', 'description', 'category', 'format', 'settings'];
    let csv = headers.join(',') + '\n';
    
    for (const preset of presets) {
      const row = [
        this._escapeCSV(preset.id || ''),
        this._escapeCSV(preset.name || ''),
        this._escapeCSV(preset.description || ''),
        this._escapeCSV(preset.category || ''),
        this._escapeCSV(preset.settings?.format || ''),
        this._escapeCSV(JSON.stringify(preset.settings || {}))
      ];
      
      csv += row.join(',') + '\n';
    }
    
    return csv;
  }
  
  /**
   * Escape XML content
   */
  _escapeXML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  /**
   * Escape CSV content
   */
  _escapeCSV(text) {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }
  
  /**
   * Encrypt content
   */
  _encryptContent(content, password) {
    // Simple encryption - would need proper crypto library for production
    const cipher = crypto.createCipher('aes192', password);
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }
  
  /**
   * Decrypt content
   */
  _decryptContent(encryptedContent, password) {
    const decipher = crypto.createDecipher('aes192', password);
    let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
  
  /**
   * Generate operation ID
   */
  _generateOperationId() {
    return crypto.randomBytes(8).toString('hex');
  }
  
  /**
   * Get active operations
   */
  getActiveOperations() {
    return Array.from(this.activeOperations.entries()).map(([id, operation]) => ({
      id,
      ...operation,
      duration: Date.now() - operation.startTime
    }));
  }
  
  /**
   * Cancel operation
   */
  cancelOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      this.activeOperations.delete(operationId);
      return true;
    }
    return false;
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      activeOperations: this.activeOperations.size
    };
  }
  
  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalExports: 0,
      totalImports: 0,
      totalPresets: 0,
      averageExportTime: 0,
      averageImportTime: 0
    };
  }
  
  /**
   * Cleanup temp files
   */
  async cleanupTempFiles(olderThan = 24 * 60 * 60 * 1000) { // 24 hours
    try {
      const files = await fs.readdir(this.options.tempDirectory);
      const now = Date.now();
      
      for (const file of files) {
        const filePath = path.join(this.options.tempDirectory, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > olderThan) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Global instance
let globalInstance = null;

/**
 * Get global import/export service instance
 */
function getImportExportService(options = {}) {
  if (!globalInstance) {
    globalInstance = new PresetImportExportService(options);
  }
  return globalInstance;
}

module.exports = {
  PresetImportExportService,
  PresetPack,
  ImportExportResult,
  ImportExportEvents,
  ExportFormat,
  ImportSource,
  ValidationLevel,
  DEFAULT_EXPORT_OPTIONS,
  DEFAULT_IMPORT_OPTIONS,
  getImportExportService
};