/**
 * Job Pause/Resume Management System
 * Manages pausing and resuming jobs based on resource availability
 */

const { EventEmitter } = require('events');
const { ConversionResourceProfiles } = require('./ResourceAllocationStrategy');

/**
 * Job states for pause/resume management
 */
const JobState = {
  RUNNING: 'running',
  PAUSED: 'paused',
  SUSPENDED: 'suspended',
  QUEUED: 'queued',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Pause reasons
 */
const PauseReason = {
  RESOURCE_SHORTAGE: 'resource_shortage',
  SYSTEM_OVERLOAD: 'system_overload',
  HIGH_PRIORITY_JOB: 'high_priority_job',
  MANUAL_PAUSE: 'manual_pause',
  EMERGENCY_STOP: 'emergency_stop',
  MAINTENANCE_MODE: 'maintenance_mode',
  THERMAL_THROTTLING: 'thermal_throttling',
  POWER_SAVING: 'power_saving'
};

/**
 * Resume conditions
 */
const ResumeCondition = {
  RESOURCES_AVAILABLE: 'resources_available',
  SYSTEM_LOAD_NORMAL: 'system_load_normal',
  HIGH_PRIORITY_COMPLETED: 'high_priority_completed',
  MANUAL_RESUME: 'manual_resume',
  SCHEDULED_RESUME: 'scheduled_resume',
  MAINTENANCE_COMPLETE: 'maintenance_complete'
};

/**
 * Pause/Resume events
 */
const PauseResumeEvents = {
  JOB_PAUSED: 'job_paused',
  JOB_RESUMED: 'job_resumed',
  JOB_SUSPENDED: 'job_suspended',
  BATCH_PAUSED: 'batch_paused',
  BATCH_RESUMED: 'batch_resumed',
  EMERGENCY_PAUSE: 'emergency_pause',
  SYSTEM_PAUSE: 'system_pause',
  SYSTEM_RESUME: 'system_resume'
};

/**
 * Managed job representation
 */
class ManagedJob {
  constructor(jobId, conversionType, priority = 'medium', resourceRequirements = {}) {
    this.jobId = jobId;
    this.conversionType = conversionType;
    this.priority = priority;
    this.resourceRequirements = resourceRequirements;
    this.state = JobState.QUEUED;
    this.pauseReason = null;
    this.pausedAt = null;
    this.resumedAt = null;
    this.totalPausedTime = 0;
    this.pauseCount = 0;
    this.progress = 0;
    this.estimatedTimeRemaining = 0;
    this.resourceUsage = {
      cpu: 0,
      memory: 0,
      disk: 0
    };
    this.pauseHistory = [];
    this.metadata = {};
  }

  pause(reason, metadata = {}) {
    if (this.state === JobState.RUNNING) {
      this.state = JobState.PAUSED;
      this.pauseReason = reason;
      this.pausedAt = Date.now();
      this.pauseCount++;
      
      this.pauseHistory.push({
        reason,
        pausedAt: this.pausedAt,
        metadata
      });
    }
  }

  resume(condition, metadata = {}) {
    if (this.state === JobState.PAUSED) {
      this.state = JobState.RUNNING;
      this.resumedAt = Date.now();
      
      if (this.pausedAt) {
        this.totalPausedTime += this.resumedAt - this.pausedAt;
      }
      
      // Update last pause history entry
      const lastPause = this.pauseHistory[this.pauseHistory.length - 1];
      if (lastPause) {
        lastPause.resumedAt = this.resumedAt;
        lastPause.pauseDuration = this.resumedAt - this.pausedAt;
        lastPause.resumeCondition = condition;
        lastPause.resumeMetadata = metadata;
      }
      
      this.pauseReason = null;
      this.pausedAt = null;
    }
  }

  suspend(reason, metadata = {}) {
    this.state = JobState.SUSPENDED;
    this.pauseReason = reason;
    this.pausedAt = Date.now();
    
    this.pauseHistory.push({
      reason,
      pausedAt: this.pausedAt,
      suspended: true,
      metadata
    });
  }

  updateProgress(progress) {
    this.progress = Math.max(0, Math.min(100, progress));
  }

  updateResourceUsage(usage) {
    this.resourceUsage = { ...this.resourceUsage, ...usage };
  }

  getEffectiveRuntime() {
    const now = Date.now();
    let totalTime = 0;
    
    if (this.pauseHistory.length > 0) {
      const firstPause = this.pauseHistory[0];
      totalTime = now - (firstPause.pausedAt - this.totalPausedTime);
    }
    
    return Math.max(0, totalTime - this.totalPausedTime);
  }

  isPaused() {
    return this.state === JobState.PAUSED;
  }

  isSuspended() {
    return this.state === JobState.SUSPENDED;
  }

  isRunning() {
    return this.state === JobState.RUNNING;
  }

  canResume() {
    return this.state === JobState.PAUSED;
  }

  toJSON() {
    return {
      jobId: this.jobId,
      conversionType: this.conversionType,
      priority: this.priority,
      state: this.state,
      pauseReason: this.pauseReason,
      pausedAt: this.pausedAt,
      resumedAt: this.resumedAt,
      totalPausedTime: this.totalPausedTime,
      pauseCount: this.pauseCount,
      progress: this.progress,
      estimatedTimeRemaining: this.estimatedTimeRemaining,
      resourceUsage: this.resourceUsage,
      resourceRequirements: this.resourceRequirements,
      effectiveRuntime: this.getEffectiveRuntime(),
      pauseHistory: this.pauseHistory,
      metadata: this.metadata
    };
  }
}

/**
 * Job Pause/Resume Manager
 */
class JobPauseResumeManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      // Resource thresholds for automatic pausing
      pauseThresholds: {
        cpu: options.pauseCpuThreshold || 0.9,
        memory: options.pauseMemoryThreshold || 0.9,
        disk: options.pauseDiskThreshold || 0.95
      },
      
      // Resource thresholds for resuming
      resumeThresholds: {
        cpu: options.resumeCpuThreshold || 0.7,
        memory: options.resumeMemoryThreshold || 0.7,
        disk: options.resumeDiskThreshold || 0.8
      },
      
      // Monitoring intervals
      monitoringInterval: options.monitoringInterval || 5000, // 5 seconds
      resumeCheckInterval: options.resumeCheckInterval || 10000, // 10 seconds
      
      // Pause/Resume delays
      pauseDelay: options.pauseDelay || 2000, // 2 seconds
      resumeDelay: options.resumeDelay || 3000, // 3 seconds
      
      // Priority settings
      priorityLevels: {
        low: 1,
        medium: 2,
        high: 3,
        critical: 4
      },
      
      // Emergency settings
      emergencyThresholds: {
        cpu: options.emergencyCpuThreshold || 0.95,
        memory: options.emergencyMemoryThreshold || 0.95,
        disk: options.emergencyDiskThreshold || 0.98
      },
      
      // Maximum pause duration before suspension
      maxPauseDuration: options.maxPauseDuration || 300000, // 5 minutes
      
      // Batch operation settings
      batchSize: options.batchSize || 10,
      
      ...options
    };
    
    this.managedJobs = new Map(); // jobId -> ManagedJob
    this.pausedJobs = new Set();
    this.suspendedJobs = new Set();
    this.runningJobs = new Set();
    
    this.systemResources = {
      cpu: 0,
      memory: 0,
      disk: 0
    };
    
    this.isRunning = false;
    this.monitoringTimer = null;
    this.resumeCheckTimer = null;
    
    this.pauseResumeHistory = [];
    this.maxHistorySize = 1000;
    
    this.maintenanceMode = false;
    this.emergencyPause = false;
  }

  /**
   * Start the pause/resume manager
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this._startMonitoring();
    this._startResumeChecking();
  }

  /**
   * Stop the pause/resume manager
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this._stopMonitoring();
    this._stopResumeChecking();
  }

  /**
   * Register a job for management
   */
  registerJob(jobId, conversionType, priority = 'medium', resourceRequirements = {}) {
    if (this.managedJobs.has(jobId)) {
      throw new Error(`Job ${jobId} is already registered`);
    }
    
    const managedJob = new ManagedJob(jobId, conversionType, priority, resourceRequirements);
    this.managedJobs.set(jobId, managedJob);
    
    return managedJob;
  }

  /**
   * Unregister a job
   */
  unregisterJob(jobId) {
    const job = this.managedJobs.get(jobId);
    if (job) {
      this.managedJobs.delete(jobId);
      this.pausedJobs.delete(jobId);
      this.suspendedJobs.delete(jobId);
      this.runningJobs.delete(jobId);
    }
    return job;
  }

  /**
   * Start a job
   */
  startJob(jobId) {
    const job = this.managedJobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    job.state = JobState.RUNNING;
    this.runningJobs.add(jobId);
    this.pausedJobs.delete(jobId);
    this.suspendedJobs.delete(jobId);
  }

  /**
   * Complete a job
   */
  completeJob(jobId, success = true) {
    const job = this.managedJobs.get(jobId);
    if (!job) return;
    
    job.state = success ? JobState.COMPLETED : JobState.FAILED;
    this.runningJobs.delete(jobId);
    this.pausedJobs.delete(jobId);
    this.suspendedJobs.delete(jobId);
  }

  /**
   * Update system resource usage
   */
  updateSystemResources(resources) {
    this.systemResources = { ...this.systemResources, ...resources };
    
    // Check for emergency conditions
    this._checkEmergencyConditions();
  }

  /**
   * Manually pause a job
   */
  pauseJob(jobId, reason = PauseReason.MANUAL_PAUSE, metadata = {}) {
    const job = this.managedJobs.get(jobId);
    if (!job || !job.isRunning()) {
      return false;
    }
    
    job.pause(reason, metadata);
    this.pausedJobs.add(jobId);
    this.runningJobs.delete(jobId);
    
    this._recordPauseResumeEvent({
      type: PauseResumeEvents.JOB_PAUSED,
      jobId,
      reason,
      metadata,
      timestamp: Date.now()
    });
    
    this.emit(PauseResumeEvents.JOB_PAUSED, {
      jobId,
      job: job.toJSON(),
      reason,
      metadata
    });
    
    return true;
  }

  /**
   * Manually resume a job
   */
  resumeJob(jobId, condition = ResumeCondition.MANUAL_RESUME, metadata = {}) {
    const job = this.managedJobs.get(jobId);
    if (!job || !job.canResume()) {
      return false;
    }
    
    job.resume(condition, metadata);
    this.runningJobs.add(jobId);
    this.pausedJobs.delete(jobId);
    
    this._recordPauseResumeEvent({
      type: PauseResumeEvents.JOB_RESUMED,
      jobId,
      condition,
      metadata,
      timestamp: Date.now()
    });
    
    this.emit(PauseResumeEvents.JOB_RESUMED, {
      jobId,
      job: job.toJSON(),
      condition,
      metadata
    });
    
    return true;
  }

  /**
   * Suspend a job (longer-term pause)
   */
  suspendJob(jobId, reason = PauseReason.RESOURCE_SHORTAGE, metadata = {}) {
    const job = this.managedJobs.get(jobId);
    if (!job) return false;
    
    job.suspend(reason, metadata);
    this.suspendedJobs.add(jobId);
    this.runningJobs.delete(jobId);
    this.pausedJobs.delete(jobId);
    
    this._recordPauseResumeEvent({
      type: PauseResumeEvents.JOB_SUSPENDED,
      jobId,
      reason,
      metadata,
      timestamp: Date.now()
    });
    
    this.emit(PauseResumeEvents.JOB_SUSPENDED, {
      jobId,
      job: job.toJSON(),
      reason,
      metadata
    });
    
    return true;
  }

  /**
   * Pause jobs by priority (lower priority jobs first)
   */
  pauseJobsByPriority(reason = PauseReason.RESOURCE_SHORTAGE, excludePriorities = []) {
    const runningJobs = Array.from(this.runningJobs)
      .map(jobId => this.managedJobs.get(jobId))
      .filter(job => job && !excludePriorities.includes(job.priority))
      .sort((a, b) => this.config.priorityLevels[a.priority] - this.config.priorityLevels[b.priority]);
    
    const pausedJobs = [];
    
    for (const job of runningJobs) {
      if (this.pauseJob(job.jobId, reason)) {
        pausedJobs.push(job.jobId);
      }
    }
    
    if (pausedJobs.length > 0) {
      this.emit(PauseResumeEvents.BATCH_PAUSED, {
        jobIds: pausedJobs,
        reason,
        count: pausedJobs.length
      });
    }
    
    return pausedJobs;
  }

  /**
   * Resume jobs by priority (higher priority jobs first)
   */
  resumeJobsByPriority(condition = ResumeCondition.RESOURCES_AVAILABLE, maxJobs = null) {
    const pausedJobs = Array.from(this.pausedJobs)
      .map(jobId => this.managedJobs.get(jobId))
      .filter(job => job && job.canResume())
      .sort((a, b) => this.config.priorityLevels[b.priority] - this.config.priorityLevels[a.priority]);
    
    const resumedJobs = [];
    const limit = maxJobs || pausedJobs.length;
    
    for (let i = 0; i < Math.min(limit, pausedJobs.length); i++) {
      const job = pausedJobs[i];
      if (this.resumeJob(job.jobId, condition)) {
        resumedJobs.push(job.jobId);
      }
    }
    
    if (resumedJobs.length > 0) {
      this.emit(PauseResumeEvents.BATCH_RESUMED, {
        jobIds: resumedJobs,
        condition,
        count: resumedJobs.length
      });
    }
    
    return resumedJobs;
  }

  /**
   * Emergency pause all jobs
   */
  emergencyPauseAll(reason = PauseReason.EMERGENCY_STOP) {
    this.emergencyPause = true;
    const pausedJobs = [];
    
    for (const jobId of this.runningJobs) {
      if (this.pauseJob(jobId, reason)) {
        pausedJobs.push(jobId);
      }
    }
    
    this.emit(PauseResumeEvents.EMERGENCY_PAUSE, {
      jobIds: pausedJobs,
      reason,
      count: pausedJobs.length
    });
    
    return pausedJobs;
  }

  /**
   * Resume all paused jobs
   */
  resumeAll(condition = ResumeCondition.MANUAL_RESUME) {
    this.emergencyPause = false;
    return this.resumeJobsByPriority(condition);
  }

  /**
   * Enable maintenance mode
   */
  enableMaintenanceMode() {
    this.maintenanceMode = true;
    return this.pauseJobsByPriority(PauseReason.MAINTENANCE_MODE);
  }

  /**
   * Disable maintenance mode
   */
  disableMaintenanceMode() {
    this.maintenanceMode = false;
    return this.resumeJobsByPriority(ResumeCondition.MAINTENANCE_COMPLETE);
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    const job = this.managedJobs.get(jobId);
    return job ? job.toJSON() : null;
  }

  /**
   * Get all jobs status
   */
  getAllJobsStatus() {
    const jobs = {};
    
    for (const [jobId, job] of this.managedJobs.entries()) {
      jobs[jobId] = job.toJSON();
    }
    
    return jobs;
  }

  /**
   * Get manager status
   */
  getManagerStatus() {
    return {
      isRunning: this.isRunning,
      maintenanceMode: this.maintenanceMode,
      emergencyPause: this.emergencyPause,
      totalJobs: this.managedJobs.size,
      runningJobs: this.runningJobs.size,
      pausedJobs: this.pausedJobs.size,
      suspendedJobs: this.suspendedJobs.size,
      systemResources: { ...this.systemResources },
      thresholds: {
        pause: this.config.pauseThresholds,
        resume: this.config.resumeThresholds,
        emergency: this.config.emergencyThresholds
      }
    };
  }

  /**
   * Get detailed status with job information
   */
  getDetailedStatus() {
    return {
      ...this.getManagerStatus(),
      jobs: this.getAllJobsStatus(),
      recentHistory: this.pauseResumeHistory.slice(-50)
    };
  }

  /**
   * Update job progress
   */
  updateJobProgress(jobId, progress) {
    const job = this.managedJobs.get(jobId);
    if (job) {
      job.updateProgress(progress);
    }
  }

  /**
   * Update job resource usage
   */
  updateJobResourceUsage(jobId, usage) {
    const job = this.managedJobs.get(jobId);
    if (job) {
      job.updateResourceUsage(usage);
    }
  }

  /**
   * Check emergency conditions
   */
  _checkEmergencyConditions() {
    const { cpu, memory, disk } = this.systemResources;
    const { emergencyThresholds } = this.config;
    
    if (cpu >= emergencyThresholds.cpu || 
        memory >= emergencyThresholds.memory || 
        disk >= emergencyThresholds.disk) {
      
      if (!this.emergencyPause) {
        this.emergencyPauseAll(PauseReason.SYSTEM_OVERLOAD);
      }
    }
  }

  /**
   * Start monitoring
   */
  _startMonitoring() {
    this.monitoringTimer = setInterval(() => {
      this._checkResourceBasedPausing();
      this._checkLongPausedJobs();
    }, this.config.monitoringInterval);
  }

  /**
   * Stop monitoring
   */
  _stopMonitoring() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * Start resume checking
   */
  _startResumeChecking() {
    this.resumeCheckTimer = setInterval(() => {
      this._checkResourceBasedResuming();
    }, this.config.resumeCheckInterval);
  }

  /**
   * Stop resume checking
   */
  _stopResumeChecking() {
    if (this.resumeCheckTimer) {
      clearInterval(this.resumeCheckTimer);
      this.resumeCheckTimer = null;
    }
  }

  /**
   * Check for resource-based pausing
   */
  _checkResourceBasedPausing() {
    if (this.maintenanceMode || this.emergencyPause) return;
    
    const { cpu, memory, disk } = this.systemResources;
    const { pauseThresholds } = this.config;
    
    if (cpu >= pauseThresholds.cpu || 
        memory >= pauseThresholds.memory || 
        disk >= pauseThresholds.disk) {
      
      // Pause lower priority jobs
      this.pauseJobsByPriority(PauseReason.RESOURCE_SHORTAGE, ['critical', 'high']);
    }
  }

  /**
   * Check for resource-based resuming
   */
  _checkResourceBasedResuming() {
    if (this.maintenanceMode || this.emergencyPause) return;
    
    const { cpu, memory, disk } = this.systemResources;
    const { resumeThresholds } = this.config;
    
    if (cpu <= resumeThresholds.cpu && 
        memory <= resumeThresholds.memory && 
        disk <= resumeThresholds.disk) {
      
      // Resume paused jobs gradually
      const maxResume = Math.max(1, Math.floor(this.config.batchSize / 2));
      this.resumeJobsByPriority(ResumeCondition.RESOURCES_AVAILABLE, maxResume);
    }
  }

  /**
   * Check for jobs that have been paused too long
   */
  _checkLongPausedJobs() {
    const now = Date.now();
    
    for (const jobId of this.pausedJobs) {
      const job = this.managedJobs.get(jobId);
      if (job && job.pausedAt && 
          (now - job.pausedAt) > this.config.maxPauseDuration) {
        
        this.suspendJob(jobId, PauseReason.RESOURCE_SHORTAGE, {
          originalPauseReason: job.pauseReason,
          pauseDuration: now - job.pausedAt
        });
      }
    }
  }

  /**
   * Record pause/resume event
   */
  _recordPauseResumeEvent(event) {
    this.pauseResumeHistory.push(event);
    
    // Limit history size
    if (this.pauseResumeHistory.length > this.maxHistorySize) {
      this.pauseResumeHistory.shift();
    }
  }
}

/**
 * Global job pause/resume manager instance
 */
let globalJobPauseResumeManager = null;

function getGlobalJobPauseResumeManager(options = {}) {
  if (!globalJobPauseResumeManager) {
    globalJobPauseResumeManager = new JobPauseResumeManager(options);
  }
  return globalJobPauseResumeManager;
}

module.exports = {
  JobPauseResumeManager,
  ManagedJob,
  JobState,
  PauseReason,
  ResumeCondition,
  PauseResumeEvents,
  getGlobalJobPauseResumeManager
};