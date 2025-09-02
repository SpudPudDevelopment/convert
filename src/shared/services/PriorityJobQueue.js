import { JobQueue } from './JobQueue.js';
import { JobPriority } from '../types/jobEnums.js';
import { globalJobNotifier } from '../events/jobEvents.js';

/**
 * Priority-based job queue that schedules jobs based on priority levels
 * Higher priority jobs are processed before lower priority ones
 */
export class PriorityJobQueue extends JobQueue {
  constructor(config = {}) {
    super(config);
    
    // Priority queues for different priority levels
    this.priorityQueues = new Map([
      [JobPriority.CRITICAL, []],
      [JobPriority.HIGH, []],
      [JobPriority.NORMAL, []],
      [JobPriority.LOW, []]
    ]);
    
    // Priority weights for scheduling decisions
    this.priorityWeights = {
      [JobPriority.CRITICAL]: 1000,
      [JobPriority.HIGH]: 100,
      [JobPriority.NORMAL]: 10,
      [JobPriority.LOW]: 1
    };
    
    // Age-based priority boost configuration
    this.agingConfig = {
      enabled: config.enableAging !== false,
      boostInterval: config.agingBoostInterval || 300000, // 5 minutes
      maxBoost: config.maxAgingBoost || 50
    };
    
    // Starvation prevention
    this.starvationPrevention = {
      enabled: config.preventStarvation !== false,
      maxWaitTime: config.maxWaitTime || 600000, // 10 minutes
      emergencyBoost: config.emergencyBoost || 200
    };
    
    // Start aging timer if enabled
    if (this.agingConfig.enabled) {
      this.startAgingTimer();
    }
  }

  /**
   * Add a job to the appropriate priority queue
   * @param {ConversionJob} job - Job to add
   * @returns {boolean} Success status
   */
  addJob(job) {
    try {
      if (!job || typeof job !== 'object') {
        throw new Error('Invalid job object');
      }

      // Validate job priority
      const priority = job.priority || JobPriority.NORMAL;
      if (!Object.values(JobPriority).includes(priority)) {
        job.priority = JobPriority.NORMAL;
      }

      // Add timestamp for aging calculations
      job.queuedAt = Date.now();
      job.originalPriority = job.priority;
      job.priorityBoost = 0;

      // Add to appropriate priority queue
      const priorityQueue = this.priorityQueues.get(job.priority);
      priorityQueue.push(job);

      // Update statistics
      this.stats.totalJobs++;
      this.stats.queuedJobs++;
      this.updateQueueStats();

      // Emit events
      this.emit('jobAdded', { job, queueSize: this.getQueueSize() });
      globalJobNotifier.emit('jobQueued', {
        jobId: job.id,
        priority: job.priority,
        queuePosition: this.getJobPosition(job.id),
        estimatedWaitTime: this.estimateWaitTime(job)
      });

      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Get the next job to process based on priority
   * @returns {ConversionJob|null} Next job or null if queue is empty
   */
  getNextJob() {
    // Check for emergency priority boosts due to starvation
    if (this.starvationPrevention.enabled) {
      this.checkForStarvation();
    }

    // Process queues in priority order
    for (const [priority, queue] of this.priorityQueues) {
      if (queue.length > 0) {
        // For same priority, use FIFO or consider aging
        const job = this.selectJobFromQueue(queue);
        if (job) {
          // Remove from queue
          const index = queue.indexOf(job);
          queue.splice(index, 1);
          
          this.stats.queuedJobs--;
          this.updateQueueStats();
          
          return job;
        }
      }
    }

    return null;
  }

  /**
   * Select job from a priority queue considering aging and other factors
   * @param {Array} queue - Priority queue to select from
   * @returns {ConversionJob|null} Selected job
   */
  selectJobFromQueue(queue) {
    if (queue.length === 0) return null;
    if (queue.length === 1) return queue[0];

    // If aging is disabled, just return first job (FIFO)
    if (!this.agingConfig.enabled) {
      return queue[0];
    }

    // Consider aging and priority boosts
    let bestJob = queue[0];
    let bestScore = this.calculateJobScore(bestJob);

    for (let i = 1; i < queue.length; i++) {
      const job = queue[i];
      const score = this.calculateJobScore(job);
      
      if (score > bestScore) {
        bestJob = job;
        bestScore = score;
      }
    }

    return bestJob;
  }

  /**
   * Calculate job selection score based on priority, age, and boosts
   * @param {ConversionJob} job - Job to score
   * @returns {number} Job score
   */
  calculateJobScore(job) {
    const basePriority = this.priorityWeights[job.priority] || this.priorityWeights[JobPriority.NORMAL];
    const ageBonus = this.calculateAgeBonus(job);
    const priorityBoost = job.priorityBoost || 0;
    
    return basePriority + ageBonus + priorityBoost;
  }

  /**
   * Calculate age-based priority bonus
   * @param {ConversionJob} job - Job to calculate bonus for
   * @returns {number} Age bonus
   */
  calculateAgeBonus(job) {
    if (!this.agingConfig.enabled || !job.queuedAt) return 0;
    
    const age = Date.now() - job.queuedAt;
    const intervals = Math.floor(age / this.agingConfig.boostInterval);
    
    return Math.min(intervals * 5, this.agingConfig.maxBoost);
  }

  /**
   * Check for job starvation and apply emergency boosts
   */
  checkForStarvation() {
    const now = Date.now();
    
    for (const [priority, queue] of this.priorityQueues) {
      for (const job of queue) {
        if (job.queuedAt && (now - job.queuedAt) > this.starvationPrevention.maxWaitTime) {
          if (!job.emergencyBoosted) {
            job.priorityBoost = (job.priorityBoost || 0) + this.starvationPrevention.emergencyBoost;
            job.emergencyBoosted = true;
            
            this.emit('jobStarvationPrevented', {
              jobId: job.id,
              waitTime: now - job.queuedAt,
              newBoost: job.priorityBoost
            });
          }
        }
      }
    }
  }

  /**
   * Start the aging timer for periodic priority boosts
   */
  startAgingTimer() {
    if (this.agingTimer) {
      clearInterval(this.agingTimer);
    }
    
    this.agingTimer = setInterval(() => {
      this.processAging();
    }, this.agingConfig.boostInterval);
  }

  /**
   * Process aging for all queued jobs
   */
  processAging() {
    let boostedJobs = 0;
    
    for (const [priority, queue] of this.priorityQueues) {
      for (const job of queue) {
        const oldBonus = this.calculateAgeBonus(job);
        // Age bonus is calculated dynamically, but we can track it
        if (oldBonus > (job.lastAgeBonus || 0)) {
          job.lastAgeBonus = oldBonus;
          boostedJobs++;
        }
      }
    }
    
    if (boostedJobs > 0) {
      this.emit('agingProcessed', { boostedJobs });
    }
  }

  /**
   * Get job position in queue considering priority
   * @param {string} jobId - Job ID to find
   * @returns {number} Position in queue (1-based)
   */
  getJobPosition(jobId) {
    let position = 1;
    
    // Count jobs in higher priority queues first
    for (const [priority, queue] of this.priorityQueues) {
      for (const job of queue) {
        if (job.id === jobId) {
          return position;
        }
        position++;
      }
    }
    
    return -1; // Job not found
  }

  /**
   * Estimate wait time for a job
   * @param {ConversionJob} job - Job to estimate for
   * @returns {number} Estimated wait time in milliseconds
   */
  estimateWaitTime(job) {
    const position = this.getJobPosition(job.id);
    if (position === -1) return 0;
    
    // Estimate based on average processing time and position
    const avgProcessingTime = this.stats.averageProcessingTime || 30000; // 30 seconds default
    const concurrency = this.config.maxConcurrentJobs || 1;
    
    return Math.max(0, Math.ceil((position - 1) / concurrency) * avgProcessingTime);
  }

  /**
   * Change job priority
   * @param {string} jobId - Job ID
   * @param {string} newPriority - New priority level
   * @returns {boolean} Success status
   */
  changeJobPriority(jobId, newPriority) {
    try {
      if (!Object.values(JobPriority).includes(newPriority)) {
        throw new Error(`Invalid priority: ${newPriority}`);
      }

      // Find and remove job from current queue
      let job = null;
      for (const [priority, queue] of this.priorityQueues) {
        const index = queue.findIndex(j => j.id === jobId);
        if (index !== -1) {
          job = queue.splice(index, 1)[0];
          break;
        }
      }

      if (!job) {
        throw new Error(`Job ${jobId} not found in queue`);
      }

      // Update priority and add to new queue
      const oldPriority = job.priority;
      job.priority = newPriority;
      this.priorityQueues.get(newPriority).push(job);

      this.emit('jobPriorityChanged', {
        jobId,
        oldPriority,
        newPriority,
        newPosition: this.getJobPosition(jobId)
      });

      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Get queue statistics by priority
   * @returns {Object} Priority-based statistics
   */
  getPriorityStats() {
    const stats = {};
    
    for (const [priority, queue] of this.priorityQueues) {
      stats[priority] = {
        count: queue.length,
        oldestJob: queue.length > 0 ? Math.min(...queue.map(j => j.queuedAt || Date.now())) : null,
        averageWaitTime: this.calculateAverageWaitTime(queue)
      };
    }
    
    return stats;
  }

  /**
   * Calculate average wait time for jobs in a queue
   * @param {Array} queue - Queue to analyze
   * @returns {number} Average wait time in milliseconds
   */
  calculateAverageWaitTime(queue) {
    if (queue.length === 0) return 0;
    
    const now = Date.now();
    const totalWaitTime = queue.reduce((sum, job) => {
      return sum + (job.queuedAt ? now - job.queuedAt : 0);
    }, 0);
    
    return totalWaitTime / queue.length;
  }

  /**
   * Get total queue size across all priorities
   * @returns {number} Total number of queued jobs
   */
  getQueueSize() {
    return Array.from(this.priorityQueues.values())
      .reduce((total, queue) => total + queue.length, 0);
  }

  /**
   * Update queue statistics
   */
  updateQueueStats() {
    this.stats.queueSize = this.getQueueSize();
    this.stats.priorityStats = this.getPriorityStats();
    this.stats.lastUpdated = Date.now();
  }

  /**
   * Clear all queues
   */
  clear() {
    for (const queue of this.priorityQueues.values()) {
      queue.length = 0;
    }
    
    this.stats.queuedJobs = 0;
    this.updateQueueStats();
    
    this.emit('queueCleared');
  }

  /**
   * Stop the queue and cleanup
   */
  stop() {
    super.stop();
    
    if (this.agingTimer) {
      clearInterval(this.agingTimer);
      this.agingTimer = null;
    }
  }

  /**
   * Serialize queue state to JSON
   * @returns {Object} Serialized state
   */
  toJSON() {
    const baseState = super.toJSON();
    
    return {
      ...baseState,
      priorityQueues: Object.fromEntries(
        Array.from(this.priorityQueues.entries()).map(([priority, queue]) => [
          priority,
          queue.map(job => job.toJSON ? job.toJSON() : job)
        ])
      ),
      priorityWeights: this.priorityWeights,
      agingConfig: this.agingConfig,
      starvationPrevention: this.starvationPrevention
    };
  }

  /**
   * Restore queue state from JSON
   * @param {Object} data - Serialized state
   * @returns {PriorityJobQueue} Restored queue instance
   */
  static fromJSON(data) {
    const queue = new PriorityJobQueue(data.config);
    
    // Restore base state
    Object.assign(queue, data);
    
    // Restore priority queues
    if (data.priorityQueues) {
      for (const [priority, jobs] of Object.entries(data.priorityQueues)) {
        queue.priorityQueues.set(priority, jobs);
      }
    }
    
    // Restart aging timer if needed
    if (queue.agingConfig.enabled) {
      queue.startAgingTimer();
    }
    
    return queue;
  }
}

export default PriorityJobQueue;