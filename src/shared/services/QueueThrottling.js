import { EventEmitter } from 'events';
import os from 'os';
import { globalQueueEventManager, QueueStateEventType } from './QueueStateEvents.js';
import { globalJobNotifier, JobEventType, EventPriority } from '../events/jobEvents.js';

/**
 * Throttling strategies
 */
export const ThrottlingStrategy = {
  NONE: 'none',
  LINEAR: 'linear',
  EXPONENTIAL: 'exponential',
  ADAPTIVE: 'adaptive',
  CIRCUIT_BREAKER: 'circuit_breaker'
};

/**
 * System load levels
 */
export const SystemLoadLevel = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
  OVERLOAD: 'overload'
};

/**
 * Throttling state
 */
export const ThrottlingState = {
  DISABLED: 'disabled',
  MONITORING: 'monitoring',
  THROTTLING: 'throttling',
  CIRCUIT_OPEN: 'circuit_open',
  RECOVERY: 'recovery'
};

/**
 * Queue throttling and system overload prevention
 */
export class QueueThrottling extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Throttling settings
      enabled: config.enabled !== false,
      strategy: config.strategy || ThrottlingStrategy.ADAPTIVE,
      
      // Resource thresholds
      cpuThresholds: {
        normal: config.cpuThresholds?.normal || 70,
        high: config.cpuThresholds?.high || 85,
        critical: config.cpuThresholds?.critical || 95
      },
      
      memoryThresholds: {
        normal: config.memoryThresholds?.normal || 75,
        high: config.memoryThresholds?.high || 90,
        critical: config.memoryThresholds?.critical || 95
      },
      
      diskThresholds: {
        normal: config.diskThresholds?.normal || 80,
        high: config.diskThresholds?.high || 90,
        critical: config.diskThresholds?.critical || 95
      },
      
      // Monitoring settings
      monitoringInterval: config.monitoringInterval || 5000, // 5 seconds
      resourceSampleSize: config.resourceSampleSize || 10,
      loadAverageWindow: config.loadAverageWindow || 60000, // 1 minute
      
      // Throttling parameters
      baseThrottleDelay: config.baseThrottleDelay || 1000, // 1 second
      maxThrottleDelay: config.maxThrottleDelay || 30000, // 30 seconds
      throttleStepSize: config.throttleStepSize || 0.5,
      recoveryFactor: config.recoveryFactor || 0.8,
      
      // Circuit breaker settings
      circuitBreakerThreshold: config.circuitBreakerThreshold || 10,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 60000, // 1 minute
      circuitBreakerRecoveryTime: config.circuitBreakerRecoveryTime || 30000, // 30 seconds
      
      // Concurrency limits
      maxConcurrentJobs: config.maxConcurrentJobs || os.cpus().length,
      emergencyConcurrencyLimit: config.emergencyConcurrencyLimit || 1,
      
      // Job type specific limits
      jobTypeLimits: config.jobTypeLimits || {},
      
      // Advanced settings
      enablePredictiveThrottling: config.enablePredictiveThrottling || false,
      enableAdaptiveLimits: config.enableAdaptiveLimits || true,
      enableGracefulDegradation: config.enableGracefulDegradation !== false,
      
      ...config
    };
    
    // Throttling state
    this.state = ThrottlingState.DISABLED;
    this.currentLoadLevel = SystemLoadLevel.NORMAL;
    this.currentThrottleDelay = 0;
    this.currentConcurrencyLimit = this.config.maxConcurrentJobs;
    
    // Resource monitoring
    this.resourceSamples = {
      cpu: [],
      memory: [],
      disk: []
    };
    this.loadHistory = [];
    this.monitoringTimer = null;
    
    // Circuit breaker state
    this.circuitBreakerFailures = 0;
    this.circuitBreakerLastFailure = 0;
    this.circuitBreakerOpenTime = 0;
    
    // Performance tracking
    this.performanceMetrics = {
      throttledJobs: 0,
      delayedJobs: 0,
      rejectedJobs: 0,
      averageThrottleDelay: 0,
      totalThrottleTime: 0,
      lastThrottleTime: 0
    };
    
    // Job tracking
    this.activeJobs = new Map();
    this.queuedJobs = new Map();
    this.jobStartTimes = new Map();
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize throttling system
   */
  initialize() {
    if (this.config.enabled) {
      this.startMonitoring();
      this.state = ThrottlingState.MONITORING;
    }
    
    this.emit('initialized', {
      state: this.state,
      config: this.config
    });
  }

  /**
   * Start resource monitoring
   */
  startMonitoring() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    
    this.monitoringTimer = setInterval(() => {
      this.collectResourceMetrics();
      this.evaluateSystemLoad();
      this.adjustThrottling();
    }, this.config.monitoringInterval);
    
    this.emit('monitoringStarted');
  }

  /**
   * Stop resource monitoring
   */
  stopMonitoring() {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    this.state = ThrottlingState.DISABLED;
    this.emit('monitoringStopped');
  }

  /**
   * Collect system resource metrics
   */
  collectResourceMetrics() {
    try {
      // CPU usage (approximation using load average)
      const loadAvg = os.loadavg()[0]; // 1-minute load average
      const cpuCount = os.cpus().length;
      const cpuUsage = Math.min((loadAvg / cpuCount) * 100, 100);
      
      // Memory usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;
      
      // Disk usage (simplified - would need more sophisticated implementation)
      const diskUsage = this.estimateDiskUsage();
      
      // Add to samples
      this.addResourceSample('cpu', cpuUsage);
      this.addResourceSample('memory', memoryUsage);
      this.addResourceSample('disk', diskUsage);
      
      // Update load history
      this.loadHistory.push({
        timestamp: Date.now(),
        cpu: cpuUsage,
        memory: memoryUsage,
        disk: diskUsage,
        activeJobs: this.activeJobs.size
      });
      
      // Trim history
      const cutoff = Date.now() - this.config.loadAverageWindow;
      this.loadHistory = this.loadHistory.filter(entry => entry.timestamp > cutoff);
      
    } catch (error) {
      this.emit('monitoringError', {
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Add resource sample
   * @param {string} resource - Resource type
   * @param {number} value - Resource value
   */
  addResourceSample(resource, value) {
    this.resourceSamples[resource].push(value);
    
    // Keep only recent samples
    if (this.resourceSamples[resource].length > this.config.resourceSampleSize) {
      this.resourceSamples[resource].shift();
    }
  }

  /**
   * Get average resource usage
   * @param {string} resource - Resource type
   * @returns {number} Average usage
   */
  getAverageResourceUsage(resource) {
    const samples = this.resourceSamples[resource];
    if (samples.length === 0) return 0;
    
    return samples.reduce((sum, value) => sum + value, 0) / samples.length;
  }

  /**
   * Estimate disk usage (simplified implementation)
   * @returns {number} Estimated disk usage percentage
   */
  estimateDiskUsage() {
    // This is a simplified implementation
    // In a real system, you'd check actual disk usage
    return Math.random() * 20 + 40; // Simulate 40-60% usage
  }

  /**
   * Evaluate current system load level
   */
  evaluateSystemLoad() {
    const avgCpu = this.getAverageResourceUsage('cpu');
    const avgMemory = this.getAverageResourceUsage('memory');
    const avgDisk = this.getAverageResourceUsage('disk');
    
    // Determine load level based on highest resource usage
    const maxUsage = Math.max(avgCpu, avgMemory, avgDisk);
    const previousLevel = this.currentLoadLevel;
    
    if (maxUsage >= this.config.cpuThresholds.critical) {
      this.currentLoadLevel = SystemLoadLevel.CRITICAL;
    } else if (maxUsage >= this.config.cpuThresholds.high) {
      this.currentLoadLevel = SystemLoadLevel.HIGH;
    } else if (maxUsage >= this.config.cpuThresholds.normal) {
      this.currentLoadLevel = SystemLoadLevel.NORMAL;
    } else {
      this.currentLoadLevel = SystemLoadLevel.LOW;
    }
    
    // Check for overload conditions
    if (this.isSystemOverloaded()) {
      this.currentLoadLevel = SystemLoadLevel.OVERLOAD;
    }
    
    // Emit event if load level changed
    if (previousLevel !== this.currentLoadLevel) {
      this.emit('loadLevelChanged', {
        previous: previousLevel,
        current: this.currentLoadLevel,
        metrics: { cpu: avgCpu, memory: avgMemory, disk: avgDisk }
      });
      
      globalQueueEventManager.emitQueueEvent(
        QueueStateEventType.RESOURCE_STATE_CHANGED,
        {
          loadLevel: this.currentLoadLevel,
          metrics: { cpu: avgCpu, memory: avgMemory, disk: avgDisk }
        }
      );
    }
  }

  /**
   * Check if system is overloaded
   * @returns {boolean} Is system overloaded
   */
  isSystemOverloaded() {
    const avgCpu = this.getAverageResourceUsage('cpu');
    const avgMemory = this.getAverageResourceUsage('memory');
    
    // Multiple criteria for overload detection
    const highCpuAndMemory = avgCpu > 90 && avgMemory > 90;
    const tooManyActiveJobs = this.activeJobs.size > this.config.maxConcurrentJobs * 2;
    const circuitBreakerTriggered = this.circuitBreakerFailures >= this.config.circuitBreakerThreshold;
    
    return highCpuAndMemory || tooManyActiveJobs || circuitBreakerTriggered;
  }

  /**
   * Adjust throttling based on current system load
   */
  adjustThrottling() {
    const previousState = this.state;
    const previousDelay = this.currentThrottleDelay;
    const previousLimit = this.currentConcurrencyLimit;
    
    switch (this.currentLoadLevel) {
      case SystemLoadLevel.LOW:
        this.reduceThrottling();
        break;
        
      case SystemLoadLevel.NORMAL:
        this.maintainThrottling();
        break;
        
      case SystemLoadLevel.HIGH:
        this.increaseThrottling();
        break;
        
      case SystemLoadLevel.CRITICAL:
        this.applyCriticalThrottling();
        break;
        
      case SystemLoadLevel.OVERLOAD:
        this.applyEmergencyThrottling();
        break;
    }
    
    // Update state
    if (this.currentThrottleDelay > 0 || this.currentConcurrencyLimit < this.config.maxConcurrentJobs) {
      this.state = ThrottlingState.THROTTLING;
    } else {
      this.state = ThrottlingState.MONITORING;
    }
    
    // Emit events if throttling changed
    if (previousState !== this.state || 
        previousDelay !== this.currentThrottleDelay || 
        previousLimit !== this.currentConcurrencyLimit) {
      
      this.emit('throttlingAdjusted', {
        previousState,
        currentState: this.state,
        previousDelay,
        currentDelay: this.currentThrottleDelay,
        previousLimit,
        currentLimit: this.currentConcurrencyLimit,
        loadLevel: this.currentLoadLevel
      });
      
      globalQueueEventManager.emitQueueEvent(
        QueueStateEventType.THROTTLING_STATE_CHANGED,
        {
          state: this.state,
          throttleDelay: this.currentThrottleDelay,
          concurrencyLimit: this.currentConcurrencyLimit,
          loadLevel: this.currentLoadLevel
        }
      );
    }
  }

  /**
   * Reduce throttling when system load is low
   */
  reduceThrottling() {
    if (this.currentThrottleDelay > 0) {
      this.currentThrottleDelay = Math.max(
        0,
        this.currentThrottleDelay * this.config.recoveryFactor
      );
    }
    
    if (this.currentConcurrencyLimit < this.config.maxConcurrentJobs) {
      this.currentConcurrencyLimit = Math.min(
        this.config.maxConcurrentJobs,
        this.currentConcurrencyLimit + 1
      );
    }
  }

  /**
   * Maintain current throttling level
   */
  maintainThrottling() {
    // Keep current settings, but gradually reduce if possible
    if (this.currentThrottleDelay > this.config.baseThrottleDelay) {
      this.currentThrottleDelay = Math.max(
        this.config.baseThrottleDelay,
        this.currentThrottleDelay * 0.95
      );
    }
  }

  /**
   * Increase throttling when system load is high
   */
  increaseThrottling() {
    this.currentThrottleDelay = Math.min(
      this.config.maxThrottleDelay,
      Math.max(
        this.config.baseThrottleDelay,
        this.currentThrottleDelay * (1 + this.config.throttleStepSize)
      )
    );
    
    this.currentConcurrencyLimit = Math.max(
      Math.ceil(this.config.maxConcurrentJobs * 0.5),
      this.currentConcurrencyLimit - 1
    );
  }

  /**
   * Apply critical throttling
   */
  applyCriticalThrottling() {
    this.currentThrottleDelay = this.config.maxThrottleDelay;
    this.currentConcurrencyLimit = Math.max(
      this.config.emergencyConcurrencyLimit,
      Math.ceil(this.config.maxConcurrentJobs * 0.25)
    );
  }

  /**
   * Apply emergency throttling for overload conditions
   */
  applyEmergencyThrottling() {
    this.currentThrottleDelay = this.config.maxThrottleDelay;
    this.currentConcurrencyLimit = this.config.emergencyConcurrencyLimit;
    
    // Consider opening circuit breaker
    if (this.config.strategy === ThrottlingStrategy.CIRCUIT_BREAKER) {
      this.openCircuitBreaker();
    }
  }

  /**
   * Open circuit breaker
   */
  openCircuitBreaker() {
    this.state = ThrottlingState.CIRCUIT_OPEN;
    this.circuitBreakerOpenTime = Date.now();
    
    this.emit('circuitBreakerOpened', {
      failures: this.circuitBreakerFailures,
      timestamp: this.circuitBreakerOpenTime
    });
    
    // Schedule recovery attempt
    setTimeout(() => {
      this.attemptCircuitBreakerRecovery();
    }, this.config.circuitBreakerRecoveryTime);
  }

  /**
   * Attempt circuit breaker recovery
   */
  attemptCircuitBreakerRecovery() {
    if (this.state === ThrottlingState.CIRCUIT_OPEN) {
      this.state = ThrottlingState.RECOVERY;
      this.circuitBreakerFailures = 0;
      
      this.emit('circuitBreakerRecoveryAttempt', {
        timestamp: Date.now()
      });
    }
  }

  /**
   * Check if job can be processed based on current throttling
   * @param {Object} job - Job to check
   * @returns {Object} Processing decision
   */
  canProcessJob(job) {
    // Circuit breaker check
    if (this.state === ThrottlingState.CIRCUIT_OPEN) {
      return {
        canProcess: false,
        reason: 'circuit_breaker_open',
        delay: this.config.circuitBreakerTimeout
      };
    }
    
    // Concurrency limit check
    if (this.activeJobs.size >= this.currentConcurrencyLimit) {
      return {
        canProcess: false,
        reason: 'concurrency_limit_reached',
        delay: this.currentThrottleDelay
      };
    }
    
    // Job type specific limits
    const jobTypeLimit = this.config.jobTypeLimits[job.conversionType];
    if (jobTypeLimit) {
      const activeJobsOfType = Array.from(this.activeJobs.values())
        .filter(activeJob => activeJob.conversionType === job.conversionType).length;
      
      if (activeJobsOfType >= jobTypeLimit) {
        return {
          canProcess: false,
          reason: 'job_type_limit_reached',
          delay: this.currentThrottleDelay
        };
      }
    }
    
    // System overload check
    if (this.currentLoadLevel === SystemLoadLevel.OVERLOAD) {
      return {
        canProcess: false,
        reason: 'system_overload',
        delay: this.config.maxThrottleDelay
      };
    }
    
    // Apply throttle delay if needed
    const delay = this.currentThrottleDelay;
    
    return {
      canProcess: true,
      delay,
      concurrencyLimit: this.currentConcurrencyLimit
    };
  }

  /**
   * Register job start
   * @param {Object} job - Job that started
   */
  registerJobStart(job) {
    this.activeJobs.set(job.id, job);
    this.jobStartTimes.set(job.id, Date.now());
    
    // Update metrics
    if (this.currentThrottleDelay > 0) {
      this.performanceMetrics.throttledJobs++;
      this.performanceMetrics.delayedJobs++;
      this.performanceMetrics.totalThrottleTime += this.currentThrottleDelay;
      this.performanceMetrics.lastThrottleTime = Date.now();
      
      // Update average throttle delay
      this.performanceMetrics.averageThrottleDelay = 
        this.performanceMetrics.totalThrottleTime / this.performanceMetrics.throttledJobs;
    }
  }

  /**
   * Register job completion
   * @param {string} jobId - Job ID that completed
   * @param {boolean} success - Whether job completed successfully
   */
  registerJobCompletion(jobId, success = true) {
    this.activeJobs.delete(jobId);
    this.jobStartTimes.delete(jobId);
    
    // Update circuit breaker state
    if (!success) {
      this.circuitBreakerFailures++;
      this.circuitBreakerLastFailure = Date.now();
    } else if (this.state === ThrottlingState.RECOVERY) {
      // Successful job during recovery - close circuit breaker
      this.state = ThrottlingState.MONITORING;
      this.emit('circuitBreakerClosed', {
        timestamp: Date.now()
      });
    }
  }

  /**
   * Register job rejection
   * @param {Object} job - Job that was rejected
   * @param {string} reason - Rejection reason
   */
  registerJobRejection(job, reason) {
    this.performanceMetrics.rejectedJobs++;
    
    this.emit('jobRejected', {
      jobId: job.id,
      reason,
      timestamp: Date.now()
    });
  }

  /**
   * Get current throttling status
   * @returns {Object} Throttling status
   */
  getThrottlingStatus() {
    return {
      enabled: this.config.enabled,
      state: this.state,
      loadLevel: this.currentLoadLevel,
      throttleDelay: this.currentThrottleDelay,
      concurrencyLimit: this.currentConcurrencyLimit,
      activeJobs: this.activeJobs.size,
      resourceUsage: {
        cpu: this.getAverageResourceUsage('cpu'),
        memory: this.getAverageResourceUsage('memory'),
        disk: this.getAverageResourceUsage('disk')
      },
      circuitBreaker: {
        failures: this.circuitBreakerFailures,
        isOpen: this.state === ThrottlingState.CIRCUIT_OPEN,
        lastFailure: this.circuitBreakerLastFailure
      },
      performance: this.performanceMetrics
    };
  }

  /**
   * Get resource usage history
   * @param {number} duration - Duration in milliseconds
   * @returns {Array} Resource usage history
   */
  getResourceHistory(duration = 300000) { // 5 minutes default
    const cutoff = Date.now() - duration;
    return this.loadHistory.filter(entry => entry.timestamp > cutoff);
  }

  /**
   * Reset throttling state
   */
  reset() {
    this.currentThrottleDelay = 0;
    this.currentConcurrencyLimit = this.config.maxConcurrentJobs;
    this.circuitBreakerFailures = 0;
    this.circuitBreakerLastFailure = 0;
    this.circuitBreakerOpenTime = 0;
    
    if (this.config.enabled) {
      this.state = ThrottlingState.MONITORING;
    } else {
      this.state = ThrottlingState.DISABLED;
    }
    
    this.emit('throttlingReset', {
      timestamp: Date.now()
    });
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Restart monitoring if interval changed
    if (newConfig.monitoringInterval && this.monitoringTimer) {
      this.startMonitoring();
    }
    
    this.emit('configUpdated', {
      config: this.config,
      timestamp: Date.now()
    });
  }

  /**
   * Cleanup and destroy throttling system
   */
  destroy() {
    this.stopMonitoring();
    
    // Clear all data
    this.activeJobs.clear();
    this.queuedJobs.clear();
    this.jobStartTimes.clear();
    this.resourceSamples = { cpu: [], memory: [], disk: [] };
    this.loadHistory = [];
    
    this.removeAllListeners();
    
    this.emit('destroyed');
  }
}

// Global throttling instance
export const globalQueueThrottling = new QueueThrottling();

export default QueueThrottling;