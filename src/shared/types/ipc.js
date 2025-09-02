/**
 * IPC Channel Definitions and Types
 * Defines all communication channels between main and renderer processes
 */

// IPC Channel Names
const IPC_CHANNELS = {
  // System Information
  GET_APP_VERSION: 'get-app-version',
  GET_SYSTEM_THEME: 'get-system-theme',
  THEME_CHANGED: 'theme-changed',
  
  // File Operations
  SHOW_OPEN_DIALOG: 'show-open-dialog',
  SHOW_SAVE_DIALOG: 'show-save-dialog',
  READ_FILE: 'read-file',
  WRITE_FILE: 'write-file',
  
  // Enhanced file operations
  READ_FILE_CHUNKED: 'read-file-chunked',
  WRITE_FILE_CHUNKED: 'write-file-chunked',
  GET_FILE_INFO: 'get-file-info',
  VALIDATE_FILE: 'validate-file',
  COPY_FILE: 'copy-file',
  READ_MULTIPLE_FILES: 'read-multiple-files',
  
  // Stream operations
  CREATE_READ_STREAM: 'create-read-stream',
  CREATE_WRITE_STREAM: 'create-write-stream',
  CLOSE_STREAM: 'close-stream',
  GET_ACTIVE_STREAMS: 'get-active-streams',

  // Temporary Workspace Operations
  CREATE_WORKSPACE: 'create-workspace',
  GET_WORKSPACE: 'get-workspace',
  UPDATE_WORKSPACE_STATUS: 'update-workspace-status',
  CLEANUP_WORKSPACE: 'cleanup-workspace',
  CLEANUP_ALL_WORKSPACES: 'cleanup-all-workspaces',
  GET_ACTIVE_WORKSPACES: 'get-active-workspaces',
  GET_WORKSPACE_STATS: 'get-workspace-stats',
  GET_DISK_USAGE: 'get-disk-usage',

  // Output Management
  SELECT_OUTPUT_DIRECTORY: 'select-output-directory',
  VALIDATE_OUTPUT_DIRECTORY: 'validate-output-directory',
  GENERATE_OUTPUT_PATH: 'generate-output-path',
  PREVIEW_OUTPUT_PATHS: 'preview-output-paths',
  RESOLVE_CONFLICT: 'resolve-conflict',
  PROCESS_OUTPUT: 'process-output',
  PROCESS_BATCH_OUTPUT: 'process-batch-output',
  GET_NAMING_PATTERNS: 'get-naming-patterns',
  GET_CONFLICT_STRATEGIES: 'get-conflict-strategies',
  GET_OUTPUT_STATS: 'get-output-stats',

  // Metadata Management
  EXTRACT_METADATA: 'extract-metadata',
  PRESERVE_METADATA: 'preserve-metadata',
  CREATE_METADATA_BACKUP: 'create-metadata-backup',
  RESTORE_METADATA_BACKUP: 'restore-metadata-backup',
  COMPARE_METADATA: 'compare-metadata',
  GET_SUPPORTED_METADATA: 'get-supported-metadata',
  GET_METADATA_STATS: 'get-metadata-stats',

  // Error Handling
  EXECUTE_WITH_RETRY: 'execute-with-retry',
  START_TRANSACTION: 'start-transaction',
  COMMIT_TRANSACTION: 'commit-transaction',
  ROLLBACK_TRANSACTION: 'rollback-transaction',
  HANDLE_FILE_SYSTEM_ERROR: 'handle-file-system-error',
  CHECK_PERMISSIONS: 'check-permissions',
  GET_ERROR_HISTORY: 'get-error-history',
  GET_ACTIVE_TRANSACTIONS: 'get-active-transactions',
  GET_ERROR_HANDLING_STATS: 'get-error-handling-stats',
  CLEAR_ERROR_HISTORY: 'clear-error-history',
  
  // File Conversion
  CONVERT_FILE: 'convert-file',
  CONVERSION_PROGRESS: 'conversion-progress',
  CONVERSION_COMPLETE: 'conversion-complete',
  CONVERSION_ERROR: 'conversion-error',
  
  // Application Control
  MINIMIZE_WINDOW: 'minimize-window',
  MAXIMIZE_WINDOW: 'maximize-window',
  CLOSE_WINDOW: 'close-window',
  TOGGLE_FULLSCREEN: 'toggle-fullscreen',
  
  // Settings
  GET_SETTINGS: 'get-settings',
  UPDATE_SETTINGS: 'update-settings',
  SETTINGS_CHANGED: 'settings-changed',
  
  // User Preferences
  GET_USER_PREFERENCES: 'get-user-preferences',
  UPDATE_USER_PREFERENCE: 'update-user-preference',
  UPDATE_USER_PREFERENCES: 'update-user-preferences',
  RESET_USER_PREFERENCES: 'reset-user-preferences',
  ADD_PRESET: 'add-preset',
  REMOVE_PRESET: 'remove-preset',
  UPDATE_PRESET: 'update-preset',
  ADD_RECENT_JOB: 'add-recent-job',
  CLEAR_RECENT_JOBS: 'clear-recent-jobs',
  CHANGE_THEME: 'change-theme',
  EXPORT_PREFERENCES: 'export-preferences',
  IMPORT_PREFERENCES: 'import-preferences',
  GET_PREFERENCES_STATS: 'get-preferences-stats',
  USER_PREFERENCES_CHANGED: 'user-preferences-changed',
  PRESET_ADDED: 'preset-added',
  PRESET_REMOVED: 'preset-removed',
  PRESET_UPDATED: 'preset-updated',
  RECENT_JOB_ADDED: 'recent-job-added',
  RECENT_JOBS_CLEARED: 'recent-jobs-cleared',
  THEME_CHANGED_USER: 'theme-changed-user',
   
  // Error Handling
  ERROR_OCCURRED: 'error-occurred',
  LOG_MESSAGE: 'log-message'
};

// Message Types
const MESSAGE_TYPES = {
  REQUEST: 'request',
  RESPONSE: 'response',
  EVENT: 'event',
  ERROR: 'error'
};

// File Dialog Options
const FILE_DIALOG_TYPES = {
  OPEN: 'open',
  SAVE: 'save'
};

// Supported File Types for Conversion
const SUPPORTED_FILE_TYPES = {
  DOCUMENT: {
    extensions: ['pdf', 'docx', 'txt', 'rtf', 'odt'],
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf',
      'application/vnd.oasis.opendocument.text'
    ]
  },
  IMAGE: {
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'image/svg+xml'
    ]
  },
  AUDIO: {
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'],
    mimeTypes: [
      'audio/mpeg',
      'audio/wav',
      'audio/flac',
      'audio/aac',
      'audio/mp4',
      'audio/ogg'
    ]
  },
  VIDEO: {
    extensions: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'],
    mimeTypes: [
      'video/mp4',
      'video/x-msvideo',
      'video/quicktime',
      'video/x-ms-wmv',
      'video/x-flv',
      'video/webm'
    ]
  }
};

// Conversion Status
const CONVERSION_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// Theme Types
const THEME_TYPES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};

// Log Levels
const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

// IPC Message Structure
const createIPCMessage = (channel, type, data = null, requestId = null) => {
  return {
    channel,
    type,
    data,
    requestId: requestId || Date.now().toString(),
    timestamp: new Date().toISOString()
  };
};

// IPC Response Structure
const createIPCResponse = (requestId, success, data = null, error = null) => {
  return {
    requestId,
    success,
    data,
    error,
    timestamp: new Date().toISOString()
  };
};

// Error Types
const ERROR_TYPES = {
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CONVERSION_FAILED: 'CONVERSION_FAILED',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

module.exports = {
  IPC_CHANNELS,
  MESSAGE_TYPES,
  FILE_DIALOG_TYPES,
  SUPPORTED_FILE_TYPES,
  CONVERSION_STATUS,
  THEME_TYPES,
  LOG_LEVELS,
  createIPCMessage,
  createIPCResponse,
  ERROR_TYPES
};