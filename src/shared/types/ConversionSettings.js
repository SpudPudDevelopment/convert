import {
  ConversionType,
  DocumentFormat,
  ImageFormat,
  AudioFormat,
  VideoFormat,
  getSupportedFormats
} from './jobEnums.js';

/**
 * Base conversion settings class
 */
export class ConversionSettings {
  constructor({
    sourceFormat,
    targetFormat,
    conversionType,
    quality = 'medium',
    preserveMetadata = true,
    outputPath = null,
    customOptions = {}
  } = {}) {
    this.sourceFormat = sourceFormat;
    this.targetFormat = targetFormat;
    this.conversionType = conversionType;
    this.quality = quality;
    this.preserveMetadata = preserveMetadata;
    this.outputPath = outputPath;
    this.customOptions = customOptions;
    this.createdAt = new Date();
  }

  /**
   * Validate the conversion settings
   */
  validate() {
    const errors = [];

    if (!this.sourceFormat) {
      errors.push('Source format is required');
    }

    if (!this.targetFormat) {
      errors.push('Target format is required');
    }

    if (!this.conversionType) {
      errors.push('Conversion type is required');
    }

    if (this.conversionType) {
      const supportedFormats = getSupportedFormats(this.conversionType);
      
      if (this.sourceFormat && !supportedFormats.includes(this.sourceFormat)) {
        errors.push(`Unsupported source format: ${this.sourceFormat}`);
      }

      if (this.targetFormat && !supportedFormats.includes(this.targetFormat)) {
        errors.push(`Unsupported target format: ${this.targetFormat}`);
      }
    }

    const validQualities = ['low', 'medium', 'high', 'maximum'];
    if (!validQualities.includes(this.quality)) {
      errors.push('Quality must be one of: low, medium, high, maximum');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      sourceFormat: this.sourceFormat,
      targetFormat: this.targetFormat,
      conversionType: this.conversionType,
      quality: this.quality,
      preserveMetadata: this.preserveMetadata,
      outputPath: this.outputPath,
      customOptions: this.customOptions,
      createdAt: this.createdAt.toISOString()
    };
  }

  /**
   * Create from plain object
   */
  static fromJSON(data) {
    const settings = new ConversionSettings(data);
    if (data.createdAt) {
      settings.createdAt = new Date(data.createdAt);
    }
    return settings;
  }
}

/**
 * Document-specific conversion settings
 */
export class DocumentConversionSettings extends ConversionSettings {
  constructor(options = {}) {
    super({ ...options, conversionType: ConversionType.DOCUMENT });
    
    // Document-specific options
    this.pageRange = options.pageRange || null; // e.g., "1-5" or "1,3,5"
    this.orientation = options.orientation || 'auto'; // portrait, landscape, auto
    this.paperSize = options.paperSize || 'A4'; // A4, Letter, Legal, etc.
    this.margins = options.margins || { top: 1, right: 1, bottom: 1, left: 1 }; // in inches
    this.fontSize = options.fontSize || null;
    this.fontFamily = options.fontFamily || null;
    this.includeImages = options.includeImages !== false;
    this.includeLinks = options.includeLinks !== false;
    this.compression = options.compression || 'medium';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      pageRange: this.pageRange,
      orientation: this.orientation,
      paperSize: this.paperSize,
      margins: this.margins,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      includeImages: this.includeImages,
      includeLinks: this.includeLinks,
      compression: this.compression
    };
  }
}

/**
 * Image-specific conversion settings
 */
export class ImageConversionSettings extends ConversionSettings {
  constructor(options = {}) {
    super({ ...options, conversionType: ConversionType.IMAGE });
    
    // Image-specific options
    this.width = options.width || null;
    this.height = options.height || null;
    this.maintainAspectRatio = options.maintainAspectRatio !== false;
    this.resizeMode = options.resizeMode || 'fit'; // fit, fill, stretch
    this.backgroundColor = options.backgroundColor || null;
    this.compression = options.compression || 85; // 0-100 for JPEG
    this.progressive = options.progressive || false;
    this.stripMetadata = options.stripMetadata || false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      width: this.width,
      height: this.height,
      maintainAspectRatio: this.maintainAspectRatio,
      resizeMode: this.resizeMode,
      backgroundColor: this.backgroundColor,
      compression: this.compression,
      progressive: this.progressive,
      stripMetadata: this.stripMetadata
    };
  }
}

/**
 * Audio-specific conversion settings
 */
export class AudioConversionSettings extends ConversionSettings {
  constructor(options = {}) {
    super({ ...options, conversionType: ConversionType.AUDIO });
    
    // Audio-specific options
    this.bitrate = options.bitrate || 128; // kbps
    this.sampleRate = options.sampleRate || 44100; // Hz
    this.channels = options.channels || 2; // 1 = mono, 2 = stereo
    this.codec = options.codec || 'auto';
    this.volume = options.volume || 100; // percentage
    this.fadeIn = options.fadeIn || 0; // seconds
    this.fadeOut = options.fadeOut || 0; // seconds
    this.normalize = options.normalize || false;
    this.trimStart = options.trimStart || 0; // seconds
    this.trimEnd = options.trimEnd || 0; // seconds
  }

  toJSON() {
    return {
      ...super.toJSON(),
      bitrate: this.bitrate,
      sampleRate: this.sampleRate,
      channels: this.channels,
      codec: this.codec,
      volume: this.volume,
      fadeIn: this.fadeIn,
      fadeOut: this.fadeOut,
      normalize: this.normalize,
      trimStart: this.trimStart,
      trimEnd: this.trimEnd
    };
  }
}

/**
 * Video-specific conversion settings
 */
export class VideoConversionSettings extends ConversionSettings {
  constructor(options = {}) {
    super({ ...options, conversionType: ConversionType.VIDEO });
    
    // Video-specific options
    this.width = options.width || null;
    this.height = options.height || null;
    this.frameRate = options.frameRate || 30;
    this.videoBitrate = options.videoBitrate || 1000; // kbps
    this.audioBitrate = options.audioBitrate || 128; // kbps
    this.videoCodec = options.videoCodec || 'auto';
    this.audioCodec = options.audioCodec || 'auto';
    this.maintainAspectRatio = options.maintainAspectRatio !== false;
    this.trimStart = options.trimStart || 0; // seconds
    this.trimEnd = options.trimEnd || 0; // seconds
    this.includeAudio = options.includeAudio !== false;
    this.includeSubtitles = options.includeSubtitles || false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      width: this.width,
      height: this.height,
      frameRate: this.frameRate,
      videoBitrate: this.videoBitrate,
      audioBitrate: this.audioBitrate,
      videoCodec: this.videoCodec,
      audioCodec: this.audioCodec,
      maintainAspectRatio: this.maintainAspectRatio,
      trimStart: this.trimStart,
      trimEnd: this.trimEnd,
      includeAudio: this.includeAudio,
      includeSubtitles: this.includeSubtitles
    };
  }
}

/**
 * Factory function to create appropriate settings based on conversion type
 */
export function createConversionSettings(conversionType, options = {}) {
  switch (conversionType) {
    case ConversionType.DOCUMENT:
      return new DocumentConversionSettings(options);
    case ConversionType.IMAGE:
      return new ImageConversionSettings(options);
    case ConversionType.AUDIO:
      return new AudioConversionSettings(options);
    case ConversionType.VIDEO:
      return new VideoConversionSettings(options);
    default:
      return new ConversionSettings({ ...options, conversionType });
  }
}