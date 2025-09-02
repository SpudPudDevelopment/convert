import { PriorityJobQueue } from './PriorityJobQueue.js';
import { JobPriority, JobStatus } from '../types/jobEnums.js';
import { globalJobNotifier } from '../events/jobEvents.js';
import { JobValidator } from '../validation/jobValidation.js';

/**
 * Queue management operations for job queues
 * Provides high-level operations for managing jobs in queues
 */
export class QueueManager {
  constructor(config = {}) {
    this.config = {
      maxQueueSize: config.maxQueueSize || 1000,
      enableBatchOperations: config.enableBatchOperations !== false,
      enableReordering: config.enableReordering !== false,
      enableDuplicateDetection: config.enableDuplicateDetection !== false,
      duplicateCheckFields: config.duplicateCheckFields || ['sourceFile', 'targetFile', 'conversionType'],
      ...config
    };
    
    this.queue = new PriorityJobQueue(config);
    this.validator = new JobValidator();
    
    // Operation history for undo functionality
    this.operationHistory = [];
    this.maxHistorySize = config.maxHistorySize || 100;
    
    // Job lookup cache for faster operations
    this.jobCache = new Map();
    
    // Bind queue events
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for queue events
   */
  setupEventHandlers() {
    this.queue.on('jobAdded', (data) => {
      this.jobCache.set(data.job.id, data.job);
      this.recordOperation('add', { jobId: data.job.id });
    });
    
    this.queue.on('jobRemoved', (data) => {
      this.jobCache.delete(data.jobId);
      this.recordOperation('remove', { jobId: data.jobId });
    });
    
    this.queue.on('error', (error) => {
      globalJobNotifier.emit('queueError', { error: error.message });
    });
  }

  /**
   * Add a job to the queue with validation and duplicate checking
   * @param {ConversionJob} job - Job to add
   * @param {Object} options - Add options
   * @returns {Object} Operation result
   */
  async addJob(job, options = {}) {
    try {
      // Validate job
      const validation = await this.validator.validateJobCreation(job);
      if (!validation.isValid) {
        return {
          success: false,
          error: 'Job validation failed',
          details: validation.errors
        };
      }

      // Check queue size limit
      if (this.queue.getQueueSize() >= this.config.maxQueueSize) {
        return {
          success: false,
          error: 'Queue size limit exceeded',
          maxSize: this.config.maxQueueSize
        };
      }

      // Check for duplicates if enabled
      if (this.config.enableDuplicateDetection && !options.allowDuplicates) {
        const duplicate = this.findDuplicateJob(job);
        if (duplicate) {
          return {
            success: false,
            error: 'Duplicate job detected',
            duplicateJobId: duplicate.id,
            action: options.duplicateAction || 'reject'
          };
        }
      }

      // Add job to queue
      const success = this.queue.addJob(job);
      if (success) {
        return {
          success: true,
          jobId: job.id,
          queuePosition: this.queue.getJobPosition(job.id),
          estimatedWaitTime: this.queue.estimateWaitTime(job)
        };
      } else {
        return {
          success: false,
          error: 'Failed to add job to queue'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove a job from the queue
   * @param {string} jobId - Job ID to remove
   * @param {Object} options - Remove options
   * @returns {Object} Operation result
   */
  removeJob(jobId, options = {}) {
    try {
      const job = this.findJobInQueue(jobId);
      if (!job) {
        return {
          success: false,
          error: `Job ${jobId} not found in queue`
        };
      }

      // Check if job can be removed
      if (job.status === JobStatus.IN_PROGRESS && !options.force) {
        return {
          success: false,
          error: 'Cannot remove job in progress without force flag'
        };
      }

      // Remove from appropriate priority queue
      const removed = this.removeJobFromPriorityQueue(job);
      if (removed) {
        this.queue.emit('jobRemoved', { jobId, reason: options.reason || 'manual' });
        
        return {
          success: true,
          jobId,
          removedJob: job
        };
      } else {
        return {
          success: false,
          error: 'Failed to remove job from queue'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reorder jobs in the queue
   * @param {Array} reorderInstructions - Array of {jobId, newPosition} objects
   * @returns {Object} Operation result
   */
  reorderJobs(reorderInstructions) {
    if (!this.config.enableReordering) {
      return {
        success: false,
        error: 'Job reordering is disabled'
      };
    }

    try {
      const results = [];
      const failedOperations = [];

      for (const instruction of reorderInstructions) {
        const result = this.moveJobToPosition(instruction.jobId, instruction.newPosition);
        if (result.success) {
          results.push(result);
        } else {
          failedOperations.push({ instruction, error: result.error });
        }
      }

      return {
        success: failedOperations.length === 0,
        successfulMoves: results.length,
        failedMoves: failedOperations.length,
        failures: failedOperations
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Move a job to a specific position in its priority queue
   * @param {string} jobId - Job ID to move
   * @param {number} newPosition - New position (0-based)
   * @returns {Object} Operation result
   */
  moveJobToPosition(jobId, newPosition) {
    try {
      const job = this.findJobInQueue(jobId);
      if (!job) {
        return {
          success: false,
          error: `Job ${jobId} not found`
        };
      }

      const priorityQueue = this.queue.priorityQueues.get(job.priority);
      const currentIndex = priorityQueue.findIndex(j => j.id === jobId);
      
      if (currentIndex === -1) {
        return {
          success: false,
          error: 'Job not found in priority queue'
        };
      }

      // Validate new position
      const maxPosition = priorityQueue.length - 1;
      const targetPosition = Math.max(0, Math.min(newPosition, maxPosition));

      if (currentIndex === targetPosition) {
        return {
          success: true,
          message: 'Job already at target position'
        };
      }

      // Remove job from current position
      const [movedJob] = priorityQueue.splice(currentIndex, 1);
      
      // Insert at new position
      priorityQueue.splice(targetPosition, 0, movedJob);

      this.recordOperation('reorder', {
        jobId,
        fromPosition: currentIndex,
        toPosition: targetPosition
      });

      this.queue.emit('jobReordered', {
        jobId,
        oldPosition: currentIndex,
        newPosition: targetPosition,
        priority: job.priority
      });

      return {
        success: true,
        jobId,
        oldPosition: currentIndex,
        newPosition: targetPosition
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Batch add multiple jobs
   * @param {Array} jobs - Array of jobs to add
   * @param {Object} options - Batch options
   * @returns {Object} Batch operation result
   */
  async batchAddJobs(jobs, options = {}) {
    if (!this.config.enableBatchOperations) {
      return {
        success: false,
        error: 'Batch operations are disabled'
      };
    }

    const results = {
      successful: [],
      failed: [],
      duplicates: [],
      totalProcessed: 0
    };

    for (const job of jobs) {
      results.totalProcessed++;
      
      const result = await this.addJob(job, options);
      if (result.success) {
        results.successful.push({ jobId: result.jobId, job });
      } else if (result.error === 'Duplicate job detected') {
        results.duplicates.push({ job, duplicateJobId: result.duplicateJobId });
      } else {
        results.failed.push({ job, error: result.error });
      }
    }

    return {
      success: results.failed.length === 0,
      ...results
    };
  }

  /**
   * Batch remove multiple jobs
   * @param {Array} jobIds - Array of job IDs to remove
   * @param {Object} options - Batch options
   * @returns {Object} Batch operation result
   */
  batchRemoveJobs(jobIds, options = {}) {
    if (!this.config.enableBatchOperations) {
      return {
        success: false,
        error: 'Batch operations are disabled'
      };
    }

    const results = {
      successful: [],
      failed: [],
      totalProcessed: 0
    };

    for (const jobId of jobIds) {
      results.totalProcessed++;
      
      const result = this.removeJob(jobId, options);
      if (result.success) {
        results.successful.push({ jobId, removedJob: result.removedJob });
      } else {
        results.failed.push({ jobId, error: result.error });
      }
    }

    return {
      success: results.failed.length === 0,
      ...results
    };
  }

  /**
   * Change priority of multiple jobs
   * @param {Array} jobIds - Job IDs to update
   * @param {string} newPriority - New priority level
   * @returns {Object} Operation result
   */
  batchChangePriority(jobIds, newPriority) {
    const results = {
      successful: [],
      failed: []
    };

    for (const jobId of jobIds) {
      const success = this.queue.changeJobPriority(jobId, newPriority);
      if (success) {
        results.successful.push(jobId);
      } else {
        results.failed.push(jobId);
      }
    }

    return {
      success: results.failed.length === 0,
      ...results
    };
  }

  /**
   * Find duplicate job based on configured fields
   * @param {ConversionJob} job - Job to check for duplicates
   * @returns {ConversionJob|null} Duplicate job or null
   */
  findDuplicateJob(job) {
    for (const cachedJob of this.jobCache.values()) {
      if (this.isDuplicateJob(job, cachedJob)) {
        return cachedJob;
      }
    }
    return null;
  }

  /**
   * Check if two jobs are duplicates based on configured fields
   * @param {ConversionJob} job1 - First job
   * @param {ConversionJob} job2 - Second job
   * @returns {boolean} True if jobs are duplicates
   */
  isDuplicateJob(job1, job2) {
    if (job1.id === job2.id) return false; // Same job
    
    return this.config.duplicateCheckFields.every(field => {
      return job1[field] === job2[field];
    });
  }

  /**
   * Find a job in the queue by ID
   * @param {string} jobId - Job ID to find
   * @returns {ConversionJob|null} Found job or null
   */
  findJobInQueue(jobId) {
    return this.jobCache.get(jobId) || null;
  }

  /**
   * Remove job from its priority queue
   * @param {ConversionJob} job - Job to remove
   * @returns {boolean} Success status
   */
  removeJobFromPriorityQueue(job) {
    const priorityQueue = this.queue.priorityQueues.get(job.priority);
    const index = priorityQueue.findIndex(j => j.id === job.id);
    
    if (index !== -1) {
      priorityQueue.splice(index, 1);
      this.queue.stats.queuedJobs--;
      this.queue.updateQueueStats();
      return true;
    }
    
    return false;
  }

  /**
   * Get queue statistics and information
   * @returns {Object} Queue statistics
   */
  getQueueInfo() {
    return {
      totalJobs: this.queue.getQueueSize(),
      priorityStats: this.queue.getPriorityStats(),
      queueStats: this.queue.getStats(),
      config: this.config,
      operationHistory: this.operationHistory.slice(-10) // Last 10 operations
    };
  }

  /**
   * Get all jobs in queue with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered jobs
   */
  getJobs(filters = {}) {
    let jobs = Array.from(this.jobCache.values());
    
    if (filters.priority) {
      jobs = jobs.filter(job => job.priority === filters.priority);
    }
    
    if (filters.status) {
      jobs = jobs.filter(job => job.status === filters.status);
    }
    
    if (filters.conversionType) {
      jobs = jobs.filter(job => job.conversionType === filters.conversionType);
    }
    
    return jobs;
  }

  /**
   * Clear the entire queue
   * @param {Object} options - Clear options
   * @returns {Object} Operation result
   */
  clearQueue(options = {}) {
    try {
      const jobCount = this.queue.getQueueSize();
      
      if (!options.force && jobCount > 0) {
        return {
          success: false,
          error: 'Queue not empty, use force flag to clear'
        };
      }

      this.queue.clear();
      this.jobCache.clear();
      
      this.recordOperation('clear', { clearedJobs: jobCount });
      
      return {
        success: true,
        clearedJobs: jobCount
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Record operation in history for potential undo
   * @param {string} operation - Operation type
   * @param {Object} data - Operation data
   */
  recordOperation(operation, data) {
    this.operationHistory.push({
      operation,
      data,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory.shift();
    }
  }

  /**
   * Start the queue processing
   * @returns {boolean} Success status
   */
  start() {
    return this.queue.start();
  }

  /**
   * Stop the queue processing
   * @returns {boolean} Success status
   */
  stop() {
    return this.queue.stop();
  }

  /**
   * Pause the queue processing
   * @returns {boolean} Success status
   */
  pause() {
    return this.queue.pause();
  }

  /**
   * Resume the queue processing
   * @returns {boolean} Success status
   */
  resume() {
    return this.queue.resume();
  }

  /**
   * Get the underlying queue instance
   * @returns {PriorityJobQueue} Queue instance
   */
  getQueue() {
    return this.queue;
  }

  /**
   * Re-queue a job for processing
   * @param {string} jobId - Job ID to re-queue
   * @param {Object} options - Re-queue options
   * @returns {Object} Operation result
   */
  async reQueueJob(jobId, options = {}) {
    try {
      // Validate job exists
      const job = this.queue.getJob(jobId);
      if (!job) {
        return {
          success: false,
          error: `Job ${jobId} not found`
        };
      }

      // Validate job can be re-queued
      const validation = await this.validator.validateJobRequeue(job, options);
      if (!validation.isValid) {
        return {
          success: false,
          error: 'Job re-queue validation failed',
          details: validation.errors
        };
      }

      // Check queue size limit
      if (this.queue.getQueueSize() >= this.config.maxQueueSize) {
        return {
          success: false,
          error: 'Queue size limit exceeded',
          maxSize: this.config.maxQueueSize
        };
      }

      // Re-queue the job
      const success = this.queue.reQueueJob(jobId, options);
      if (success) {
        // Record operation
        this.recordOperation('requeue', {
          jobId,
          options,
          timestamp: new Date()
        });

        return {
          success: true,
          jobId,
          queuePosition: this.queue.getQueuePosition(jobId),
          estimatedWaitTime: this.queue.estimateWaitTime(job)
        };
      } else {
        return {
          success: false,
          error: 'Failed to re-queue job'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reset a job for re-queueing
   * @param {string} jobId - Job ID to reset
   * @returns {Object} Operation result
   */
  resetJob(jobId) {
    try {
      const success = this.queue.resetJob(jobId);
      if (success) {
        this.recordOperation('reset', {
          jobId,
          timestamp: new Date()
        });

        return {
          success: true,
          jobId
        };
      } else {
        return {
          success: false,
          error: 'Failed to reset job'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default QueueManager;