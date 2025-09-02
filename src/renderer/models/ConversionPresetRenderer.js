/**
 * Renderer-safe Conversion Preset Model
 * Contains only the constants and basic structures needed in the renderer process
 */

/**
 * Preset events
 */
export const PresetEvents = {
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
export const PresetCategory = {
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
export const PresetVisibility = {
  PRIVATE: 'private',     // Only visible to creator
  SHARED: 'shared',       // Visible to specific users/groups
  PUBLIC: 'public',       // Visible to all users
  SYSTEM: 'system'        // Built-in system presets
};

/**
 * Preset status
 */
export const PresetStatus = {
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  ARCHIVED: 'archived'
};

/**
 * Quality levels
 */
export const QualityLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  LOSSLESS: 'lossless',
  CUSTOM: 'custom'
};

/**
 * Conversion modes
 */
export const ConversionMode = {
  FAST: 'fast',
  BALANCED: 'balanced',
  QUALITY: 'quality',
  CUSTOM: 'custom'
};

/**
 * Default presets
 */
export const DEFAULT_PRESETS = {
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
 * Validation schemas
 */
export const VALIDATION_SCHEMAS = {
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
 * Simple ConversionPreset class for renderer process
 * Only contains basic properties and validation, no Node.js dependencies
 */
export class ConversionPreset {
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.name = data.name || '';
    this.description = data.description || '';
    this.category = data.category || PresetCategory.IMAGE;
    this.settings = data.settings || {};
    this.tags = data.tags || [];
    this.visibility = data.visibility || PresetVisibility.PRIVATE;
    this.status = data.status || PresetStatus.ACTIVE;
    this.ownerId = data.ownerId || null;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.version = data.version || '1.0.0';
    this.usageCount = data.usageCount || 0;
    this.lastUsed = data.lastUsed || null;
    this.metadata = data.metadata || {};
  }

  _generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

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
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      settings: this.settings,
      tags: this.tags,
      visibility: this.visibility,
      status: this.status,
      ownerId: this.ownerId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version,
      usageCount: this.usageCount,
      lastUsed: this.lastUsed,
      metadata: this.metadata
    };
  }

  static fromJSON(data) {
    return new ConversionPreset(data);
  }
}

export default {
  ConversionPreset,
  PresetEvents,
  PresetCategory,
  PresetVisibility,
  PresetStatus,
  QualityLevel,
  ConversionMode,
  DEFAULT_PRESETS,
  VALIDATION_SCHEMAS
};