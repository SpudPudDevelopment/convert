/**
 * Output Management Service
 * Handles output directory selection, file naming conventions, and conflict resolution
 */

const fs = require('fs/promises');
const path = require('path');
const { dialog } = require('electron');
const { createLogger } = require('../utils/logger.js');
const { IPC_CHANNELS } = require('../types/ipc.js');

class OutputManagementService {
  constructor(options = {}) {
    this.logger = createLogger('OutputManagementService');
    
    this.options = {
      defaultOutputDir: options.defaultOutputDir || null,
      createMissingDirs: options.createMissingDirs !== false,
      conflictResolution: options.conflictResolution || 'auto-rename',
      maxRetries: options.maxRetries || 100,
      restrictedPaths: options.restrictedPaths || [
        '/System',
        '/Library',
        '/usr',
        '/bin',
        '/sbin',
        '/etc',
        '/var',
        '/tmp'
      ],
      ...options
    };
    
    // File naming patterns
    this.namingPatterns = {
      original: '{name}',
      timestamp: '{name}_{timestamp}',
      date: '{name}_{date}',
      sequence: '{name}_{sequence}',
      custom: '{name}_{custom}'
    };
    
    // Conflict resolution strategies
    this.conflictStrategies = {
      'auto-rename': this.autoRename.bind(this),
      'overwrite': this.overwrite.bind(this),
      'skip': this.skip.bind(this),
      'prompt': this.prompt.bind(this)
    };
    
    // Statistics
    this.stats = {
      filesProcessed: 0,
      conflicts: 0,
      directoriesCreated: 0,
      errors: 0
    };
    
    this.logger.info('OutputManagementService initialized', {
      defaultOutputDir: this.options.defaultOutputDir,
      conflictResolution: this.options.conflictResolution
    });
  }
  
  /**
   * Select output directory using native dialog
   */
  async selectOutputDirectory(options = {}) {
    try {
      const result = await dialog.showOpenDialog({
        title: options.title || 'Select Output Directory',
        defaultPath: options.defaultPath || this.options.defaultOutputDir,
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: options.buttonLabel || 'Select'
      });
      
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return {
          success: false,
          canceled: true
        };
      }
      
      const selectedPath = result.filePaths[0];
      
      // Validate the selected directory
      const validation = await this.validateOutputPath(selectedPath);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          path: selectedPath
        };
      }
      
      this.logger.info('Output directory selected', { path: selectedPath });
      
      return {
        success: true,
        path: selectedPath,
        validation
      };
      
    } catch (error) {
      this.logger.error('Failed to select output directory', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Validate output path
   */
  async validateOutputPath(outputPath) {
    try {
      // Check if path is restricted
      const isRestricted = this.options.restrictedPaths.some(restrictedPath => 
        outputPath.startsWith(restrictedPath)
      );
      
      if (isRestricted) {
        return {
          valid: false,
          error: 'Cannot write to restricted system directory',
          code: 'RESTRICTED_PATH'
        };
      }
      
      // Check if directory exists
      try {
        const stats = await fs.stat(outputPath);
        if (!stats.isDirectory()) {
          return {
            valid: false,
            error: 'Path exists but is not a directory',
            code: 'NOT_DIRECTORY'
          };
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          // Directory doesn't exist - check if we can create it
          if (!this.options.createMissingDirs) {
            return {
              valid: false,
              error: 'Directory does not exist and creation is disabled',
              code: 'DIRECTORY_NOT_FOUND'
            };
          }
          
          // Check if parent directory exists and is writable
          const parentDir = path.dirname(outputPath);
          try {
            await fs.access(parentDir, fs.constants.W_OK);
          } catch (parentError) {
            return {
              valid: false,
              error: 'Cannot create directory - parent directory is not writable',
              code: 'PARENT_NOT_WRITABLE'
            };
          }
        } else {
          return {
            valid: false,
            error: `Cannot access path: ${error.message}`,
            code: 'ACCESS_ERROR'
          };
        }
      }
      
      // Check write permissions
      try {
        await fs.access(outputPath, fs.constants.W_OK);
      } catch (error) {
        return {
          valid: false,
          error: 'Directory is not writable',
          code: 'NOT_WRITABLE'
        };
      }
      
      return {
        valid: true,
        writable: true,
        exists: true
      };
      
    } catch (error) {
      this.logger.error('Path validation failed', { path: outputPath, error: error.message });
      return {
        valid: false,
        error: error.message,
        code: 'VALIDATION_ERROR'
      };
    }
  }
  
  /**
   * Generate output file path with naming pattern
   */
  generateOutputPath(inputFile, outputDir, options = {}) {
    try {
      const {
        pattern = 'original',
        extension = null,
        customSuffix = '',
        sequence = 1,
        preserveStructure = false
      } = options;
      
      const inputPath = typeof inputFile === 'string' ? inputFile : inputFile.path;
      const inputName = path.basename(inputPath, path.extname(inputPath));
      const inputExt = extension || path.extname(inputPath);
      
      // Generate filename based on pattern
      let filename;
      const patternTemplate = this.namingPatterns[pattern] || pattern;
      
      const variables = {
        name: inputName,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
        sequence: sequence.toString().padStart(3, '0'),
        custom: customSuffix
      };
      
      filename = patternTemplate.replace(/\{(\w+)\}/g, (match, key) => {
        return variables[key] || match;
      });
      
      // Add extension
      if (!filename.endsWith(inputExt)) {
        filename += inputExt;
      }
      
      // Handle directory structure preservation
      let outputPath;
      if (preserveStructure && typeof inputFile === 'object' && inputFile.relativePath) {
        const relativeDir = path.dirname(inputFile.relativePath);
        outputPath = path.join(outputDir, relativeDir, filename);
      } else {
        outputPath = path.join(outputDir, filename);
      }
      
      return {
        success: true,
        path: outputPath,
        filename,
        directory: path.dirname(outputPath),
        variables
      };
      
    } catch (error) {
      this.logger.error('Failed to generate output path', { 
        inputFile, 
        outputDir, 
        options, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Preview output paths for multiple files
   */
  previewOutputPaths(inputFiles, outputDir, options = {}) {
    try {
      const previews = [];
      const conflicts = [];
      const pathMap = new Map();
      
      for (let i = 0; i < inputFiles.length; i++) {
        const inputFile = inputFiles[i];
        const fileOptions = {
          ...options,
          sequence: i + 1
        };
        
        const result = this.generateOutputPath(inputFile, outputDir, fileOptions);
        
        if (result.success) {
          // Check for conflicts
          if (pathMap.has(result.path)) {
            conflicts.push({
              path: result.path,
              files: [pathMap.get(result.path), inputFile]
            });
          } else {
            pathMap.set(result.path, inputFile);
          }
          
          previews.push({
            inputFile,
            outputPath: result.path,
            filename: result.filename,
            directory: result.directory,
            variables: result.variables
          });
        } else {
          previews.push({
            inputFile,
            error: result.error
          });
        }
      }
      
      return {
        success: true,
        previews,
        conflicts,
        hasConflicts: conflicts.length > 0
      };
      
    } catch (error) {
      this.logger.error('Failed to preview output paths', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Resolve file conflicts
   */
  async resolveConflict(outputPath, strategy = null) {
    try {
      const resolveStrategy = strategy || this.options.conflictResolution;
      const resolver = this.conflictStrategies[resolveStrategy];
      
      if (!resolver) {
        throw new Error(`Unknown conflict resolution strategy: ${resolveStrategy}`);
      }
      
      const result = await resolver(outputPath);
      
      if (result.success) {
        this.stats.conflicts++;
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('Failed to resolve conflict', { 
        outputPath, 
        strategy, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Auto-rename strategy - append number to filename
   */
  async autoRename(outputPath) {
    try {
      const dir = path.dirname(outputPath);
      const ext = path.extname(outputPath);
      const name = path.basename(outputPath, ext);
      
      let counter = 1;
      let newPath = outputPath;
      
      while (counter <= this.options.maxRetries) {
        try {
          await fs.access(newPath);
          // File exists, try next number
          newPath = path.join(dir, `${name} (${counter})${ext}`);
          counter++;
        } catch (error) {
          if (error.code === 'ENOENT') {
            // File doesn't exist, we can use this path
            break;
          }
          throw error;
        }
      }
      
      if (counter > this.options.maxRetries) {
        return {
          success: false,
          error: `Could not find available filename after ${this.options.maxRetries} attempts`
        };
      }
      
      return {
        success: true,
        path: newPath,
        strategy: 'auto-rename',
        attempts: counter
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Overwrite strategy - use original path
   */
  async overwrite(outputPath) {
    return {
      success: true,
      path: outputPath,
      strategy: 'overwrite'
    };
  }
  
  /**
   * Skip strategy - don't write file
   */
  async skip(outputPath) {
    return {
      success: true,
      path: null,
      strategy: 'skip',
      skipped: true
    };
  }
  
  /**
   * Prompt strategy - ask user for decision
   */
  async prompt(outputPath) {
    try {
      const result = await window.electronAPI.invoke(IPC_CHANNELS.SHOW_MESSAGE_BOX, {
        type: 'question',
        title: 'File Conflict',
        message: `File already exists: ${path.basename(outputPath)}`,
        detail: 'What would you like to do?',
        buttons: ['Overwrite', 'Auto-rename', 'Skip'],
        defaultId: 1,
        cancelId: 2
      });
      
      switch (result.response) {
        case 0: // Overwrite
          return await this.overwrite(outputPath);
        case 1: // Auto-rename
          return await this.autoRename(outputPath);
        case 2: // Skip
        default:
          return await this.skip(outputPath);
      }
      
    } catch (error) {
      this.logger.error('Failed to prompt user for conflict resolution', { error: error.message });
      // Fallback to auto-rename
      return await this.autoRename(outputPath);
    }
  }
  
  /**
   * Ensure output directory exists
   */
  async ensureOutputDirectory(outputPath) {
    try {
      const dir = path.dirname(outputPath);
      
      try {
        await fs.access(dir);
        return {
          success: true,
          path: dir,
          created: false
        };
      } catch (error) {
        if (error.code === 'ENOENT' && this.options.createMissingDirs) {
          await fs.mkdir(dir, { recursive: true });
          this.stats.directoriesCreated++;
          
          this.logger.info('Created output directory', { path: dir });
          
          return {
            success: true,
            path: dir,
            created: true
          };
        }
        throw error;
      }
      
    } catch (error) {
      this.logger.error('Failed to ensure output directory', { 
        outputPath, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Process output file with conflict resolution
   */
  async processOutputFile(inputFile, outputDir, options = {}) {
    try {
      // Generate initial output path
      const pathResult = this.generateOutputPath(inputFile, outputDir, options);
      if (!pathResult.success) {
        return pathResult;
      }
      
      let outputPath = pathResult.path;
      
      // Ensure output directory exists
      const dirResult = await this.ensureOutputDirectory(outputPath);
      if (!dirResult.success) {
        return dirResult;
      }
      
      // Check for conflicts and resolve
      try {
        await fs.access(outputPath);
        // File exists, resolve conflict
        const conflictResult = await this.resolveConflict(outputPath, options.conflictResolution);
        if (!conflictResult.success) {
          return conflictResult;
        }
        
        if (conflictResult.skipped) {
          return {
            success: true,
            skipped: true,
            reason: 'File conflict - user chose to skip'
          };
        }
        
        outputPath = conflictResult.path;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // File doesn't exist, no conflict
      }
      
      this.stats.filesProcessed++;
      
      return {
        success: true,
        inputFile,
        outputPath,
        filename: path.basename(outputPath),
        directory: path.dirname(outputPath),
        directoryCreated: dirResult.created
      };
      
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Failed to process output file', { 
        inputFile, 
        outputDir, 
        options, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Batch process multiple output files
   */
  async batchProcessOutputFiles(inputFiles, outputDir, options = {}) {
    try {
      const results = [];
      const errors = [];
      let processed = 0;
      let skipped = 0;
      
      for (let i = 0; i < inputFiles.length; i++) {
        const inputFile = inputFiles[i];
        const fileOptions = {
          ...options,
          sequence: i + 1
        };
        
        const result = await this.processOutputFile(inputFile, outputDir, fileOptions);
        
        if (result.success) {
          if (result.skipped) {
            skipped++;
          } else {
            processed++;
          }
          results.push(result);
        } else {
          errors.push({
            inputFile,
            error: result.error
          });
        }
        
        // Report progress if callback provided
        if (options.onProgress) {
          options.onProgress({
            current: i + 1,
            total: inputFiles.length,
            processed,
            skipped,
            errors: errors.length
          });
        }
      }
      
      return {
        success: true,
        results,
        errors,
        summary: {
          total: inputFiles.length,
          processed,
          skipped,
          failed: errors.length
        }
      };
      
    } catch (error) {
      this.logger.error('Batch processing failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get available naming patterns
   */
  getNamingPatterns() {
    return {
      patterns: { ...this.namingPatterns },
      variables: {
        name: 'Original filename without extension',
        timestamp: 'Unix timestamp',
        date: 'Current date (YYYYMMDD)',
        sequence: 'Sequential number (001, 002, etc.)',
        custom: 'Custom suffix'
      }
    };
  }
  
  /**
   * Get conflict resolution strategies
   */
  getConflictStrategies() {
    return {
      'auto-rename': 'Automatically append number to filename',
      'overwrite': 'Overwrite existing file',
      'skip': 'Skip file if conflict exists',
      'prompt': 'Ask user for decision'
    };
  }
  
  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.startTime
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      filesProcessed: 0,
      conflicts: 0,
      directoriesCreated: 0,
      errors: 0
    };
    this.startTime = Date.now();
  }
  
  /**
   * Update service options
   */
  updateOptions(newOptions) {
    this.options = {
      ...this.options,
      ...newOptions
    };
    
    this.logger.info('Options updated', { options: this.options });
  }
}

// Initialize start time
OutputManagementService.prototype.startTime = Date.now();

module.exports = OutputManagementService;
module.exports.OutputManagementService = OutputManagementService;