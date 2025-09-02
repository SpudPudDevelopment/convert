/**
 * Job Cleanup Service
 * Automatically cleans up completed jobs based on configurable rules
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const { JobHistoryManager } = require('./JobHistoryManager');

/**
 * Cleanup events
 */
const CleanupEvents = {
  CLEANUP_STARTED: 'cleanup_started',
  CLEANUP_COMPLETED: 'cleanup_completed',
  CLEANUP_FAILED: 'cleanup_failed',
  JOB_CLEANED: 'job_cleaned',
  FILE_CLEANED: 'file_cleaned',
  BATCH_PROGRESS: 'batch_progress',
  SCHEDULE_UPDATED: 'schedule_updated',
  POLICY_UPDATED: 'policy_updated'
};

/**
 * Cleanup reasons
 */
const CleanupReason = {
  AGE_LIMIT: 'age_limit',
  COUNT_LIMIT: 'count_limit',
  SIZE_LIMIT: 'size_limit',
  STATUS_BASED: 'status_based',
  MANUAL: 'manual',
  STORAGE_FULL: 'storage_full',
  POLICY_CHANGE: 'policy_change'
};

/**
 * Cleanup strategies
 */
const CleanupStrategy = {
  SOFT_DELETE: 'soft_delete',     // Mark as deleted but keep data
  HARD_DELETE: 'hard_delete',     // Remove from database
  ARCHIVE: 'archive',             // Move to archive storage
  COMPRESS: 'compress'            // Compress and keep
};

/**
 * File cleanup actions
 */
const FileCleanupAction = {
  DELETE: 'delete',
  MOVE_TO_ARCHIVE: 'move_to_archive',
  COMPRESS: 'compress',
  KEEP: 'keep'
};

/**
 * Default cleanup configuration
 */
const DEFAULT_CLEANUP_CONFIG = {
  // Retention policies
  retention: {
    maxAge: 30 * 24 * 60 * 60 * 1000,        // 30 days
    maxCount: 10000,                          // Maximum number of jobs
    maxTotalSize: 10 * 1024 * 1024 * 1024,    // 10GB
    
    // Status-based retention
    statusRetention: {
      completed: 7 * 24 * 60 * 60 * 1000,     // 7 days
      failed: 3 * 24 * 60 * 60 * 1000,        // 3 days
      cancelled: 1 * 24 * 60 * 60 * 1000,     // 1 day
      pending: 24 * 60 * 60 * 1000,           // 1 day (stale jobs)
      processing: 6 * 60 * 60 * 1000          // 6 hours (stuck jobs)
    }
  },
  
  // Cleanup strategies
  strategies: {
    default: CleanupStrategy.SOFT_DELETE,
    byStatus: {
      completed: CleanupStrategy.ARCHIVE,
      failed: CleanupStrategy.HARD_DELETE,
      cancelled: CleanupStrategy.HARD_DELETE
    }
  },
  
  // File cleanup
  fileCleanup: {
    cleanupInputFiles: false,
    cleanupOutputFiles: true,
    cleanupTempFiles: true,
    archiveDirectory: '/tmp/job-archive',
    
    // File-specific actions
    actions: {
      input: FileCleanupAction.KEEP,
      output: FileCleanupAction.DELETE,
      temp: FileCleanupAction.DELETE,
      logs: FileCleanupAction.COMPRESS
    }
  },
  
  // Scheduling
  schedule: {
    enabled: true,
    cronExpression: '0 2 * * *',  // Daily at 2 AM
    timezone: 'UTC'
  },
  
  // Performance
  performance: {
    batchSize: 100,
    maxConcurrentOperations: 5,
    pauseBetweenBatches: 1000,    // 1 second
    enableProgressReporting: true
  },
  
  // Safety
  safety: {
    dryRun: false,
    requireConfirmation: false,
    backupBeforeCleanup: true,
    minimumFreeSpace: 1024 * 1024 * 1024,  // 1GB
    protectedJobs: []  // Job IDs that should never be cleaned
  }
};

/**
 * Cleanup result
 */
class CleanupResult {
  constructor() {
    this.success = false;
    this.startTime = Date.now();
    this.endTime = null;
    this.duration = 0;
    
    this.jobsProcessed = 0;
    this.jobsCleaned = 0;
    this.jobsSkipped = 0;
    this.jobsArchived = 0;
    
    this.filesProcessed = 0;
    this.filesDeleted = 0;
    this.filesArchived = 0;
    this.filesCompressed = 0;
    
    this.spaceFreed = 0;
    this.errors = [];
    this.warnings = [];
    
    this.cleanupReasons = new Map();
    this.strategiesUsed = new Map();
  }
  
  /**
   * Mark as completed
   */
  complete() {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.success = this.errors.length === 0;
  }
  
  /**
   * Add error
   */
  addError(error, jobId = null) {
    this.errors.push({
      message: error.message || error,
      jobId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Add warning
   */
  addWarning(warning, jobId = null) {
    this.warnings.push({
      message: warning.message || warning,
      jobId,
      timestamp: Date.now()
    });
  }
  
  /**
   * Record cleanup reason
   */
  recordReason(reason) {
    this.cleanupReasons.set(reason, (this.cleanupReasons.get(reason) || 0) + 1);
  }
  
  /**
   * Record strategy used
   */
  recordStrategy(strategy) {
    this.strategiesUsed.set(strategy, (this.strategiesUsed.get(strategy) || 0) + 1);
  }
  
  /**
   * Get summary
   */
  getSummary() {
    return {
      success: this.success,
      duration: this.duration,
      jobsProcessed: this.jobsProcessed,
      jobsCleaned: this.jobsCleaned,
      spaceFreed: this.spaceFreed,
      errorCount: this.errors.length,
      warningCount: this.warnings.length
    };
  }
}

/**
 * Job Cleanup Service
 */
class JobCleanupService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = this._mergeConfig(DEFAULT_CLEANUP_CONFIG, options.config || {});
    this.historyManager = options.historyManager || new JobHistoryManager();
    
    this.isRunning = false;
    this.scheduledTask = null;
    this.statistics = {
      totalCleanups: 0,
      totalJobsCleaned: 0,
      totalSpaceFreed: 0,
      averageCleanupTime: 0,
      lastCleanup: null
    };
    
    this._initializeSchedule();
  }
  
  /**
   * Initialize cleanup schedule
   */
  _initializeSchedule() {
    if (this.config.schedule.enabled && this.config.schedule.cronExpression) {
      this.scheduledTask = cron.schedule(
        this.config.schedule.cronExpression,
        () => this.runCleanup(),
        {
          scheduled: false,
          timezone: this.config.schedule.timezone
        }
      );
      
      this.scheduledTask.start();
    }
  }
  
  /**
   * Run cleanup operation
   */
  async runCleanup(options = {}) {
    if (this.isRunning) {
      throw new Error('Cleanup is already running');
    }
    
    const cleanupOptions = { ...this.config, ...options };
    const result = new CleanupResult();
    const operationId = this._generateOperationId();
    
    this.isRunning = true;
    
    try {
      this.emit(CleanupEvents.CLEANUP_STARTED, {
        operationId,
        config: cleanupOptions,
        dryRun: cleanupOptions.safety.dryRun
      });
      
      // Create backup if required
      if (cleanupOptions.safety.backupBeforeCleanup && !cleanupOptions.safety.dryRun) {
        await this._createBackup();
      }
      
      // Get jobs to clean
      const jobsToClean = await this._getJobsToClean(cleanupOptions);
      result.jobsProcessed = jobsToClean.length;
      
      if (jobsToClean.length === 0) {
        result.complete();
        this.emit(CleanupEvents.CLEANUP_COMPLETED, { operationId, result });
        return result;
      }
      
      // Process jobs in batches
      const batchSize = cleanupOptions.performance.batchSize;
      const batches = this._createBatches(jobsToClean, batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        await this._processBatch(batch, cleanupOptions, result, operationId);
        
        // Emit progress
        this.emit(CleanupEvents.BATCH_PROGRESS, {
          operationId,
          batchIndex: i + 1,
          totalBatches: batches.length,
          processed: (i + 1) * batchSize,
          total: jobsToClean.length,
          cleaned: result.jobsCleaned,
          spaceFreed: result.spaceFreed
        });
        
        // Pause between batches
        if (i < batches.length - 1 && cleanupOptions.performance.pauseBetweenBatches > 0) {
          await this._sleep(cleanupOptions.performance.pauseBetweenBatches);
        }
      }
      
      // Update statistics
      this.statistics.totalCleanups++;
      this.statistics.totalJobsCleaned += result.jobsCleaned;
      this.statistics.totalSpaceFreed += result.spaceFreed;
      this.statistics.lastCleanup = Date.now();
      
      result.complete();
      
      this.statistics.averageCleanupTime = 
        (this.statistics.averageCleanupTime * (this.statistics.totalCleanups - 1) + result.duration) / 
        this.statistics.totalCleanups;
      
      this.emit(CleanupEvents.CLEANUP_COMPLETED, { operationId, result });
      
    } catch (error) {
      result.addError(error);
      result.complete();
      
      this.emit(CleanupEvents.CLEANUP_FAILED, {
        operationId,
        error,
        result
      });
    } finally {
      this.isRunning = false;
    }
    
    return result;
  }
  
  /**
   * Get jobs that need cleanup
   */
  async _getJobsToClean(config) {
    const allJobs = await this.historyManager.getAllJobs();
    const jobsToClean = [];
    const now = Date.now();
    
    // Calculate total size
    let totalSize = 0;
    const jobsByAge = allJobs.sort((a, b) => b.createdAt - a.createdAt);
    
    for (const job of jobsByAge) {
      totalSize += job.fileSize || 0;
    }
    
    // Apply cleanup rules
    for (const job of allJobs) {
      const reasons = [];
      
      // Skip protected jobs
      if (config.safety.protectedJobs.includes(job.id)) {
        continue;
      }
      
      // Age-based cleanup
      const age = now - job.createdAt;
      const maxAge = config.retention.statusRetention[job.status] || config.retention.maxAge;
      
      if (age > maxAge) {
        reasons.push(CleanupReason.AGE_LIMIT);
      }
      
      // Status-based cleanup
      if (job.status === 'failed' || job.status === 'cancelled') {
        const statusAge = now - (job.updatedAt || job.createdAt);
        const statusMaxAge = config.retention.statusRetention[job.status];
        
        if (statusAge > statusMaxAge) {
          reasons.push(CleanupReason.STATUS_BASED);
        }
      }
      
      // Count-based cleanup (keep only newest jobs)
      if (allJobs.length > config.retention.maxCount) {
        const sortedJobs = allJobs.sort((a, b) => b.createdAt - a.createdAt);
        const jobIndex = sortedJobs.findIndex(j => j.id === job.id);
        
        if (jobIndex >= config.retention.maxCount) {
          reasons.push(CleanupReason.COUNT_LIMIT);
        }
      }
      
      // Size-based cleanup
      if (totalSize > config.retention.maxTotalSize) {
        const sortedBySize = allJobs.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
        let currentSize = 0;
        
        for (const sizeJob of sortedBySize) {
          currentSize += sizeJob.fileSize || 0;
          
          if (currentSize > config.retention.maxTotalSize && sizeJob.id === job.id) {
            reasons.push(CleanupReason.SIZE_LIMIT);
            break;
          }
        }
      }
      
      if (reasons.length > 0) {
        jobsToClean.push({ job, reasons });
      }
    }
    
    return jobsToClean;
  }
  
  /**
   * Process a batch of jobs
   */
  async _processBatch(batch, config, result, operationId) {
    const promises = batch.map(({ job, reasons }) => 
      this._processJob(job, reasons, config, result, operationId)
    );
    
    await Promise.allSettled(promises);
  }
  
  /**
   * Process a single job
   */
  async _processJob(job, reasons, config, result, operationId) {
    try {
      // Determine cleanup strategy
      const strategy = this._getCleanupStrategy(job, config);
      result.recordStrategy(strategy);
      
      // Record reasons
      reasons.forEach(reason => result.recordReason(reason));
      
      if (config.safety.dryRun) {
        result.jobsCleaned++;
        return;
      }
      
      // Clean up files first
      const fileCleanupResult = await this._cleanupJobFiles(job, config);
      result.filesProcessed += fileCleanupResult.processed;
      result.filesDeleted += fileCleanupResult.deleted;
      result.filesArchived += fileCleanupResult.archived;
      result.filesCompressed += fileCleanupResult.compressed;
      result.spaceFreed += fileCleanupResult.spaceFreed;
      
      // Apply cleanup strategy to job record
      switch (strategy) {
        case CleanupStrategy.SOFT_DELETE:
          await this.historyManager.updateJob(job.id, { 
            deleted: true, 
            deletedAt: Date.now(),
            deletedReason: reasons.join(', ')
          });
          break;
        
        case CleanupStrategy.HARD_DELETE:
          await this.historyManager.removeJob(job.id);
          break;
        
        case CleanupStrategy.ARCHIVE:
          await this._archiveJob(job, config);
          await this.historyManager.updateJob(job.id, { 
            archived: true, 
            archivedAt: Date.now()
          });
          break;
        
        case CleanupStrategy.COMPRESS:
          await this._compressJob(job, config);
          await this.historyManager.updateJob(job.id, { 
            compressed: true, 
            compressedAt: Date.now()
          });
          break;
      }
      
      result.jobsCleaned++;
      
      this.emit(CleanupEvents.JOB_CLEANED, {
        operationId,
        job,
        strategy,
        reasons,
        spaceFreed: fileCleanupResult.spaceFreed
      });
      
    } catch (error) {
      result.addError(error, job.id);
    }
  }
  
  /**
   * Get cleanup strategy for a job
   */
  _getCleanupStrategy(job, config) {
    // Check status-specific strategy
    if (config.strategies.byStatus[job.status]) {
      return config.strategies.byStatus[job.status];
    }
    
    // Use default strategy
    return config.strategies.default;
  }
  
  /**
   * Clean up job files
   */
  async _cleanupJobFiles(job, config) {
    const result = {
      processed: 0,
      deleted: 0,
      archived: 0,
      compressed: 0,
      spaceFreed: 0
    };
    
    const filesToProcess = [
      { path: job.inputFile, type: 'input' },
      { path: job.outputFile, type: 'output' },
      ...(job.tempFiles || []).map(path => ({ path, type: 'temp' })),
      ...(job.logFiles || []).map(path => ({ path, type: 'logs' }))
    ].filter(file => file.path);
    
    for (const file of filesToProcess) {
      try {
        result.processed++;
        
        // Check if file exists
        const exists = await this._fileExists(file.path);
        if (!exists) {
          continue;
        }
        
        // Get file size
        const stats = await fs.stat(file.path);
        const fileSize = stats.size;
        
        // Determine action
        const action = config.fileCleanup.actions[file.type] || FileCleanupAction.DELETE;
        
        switch (action) {
          case FileCleanupAction.DELETE:
            await fs.unlink(file.path);
            result.deleted++;
            result.spaceFreed += fileSize;
            break;
          
          case FileCleanupAction.MOVE_TO_ARCHIVE:
            await this._archiveFile(file.path, config.fileCleanup.archiveDirectory);
            result.archived++;
            break;
          
          case FileCleanupAction.COMPRESS:
            await this._compressFile(file.path);
            result.compressed++;
            // Compression typically saves 50-90% space
            result.spaceFreed += Math.floor(fileSize * 0.7);
            break;
          
          case FileCleanupAction.KEEP:
            // Do nothing
            break;
        }
        
        this.emit(CleanupEvents.FILE_CLEANED, {
          filePath: file.path,
          fileType: file.type,
          action,
          size: fileSize
        });
        
      } catch (error) {
        // Log error but continue with other files
        console.error(`Failed to clean up file ${file.path}:`, error);
      }
    }
    
    return result;
  }
  
  /**
   * Archive a job
   */
  async _archiveJob(job, config) {
    const archiveData = {
      job,
      archivedAt: Date.now(),
      archiveVersion: '1.0.0'
    };
    
    const archiveDir = config.fileCleanup.archiveDirectory;
    await fs.mkdir(archiveDir, { recursive: true });
    
    const archiveFile = path.join(archiveDir, `job-${job.id}.json`);
    await fs.writeFile(archiveFile, JSON.stringify(archiveData, null, 2));
  }
  
  /**
   * Compress a job
   */
  async _compressJob(job, config) {
    // This would implement job data compression
    // For now, we'll just update the job record
    return job;
  }
  
  /**
   * Archive a file
   */
  async _archiveFile(filePath, archiveDir) {
    await fs.mkdir(archiveDir, { recursive: true });
    
    const fileName = path.basename(filePath);
    const archivePath = path.join(archiveDir, fileName);
    
    await fs.rename(filePath, archivePath);
  }
  
  /**
   * Compress a file
   */
  async _compressFile(filePath) {
    // This would implement file compression using gzip or similar
    // For now, we'll just simulate compression
    return filePath;
  }
  
  /**
   * Check if file exists
   */
  async _fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Create backup
   */
  async _createBackup() {
    const backupData = await this.historyManager.exportHistory();
    const backupDir = '/tmp/job-cleanup-backups';
    await fs.mkdir(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup-${timestamp}.json`);
    
    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
  }
  
  /**
   * Create batches from array
   */
  _createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
  
  /**
   * Sleep for specified milliseconds
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generate operation ID
   */
  _generateOperationId() {
    return Math.random().toString(36).substr(2, 9);
  }
  
  /**
   * Merge configuration objects
   */
  _mergeConfig(defaultConfig, userConfig) {
    const merged = JSON.parse(JSON.stringify(defaultConfig));
    
    function mergeDeep(target, source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          mergeDeep(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    
    mergeDeep(merged, userConfig);
    return merged;
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = this._mergeConfig(this.config, newConfig);
    
    // Restart schedule if changed
    if (newConfig.schedule) {
      this.stopSchedule();
      this._initializeSchedule();
      
      this.emit(CleanupEvents.SCHEDULE_UPDATED, {
        schedule: this.config.schedule
      });
    }
    
    this.emit(CleanupEvents.POLICY_UPDATED, {
      config: this.config
    });
  }
  
  /**
   * Start scheduled cleanup
   */
  startSchedule() {
    if (this.scheduledTask) {
      this.scheduledTask.start();
    }
  }
  
  /**
   * Stop scheduled cleanup
   */
  stopSchedule() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
    }
  }
  
  /**
   * Get cleanup preview
   */
  async getCleanupPreview(options = {}) {
    const config = { ...this.config, ...options, safety: { ...this.config.safety, dryRun: true } };
    return this.runCleanup(config);
  }
  
  /**
   * Get configuration
   */
  getConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.statistics,
      isRunning: this.isRunning,
      scheduleActive: this.scheduledTask?.running || false,
      nextScheduledRun: this.scheduledTask?.nextDate() || null
    };
  }
  
  /**
   * Reset statistics
   */
  resetStatistics() {
    this.statistics = {
      totalCleanups: 0,
      totalJobsCleaned: 0,
      totalSpaceFreed: 0,
      averageCleanupTime: 0,
      lastCleanup: null
    };
  }
  
  /**
   * Force cleanup of specific jobs
   */
  async forceCleanup(jobIds, strategy = CleanupStrategy.HARD_DELETE) {
    const jobs = await Promise.all(
      jobIds.map(id => this.historyManager.getJob(id))
    );
    
    const validJobs = jobs.filter(job => job).map(job => ({
      job,
      reasons: [CleanupReason.MANUAL]
    }));
    
    const config = {
      ...this.config,
      strategies: { default: strategy },
      safety: { ...this.config.safety, dryRun: false }
    };
    
    const result = new CleanupResult();
    const operationId = this._generateOperationId();
    
    await this._processBatch(validJobs, config, result, operationId);
    result.complete();
    
    return result;
  }
}

// Global instance
let globalInstance = null;

/**
 * Get global cleanup service instance
 */
function getCleanupService(options = {}) {
  if (!globalInstance) {
    globalInstance = new JobCleanupService(options);
  }
  return globalInstance;
}

module.exports = {
  JobCleanupService,
  CleanupResult,
  CleanupEvents,
  CleanupReason,
  CleanupStrategy,
  FileCleanupAction,
  DEFAULT_CLEANUP_CONFIG,
  getCleanupService
};