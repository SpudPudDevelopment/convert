import { EventEmitter } from 'events';
import { ConversionJob } from '../types/ConversionJob.js';
import { JobStatus, JobPriority } from '../types/jobEnums.js';
import { globalJobNotifier, JobEventType } from '../events/jobEvents.js';
import { ConversionErrorHandler, ConversionErrorTypes } from './ConversionErrorHandler.js';

/**
 * Queue state enumeration
 */
export const QueueState = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  STOPPED: 'stopped'
};

/**
 * Queue configuration options
 */
export const QueueConfig = {
  DEFAULT_MAX_CONCURRENT: 2,
  DEFAULT_MAX_QUEUE_SIZE: 100,
  DEFAULT_PROCESSING_TIMEOUT: 30000, // 30 seconds
  DEFAULT_RETRY_DELAY: 5000, // 5 seconds
  DEFAULT_MAX_RETRIES: 3
};

/**
 * Queue error types
 */
export class QueueError extends Error {
  constructor(message, code = null, originalError = null) {
    super(message);
    this.name = 'QueueError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Job Queue implementation with FIFO processing
 */
export class JobQueue extends EventEmitter {
  constructor({
    maxConcurrent = QueueConfig.DEFAULT_MAX_CONCURRENT,
    maxQueueSize = QueueConfig.DEFAULT_MAX_QUEUE_SIZE,
    processingTimeout = QueueConfig.DEFAULT_PROCESSING_TIMEOUT,
    retryDelay = QueueConfig.DEFAULT_RETRY_DELAY,
    maxRetries = QueueConfig.DEFAULT_MAX_RETRIES,
    autoStart = true,
    persistentStorage = null
  } = {}) {
    super();
    
    // Configuration
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.processingTimeout = processingTimeout;
    this.retryDelay = retryDelay;
    this.maxRetries = maxRetries;
    this.persistentStorage = persistentStorage;
    
    // Initialize error handler
    this.errorHandler = new ConversionErrorHandler();
    
    // Queue state
    this.state = QueueState.IDLE;
    this.jobs = new Map(); // jobId -> ConversionJob
    this.queue = []; // Array of job IDs in FIFO order
    this.processing = new Set(); // Set of currently processing job IDs
    this.completed = new Map(); // jobId -> completion result
    this.failed = new Map(); // jobId -> failure reason
    
    // Statistics
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      cancelledJobs: 0,
      averageProcessingTime: 0,
      startTime: null,
      lastProcessedTime: null
    };
    
    // Processing control
    this.processingInterval = null;
    this.retryTimeouts = new Map(); // jobId -> timeout
    
    // Auto-start processing if enabled
    if (autoStart) {
      this.start();
    }
    
    // Set up event forwarding to global notifier
    this.setupEventForwarding();
    
    // Bind error handler events
    this.errorHandler.on('error', this.handleErrorEvent.bind(this));
    this.errorHandler.on('manualInterventionRequired', this.handleManualIntervention.bind(this));
    this.errorHandler.on('conversionAborted', this.handleConversionAborted.bind(this));
  }
  
  /**
   * Start queue processing
   */
  start() {
    if (this.state === QueueState.PROCESSING) {
      return;
    }
    
    this.state = QueueState.PROCESSING;
    this.stats.startTime = new Date();
    
    // Start processing loop
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 100); // Check every 100ms
    
    this.emit('queue:started');
    this.emitQueueStateChange();
  }
  
  /**
   * Pause queue processing
   */
  pause() {
    if (this.state !== QueueState.PROCESSING) {
      return;
    }
    
    this.state = QueueState.PAUSED;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.emit('queue:paused');
    this.emitQueueStateChange();
  }
  
  /**
   * Resume queue processing
   */
  resume() {
    if (this.state !== QueueState.PAUSED) {
      return;
    }
    
    this.start();
    this.emit('queue:resumed');
  }
  
  /**
   * Stop queue processing and clear all jobs
   */
  stop() {
    this.state = QueueState.STOPPED;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    // Cancel all processing jobs
    for (const jobId of this.processing) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.cancel('Queue stopped');
      }
    }
    
    // Clear retry timeouts
    for (const timeout of this.retryTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.retryTimeouts.clear();
    
    this.emit('queue:stopped');
    this.emitQueueStateChange();
  }
  
  /**
   * Add a job to the queue
   */
  addJob(job) {
    if (!(job instanceof ConversionJob)) {
      throw new QueueError('Job must be an instance of ConversionJob', 'INVALID_JOB');
    }
    
    if (this.jobs.has(job.id)) {
      throw new QueueError(`Job with ID ${job.id} already exists in queue`, 'DUPLICATE_JOB');
    }
    
    if (this.queue.length >= this.maxQueueSize) {
      throw new QueueError('Queue is at maximum capacity', 'QUEUE_FULL');
    }
    
    // Set job status to queued
    job.updateStatus(JobStatus.QUEUED);
    
    // Add to jobs map and queue
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.stats.totalJobs++;
    
    // Set up job event listeners
    this.setupJobEventListeners(job);
    
    this.emit('job:added', { jobId: job.id, queuePosition: this.queue.length });
    this.emitQueueStateChange();
    
    return job.id;
  }
  
  /**
   * Remove a job from the queue
   */
  removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new QueueError(`Job with ID ${jobId} not found`, 'JOB_NOT_FOUND');
    }
    
    // Check if job is currently processing
    if (this.processing.has(jobId)) {
      job.cancel('Removed from queue');
      this.processing.delete(jobId);
    }
    
    // Remove from queue array
    const queueIndex = this.queue.indexOf(jobId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
    }
    
    // Remove from jobs map
    this.jobs.delete(jobId);
    
    // Clear any retry timeout
    if (this.retryTimeouts.has(jobId)) {
      clearTimeout(this.retryTimeouts.get(jobId));
      this.retryTimeouts.delete(jobId);
    }
    
    this.emit('job:removed', { jobId });
    this.emitQueueStateChange();
    
    return true;
  }
  
  /**
   * Get job by ID
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }
  
  /**
   * Get all jobs in queue
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }
  
  /**
   * Get jobs by status
   */
  getJobsByStatus(status) {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }
  
  /**
   * Get queue position of a job
   */
  getQueuePosition(jobId) {
    const index = this.queue.indexOf(jobId);
    return index === -1 ? null : index + 1;
  }
  
  /**
   * Get queue statistics
   */
  getStats() {
    const now = new Date();
    const uptime = this.stats.startTime ? now - this.stats.startTime : 0;
    
    return {
      ...this.stats,
      uptime,
      queueLength: this.queue.length,
      processingCount: this.processing.size,
      totalJobsInSystem: this.jobs.size,
      state: this.state
    };
  }
  
  /**
   * Clear completed and failed jobs
   */
  clearCompletedJobs() {
    const completedJobs = this.getJobsByStatus(JobStatus.COMPLETED);
    const failedJobs = this.getJobsByStatus(JobStatus.FAILED);
    const cancelledJobs = this.getJobsByStatus(JobStatus.CANCELLED);
    
    const jobsToRemove = [...completedJobs, ...failedJobs, ...cancelledJobs];
    
    for (const job of jobsToRemove) {
      this.jobs.delete(job.id);
    }
    
    this.emit('queue:cleared', { removedCount: jobsToRemove.length });
    this.emitQueueStateChange();
    
    return jobsToRemove.length;
  }
  
  /**
   * Process the queue (internal method)
   */
  processQueue() {
    if (this.state !== QueueState.PROCESSING) {
      return;
    }
    
    // Check if we can process more jobs
    if (this.processing.size >= this.maxConcurrent) {
      return;
    }
    
    // Get next job from queue
    while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);
      
      if (!job) {
        continue; // Job was removed
      }
      
      if (job.status !== JobStatus.QUEUED) {
        continue; // Job status changed
      }
      
      this.startJobProcessing(job);
    }
  }
  
  /**
   * Start processing a specific job
   */
  async startJobProcessing(job) {
    try {
      this.processing.add(job.id);
      job.updateStatus(JobStatus.PROCESSING);
      
      const startTime = Date.now();
      
      this.emit('job:started', { jobId: job.id });
      
      // Set processing timeout
      const timeoutId = setTimeout(() => {
        if (this.processing.has(job.id)) {
          job.setError(new Error('Processing timeout'), 'TIMEOUT');
          this.handleJobCompletion(job, false);
        }
      }, this.processingTimeout);
      
      // Simulate job processing (this would be replaced with actual conversion logic)
      const success = await this.executeJob(job);
      
      clearTimeout(timeoutId);
      
      const processingTime = Date.now() - startTime;
      this.updateAverageProcessingTime(processingTime);
      
      this.handleJobCompletion(job, success);
      
    } catch (error) {
      job.setError(error, 'PROCESSING_ERROR');
      this.handleJobCompletion(job, false);
    }
  }
  
  /**
   * Execute job processing (placeholder for actual conversion logic)
   */
  async executeJob(job) {
    // This is a placeholder - actual implementation would call conversion engines
    return new Promise((resolve) => {
      // Simulate processing time based on file size or complexity
      const processingTime = Math.random() * 2000 + 1000; // 1-3 seconds
      
      setTimeout(() => {
        // Simulate 90% success rate
        const success = Math.random() > 0.1;
        resolve(success);
      }, processingTime);
    });
  }
  
  /**
   * Handle job completion
   */
  handleJobCompletion(job, success) {
    this.processing.delete(job.id);
    this.stats.lastProcessedTime = new Date();
    
    if (success) {
      job.updateStatus(JobStatus.COMPLETED);
      this.completed.set(job.id, { completedAt: new Date() });
      this.stats.completedJobs++;
      this.emit('job:completed', { jobId: job.id });
    } else {
      // Check if we should retry
      if (job.retryCount < this.maxRetries) {
        this.scheduleRetry(job);
      } else {
        job.updateStatus(JobStatus.FAILED);
        this.failed.set(job.id, { failedAt: new Date(), reason: job.error });
        this.stats.failedJobs++;
        this.emit('job:failed', { jobId: job.id, error: job.error });
      }
    }
    
    this.emitQueueStateChange();
  }
  
  /**
   * Schedule job retry
   */
  scheduleRetry(job) {
    const retryTimeout = setTimeout(() => {
      this.retryTimeouts.delete(job.id);
      
      if (this.jobs.has(job.id)) {
        job.retry();
        this.queue.unshift(job.id); // Add to front of queue for retry
        this.emit('job:retrying', { jobId: job.id, retryCount: job.retryCount });
      }
    }, this.retryDelay);
    
    this.retryTimeouts.set(job.id, retryTimeout);
  }
  
  /**
   * Update average processing time
   */
  updateAverageProcessingTime(processingTime) {
    const totalCompleted = this.stats.completedJobs + this.stats.failedJobs;
    if (totalCompleted === 0) {
      this.stats.averageProcessingTime = processingTime;
    } else {
      this.stats.averageProcessingTime = 
        (this.stats.averageProcessingTime * (totalCompleted - 1) + processingTime) / totalCompleted;
    }
  }
  
  /**
   * Set up job event listeners
   */
  setupJobEventListeners(job) {
    job.on('progress', (progress) => {
      this.emit('job:progress', { jobId: job.id, progress });
    });
    
    job.on('status', (status) => {
      this.emit('job:status', { jobId: job.id, status });
    });
    
    job.on('error', (error) => {
      this.emit('job:error', { jobId: job.id, error });
    });
  }
  
  /**
   * Set up event forwarding to global notifier
   */
  setupEventForwarding() {
    // Forward queue events to global notifier
    this.on('queue:started', () => {
      globalJobNotifier.emit(JobEventType.QUEUE_STARTED, {
        queueId: this.id || 'default',
        timestamp: new Date()
      });
    });
    
    this.on('queue:paused', () => {
      globalJobNotifier.emit(JobEventType.QUEUE_PAUSED, {
        queueId: this.id || 'default',
        timestamp: new Date()
      });
    });
    
    this.on('job:added', (data) => {
      globalJobNotifier.emit(JobEventType.JOB_QUEUED, {
        jobId: data.jobId,
        queuePosition: data.queuePosition,
        timestamp: new Date()
      });
    });
    
    this.on('job:started', (data) => {
      globalJobNotifier.emit(JobEventType.JOB_STARTED, {
        jobId: data.jobId,
        timestamp: new Date()
      });
    });
    
    this.on('job:completed', (data) => {
      globalJobNotifier.emit(JobEventType.JOB_COMPLETED, {
        jobId: data.jobId,
        timestamp: new Date()
      });
    });
    
    this.on('job:failed', (data) => {
      globalJobNotifier.emit(JobEventType.JOB_FAILED, {
        jobId: data.jobId,
        error: data.error,
        timestamp: new Date()
      });
    });
  }
  
  /**
   * Emit queue state change event
   */
  emitQueueStateChange() {
    const state = {
      queueLength: this.queue.length,
      processingCount: this.processing.size,
      totalJobs: this.jobs.size,
      state: this.state,
      stats: this.getStats()
    };
    
    this.emit('queue:stateChanged', state);
    
    globalJobNotifier.emit(JobEventType.QUEUE_STATE_CHANGED, {
      queueId: this.id || 'default',
      state,
      timestamp: new Date()
    });
  }
  
  /**
   * Serialize queue state for persistence
   */
  toJSON() {
    return {
      state: this.state,
      queue: this.queue,
      jobs: Array.from(this.jobs.entries()).map(([id, job]) => [id, job.toJSON()]),
      completed: Array.from(this.completed.entries()),
      failed: Array.from(this.failed.entries()),
      stats: this.stats,
      config: {
        maxConcurrent: this.maxConcurrent,
        maxQueueSize: this.maxQueueSize,
        processingTimeout: this.processingTimeout,
        retryDelay: this.retryDelay,
        maxRetries: this.maxRetries
      }
    };
  }
  
  /**
   * Restore queue state from serialized data
   */
  static fromJSON(data) {
    const queue = new JobQueue(data.config);
    
    // Restore state
    queue.state = data.state || QueueState.IDLE;
    queue.queue = data.queue || [];
    queue.stats = { ...queue.stats, ...data.stats };
    
    // Restore jobs
    if (data.jobs) {
      for (const [id, jobData] of data.jobs) {
        const job = ConversionJob.fromJSON(jobData);
        queue.jobs.set(id, job);
        queue.setupJobEventListeners(job);
      }
    }
    
    // Restore completed and failed maps
    if (data.completed) {
      queue.completed = new Map(data.completed);
    }
    if (data.failed) {
      queue.failed = new Map(data.failed);
    }
    
    return queue;
  }

  /**
   * Re-queue a job for processing
   * @param {string} jobId - Job ID to re-queue
   * @param {Object} options - Re-queue options
   * @returns {boolean} Success status
   */
  reQueueJob(jobId, options = {}) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new QueueError(`Job with ID ${jobId} not found`, 'JOB_NOT_FOUND');
    }

    // Reset job state for re-queueing
    job.resetForRequeue();
    
    // Update job priority if specified
    if (options.priority) {
      job.priority = options.priority;
    }
    
    // Update job settings if specified
    if (options.settings) {
      job.settings = { ...job.settings, ...options.settings };
    }
    
    // Set job status to queued
    job.updateStatus(JobStatus.QUEUED);
    
    // Remove from processing if it was being processed
    this.processing.delete(jobId);
    
    // Remove from completed/failed maps
    this.completed.delete(jobId);
    this.failed.delete(jobId);
    
    // Clear any retry timeout
    if (this.retryTimeouts.has(jobId)) {
      clearTimeout(this.retryTimeouts.get(jobId));
      this.retryTimeouts.delete(jobId);
    }
    
    // Add to front of queue for immediate processing (unless specified otherwise)
    const position = options.addToFront !== false ? 0 : this.queue.length;
    if (position === 0) {
      this.queue.unshift(jobId);
    } else {
      this.queue.splice(position, 0, jobId);
    }
    
    this.emit('job:requeued', { 
      jobId, 
      position: this.getQueuePosition(jobId),
      options 
    });
    this.emitQueueStateChange();
    
    return true;
  }

  /**
   * Reset job for re-queueing
   * @param {string} jobId - Job ID to reset
   * @returns {boolean} Success status
   */
  resetJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new QueueError(`Job with ID ${jobId} not found`, 'JOB_NOT_FOUND');
    }

    job.resetForRequeue();
    return true;
  }

  /**
   * Handle error events from the error handler
   */
  handleErrorEvent(error) {
    this.emit('error', error);
  }

  /**
   * Handle manual intervention required events from the error handler
   */
  handleManualIntervention(error) {
    this.emit('manualInterventionRequired', error);
  }

  /**
   * Handle conversion aborted events from the error handler
   */
  handleConversionAborted(error) {
    this.emit('conversionAborted', error);
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  /**
   * Clear error history
   */
  clearErrorHistory() {
    this.errorHandler.clearErrorHistory();
  }

  /**
   * Attempt error recovery for a job
   * @param {string} jobId - Job ID
   * @param {Object} context - Recovery context
   * @returns {Promise<Object>} Recovery result
   */
  async attemptJobRecovery(jobId, context = {}) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (!job.error) {
      return { success: false, error: 'Job has no error to recover from' };
    }

    return await this.errorHandler.attemptRecovery(job.error, {
      jobId,
      ...context
    });
  }
}

export default JobQueue;