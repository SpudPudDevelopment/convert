import { JobStatus, JobPriority } from './jobEnums.js';
import { ConversionSettings } from './ConversionSettings.js';
import { EventEmitter } from 'events';

/**
 * Represents a file conversion job with metadata and status tracking
 */
export class ConversionJob extends EventEmitter {
  constructor({
    id = null,
    sourceFile,
    targetFile = null,
    settings,
    priority = JobPriority.NORMAL,
    metadata = {},
    dependencies = [],
    retryCount = 0,
    maxRetries = 3
  } = {}) {
    super();
    
    // Core job properties
    this.id = id || this.generateId();
    this.sourceFile = sourceFile;
    this.targetFile = targetFile;
    this.settings = settings instanceof ConversionSettings ? settings : new ConversionSettings(settings);
    this.priority = priority;
    this.metadata = { ...metadata };
    this.dependencies = [...dependencies];
    this.retryCount = retryCount;
    this.maxRetries = maxRetries;
    
    // Status and timing
    this.status = JobStatus.PENDING;
    this.createdAt = new Date();
    this.startedAt = null;
    this.completedAt = null;
    this.lastUpdated = new Date();
    
    // Progress tracking
    this.progress = {
      percentage: 0,
      stage: 'queued',
      message: 'Job created',
      bytesProcessed: 0,
      totalBytes: 0,
      estimatedTimeRemaining: null
    };
    
    // Error handling
    this.error = null;
    this.warnings = [];
    
    // Performance metrics
    this.metrics = {
      processingTime: 0,
      inputFileSize: 0,
      outputFileSize: 0,
      compressionRatio: 0,
      averageSpeed: 0 // bytes per second
    };
    
    // Event history
    this.events = [];
  }

  /**
   * Generate a unique job ID
   */
  generateId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update job status and emit events
   */
  updateStatus(newStatus, message = null) {
    const oldStatus = this.status;
    this.status = newStatus;
    this.lastUpdated = new Date();
    
    // Update timing based on status
    switch (newStatus) {
      case JobStatus.RUNNING:
        if (!this.startedAt) {
          this.startedAt = new Date();
        }
        break;
      case JobStatus.COMPLETED:
      case JobStatus.FAILED:
      case JobStatus.CANCELLED:
        this.completedAt = new Date();
        if (this.startedAt) {
          this.metrics.processingTime = this.completedAt - this.startedAt;
        }
        break;
    }
    
    // Log event
    this.addEvent('status_change', {
      from: oldStatus,
      to: newStatus,
      message
    });
    
    // Emit status change event
    this.emit('statusChange', {
      job: this,
      oldStatus,
      newStatus,
      message
    });
    
    // Emit specific status events
    this.emit(newStatus.toLowerCase(), { job: this, message });
  }

  /**
   * Update job progress
   */
  updateProgress({
    percentage = null,
    stage = null,
    message = null,
    bytesProcessed = null,
    totalBytes = null,
    estimatedTimeRemaining = null
  } = {}) {
    if (percentage !== null) this.progress.percentage = Math.max(0, Math.min(100, percentage));
    if (stage !== null) this.progress.stage = stage;
    if (message !== null) this.progress.message = message;
    if (bytesProcessed !== null) this.progress.bytesProcessed = bytesProcessed;
    if (totalBytes !== null) this.progress.totalBytes = totalBytes;
    if (estimatedTimeRemaining !== null) this.progress.estimatedTimeRemaining = estimatedTimeRemaining;
    
    this.lastUpdated = new Date();
    
    // Calculate average speed if we have timing data
    if (this.startedAt && this.progress.bytesProcessed > 0) {
      const elapsedSeconds = (Date.now() - this.startedAt.getTime()) / 1000;
      this.metrics.averageSpeed = this.progress.bytesProcessed / elapsedSeconds;
    }
    
    // Log progress event
    this.addEvent('progress_update', {
      percentage: this.progress.percentage,
      stage: this.progress.stage,
      message: this.progress.message
    });
    
    // Emit progress event
    this.emit('progress', {
      job: this,
      progress: { ...this.progress }
    });
  }

  /**
   * Set job error
   */
  setError(error, fatal = true) {
    this.error = {
      message: error.message || error,
      stack: error.stack || null,
      code: error.code || null,
      timestamp: new Date(),
      fatal
    };
    
    this.addEvent('error', this.error);
    this.emit('error', { job: this, error: this.error });
    
    if (fatal) {
      this.updateStatus(JobStatus.FAILED, `Error: ${this.error.message}`);
    }
  }

  /**
   * Add a warning
   */
  addWarning(message, code = null) {
    const warning = {
      message,
      code,
      timestamp: new Date()
    };
    
    this.warnings.push(warning);
    this.addEvent('warning', warning);
    this.emit('warning', { job: this, warning });
  }

  /**
   * Add an event to the job history
   */
  addEvent(type, data = {}) {
    const event = {
      type,
      timestamp: new Date(),
      data: { ...data }
    };
    
    this.events.push(event);
    
    // Keep only the last 100 events to prevent memory issues
    if (this.events.length > 100) {
      this.events = this.events.slice(-100);
    }
  }

  /**
   * Check if job can be retried
   */
  canRetry() {
    return this.status === JobStatus.FAILED && this.retryCount < this.maxRetries;
  }

  /**
   * Retry the job
   */
  retry() {
    if (!this.canRetry()) {
      throw new Error('Job cannot be retried');
    }
    
    this.retryCount++;
    this.error = null;
    this.progress = {
      percentage: 0,
      stage: 'queued',
      message: `Retry attempt ${this.retryCount}`,
      bytesProcessed: 0,
      totalBytes: 0,
      estimatedTimeRemaining: null
    };
    
    this.updateStatus(JobStatus.PENDING, `Retry attempt ${this.retryCount}`);
  }

  /**
   * Cancel the job
   */
  cancel(reason = 'User cancelled') {
    if ([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED].includes(this.status)) {
      return false; // Cannot cancel already finished jobs
    }
    
    this.updateStatus(JobStatus.CANCELLED, reason);
    return true;
  }

  /**
   * Pause the job
   */
  pause(reason = 'User paused') {
    if (this.status === JobStatus.RUNNING) {
      this.updateStatus(JobStatus.PAUSED, reason);
      return true;
    }
    return false;
  }

  /**
   * Resume the job
   */
  resume(reason = 'User resumed') {
    if (this.status === JobStatus.PAUSED) {
      this.updateStatus(JobStatus.PENDING, reason);
      return true;
    }
    return false;
  }

  /**
   * Reset job state for re-queueing
   */
  resetForRequeue() {
    // Reset status and timing
    this.status = JobStatus.PENDING;
    this.startedAt = null;
    this.completedAt = null;
    this.lastUpdated = new Date();
    
    // Reset progress
    this.progress = {
      percentage: 0,
      stage: 'queued',
      message: 'Job re-queued for processing',
      bytesProcessed: 0,
      totalBytes: 0,
      estimatedTimeRemaining: null
    };
    
    // Clear error and warnings
    this.error = null;
    this.warnings = [];
    
    // Reset metrics
    this.metrics = {
      processingTime: 0,
      inputFileSize: 0,
      outputFileSize: 0,
      compressionRatio: 0,
      averageSpeed: 0
    };
    
    // Add re-queue event
    this.addEvent('requeued', 'Job re-queued for processing');
    
    // Emit status change
    this.emit('status', this.status);
    this.emit('progress', this.progress);
  }

  /**
   * Get job duration in milliseconds
   */
  getDuration() {
    if (!this.startedAt) return 0;
    const endTime = this.completedAt || new Date();
    return endTime - this.startedAt;
  }

  /**
   * Get estimated completion time
   */
  getEstimatedCompletion() {
    if (!this.startedAt || this.progress.percentage === 0) {
      return null;
    }
    
    const elapsed = Date.now() - this.startedAt.getTime();
    const estimatedTotal = (elapsed / this.progress.percentage) * 100;
    const remaining = estimatedTotal - elapsed;
    
    return new Date(Date.now() + remaining);
  }

  /**
   * Validate job configuration
   */
  validate() {
    const errors = [];
    
    if (!this.sourceFile) {
      errors.push('Source file is required');
    }
    
    if (!this.settings) {
      errors.push('Conversion settings are required');
    } else {
      const settingsValidation = this.settings.validate();
      if (!settingsValidation.isValid) {
        errors.push(...settingsValidation.errors);
      }
    }
    
    if (!Object.values(JobPriority).includes(this.priority)) {
      errors.push('Invalid job priority');
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
      id: this.id,
      sourceFile: this.sourceFile,
      targetFile: this.targetFile,
      settings: this.settings.toJSON(),
      priority: this.priority,
      metadata: this.metadata,
      dependencies: this.dependencies,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      startedAt: this.startedAt?.toISOString() || null,
      completedAt: this.completedAt?.toISOString() || null,
      lastUpdated: this.lastUpdated.toISOString(),
      progress: this.progress,
      error: this.error,
      warnings: this.warnings,
      metrics: this.metrics,
      events: this.events.slice(-10) // Only include last 10 events in serialization
    };
  }

  /**
   * Create from plain object
   */
  static fromJSON(data) {
    const job = new ConversionJob({
      id: data.id,
      sourceFile: data.sourceFile,
      targetFile: data.targetFile,
      settings: data.settings,
      priority: data.priority,
      metadata: data.metadata,
      dependencies: data.dependencies,
      retryCount: data.retryCount,
      maxRetries: data.maxRetries
    });
    
    // Restore state
    job.status = data.status;
    job.createdAt = new Date(data.createdAt);
    job.startedAt = data.startedAt ? new Date(data.startedAt) : null;
    job.completedAt = data.completedAt ? new Date(data.completedAt) : null;
    job.lastUpdated = new Date(data.lastUpdated);
    job.progress = data.progress || job.progress;
    job.error = data.error;
    job.warnings = data.warnings || [];
    job.metrics = data.metrics || job.metrics;
    job.events = data.events || [];
    
    return job;
  }

  /**
   * Create a copy of the job
   */
  clone() {
    return ConversionJob.fromJSON(this.toJSON());
  }
}

export default ConversionJob;