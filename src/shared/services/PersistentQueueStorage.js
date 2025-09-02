import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { ConversionJob } from '../types/ConversionJob.js';
import { JobSerializer } from '../persistence/jobSerialization.js';
import { globalJobNotifier } from '../events/jobEvents.js';
const { app } = require('electron');

/**
 * Persistent storage for job queues
 * Handles saving and restoring queue state across application restarts
 */
export class PersistentQueueStorage extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Storage paths
      storageDir: config.storageDir || (app && app.isPackaged ? 
        path.join(app.getPath('userData'), '.convert-queue') : 
        path.join(process.cwd(), '.convert-queue')),
      queueFile: config.queueFile || 'queue-state.json',
      backupDir: config.backupDir || 'backups',
      
      // Auto-save settings
      enableAutoSave: config.enableAutoSave !== false,
      autoSaveInterval: config.autoSaveInterval || 30000, // 30 seconds
      saveOnChange: config.saveOnChange !== false,
      
      // Backup settings
      enableBackups: config.enableBackups !== false,
      maxBackups: config.maxBackups || 10,
      backupInterval: config.backupInterval || 300000, // 5 minutes
      
      // Compression and encryption
      enableCompression: config.enableCompression !== false,
      enableEncryption: config.enableEncryption || false,
      encryptionKey: config.encryptionKey,
      
      // Recovery settings
      enableRecovery: config.enableRecovery !== false,
      recoveryTimeout: config.recoveryTimeout || 10000, // 10 seconds
      
      // Validation
      validateOnLoad: config.validateOnLoad !== false,
      repairCorrupted: config.repairCorrupted !== false,
      
      ...config
    };
    
    // Storage state
    this.isInitialized = false;
    this.lastSaveTime = 0;
    this.saveInProgress = false;
    this.pendingChanges = false;
    
    // Timers
    this.autoSaveTimer = null;
    this.backupTimer = null;
    
    // Serializer
    this.serializer = new JobSerializer({
      format: 'JSON',
      includeEvents: false,
      includeMetrics: true,
      enableCompression: this.config.enableCompression,
      enableEncryption: this.config.enableEncryption,
      encryptionKey: this.config.encryptionKey
    });
    
    // Initialize storage
    this.initialize();
  }

  /**
   * Initialize persistent storage
   */
  async initialize() {
    try {
      // Create storage directories
      await this.createStorageDirectories();
      
      // Start auto-save timer if enabled
      if (this.config.enableAutoSave) {
        this.startAutoSave();
      }
      
      // Start backup timer if enabled
      if (this.config.enableBackups) {
        this.startBackupTimer();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
      
    } catch (error) {
      this.emit('error', new Error(`Failed to initialize storage: ${error.message}`));
    }
  }

  /**
   * Create necessary storage directories
   */
  async createStorageDirectories() {
    try {
      await fs.mkdir(this.config.storageDir, { recursive: true });
      
      if (this.config.enableBackups) {
        const backupPath = path.join(this.config.storageDir, this.config.backupDir);
        await fs.mkdir(backupPath, { recursive: true });
      }
    } catch (error) {
      throw new Error(`Failed to create storage directories: ${error.message}`);
    }
  }

  /**
   * Save queue state to persistent storage
   * @param {Object} queueState - Queue state to save
   * @returns {Object} Save operation result
   */
  async saveQueueState(queueState) {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Storage not initialized'
      };
    }
    
    if (this.saveInProgress) {
      this.pendingChanges = true;
      return {
        success: false,
        error: 'Save operation already in progress'
      };
    }
    
    this.saveInProgress = true;
    
    try {
      const startTime = Date.now();
      
      // Prepare state for serialization
      const stateToSave = {
        version: '1.0.0',
        timestamp: Date.now(),
        queueState,
        metadata: {
          totalJobs: this.countJobs(queueState),
          saveReason: 'manual',
          appVersion: process.env.npm_package_version || '1.0.0'
        }
      };
      
      // Serialize the state
      const serializedData = await this.serializer.serialize(stateToSave);
      
      // Write to file
      const filePath = path.join(this.config.storageDir, this.config.queueFile);
      await this.writeFileAtomic(filePath, serializedData);
      
      const duration = Date.now() - startTime;
      this.lastSaveTime = Date.now();
      this.pendingChanges = false;
      
      this.emit('stateSaved', {
        filePath,
        duration,
        size: serializedData.length,
        jobCount: stateToSave.metadata.totalJobs
      });
      
      return {
        success: true,
        filePath,
        duration,
        size: serializedData.length
      };
      
    } catch (error) {
      this.emit('error', new Error(`Failed to save queue state: ${error.message}`));
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.saveInProgress = false;
      
      // Handle pending changes
      if (this.pendingChanges) {
        setTimeout(() => this.saveQueueState(queueState), 1000);
      }
    }
  }

  /**
   * Load queue state from persistent storage
   * @returns {Object} Load operation result
   */
  async loadQueueState() {
    if (!this.isInitialized) {
      return {
        success: false,
        error: 'Storage not initialized'
      };
    }
    
    try {
      const filePath = path.join(this.config.storageDir, this.config.queueFile);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        // File doesn't exist, try to recover from backup
        if (this.config.enableRecovery) {
          return await this.recoverFromBackup();
        }
        
        return {
          success: true,
          queueState: null,
          message: 'No existing queue state found'
        };
      }
      
      // Read and deserialize file
      const fileData = await fs.readFile(filePath);
      const deserializedData = await this.serializer.deserialize(fileData);
      
      // Validate loaded data
      if (this.config.validateOnLoad) {
        const validation = await this.validateQueueState(deserializedData);
        if (!validation.isValid) {
          if (this.config.repairCorrupted) {
            deserializedData.queueState = this.repairQueueState(deserializedData.queueState, validation.errors);
          } else {
            return {
              success: false,
              error: 'Loaded queue state is invalid',
              validationErrors: validation.errors
            };
          }
        }
      }
      
      // Reconstruct ConversionJob objects
      const reconstructedState = await this.reconstructJobObjects(deserializedData.queueState);
      
      this.emit('stateLoaded', {
        filePath,
        jobCount: this.countJobs(reconstructedState),
        timestamp: deserializedData.timestamp
      });
      
      return {
        success: true,
        queueState: reconstructedState,
        metadata: deserializedData.metadata,
        timestamp: deserializedData.timestamp
      };
      
    } catch (error) {
      this.emit('error', new Error(`Failed to load queue state: ${error.message}`));
      
      // Try to recover from backup
      if (this.config.enableRecovery) {
        return await this.recoverFromBackup();
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a backup of the current queue state
   * @param {Object} queueState - Queue state to backup
   * @returns {Object} Backup operation result
   */
  async createBackup(queueState) {
    if (!this.config.enableBackups) {
      return {
        success: false,
        error: 'Backups are disabled'
      };
    }
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `queue-backup-${timestamp}.json`;
      const backupPath = path.join(this.config.storageDir, this.config.backupDir, backupFileName);
      
      // Prepare backup data
      const backupData = {
        version: '1.0.0',
        timestamp: Date.now(),
        queueState,
        metadata: {
          totalJobs: this.countJobs(queueState),
          backupReason: 'scheduled',
          originalFile: this.config.queueFile
        }
      };
      
      // Serialize and save backup
      const serializedData = await this.serializer.serialize(backupData);
      await this.writeFileAtomic(backupPath, serializedData);
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      this.emit('backupCreated', {
        backupPath,
        size: serializedData.length,
        jobCount: backupData.metadata.totalJobs
      });
      
      return {
        success: true,
        backupPath,
        size: serializedData.length
      };
      
    } catch (error) {
      this.emit('error', new Error(`Failed to create backup: ${error.message}`));
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Recover queue state from the most recent backup
   * @returns {Object} Recovery operation result
   */
  async recoverFromBackup() {
    if (!this.config.enableBackups) {
      return {
        success: false,
        error: 'Backups are disabled, cannot recover'
      };
    }
    
    try {
      const backupDir = path.join(this.config.storageDir, this.config.backupDir);
      const backupFiles = await fs.readdir(backupDir);
      
      // Find the most recent backup
      const backupFile = backupFiles
        .filter(file => file.startsWith('queue-backup-') && file.endsWith('.json'))
        .sort()
        .pop();
      
      if (!backupFile) {
        return {
          success: false,
          error: 'No backup files found'
        };
      }
      
      const backupPath = path.join(backupDir, backupFile);
      const fileData = await fs.readFile(backupPath);
      const deserializedData = await this.serializer.deserialize(fileData);
      
      // Reconstruct job objects
      const reconstructedState = await this.reconstructJobObjects(deserializedData.queueState);
      
      this.emit('stateRecovered', {
        backupFile,
        jobCount: this.countJobs(reconstructedState),
        timestamp: deserializedData.timestamp
      });
      
      return {
        success: true,
        queueState: reconstructedState,
        recoveredFrom: backupFile,
        timestamp: deserializedData.timestamp
      };
      
    } catch (error) {
      this.emit('error', new Error(`Failed to recover from backup: ${error.message}`));
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate queue state structure and data
   * @param {Object} data - Data to validate
   * @returns {Object} Validation result
   */
  async validateQueueState(data) {
    const errors = [];
    
    try {
      // Check basic structure
      if (!data || typeof data !== 'object') {
        errors.push('Invalid data structure');
        return { isValid: false, errors };
      }
      
      if (!data.queueState) {
        errors.push('Missing queueState property');
      }
      
      // Validate queue state structure
      const queueState = data.queueState;
      if (queueState) {
        if (queueState.priorityQueues && typeof queueState.priorityQueues === 'object') {
          for (const [priority, jobs] of Object.entries(queueState.priorityQueues)) {
            if (!Array.isArray(jobs)) {
              errors.push(`Priority queue ${priority} is not an array`);
            } else {
              // Validate individual jobs
              for (let i = 0; i < jobs.length; i++) {
                const job = jobs[i];
                if (!job.id) {
                  errors.push(`Job at ${priority}[${i}] missing ID`);
                }
                if (!job.conversionType) {
                  errors.push(`Job ${job.id} missing conversion type`);
                }
              }
            }
          }
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
      
    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
      return { isValid: false, errors };
    }
  }

  /**
   * Repair corrupted queue state
   * @param {Object} queueState - Corrupted queue state
   * @param {Array} errors - Validation errors
   * @returns {Object} Repaired queue state
   */
  repairQueueState(queueState, errors) {
    const repaired = JSON.parse(JSON.stringify(queueState)); // Deep clone
    
    // Initialize missing structures
    if (!repaired.priorityQueues) {
      repaired.priorityQueues = {};
    }
    
    // Repair priority queues
    for (const [priority, jobs] of Object.entries(repaired.priorityQueues)) {
      if (!Array.isArray(jobs)) {
        repaired.priorityQueues[priority] = [];
      } else {
        // Filter out invalid jobs
        repaired.priorityQueues[priority] = jobs.filter(job => 
          job && typeof job === 'object' && job.id && job.conversionType
        );
      }
    }
    
    this.emit('stateRepaired', {
      originalErrors: errors.length,
      repairedJobs: this.countJobs(repaired)
    });
    
    return repaired;
  }

  /**
   * Reconstruct ConversionJob objects from serialized data
   * @param {Object} queueState - Serialized queue state
   * @returns {Object} Queue state with reconstructed job objects
   */
  async reconstructJobObjects(queueState) {
    if (!queueState || !queueState.priorityQueues) {
      return queueState;
    }
    
    const reconstructed = { ...queueState };
    reconstructed.priorityQueues = {};
    
    for (const [priority, jobs] of Object.entries(queueState.priorityQueues)) {
      reconstructed.priorityQueues[priority] = [];
      
      for (const jobData of jobs) {
        try {
          // Reconstruct ConversionJob object
          const job = ConversionJob.fromJSON(jobData);
          reconstructed.priorityQueues[priority].push(job);
        } catch (error) {
          this.emit('error', new Error(`Failed to reconstruct job ${jobData.id}: ${error.message}`));
        }
      }
    }
    
    return reconstructed;
  }

  /**
   * Count total jobs in queue state
   * @param {Object} queueState - Queue state to count
   * @returns {number} Total job count
   */
  countJobs(queueState) {
    if (!queueState || !queueState.priorityQueues) {
      return 0;
    }
    
    return Object.values(queueState.priorityQueues)
      .reduce((total, jobs) => total + (Array.isArray(jobs) ? jobs.length : 0), 0);
  }

  /**
   * Write file atomically to prevent corruption
   * @param {string} filePath - Target file path
   * @param {string|Buffer} data - Data to write
   */
  async writeFileAtomic(filePath, data) {
    const tempPath = `${filePath}.tmp`;
    
    try {
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw error;
    }
  }

  /**
   * Clean up old backup files
   */
  async cleanupOldBackups() {
    try {
      const backupDir = path.join(this.config.storageDir, this.config.backupDir);
      const backupFiles = await fs.readdir(backupDir);
      
      const backups = backupFiles
        .filter(file => file.startsWith('queue-backup-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Newest first
      
      // Remove excess backups
      if (backups.length > this.config.maxBackups) {
        const toDelete = backups.slice(this.config.maxBackups);
        
        for (const backup of toDelete) {
          await fs.unlink(path.join(backupDir, backup));
        }
        
        this.emit('backupsCleanedUp', {
          deletedCount: toDelete.length,
          remainingCount: this.config.maxBackups
        });
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to cleanup old backups: ${error.message}`));
    }
  }

  /**
   * Start auto-save timer
   */
  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(() => {
      if (this.pendingChanges && !this.saveInProgress) {
        this.emit('autoSaveTriggered');
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * Start backup timer
   */
  startBackupTimer() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }
    
    this.backupTimer = setInterval(() => {
      this.emit('backupScheduled');
    }, this.config.backupInterval);
  }

  /**
   * Mark that changes are pending
   */
  markChangesPending() {
    this.pendingChanges = true;
  }

  /**
   * Get storage statistics
   * @returns {Object} Storage statistics
   */
  async getStorageStats() {
    try {
      const stats = {
        isInitialized: this.isInitialized,
        lastSaveTime: this.lastSaveTime,
        pendingChanges: this.pendingChanges,
        saveInProgress: this.saveInProgress,
        config: this.config
      };
      
      // Get file sizes
      const queueFilePath = path.join(this.config.storageDir, this.config.queueFile);
      try {
        const queueFileStats = await fs.stat(queueFilePath);
        stats.queueFileSize = queueFileStats.size;
        stats.queueFileModified = queueFileStats.mtime;
      } catch {
        stats.queueFileSize = 0;
        stats.queueFileModified = null;
      }
      
      // Get backup count
      if (this.config.enableBackups) {
        try {
          const backupDir = path.join(this.config.storageDir, this.config.backupDir);
          const backupFiles = await fs.readdir(backupDir);
          stats.backupCount = backupFiles.filter(file => 
            file.startsWith('queue-backup-') && file.endsWith('.json')
          ).length;
        } catch {
          stats.backupCount = 0;
        }
      }
      
      return stats;
    } catch (error) {
      throw new Error(`Failed to get storage stats: ${error.message}`);
    }
  }

  /**
   * Cleanup and stop storage
   */
  destroy() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    
    this.removeAllListeners();
    this.isInitialized = false;
  }
}

export default PersistentQueueStorage;