/**
 * Preset Categorization Service
 * Automatically categorizes presets by file type and provides intelligent organization
 */

const { EventEmitter } = require('events');
const path = require('path');
const { PresetCategory, PresetEvents } = require('../models/ConversionPreset');

/**
 * Categorization events
 */
const CategorizationEvents = {
  PRESET_CATEGORIZED: 'preset_categorized',
  CATEGORY_SUGGESTED: 'category_suggested',
  AUTO_TAG_APPLIED: 'auto_tag_applied',
  RULE_CREATED: 'rule_created',
  RULE_UPDATED: 'rule_updated',
  RULE_DELETED: 'rule_deleted',
  BATCH_CATEGORIZED: 'batch_categorized'
};

/**
 * File type mappings
 */
const FILE_TYPE_MAPPINGS = {
  // Image formats
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.svg', '.ico', '.raw', '.cr2', '.nef', '.arw'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'image/webp', 'image/svg+xml'],
    category: PresetCategory.IMAGE,
    commonFormats: ['jpeg', 'png', 'webp', 'gif'],
    qualityFormats: ['jpeg', 'webp'],
    losslessFormats: ['png', 'tiff', 'bmp'],
    animatedFormats: ['gif', 'webp'],
    vectorFormats: ['svg']
  },
  
  // Video formats
  video: {
    extensions: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp', '.ogv', '.ts', '.mts', '.m2ts'],
    mimeTypes: ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
    category: PresetCategory.VIDEO,
    commonFormats: ['mp4', 'avi', 'mkv', 'mov'],
    streamingFormats: ['mp4', 'webm'],
    highQualityFormats: ['mkv', 'mov'],
    codecs: ['h264', 'h265', 'vp8', 'vp9', 'av1']
  },
  
  // Audio formats
  audio: {
    extensions: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus', '.aiff', '.au'],
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg'],
    category: PresetCategory.AUDIO,
    commonFormats: ['mp3', 'wav', 'flac', 'aac'],
    lossyFormats: ['mp3', 'aac', 'ogg'],
    losslessFormats: ['flac', 'wav', 'aiff'],
    streamingFormats: ['mp3', 'aac', 'opus']
  },
  
  // Document formats
  document: {
    extensions: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.pages', '.epub', '.mobi'],
    mimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    category: PresetCategory.DOCUMENT,
    commonFormats: ['pdf', 'docx', 'txt'],
    editableFormats: ['docx', 'odt', 'rtf'],
    readOnlyFormats: ['pdf', 'epub']
  },
  
  // Archive formats
  archive: {
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tar.gz', '.tar.bz2'],
    mimeTypes: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/x-tar'],
    category: PresetCategory.ARCHIVE,
    commonFormats: ['zip', '7z', 'tar.gz'],
    compressionLevels: ['store', 'fast', 'normal', 'maximum', 'ultra']
  }
};

/**
 * Preset naming patterns for auto-categorization
 */
const NAMING_PATTERNS = {
  web: {
    keywords: ['web', 'online', 'website', 'browser', 'responsive'],
    tags: ['web-optimized', 'online', 'responsive'],
    suggestions: {
      image: ['progressive JPEG', 'WebP conversion', 'thumbnail generation'],
      video: ['streaming optimization', 'web-compatible codecs']
    }
  },
  
  mobile: {
    keywords: ['mobile', 'phone', 'ios', 'android', 'tablet'],
    tags: ['mobile-optimized', 'ios', 'android'],
    suggestions: {
      image: ['mobile-friendly sizes', 'retina display support'],
      video: ['mobile codecs', 'battery-efficient encoding']
    }
  },
  
  social: {
    keywords: ['instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'social'],
    tags: ['social-media', 'instagram', 'youtube'],
    suggestions: {
      image: ['square format', 'story format', 'cover photo'],
      video: ['social media specs', 'short-form content']
    }
  },
  
  print: {
    keywords: ['print', 'printing', 'cmyk', 'dpi', 'high-res'],
    tags: ['print-ready', 'high-resolution', 'cmyk'],
    suggestions: {
      image: ['CMYK conversion', 'high DPI', 'print optimization']
    }
  },
  
  archive: {
    keywords: ['backup', 'archive', 'storage', 'compress', 'reduce'],
    tags: ['archival', 'backup', 'storage'],
    suggestions: {
      image: ['lossless compression', 'metadata preservation'],
      video: ['archive codecs', 'long-term storage']
    }
  }
};

/**
 * Quality level mappings
 */
const QUALITY_MAPPINGS = {
  low: {
    keywords: ['low', 'draft', 'preview', 'quick', 'fast'],
    settings: {
      image: { quality: 60, compression: 8 },
      video: { bitrate: '500k', preset: 'ultrafast' },
      audio: { bitrate: '96k' }
    }
  },
  
  medium: {
    keywords: ['medium', 'standard', 'normal', 'balanced'],
    settings: {
      image: { quality: 80, compression: 6 },
      video: { bitrate: '2000k', preset: 'medium' },
      audio: { bitrate: '192k' }
    }
  },
  
  high: {
    keywords: ['high', 'quality', 'premium', 'best'],
    settings: {
      image: { quality: 95, compression: 3 },
      video: { bitrate: '8000k', preset: 'slow' },
      audio: { bitrate: '320k' }
    }
  },
  
  lossless: {
    keywords: ['lossless', 'perfect', 'original', 'uncompressed'],
    settings: {
      image: { lossless: true },
      video: { codec: 'ffv1', lossless: true },
      audio: { format: 'flac', lossless: true }
    }
  }
};

/**
 * Categorization rules
 */
class CategorizationRule {
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.name = data.name || '';
    this.description = data.description || '';
    this.priority = data.priority || 0;
    this.enabled = data.enabled !== false;
    
    // Rule conditions
    this.conditions = data.conditions || [];
    this.actions = data.actions || [];
    
    // Metadata
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.createdBy = data.createdBy;
    this.usageCount = data.usageCount || 0;
    this.successRate = data.successRate || 0;
  }
  
  _generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
  
  /**
   * Check if rule matches preset
   */
  matches(preset) {
    if (!this.enabled) return false;
    
    return this.conditions.every(condition => {
      switch (condition.type) {
        case 'name_contains':
          return preset.name.toLowerCase().includes(condition.value.toLowerCase());
        
        case 'name_matches':
          return new RegExp(condition.value, 'i').test(preset.name);
        
        case 'description_contains':
          return preset.description.toLowerCase().includes(condition.value.toLowerCase());
        
        case 'has_tag':
          return preset.tags.includes(condition.value);
        
        case 'category_is':
          return preset.category === condition.value;
        
        case 'setting_equals':
          return preset.settings[condition.key] === condition.value;
        
        case 'setting_exists':
          return preset.settings.hasOwnProperty(condition.key);
        
        case 'format_is':
          return preset.settings.format === condition.value;
        
        case 'quality_level':
          return preset.qualityLevel === condition.value;
        
        default:
          return false;
      }
    });
  }
  
  /**
   * Apply rule actions to preset
   */
  apply(preset) {
    const changes = [];
    
    for (const action of this.actions) {
      switch (action.type) {
        case 'set_category':
          if (preset.category !== action.value) {
            preset.category = action.value;
            changes.push(`Category set to ${action.value}`);
          }
          break;
        
        case 'add_tag':
          if (preset.addTag(action.value)) {
            changes.push(`Tag '${action.value}' added`);
          }
          break;
        
        case 'remove_tag':
          if (preset.removeTag(action.value)) {
            changes.push(`Tag '${action.value}' removed`);
          }
          break;
        
        case 'set_quality_level':
          if (preset.qualityLevel !== action.value) {
            preset.qualityLevel = action.value;
            changes.push(`Quality level set to ${action.value}`);
          }
          break;
        
        case 'update_metadata':
          preset.metadata[action.key] = action.value;
          changes.push(`Metadata '${action.key}' updated`);
          break;
        
        case 'suggest_settings':
          if (!preset.metadata.suggestedSettings) {
            preset.metadata.suggestedSettings = [];
          }
          preset.metadata.suggestedSettings.push(action.settings);
          changes.push('Settings suggestions added');
          break;
      }
    }
    
    if (changes.length > 0) {
      this.usageCount++;
      this.updatedAt = Date.now();
    }
    
    return changes;
  }
}

/**
 * Preset Categorization Service
 */
class PresetCategorizationService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      autoTagging: true,
      smartSuggestions: true,
      learningEnabled: true,
      confidenceThreshold: 0.7,
      ...options
    };
    
    this.rules = new Map();
    this.statistics = {
      totalCategorized: 0,
      autoTagsApplied: 0,
      suggestionsGenerated: 0,
      rulesApplied: 0
    };
    
    this._initializeDefaultRules();
  }
  
  /**
   * Initialize default categorization rules
   */
  _initializeDefaultRules() {
    const defaultRules = [
      {
        name: 'Auto-categorize by format',
        description: 'Automatically categorize presets based on output format',
        priority: 100,
        conditions: [{ type: 'setting_exists', key: 'format' }],
        actions: [{ type: 'set_category', value: 'auto' }] // Will be determined dynamically
      },
      
      {
        name: 'Web optimization tagging',
        description: 'Add web-related tags to web-optimized presets',
        priority: 80,
        conditions: [{ type: 'name_contains', value: 'web' }],
        actions: [
          { type: 'add_tag', value: 'web-optimized' },
          { type: 'add_tag', value: 'online' }
        ]
      },
      
      {
        name: 'Mobile optimization tagging',
        description: 'Add mobile-related tags to mobile-optimized presets',
        priority: 80,
        conditions: [{ type: 'name_contains', value: 'mobile' }],
        actions: [
          { type: 'add_tag', value: 'mobile-optimized' },
          { type: 'add_tag', value: 'responsive' }
        ]
      },
      
      {
        name: 'Quality level detection',
        description: 'Detect and set quality levels based on preset name',
        priority: 70,
        conditions: [{ type: 'name_contains', value: 'high' }],
        actions: [{ type: 'set_quality_level', value: 'high' }]
      },
      
      {
        name: 'Thumbnail categorization',
        description: 'Categorize thumbnail presets',
        priority: 90,
        conditions: [{ type: 'name_contains', value: 'thumbnail' }],
        actions: [
          { type: 'add_tag', value: 'thumbnail' },
          { type: 'add_tag', value: 'small-size' },
          { type: 'update_metadata', key: 'purpose', value: 'thumbnail' }
        ]
      }
    ];
    
    for (const ruleData of defaultRules) {
      const rule = new CategorizationRule(ruleData);
      this.rules.set(rule.id, rule);
    }
  }
  
  /**
   * Categorize a single preset
   */
  categorizePreset(preset) {
    const results = {
      originalCategory: preset.category,
      suggestedCategory: null,
      appliedTags: [],
      appliedRules: [],
      suggestions: [],
      confidence: 0
    };
    
    // Auto-detect category from format
    if (preset.settings.format) {
      const detectedCategory = this._detectCategoryFromFormat(preset.settings.format);
      if (detectedCategory && detectedCategory !== preset.category) {
        results.suggestedCategory = detectedCategory;
        results.confidence = this._calculateCategoryConfidence(preset, detectedCategory);
        
        if (results.confidence >= this.options.confidenceThreshold) {
          preset.category = detectedCategory;
          this.emit(CategorizationEvents.PRESET_CATEGORIZED, {
            preset,
            oldCategory: results.originalCategory,
            newCategory: detectedCategory,
            confidence: results.confidence
          });
        } else {
          this.emit(CategorizationEvents.CATEGORY_SUGGESTED, {
            preset,
            suggestedCategory: detectedCategory,
            confidence: results.confidence
          });
        }
      }
    }
    
    // Apply auto-tagging
    if (this.options.autoTagging) {
      const autoTags = this._generateAutoTags(preset);
      for (const tag of autoTags) {
        if (preset.addTag(tag)) {
          results.appliedTags.push(tag);
        }
      }
      
      if (results.appliedTags.length > 0) {
        this.emit(CategorizationEvents.AUTO_TAG_APPLIED, {
          preset,
          tags: results.appliedTags
        });
      }
    }
    
    // Apply categorization rules
    const sortedRules = Array.from(this.rules.values())
      .sort((a, b) => b.priority - a.priority);
    
    for (const rule of sortedRules) {
      if (rule.matches(preset)) {
        const changes = rule.apply(preset);
        if (changes.length > 0) {
          results.appliedRules.push({
            rule: rule.name,
            changes
          });
        }
      }
    }
    
    // Generate smart suggestions
    if (this.options.smartSuggestions) {
      results.suggestions = this._generateSmartSuggestions(preset);
    }
    
    // Update statistics
    this.statistics.totalCategorized++;
    this.statistics.autoTagsApplied += results.appliedTags.length;
    this.statistics.rulesApplied += results.appliedRules.length;
    this.statistics.suggestionsGenerated += results.suggestions.length;
    
    return results;
  }
  
  /**
   * Batch categorize multiple presets
   */
  batchCategorize(presets, options = {}) {
    const results = {
      processed: 0,
      categorized: 0,
      tagged: 0,
      errors: [],
      summary: {}
    };
    
    for (const preset of presets) {
      try {
        const result = this.categorizePreset(preset);
        results.processed++;
        
        if (result.suggestedCategory || result.originalCategory !== preset.category) {
          results.categorized++;
        }
        
        if (result.appliedTags.length > 0) {
          results.tagged++;
        }
        
        // Update summary
        const category = preset.category;
        if (!results.summary[category]) {
          results.summary[category] = 0;
        }
        results.summary[category]++;
        
      } catch (error) {
        results.errors.push({
          presetId: preset.id,
          presetName: preset.name,
          error: error.message
        });
      }
    }
    
    this.emit(CategorizationEvents.BATCH_CATEGORIZED, results);
    return results;
  }
  
  /**
   * Detect category from format
   */
  _detectCategoryFromFormat(format) {
    const normalizedFormat = format.toLowerCase();
    
    for (const [type, mapping] of Object.entries(FILE_TYPE_MAPPINGS)) {
      if (mapping.commonFormats.includes(normalizedFormat)) {
        return mapping.category;
      }
    }
    
    return null;
  }
  
  /**
   * Calculate category confidence
   */
  _calculateCategoryConfidence(preset, suggestedCategory) {
    let confidence = 0.5; // Base confidence
    
    // Check format match
    if (preset.settings.format) {
      const mapping = Object.values(FILE_TYPE_MAPPINGS)
        .find(m => m.category === suggestedCategory);
      
      if (mapping && mapping.commonFormats.includes(preset.settings.format.toLowerCase())) {
        confidence += 0.3;
      }
    }
    
    // Check name patterns
    const nameWords = preset.name.toLowerCase().split(/\s+/);
    for (const [pattern, data] of Object.entries(NAMING_PATTERNS)) {
      const matchCount = data.keywords.filter(keyword => 
        nameWords.some(word => word.includes(keyword))
      ).length;
      
      if (matchCount > 0) {
        confidence += Math.min(matchCount * 0.1, 0.2);
      }
    }
    
    // Check existing tags
    const categoryMapping = Object.values(FILE_TYPE_MAPPINGS)
      .find(m => m.category === suggestedCategory);
    
    if (categoryMapping) {
      const relevantTags = preset.tags.filter(tag => 
        categoryMapping.commonFormats.some(format => tag.includes(format))
      );
      
      confidence += relevantTags.length * 0.05;
    }
    
    return Math.min(confidence, 1.0);
  }
  
  /**
   * Generate auto tags
   */
  _generateAutoTags(preset) {
    const tags = new Set();
    
    // Format-based tags
    if (preset.settings.format) {
      tags.add(preset.settings.format.toLowerCase());
      
      // Add category-specific tags
      const mapping = Object.values(FILE_TYPE_MAPPINGS)
        .find(m => m.commonFormats.includes(preset.settings.format.toLowerCase()));
      
      if (mapping) {
        tags.add(mapping.category);
        
        // Add specific format characteristics
        if (mapping.qualityFormats && mapping.qualityFormats.includes(preset.settings.format.toLowerCase())) {
          tags.add('quality-adjustable');
        }
        
        if (mapping.losslessFormats && mapping.losslessFormats.includes(preset.settings.format.toLowerCase())) {
          tags.add('lossless');
        }
        
        if (mapping.streamingFormats && mapping.streamingFormats.includes(preset.settings.format.toLowerCase())) {
          tags.add('streaming-optimized');
        }
      }
    }
    
    // Name-based tags
    const nameWords = preset.name.toLowerCase().split(/\s+/);
    for (const [pattern, data] of Object.entries(NAMING_PATTERNS)) {
      const hasKeyword = data.keywords.some(keyword => 
        nameWords.some(word => word.includes(keyword))
      );
      
      if (hasKeyword) {
        data.tags.forEach(tag => tags.add(tag));
      }
    }
    
    // Quality-based tags
    for (const [level, data] of Object.entries(QUALITY_MAPPINGS)) {
      const hasKeyword = data.keywords.some(keyword => 
        preset.name.toLowerCase().includes(keyword)
      );
      
      if (hasKeyword) {
        tags.add(`${level}-quality`);
        if (preset.qualityLevel === 'custom') {
          preset.qualityLevel = level;
        }
      }
    }
    
    // Settings-based tags
    if (preset.settings.quality) {
      if (preset.settings.quality >= 90) {
        tags.add('high-quality');
      } else if (preset.settings.quality <= 50) {
        tags.add('low-quality');
      }
    }
    
    if (preset.settings.width && preset.settings.height) {
      const pixels = preset.settings.width * preset.settings.height;
      if (pixels >= 1920 * 1080) {
        tags.add('high-resolution');
      } else if (pixels <= 640 * 480) {
        tags.add('low-resolution');
      }
    }
    
    return Array.from(tags);
  }
  
  /**
   * Generate smart suggestions
   */
  _generateSmartSuggestions(preset) {
    const suggestions = [];
    
    // Category-specific suggestions
    const mapping = Object.values(FILE_TYPE_MAPPINGS)
      .find(m => m.category === preset.category);
    
    if (mapping) {
      // Suggest alternative formats
      const currentFormat = preset.settings.format;
      const alternativeFormats = mapping.commonFormats
        .filter(format => format !== currentFormat)
        .slice(0, 3);
      
      if (alternativeFormats.length > 0) {
        suggestions.push({
          type: 'alternative_formats',
          title: 'Alternative Formats',
          description: `Consider these formats: ${alternativeFormats.join(', ')}`,
          formats: alternativeFormats,
          priority: 'medium'
        });
      }
      
      // Quality optimization suggestions
      if (mapping.qualityFormats && mapping.qualityFormats.includes(currentFormat)) {
        if (!preset.settings.quality || preset.settings.quality === 100) {
          suggestions.push({
            type: 'quality_optimization',
            title: 'Quality Optimization',
            description: 'Consider reducing quality to 85-95% for better file size',
            recommendedQuality: 90,
            priority: 'low'
          });
        }
      }
    }
    
    // Name-based suggestions
    for (const [pattern, data] of Object.entries(NAMING_PATTERNS)) {
      const nameWords = preset.name.toLowerCase().split(/\s+/);
      const hasKeyword = data.keywords.some(keyword => 
        nameWords.some(word => word.includes(keyword))
      );
      
      if (hasKeyword && data.suggestions[preset.category]) {
        suggestions.push({
          type: 'usage_optimization',
          title: `${pattern.charAt(0).toUpperCase() + pattern.slice(1)} Optimization`,
          description: `Suggestions for ${pattern} use case`,
          recommendations: data.suggestions[preset.category],
          priority: 'medium'
        });
      }
    }
    
    // Performance suggestions
    if (preset.averageDuration > 30000) { // More than 30 seconds
      suggestions.push({
        type: 'performance',
        title: 'Performance Optimization',
        description: 'This preset takes a long time to process. Consider optimizing settings.',
        recommendations: [
          'Reduce output resolution',
          'Use faster encoding presets',
          'Lower quality settings'
        ],
        priority: 'high'
      });
    }
    
    return suggestions;
  }
  
  /**
   * Add categorization rule
   */
  addRule(ruleData) {
    const rule = new CategorizationRule(ruleData);
    this.rules.set(rule.id, rule);
    
    this.emit(CategorizationEvents.RULE_CREATED, { rule });
    return rule;
  }
  
  /**
   * Update categorization rule
   */
  updateRule(ruleId, updates) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }
    
    Object.assign(rule, updates, { updatedAt: Date.now() });
    
    this.emit(CategorizationEvents.RULE_UPDATED, { rule });
    return rule;
  }
  
  /**
   * Delete categorization rule
   */
  deleteRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return false;
    }
    
    this.rules.delete(ruleId);
    
    this.emit(CategorizationEvents.RULE_DELETED, { rule });
    return true;
  }
  
  /**
   * Get all rules
   */
  getRules() {
    return Array.from(this.rules.values())
      .sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Get categorization statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      rulesCount: this.rules.size,
      averageConfidence: this.statistics.totalCategorized > 0 
        ? this.statistics.categorized / this.statistics.totalCategorized 
        : 0
    };
  }
  
  /**
   * Get file type mappings
   */
  getFileTypeMappings() {
    return FILE_TYPE_MAPPINGS;
  }
  
  /**
   * Get supported formats for category
   */
  getSupportedFormats(category) {
    const mapping = Object.values(FILE_TYPE_MAPPINGS)
      .find(m => m.category === category);
    
    return mapping ? mapping.commonFormats : [];
  }
  
  /**
   * Suggest category for file
   */
  suggestCategoryForFile(filename, mimeType = null) {
    const extension = path.extname(filename).toLowerCase();
    
    for (const [type, mapping] of Object.entries(FILE_TYPE_MAPPINGS)) {
      if (mapping.extensions.includes(extension)) {
        return {
          category: mapping.category,
          confidence: 0.9,
          reason: `File extension ${extension} matches ${type} category`
        };
      }
      
      if (mimeType && mapping.mimeTypes.includes(mimeType)) {
        return {
          category: mapping.category,
          confidence: 0.8,
          reason: `MIME type ${mimeType} matches ${type} category`
        };
      }
    }
    
    return {
      category: PresetCategory.CUSTOM,
      confidence: 0.1,
      reason: 'Unknown file type'
    };
  }
  
  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalCategorized: 0,
      autoTagsApplied: 0,
      suggestionsGenerated: 0,
      rulesApplied: 0
    };
  }
}

// Global instance
let globalInstance = null;

/**
 * Get global categorization service instance
 */
function getCategorizationService(options = {}) {
  if (!globalInstance) {
    globalInstance = new PresetCategorizationService(options);
  }
  return globalInstance;
}

module.exports = {
  PresetCategorizationService,
  CategorizationRule,
  CategorizationEvents,
  FILE_TYPE_MAPPINGS,
  NAMING_PATTERNS,
  QUALITY_MAPPINGS,
  getCategorizationService
};