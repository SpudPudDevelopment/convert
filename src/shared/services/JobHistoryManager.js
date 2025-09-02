/**
 * Job History Management System
 * Manages conversion job history with configurable retention and cleanup
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { app } = require('electron');

/**
 * Job history events
 */
const HistoryEvents = {
  JOB_ADDED: 'job_added',
  JOB_UPDATED: 'job_updated',
  JOB_REMOVED: 'job_removed',
  CLEANUP_STARTED: 'cleanup_started',
  CLEANUP_COMPLETED: 'cleanup_completed',
  STORAGE_ERROR: 'storage_error',
  RETENTION_POLICY_CHANGED: 'retention_policy_changed',
  ARCHIVE_CREATED: 'archive_created'
};

/**
 * Job status enumeration
 */
const JobStatus = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused'
};

/**
 * Retention policy types
 */
const RetentionPolicy = {
  TIME_BASED: 'time_based',
  COUNT_BASED: 'count_based',
  SIZE_BASED: 'size_based',
  HYBRID: 'hybrid',
  CUSTOM: 'custom'
};

/**
 * Storage backends
 */
const StorageBackend = {
  FILE_SYSTEM: 'file_system',
  SQLITE: 'sqlite',
  MEMORY: 'memory'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  // Storage settings
  storage: {
    backend: StorageBackend.FILE_SYSTEM,
    basePath: (() => {
      // Use app.getPath('userData') for packaged app, process.cwd() for development
      if (typeof require !== 'undefined' && require('electron')) {
        try {
          const { app } = require('electron');
          return app && app.isPackaged ? 
            path.join(app.getPath('userData'), 'data', 'job_history') : 
            path.join(process.cwd(), 'data', 'job_history');
        } catch (e) {
          return path.join(process.cwd(), 'data', 'job_history');
        }
      }
      return path.join(process.cwd(), 'data', 'job_history');
    })(),
    maxFileSize: 50 * 1024 * 1024, // 50MB
    compressionEnabled: true,
    encryptionEnabled: false,
    backupEnabled: true,
    backupInterval: 24 * 60 * 60 * 1000 // 24 hours
  },
  
  // Retention policies
  retention: {
    policy: RetentionPolicy.HYBRID,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxCount: 10000,
    maxSize: 500 * 1024 * 1024, // 500MB
    keepSuccessfulJobs: 7 * 24 * 60 * 60 * 1000, // 7 days
    keepFailedJobs: 14 * 24 * 60 * 60 * 1000, // 14 days
    keepCancelledJobs: 3 * 24 * 60 * 60 * 1000, // 3 days
    archiveOldJobs: true,
    archiveThreshold: 90 * 24 * 60 * 60 * 1000 // 90 days
  },
  
  // Cleanup settings
  cleanup: {
    autoCleanup: true,
    cleanupInterval: 6 * 60 * 60 * 1000, // 6 hours
    batchSize: 100,
    preserveRecentJobs: 24 * 60 * 60 * 1000, // 24 hours
    enableProgressiveCleanup: true
  },
  
  // Indexing and performance
  indexing: {
    enableIndexing: true,
    indexFields: ['status', 'createdAt', 'completedAt', 'jobType', 'userId'],
    rebuildIndexInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
    cacheSize: 1000
  },
  
  // Monitoring
  monitoring: {
    enableMetrics: true,
    metricsRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
    alertThresholds: {
      storageUsage: 0.8,
      cleanupFailures: 5,
      queryLatency: 1000 // ms
    }
  }
};

/**
 * Job history record structure
 */
class JobHistoryRecord {
  constructor(jobData) {
    this.id = jobData.id || this._generateId();
    this.jobId = jobData.jobId;
    this.userId = jobData.userId;
    this.jobType = jobData.jobType;
    this.status = jobData.status;
    this.priority = jobData.priority || 'normal';
    
    // Timestamps
    this.createdAt = jobData.createdAt || Date.now();
    this.startedAt = jobData.startedAt;
    this.completedAt = jobData.completedAt;
    this.updatedAt = jobData.updatedAt || Date.now();
    
    // File information
    this.sourceFile = jobData.sourceFile;
    this.targetFile = jobData.targetFile;
    this.fileSize = jobData.fileSize;
    this.outputSize = jobData.outputSize;
    
    // Conversion details
    this.conversionSettings = jobData.conversionSettings;
    this.progress = jobData.progress || 0;
    this.duration = jobData.duration;
    this.errorMessage = jobData.errorMessage;
    this.errorCode = jobData.errorCode;
    
    // Metadata
    this.metadata = jobData.metadata || {};
    this.tags = jobData.tags || [];
    this.presetUsed = jobData.presetUsed;
    
    // Performance metrics
    this.performanceMetrics = jobData.performanceMetrics || {
      cpuUsage: null,
      memoryUsage: null,
      diskUsage: null,
      networkUsage: null
    };
    
    // Storage metadata
    this._storageMetadata = {
      version: '1.0',
      checksum: null,
      compressed: false,
      encrypted: false,
      archived: false
    };
  }
  
  _generateId() {
    return crypto.randomBytes(16).toString('hex');
  }
  
  /**
   * Update job record
   */
  update(updates) {
    Object.assign(this, updates);
    this.updatedAt = Date.now();
    return this;
  }
  
  /**
   * Calculate job duration
   */
  calculateDuration() {
    if (this.startedAt && this.completedAt) {
      this.duration = this.completedAt - this.startedAt;
    }
    return this.duration;
  }
  
  /**
   * Check if job is completed
   */
  isCompleted() {
    return [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED].includes(this.status);
  }
  
  /**
   * Get job age in milliseconds
   */
  getAge() {
    return Date.now() - this.createdAt;
  }
  
  /**
   * Serialize for storage
   */
  serialize() {
    return JSON.stringify(this);
  }
  
  /**
   * Deserialize from storage
   */
  static deserialize(data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return new JobHistoryRecord(parsed);
  }
}

/**
 * Job History Manager
 */
class JobHistoryManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = this._mergeConfig(DEFAULT_CONFIG, config);
    this.isInitialized = false;
    this.storage = null;
    this.index = new Map();
    this.cache = new Map();
    this.metrics = {
      totalJobs: 0,
      jobsByStatus: {},
      storageUsage: 0,
      lastCleanup: null,
      cleanupCount: 0,
      queryCount: 0,
      averageQueryTime: 0
    };
    
    this.cleanupTimer = null;
    this.backupTimer = null;
    this.indexRebuildTimer = null;
    
    this._setupTimers();
  }
  
  /**
   * Initialize the job history manager
   */
  async initialize() {
    try {
      await this._initializeStorage();
      await this._loadExistingJobs();
      await this._buildIndex();
      
      this.isInitialized = true;
      
      if (this.config.cleanup.autoCleanup) {
        this._scheduleCleanup();
      }
      
      if (this.config.storage.backupEnabled) {
        this._scheduleBackup();
      }
      
    } catch (error) {
      this.emit(HistoryEvents.STORAGE_ERROR, {
        error: error.message,
        operation: 'initialize',
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Add job to history
   */
  async addJob(jobData) {
    if (!this.isInitialized) {
      throw new Error('JobHistoryManager not initialized');
    }
    
    const record = new JobHistoryRecord(jobData);
    
    try {
      await this._storeJob(record);
      this._updateIndex(record);
      this._updateCache(record);
      this._updateMetrics('add', record);
      
      this.emit(HistoryEvents.JOB_ADDED, {
        job: record,
        timestamp: Date.now()
      });
      
      return record;
      
    } catch (error) {
      this.emit(HistoryEvents.STORAGE_ERROR, {
        error: error.message,
        operation: 'addJob',
        jobId: record.id,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Update job in history
   */
  async updateJob(jobId, updates) {
    if (!this.isInitialized) {
      throw new Error('JobHistoryManager not initialized');
    }
    
    try {
      const record = await this.getJob(jobId);
      if (!record) {
        throw new Error(`Job ${jobId} not found`);
      }
      
      record.update(updates);
      
      await this._storeJob(record);
      this._updateIndex(record);
      this._updateCache(record);
      this._updateMetrics('update', record);
      
      this.emit(HistoryEvents.JOB_UPDATED, {
        job: record,
        updates,
        timestamp: Date.now()
      });
      
      return record;
      
    } catch (error) {
      this.emit(HistoryEvents.STORAGE_ERROR, {
        error: error.message,
        operation: 'updateJob',
        jobId,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Get job from history
   */
  async getJob(jobId) {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.cache.has(jobId)) {
        this._recordQueryTime(Date.now() - startTime);
        return this.cache.get(jobId);
      }
      
      // Load from storage
      const record = await this._loadJob(jobId);
      
      if (record) {
        this._updateCache(record);
      }
      
      this._recordQueryTime(Date.now() - startTime);
      return record;
      
    } catch (error) {
      this.emit(HistoryEvents.STORAGE_ERROR, {
        error: error.message,
        operation: 'getJob',
        jobId,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Remove job from history
   */
  async removeJob(jobId) {
    if (!this.isInitialized) {
      throw new Error('JobHistoryManager not initialized');
    }
    
    try {
      const record = await this.getJob(jobId);
      if (!record) {
        return false;
      }
      
      await this._deleteJob(jobId);
      this._removeFromIndex(jobId);
      this.cache.delete(jobId);
      this._updateMetrics('remove', record);
      
      this.emit(HistoryEvents.JOB_REMOVED, {
        jobId,
        job: record,
        timestamp: Date.now()
      });
      
      return true;
      
    } catch (error) {
      this.emit(HistoryEvents.STORAGE_ERROR, {
        error: error.message,
        operation: 'removeJob',
        jobId,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Get jobs with filtering and pagination
   */
  async getJobs(options = {}) {
    const {
      status,
      jobType,
      userId,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeArchived = false
    } = options;
    
    const startTime = Date.now();
    
    try {
      let jobs = [];
      
      // Use index for efficient filtering
      if (this.config.indexing.enableIndexing) {
        jobs = this._queryIndex(options);
      } else {
        jobs = await this._loadAllJobs();
        jobs = this._filterJobs(jobs, options);
      }
      
      // Sort jobs
      jobs = this._sortJobs(jobs, sortBy, sortOrder);
      
      // Apply pagination
      const total = jobs.length;
      jobs = jobs.slice(offset, offset + limit);
      
      this._recordQueryTime(Date.now() - startTime);
      
      return {
        jobs,
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      };
      
    } catch (error) {
      this.emit(HistoryEvents.STORAGE_ERROR, {
        error: error.message,
        operation: 'getJobs',
        options,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Get job statistics
   */
  getStatistics() {
    const stats = {
      ...this.metrics,
      cacheHitRate: this._calculateCacheHitRate(),
      indexSize: this.index.size,
      cacheSize: this.cache.size,
      configuredRetention: this.config.retention,
      storageBackend: this.config.storage.backend
    };
    
    return stats;
  }
  
  /**
   * Perform cleanup based on retention policy
   */
  async cleanup(force = false) {
    if (!this.isInitialized) {
      return;
    }
    
    this.emit(HistoryEvents.CLEANUP_STARTED, {
      force,
      timestamp: Date.now()
    });
    
    try {
      const cleanupResults = {
        removed: 0,
        archived: 0,
        errors: 0,
        startTime: Date.now()
      };
      
      const jobs = await this._loadAllJobs();
      const jobsToRemove = [];
      const jobsToArchive = [];
      
      for (const job of jobs) {
        if (this._shouldRemoveJob(job, force)) {
          jobsToRemove.push(job);
        } else if (this._shouldArchiveJob(job)) {
          jobsToArchive.push(job);
        }
      }
      
      // Remove jobs in batches
      for (let i = 0; i < jobsToRemove.length; i += this.config.cleanup.batchSize) {
        const batch = jobsToRemove.slice(i, i + this.config.cleanup.batchSize);
        
        for (const job of batch) {
          try {
            await this.removeJob(job.id);
            cleanupResults.removed++;
          } catch (error) {
            cleanupResults.errors++;
          }
        }
      }
      
      // Archive jobs
      if (this.config.retention.archiveOldJobs) {
        for (const job of jobsToArchive) {
          try {
            await this._archiveJob(job);
            cleanupResults.archived++;
          } catch (error) {
            cleanupResults.errors++;
          }
        }
      }
      
      cleanupResults.duration = Date.now() - cleanupResults.startTime;
      this.metrics.lastCleanup = Date.now();
      this.metrics.cleanupCount++;
      
      this.emit(HistoryEvents.CLEANUP_COMPLETED, {
        results: cleanupResults,
        timestamp: Date.now()
      });
      
      return cleanupResults;
      
    } catch (error) {
      this.emit(HistoryEvents.STORAGE_ERROR, {
        error: error.message,
        operation: 'cleanup',
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  /**
   * Update retention policy
   */
  updateRetentionPolicy(newPolicy) {
    const oldPolicy = { ...this.config.retention };
    this.config.retention = { ...this.config.retention, ...newPolicy };
    
    this.emit(HistoryEvents.RETENTION_POLICY_CHANGED, {
      oldPolicy,
      newPolicy: this.config.retention,
      timestamp: Date.now()
    });
  }
  
  /**
   * Export job history
   */
  async exportHistory(options = {}) {
    const {
      format = 'json',
      includeArchived = false,
      dateRange,
      jobTypes,
      statuses
    } = options;
    
    const jobs = await this.getJobs({
      includeArchived,
      startDate: dateRange?.start,
      endDate: dateRange?.end,
      jobType: jobTypes,
      status: statuses,
      limit: Number.MAX_SAFE_INTEGER
    });
    
    const exportData = {
      metadata: {
        exportedAt: Date.now(),
        totalJobs: jobs.total,
        format,
        options
      },
      jobs: jobs.jobs
    };
    
    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    } else if (format === 'csv') {
      return this._convertToCSV(jobs.jobs);
    }
    
    throw new Error(`Unsupported export format: ${format}`);
  }
  
  /**
   * Import job history
   */
  async importHistory(data, options = {}) {
    const { overwrite = false, validate = true } = options;
    
    let importData;
    if (typeof data === 'string') {
      importData = JSON.parse(data);
    } else {
      importData = data;
    }
    
    const results = {
      imported: 0,
      skipped: 0,
      errors: 0
    };
    
    for (const jobData of importData.jobs || importData) {
      try {
        if (validate) {
          this._validateJobData(jobData);
        }
        
        const existingJob = await this.getJob(jobData.id);
        if (existingJob && !overwrite) {
          results.skipped++;
          continue;
        }
        
        await this.addJob(jobData);
        results.imported++;
        
      } catch (error) {
        results.errors++;
      }
    }
    
    return results;
  }
  
  /**
   * Initialize storage backend
   */
  async _initializeStorage() {
    const { backend, basePath } = this.config.storage;
    
    if (backend === StorageBackend.FILE_SYSTEM) {
      await fs.mkdir(basePath, { recursive: true });
      await fs.mkdir(path.join(basePath, 'jobs'), { recursive: true });
      await fs.mkdir(path.join(basePath, 'archives'), { recursive: true });
      await fs.mkdir(path.join(basePath, 'backups'), { recursive: true });
    }
    
    // Initialize other backends as needed
  }
  
  /**
   * Store job to backend
   */
  async _storeJob(record) {
    const { backend, basePath } = this.config.storage;
    
    if (backend === StorageBackend.FILE_SYSTEM) {
      const filePath = path.join(basePath, 'jobs', `${record.id}.json`);
      const data = record.serialize();
      await fs.writeFile(filePath, data, 'utf8');
    }
    
    // Handle other backends
  }
  
  /**
   * Load job from backend
   */
  async _loadJob(jobId) {
    const { backend, basePath } = this.config.storage;
    
    if (backend === StorageBackend.FILE_SYSTEM) {
      try {
        const filePath = path.join(basePath, 'jobs', `${jobId}.json`);
        const data = await fs.readFile(filePath, 'utf8');
        return JobHistoryRecord.deserialize(data);
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    }
    
    return null;
  }
  
  /**
   * Delete job from backend
   */
  async _deleteJob(jobId) {
    const { backend, basePath } = this.config.storage;
    
    if (backend === StorageBackend.FILE_SYSTEM) {
      const filePath = path.join(basePath, 'jobs', `${jobId}.json`);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }
  
  /**
   * Load all existing jobs
   */
  async _loadExistingJobs() {
    const { backend, basePath } = this.config.storage;
    
    if (backend === StorageBackend.FILE_SYSTEM) {
      try {
        const jobsDir = path.join(basePath, 'jobs');
        const files = await fs.readdir(jobsDir);
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            const jobId = path.basename(file, '.json');
            try {
              const record = await this._loadJob(jobId);
              if (record) {
                this._updateCache(record);
                this._updateMetrics('load', record);
              }
            } catch (error) {
              // Skip corrupted files
            }
          }
        }
      } catch (error) {
        // Directory doesn't exist yet
      }
    }
  }
  
  /**
   * Build search index
   */
  async _buildIndex() {
    if (!this.config.indexing.enableIndexing) {
      return;
    }
    
    this.index.clear();
    
    for (const [jobId, record] of this.cache) {
      this._updateIndex(record);
    }
  }
  
  /**
   * Update search index
   */
  _updateIndex(record) {
    if (!this.config.indexing.enableIndexing) {
      return;
    }
    
    for (const field of this.config.indexing.indexFields) {
      const value = record[field];
      if (value !== undefined) {
        const key = `${field}:${value}`;
        if (!this.index.has(key)) {
          this.index.set(key, new Set());
        }
        this.index.get(key).add(record.id);
      }
    }
  }
  
  /**
   * Remove from search index
   */
  _removeFromIndex(jobId) {
    if (!this.config.indexing.enableIndexing) {
      return;
    }
    
    for (const [key, jobIds] of this.index) {
      jobIds.delete(jobId);
      if (jobIds.size === 0) {
        this.index.delete(key);
      }
    }
  }
  
  /**
   * Query using index
   */
  _queryIndex(options) {
    const results = new Set();
    let firstFilter = true;
    
    for (const [field, value] of Object.entries(options)) {
      if (this.config.indexing.indexFields.includes(field) && value !== undefined) {
        const key = `${field}:${value}`;
        const jobIds = this.index.get(key) || new Set();
        
        if (firstFilter) {
          jobIds.forEach(id => results.add(id));
          firstFilter = false;
        } else {
          // Intersection
          for (const id of results) {
            if (!jobIds.has(id)) {
              results.delete(id);
            }
          }
        }
      }
    }
    
    // Convert to job records
    const jobs = [];
    for (const jobId of results) {
      const record = this.cache.get(jobId);
      if (record) {
        jobs.push(record);
      }
    }
    
    return jobs;
  }
  
  /**
   * Filter jobs
   */
  _filterJobs(jobs, options) {
    return jobs.filter(job => {
      if (options.status && job.status !== options.status) return false;
      if (options.jobType && job.jobType !== options.jobType) return false;
      if (options.userId && job.userId !== options.userId) return false;
      if (options.startDate && job.createdAt < options.startDate) return false;
      if (options.endDate && job.createdAt > options.endDate) return false;
      return true;
    });
  }
  
  /**
   * Sort jobs
   */
  _sortJobs(jobs, sortBy, sortOrder) {
    return jobs.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      
      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      else if (aVal > bVal) comparison = 1;
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
  
  /**
   * Update cache
   */
  _updateCache(record) {
    this.cache.set(record.id, record);
    
    // Limit cache size
    if (this.cache.size > this.config.indexing.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  /**
   * Update metrics
   */
  _updateMetrics(operation, record) {
    if (operation === 'add' || operation === 'load') {
      this.metrics.totalJobs++;
      this.metrics.jobsByStatus[record.status] = (this.metrics.jobsByStatus[record.status] || 0) + 1;
    } else if (operation === 'remove') {
      this.metrics.totalJobs--;
      this.metrics.jobsByStatus[record.status] = Math.max(0, (this.metrics.jobsByStatus[record.status] || 0) - 1);
    }
  }
  
  /**
   * Record query time
   */
  _recordQueryTime(time) {
    this.metrics.queryCount++;
    this.metrics.averageQueryTime = (
      (this.metrics.averageQueryTime * (this.metrics.queryCount - 1) + time) / 
      this.metrics.queryCount
    );
  }
  
  /**
   * Calculate cache hit rate
   */
  _calculateCacheHitRate() {
    // Implementation would track cache hits vs misses
    return 0.85; // Placeholder
  }
  
  /**
   * Check if job should be removed
   */
  _shouldRemoveJob(job, force) {
    if (force) return true;
    
    const age = job.getAge();
    const { retention } = this.config;
    
    // Check age-based retention
    if (retention.policy === RetentionPolicy.TIME_BASED || retention.policy === RetentionPolicy.HYBRID) {
      const maxAge = this._getMaxAgeForJob(job);
      if (age > maxAge) return true;
    }
    
    // Preserve recent jobs
    if (age < this.config.cleanup.preserveRecentJobs) {
      return false;
    }
    
    return false;
  }
  
  /**
   * Check if job should be archived
   */
  _shouldArchiveJob(job) {
    if (!this.config.retention.archiveOldJobs) return false;
    
    const age = job.getAge();
    return age > this.config.retention.archiveThreshold;
  }
  
  /**
   * Get maximum age for job based on status
   */
  _getMaxAgeForJob(job) {
    const { retention } = this.config;
    
    switch (job.status) {
      case JobStatus.COMPLETED:
        return retention.keepSuccessfulJobs;
      case JobStatus.FAILED:
        return retention.keepFailedJobs;
      case JobStatus.CANCELLED:
        return retention.keepCancelledJobs;
      default:
        return retention.maxAge;
    }
  }
  
  /**
   * Archive job
   */
  async _archiveJob(job) {
    const { basePath } = this.config.storage;
    const archivePath = path.join(basePath, 'archives', `${job.id}.json`);
    
    job._storageMetadata.archived = true;
    await fs.writeFile(archivePath, job.serialize(), 'utf8');
    
    await this.removeJob(job.id);
    
    this.emit(HistoryEvents.ARCHIVE_CREATED, {
      jobId: job.id,
      archivePath,
      timestamp: Date.now()
    });
  }
  
  /**
   * Setup timers
   */
  _setupTimers() {
    // Cleanup timer
    if (this.config.cleanup.autoCleanup) {
      this._scheduleCleanup();
    }
    
    // Backup timer
    if (this.config.storage.backupEnabled) {
      this._scheduleBackup();
    }
    
    // Index rebuild timer
    if (this.config.indexing.enableIndexing) {
      this._scheduleIndexRebuild();
    }
  }
  
  /**
   * Schedule cleanup
   */
  _scheduleCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        this.emit(HistoryEvents.STORAGE_ERROR, {
          error: error.message,
          operation: 'scheduled_cleanup',
          timestamp: Date.now()
        });
      });
    }, this.config.cleanup.cleanupInterval);
  }
  
  /**
   * Schedule backup
   */
  _scheduleBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }
    
    this.backupTimer = setInterval(() => {
      this._createBackup().catch(error => {
        this.emit(HistoryEvents.STORAGE_ERROR, {
          error: error.message,
          operation: 'scheduled_backup',
          timestamp: Date.now()
        });
      });
    }, this.config.storage.backupInterval);
  }
  
  /**
   * Schedule index rebuild
   */
  _scheduleIndexRebuild() {
    if (this.indexRebuildTimer) {
      clearInterval(this.indexRebuildTimer);
    }
    
    this.indexRebuildTimer = setInterval(() => {
      this._buildIndex().catch(error => {
        this.emit(HistoryEvents.STORAGE_ERROR, {
          error: error.message,
          operation: 'index_rebuild',
          timestamp: Date.now()
        });
      });
    }, this.config.indexing.rebuildIndexInterval);
  }
  
  /**
   * Create backup
   */
  async _createBackup() {
    const { basePath } = this.config.storage;
    const backupPath = path.join(basePath, 'backups', `backup_${Date.now()}.json`);
    
    const exportData = await this.exportHistory({ includeArchived: true });
    await fs.writeFile(backupPath, exportData, 'utf8');
  }
  
  /**
   * Validate job data
   */
  _validateJobData(jobData) {
    const required = ['id', 'jobId', 'status', 'createdAt'];
    for (const field of required) {
      if (!jobData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }
  
  /**
   * Convert jobs to CSV
   */
  _convertToCSV(jobs) {
    if (jobs.length === 0) return '';
    
    const headers = Object.keys(jobs[0]);
    const csvRows = [headers.join(',')];
    
    for (const job of jobs) {
      const row = headers.map(header => {
        const value = job[header];
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
      });
      csvRows.push(row.join(','));
    }
    
    return csvRows.join('\n');
  }
  
  /**
   * Merge configuration
   */
  _mergeConfig(defaultConfig, userConfig) {
    const merged = JSON.parse(JSON.stringify(defaultConfig));
    
    function merge(target, source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          merge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    
    merge(merged, userConfig);
    return merged;
  }
  
  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    
    if (this.indexRebuildTimer) {
      clearInterval(this.indexRebuildTimer);
      this.indexRebuildTimer = null;
    }
    
    this.removeAllListeners();
  }
}

/**
 * Global job history manager instance
 */
let globalJobHistoryManager = null;

function getGlobalJobHistoryManager(config = {}) {
  if (!globalJobHistoryManager) {
    globalJobHistoryManager = new JobHistoryManager(config);
  }
  return globalJobHistoryManager;
}

module.exports = {
  JobHistoryManager,
  JobHistoryRecord,
  HistoryEvents,
  JobStatus,
  RetentionPolicy,
  StorageBackend,
  DEFAULT_CONFIG,
  getGlobalJobHistoryManager
};