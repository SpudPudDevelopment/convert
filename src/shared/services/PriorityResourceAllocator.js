/**
 * Priority-Based Resource Allocation System
 * Advanced resource allocation with priority queues and preemption
 */

const { EventEmitter } = require('events');
const { ResourceAllocationStrategy, AllocationStrategy, AllocationEvents } = require('./ResourceAllocationStrategy');

/**
 * Job priority levels
 */
const JobPriority = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  BACKGROUND: 'background'
};

/**
 * Priority weights for resource allocation
 */
const PriorityWeights = {
  [JobPriority.CRITICAL]: 10,
  [JobPriority.HIGH]: 5,
  [JobPriority.MEDIUM]: 3,
  [JobPriority.LOW]: 2,
  [JobPriority.BACKGROUND]: 1
};

/**
 * Priority allocation events
 */
const PriorityAllocationEvents = {
  JOB_QUEUED: 'job_queued',
  JOB_PREEMPTED: 'job_preempted',
  JOB_PROMOTED: 'job_promoted',
  JOB_DEMOTED: 'job_demoted',
  PRIORITY_CHANGED: 'priority_changed',
  QUEUE_REORDERED: 'queue_reordered',
  RESOURCE_STOLEN: 'resource_stolen',
  STARVATION_DETECTED: 'starvation_detected'
};

/**
 * Queued job representation
 */
class QueuedJob {
  constructor(jobId, conversionType, priority, fileSize, requestedAt) {
    this.jobId = jobId;
    this.conversionType = conversionType;
    this.priority = priority;
    this.fileSize = fileSize;
    this.requestedAt = requestedAt;
    this.queuedAt = Date.now();
    this.waitTime = 0;
    this.promotionCount = 0;
    this.lastPromotionAt = null;
    this.estimatedDuration = 0;
    this.resourceRequirement = null;
  }

  updateWaitTime() {
    this.waitTime = Date.now() - this.queuedAt;
  }

  promote() {
    const priorities = Object.values(JobPriority);
    const currentIndex = priorities.indexOf(this.priority);
    if (currentIndex > 0) {
      this.priority = priorities[currentIndex - 1];
      this.promotionCount++;
      this.lastPromotionAt = Date.now();
      return true;
    }
    return false;
  }

  demote() {
    const priorities = Object.values(JobPriority);
    const currentIndex = priorities.indexOf(this.priority);
    if (currentIndex < priorities.length - 1) {
      this.priority = priorities[currentIndex + 1];
      return true;
    }
    return false;
  }

  getScore() {
    const priorityWeight = PriorityWeights[this.priority] || 1;
    const ageBonus = Math.min(5, this.waitTime / (60 * 1000)); // Max 5 points for 1 minute wait
    const sizeBonus = this.fileSize > 0 ? Math.log10(this.fileSize / (1024 * 1024)) : 0; // Log scale for file size
    
    return priorityWeight + ageBonus + sizeBonus;
  }

  toJSON() {
    return {
      jobId: this.jobId,
      conversionType: this.conversionType,
      priority: this.priority,
      fileSize: this.fileSize,
      requestedAt: this.requestedAt,
      queuedAt: this.queuedAt,
      waitTime: this.waitTime,
      promotionCount: this.promotionCount,
      lastPromotionAt: this.lastPromotionAt,
      estimatedDuration: this.estimatedDuration,
      score: this.getScore()
    };
  }
}

/**
 * Priority-based resource allocator
 */
class PriorityResourceAllocator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      maxQueueSize: options.maxQueueSize || 100,
      starvationThreshold: options.starvationThreshold || 300000, // 5 minutes
      promotionInterval: options.promotionInterval || 60000, // 1 minute
      preemptionEnabled: options.preemptionEnabled !== false,
      agingEnabled: options.agingEnabled !== false,
      fairnessWeight: options.fairnessWeight || 0.3,
      resourceStealingEnabled: options.resourceStealingEnabled !== false,
      minResourceGuarantee: {
        [JobPriority.CRITICAL]: 0.8,
        [JobPriority.HIGH]: 0.6,
        [JobPriority.MEDIUM]: 0.4,
        [JobPriority.LOW]: 0.2,
        [JobPriority.BACKGROUND]: 0.1
      },
      ...options
    };
    
    // Initialize base allocation strategy
    this.allocationStrategy = new ResourceAllocationStrategy({
      strategy: AllocationStrategy.PRIORITY,
      ...options
    });
    
    // Priority queues
    this.priorityQueues = {
      [JobPriority.CRITICAL]: [],
      [JobPriority.HIGH]: [],
      [JobPriority.MEDIUM]: [],
      [JobPriority.LOW]: [],
      [JobPriority.BACKGROUND]: []
    };
    
    this.activeJobs = new Map(); // jobId -> QueuedJob
    this.preemptedJobs = new Map(); // jobId -> QueuedJob
    this.allocationHistory = [];
    
    this.isRunning = false;
    this.promotionTimer = null;
    this.starvationCheckTimer = null;
    
    // Bind allocation strategy events
    this._bindAllocationEvents();
  }

  /**
   * Start the priority allocator
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.allocationStrategy.start();
    
    if (this.config.agingEnabled) {
      this._startPromotionTimer();
    }
    
    this._startStarvationCheck();
  }

  /**
   * Stop the priority allocator
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.allocationStrategy.stop();
    
    this._stopPromotionTimer();
    this._stopStarvationCheck();
    
    // Clear all queues
    for (const queue of Object.values(this.priorityQueues)) {
      queue.length = 0;
    }
    
    this.activeJobs.clear();
    this.preemptedJobs.clear();
  }

  /**
   * Request resource allocation with priority
   */
  requestAllocation(jobId, conversionType, priority = JobPriority.MEDIUM, fileSize = 0) {
    try {
      // Validate priority
      if (!Object.values(JobPriority).includes(priority)) {
        priority = JobPriority.MEDIUM;
      }
      
      // Create queued job
      const queuedJob = new QueuedJob(jobId, conversionType, priority, fileSize, Date.now());
      
      // Try immediate allocation for critical jobs
      if (priority === JobPriority.CRITICAL) {
        const allocation = this._tryImmediateAllocation(queuedJob);
        if (allocation) {
          this.activeJobs.set(jobId, queuedJob);
          return allocation;
        }
        
        // If immediate allocation fails, try preemption
        if (this.config.preemptionEnabled) {
          const preemptedAllocation = this._tryPreemption(queuedJob);
          if (preemptedAllocation) {
            this.activeJobs.set(jobId, queuedJob);
            return preemptedAllocation;
          }
        }
      }
      
      // Queue the job
      this._queueJob(queuedJob);
      
      // Try to process queue
      this._processQueue();
      
      return null; // Job is queued
    } catch (error) {
      this.emit(PriorityAllocationEvents.JOB_QUEUED, {
        jobId,
        error: error.message,
        timestamp: Date.now()
      });
      return null;
    }
  }

  /**
   * Release allocation and process queue
   */
  releaseAllocation(jobId) {
    const released = this.allocationStrategy.releaseAllocation(jobId);
    
    if (released) {
      this.activeJobs.delete(jobId);
      
      // Check if any preempted jobs can be restored
      this._restorePreemptedJobs();
      
      // Process queue for new allocations
      this._processQueue();
    }
    
    return released;
  }

  /**
   * Change job priority
   */
  changeJobPriority(jobId, newPriority) {
    if (!Object.values(JobPriority).includes(newPriority)) {
      throw new Error(`Invalid priority: ${newPriority}`);
    }
    
    // Check active jobs
    const activeJob = this.activeJobs.get(jobId);
    if (activeJob) {
      const oldPriority = activeJob.priority;
      activeJob.priority = newPriority;
      
      this.emit(PriorityAllocationEvents.PRIORITY_CHANGED, {
        jobId,
        oldPriority,
        newPriority,
        timestamp: Date.now()
      });
      
      // Rebalance if priority decreased significantly
      if (PriorityWeights[newPriority] < PriorityWeights[oldPriority] / 2) {
        this._rebalanceAllocations();
      }
      
      return true;
    }
    
    // Check queued jobs
    for (const [priority, queue] of Object.entries(this.priorityQueues)) {
      const jobIndex = queue.findIndex(job => job.jobId === jobId);
      if (jobIndex !== -1) {
        const job = queue.splice(jobIndex, 1)[0];
        job.priority = newPriority;
        this.priorityQueues[newPriority].push(job);
        
        this._sortQueue(newPriority);
        
        this.emit(PriorityAllocationEvents.PRIORITY_CHANGED, {
          jobId,
          oldPriority: priority,
          newPriority,
          timestamp: Date.now()
        });
        
        // Try to process queue
        this._processQueue();
        
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    const queueSizes = {};
    const totalQueued = Object.entries(this.priorityQueues).reduce((total, [priority, queue]) => {
      queueSizes[priority] = queue.length;
      return total + queue.length;
    }, 0);
    
    return {
      totalQueued,
      queueSizes,
      activeJobs: this.activeJobs.size,
      preemptedJobs: this.preemptedJobs.size,
      allocationStrategy: this.allocationStrategy.getStatistics()
    };
  }

  /**
   * Get detailed queue information
   */
  getDetailedQueueInfo() {
    const queues = {};
    
    for (const [priority, queue] of Object.entries(this.priorityQueues)) {
      queues[priority] = queue.map(job => {
        job.updateWaitTime();
        return job.toJSON();
      });
    }
    
    return {
      queues,
      activeJobs: Array.from(this.activeJobs.values()).map(job => job.toJSON()),
      preemptedJobs: Array.from(this.preemptedJobs.values()).map(job => job.toJSON()),
      statistics: this.getQueueStatus()
    };
  }

  /**
   * Try immediate allocation
   */
  _tryImmediateAllocation(queuedJob) {
    return this.allocationStrategy.requestAllocation(
      queuedJob.jobId,
      queuedJob.conversionType,
      queuedJob.priority,
      queuedJob.fileSize
    );
  }

  /**
   * Try preemption for high-priority jobs
   */
  _tryPreemption(queuedJob) {
    if (!this.config.preemptionEnabled) return null;
    
    // Find lower priority active jobs that can be preempted
    const candidatesForPreemption = [];
    
    for (const [jobId, activeJob] of this.activeJobs.entries()) {
      if (PriorityWeights[activeJob.priority] < PriorityWeights[queuedJob.priority]) {
        const allocation = this.allocationStrategy.getAllocation(jobId);
        if (allocation) {
          candidatesForPreemption.push({
            jobId,
            activeJob,
            allocation,
            priorityDiff: PriorityWeights[queuedJob.priority] - PriorityWeights[activeJob.priority]
          });
        }
      }
    }
    
    if (candidatesForPreemption.length === 0) return null;
    
    // Sort by priority difference (preempt lowest priority first)
    candidatesForPreemption.sort((a, b) => b.priorityDiff - a.priorityDiff);
    
    // Preempt the lowest priority job
    const victim = candidatesForPreemption[0];
    
    // Move victim to preempted jobs
    this.preemptedJobs.set(victim.jobId, victim.activeJob);
    this.activeJobs.delete(victim.jobId);
    
    this.emit(PriorityAllocationEvents.JOB_PREEMPTED, {
      preemptedJobId: victim.jobId,
      preemptingJobId: queuedJob.jobId,
      preemptedPriority: victim.activeJob.priority,
      preemptingPriority: queuedJob.priority,
      timestamp: Date.now()
    });
    
    // Try to allocate resources to the new job
    return this.allocationStrategy.requestAllocation(
      queuedJob.jobId,
      queuedJob.conversionType,
      queuedJob.priority,
      queuedJob.fileSize
    );
  }

  /**
   * Queue a job in the appropriate priority queue
   */
  _queueJob(queuedJob) {
    const queue = this.priorityQueues[queuedJob.priority];
    
    if (queue.length >= this.config.maxQueueSize) {
      throw new Error(`Queue full for priority ${queuedJob.priority}`);
    }
    
    queue.push(queuedJob);
    this._sortQueue(queuedJob.priority);
    
    this.emit(PriorityAllocationEvents.JOB_QUEUED, {
      jobId: queuedJob.jobId,
      priority: queuedJob.priority,
      queuePosition: queue.length,
      timestamp: Date.now()
    });
  }

  /**
   * Sort queue by score (priority + aging + size)
   */
  _sortQueue(priority) {
    const queue = this.priorityQueues[priority];
    queue.sort((a, b) => {
      a.updateWaitTime();
      b.updateWaitTime();
      return b.getScore() - a.getScore();
    });
  }

  /**
   * Process queues to allocate resources
   */
  _processQueue() {
    if (!this.isRunning) return;
    
    // Process queues in priority order
    const priorities = Object.values(JobPriority);
    
    for (const priority of priorities) {
      const queue = this.priorityQueues[priority];
      
      while (queue.length > 0) {
        const job = queue[0];
        const allocation = this._tryImmediateAllocation(job);
        
        if (allocation) {
          // Remove from queue and add to active
          queue.shift();
          this.activeJobs.set(job.jobId, job);
          
          this.emit(PriorityAllocationEvents.JOB_QUEUED, {
            jobId: job.jobId,
            priority: job.priority,
            allocated: true,
            waitTime: job.waitTime,
            timestamp: Date.now()
          });
        } else {
          // Can't allocate, stop processing this queue
          break;
        }
      }
    }
  }

  /**
   * Restore preempted jobs when resources become available
   */
  _restorePreemptedJobs() {
    const preemptedJobs = Array.from(this.preemptedJobs.values())
      .sort((a, b) => PriorityWeights[b.priority] - PriorityWeights[a.priority]);
    
    for (const job of preemptedJobs) {
      const allocation = this._tryImmediateAllocation(job);
      if (allocation) {
        this.preemptedJobs.delete(job.jobId);
        this.activeJobs.set(job.jobId, job);
        
        this.emit(PriorityAllocationEvents.JOB_QUEUED, {
          jobId: job.jobId,
          priority: job.priority,
          restored: true,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Rebalance allocations based on current priorities
   */
  _rebalanceAllocations() {
    // Implementation for rebalancing resources among active jobs
    // This is a complex operation that would redistribute resources
    // based on current priorities and system state
  }

  /**
   * Start promotion timer for aging
   */
  _startPromotionTimer() {
    if (this.promotionTimer) return;
    
    this.promotionTimer = setInterval(() => {
      this._promoteAgedJobs();
    }, this.config.promotionInterval);
  }

  /**
   * Stop promotion timer
   */
  _stopPromotionTimer() {
    if (this.promotionTimer) {
      clearInterval(this.promotionTimer);
      this.promotionTimer = null;
    }
  }

  /**
   * Start starvation check timer
   */
  _startStarvationCheck() {
    this.starvationCheckTimer = setInterval(() => {
      this._checkForStarvation();
    }, this.config.starvationThreshold / 2);
  }

  /**
   * Stop starvation check timer
   */
  _stopStarvationCheck() {
    if (this.starvationCheckTimer) {
      clearInterval(this.starvationCheckTimer);
      this.starvationCheckTimer = null;
    }
  }

  /**
   * Promote aged jobs
   */
  _promoteAgedJobs() {
    const now = Date.now();
    
    for (const [priority, queue] of Object.entries(this.priorityQueues)) {
      for (const job of queue) {
        job.updateWaitTime();
        
        // Promote if job has been waiting too long
        if (job.waitTime > this.config.promotionInterval * 2) {
          if (job.promote()) {
            // Move to higher priority queue
            const jobIndex = queue.indexOf(job);
            queue.splice(jobIndex, 1);
            this.priorityQueues[job.priority].push(job);
            this._sortQueue(job.priority);
            
            this.emit(PriorityAllocationEvents.JOB_PROMOTED, {
              jobId: job.jobId,
              oldPriority: priority,
              newPriority: job.priority,
              waitTime: job.waitTime,
              timestamp: now
            });
          }
        }
      }
    }
  }

  /**
   * Check for job starvation
   */
  _checkForStarvation() {
    const now = Date.now();
    
    for (const [priority, queue] of Object.entries(this.priorityQueues)) {
      for (const job of queue) {
        job.updateWaitTime();
        
        if (job.waitTime > this.config.starvationThreshold) {
          this.emit(PriorityAllocationEvents.STARVATION_DETECTED, {
            jobId: job.jobId,
            priority: job.priority,
            waitTime: job.waitTime,
            queuePosition: queue.indexOf(job),
            timestamp: now
          });
        }
      }
    }
  }

  /**
   * Bind allocation strategy events
   */
  _bindAllocationEvents() {
    this.allocationStrategy.on(AllocationEvents.RESOURCE_RESERVED, (data) => {
      this.emit(AllocationEvents.RESOURCE_RESERVED, data);
    });
    
    this.allocationStrategy.on(AllocationEvents.RESOURCE_RELEASED, (data) => {
      this.emit(AllocationEvents.RESOURCE_RELEASED, data);
    });
    
    this.allocationStrategy.on(AllocationEvents.ALLOCATION_FAILED, (data) => {
      this.emit(AllocationEvents.ALLOCATION_FAILED, data);
    });
  }
}

/**
 * Global priority resource allocator instance
 */
let globalPriorityResourceAllocator = null;

function getGlobalPriorityResourceAllocator(options = {}) {
  if (!globalPriorityResourceAllocator) {
    globalPriorityResourceAllocator = new PriorityResourceAllocator(options);
  }
  return globalPriorityResourceAllocator;
}

module.exports = {
  PriorityResourceAllocator,
  JobPriority,
  PriorityWeights,
  PriorityAllocationEvents,
  QueuedJob,
  getGlobalPriorityResourceAllocator
};