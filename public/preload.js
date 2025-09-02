const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Generic IPC invoke method
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  
  // System Information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  getThemeInfo: () => ipcRenderer.invoke('get-theme-info'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  
  // File operations
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  readFile: (filePath, options) => ipcRenderer.invoke('read-file', filePath, options),
  writeFile: (filePath, content, options) => ipcRenderer.invoke('write-file', filePath, content, options),
  
  // Enhanced file operations
  getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),
  validateFile: (filePath, options) => ipcRenderer.invoke('validate-file', filePath, options),
  copyFile: (sourcePath, destPath, options) => ipcRenderer.invoke('copy-file', sourcePath, destPath, options),
  readMultipleFiles: (filePaths, options) => ipcRenderer.invoke('read-multiple-files', filePaths, options),
  
  // Streaming operations
  createReadStream: (filePath, options) => ipcRenderer.invoke('create-read-stream', filePath, options),
  createWriteStream: (filePath, options) => ipcRenderer.invoke('create-write-stream', filePath, options),
  closeStream: (streamId) => ipcRenderer.invoke('close-stream', streamId),
  getActiveStreams: () => ipcRenderer.invoke('get-active-streams'),

    // Temporary workspace operations
    createWorkspace: (options) => ipcRenderer.invoke('create-workspace', options),
    getWorkspace: (workspaceId) => ipcRenderer.invoke('get-workspace', workspaceId),
    updateWorkspaceStatus: (workspaceId, status, metadata) => ipcRenderer.invoke('update-workspace-status', workspaceId, status, metadata),
    cleanupWorkspace: (workspaceId, options) => ipcRenderer.invoke('cleanup-workspace', workspaceId, options),
    cleanupAllWorkspaces: (options) => ipcRenderer.invoke('cleanup-all-workspaces', options),
    getActiveWorkspaces: () => ipcRenderer.invoke('get-active-workspaces'),
    getWorkspaceStats: () => ipcRenderer.invoke('get-workspace-stats'),
    getDiskUsage: () => ipcRenderer.invoke('get-disk-usage'),

    // Output Management Operations
    selectOutputDirectory: (options) => ipcRenderer.invoke('select-output-directory', options),
    validateOutputDirectory: (directoryPath) => ipcRenderer.invoke('validate-output-directory', directoryPath),
    generateOutputPath: (inputPath, outputDir, pattern, variables) => ipcRenderer.invoke('generate-output-path', inputPath, outputDir, pattern, variables),
    previewOutputPaths: (inputPaths, outputDir, pattern, variables) => ipcRenderer.invoke('preview-output-paths', inputPaths, outputDir, pattern, variables),
    resolveConflict: (outputPath, strategy, options) => ipcRenderer.invoke('resolve-conflict', outputPath, strategy, options),
    processOutput: (inputPath, outputDir, pattern, variables, conflictStrategy) => ipcRenderer.invoke('process-output', inputPath, outputDir, pattern, variables, conflictStrategy),
    processBatchOutput: (inputPaths, outputDir, pattern, variables, conflictStrategy) => ipcRenderer.invoke('process-batch-output', inputPaths, outputDir, pattern, variables, conflictStrategy),
    getNamingPatterns: () => ipcRenderer.invoke('get-naming-patterns'),
    getConflictStrategies: () => ipcRenderer.invoke('get-conflict-strategies'),
    getOutputStats: () => ipcRenderer.invoke('get-output-stats'),

    // Metadata Management
    extractMetadata: (filePath, options) => ipcRenderer.invoke('extract-metadata', filePath, options),
    preserveMetadata: (metadata, targetPath, options) => ipcRenderer.invoke('preserve-metadata', metadata, targetPath, options),
    createMetadataBackup: (metadata, backupPath) => ipcRenderer.invoke('create-metadata-backup', metadata, backupPath),
    restoreMetadataBackup: (backupPath) => ipcRenderer.invoke('restore-metadata-backup', backupPath),
    compareMetadata: (metadata1, metadata2) => ipcRenderer.invoke('compare-metadata', metadata1, metadata2),
    getSupportedMetadata: () => ipcRenderer.invoke('get-supported-metadata'),
    getMetadataStats: () => ipcRenderer.invoke('get-metadata-stats'),

    // Error Handling
    startTransaction: (transactionId, options) => ipcRenderer.invoke('start-transaction', transactionId, options),
    commitTransaction: (transactionId) => ipcRenderer.invoke('commit-transaction', transactionId),
    rollbackTransaction: (transactionId, reason) => ipcRenderer.invoke('rollback-transaction', transactionId, reason),
    handleFileSystemError: (errorData, context) => ipcRenderer.invoke('handle-file-system-error', errorData, context),
    checkPermissions: (filePath, operation) => ipcRenderer.invoke('check-permissions', filePath, operation),
    getErrorHistory: (filters) => ipcRenderer.invoke('get-error-history', filters),
    getActiveTransactions: () => ipcRenderer.invoke('get-active-transactions'),
    getErrorHandlingStats: () => ipcRenderer.invoke('get-error-handling-stats'),
    clearErrorHistory: () => ipcRenderer.invoke('clear-error-history'),
  
  // File Conversion
  convertFile: (conversionOptions) => ipcRenderer.invoke('convert-file', conversionOptions),
  
  // Window Control
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.invoke('update-settings', settings),
  
  // Logging
  logMessage: (level, message, data) => ipcRenderer.invoke('log-message', level, message, data),
  
  // Auto-updater methods
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  rollbackUpdate: (version) => ipcRenderer.invoke('rollback-update', version),
  getUpdateHistory: () => ipcRenderer.invoke('get-update-history'),
  
  // Crash reporting methods
  getCrashReportingStatus: () => ipcRenderer.invoke('crash-reporting-get-status'),
  updateCrashReportingConsent: (hasConsent) => ipcRenderer.invoke('crash-reporting-update-consent', hasConsent),
  reportError: (errorData, context) => ipcRenderer.invoke('crash-reporting-report-error', errorData, context),
  addBreadcrumb: (message, data) => ipcRenderer.invoke('crash-reporting-add-breadcrumb', message, data),
  
  // Permissions methods
  getPermissionStatus: () => ipcRenderer.invoke('permissions-get-status'),
  checkAllPermissions: () => ipcRenderer.invoke('permissions-check-all'),
  requestFileSystemPermissions: () => ipcRenderer.invoke('permissions-request-file-system'),
  requestCameraPermissions: () => ipcRenderer.invoke('permissions-request-camera'),
  requestMicrophonePermissions: () => ipcRenderer.invoke('permissions-request-microphone'),
  showPermissionTroubleshooting: (permissionType) => ipcRenderer.invoke('permissions-show-troubleshooting', permissionType),
  validateFileAccess: (filePath) => ipcRenderer.invoke('permissions-validate-file-access', filePath),
  validateDirectoryWriteAccess: (dirPath) => ipcRenderer.invoke('permissions-validate-directory-write', dirPath),
  
  // Audio conversion methods
  initializeAudioConversion: () => ipcRenderer.invoke('audio-conversion-initialize'),
  getSupportedAudioFormats: () => ipcRenderer.invoke('audio-conversion-get-supported-formats'),
  getDefaultAudioSettings: () => ipcRenderer.invoke('audio-conversion-get-default-settings'),
  getAudioInfo: (filePath) => ipcRenderer.invoke('audio-conversion-get-audio-info', filePath),
  convertAudio: (inputPath, outputPath, options) => ipcRenderer.invoke('audio-conversion-convert', inputPath, outputPath, options),
  
  // Event Listeners
  onThemeChanged: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('theme-changed', listener);
    return () => ipcRenderer.removeListener('theme-changed', listener);
  },
  
  onSettingsChanged: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('settings-changed', listener);
    return () => ipcRenderer.removeListener('settings-changed', listener);
  },
  
  onConversionProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('conversion-progress', listener);
    return () => ipcRenderer.removeListener('conversion-progress', listener);
  },
  
  onConversionComplete: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('conversion-complete', listener);
    return () => ipcRenderer.removeListener('conversion-complete', listener);
  },
  
  onConversionError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('conversion-error', listener);
    return () => ipcRenderer.removeListener('conversion-error', listener);
  },
  
  onError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('error-occurred', listener);
    return () => ipcRenderer.removeListener('error-occurred', listener);
  },
  
  // Menu event listeners (legacy support)
  onMenuNewConversion: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('menu-new-conversion', listener);
    return () => ipcRenderer.removeListener('menu-new-conversion', listener);
  },
  
  onMenuOpenFiles: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('menu-open-files', listener);
    return () => ipcRenderer.removeListener('menu-open-files', listener);
  },
  
  onMenuPreferences: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('menu-preferences', listener);
    return () => ipcRenderer.removeListener('menu-preferences', listener);
  },
  
  onMenuAbout: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('menu-about', listener);
    return () => ipcRenderer.removeListener('menu-about', listener);
  },
  
  // Update event listeners
  on: (channel, callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});