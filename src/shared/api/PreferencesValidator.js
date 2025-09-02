/**
 * Preferences Validator
 * Comprehensive validation layer for preference data integrity and type safety
 */

const { ThemeType, QualityPreset, OutputFormat, NotificationType } = require('../models/UserPreferences');

/**
 * Validation Error Types
 */
const ValidationErrorType = {
  TYPE_MISMATCH: 'type_mismatch',
  INVALID_VALUE: 'invalid_value',
  MISSING_REQUIRED: 'missing_required',
  INVALID_RANGE: 'invalid_range',
  INVALID_FORMAT: 'invalid_format',
  CONSTRAINT_VIOLATION: 'constraint_violation',
  CIRCULAR_DEPENDENCY: 'circular_dependency',
  UNKNOWN_PROPERTY: 'unknown_property'
};

/**
 * Validation Error class
 */
class ValidationError extends Error {
  constructor(type, message, path = null, value = null, constraints = null) {
    super(message);
    this.name = 'ValidationError';
    this.type = type;
    this.path = path;
    this.value = value;
    this.constraints = constraints;
    this.timestamp = Date.now();
  }
  
  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      path: this.path,
      value: this.value,
      constraints: this.constraints,
      timestamp: this.timestamp
    };
  }
}

/**
 * Validation Result class
 */
class ValidationResult {
  constructor() {
    this.valid = true;
    this.errors = [];
    this.warnings = [];
    this.sanitized = null;
  }
  
  addError(error) {
    this.valid = false;
    this.errors.push(error);
  }
  
  addWarning(warning) {
    this.warnings.push(warning);
  }
  
  setSanitized(data) {
    this.sanitized = data;
  }
  
  hasErrors() {
    return this.errors.length > 0;
  }
  
  hasWarnings() {
    return this.warnings.length > 0;
  }
  
  getFirstError() {
    return this.errors[0] || null;
  }
  
  toJSON() {
    return {
      valid: this.valid,
      errors: this.errors.map(e => e.toJSON ? e.toJSON() : e),
      warnings: this.warnings,
      sanitized: this.sanitized
    };
  }
}

/**
 * Validation Schema Definition
 */
const PREFERENCE_SCHEMA = {
  // Video Processing Settings
  quality: {
    type: 'string',
    enum: Object.values(QualityPreset),
    required: true,
    default: QualityPreset.BALANCED
  },
  
  outputFormat: {
    type: 'string',
    enum: Object.values(OutputFormat),
    required: true,
    default: OutputFormat.MP4
  },
  
  customBitrate: {
    type: 'number',
    min: 100,
    max: 50000,
    default: 2000
  },
  
  customResolution: {
    type: 'object',
    properties: {
      width: {
        type: 'number',
        min: 144,
        max: 7680,
        required: true
      },
      height: {
        type: 'number',
        min: 144,
        max: 4320,
        required: true
      }
    },
    validator: (value) => {
      if (value.width % 2 !== 0 || value.height % 2 !== 0) {
        return 'Resolution dimensions must be even numbers';
      }
      if (value.width / value.height < 0.1 || value.width / value.height > 10) {
        return 'Aspect ratio must be between 0.1 and 10';
      }
      return null;
    }
  },
  
  // UI Settings
  theme: {
    type: 'string',
    enum: Object.values(ThemeType),
    required: true,
    default: ThemeType.SYSTEM
  },
  
  language: {
    type: 'string',
    pattern: /^[a-z]{2}(-[A-Z]{2})?$/,
    default: 'en'
  },
  
  autoSave: {
    type: 'boolean',
    default: true
  },
  
  autoSaveInterval: {
    type: 'number',
    min: 1000,
    max: 300000,
    default: 30000,
    dependencies: ['autoSave'],
    validator: (value, context) => {
      if (context.autoSave && value < 5000) {
        return 'Auto-save interval should be at least 5 seconds when auto-save is enabled';
      }
      return null;
    }
  },
  
  // Notification Settings
  notifications: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        default: true
      },
      types: {
        type: 'array',
        items: {
          type: 'string',
          enum: Object.values(NotificationType)
        },
        default: [NotificationType.CONVERSION_COMPLETE, NotificationType.ERROR]
      },
      sound: {
        type: 'boolean',
        default: false
      },
      desktop: {
        type: 'boolean',
        default: true
      }
    }
  },
  
  // Advanced Settings
  advanced: {
    type: 'object',
    properties: {
      hardwareAcceleration: {
        type: 'boolean',
        default: true
      },
      maxConcurrentJobs: {
        type: 'number',
        min: 1,
        max: 16,
        default: 2
      },
      tempDirectory: {
        type: 'string',
        validator: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Temporary directory cannot be empty';
          }
          // Basic path validation
          if (!/^[a-zA-Z]:|^\/|^\.\/|^\.\.\//i.test(value)) {
            return 'Invalid directory path format';
          }
          return null;
        }
      },
      logLevel: {
        type: 'string',
        enum: ['error', 'warn', 'info', 'debug'],
        default: 'info'
      }
    }
  },
  
  // Recent Jobs Settings
  recentJobsSettings: {
    type: 'object',
    properties: {
      maxCount: {
        type: 'number',
        min: 10,
        max: 1000,
        default: 100
      },
      maxAge: {
        type: 'number',
        min: 86400000, // 1 day
        max: 31536000000, // 1 year
        default: 2592000000 // 30 days
      },
      autoCleanup: {
        type: 'boolean',
        default: true
      }
    }
  },
  
  // Saved Presets
  savedPresets: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          required: true,
          pattern: /^[a-zA-Z0-9_-]+$/
        },
        name: {
          type: 'string',
          required: true,
          minLength: 1,
          maxLength: 100
        },
        settings: {
          type: 'object',
          required: true
        },
        createdAt: {
          type: 'number',
          required: true
        },
        lastUsed: {
          type: 'number'
        }
      }
    },
    maxItems: 50,
    validator: (presets) => {
      const ids = presets.map(p => p.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicates.length > 0) {
        return `Duplicate preset IDs found: ${duplicates.join(', ')}`;
      }
      return null;
    }
  }
};

/**
 * Preferences Validator class
 */
class PreferencesValidator {
  constructor(schema = PREFERENCE_SCHEMA) {
    this.schema = schema;
    this.customValidators = new Map();
    this.sanitizers = new Map();
    this.strictMode = false;
  }
  
  /**
   * Set strict mode
   * @param {boolean} strict - Whether to enable strict mode
   */
  setStrictMode(strict) {
    this.strictMode = strict;
  }
  
  /**
   * Add custom validator for a property
   * @param {string} path - Property path
   * @param {Function} validator - Validator function
   */
  addCustomValidator(path, validator) {
    this.customValidators.set(path, validator);
  }
  
  /**
   * Add custom sanitizer for a property
   * @param {string} path - Property path
   * @param {Function} sanitizer - Sanitizer function
   */
  addCustomSanitizer(path, sanitizer) {
    this.sanitizers.set(path, sanitizer);
  }
  
  /**
   * Validate preferences data
   * @param {Object} data - Preferences data to validate
   * @param {Object} options - Validation options
   * @returns {ValidationResult} Validation result
   */
  validate(data, options = {}) {
    const result = new ValidationResult();
    const sanitized = {};
    
    try {
      // Validate against schema
      this._validateObject(data, this.schema, '', result, sanitized, options);
      
      // Check for unknown properties in strict mode
      if (this.strictMode) {
        this._checkUnknownProperties(data, this.schema, '', result);
      }
      
      // Apply custom validators
      this._applyCustomValidators(data, result);
      
      // Set sanitized data
      result.setSanitized(sanitized);
      
    } catch (error) {
      result.addError(new ValidationError(
        ValidationErrorType.CONSTRAINT_VIOLATION,
        `Validation failed: ${error.message}`,
        null,
        data
      ));
    }
    
    return result;
  }
  
  /**
   * Validate a single preference value
   * @param {string} path - Property path
   * @param {*} value - Value to validate
   * @param {Object} context - Full preferences context
   * @returns {ValidationResult} Validation result
   */
  validateProperty(path, value, context = {}) {
    const result = new ValidationResult();
    const schema = this._getSchemaForPath(path);
    
    if (!schema) {
      if (this.strictMode) {
        result.addError(new ValidationError(
          ValidationErrorType.UNKNOWN_PROPERTY,
          `Unknown property: ${path}`,
          path,
          value
        ));
      }
      return result;
    }
    
    const sanitized = {};
    this._validateValue(value, schema, path, result, sanitized, context);
    result.setSanitized(this._getValueAtPath(sanitized, path));
    
    return result;
  }
  
  /**
   * Sanitize preferences data
   * @param {Object} data - Data to sanitize
   * @returns {Object} Sanitized data
   */
  sanitize(data) {
    const result = this.validate(data, { sanitize: true });
    return result.sanitized || data;
  }
  
  /**
   * Validate object against schema
   */
  _validateObject(data, schema, path, result, sanitized, options) {
    if (!data || typeof data !== 'object') {
      result.addError(new ValidationError(
        ValidationErrorType.TYPE_MISMATCH,
        `Expected object at ${path || 'root'}`,
        path,
        data
      ));
      return;
    }
    
    // Validate each property in schema
    for (const [key, propSchema] of Object.entries(schema)) {
      const propPath = path ? `${path}.${key}` : key;
      const value = data[key];
      
      this._validateValue(value, propSchema, propPath, result, sanitized, data, options);
    }
  }
  
  /**
   * Validate a single value
   */
  _validateValue(value, schema, path, result, sanitized, context = {}, options = {}) {
    // Handle undefined values
    if (value === undefined) {
      if (schema.required) {
        result.addError(new ValidationError(
          ValidationErrorType.MISSING_REQUIRED,
          `Required property missing: ${path}`,
          path,
          value
        ));
        return;
      }
      
      // Use default value if available
      if (schema.default !== undefined) {
        this._setValueAtPath(sanitized, path, schema.default);
      }
      return;
    }
    
    // Apply sanitizer if available
    if (options.sanitize && this.sanitizers.has(path)) {
      try {
        value = this.sanitizers.get(path)(value);
      } catch (error) {
        result.addWarning(`Sanitization failed for ${path}: ${error.message}`);
      }
    }
    
    // Type validation
    if (!this._validateType(value, schema.type)) {
      result.addError(new ValidationError(
        ValidationErrorType.TYPE_MISMATCH,
        `Expected ${schema.type} at ${path}, got ${typeof value}`,
        path,
        value,
        { expectedType: schema.type }
      ));
      return;
    }
    
    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      result.addError(new ValidationError(
        ValidationErrorType.INVALID_VALUE,
        `Invalid value at ${path}. Expected one of: ${schema.enum.join(', ')}`,
        path,
        value,
        { allowedValues: schema.enum }
      ));
      return;
    }
    
    // Range validation for numbers
    if (schema.type === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        result.addError(new ValidationError(
          ValidationErrorType.INVALID_RANGE,
          `Value at ${path} is below minimum (${schema.min})`,
          path,
          value,
          { min: schema.min, max: schema.max }
        ));
        return;
      }
      
      if (schema.max !== undefined && value > schema.max) {
        result.addError(new ValidationError(
          ValidationErrorType.INVALID_RANGE,
          `Value at ${path} is above maximum (${schema.max})`,
          path,
          value,
          { min: schema.min, max: schema.max }
        ));
        return;
      }
    }
    
    // String validation
    if (schema.type === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        result.addError(new ValidationError(
          ValidationErrorType.INVALID_RANGE,
          `String at ${path} is too short (minimum ${schema.minLength})`,
          path,
          value,
          { minLength: schema.minLength, maxLength: schema.maxLength }
        ));
        return;
      }
      
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        result.addError(new ValidationError(
          ValidationErrorType.INVALID_RANGE,
          `String at ${path} is too long (maximum ${schema.maxLength})`,
          path,
          value,
          { minLength: schema.minLength, maxLength: schema.maxLength }
        ));
        return;
      }
      
      if (schema.pattern && !schema.pattern.test(value)) {
        result.addError(new ValidationError(
          ValidationErrorType.INVALID_FORMAT,
          `String at ${path} does not match required pattern`,
          path,
          value,
          { pattern: schema.pattern.toString() }
        ));
        return;
      }
    }
    
    // Array validation
    if (schema.type === 'array') {
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        result.addError(new ValidationError(
          ValidationErrorType.INVALID_RANGE,
          `Array at ${path} has too many items (maximum ${schema.maxItems})`,
          path,
          value,
          { maxItems: schema.maxItems }
        ));
        return;
      }
      
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        result.addError(new ValidationError(
          ValidationErrorType.INVALID_RANGE,
          `Array at ${path} has too few items (minimum ${schema.minItems})`,
          path,
          value,
          { minItems: schema.minItems }
        ));
        return;
      }
      
      // Validate array items
      if (schema.items) {
        value.forEach((item, index) => {
          this._validateValue(item, schema.items, `${path}[${index}]`, result, sanitized, context, options);
        });
      }
    }
    
    // Object validation
    if (schema.type === 'object' && schema.properties) {
      this._validateObject(value, schema.properties, path, result, sanitized, options);
    }
    
    // Custom validator
    if (schema.validator) {
      try {
        const validationError = schema.validator(value, context);
        if (validationError) {
          result.addError(new ValidationError(
            ValidationErrorType.CONSTRAINT_VIOLATION,
            validationError,
            path,
            value
          ));
          return;
        }
      } catch (error) {
        result.addError(new ValidationError(
          ValidationErrorType.CONSTRAINT_VIOLATION,
          `Custom validation failed at ${path}: ${error.message}`,
          path,
          value
        ));
        return;
      }
    }
    
    // Dependency validation
    if (schema.dependencies) {
      for (const dep of schema.dependencies) {
        if (context[dep] === undefined) {
          result.addWarning(`Dependency ${dep} not found for ${path}`);
        }
      }
    }
    
    // Set sanitized value
    this._setValueAtPath(sanitized, path, value);
  }
  
  /**
   * Validate type
   */
  _validateType(value, expectedType) {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      default:
        return true;
    }
  }
  
  /**
   * Check for unknown properties
   */
  _checkUnknownProperties(data, schema, path, result) {
    if (!data || typeof data !== 'object') return;
    
    for (const key of Object.keys(data)) {
      const propPath = path ? `${path}.${key}` : key;
      
      if (!schema[key]) {
        result.addError(new ValidationError(
          ValidationErrorType.UNKNOWN_PROPERTY,
          `Unknown property: ${propPath}`,
          propPath,
          data[key]
        ));
      } else if (schema[key].type === 'object' && schema[key].properties) {
        this._checkUnknownProperties(data[key], schema[key].properties, propPath, result);
      }
    }
  }
  
  /**
   * Apply custom validators
   */
  _applyCustomValidators(data, result) {
    for (const [path, validator] of this.customValidators) {
      try {
        const value = this._getValueAtPath(data, path);
        const error = validator(value, data);
        if (error) {
          result.addError(new ValidationError(
            ValidationErrorType.CONSTRAINT_VIOLATION,
            error,
            path,
            value
          ));
        }
      } catch (error) {
        result.addError(new ValidationError(
          ValidationErrorType.CONSTRAINT_VIOLATION,
          `Custom validator failed for ${path}: ${error.message}`,
          path,
          null
        ));
      }
    }
  }
  
  /**
   * Get schema for a specific path
   */
  _getSchemaForPath(path) {
    const parts = path.split('.');
    let schema = this.schema;
    
    for (const part of parts) {
      if (schema[part]) {
        schema = schema[part];
      } else if (schema.properties && schema.properties[part]) {
        schema = schema.properties[part];
      } else {
        return null;
      }
    }
    
    return schema;
  }
  
  /**
   * Get value at path
   */
  _getValueAtPath(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
  
  /**
   * Set value at path
   */
  _setValueAtPath(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    
    const target = parts.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[last] = value;
  }
  
  /**
   * Get validation schema
   * @returns {Object} The validation schema
   */
  getSchema() {
    return { ...this.schema };
  }
  
  /**
   * Update validation schema
   * @param {Object} newSchema - New schema to merge
   */
  updateSchema(newSchema) {
    this.schema = { ...this.schema, ...newSchema };
  }
}

module.exports = {
  PreferencesValidator,
  ValidationError,
  ValidationResult,
  ValidationErrorType,
  PREFERENCE_SCHEMA
};