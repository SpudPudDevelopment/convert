import { EventEmitter } from 'events';
import { JobPriority, JobStatus, ConversionType } from '../types/jobEnums.js';
import { globalJobNotifier } from '../events/jobEvents.js';

/**
 * Resource-aware job scheduler that monitors system resources
 * and schedules jobs based on available CPU, memory, and disk space
 */
export class ResourceAwareScheduler extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Resource monitoring intervals
      monitoringInterval: config.monitoringInterval || 5000, // 5 seconds
      
      // Resource thresholds
      maxCpuUsage: config.maxCpuUsage || 80, // 80%
      maxMemoryUsage: config.maxMemoryUsage || 85, // 85%
      minFreeDiskSpace: config.minFreeDiskSpace || 1024 * 1024 * 1024, // 1GB
      
      // Concurrency limits
      maxConcurrentJobs: config.maxConcurrentJobs || 3,
      maxConcurrentByType: config.maxConcurrentByType || {
        [ConversionType.DOCUMENT]: 2,
        [ConversionType.IMAGE]: 4,
        [ConversionType.AUDIO]: 2,
        [ConversionType.VIDEO]: 1
      },
      
      // Resource requirements by job type
      resourceRequirements: config.resourceRequirements || {
        [ConversionType.DOCUMENT]: { cpu: 20, memory: 256 * 1024 * 1024 }, // 256MB
        [ConversionType.IMAGE]: { cpu: 30, memory: 512 * 1024 * 1024 }, // 512MB
        [ConversionType.AUDIO]: { cpu: 40, memory: 128 * 1024 * 1024 }, // 128MB
        [ConversionType.VIDEO]: { cpu: 70, memory: 1024 * 1024 * 1024 } // 1GB
      },
      
      // Adaptive scheduling
      enableAdaptiveScheduling: config.enableAdaptiveScheduling !== false,
      adaptiveThresholds: config.adaptiveThresholds || {
        low: { cpu: 30, memory: 50 },
        medium: { cpu: 60, memory: 70 },
        high: { cpu: 80, memory: 85 }
      },
      
      // Performance optimization
      enablePerformanceOptimization: config.enablePerformanceOptimization !== false,
      performanceHistory: config.performanceHistory || 50,
      
      ...config
    };
    
    // Current system resources
    this.systemResources = {
      cpu: { usage: 0, cores: 1 },
      memory: { used: 0, total: 0, available: 0 },
      disk: { free: 0, total: 0 },
      lastUpdated: 0
    };
    
    // Currently running jobs
    this.runningJobs = new Map();
    
    // Job performance history
    this.performanceHistory = [];
    
    // Resource monitoring
    this.monitoringTimer = null;
    this.isMonitoring = false;
    
    // Scheduling state
    this.schedulingEnabled = true;
    this.lastScheduleTime = 0;
    
    // Initialize resource monitoring
    this.initializeResourceMonitoring();
  }

  /**
   * Initialize resource monitoring
   */
  initializeResourceMonitoring() {
    // Get initial system info
    this.updateSystemResources();
    
    // Start monitoring timer
    this.startResourceMonitoring();
  }

  /**
   * Start resource monitoring
   */
  startResourceMonitoring() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    this.isMonitoring = true;
    this.monitoringTimer = setInterval(() => {
      this.updateSystemResources();
      this.checkResourceThresholds();
    }, this.config.monitoringInterval);
  }

  /**
   * Stop resource monitoring
   */
  stopResourceMonitoring() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    this.isMonitoring = false;
  }

  /**
   * Update system resource information
   */
  async updateSystemResources() {
    try {
      // In a real implementation, this would use Node.js os module or system calls
      // For now, we'll simulate resource monitoring
      const resources = await this.getSystemResources();
      
      this.systemResources = {
        ...resources,
        lastUpdated: Date.now()
      };
      
      this.emit('resourcesUpdated', this.systemResources);
    } catch (error) {
      this.emit('error', new Error(`Failed to update system resources: ${error.message}`));
    }
  }

  /**
   * Get current system resources (simulated)
   * In production, this would use actual system monitoring
   */
  async getSystemResources() {
    // Simulate system resource monitoring
    // In real implementation, use os.cpus(), process.memoryUsage(), fs.statSync(), etc.
    
    const simulatedLoad = Math.random() * 100;
    const memoryUsage = process.memoryUsage();
    
    return {
      cpu: {
        usage: Math.min(simulatedLoad + (this.runningJobs.size * 15), 100),
        cores: require('os').cpus().length
      },
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        available: memoryUsage.heapTotal - memoryUsage.heapUsed
      },
      disk: {
        free: 10 * 1024 * 1024 * 1024, // 10GB simulated
        total: 100 * 1024 * 1024 * 1024 // 100GB simulated
      }
    };
  }

  /**
   * Check if system resources exceed thresholds
   */
  checkResourceThresholds() {
    const { cpu, memory, disk } = this.systemResources;
    const warnings = [];
    
    if (cpu.usage > this.config.maxCpuUsage) {
      warnings.push(`High CPU usage: ${cpu.usage.toFixed(1)}%`);
    }
    
    const memoryUsagePercent = (memory.used / memory.total) * 100;
    if (memoryUsagePercent > this.config.maxMemoryUsage) {
      warnings.push(`High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
    }
    
    if (disk.free < this.config.minFreeDiskSpace) {
      warnings.push(`Low disk space: ${(disk.free / (1024 * 1024 * 1024)).toFixed(1)}GB`);
    }
    
    if (warnings.length > 0) {
      this.emit('resourceWarning', { warnings, resources: this.systemResources });
      
      // Pause scheduling if resources are critically low
      if (this.shouldPauseScheduling()) {
        this.pauseScheduling('Resource constraints');
      }
    } else if (!this.schedulingEnabled) {
      // Resume scheduling if resources are back to normal
      this.resumeScheduling();
    }
  }

  /**
   * Determine if scheduling should be paused due to resource constraints
   * @returns {boolean} True if scheduling should be paused
   */
  shouldPauseScheduling() {
    const { cpu, memory, disk } = this.systemResources;
    const memoryUsagePercent = (memory.used / memory.total) * 100;
    
    return (
      cpu.usage > this.config.maxCpuUsage + 10 || // 10% buffer
      memoryUsagePercent > this.config.maxMemoryUsage + 5 || // 5% buffer
      disk.free < this.config.minFreeDiskSpace * 0.5 // 50% of minimum
    );
  }

  /**
   * Check if a job can be scheduled based on current resources
   * @param {ConversionJob} job - Job to check
   * @returns {Object} Scheduling decision
   */
  canScheduleJob(job) {
    // Check if scheduling is enabled
    if (!this.schedulingEnabled) {
      return {
        canSchedule: false,
        reason: 'Scheduling is paused due to resource constraints'
      };
    }
    
    // Check concurrency limits
    const concurrencyCheck = this.checkConcurrencyLimits(job);
    if (!concurrencyCheck.allowed) {
      return {
        canSchedule: false,
        reason: concurrencyCheck.reason
      };
    }
    
    // Check resource requirements
    const resourceCheck = this.checkResourceRequirements(job);
    if (!resourceCheck.sufficient) {
      return {
        canSchedule: false,
        reason: resourceCheck.reason,
        estimatedWaitTime: this.estimateResourceWaitTime(job)
      };
    }
    
    return {
      canSchedule: true,
      priority: this.calculateSchedulingPriority(job),
      estimatedDuration: this.estimateJobDuration(job)
    };
  }

  /**
   * Check concurrency limits for job type
   * @param {ConversionJob} job - Job to check
   * @returns {Object} Concurrency check result
   */
  checkConcurrencyLimits(job) {
    // Check total concurrent jobs
    if (this.runningJobs.size >= this.config.maxConcurrentJobs) {
      return {
        allowed: false,
        reason: `Maximum concurrent jobs limit reached (${this.config.maxConcurrentJobs})`
      };
    }
    
    // Check concurrent jobs by type
    const jobsOfType = Array.from(this.runningJobs.values())
      .filter(j => j.conversionType === job.conversionType).length;
    
    const maxForType = this.config.maxConcurrentByType[job.conversionType] || 1;
    if (jobsOfType >= maxForType) {
      return {
        allowed: false,
        reason: `Maximum concurrent ${job.conversionType} jobs limit reached (${maxForType})`
      };
    }
    
    return { allowed: true };
  }

  /**
   * Check if system has sufficient resources for job
   * @param {ConversionJob} job - Job to check
   * @returns {Object} Resource check result
   */
  checkResourceRequirements(job) {
    const requirements = this.config.resourceRequirements[job.conversionType] || 
                        this.config.resourceRequirements[ConversionType.DOCUMENT];
    
    const { cpu, memory } = this.systemResources;
    const memoryUsagePercent = (memory.used / memory.total) * 100;
    
    // Check CPU availability
    if (cpu.usage + requirements.cpu > this.config.maxCpuUsage) {
      return {
        sufficient: false,
        reason: `Insufficient CPU (need ${requirements.cpu}%, available ${this.config.maxCpuUsage - cpu.usage}%)`
      };
    }
    
    // Check memory availability
    const requiredMemoryPercent = (requirements.memory / memory.total) * 100;
    if (memoryUsagePercent + requiredMemoryPercent > this.config.maxMemoryUsage) {
      return {
        sufficient: false,
        reason: `Insufficient memory (need ${requiredMemoryPercent.toFixed(1)}%, available ${(this.config.maxMemoryUsage - memoryUsagePercent).toFixed(1)}%)`
      };
    }
    
    return { sufficient: true };
  }

  /**
   * Calculate scheduling priority based on job priority and system state
   * @param {ConversionJob} job - Job to calculate priority for
   * @returns {number} Scheduling priority score
   */
  calculateSchedulingPriority(job) {
    let priority = 0;
    
    // Base priority from job
    switch (job.priority) {
      case JobPriority.CRITICAL:
        priority += 1000;
        break;
      case JobPriority.HIGH:
        priority += 100;
        break;
      case JobPriority.NORMAL:
        priority += 10;
        break;
      case JobPriority.LOW:
        priority += 1;
        break;
    }
    
    // Age bonus (older jobs get higher priority)
    if (job.queuedAt) {
      const age = Date.now() - job.queuedAt;
      priority += Math.floor(age / 60000); // 1 point per minute
    }
    
    // Resource efficiency bonus
    const requirements = this.config.resourceRequirements[job.conversionType];
    if (requirements) {
      // Prefer jobs that use resources efficiently
      const efficiency = 100 - (requirements.cpu + (requirements.memory / (1024 * 1024 * 10))); // Simplified
      priority += Math.max(0, efficiency / 10);
    }
    
    // System load adjustment
    if (this.config.enableAdaptiveScheduling) {
      const loadAdjustment = this.calculateLoadAdjustment(job);
      priority += loadAdjustment;
    }
    
    return priority;
  }

  /**
   * Calculate load-based priority adjustment
   * @param {ConversionJob} job - Job to adjust priority for
   * @returns {number} Priority adjustment
   */
  calculateLoadAdjustment(job) {
    const { cpu, memory } = this.systemResources;
    const memoryUsagePercent = (memory.used / memory.total) * 100;
    
    let adjustment = 0;
    
    // Under low load, prefer resource-intensive jobs
    if (cpu.usage < this.config.adaptiveThresholds.low.cpu && 
        memoryUsagePercent < this.config.adaptiveThresholds.low.memory) {
      if (job.conversionType === ConversionType.VIDEO) {
        adjustment += 20; // Prefer video jobs when resources are abundant
      }
    }
    
    // Under high load, prefer lightweight jobs
    if (cpu.usage > this.config.adaptiveThresholds.high.cpu || 
        memoryUsagePercent > this.config.adaptiveThresholds.high.memory) {
      if (job.conversionType === ConversionType.DOCUMENT) {
        adjustment += 15; // Prefer document jobs when resources are constrained
      }
    }
    
    return adjustment;
  }

  /**
   * Estimate job duration based on historical data
   * @param {ConversionJob} job - Job to estimate
   * @returns {number} Estimated duration in milliseconds
   */
  estimateJobDuration(job) {
    // Find similar jobs in performance history
    const similarJobs = this.performanceHistory.filter(record => 
      record.conversionType === job.conversionType &&
      Math.abs(record.fileSize - (job.sourceFileSize || 0)) < record.fileSize * 0.5
    );
    
    if (similarJobs.length > 0) {
      const avgDuration = similarJobs.reduce((sum, record) => sum + record.duration, 0) / similarJobs.length;
      return avgDuration;
    }
    
    // Default estimates by conversion type
    const defaultDurations = {
      [ConversionType.DOCUMENT]: 30000, // 30 seconds
      [ConversionType.IMAGE]: 15000, // 15 seconds
      [ConversionType.AUDIO]: 60000, // 1 minute
      [ConversionType.VIDEO]: 300000 // 5 minutes
    };
    
    return defaultDurations[job.conversionType] || 30000;
  }

  /**
   * Estimate wait time for resources to become available
   * @param {ConversionJob} job - Job waiting for resources
   * @returns {number} Estimated wait time in milliseconds
   */
  estimateResourceWaitTime(job) {
    // Estimate based on current running jobs and their remaining time
    let estimatedWaitTime = 0;
    
    for (const runningJob of this.runningJobs.values()) {
      const remainingTime = this.estimateJobDuration(runningJob) - 
                           (Date.now() - runningJob.startedAt);
      estimatedWaitTime = Math.max(estimatedWaitTime, remainingTime);
    }
    
    return Math.max(0, estimatedWaitTime);
  }

  /**
   * Record job start for resource tracking
   * @param {ConversionJob} job - Job that started
   */
  recordJobStart(job) {
    job.startedAt = Date.now();
    this.runningJobs.set(job.id, job);
    
    this.emit('jobStarted', {
      jobId: job.id,
      conversionType: job.conversionType,
      estimatedDuration: this.estimateJobDuration(job),
      currentLoad: this.systemResources
    });
  }

  /**
   * Record job completion for performance tracking
   * @param {ConversionJob} job - Job that completed
   */
  recordJobCompletion(job) {
    const startTime = job.startedAt || Date.now();
    const duration = Date.now() - startTime;
    
    // Remove from running jobs
    this.runningJobs.delete(job.id);
    
    // Add to performance history
    this.performanceHistory.push({
      jobId: job.id,
      conversionType: job.conversionType,
      fileSize: job.sourceFileSize || 0,
      duration,
      completedAt: Date.now(),
      systemLoad: { ...this.systemResources }
    });
    
    // Limit history size
    if (this.performanceHistory.length > this.config.performanceHistory) {
      this.performanceHistory.shift();
    }
    
    this.emit('jobCompleted', {
      jobId: job.id,
      duration,
      performance: this.getPerformanceMetrics()
    });
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    if (this.performanceHistory.length === 0) {
      return { averageDuration: 0, throughput: 0, efficiency: 0 };
    }
    
    const recentHistory = this.performanceHistory.slice(-20); // Last 20 jobs
    const totalDuration = recentHistory.reduce((sum, record) => sum + record.duration, 0);
    const averageDuration = totalDuration / recentHistory.length;
    
    // Calculate throughput (jobs per hour)
    const timeSpan = Date.now() - recentHistory[0].completedAt;
    const throughput = (recentHistory.length / timeSpan) * 3600000; // jobs per hour
    
    return {
      averageDuration,
      throughput,
      efficiency: this.calculateEfficiency(),
      totalJobsCompleted: this.performanceHistory.length
    };
  }

  /**
   * Calculate system efficiency
   * @returns {number} Efficiency percentage
   */
  calculateEfficiency() {
    const { cpu, memory } = this.systemResources;
    const memoryUsagePercent = (memory.used / memory.total) * 100;
    
    // Efficiency is based on resource utilization vs job throughput
    const resourceUtilization = (cpu.usage + memoryUsagePercent) / 2;
    const jobUtilization = (this.runningJobs.size / this.config.maxConcurrentJobs) * 100;
    
    // Ideal efficiency is when job utilization matches resource utilization
    const efficiency = 100 - Math.abs(resourceUtilization - jobUtilization);
    return Math.max(0, Math.min(100, efficiency));
  }

  /**
   * Pause job scheduling
   * @param {string} reason - Reason for pausing
   */
  pauseScheduling(reason = 'Manual pause') {
    this.schedulingEnabled = false;
    this.emit('schedulingPaused', { reason, timestamp: Date.now() });
    globalJobNotifier.emit('schedulerPaused', { reason });
  }

  /**
   * Resume job scheduling
   */
  resumeScheduling() {
    this.schedulingEnabled = true;
    this.emit('schedulingResumed', { timestamp: Date.now() });
    globalJobNotifier.emit('schedulerResumed', {});
  }

  /**
   * Get current scheduler status
   * @returns {Object} Scheduler status
   */
  getStatus() {
    return {
      schedulingEnabled: this.schedulingEnabled,
      isMonitoring: this.isMonitoring,
      runningJobs: this.runningJobs.size,
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      systemResources: this.systemResources,
      performanceMetrics: this.getPerformanceMetrics(),
      lastScheduleTime: this.lastScheduleTime
    };
  }

  /**
   * Cleanup and stop scheduler
   */
  destroy() {
    this.stopResourceMonitoring();
    this.runningJobs.clear();
    this.performanceHistory.length = 0;
    this.removeAllListeners();
  }
}

export default ResourceAwareScheduler;