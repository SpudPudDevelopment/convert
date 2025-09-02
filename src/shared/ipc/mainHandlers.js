/**
 * Main Process IPC Handlers
 * Handles IPC communication from the main process side
 */

const { ipcMain, dialog, shell, app, nativeTheme } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { IPC_CHANNELS, createIPCResponse, THEME_TYPES } = require('../types/ipc.js');
const { logger } = require('../utils/logger.js');
const { validateFilePath, sanitizeFilePath } = require('../utils/ipcUtils');
const fileStreamService = require('../services/fileStreamService');
const { TempWorkspaceService } = require('../services/tempWorkspaceService');
const { OutputManagementService } = require('../services/outputManagementService');
const MetadataService = require('../services/metadataService');
const ErrorHandlingService = require('../services/errorHandlingService');
const { UserPreferencesManager } = require('../services/UserPreferencesManager');

// Initialize services
const tempWorkspaceService = new TempWorkspaceService();
const outputManagementService = new OutputManagementService();
const metadataService = new MetadataService();
const errorHandlingService = new ErrorHandlingService();
const userPreferencesManager = new UserPreferencesManager();

/**
 * Register all IPC handlers for the main process
 * @param {BrowserWindow} mainWindow - The main application window
 */
function registerMainHandlers(mainWindow) {
  // Store reference to main window
  let window = mainWindow;
  
  // System Information Handlers
  setupSystemHandlers();
  
  // File Operation Handlers
  setupFileHandlers();
  
  // Window Control Handlers
  setupWindowHandlers();
  
  // Theme Handlers
  setupThemeHandlers(window);
  
  // Settings Handlers
  setupSettingsHandlers();
  
  // User Preferences Handlers
  setupUserPreferencesHandlers();
  
  // Error Handling
  setupErrorHandlers();
  
  console.log('IPC handlers initialized successfully');
};

/**
 * Setup system information handlers
 */
const setupSystemHandlers = () => {
  // System Information Handlers
  ipcMain.handle('get-app-version', () => {
    try {
      return {
        success: true,
        data: app.getVersion()
      };
    } catch (error) {
      return {
        success: false,
        error: {
          type: ERROR_TYPES.SYSTEM_ERROR,
          message: 'Failed to get app version',
          details: error.message
        }
      };
    }
  });

  // File conversion handler
  ipcMain.handle(IPC_CHANNELS.CONVERT_FILE, async (event, conversionOptions) => {
    try {
      const {
        jobs,
        outputConfig,
        batchSettings = {},
        preset,
        signal,
        progressCallback
      } = conversionOptions;

      // Import UnifiedConversionService
      const { unifiedConversionService } = require('../services/UnifiedConversionService');
      const { ConversionPresetManager } = require('../services/ConversionPresetManager');
      
      const presetManager = new ConversionPresetManager();

      // Apply preset settings if a preset is selected
      let finalJobs = [...jobs];
      if (preset && preset.id) {
        const presetData = await presetManager.getPreset(preset.id);
        if (presetData) {
          finalJobs = jobs.map(job => ({
            ...job,
            settings: { ...job.settings, ...presetData.settings }
          }));
        }
      }

      // Perform unified conversion
      const result = await unifiedConversionService.convertFiles({
        jobs: finalJobs,
        outputConfig,
        batchSettings,
        preset,
        signal,
        progressCallback
      });

      return createIPCResponse(null, result.success, result);

    } catch (error) {
      logger.error('File conversion error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'CONVERSION_ERROR'
      }, false);
    }
  });
  
  // Job management handlers
  ipcMain.handle('retryJob', async (event, jobId, options = {}) => {
    try {
      // Import QueueManager
      const { QueueManager } = require('../services/QueueManager');
      
      // Get the global queue manager instance
      const queueManager = global.queueManager || new QueueManager();
      
      // Re-queue the job
      const result = await queueManager.reQueueJob(jobId, options);
      
      return createIPCResponse(null, result.success, result);
      
    } catch (error) {
      logger.error('Job re-queue error:', error);
      return createIPCResponse(null, false, {
        error: error.message,
        code: 'REQUEUE_ERROR'
      });
    }
  });
  
  // Enhanced file operations
  ipcMain.handle(IPC_CHANNELS.GET_FILE_INFO, async (event, filePath) => {
    try {
      if (!validateFilePath(filePath)) {
        throw new Error('Invalid file path');
      }
      
      const sanitizedPath = sanitizeFilePath(filePath);
      const fileInfo = await fileStreamService.getFileInfo(sanitizedPath);
      
      return createIPCResponse(null, true, fileInfo);
    } catch (error) {
      logger.error('Get file info error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'FILE_INFO_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.VALIDATE_FILE, async (event, filePath, options = {}) => {
    try {
      if (!validateFilePath(filePath)) {
        throw new Error('Invalid file path');
      }
      
      const sanitizedPath = sanitizeFilePath(filePath);
      const validation = await fileStreamService.validateFile(sanitizedPath, options);
      
      return createIPCResponse(null, true, validation);
    } catch (error) {
      logger.error('File validation error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'VALIDATION_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.COPY_FILE, async (event, sourcePath, destPath, options = {}) => {
    try {
      if (!validateFilePath(sourcePath) || !validateFilePath(destPath)) {
        throw new Error('Invalid file path');
      }
      
      const sanitizedSource = sanitizeFilePath(sourcePath);
      const sanitizedDest = sanitizeFilePath(destPath);
      
      const result = await fileStreamService.copyFile(sanitizedSource, sanitizedDest, options);
      
      return createIPCResponse(null, true, result);
    } catch (error) {
      logger.error('File copy error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'COPY_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.READ_MULTIPLE_FILES, async (event, filePaths, options = {}) => {
    try {
      if (!Array.isArray(filePaths)) {
        throw new Error('File paths must be an array');
      }
      
      const results = [];
      const errors = [];
      
      for (const filePath of filePaths) {
        try {
          if (!validateFilePath(filePath)) {
            throw new Error(`Invalid file path: ${filePath}`);
          }
          
          const sanitizedPath = sanitizeFilePath(filePath);
          const content = await fileStreamService.readFileChunked(sanitizedPath, options);
          const fileInfo = await fileStreamService.getFileInfo(sanitizedPath);
          
          results.push({
            filePath: sanitizedPath,
            content: options.encoding === 'binary' ? content.toString('base64') : content,
            ...fileInfo
          });
        } catch (error) {
          errors.push({
            filePath,
            error: error.message
          });
        }
      }
      
      return createIPCResponse(null, true, {
        results,
        errors,
        totalFiles: filePaths.length,
        successCount: results.length,
        errorCount: errors.length
      });
    } catch (error) {
      logger.error('Read multiple files error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'MULTI_READ_ERROR'
      }, false);
    }
  });

  // Streaming operations
  ipcMain.handle(IPC_CHANNELS.CREATE_READ_STREAM, async (event, filePath, options = {}) => {
    try {
      if (!validateFilePath(filePath)) {
        throw new Error('Invalid file path');
      }
      
      const sanitizedPath = sanitizeFilePath(filePath);
      const streamInfo = await fileStreamService.createReadStream(sanitizedPath, options);
      
      return createIPCResponse(null, true, streamInfo);
    } catch (error) {
      logger.error('Create read stream error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'STREAM_CREATE_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CREATE_WRITE_STREAM, async (event, filePath, options = {}) => {
    try {
      if (!validateFilePath(filePath)) {
        throw new Error('Invalid file path');
      }
      
      const sanitizedPath = sanitizeFilePath(filePath);
      const streamInfo = await fileStreamService.createWriteStream(sanitizedPath, options);
      
      return createIPCResponse(null, true, streamInfo);
    } catch (error) {
      logger.error('Create write stream error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'STREAM_CREATE_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLOSE_STREAM, async (event, streamId) => {
    try {
      const success = fileStreamService.closeStream(streamId);
      
      return createIPCResponse(null, true, {
        streamId,
        closed: success
      });
    } catch (error) {
      logger.error('Close stream error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'STREAM_CLOSE_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_STREAMS, async (event) => {
    try {
      const streams = fileStreamService.getActiveStreams();
      
      return createIPCResponse(null, true, {
        streams,
        count: streams.length
      });
    } catch (error) {
      logger.error('Get active streams error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'STREAM_LIST_ERROR'
      }, false);
    }
  });

  // Temporary Workspace Operations
  ipcMain.handle(IPC_CHANNELS.CREATE_WORKSPACE, async (event, options = {}) => {
    try {
      return await tempWorkspaceService.createWorkspace(options);
    } catch (error) {
      logger.error('Create workspace error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'WORKSPACE_CREATE_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE, async (event, workspaceId) => {
    try {
      return await tempWorkspaceService.getWorkspace(workspaceId);
    } catch (error) {
      logger.error('Get workspace error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'WORKSPACE_GET_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_WORKSPACE_STATUS, async (event, workspaceId, status, metadata = {}) => {
    try {
      return await tempWorkspaceService.updateWorkspaceStatus(workspaceId, status, metadata);
    } catch (error) {
      logger.error('Update workspace status error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'WORKSPACE_UPDATE_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLEANUP_WORKSPACE, async (event, workspaceId, options = {}) => {
    try {
      return await tempWorkspaceService.cleanupWorkspace(workspaceId, options);
    } catch (error) {
      logger.error('Cleanup workspace error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'WORKSPACE_CLEANUP_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLEANUP_ALL_WORKSPACES, async (event, options = {}) => {
    try {
      return await tempWorkspaceService.cleanupAllWorkspaces(options);
    } catch (error) {
      logger.error('Cleanup all workspaces error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'WORKSPACE_CLEANUP_ALL_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_WORKSPACES, async () => {
    try {
      const workspaces = tempWorkspaceService.getActiveWorkspaces();
      return createIPCResponse(null, true, {
        workspaces,
        count: workspaces.length
      });
    } catch (error) {
      logger.error('Get active workspaces error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'WORKSPACE_LIST_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE_STATS, async () => {
    try {
      const stats = tempWorkspaceService.getStats();
      return createIPCResponse(null, true, stats);
    } catch (error) {
      logger.error('Get workspace stats error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'WORKSPACE_STATS_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_DISK_USAGE, async () => {
    try {
      return await tempWorkspaceService.getDiskUsage();
    } catch (error) {
      logger.error('Get disk usage error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'DISK_USAGE_ERROR'
      }, false);
    }
  });

  // Output Management Operations
  ipcMain.handle(IPC_CHANNELS.SELECT_OUTPUT_DIRECTORY, async (event, options = {}) => {
    try {
      return await outputManagementService.selectOutputDirectory(options);
    } catch (error) {
      logger.error('Select output directory error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'OUTPUT_DIRECTORY_SELECT_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.VALIDATE_OUTPUT_DIRECTORY, async (event, directoryPath) => {
    try {
      return await outputManagementService.validateOutputDirectory(directoryPath);
    } catch (error) {
      logger.error('Validate output directory error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'OUTPUT_DIRECTORY_VALIDATE_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GENERATE_OUTPUT_PATH, async (event, inputPath, outputDir, pattern, variables) => {
    try {
      return await outputManagementService.generateOutputPath(inputPath, outputDir, pattern, variables);
    } catch (error) {
      logger.error('Generate output path error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'OUTPUT_PATH_GENERATE_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PREVIEW_OUTPUT_PATHS, async (event, inputPaths, outputDir, pattern, variables) => {
    try {
      return await outputManagementService.previewOutputPaths(inputPaths, outputDir, pattern, variables);
    } catch (error) {
      logger.error('Preview output paths error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'OUTPUT_PATHS_PREVIEW_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.RESOLVE_CONFLICT, async (event, outputPath, strategy, options) => {
    try {
      return await outputManagementService.resolveConflict(outputPath, strategy, options);
    } catch (error) {
      logger.error('Resolve conflict error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'CONFLICT_RESOLVE_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROCESS_OUTPUT, async (event, inputPath, outputDir, pattern, variables, conflictStrategy) => {
    try {
      return await outputManagementService.processOutput(inputPath, outputDir, pattern, variables, conflictStrategy);
    } catch (error) {
      logger.error('Process output error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'OUTPUT_PROCESS_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROCESS_BATCH_OUTPUT, async (event, inputPaths, outputDir, pattern, variables, conflictStrategy) => {
    try {
      return await outputManagementService.processBatchOutput(inputPaths, outputDir, pattern, variables, conflictStrategy);
    } catch (error) {
      logger.error('Process batch output error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'BATCH_OUTPUT_PROCESS_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_NAMING_PATTERNS, async () => {
    try {
      return outputManagementService.getNamingPatterns();
    } catch (error) {
      logger.error('Get naming patterns error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'NAMING_PATTERNS_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_CONFLICT_STRATEGIES, async () => {
    try {
      return outputManagementService.getConflictStrategies();
    } catch (error) {
      logger.error('Get conflict strategies error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'CONFLICT_STRATEGIES_ERROR'
      }, false);
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_OUTPUT_STATS, async () => {
    try {
      return outputManagementService.getStats();
    } catch (error) {
      logger.error('Get output stats error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'OUTPUT_STATS_ERROR'
      }, false);
    }
  });

  // Metadata Service Handlers

  // Extract metadata from file
  ipcMain.handle(IPC_CHANNELS.EXTRACT_METADATA, async (event, filePath, options = {}) => {
    try {
      logger.info('Extracting metadata', { filePath });
      return await metadataService.extractMetadata(filePath, options);
    } catch (error) {
      logger.error('Failed to extract metadata', { filePath, error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'METADATA_EXTRACT_ERROR'
      }, false);
    }
  });

  // Preserve metadata to target file
  ipcMain.handle(IPC_CHANNELS.PRESERVE_METADATA, async (event, metadata, targetPath, options = {}) => {
    try {
      logger.info('Preserving metadata', { targetPath });
      return await metadataService.preserveMetadata(metadata, targetPath, options);
    } catch (error) {
      logger.error('Failed to preserve metadata', { targetPath, error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'METADATA_PRESERVE_ERROR'
      }, false);
    }
  });

  // Create metadata backup
  ipcMain.handle(IPC_CHANNELS.CREATE_METADATA_BACKUP, async (event, metadata, backupPath) => {
    try {
      logger.info('Creating metadata backup', { backupPath });
      return await metadataService.createMetadataBackup(metadata, backupPath);
    } catch (error) {
      logger.error('Failed to create metadata backup', { backupPath, error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'METADATA_BACKUP_ERROR'
      }, false);
    }
  });

  // Restore metadata from backup
  ipcMain.handle(IPC_CHANNELS.RESTORE_METADATA_BACKUP, async (event, backupPath) => {
    try {
      logger.info('Restoring metadata backup', { backupPath });
      return await metadataService.restoreMetadataBackup(backupPath);
    } catch (error) {
      logger.error('Failed to restore metadata backup', { backupPath, error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'METADATA_RESTORE_ERROR'
      }, false);
    }
  });

  // Compare metadata between files
  ipcMain.handle(IPC_CHANNELS.COMPARE_METADATA, async (event, metadata1, metadata2) => {
    try {
      logger.info('Comparing metadata');
      return metadataService.compareMetadata(metadata1, metadata2);
    } catch (error) {
      logger.error('Failed to compare metadata', { error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'METADATA_COMPARE_ERROR'
      }, false);
    }
  });

  // Get supported metadata types
  ipcMain.handle(IPC_CHANNELS.GET_SUPPORTED_METADATA, async () => {
    try {
      logger.info('Getting supported metadata types');
      return metadataService.getSupportedMetadata();
    } catch (error) {
      logger.error('Failed to get supported metadata', { error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'METADATA_SUPPORTED_ERROR'
      }, false);
    }
  });

  // Get metadata service statistics
  ipcMain.handle(IPC_CHANNELS.GET_METADATA_STATS, async () => {
    try {
      logger.info('Getting metadata service statistics');
      return metadataService.getStats();
    } catch (error) {
      logger.error('Failed to get metadata statistics', { error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'METADATA_STATS_ERROR'
      }, false);
    }
  });

  // Error Handling Service Handlers

  // Start transaction
  ipcMain.handle(IPC_CHANNELS.START_TRANSACTION, async (event, transactionId, options = {}) => {
    try {
      logger.info('Starting transaction', { transactionId });
      return await errorHandlingService.startTransaction(transactionId, options);
    } catch (error) {
      logger.error('Failed to start transaction', { transactionId, error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'TRANSACTION_START_ERROR'
      }, false);
    }
  });

  // Commit transaction
  ipcMain.handle(IPC_CHANNELS.COMMIT_TRANSACTION, async (event, transactionId) => {
    try {
      logger.info('Committing transaction', { transactionId });
      return await errorHandlingService.commitTransaction(transactionId);
    } catch (error) {
      logger.error('Failed to commit transaction', { transactionId, error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'TRANSACTION_COMMIT_ERROR'
      }, false);
    }
  });

  // Rollback transaction
  ipcMain.handle(IPC_CHANNELS.ROLLBACK_TRANSACTION, async (event, transactionId, reason) => {
    try {
      logger.info('Rolling back transaction', { transactionId, reason });
      return await errorHandlingService.rollbackTransaction(transactionId, reason);
    } catch (error) {
      logger.error('Failed to rollback transaction', { transactionId, error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'TRANSACTION_ROLLBACK_ERROR'
      }, false);
    }
  });

  // Handle file system error
  ipcMain.handle(IPC_CHANNELS.HANDLE_FILE_SYSTEM_ERROR, async (event, errorData, context = {}) => {
    try {
      logger.info('Handling file system error');
      // Reconstruct error object from serialized data
      const error = new Error(errorData.message);
      error.code = errorData.code;
      error.name = errorData.name;
      return errorHandlingService.handleFileSystemError(error, context);
    } catch (error) {
      logger.error('Failed to handle file system error', { error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'FILE_SYSTEM_ERROR_HANDLE_ERROR'
      }, false);
    }
  });

  // Check file permissions
  ipcMain.handle(IPC_CHANNELS.CHECK_PERMISSIONS, async (event, filePath, operation = 'read') => {
    try {
      logger.info('Checking file permissions', { filePath, operation });
      return await errorHandlingService.checkPermissions(filePath, operation);
    } catch (error) {
      logger.error('Failed to check permissions', { filePath, error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'PERMISSIONS_CHECK_ERROR'
      }, false);
    }
  });

  // Get error history
  ipcMain.handle(IPC_CHANNELS.GET_ERROR_HISTORY, async (event, filters = {}) => {
    try {
      logger.info('Getting error history');
      return errorHandlingService.getErrorHistory(filters);
    } catch (error) {
      logger.error('Failed to get error history', { error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'ERROR_HISTORY_ERROR'
      }, false);
    }
  });

  // Get active transactions
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVE_TRANSACTIONS, async () => {
    try {
      logger.info('Getting active transactions');
      return errorHandlingService.getActiveTransactions();
    } catch (error) {
      logger.error('Failed to get active transactions', { error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'ACTIVE_TRANSACTIONS_ERROR'
      }, false);
    }
  });

  // Get error handling statistics
  ipcMain.handle(IPC_CHANNELS.GET_ERROR_HANDLING_STATS, async () => {
    try {
      logger.info('Getting error handling statistics');
      return errorHandlingService.getStats();
    } catch (error) {
      logger.error('Failed to get error handling statistics', { error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'ERROR_HANDLING_STATS_ERROR'
      }, false);
    }
  });

  // Clear error history
  ipcMain.handle(IPC_CHANNELS.CLEAR_ERROR_HISTORY, async () => {
    try {
      logger.info('Clearing error history');
      return errorHandlingService.clearErrorHistory();
    } catch (error) {
      logger.error('Failed to clear error history', { error: error.message });
      return createIPCResponse({
        message: error.message,
        code: 'CLEAR_ERROR_HISTORY_ERROR'
      }, false);
    }
  });
};

/**
 * Setup file operation handlers
 */
const setupFileHandlers = () => {
  // File Operation Handlers
  ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
      const result = await dialog.showOpenDialog(window, options);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: {
          type: ERROR_TYPES.FILE_ERROR,
          message: 'Failed to show open dialog',
          details: error.message
        }
      };
    }
  });
  
  ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
      const result = await dialog.showSaveDialog(window, options);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: {
          type: ERROR_TYPES.FILE_ERROR,
          message: 'Failed to show save dialog',
          details: error.message
        }
      };
    }
  });
  
  // Read file
  ipcMain.handle(IPC_CHANNELS.READ_FILE, async (event, filePath, options = {}) => {
    try {
      // Validate and sanitize file path
      if (!validateFilePath(filePath)) {
        throw new Error('Invalid file path');
      }
      
      const sanitizedPath = sanitizeFilePath(filePath);
      
      const {
        encoding = 'utf8',
        useStreaming = false,
        chunkSize = 64 * 1024,
        maxSize = 100 * 1024 * 1024 // 100MB
      } = options;
      
      // Get file info first
      const stats = await fs.stat(sanitizedPath);
      
      // Check file size
      if (stats.size > maxSize) {
        throw new Error(`File size (${fileStreamService.formatFileSize(stats.size)}) exceeds maximum allowed size`);
      }
      
      let content;
      
      if (useStreaming || stats.size > chunkSize) {
        // Use streaming for large files
        content = await fileStreamService.readFileChunked(sanitizedPath, {
          chunkSize,
          encoding: encoding === 'binary' ? null : encoding
        });
      } else {
        // Use regular read for small files
        content = await readFile(sanitizedPath);
      }
      
      return createIPCResponse(null, true, {
        content: encoding === 'binary' ? content.toString('base64') : content,
        size: stats.size,
        sizeFormatted: fileStreamService.formatFileSize(stats.size),
        modified: stats.mtime,
        path: sanitizedPath,
        name: path.basename(sanitizedPath),
        encoding,
        mimeType: fileStreamService.getMimeType(sanitizedPath)
      });
    } catch (error) {
      const errorType = error.code === 'ENOENT' ? ERROR_TYPES.FILE_NOT_FOUND :
                       error.code === 'EACCES' ? ERROR_TYPES.PERMISSION_DENIED :
                       ERROR_TYPES.UNKNOWN_ERROR;
      
      return createIPCResponse(null, false, null, {
        type: errorType,
        message: error.message,
        path: filePath
      });
    }
  });
  
  // Write file
  ipcMain.handle(IPC_CHANNELS.WRITE_FILE, async (event, filePath, data, options = {}) => {
    try {
      // Validate and sanitize file path
      if (!validateFilePath(filePath)) {
        throw new Error('Invalid file path');
      }
      
      const sanitizedPath = sanitizeFilePath(filePath);
      const {
        encoding = 'utf8',
        useStreaming = false,
        chunkSize = 64 * 1024,
        createDirectories = true,
        overwrite = true
      } = options;
      
      // Check if file exists and overwrite is false
      if (!overwrite) {
        try {
          await fs.access(sanitizedPath);
          throw new Error('File already exists and overwrite is disabled');
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
      }
      
      // Create directory if it doesn't exist
      if (createDirectories) {
        const dir = path.dirname(sanitizedPath);
        await fs.mkdir(dir, { recursive: true });
      }
      
      let result;
      
      // Handle base64 encoded content
      if (encoding === 'base64') {
        const buffer = Buffer.from(data, 'base64');
        data = buffer;
      }
      
      const contentSize = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, encoding);
      
      if (useStreaming || contentSize > chunkSize) {
        // Use streaming for large content
        result = await fileStreamService.writeFileChunked(sanitizedPath, data, {
          chunkSize,
          encoding: encoding === 'base64' ? null : encoding,
          createDirectories
        });
      } else {
        // Use regular write for small content
        await writeFile(sanitizedPath, data);
        const stats = await fs.stat(sanitizedPath);
        result = {
          path: sanitizedPath,
          size: stats.size,
          bytesWritten: contentSize,
          modified: stats.mtime
        };
      }
      
      return createIPCResponse(null, true, {
        ...result,
        sizeFormatted: fileStreamService.formatFileSize(result.size),
        mimeType: fileStreamService.getMimeType(sanitizedPath)
      });
    } catch (error) {
      const errorType = error.code === 'EACCES' ? ERROR_TYPES.PERMISSION_DENIED :
                       ERROR_TYPES.UNKNOWN_ERROR;
      
      return createIPCResponse(null, false, null, {
        type: errorType,
        message: error.message,
        path: filePath
      });
    }
  });

  // Get file stats
  ipcMain.handle('get-file-stats', async (event, filePath) => {
    try {
      if (!validateFilePath(filePath)) {
        throw new Error('Invalid file path');
      }
      
      const sanitizedPath = sanitizeFilePath(filePath);
      const stats = await fs.stat(sanitizedPath);
      
      return createIPCResponse(null, true, {
        size: stats.size,
        sizeFormatted: fileStreamService.formatFileSize(stats.size),
        modified: stats.mtime,
        created: stats.birthtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        permissions: stats.mode,
        path: sanitizedPath
      });
    } catch (error) {
      logger.error('Get file stats error:', error);
      return createIPCResponse({
        message: error.message,
        code: 'FILE_STATS_ERROR'
      }, false);
    }
  });
};

/**
 * Setup window control handlers
 */
const setupWindowHandlers = () => {
  // Minimize window
  ipcMain.handle(IPC_CHANNELS.MINIMIZE_WINDOW, async () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
        return createIPCResponse(null, true, { minimized: true });
      }
      throw new Error('Window not available');
    } catch (error) {
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Maximize/restore window
  ipcMain.handle(IPC_CHANNELS.MAXIMIZE_WINDOW, async () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMaximized()) {
          mainWindow.restore();
          return createIPCResponse(null, true, { maximized: false });
        } else {
          mainWindow.maximize();
          return createIPCResponse(null, true, { maximized: true });
        }
      }
      throw new Error('Window not available');
    } catch (error) {
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Close window
  ipcMain.handle(IPC_CHANNELS.CLOSE_WINDOW, async () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
        return createIPCResponse(null, true, { closed: true });
      }
      throw new Error('Window not available');
    } catch (error) {
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
};

/**
 * Setup theme handlers
 */
const setupThemeHandlers = (mainWindow) => {
  ipcMain.handle('get-system-theme', () => {
    try {
      return {
        success: true,
        data: {
          shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
          themeSource: nativeTheme.themeSource
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          type: ERROR_TYPES.SYSTEM_ERROR,
          message: 'Failed to get system theme',
          details: error.message
        }
      };
    }
  });

  // Get theme info (forced to dark mode)
  ipcMain.handle('get-theme-info', () => {
    try {
      return {
        success: true,
        data: {
          shouldUseDarkColors: true,
          source: 'dark'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          type: ERROR_TYPES.SYSTEM_ERROR,
          message: 'Failed to get theme info',
          details: error.message
        }
      };
    }
  });

  // Set theme (forced to dark mode)
  ipcMain.handle('set-theme', (event, theme) => {
    try {
      nativeTheme.themeSource = 'dark';
      return {
        success: true,
        data: {
          shouldUseDarkColors: true,
          source: 'dark'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          type: ERROR_TYPES.SYSTEM_ERROR,
          message: 'Failed to set theme',
          details: error.message
        }
      };
    }
  });
  
  // Listen for theme changes
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.THEME_CHANGED, {
        theme: nativeTheme.shouldUseDarkColors ? THEME_TYPES.DARK : THEME_TYPES.LIGHT,
        systemTheme: nativeTheme.themeSource
      });
    }
  });
};

/**
 * Setup settings handlers
 */
const setupSettingsHandlers = () => {
  // Get application settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
    try {
      // This would typically read from a settings file or database
      // For now, return default settings
      const defaultSettings = {
        theme: THEME_TYPES.SYSTEM,
        autoSave: true,
        compressionLevel: 'medium',
        outputFormat: 'auto',
        preserveMetadata: true
      };
      
      return createIPCResponse(null, true, defaultSettings);
    } catch (error) {
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Update application settings
  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, async (event, settings) => {
    try {
      // This would typically save to a settings file or database
      // For now, just validate and return success
      if (!settings || typeof settings !== 'object') {
        throw new Error('Invalid settings object');
      }
      
      // Notify renderer of settings change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.SETTINGS_CHANGED, settings);
      }
      
      return createIPCResponse(null, true, settings);
    } catch (error) {
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
};

/**
 * Setup user preferences handlers
 */
const setupUserPreferencesHandlers = () => {
  // Initialize user preferences manager
  let isInitialized = false;
  
  const ensureInitialized = async () => {
    if (!isInitialized) {
      await userPreferencesManager.initialize();
      isInitialized = true;
    }
  };
  
  // Get user preferences
  ipcMain.handle(IPC_CHANNELS.GET_USER_PREFERENCES, async () => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.getPreferences();
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to get user preferences:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Update single preference
  ipcMain.handle(IPC_CHANNELS.UPDATE_USER_PREFERENCE, async (event, path, value) => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.updatePreference(path, value);
      
      // Notify renderer of preference change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.USER_PREFERENCES_CHANGED, {
          path,
          value,
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to update user preference:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Update multiple preferences
  ipcMain.handle(IPC_CHANNELS.UPDATE_USER_PREFERENCES, async (event, updates) => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.updatePreferences(updates);
      
      // Notify renderer of preferences change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.USER_PREFERENCES_CHANGED, {
          updates,
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to update user preferences:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Reset preferences
  ipcMain.handle(IPC_CHANNELS.RESET_USER_PREFERENCES, async (event, section) => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.resetPreferences(section);
      
      // Notify renderer of reset
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.USER_PREFERENCES_CHANGED, {
          type: 'reset',
          section,
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to reset user preferences:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Add preset
  ipcMain.handle(IPC_CHANNELS.ADD_PRESET, async (event, presetData) => {
    try {
      await ensureInitialized();
      const { ConversionPreset } = require('../models/ConversionPreset.js');
      const preset = ConversionPreset.fromJSON(presetData);
      const preferences = await userPreferencesManager.addPreset(preset);
      
      // Notify renderer of preset addition
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.PRESET_ADDED, {
          preset: preset.toJSON(),
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to add preset:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Remove preset
  ipcMain.handle(IPC_CHANNELS.REMOVE_PRESET, async (event, presetId) => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.removePreset(presetId);
      
      // Notify renderer of preset removal
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.PRESET_REMOVED, {
          presetId,
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to remove preset:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Update preset
  ipcMain.handle(IPC_CHANNELS.UPDATE_PRESET, async (event, presetId, updates) => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.updatePreset(presetId, updates);
      
      // Notify renderer of preset update
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.PRESET_UPDATED, {
          presetId,
          updates,
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to update preset:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Add recent job
  ipcMain.handle(IPC_CHANNELS.ADD_RECENT_JOB, async (event, jobData) => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.addRecentJob(jobData);
      
      // Notify renderer of recent job addition
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.RECENT_JOB_ADDED, {
          job: jobData,
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to add recent job:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Clear recent jobs
  ipcMain.handle(IPC_CHANNELS.CLEAR_RECENT_JOBS, async () => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.clearRecentJobs();
      
      // Notify renderer of recent jobs clearing
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.RECENT_JOBS_CLEARED, {
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to clear recent jobs:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Change theme
  ipcMain.handle(IPC_CHANNELS.CHANGE_THEME, async (event, theme) => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.changeTheme(theme);
      
      // Notify renderer of theme change
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.THEME_CHANGED_USER, {
          theme,
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to change theme:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Export preferences
  ipcMain.handle(IPC_CHANNELS.EXPORT_PREFERENCES, async (event, options) => {
    try {
      await ensureInitialized();
      const exportData = await userPreferencesManager.exportPreferences(options);
      return createIPCResponse(null, true, exportData);
    } catch (error) {
      logger.error('Failed to export preferences:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Import preferences
  ipcMain.handle(IPC_CHANNELS.IMPORT_PREFERENCES, async (event, importData, options) => {
    try {
      await ensureInitialized();
      const preferences = await userPreferencesManager.importPreferences(importData, options);
      
      // Notify renderer of preferences import
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.USER_PREFERENCES_CHANGED, {
          type: 'import',
          timestamp: Date.now()
        });
      }
      
      return createIPCResponse(null, true, preferences.toJSON());
    } catch (error) {
      logger.error('Failed to import preferences:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
  
  // Get preferences statistics
  ipcMain.handle(IPC_CHANNELS.GET_PREFERENCES_STATS, async () => {
    try {
      await ensureInitialized();
      const stats = await userPreferencesManager.getStatistics();
      return createIPCResponse(null, true, stats);
    } catch (error) {
      logger.error('Failed to get preferences statistics:', error);
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
};

/**
 * Setup error handlers
 */
const setupErrorHandlers = () => {
  // Log message from renderer
  ipcMain.handle(IPC_CHANNELS.LOG_MESSAGE, async (event, level, message, data = null) => {
    try {
      console.log(`[${level.toUpperCase()}] Renderer:`, message, data || '');
      return createIPCResponse(null, true, { logged: true });
    } catch (error) {
      return createIPCResponse(null, false, null, {
        type: ERROR_TYPES.UNKNOWN_ERROR,
        message: error.message
      });
    }
  });
};

// createIPCResponse is now imported from ../types/ipc.js

/**
 * Helper function to read file
 */
async function readFile(filePath) {
  return await fs.readFile(filePath, 'utf8');
}

/**
 * Helper function to write file
 */
async function writeFile(filePath, data) {
  return await fs.writeFile(filePath, data, 'utf8');
}

module.exports = {
  registerMainHandlers
};