/**
 * Conversion Preset Template Service
 * Handles preset duplication, template creation, and customization
 */

const { ConversionPreset, PresetEvents } = require('../models/ConversionPreset');
const { ConversionPresetValidator } = require('./ConversionPresetValidator');
const EventEmitter = require('events');
const path = require('path');
const crypto = require('crypto');

/**
 * Template types for preset creation
 */
const TemplateTypes = {
  BASIC: 'basic',
  ADVANCED: 'advanced',
  CUSTOM: 'custom',
  QUICK: 'quick'
};

/**
 * Duplication strategies
 */
const DuplicationStrategies = {
  EXACT: 'exact',           // Exact copy with new ID
  MODIFIED: 'modified',     // Copy with modifications
  TEMPLATE: 'template',     // Create as template
  INHERIT: 'inherit'        // Inherit from parent with overrides
};

class ConversionPresetTemplate extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.validator = options.validator || new ConversionPresetValidator();
    this.templates = new Map();
    this.duplicateHistory = new Map();
    
    // Template configuration
    this.config = {
      maxDuplicates: options.maxDuplicates || 100,
      templateCacheSize: options.templateCacheSize || 50,
      enableVersioning: options.enableVersioning !== false,
      autoCleanup: options.autoCleanup !== false,
      ...options.config
    };
    
    this.initializeDefaultTemplates();
  }

  /**
   * Initialize default preset templates
   */
  initializeDefaultTemplates() {
    const defaultTemplates = {
      // Image templates
      'image-web-optimized': {
        name: 'Web Optimized Image',
        category: 'image',
        description: 'Optimized for web usage with balanced quality and size',
        settings: {
          format: 'webp',
          quality: 85,
          resize: { enabled: true, maxWidth: 1920, maxHeight: 1080 },
          compression: { enabled: true, level: 'medium' }
        }
      },
      'image-thumbnail': {
        name: 'Thumbnail Generator',
        category: 'image',
        description: 'Creates small thumbnails for previews',
        settings: {
          format: 'jpeg',
          quality: 75,
          resize: { enabled: true, maxWidth: 300, maxHeight: 300 },
          crop: { enabled: true, mode: 'center' }
        }
      },
      
      // Video templates
      'video-web-streaming': {
        name: 'Web Streaming Video',
        category: 'video',
        description: 'Optimized for web streaming platforms',
        settings: {
          format: 'mp4',
          codec: 'h264',
          bitrate: '2000k',
          resolution: '1080p',
          framerate: 30
        }
      },
      'video-mobile': {
        name: 'Mobile Video',
        category: 'video',
        description: 'Optimized for mobile devices',
        settings: {
          format: 'mp4',
          codec: 'h264',
          bitrate: '1000k',
          resolution: '720p',
          framerate: 24
        }
      },
      
      // Audio templates
      'audio-podcast': {
        name: 'Podcast Audio',
        category: 'audio',
        description: 'Optimized for podcast distribution',
        settings: {
          format: 'mp3',
          bitrate: '128k',
          sampleRate: 44100,
          channels: 'stereo',
          normalize: true
        }
      },
      'audio-music': {
        name: 'Music Quality',
        category: 'audio',
        description: 'High quality for music files',
        settings: {
          format: 'flac',
          bitrate: '320k',
          sampleRate: 48000,
          channels: 'stereo'
        }
      }
    };

    Object.entries(defaultTemplates).forEach(([id, template]) => {
      this.templates.set(id, {
        ...template,
        id,
        type: TemplateTypes.BASIC,
        isDefault: true,
        createdAt: new Date().toISOString(),
        version: '1.0.0'
      });
    });
  }

  /**
   * Duplicate a preset with optional modifications
   */
  async duplicatePreset(sourcePreset, options = {}) {
    try {
      const {
        strategy = DuplicationStrategies.EXACT,
        modifications = {},
        newName,
        newCategory,
        preserveMetadata = false,
        userId
      } = options;

      // Validate source preset
      if (!sourcePreset || !sourcePreset.id) {
        throw new Error('Invalid source preset');
      }

      // Generate new preset data
      const duplicateData = await this._generateDuplicateData(
        sourcePreset, 
        strategy, 
        modifications
      );

      // Create new preset instance
      const duplicatePreset = new ConversionPreset({
        ...duplicateData,
        name: newName || `${sourcePreset.name} (Copy)`,
        category: newCategory || sourcePreset.category,
        metadata: preserveMetadata ? {
          ...sourcePreset.metadata,
          duplicatedFrom: sourcePreset.id,
          duplicatedAt: new Date().toISOString(),
          duplicateStrategy: strategy
        } : {
          duplicatedFrom: sourcePreset.id,
          duplicatedAt: new Date().toISOString(),
          duplicateStrategy: strategy
        },
        createdBy: userId || 'system'
      });

      // Validate the duplicate
      const validation = await this.validator.validatePreset(duplicatePreset);
      if (!validation.isValid) {
        throw new Error(`Duplicate validation failed: ${validation.errors.join(', ')}`);
      }

      // Track duplication history
      this._trackDuplication(sourcePreset.id, duplicatePreset.id, strategy);

      this.emit(PresetEvents.PRESET_DUPLICATED, {
        source: sourcePreset,
        duplicate: duplicatePreset,
        strategy,
        timestamp: new Date().toISOString()
      });

      return duplicatePreset;
    } catch (error) {
      this.emit(PresetEvents.PRESET_ERROR, {
        operation: 'duplicate',
        error: error.message,
        sourcePreset: sourcePreset?.id
      });
      throw error;
    }
  }

  /**
   * Create a preset from a template
   */
  async createFromTemplate(templateId, customizations = {}) {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      // Merge template settings with customizations
      const presetData = {
        name: customizations.name || template.name,
        category: customizations.category || template.category,
        description: customizations.description || template.description,
        settings: this._mergeSettings(template.settings, customizations.settings || {}),
        metadata: {
          createdFromTemplate: templateId,
          templateVersion: template.version,
          customizations: Object.keys(customizations),
          ...customizations.metadata
        },
        createdBy: customizations.userId || 'system'
      };

      const preset = new ConversionPreset(presetData);

      // Validate the preset
      const validation = await this.validator.validatePreset(preset);
      if (!validation.isValid) {
        throw new Error(`Template preset validation failed: ${validation.errors.join(', ')}`);
      }

      this.emit(PresetEvents.PRESET_CREATED, {
        preset,
        template: templateId,
        timestamp: new Date().toISOString()
      });

      return preset;
    } catch (error) {
      this.emit(PresetEvents.PRESET_ERROR, {
        operation: 'createFromTemplate',
        error: error.message,
        templateId
      });
      throw error;
    }
  }

  /**
   * Create a custom template from an existing preset
   */
  async createTemplate(preset, templateOptions = {}) {
    try {
      const {
        name,
        description,
        category,
        isPublic = false,
        tags = [],
        userId
      } = templateOptions;

      const templateId = this._generateTemplateId(name || preset.name);
      
      const template = {
        id: templateId,
        name: name || `${preset.name} Template`,
        category: category || preset.category,
        description: description || `Template based on ${preset.name}`,
        type: TemplateTypes.CUSTOM,
        settings: this._sanitizeSettingsForTemplate(preset.settings),
        metadata: {
          basedOnPreset: preset.id,
          createdBy: userId || 'system',
          isPublic,
          tags,
          usage: 0
        },
        isDefault: false,
        createdAt: new Date().toISOString(),
        version: '1.0.0'
      };

      this.templates.set(templateId, template);

      this.emit('template-created', {
        template,
        sourcePreset: preset.id,
        timestamp: new Date().toISOString()
      });

      return template;
    } catch (error) {
      this.emit('template-error', {
        operation: 'createTemplate',
        error: error.message,
        presetId: preset?.id
      });
      throw error;
    }
  }

  /**
   * Get available templates
   */
  getTemplates(filters = {}) {
    const {
      category,
      type,
      isPublic,
      userId,
      tags = []
    } = filters;

    let templates = Array.from(this.templates.values());

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    if (type) {
      templates = templates.filter(t => t.type === type);
    }

    if (isPublic !== undefined) {
      templates = templates.filter(t => t.metadata?.isPublic === isPublic);
    }

    if (userId) {
      templates = templates.filter(t => 
        t.metadata?.createdBy === userId || t.metadata?.isPublic
      );
    }

    if (tags.length > 0) {
      templates = templates.filter(t => 
        tags.some(tag => t.metadata?.tags?.includes(tag))
      );
    }

    return templates.sort((a, b) => {
      // Sort by usage, then by creation date
      const usageA = a.metadata?.usage || 0;
      const usageB = b.metadata?.usage || 0;
      
      if (usageA !== usageB) {
        return usageB - usageA;
      }
      
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  /**
   * Update template usage statistics
   */
  incrementTemplateUsage(templateId) {
    const template = this.templates.get(templateId);
    if (template) {
      template.metadata = template.metadata || {};
      template.metadata.usage = (template.metadata.usage || 0) + 1;
      template.metadata.lastUsed = new Date().toISOString();
    }
  }

  /**
   * Get duplication history for a preset
   */
  getDuplicationHistory(presetId) {
    return this.duplicateHistory.get(presetId) || [];
  }

  /**
   * Generate duplicate data based on strategy
   */
  async _generateDuplicateData(sourcePreset, strategy, modifications) {
    const baseData = {
      settings: { ...sourcePreset.settings },
      category: sourcePreset.category,
      description: sourcePreset.description,
      tags: [...(sourcePreset.tags || [])]
    };

    switch (strategy) {
      case DuplicationStrategies.EXACT:
        return baseData;

      case DuplicationStrategies.MODIFIED:
        return this._applyModifications(baseData, modifications);

      case DuplicationStrategies.TEMPLATE:
        return {
          ...baseData,
          settings: this._sanitizeSettingsForTemplate(baseData.settings)
        };

      case DuplicationStrategies.INHERIT:
        return this._applyInheritance(baseData, modifications);

      default:
        throw new Error(`Unknown duplication strategy: ${strategy}`);
    }
  }

  /**
   * Apply modifications to preset data
   */
  _applyModifications(baseData, modifications) {
    const result = { ...baseData };

    if (modifications.settings) {
      result.settings = this._mergeSettings(result.settings, modifications.settings);
    }

    if (modifications.category) {
      result.category = modifications.category;
    }

    if (modifications.description) {
      result.description = modifications.description;
    }

    if (modifications.tags) {
      result.tags = [...new Set([...result.tags, ...modifications.tags])];
    }

    return result;
  }

  /**
   * Apply inheritance-based modifications
   */
  _applyInheritance(baseData, overrides) {
    // For inheritance, we create a more selective merge
    const result = { ...baseData };

    // Only override specific settings, keeping the rest
    if (overrides.settings) {
      result.settings = this._selectiveSettingsMerge(result.settings, overrides.settings);
    }

    return result;
  }

  /**
   * Merge settings objects deeply
   */
  _mergeSettings(base, override) {
    const result = { ...base };

    Object.keys(override).forEach(key => {
      if (typeof override[key] === 'object' && override[key] !== null && !Array.isArray(override[key])) {
        result[key] = this._mergeSettings(result[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    });

    return result;
  }

  /**
   * Selective settings merge for inheritance
   */
  _selectiveSettingsMerge(base, override) {
    const result = { ...base };
    
    // Only merge non-null, non-undefined values
    Object.keys(override).forEach(key => {
      if (override[key] !== null && override[key] !== undefined) {
        if (typeof override[key] === 'object' && !Array.isArray(override[key])) {
          result[key] = this._selectiveSettingsMerge(result[key] || {}, override[key]);
        } else {
          result[key] = override[key];
        }
      }
    });

    return result;
  }

  /**
   * Sanitize settings for template creation
   */
  _sanitizeSettingsForTemplate(settings) {
    const sanitized = { ...settings };
    
    // Remove user-specific or file-specific settings
    delete sanitized.inputPath;
    delete sanitized.outputPath;
    delete sanitized.userId;
    delete sanitized.sessionId;
    
    return sanitized;
  }

  /**
   * Generate unique template ID
   */
  _generateTemplateId(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hash = crypto.createHash('md5').update(name + Date.now()).digest('hex').substring(0, 8);
    return `${base}-${hash}`;
  }

  /**
   * Track duplication history
   */
  _trackDuplication(sourceId, duplicateId, strategy) {
    if (!this.duplicateHistory.has(sourceId)) {
      this.duplicateHistory.set(sourceId, []);
    }

    const history = this.duplicateHistory.get(sourceId);
    history.push({
      duplicateId,
      strategy,
      timestamp: new Date().toISOString()
    });

    // Limit history size
    if (history.length > this.config.maxDuplicates) {
      history.splice(0, history.length - this.config.maxDuplicates);
    }
  }

  /**
   * Clean up old templates and history
   */
  cleanup() {
    if (!this.config.autoCleanup) return;

    const now = new Date();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Clean up unused custom templates
    for (const [id, template] of this.templates.entries()) {
      if (!template.isDefault && 
          template.type === TemplateTypes.CUSTOM &&
          (template.metadata?.usage || 0) === 0 &&
          (now - new Date(template.createdAt)) > maxAge) {
        this.templates.delete(id);
      }
    }

    // Clean up old duplication history
    for (const [presetId, history] of this.duplicateHistory.entries()) {
      const filtered = history.filter(entry => 
        (now - new Date(entry.timestamp)) <= maxAge
      );
      
      if (filtered.length === 0) {
        this.duplicateHistory.delete(presetId);
      } else {
        this.duplicateHistory.set(presetId, filtered);
      }
    }
  }

  /**
   * Export templates for backup
   */
  exportTemplates() {
    return {
      templates: Array.from(this.templates.entries()),
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  /**
   * Import templates from backup
   */
  importTemplates(data) {
    if (!data.templates || !Array.isArray(data.templates)) {
      throw new Error('Invalid template data format');
    }

    let imported = 0;
    data.templates.forEach(([id, template]) => {
      if (!template.isDefault) { // Don't override default templates
        this.templates.set(id, template);
        imported++;
      }
    });

    return { imported, total: data.templates.length };
  }
}

module.exports = {
  ConversionPresetTemplate,
  TemplateTypes,
  DuplicationStrategies
};