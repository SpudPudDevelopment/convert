/**
 * Conversion Preset Validator Service
 * Provides comprehensive validation and data integrity checks for conversion presets
 */

const {
  PresetCategory,
  PresetVisibility,
  PresetStatus,
  QualityLevel,
  ConversionMode,
  ConversionPreset
} = require('../models/ConversionPreset');

/**
 * Validation error types
 */
const ValidationErrorType = {
  SCHEMA_VIOLATION: 'schema_violation',
  BUSINESS_RULE: 'business_rule',
  DATA_INTEGRITY: 'data_integrity',
  DEPENDENCY: 'dependency',
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  COMPATIBILITY: 'compatibility'
};

/**
 * Validation severity levels
 */
const ValidationSeverity = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

/**
 * Validation rules configuration
 */
const DEFAULT_VALIDATION_CONFIG = {
  strictMode: false,
  allowUnknownProperties: false,
  validateDependencies: true,
  checkPerformanceImpact: true,
  validateSecurity: true,
  maxPresetSize: 1024 * 1024, // 1MB
  maxSettingsDepth: 10,
  maxArrayLength: 1000,
  allowedFileExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg',
                         '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.m4v',
                         '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt'],
  requiredFields: ['name', 'category', 'settings'],
  maxNameLength: 100,
  maxDescriptionLength: 500,
  maxTagsCount: 20,
  maxTagLength: 50
};

/**
 * Validation result structure
 */
class ValidationResult {
  constructor() {
    this.isValid = true;
    this.errors = [];
    this.warnings = [];
    this.info = [];
    this.metadata = {
      validatedAt: new Date().toISOString(),
      validationDuration: 0,
      rulesApplied: [],
      dataIntegrityScore: 100
    };
  }

  addError(type, field, message, details = {}) {
    this.isValid = false;
    this.errors.push({
      type,
      field,
      message,
      severity: ValidationSeverity.ERROR,
      details,
      timestamp: new Date().toISOString()
    });
  }

  addWarning(type, field, message, details = {}) {
    this.warnings.push({
      type,
      field,
      message,
      severity: ValidationSeverity.WARNING,
      details,
      timestamp: new Date().toISOString()
    });
  }

  addInfo(type, field, message, details = {}) {
    this.info.push({
      type,
      field,
      message,
      severity: ValidationSeverity.INFO,
      details,
      timestamp: new Date().toISOString()
    });
  }

  getAllIssues() {
    return [...this.errors, ...this.warnings, ...this.info];
  }

  getIssuesByType(type) {
    return this.getAllIssues().filter(issue => issue.type === type);
  }

  getIssuesBySeverity(severity) {
    return this.getAllIssues().filter(issue => issue.severity === severity);
  }

  hasErrors() {
    return this.errors.length > 0;
  }

  hasWarnings() {
    return this.warnings.length > 0;
  }

  getSummary() {
    return {
      isValid: this.isValid,
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
      infoCount: this.info.length,
      dataIntegrityScore: this.metadata.dataIntegrityScore,
      validationDuration: this.metadata.validationDuration
    };
  }
}

/**
 * Conversion Preset Validator
 */
class ConversionPresetValidator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
    this.customValidators = new Map();
    this.validationRules = new Map();
    
    // Initialize built-in validation rules
    this._initializeValidationRules();
  }

  /**
   * Validate a single preset
   */
  async validatePreset(preset, options = {}) {
    const startTime = Date.now();
    const result = new ValidationResult();
    
    const {
      skipDependencyCheck = false,
      skipPerformanceCheck = false,
      skipSecurityCheck = false,
      customRules = [],
      context = {}
    } = options;

    try {
      // Basic schema validation
      await this._validateSchema(preset, result);
      
      // Business rules validation
      await this._validateBusinessRules(preset, result);
      
      // Data integrity checks
      await this._validateDataIntegrity(preset, result);
      
      // Settings validation
      await this._validateSettings(preset, result);
      
      // Dependency validation
      if (!skipDependencyCheck && this.config.validateDependencies) {
        await this._validateDependencies(preset, result, context);
      }
      
      // Performance impact validation
      if (!skipPerformanceCheck && this.config.checkPerformanceImpact) {
        await this._validatePerformanceImpact(preset, result);
      }
      
      // Security validation
      if (!skipSecurityCheck && this.config.validateSecurity) {
        await this._validateSecurity(preset, result);
      }
      
      // Custom validation rules
      for (const ruleName of customRules) {
        if (this.customValidators.has(ruleName)) {
          await this.customValidators.get(ruleName)(preset, result, context);
        }
      }
      
      // Calculate data integrity score
      result.metadata.dataIntegrityScore = this._calculateIntegrityScore(result);
      
    } catch (error) {
      result.addError(
        ValidationErrorType.SCHEMA_VIOLATION,
        'validation',
        `Validation failed: ${error.message}`,
        { originalError: error.message }
      );
    }
    
    result.metadata.validationDuration = Date.now() - startTime;
    result.metadata.rulesApplied = Array.from(this.validationRules.keys());
    
    return result;
  }

  /**
   * Validate multiple presets
   */
  async validatePresets(presets, options = {}) {
    const results = [];
    const { parallel = false, maxConcurrency = 5 } = options;
    
    if (parallel) {
      // Parallel validation with concurrency control
      const chunks = this._chunkArray(presets, maxConcurrency);
      
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(preset => this.validatePreset(preset, options))
        );
        results.push(...chunkResults);
      }
    } else {
      // Sequential validation
      for (const preset of presets) {
        const result = await this.validatePreset(preset, options);
        results.push(result);
      }
    }
    
    return results;
  }

  /**
   * Validate preset collection integrity
   */
  async validateCollection(presets, options = {}) {
    const result = new ValidationResult();
    
    // Check for duplicate IDs
    const ids = new Set();
    const duplicateIds = new Set();
    
    for (const preset of presets) {
      if (ids.has(preset.id)) {
        duplicateIds.add(preset.id);
      }
      ids.add(preset.id);
    }
    
    if (duplicateIds.size > 0) {
      result.addError(
        ValidationErrorType.DATA_INTEGRITY,
        'collection',
        'Duplicate preset IDs found',
        { duplicateIds: Array.from(duplicateIds) }
      );
    }
    
    // Check for duplicate names within categories
    const categoryNames = new Map();
    
    for (const preset of presets) {
      const key = `${preset.category}:${preset.name}`;
      
      if (categoryNames.has(key)) {
        result.addWarning(
          ValidationErrorType.BUSINESS_RULE,
          'collection',
          `Duplicate preset name '${preset.name}' in category '${preset.category}'`,
          { presetId: preset.id, category: preset.category, name: preset.name }
        );
      }
      
      categoryNames.set(key, preset.id);
    }
    
    // Validate cross-preset dependencies
    await this._validateCrossPresetDependencies(presets, result);
    
    // Check collection size and performance
    if (presets.length > 1000) {
      result.addWarning(
        ValidationErrorType.PERFORMANCE,
        'collection',
        'Large preset collection may impact performance',
        { presetCount: presets.length }
      );
    }
    
    return result;
  }

  /**
   * Add custom validation rule
   */
  addCustomValidator(name, validator) {
    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }
    
    this.customValidators.set(name, validator);
  }

  /**
   * Remove custom validation rule
   */
  removeCustomValidator(name) {
    return this.customValidators.delete(name);
  }

  /**
   * Get validation statistics
   */
  getValidationStats() {
    return {
      builtInRules: this.validationRules.size,
      customRules: this.customValidators.size,
      config: { ...this.config }
    };
  }

  // Private validation methods

  /**
   * Initialize built-in validation rules
   */
  _initializeValidationRules() {
    this.validationRules.set('schema', this._validateSchema.bind(this));
    this.validationRules.set('businessRules', this._validateBusinessRules.bind(this));
    this.validationRules.set('dataIntegrity', this._validateDataIntegrity.bind(this));
    this.validationRules.set('settings', this._validateSettings.bind(this));
    this.validationRules.set('dependencies', this._validateDependencies.bind(this));
    this.validationRules.set('performance', this._validatePerformanceImpact.bind(this));
    this.validationRules.set('security', this._validateSecurity.bind(this));
  }

  /**
   * Validate preset schema
   */
  async _validateSchema(preset, result) {
    // Check required fields
    for (const field of this.config.requiredFields) {
      if (!preset.hasOwnProperty(field) || preset[field] === null || preset[field] === undefined) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          field,
          `Required field '${field}' is missing or null`
        );
      }
    }
    
    // Validate field types and formats
    if (preset.id !== undefined) {
      if (typeof preset.id !== 'string' || preset.id.trim() === '') {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'id',
          'ID must be a non-empty string'
        );
      }
    }
    
    if (preset.name !== undefined) {
      if (typeof preset.name !== 'string') {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'name',
          'Name must be a string'
        );
      } else if (preset.name.length > this.config.maxNameLength) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'name',
          `Name exceeds maximum length of ${this.config.maxNameLength} characters`
        );
      }
    }
    
    if (preset.description !== undefined && preset.description !== null) {
      if (typeof preset.description !== 'string') {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'description',
          'Description must be a string'
        );
      } else if (preset.description.length > this.config.maxDescriptionLength) {
        result.addWarning(
          ValidationErrorType.SCHEMA_VIOLATION,
          'description',
          `Description exceeds recommended length of ${this.config.maxDescriptionLength} characters`
        );
      }
    }
    
    // Validate category
    if (preset.category !== undefined) {
      if (!Object.values(PresetCategory).includes(preset.category)) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'category',
          `Invalid category '${preset.category}'. Must be one of: ${Object.values(PresetCategory).join(', ')}`
        );
      }
    }
    
    // Validate visibility
    if (preset.visibility !== undefined) {
      if (!Object.values(PresetVisibility).includes(preset.visibility)) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'visibility',
          `Invalid visibility '${preset.visibility}'. Must be one of: ${Object.values(PresetVisibility).join(', ')}`
        );
      }
    }
    
    // Validate status
    if (preset.status !== undefined) {
      if (!Object.values(PresetStatus).includes(preset.status)) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'status',
          `Invalid status '${preset.status}'. Must be one of: ${Object.values(PresetStatus).join(', ')}`
        );
      }
    }
    
    // Validate tags
    if (preset.tags !== undefined) {
      if (!Array.isArray(preset.tags)) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'tags',
          'Tags must be an array'
        );
      } else {
        if (preset.tags.length > this.config.maxTagsCount) {
          result.addWarning(
            ValidationErrorType.SCHEMA_VIOLATION,
            'tags',
            `Too many tags (${preset.tags.length}). Recommended maximum: ${this.config.maxTagsCount}`
          );
        }
        
        for (let i = 0; i < preset.tags.length; i++) {
          const tag = preset.tags[i];
          if (typeof tag !== 'string') {
            result.addError(
              ValidationErrorType.SCHEMA_VIOLATION,
              `tags[${i}]`,
              'Tag must be a string'
            );
          } else if (tag.length > this.config.maxTagLength) {
            result.addWarning(
              ValidationErrorType.SCHEMA_VIOLATION,
              `tags[${i}]`,
              `Tag '${tag}' exceeds maximum length of ${this.config.maxTagLength} characters`
            );
          }
        }
      }
    }
    
    // Validate dates
    const dateFields = ['createdAt', 'modifiedAt', 'lastUsed'];
    for (const field of dateFields) {
      if (preset[field] !== undefined) {
        const date = new Date(preset[field]);
        if (isNaN(date.getTime())) {
          result.addError(
            ValidationErrorType.SCHEMA_VIOLATION,
            field,
            `Invalid date format for ${field}`
          );
        }
      }
    }
  }

  /**
   * Validate business rules
   */
  async _validateBusinessRules(preset, result) {
    // Check name uniqueness within category (if context provided)
    if (preset.name && preset.name.trim() === '') {
      result.addError(
        ValidationErrorType.BUSINESS_RULE,
        'name',
        'Preset name cannot be empty or whitespace only'
      );
    }
    
    // Validate creation/modification dates
    if (preset.createdAt && preset.modifiedAt) {
      const created = new Date(preset.createdAt);
      const modified = new Date(preset.modifiedAt);
      
      if (modified < created) {
        result.addError(
          ValidationErrorType.BUSINESS_RULE,
          'modifiedAt',
          'Modified date cannot be earlier than creation date'
        );
      }
    }
    
    // Validate usage statistics
    if (preset.usageCount !== undefined) {
      if (typeof preset.usageCount !== 'number' || preset.usageCount < 0) {
        result.addError(
          ValidationErrorType.BUSINESS_RULE,
          'usageCount',
          'Usage count must be a non-negative number'
        );
      }
    }
    
    // Validate rating
    if (preset.rating !== undefined) {
      if (typeof preset.rating !== 'number' || preset.rating < 0 || preset.rating > 5) {
        result.addError(
          ValidationErrorType.BUSINESS_RULE,
          'rating',
          'Rating must be a number between 0 and 5'
        );
      }
    }
    
    // Validate author information
    if (preset.author !== undefined) {
      if (typeof preset.author !== 'string' || preset.author.trim() === '') {
        result.addWarning(
          ValidationErrorType.BUSINESS_RULE,
          'author',
          'Author should be a non-empty string'
        );
      }
    }
  }

  /**
   * Validate data integrity
   */
  async _validateDataIntegrity(preset, result) {
    // Check for circular references
    try {
      JSON.stringify(preset);
    } catch (error) {
      if (error.message.includes('circular')) {
        result.addError(
          ValidationErrorType.DATA_INTEGRITY,
          'structure',
          'Preset contains circular references'
        );
      }
    }
    
    // Check preset size
    const presetSize = JSON.stringify(preset).length;
    if (presetSize > this.config.maxPresetSize) {
      result.addWarning(
        ValidationErrorType.DATA_INTEGRITY,
        'size',
        `Preset size (${presetSize} bytes) exceeds recommended maximum (${this.config.maxPresetSize} bytes)`
      );
    }
    
    // Validate object depth
    const depth = this._getObjectDepth(preset);
    if (depth > this.config.maxSettingsDepth) {
      result.addWarning(
        ValidationErrorType.DATA_INTEGRITY,
        'structure',
        `Preset structure depth (${depth}) exceeds recommended maximum (${this.config.maxSettingsDepth})`
      );
    }
    
    // Check for unknown properties in strict mode
    if (this.config.strictMode && !this.config.allowUnknownProperties) {
      const knownProperties = [
        'id', 'name', 'description', 'category', 'visibility', 'status',
        'settings', 'tags', 'author', 'version', 'createdAt', 'modifiedAt',
        'lastUsed', 'usageCount', 'rating', 'metadata'
      ];
      
      for (const prop of Object.keys(preset)) {
        if (!knownProperties.includes(prop)) {
          result.addWarning(
            ValidationErrorType.DATA_INTEGRITY,
            prop,
            `Unknown property '${prop}' found in strict mode`
          );
        }
      }
    }
  }

  /**
   * Validate conversion settings
   */
  async _validateSettings(preset, result) {
    if (!preset.settings || typeof preset.settings !== 'object') {
      result.addError(
        ValidationErrorType.SCHEMA_VIOLATION,
        'settings',
        'Settings must be an object'
      );
      return;
    }
    
    const settings = preset.settings;
    
    // Validate quality settings
    if (settings.quality !== undefined) {
      if (!Object.values(QualityLevel).includes(settings.quality)) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'settings.quality',
          `Invalid quality level '${settings.quality}'. Must be one of: ${Object.values(QualityLevel).join(', ')}`
        );
      }
    }
    
    // Validate conversion mode
    if (settings.mode !== undefined) {
      if (!Object.values(ConversionMode).includes(settings.mode)) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'settings.mode',
          `Invalid conversion mode '${settings.mode}'. Must be one of: ${Object.values(ConversionMode).join(', ')}`
        );
      }
    }
    
    // Validate format-specific settings
    if (preset.category === PresetCategory.IMAGE) {
      await this._validateImageSettings(settings, result);
    } else if (preset.category === PresetCategory.VIDEO) {
      await this._validateVideoSettings(settings, result);
    } else if (preset.category === PresetCategory.DOCUMENT) {
      await this._validateDocumentSettings(settings, result);
    }
    
    // Validate custom parameters
    if (settings.customParameters) {
      await this._validateCustomParameters(settings.customParameters, result);
    }
  }

  /**
   * Validate image-specific settings
   */
  async _validateImageSettings(settings, result) {
    // Validate dimensions
    if (settings.width !== undefined) {
      if (typeof settings.width !== 'number' || settings.width <= 0) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'settings.width',
          'Width must be a positive number'
        );
      } else if (settings.width > 10000) {
        result.addWarning(
          ValidationErrorType.PERFORMANCE,
          'settings.width',
          'Very large width may cause performance issues'
        );
      }
    }
    
    if (settings.height !== undefined) {
      if (typeof settings.height !== 'number' || settings.height <= 0) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'settings.height',
          'Height must be a positive number'
        );
      } else if (settings.height > 10000) {
        result.addWarning(
          ValidationErrorType.PERFORMANCE,
          'settings.height',
          'Very large height may cause performance issues'
        );
      }
    }
    
    // Validate compression settings
    if (settings.compression !== undefined) {
      if (typeof settings.compression !== 'number' || settings.compression < 0 || settings.compression > 100) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'settings.compression',
          'Compression must be a number between 0 and 100'
        );
      }
    }
    
    // Validate format-specific options
    if (settings.format) {
      const validImageFormats = ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'svg'];
      if (!validImageFormats.includes(settings.format.toLowerCase())) {
        result.addWarning(
          ValidationErrorType.COMPATIBILITY,
          'settings.format',
          `Unsupported image format '${settings.format}'. Supported formats: ${validImageFormats.join(', ')}`
        );
      }
    }
  }

  /**
   * Validate video-specific settings
   */
  async _validateVideoSettings(settings, result) {
    // Validate bitrate
    if (settings.bitrate !== undefined) {
      if (typeof settings.bitrate !== 'number' || settings.bitrate <= 0) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'settings.bitrate',
          'Bitrate must be a positive number'
        );
      }
    }
    
    // Validate frame rate
    if (settings.frameRate !== undefined) {
      if (typeof settings.frameRate !== 'number' || settings.frameRate <= 0 || settings.frameRate > 120) {
        result.addError(
          ValidationErrorType.SCHEMA_VIOLATION,
          'settings.frameRate',
          'Frame rate must be a number between 0 and 120'
        );
      }
    }
    
    // Validate codec
    if (settings.codec) {
      const validVideoCodecs = ['h264', 'h265', 'vp8', 'vp9', 'av1', 'mpeg4'];
      if (!validVideoCodecs.includes(settings.codec.toLowerCase())) {
        result.addWarning(
          ValidationErrorType.COMPATIBILITY,
          'settings.codec',
          `Unsupported video codec '${settings.codec}'. Supported codecs: ${validVideoCodecs.join(', ')}`
        );
      }
    }
  }

  /**
   * Validate document-specific settings
   */
  async _validateDocumentSettings(settings, result) {
    // Validate page settings
    if (settings.pageSize) {
      const validPageSizes = ['A4', 'A3', 'A5', 'Letter', 'Legal', 'Tabloid'];
      if (!validPageSizes.includes(settings.pageSize)) {
        result.addWarning(
          ValidationErrorType.COMPATIBILITY,
          'settings.pageSize',
          `Unsupported page size '${settings.pageSize}'. Supported sizes: ${validPageSizes.join(', ')}`
        );
      }
    }
    
    // Validate DPI
    if (settings.dpi !== undefined) {
      if (typeof settings.dpi !== 'number' || settings.dpi < 72 || settings.dpi > 600) {
        result.addWarning(
          ValidationErrorType.SCHEMA_VIOLATION,
          'settings.dpi',
          'DPI should be between 72 and 600 for optimal results'
        );
      }
    }
  }

  /**
   * Validate custom parameters
   */
  async _validateCustomParameters(customParams, result) {
    if (typeof customParams !== 'object') {
      result.addError(
        ValidationErrorType.SCHEMA_VIOLATION,
        'settings.customParameters',
        'Custom parameters must be an object'
      );
      return;
    }
    
    // Check for potentially dangerous parameters
    const dangerousParams = ['exec', 'eval', 'system', 'shell', 'cmd'];
    for (const param of Object.keys(customParams)) {
      if (dangerousParams.some(dangerous => param.toLowerCase().includes(dangerous))) {
        result.addError(
          ValidationErrorType.SECURITY,
          `settings.customParameters.${param}`,
          `Potentially dangerous parameter '${param}' detected`
        );
      }
    }
  }

  /**
   * Validate dependencies
   */
  async _validateDependencies(preset, result, context) {
    // This would validate dependencies against available presets
    // Implementation depends on the context provided
    if (context.availablePresets) {
      // Check if referenced presets exist
      // Implementation would go here
    }
  }

  /**
   * Validate performance impact
   */
  async _validatePerformanceImpact(preset, result) {
    const settings = preset.settings || {};
    
    // Check for performance-intensive settings
    if (settings.width && settings.height) {
      const pixelCount = settings.width * settings.height;
      if (pixelCount > 25000000) { // 25MP
        result.addWarning(
          ValidationErrorType.PERFORMANCE,
          'settings',
          'High resolution settings may cause performance issues'
        );
      }
    }
    
    // Check for memory-intensive operations
    if (settings.quality === QualityLevel.MAXIMUM && settings.mode === ConversionMode.BATCH) {
      result.addWarning(
        ValidationErrorType.PERFORMANCE,
        'settings',
        'Maximum quality with batch mode may consume significant memory'
      );
    }
  }

  /**
   * Validate security aspects
   */
  async _validateSecurity(preset, result) {
    // Check for potentially unsafe file paths
    const settings = preset.settings || {};
    
    if (settings.outputPath) {
      if (settings.outputPath.includes('..') || settings.outputPath.startsWith('/')) {
        result.addError(
          ValidationErrorType.SECURITY,
          'settings.outputPath',
          'Output path contains potentially unsafe characters'
        );
      }
    }
    
    // Check for script injection in string fields
    const stringFields = ['name', 'description', 'author'];
    for (const field of stringFields) {
      if (preset[field] && typeof preset[field] === 'string') {
        if (preset[field].includes('<script>') || preset[field].includes('javascript:')) {
          result.addError(
            ValidationErrorType.SECURITY,
            field,
            `Potential script injection detected in ${field}`
          );
        }
      }
    }
  }

  /**
   * Validate cross-preset dependencies
   */
  async _validateCrossPresetDependencies(presets, result) {
    // Build dependency graph and check for cycles
    const dependencyGraph = new Map();
    
    for (const preset of presets) {
      if (preset.dependencies && Array.isArray(preset.dependencies)) {
        dependencyGraph.set(preset.id, preset.dependencies);
      }
    }
    
    // Check for circular dependencies
    for (const [presetId, dependencies] of dependencyGraph) {
      if (this._hasCircularDependency(presetId, dependencies, dependencyGraph, new Set())) {
        result.addError(
          ValidationErrorType.DEPENDENCY,
          'dependencies',
          `Circular dependency detected involving preset '${presetId}'`
        );
      }
    }
  }

  /**
   * Check for circular dependencies
   */
  _hasCircularDependency(presetId, dependencies, graph, visited) {
    if (visited.has(presetId)) {
      return true;
    }
    
    visited.add(presetId);
    
    for (const depId of dependencies) {
      const depDependencies = graph.get(depId) || [];
      if (this._hasCircularDependency(depId, depDependencies, graph, new Set(visited))) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Calculate data integrity score
   */
  _calculateIntegrityScore(result) {
    let score = 100;
    
    // Deduct points for errors and warnings
    score -= result.errors.length * 10;
    score -= result.warnings.length * 5;
    
    // Bonus points for good practices
    if (result.info.length > 0) {
      score += Math.min(result.info.length * 2, 10);
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get object depth
   */
  _getObjectDepth(obj, depth = 0) {
    if (typeof obj !== 'object' || obj === null) {
      return depth;
    }
    
    let maxDepth = depth;
    
    for (const value of Object.values(obj)) {
      const currentDepth = this._getObjectDepth(value, depth + 1);
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    
    return maxDepth;
  }

  /**
   * Chunk array for parallel processing
   */
  _chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

module.exports = {
  ConversionPresetValidator,
  ValidationResult,
  ValidationErrorType,
  ValidationSeverity,
  DEFAULT_VALIDATION_CONFIG
};