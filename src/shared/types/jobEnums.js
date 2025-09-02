/**
 * Enums for conversion job management system
 */

/**
 * Job status enumeration
 * Represents the current state of a conversion job
 */
export const JobStatus = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused'
};

/**
 * Job priority levels
 */
export const JobPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent'
};

/**
 * Conversion type categories
 */
export const ConversionType = {
  DOCUMENT: 'document',
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video'
};

/**
 * Document format types
 */
export const DocumentFormat = {
  PDF: 'pdf',
  DOCX: 'docx',
  DOC: 'doc',
  TXT: 'txt',
  RTF: 'rtf',
  ODT: 'odt',
  HTML: 'html',
  MARKDOWN: 'md'
};

/**
 * Image format types
 */
export const ImageFormat = {
  JPEG: 'jpeg',
  JPG: 'jpg',
  PNG: 'png',
  GIF: 'gif',
  BMP: 'bmp',
  TIFF: 'tiff',
  WEBP: 'webp',
  SVG: 'svg',
  ICO: 'ico'
};

/**
 * Audio format types
 */
export const AudioFormat = {
  MP3: 'mp3',
  WAV: 'wav',
  FLAC: 'flac',
  AAC: 'aac',
  OGG: 'ogg',
  M4A: 'm4a',
  WMA: 'wma'
};

/**
 * Video format types
 */
export const VideoFormat = {
  MP4: 'mp4',
  AVI: 'avi',
  MOV: 'mov',
  WMV: 'wmv',
  FLV: 'flv',
  MKV: 'mkv',
  WEBM: 'webm',
  M4V: 'm4v'
};

/**
 * Job event types for notifications
 */
export const JobEventType = {
  CREATED: 'created',
  STARTED: 'started',
  PROGRESS_UPDATED: 'progress_updated',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
  RESUMED: 'resumed'
};

/**
 * Error types for job failures
 */
export const JobErrorType = {
  FILE_NOT_FOUND: 'file_not_found',
  INVALID_FORMAT: 'invalid_format',
  CONVERSION_FAILED: 'conversion_failed',
  INSUFFICIENT_SPACE: 'insufficient_space',
  PERMISSION_DENIED: 'permission_denied',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown'
};

/**
 * Helper functions to validate enum values
 */
export const isValidJobStatus = (status) => {
  return Object.values(JobStatus).includes(status);
};

export const isValidConversionType = (type) => {
  return Object.values(ConversionType).includes(type);
};

export const isValidJobPriority = (priority) => {
  return Object.values(JobPriority).includes(priority);
};

export const isValidJobEventType = (eventType) => {
  return Object.values(JobEventType).includes(eventType);
};

export const isValidJobErrorType = (errorType) => {
  return Object.values(JobErrorType).includes(errorType);
};

/**
 * Get all supported formats for a conversion type
 */
export const getSupportedFormats = (conversionType) => {
  switch (conversionType) {
    case ConversionType.DOCUMENT:
      return Object.values(DocumentFormat);
    case ConversionType.IMAGE:
      return Object.values(ImageFormat);
    case ConversionType.AUDIO:
      return Object.values(AudioFormat);
    case ConversionType.VIDEO:
      return Object.values(VideoFormat);
    default:
      return [];
  }
};