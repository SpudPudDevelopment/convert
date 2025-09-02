/**
 * Conversion Preset Model
 * Manages conversion presets with categories, metadata, and validation
 */

// Use conditional imports for Node.js modules to support both main and renderer processes
let EventEmitter, crypto, path, fs;

if (typeof window === 'undefined') {
  // Main process
  ({ EventEmitter } = require('events'));
  crypto = require('crypto');
  path = require('path');
  fs = require('fs').promises;
} else {
  // Renderer process - use minimal implementations or stubs
  EventEmitter = class EventEmitter {
    constructor() {
      this.events = {};
    }
    on(event, listener) {
      if (!this.events[event]) this.events[event] = [];
      this.events[event].push(listener);
    }
    emit(event, ...args) {
      if (this.events[event]) {
        this.events[event].forEach(listener => listener(...args));
      }
    }
  };
  
  crypto = {
    randomUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },
    randomBytes: (size) => {
      const bytes = new Array(size);
      for (let i = 0; i < size; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return {
        toString: (encoding) => {
          if (encoding === 'hex') {
            return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
          }
          return bytes.join('');
        }
      };
    }
  };
  
  path = {
    extname: (filePath) => {
      const lastDot = filePath.lastIndexOf('.');
      return lastDot === -1 ? '' : filePath.slice(lastDot);
    }
  };
  
  fs = null; // Not available in renderer
}

/**
 * Preset events
 */
const PresetEvents = {
  PRESET_CREATED: 'preset_created',
  PRESET_UPDATED: 'preset_updated',
  PRESET_DELETED: 'preset_deleted',
  PRESET_USED: 'preset_used',
  CATEGORY_CREATED: 'category_created',
  CATEGORY_UPDATED: 'category_updated',
  CATEGORY_DELETED: 'category_deleted',
  VALIDATION_ERROR: 'validation_error',
  STORAGE_ERROR: 'storage_error'
};

/**
 * Preset categories
 */
const PresetCategory = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  ARCHIVE: 'archive',
  CUSTOM: 'custom'
};

/**
 * Preset visibility levels
 */
const PresetVisibility = {
  PRIVATE: 'private',     // Only visible to creator
  SHARED: 'shared',       // Visible to specific users/groups
  PUBLIC: 'public',       // Visible to all users
  SYSTEM: 'system'        // Built-in system presets
};

/**
 * Preset status
 */
const PresetStatus = {
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  ARCHIVED: 'archived'
};

/**
 * Quality levels
 */
const QualityLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  LOSSLESS: 'lossless',
  CUSTOM: 'custom'
};

/**
 * Conversion modes
 */
const ConversionMode = {
  FAST: 'fast',
  BALANCED: 'balanced',
  QUALITY: 'quality',
  CUSTOM: 'custom'
};

/**
 * Default preset configurations by category
 */
const DEFAULT_PRESETS = {
  [PresetCategory.IMAGE]: {
    'Web Optimized JPEG': {
      format: 'jpeg',
      quality: 85,
      maxWidth: 1920,
      maxHeight: 1080,
      progressive: true,
      stripMetadata: true
    },
    'High Quality PNG': {
      format: 'png',
      compression: 6,
      preserveTransparency: true,
      stripMetadata: false
    },
    'Thumbnail': {
      format: 'jpeg',
      width: 150,
      height: 150,
      crop: 'center',
      quality: 80
    }
  },
  [PresetCategory.VIDEO]: {
    'Web MP4 720p': {
      format: 'mp4',
      codec: 'h264',
      resolution: '1280x720',
      bitrate: '2000k',
      framerate: 30,
      audioCodec: 'aac',
      audioBitrate: '128k'
    },
    'High Quality 1080p': {
      format: 'mp4',
      codec: 'h264',
      resolution: '1920x1080',
      bitrate: '5000k',
      framerate: 30,
      audioCodec: 'aac',
      audioBitrate: '192k'
    }
  },
  [PresetCategory.AUDIO]: {
    'MP3 Standard': {
      format: 'mp3',
      bitrate: '192k',
      sampleRate: 44100,
      channels: 2
    },
    'High Quality FLAC': {
      format: 'flac',
      compression: 5,
      sampleRate: 44100,
      channels: 2
    }
  }
};

/**
 * Validation schemas for different categories
 */
const VALIDATION_SCHEMAS = {
  [PresetCategory.IMAGE]: {
    format: { type: 'string', required: true, enum: ['jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'] },
    quality: { type: 'number', min: 1, max: 100 },
    width: { type: 'number', min: 1, max: 10000 },
    height: { type: 'number', min: 1, max: 10000 },
    maxWidth: { type: 'number', min: 1, max: 10000 },
    maxHeight: { type: 'number', min: 1, max: 10000 },
    compression: { type: 'number', min: 0, max: 9 },
    progressive: { type: 'boolean' },
    stripMetadata: { type: 'boolean' },
    preserveTransparency: { type: 'boolean' }
  },
  [PresetCategory.VIDEO]: {
    format: { type: 'string', required: true, enum: ['mp4', 'avi', 'mkv', 'mov', 'webm'] },
    codec: { type: 'string', enum: ['h264', 'h265', 'vp8', 'vp9', 'av1'] },
    resolution: { type: 'string', pattern: /^\d+x\d+$/ },
    bitrate: { type: 'string', pattern: /^\d+[km]?$/ },
    framerate: { type: 'number', min: 1, max: 120 },
    audioCodec: { type: 'string', enum: ['aac', 'mp3', 'opus', 'vorbis'] },
    audioBitrate: { type: 'string', pattern: /^\d+[km]?$/ }
  },
  [PresetCategory.AUDIO]: {
    format: { type: 'string', required: true, enum: ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a'] },
    bitrate: { type: 'string', pattern: /^\d+[km]?$/ },
    sampleRate: { type: 'number', enum: [8000, 11025, 16000, 22050, 44100, 48000, 96000] },
    channels: { type: 'number', min: 1, max: 8 },
    compression: { type: 'number', min: 0, max: 9 }
  }
};

/**
 * Conversion Preset class
 */
class ConversionPreset {
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.name = data.name || '';
    this.description = data.description || '';
    this.category = data.category || PresetCategory.CUSTOM;
    this.visibility = data.visibility || PresetVisibility.PRIVATE;
    this.status = data.status || PresetStatus.ACTIVE;
    
    // Creator and ownership
    this.createdBy = data.createdBy;
    this.ownerId = data.ownerId;
    this.sharedWith = data.sharedWith || [];
    
    // Timestamps
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.lastUsedAt = data.lastUsedAt;
    
    // Conversion settings
    this.settings = data.settings || {};
    this.qualityLevel = data.qualityLevel || QualityLevel.MEDIUM;
    this.conversionMode = data.conversionMode || ConversionMode.BALANCED;
    
    // Metadata
    this.tags = data.tags || [];
    this.metadata = data.metadata || {};
    this.version = data.version || '1.0.0';
    this.isSystem = data.isSystem || false;
    this.isTemplate = data.isTemplate || false;
    
    // Usage statistics
    this.usageCount = data.usageCount || 0;
    this.successRate = data.successRate || 0;
    this.averageDuration = data.averageDuration || 0;
    this.lastError = data.lastError;
    
    // Validation and compatibility
    this.supportedFormats = data.supportedFormats || [];
    this.minFileSize = data.minFileSize;
    this.maxFileSize = data.maxFileSize;
    this.compatibilityNotes = data.compatibilityNotes || [];
    
    // Advanced options
    this.advancedOptions = data.advancedOptions || {};
    this.customParameters = data.customParameters || {};
    this.environmentRequirements = data.environmentRequirements || {};
  }
  
  /**
   * Generate unique ID
   */
  _generateId() {
    return crypto.randomBytes(16).toString('hex');
  }
  
  /**
   * Validate preset data
   */
  validate() {
    const errors = [];
    
    // Basic validation
    if (!this.name || this.name.trim().length === 0) {
      errors.push('Name is required');
    }
    
    if (this.name && this.name.length > 100) {
      errors.push('Name must be 100 characters or less');
    }
    
    if (!Object.values(PresetCategory).includes(this.category)) {
      errors.push('Invalid category');
    }
    
    if (!Object.values(PresetVisibility).includes(this.visibility)) {
      errors.push('Invalid visibility');
    }
    
    if (!Object.values(PresetStatus).includes(this.status)) {
      errors.push('Invalid status');
    }
    
    // Settings validation based on category
    if (VALIDATION_SCHEMAS[this.category]) {
      const schema = VALIDATION_SCHEMAS[this.category];
      const settingsErrors = this._validateSettings(this.settings, schema);
      errors.push(...settingsErrors);
    }
    
    // Tags validation
    if (this.tags && !Array.isArray(this.tags)) {
      errors.push('Tags must be an array');
    }
    
    if (this.tags && this.tags.length > 20) {
      errors.push('Maximum 20 tags allowed');
    }
    
    // File size validation
    if (this.minFileSize && this.maxFileSize && this.minFileSize > this.maxFileSize) {
      errors.push('Minimum file size cannot be greater than maximum file size');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Validate settings against schema
   */
  _validateSettings(settings, schema) {
    const errors = [];
    
    // Check required fields
    for (const [field, rules] of Object.entries(schema)) {
      if (rules.required && !settings.hasOwnProperty(field)) {
        errors.push(`Required field '${field}' is missing`);
        continue;
      }
      
      const value = settings[field];
      if (value === undefined || value === null) continue;
      
      // Type validation
      if (rules.type && typeof value !== rules.type) {
        errors.push(`Field '${field}' must be of type ${rules.type}`);
        continue;
      }
      
      // Enum validation
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`Field '${field}' must be one of: ${rules.enum.join(', ')}`);
      }
      
      // Range validation
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`Field '${field}' must be at least ${rules.min}`);
      }
      
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`Field '${field}' must be at most ${rules.max}`);
      }
      
      // Pattern validation
      if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
        errors.push(`Field '${field}' format is invalid`);
      }
    }
    
    return errors;
  }
  
  /**
   * Update preset
   */
  update(updates) {
    const allowedFields = [
      'name', 'description', 'settings', 'tags', 'metadata',
      'qualityLevel', 'conversionMode', 'visibility', 'status',
      'supportedFormats', 'minFileSize', 'maxFileSize',
      'compatibilityNotes', 'advancedOptions', 'customParameters',
      'environmentRequirements'
    ];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        this[key] = value;
      }
    }
    
    this.updatedAt = Date.now();
    return this;
  }
  
  /**
   * Record usage
   */
  recordUsage(success = true, duration = 0, error = null) {
    this.usageCount++;
    this.lastUsedAt = Date.now();
    
    if (success) {
      // Update success rate
      const totalSuccesses = Math.round(this.successRate * (this.usageCount - 1));
      this.successRate = (totalSuccesses + 1) / this.usageCount;
      
      // Update average duration
      if (duration > 0) {
        const totalDuration = this.averageDuration * (this.usageCount - 1);
        this.averageDuration = (totalDuration + duration) / this.usageCount;
      }
    } else {
      // Update success rate for failure
      const totalSuccesses = Math.round(this.successRate * (this.usageCount - 1));
      this.successRate = totalSuccesses / this.usageCount;
      
      if (error) {
        this.lastError = {
          message: error.message,
          timestamp: Date.now()
        };
      }
    }
    
    this.updatedAt = Date.now();
  }
  
  /**
   * Add tag
   */
  addTag(tag) {
    if (typeof tag !== 'string' || tag.trim().length === 0) {
      return false;
    }
    
    const normalizedTag = tag.trim().toLowerCase();
    if (!this.tags.includes(normalizedTag)) {
      this.tags.push(normalizedTag);
      this.updatedAt = Date.now();
      return true;
    }
    
    return false;
  }
  
  /**
   * Remove tag
   */
  removeTag(tag) {
    const normalizedTag = tag.trim().toLowerCase();
    const index = this.tags.indexOf(normalizedTag);
    
    if (index > -1) {
      this.tags.splice(index, 1);
      this.updatedAt = Date.now();
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if user has access
   */
  hasAccess(userId, userGroups = []) {
    // System presets are always accessible
    if (this.isSystem) {
      return true;
    }
    
    // Public presets are accessible to all
    if (this.visibility === PresetVisibility.PUBLIC) {
      return true;
    }
    
    // Owner always has access
    if (this.ownerId === userId) {
      return true;
    }
    
    // Check shared access
    if (this.visibility === PresetVisibility.SHARED) {
      return this.sharedWith.some(share => {
        if (share.type === 'user' && share.id === userId) {
          return true;
        }
        if (share.type === 'group' && userGroups.includes(share.id)) {
          return true;
        }
        return false;
      });
    }
    
    return false;
  }
  
  /**
   * Share with user or group
   */
  shareWith(type, id, permissions = ['read']) {
    if (!['user', 'group'].includes(type)) {
      throw new Error('Share type must be "user" or "group"');
    }
    
    const existingShare = this.sharedWith.find(share => share.type === type && share.id === id);
    
    if (existingShare) {
      existingShare.permissions = permissions;
      existingShare.sharedAt = Date.now();
    } else {
      this.sharedWith.push({
        type,
        id,
        permissions,
        sharedAt: Date.now()
      });
    }
    
    this.updatedAt = Date.now();
  }
  
  /**
   * Remove share
   */
  removeShare(type, id) {
    const index = this.sharedWith.findIndex(share => share.type === type && share.id === id);
    
    if (index > -1) {
      this.sharedWith.splice(index, 1);
      this.updatedAt = Date.now();
      return true;
    }
    
    return false;
  }
  
  /**
   * Clone preset
   */
  clone(newName = null, newOwnerId = null) {
    const clonedData = {
      ...this.toJSON(),
      id: undefined, // Will generate new ID
      name: newName || `${this.name} (Copy)`,
      ownerId: newOwnerId || this.ownerId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
      successRate: 0,
      averageDuration: 0,
      lastUsedAt: undefined,
      lastError: undefined,
      visibility: PresetVisibility.PRIVATE, // Clones are private by default
      sharedWith: [] // Clear sharing
    };
    
    return new ConversionPreset(clonedData);
  }
  
  /**
   * Export preset
   */
  export(includeUsageStats = false, includeSharing = false) {
    const exportData = {
      name: this.name,
      description: this.description,
      category: this.category,
      settings: this.settings,
      qualityLevel: this.qualityLevel,
      conversionMode: this.conversionMode,
      tags: this.tags,
      metadata: this.metadata,
      version: this.version,
      supportedFormats: this.supportedFormats,
      minFileSize: this.minFileSize,
      maxFileSize: this.maxFileSize,
      compatibilityNotes: this.compatibilityNotes,
      advancedOptions: this.advancedOptions,
      customParameters: this.customParameters,
      environmentRequirements: this.environmentRequirements,
      exportedAt: Date.now(),
      exportedBy: 'ConversionPreset v1.0'
    };
    
    if (includeUsageStats) {
      exportData.usageStats = {
        usageCount: this.usageCount,
        successRate: this.successRate,
        averageDuration: this.averageDuration,
        lastUsedAt: this.lastUsedAt
      };
    }
    
    if (includeSharing) {
      exportData.sharing = {
        visibility: this.visibility,
        sharedWith: this.sharedWith
      };
    }
    
    return exportData;
  }
  
  /**
   * Import preset from exported data
   */
  static import(exportData, ownerId = null) {
    const presetData = {
      name: exportData.name,
      description: exportData.description,
      category: exportData.category,
      settings: exportData.settings,
      qualityLevel: exportData.qualityLevel,
      conversionMode: exportData.conversionMode,
      tags: exportData.tags,
      metadata: exportData.metadata,
      version: exportData.version,
      supportedFormats: exportData.supportedFormats,
      minFileSize: exportData.minFileSize,
      maxFileSize: exportData.maxFileSize,
      compatibilityNotes: exportData.compatibilityNotes,
      advancedOptions: exportData.advancedOptions,
      customParameters: exportData.customParameters,
      environmentRequirements: exportData.environmentRequirements,
      ownerId
    };
    
    // Import usage stats if available
    if (exportData.usageStats) {
      presetData.usageCount = exportData.usageStats.usageCount;
      presetData.successRate = exportData.usageStats.successRate;
      presetData.averageDuration = exportData.usageStats.averageDuration;
      presetData.lastUsedAt = exportData.usageStats.lastUsedAt;
    }
    
    // Import sharing if available and user has permission
    if (exportData.sharing && ownerId) {
      presetData.visibility = exportData.sharing.visibility;
      presetData.sharedWith = exportData.sharing.sharedWith;
    }
    
    return new ConversionPreset(presetData);
  }
  
  /**
   * Get compatibility score with file
   */
  getCompatibilityScore(fileInfo) {
    let score = 0;
    let maxScore = 0;
    
    // Check supported formats
    maxScore += 40;
    if (this.supportedFormats.length === 0 || this.supportedFormats.includes(fileInfo.format)) {
      score += 40;
    }
    
    // Check file size constraints
    maxScore += 20;
    if (this.minFileSize && fileInfo.size < this.minFileSize) {
      // File too small
    } else if (this.maxFileSize && fileInfo.size > this.maxFileSize) {
      // File too large
    } else {
      score += 20;
    }
    
    // Check category match
    maxScore += 30;
    if (this.category === fileInfo.category || this.category === PresetCategory.CUSTOM) {
      score += 30;
    }
    
    // Success rate bonus
    maxScore += 10;
    score += Math.round(this.successRate * 10);
    
    return maxScore > 0 ? (score / maxScore) : 0;
  }
  
  /**
   * Get estimated conversion time
   */
  getEstimatedDuration(fileSize) {
    if (this.averageDuration === 0 || this.usageCount === 0) {
      // No historical data, return rough estimate based on file size
      const baseTime = 5000; // 5 seconds base
      const sizeMultiplier = Math.log(fileSize / 1024 / 1024 + 1) * 2000; // Log scale for file size
      return baseTime + sizeMultiplier;
    }
    
    // Use historical average with some adjustment for file size
    const sizeRatio = fileSize / (1024 * 1024); // MB
    const adjustment = Math.log(sizeRatio + 1) * 0.1; // Small adjustment factor
    
    return Math.round(this.averageDuration * (1 + adjustment));
  }
  
  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      visibility: this.visibility,
      status: this.status,
      createdBy: this.createdBy,
      ownerId: this.ownerId,
      sharedWith: this.sharedWith,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastUsedAt: this.lastUsedAt,
      settings: this.settings,
      qualityLevel: this.qualityLevel,
      conversionMode: this.conversionMode,
      tags: this.tags,
      metadata: this.metadata,
      version: this.version,
      isSystem: this.isSystem,
      isTemplate: this.isTemplate,
      usageCount: this.usageCount,
      successRate: this.successRate,
      averageDuration: this.averageDuration,
      lastError: this.lastError,
      supportedFormats: this.supportedFormats,
      minFileSize: this.minFileSize,
      maxFileSize: this.maxFileSize,
      compatibilityNotes: this.compatibilityNotes,
      advancedOptions: this.advancedOptions,
      customParameters: this.customParameters,
      environmentRequirements: this.environmentRequirements
    };
  }
  
  /**
   * Create from JSON
   */
  static fromJSON(data) {
    return new ConversionPreset(data);
  }
}

/**
 * Preset Category class for managing categories
 */
class PresetCategoryManager {
  constructor() {
    this.categories = new Map();
    this._initializeDefaultCategories();
  }
  
  /**
   * Initialize default categories
   */
  _initializeDefaultCategories() {
    const defaultCategories = [
      {
        id: PresetCategory.IMAGE,
        name: 'Image',
        description: 'Image conversion presets',
        icon: 'image',
        supportedFormats: ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'tiff', 'webp'],
        defaultSettings: {
          quality: 85,
          stripMetadata: true
        }
      },
      {
        id: PresetCategory.VIDEO,
        name: 'Video',
        description: 'Video conversion presets',
        icon: 'video',
        supportedFormats: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'],
        defaultSettings: {
          codec: 'h264',
          bitrate: '2000k'
        }
      },
      {
        id: PresetCategory.AUDIO,
        name: 'Audio',
        description: 'Audio conversion presets',
        icon: 'audio',
        supportedFormats: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'],
        defaultSettings: {
          bitrate: '192k',
          sampleRate: 44100
        }
      },
      {
        id: PresetCategory.DOCUMENT,
        name: 'Document',
        description: 'Document conversion presets',
        icon: 'document',
        supportedFormats: ['pdf', 'doc', 'docx', 'txt', 'rtf'],
        defaultSettings: {}
      },
      {
        id: PresetCategory.ARCHIVE,
        name: 'Archive',
        description: 'Archive compression presets',
        icon: 'archive',
        supportedFormats: ['zip', 'rar', '7z', 'tar', 'gz'],
        defaultSettings: {
          compression: 6
        }
      },
      {
        id: PresetCategory.CUSTOM,
        name: 'Custom',
        description: 'Custom conversion presets',
        icon: 'custom',
        supportedFormats: [],
        defaultSettings: {}
      }
    ];
    
    for (const category of defaultCategories) {
      this.categories.set(category.id, category);
    }
  }
  
  /**
   * Get category
   */
  getCategory(id) {
    return this.categories.get(id);
  }
  
  /**
   * Get all categories
   */
  getAllCategories() {
    return Array.from(this.categories.values());
  }
  
  /**
   * Add custom category
   */
  addCategory(categoryData) {
    const category = {
      id: categoryData.id || crypto.randomBytes(8).toString('hex'),
      name: categoryData.name,
      description: categoryData.description || '',
      icon: categoryData.icon || 'custom',
      supportedFormats: categoryData.supportedFormats || [],
      defaultSettings: categoryData.defaultSettings || {},
      isCustom: true,
      createdAt: Date.now()
    };
    
    this.categories.set(category.id, category);
    return category;
  }
  
  /**
   * Update category
   */
  updateCategory(id, updates) {
    const category = this.categories.get(id);
    if (!category) {
      throw new Error(`Category ${id} not found`);
    }
    
    if (!category.isCustom) {
      throw new Error('Cannot modify built-in categories');
    }
    
    Object.assign(category, updates, { updatedAt: Date.now() });
    return category;
  }
  
  /**
   * Delete category
   */
  deleteCategory(id) {
    const category = this.categories.get(id);
    if (!category) {
      return false;
    }
    
    if (!category.isCustom) {
      throw new Error('Cannot delete built-in categories');
    }
    
    return this.categories.delete(id);
  }
}

module.exports = {
  ConversionPreset,
  PresetCategoryManager,
  PresetEvents,
  PresetCategory,
  PresetVisibility,
  PresetStatus,
  QualityLevel,
  ConversionMode,
  DEFAULT_PRESETS,
  VALIDATION_SCHEMAS
};