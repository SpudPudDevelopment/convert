/**
 * Renderer Process IPC Service
 * Provides a clean API for renderer process to communicate with main process
 */

import {
  IPC_CHANNELS,
  createIPCMessage,
  MESSAGE_TYPES,
  LOG_LEVELS,
  ERROR_TYPES
} from '../types/ipc.js';

class RendererIPCService {
  constructor() {
    this.eventListeners = new Map();
    this.pendingRequests = new Map();
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for IPC events from main process
   */
  setupEventListeners() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Listen for theme changes
      window.electronAPI.onThemeChanged((themeData) => {
        this.emit('theme-changed', themeData);
      });

      // Listen for settings changes
      window.electronAPI.onSettingsChanged((settings) => {
        this.emit('settings-changed', settings);
      });

      // Listen for conversion progress
      window.electronAPI.onConversionProgress((progress) => {
        this.emit('conversion-progress', progress);
      });

      // Listen for conversion complete
      window.electronAPI.onConversionComplete((result) => {
        this.emit('conversion-complete', result);
      });

      // Listen for conversion errors
      window.electronAPI.onConversionError((error) => {
        this.emit('conversion-error', error);
      });

      // Listen for general errors
      window.electronAPI.onError((error) => {
        this.emit('error', error);
      });
    }
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Send IPC message to main process
   * @param {string} channel - IPC channel
   * @param {*} data - Data to send
   * @returns {Promise} Response from main process
   */
  async invoke(channel, data = null) {
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const response = await window.electronAPI.invoke(channel, data);
      
      if (!response.success) {
        throw new Error(response.error?.message || 'IPC request failed');
      }

      return response.data;
    } catch (error) {
      this.logError('IPC invoke failed', { channel, error: error.message });
      throw error;
    }
  }

  // System Information Methods
  async getAppVersion() {
    return this.invoke(IPC_CHANNELS.GET_APP_VERSION);
  }

  async getSystemTheme() {
    return this.invoke(IPC_CHANNELS.GET_SYSTEM_THEME);
  }

  // File Operation Methods
  async showOpenDialog(options = {}) {
    return this.invoke(IPC_CHANNELS.SHOW_OPEN_DIALOG, options);
  }

  async showSaveDialog(options = {}) {
    return this.invoke(IPC_CHANNELS.SHOW_SAVE_DIALOG, options);
  }

  async readFile(filePath) {
    return this.invoke(IPC_CHANNELS.READ_FILE, filePath);
  }

  async writeFile(filePath, data, options = {}) {
    return this.invoke(IPC_CHANNELS.WRITE_FILE, { filePath, data, options });
  }

  /**
   * Get file information
   * @param {string} filePath - File path
   * @returns {Promise<Object>} File information
   */
  async getFileInfo(filePath) {
    return this.invoke(IPC_CHANNELS.GET_FILE_INFO, filePath);
  }

  /**
   * Validate file
   * @param {string} filePath - File path
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateFile(filePath, options = {}) {
    return this.invoke(IPC_CHANNELS.VALIDATE_FILE, { filePath, options });
  }

  /**
   * Copy file
   * @param {string} sourcePath - Source file path
   * @param {string} destPath - Destination file path
   * @param {Object} options - Copy options
   * @returns {Promise<Object>} Copy result
   */
  async copyFile(sourcePath, destPath, options = {}) {
    return this.invoke(IPC_CHANNELS.COPY_FILE, { sourcePath, destPath, options });
  }

  /**
   * Read multiple files
   * @param {string[]} filePaths - Array of file paths
   * @param {Object} options - Read options
   * @returns {Promise<Object>} Read results
   */
  async readMultipleFiles(filePaths, options = {}) {
    return this.invoke(IPC_CHANNELS.READ_MULTIPLE_FILES, { filePaths, options });
  }

  /**
   * Create read stream
   * @param {string} filePath - File path
   * @param {Object} options - Stream options
   * @returns {Promise<Object>} Stream information
   */
  async createReadStream(filePath, options = {}) {
    return this.invoke(IPC_CHANNELS.CREATE_READ_STREAM, { filePath, options });
  }

  /**
   * Create write stream
   * @param {string} filePath - File path
   * @param {Object} options - Stream options
   * @returns {Promise<Object>} Stream information
   */
  async createWriteStream(filePath, options = {}) {
    return this.invoke(IPC_CHANNELS.CREATE_WRITE_STREAM, { filePath, options });
  }

  /**
   * Close stream
   * @param {string} streamId - Stream ID
   * @returns {Promise<Object>} Close result
   */
  async closeStream(streamId) {
    return this.invoke(IPC_CHANNELS.CLOSE_STREAM, streamId);
  }

  /**
   * Get active streams
   * @returns {Promise<Object>} Active streams information
   */
  async getActiveStreams() {
    return await this.invoke(IPC_CHANNELS.GET_ACTIVE_STREAMS);
  }

  // Temporary Workspace Operations

  /**
   * Create a new temporary workspace
   * @param {Object} options - Workspace creation options
   * @returns {Promise<Object>} Workspace creation result
   */
  async createWorkspace(options = {}) {
    return await this.invoke(IPC_CHANNELS.CREATE_WORKSPACE, options);
  }

  /**
   * Get workspace information
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} Workspace information
   */
  async getWorkspace(workspaceId) {
    return await this.invoke(IPC_CHANNELS.GET_WORKSPACE, workspaceId);
  }

  /**
   * Update workspace status
   * @param {string} workspaceId - Workspace ID
   * @param {string} status - New status
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Update result
   */
  async updateWorkspaceStatus(workspaceId, status, metadata = {}) {
    return await this.invoke(IPC_CHANNELS.UPDATE_WORKSPACE_STATUS, workspaceId, status, metadata);
  }

  /**
   * Clean up a specific workspace
   * @param {string} workspaceId - Workspace ID
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupWorkspace(workspaceId, options = {}) {
    return await this.invoke(IPC_CHANNELS.CLEANUP_WORKSPACE, workspaceId, options);
  }

  /**
   * Clean up all workspaces
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupAllWorkspaces(options = {}) {
    return await this.invoke(IPC_CHANNELS.CLEANUP_ALL_WORKSPACES, options);
  }

  /**
   * Get all active workspaces
   * @returns {Promise<Object>} Active workspaces list
   */
  async getActiveWorkspaces() {
    return await this.invoke(IPC_CHANNELS.GET_ACTIVE_WORKSPACES);
  }

  /**
   * Get workspace statistics
   * @returns {Promise<Object>} Workspace statistics
   */
  async getWorkspaceStats() {
    return await this.invoke(IPC_CHANNELS.GET_WORKSPACE_STATS);
  }

  /**
   * Get disk usage information
   * @returns {Promise<Object>} Disk usage stats
   */
  async getDiskUsage() {
    return await this.invoke(IPC_CHANNELS.GET_DISK_USAGE);
  }

  // Job Management Operations

  /**
   * Retry a failed job
   * @param {string} jobId - Job ID to retry
   * @param {Object} options - Retry options
   * @returns {Promise<Object>} Retry result
   */
  async retryJob(jobId, options = {}) {
    return await this.invoke('retryJob', jobId, options);
  }

  /**
   * Cancel a job
   * @param {string} jobId - Job ID to cancel
   * @returns {Promise<Object>} Cancel result
   */
  async cancelJob(jobId) {
    return await this.invoke('cancelJob', jobId);
  }

  /**
   * Pause a job
   * @param {string} jobId - Job ID to pause
   * @returns {Promise<Object>} Pause result
   */
  async pauseJob(jobId) {
    return await this.invoke('pauseJob', jobId);
  }

  /**
   * Resume a paused job
   * @param {string} jobId - Job ID to resume
   * @returns {Promise<Object>} Resume result
   */
  async resumeJob(jobId) {
    return await this.invoke('resumeJob', jobId);
  }

  /**
   * Get job status
   * @param {string} jobId - Job ID
   * @returns {Promise<Object>} Job status
   */
  async getJobStatus(jobId) {
    return await this.invoke('getJobStatus', jobId);
  }

  /**
   * Get all jobs
   * @returns {Promise<Object>} All jobs
   */
  async getAllJobs() {
    return await this.invoke('getAllJobs');
  }

  // Output Management Operations
  async selectOutputDirectory() {
    return await this.invoke(IPC_CHANNELS.SELECT_OUTPUT_DIRECTORY);
  }

  async validateOutputDirectory(directoryPath) {
    return await this.invoke(IPC_CHANNELS.VALIDATE_OUTPUT_DIRECTORY, directoryPath);
  }

  async generateOutputPath(inputPath, outputDir, pattern, variables) {
    return await this.invoke(IPC_CHANNELS.GENERATE_OUTPUT_PATH, inputPath, outputDir, pattern, variables);
  }

  async previewOutputPaths(inputPaths, outputDir, pattern, variables) {
    return await this.invoke(IPC_CHANNELS.PREVIEW_OUTPUT_PATHS, inputPaths, outputDir, pattern, variables);
  }

  async resolveConflict(outputPath, strategy, options) {
    return await this.invoke(IPC_CHANNELS.RESOLVE_CONFLICT, outputPath, strategy, options);
  }

  async processOutput(inputPath, outputDir, pattern, variables, conflictStrategy) {
    return await this.invoke(IPC_CHANNELS.PROCESS_OUTPUT, inputPath, outputDir, pattern, variables, conflictStrategy);
  }

  async processBatchOutput(inputPaths, outputDir, pattern, variables, conflictStrategy) {
    return await this.invoke(IPC_CHANNELS.PROCESS_BATCH_OUTPUT, inputPaths, outputDir, pattern, variables, conflictStrategy);
  }

  async getNamingPatterns() {
    return await this.invoke(IPC_CHANNELS.GET_NAMING_PATTERNS);
  }

  async getConflictStrategies() {
    return await this.invoke(IPC_CHANNELS.GET_CONFLICT_STRATEGIES);
  }

  async getOutputStats() {
    return await this.invoke(IPC_CHANNELS.GET_OUTPUT_STATS);
  }

  // Metadata Management Methods

  // Extract metadata from file
  async extractMetadata(filePath, options = {}) {
    return await this.invoke(IPC_CHANNELS.EXTRACT_METADATA, { filePath, options });
  }

  // Preserve metadata to target file
  async preserveMetadata(metadata, targetPath, options = {}) {
    return await this.invoke(IPC_CHANNELS.PRESERVE_METADATA, { metadata, targetPath, options });
  }

  // Create metadata backup
  async createMetadataBackup(metadata, backupPath) {
    return await this.invoke(IPC_CHANNELS.CREATE_METADATA_BACKUP, { metadata, backupPath });
  }

  // Restore metadata from backup
  async restoreMetadataBackup(backupPath) {
    return await this.invoke(IPC_CHANNELS.RESTORE_METADATA_BACKUP, backupPath);
  }

  // Compare metadata between files
  async compareMetadata(metadata1, metadata2) {
    return await this.invoke(IPC_CHANNELS.COMPARE_METADATA, { metadata1, metadata2 });
  }

  // Get supported metadata types
  async getSupportedMetadata() {
    return await this.invoke(IPC_CHANNELS.GET_SUPPORTED_METADATA);
  }

  // Get metadata service statistics
  async getMetadataStats() {
    return await this.invoke(IPC_CHANNELS.GET_METADATA_STATS);
  }

  // Error Handling Methods

  // Start transaction
  async startTransaction(transactionId, options = {}) {
    return await this.invoke(IPC_CHANNELS.START_TRANSACTION, { transactionId, options });
  }

  // Commit transaction
  async commitTransaction(transactionId) {
    return await this.invoke(IPC_CHANNELS.COMMIT_TRANSACTION, transactionId);
  }

  // Rollback transaction
  async rollbackTransaction(transactionId, reason) {
    return await this.invoke(IPC_CHANNELS.ROLLBACK_TRANSACTION, { transactionId, reason });
  }

  // Handle file system error
  async handleFileSystemError(errorData, context = {}) {
    return await this.invoke(IPC_CHANNELS.HANDLE_FILE_SYSTEM_ERROR, { errorData, context });
  }

  // Check file permissions
  async checkPermissions(filePath, operation = 'read') {
    return await this.invoke(IPC_CHANNELS.CHECK_PERMISSIONS, { filePath, operation });
  }

  // Get error history
  async getErrorHistory(filters = {}) {
    return await this.invoke(IPC_CHANNELS.GET_ERROR_HISTORY, filters);
  }

  // Get active transactions
  async getActiveTransactions() {
    return await this.invoke(IPC_CHANNELS.GET_ACTIVE_TRANSACTIONS);
  }

  // Get error handling statistics
  async getErrorHandlingStats() {
    return await this.invoke(IPC_CHANNELS.GET_ERROR_HANDLING_STATS);
  }

  // Clear error history
  async clearErrorHistory() {
    return await this.invoke(IPC_CHANNELS.CLEAR_ERROR_HISTORY);
  }

  // File Conversion Methods
  async convertFile(conversionOptions) {
    return this.invoke(IPC_CHANNELS.CONVERT_FILE, conversionOptions);
  }

  // Window Control Methods
  async minimizeWindow() {
    return this.invoke(IPC_CHANNELS.MINIMIZE_WINDOW);
  }

  async maximizeWindow() {
    return this.invoke(IPC_CHANNELS.MAXIMIZE_WINDOW);
  }

  async closeWindow() {
    return this.invoke(IPC_CHANNELS.CLOSE_WINDOW);
  }

  async toggleFullscreen() {
    return this.invoke(IPC_CHANNELS.TOGGLE_FULLSCREEN);
  }

  // Settings Methods
  async getSettings() {
    return this.invoke(IPC_CHANNELS.GET_SETTINGS);
  }

  async updateSettings(settings) {
    return this.invoke(IPC_CHANNELS.UPDATE_SETTINGS, settings);
  }

  // Logging Methods
  async logMessage(level, message, data = null) {
    try {
      await this.invoke(IPC_CHANNELS.LOG_MESSAGE, { level, message, data });
    } catch (error) {
      console.error('Failed to log message to main process:', error);
    }
  }

  async logDebug(message, data = null) {
    return this.logMessage(LOG_LEVELS.DEBUG, message, data);
  }

  async logInfo(message, data = null) {
    return this.logMessage(LOG_LEVELS.INFO, message, data);
  }

  async logWarn(message, data = null) {
    return this.logMessage(LOG_LEVELS.WARN, message, data);
  }

  async logError(message, data = null) {
    return this.logMessage(LOG_LEVELS.ERROR, message, data);
  }

  // Utility Methods
  isElectronAvailable() {
    return typeof window !== 'undefined' && window.electronAPI;
  }

  /**
   * Create a file filter for dialogs
   * @param {string} name - Filter name
   * @param {string[]} extensions - File extensions
   * @returns {Object} File filter object
   */
  createFileFilter(name, extensions) {
    return {
      name,
      extensions: extensions.map(ext => ext.replace('.', ''))
    };
  }

  /**
   * Get common file filters
   * @returns {Object} Common file filters
   */
  getCommonFileFilters() {
    return {
      all: this.createFileFilter('All Files', ['*']),
      documents: this.createFileFilter('Documents', ['pdf', 'docx', 'txt', 'rtf', 'odt']),
      images: this.createFileFilter('Images', ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']),
      audio: this.createFileFilter('Audio', ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg']),
      video: this.createFileFilter('Video', ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'])
    };
  }

  /**
   * Validate file type
   * @param {string} filePath - File path
   * @param {string[]} allowedExtensions - Allowed extensions
   * @returns {boolean} Is valid file type
   */
  validateFileType(filePath, allowedExtensions) {
    if (!filePath || !allowedExtensions) return false;
    
    const extension = filePath.split('.').pop()?.toLowerCase();
    return allowedExtensions.includes(extension);
  }

  /**
   * Get file extension
   * @param {string} filePath - File path
   * @returns {string} File extension
   */
  getFileExtension(filePath) {
    if (!filePath) return '';
    return filePath.split('.').pop()?.toLowerCase() || '';
  }

  /**
   * Get file name without extension
   * @param {string} filePath - File path
   * @returns {string} File name without extension
   */
  getFileNameWithoutExtension(filePath) {
    if (!filePath) return '';
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
    return fileName?.split('.').slice(0, -1).join('.') || '';
  }

  /**
   * Format file size
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Cleanup service
   */
  cleanup() {
    this.eventListeners.clear();
    this.pendingRequests.clear();
  }
}

// Create singleton instance
const rendererIPCService = new RendererIPCService();

export default rendererIPCService;
export { RendererIPCService };