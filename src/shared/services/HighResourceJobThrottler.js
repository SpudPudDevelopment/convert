/**
 * High-Resource Job Throttling System
 * Advanced throttling mechanisms for resource-intensive conversion jobs
 */

const { EventEmitter } = require('events');
const { ConversionResourceProfiles } = require('./ResourceAllocationStrategy');

/**
 * Throttling strategies
 */
const ThrottlingStrategy = {
  NONE: 'none',
  LINEAR: 'linear',
  EXPONENTIAL: 'exponential',
  ADAPTIVE: 'adaptive',
  CIRCUIT_BREAKER: 'circuit_breaker',
  TOKEN_BUCKET: 'token_bucket',
  SLIDING_WINDOW: 'sliding_window'
};

/**
 * Resource intensity levels
 */
const ResourceIntensity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  EXTREME: 'extreme'
};

/**
 * Throttling events
 */
const ThrottlingEvents = {
  JOB_THROTTLED: 'job_throttled',
  JOB_DELAYED: 'job_delayed',
  JOB_REJECTED: 'job_rejected',
  THROTTLE_ACTIVATED: 'throttle_activated',
  THROTTLE_DEACTIVATED: 'throttle_deactivated',
  STRATEGY_CHANGED: 'strategy_changed',
  CIRCUIT_OPENED: 'circuit_opened',
  CIRCUIT_CLOSED: 'circuit_closed',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded'
};

/**
 * Circuit breaker states
 */
const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

/**
 * Throttled job representation
 */
class ThrottledJob {
  constructor(jobId, conversionType, resourceIntensity, originalStartTime) {
    this.jobId = jobId;
    this.conversionType = conversionType;
    this.resourceIntensity = resourceIntensity;
    this.originalStartTime = originalStartTime;
    this.throttledAt = Date.now();
    this.delayedUntil = null;
    this.throttleCount = 0;
    this.totalDelay = 0;
    this.lastThrottleReason = null;
  }

  addDelay(delayMs, reason) {
    this.delayedUntil = Date.now() + delayMs;
    this.throttleCount++;
    this.totalDelay += delayMs;
    this.lastThrottleReason = reason;
  }

  isReady() {
    return !this.delayedUntil || Date.now() >= this.delayedUntil;
  }

  getRemainingDelay() {
    if (!this.delayedUntil) return 0;
    return Math.max(0, this.delayedUntil - Date.now());
  }

  toJSON() {
    return {
      jobId: this.jobId,
      conversionType: this.conversionType,
      resourceIntensity: this.resourceIntensity,
      originalStartTime: this.originalStartTime,
      throttledAt: this.throttledAt,
      delayedUntil: this.delayedUntil,
      throttleCount: this.throttleCount,
      totalDelay: this.totalDelay,
      lastThrottleReason: this.lastThrottleReason,
      remainingDelay: this.getRemainingDelay(),
      isReady: this.isReady()
    };
  }
}

/**
 * Token bucket for rate limiting
 */
class TokenBucket {
  constructor(capacity, refillRate, refillInterval = 1000) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
    this.lastRefill = Date.now();
    this.refillTimer = null;
  }

  start() {
    if (this.refillTimer) return;
    
    this.refillTimer = setInterval(() => {
      this.refill();
    }, this.refillInterval);
  }

  stop() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor((timePassed / this.refillInterval) * this.refillRate);
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  consume(tokens = 1) {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  getAvailableTokens() {
    this.refill();
    return this.tokens;
  }
}

/**
 * Sliding window rate limiter
 */
class SlidingWindow {
  constructor(windowSize, maxRequests) {
    this.windowSize = windowSize;
    this.maxRequests = maxRequests;
    this.requests = [];
  }

  canProcess() {
    const now = Date.now();
    const windowStart = now - this.windowSize;
    
    // Remove old requests
    this.requests = this.requests.filter(time => time > windowStart);
    
    return this.requests.length < this.maxRequests;
  }

  recordRequest() {
    if (this.canProcess()) {
      this.requests.push(Date.now());
      return true;
    }
    return false;
  }

  getRequestCount() {
    const now = Date.now();
    const windowStart = now - this.windowSize;
    this.requests = this.requests.filter(time => time > windowStart);
    return this.requests.length;
  }
}

/**
 * High-Resource Job Throttler
 */
class HighResourceJobThrottler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      strategy: options.strategy || ThrottlingStrategy.ADAPTIVE,
      maxConcurrentHighResourceJobs: options.maxConcurrentHighResourceJobs || 2,
      maxConcurrentExtremeResourceJobs: options.maxConcurrentExtremeResourceJobs || 1,
      baseThrottleDelay: options.baseThrottleDelay || 5000, // 5 seconds
      maxThrottleDelay: options.maxThrottleDelay || 300000, // 5 minutes
      throttleMultiplier: options.throttleMultiplier || 1.5,
      resourceThresholds: {
        cpu: options.cpuThreshold || 0.8,
        memory: options.memoryThreshold || 0.85,
        disk: options.diskThreshold || 0.9
      },
      circuitBreaker: {
        failureThreshold: options.failureThreshold || 5,
        recoveryTimeout: options.recoveryTimeout || 60000, // 1 minute
        halfOpenMaxCalls: options.halfOpenMaxCalls || 3
      },
      tokenBucket: {
        capacity: options.tokenCapacity || 10,
        refillRate: options.tokenRefillRate || 2,
        refillInterval: options.tokenRefillInterval || 1000
      },
      slidingWindow: {
        windowSize: options.windowSize || 60000, // 1 minute
        maxRequests: options.maxRequests || 10
      },
      ...options
    };
    
    this.throttledJobs = new Map(); // jobId -> ThrottledJob
    this.activeHighResourceJobs = new Set();
    this.activeExtremeResourceJobs = new Set();
    
    // Circuit breaker state
    this.circuitState = CircuitState.CLOSED;
    this.circuitFailureCount = 0;
    this.circuitLastFailure = null;
    this.circuitHalfOpenCalls = 0;
    
    // Rate limiting components
    this.tokenBucket = new TokenBucket(
      this.config.tokenBucket.capacity,
      this.config.tokenBucket.refillRate,
      this.config.tokenBucket.refillInterval
    );
    
    this.slidingWindow = new SlidingWindow(
      this.config.slidingWindow.windowSize,
      this.config.slidingWindow.maxRequests
    );
    
    this.systemResources = {
      cpu: 0,
      memory: 0,
      disk: 0
    };
    
    this.isRunning = false;
    this.monitoringTimer = null;
    this.throttleHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Start the throttler
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.tokenBucket.start();
    this._startMonitoring();
  }

  /**
   * Stop the throttler
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.tokenBucket.stop();
    this._stopMonitoring();
    
    this.throttledJobs.clear();
    this.activeHighResourceJobs.clear();
    this.activeExtremeResourceJobs.clear();
  }

  /**
   * Update system resource usage
   */
  updateSystemResources(resources) {
    this.systemResources = { ...this.systemResources, ...resources };
  }

  /**
   * Check if a job should be throttled
   */
  shouldThrottleJob(jobId, conversionType, fileSize = 0) {
    try {
      const resourceIntensity = this._getResourceIntensity(conversionType, fileSize);
      
      // Check circuit breaker
      if (this._isCircuitOpen()) {
        this._recordThrottle(jobId, 'circuit_breaker_open');
        return {
          shouldThrottle: true,
          reason: 'circuit_breaker_open',
          delay: this.config.baseThrottleDelay,
          resourceIntensity
        };
      }
      
      // Apply strategy-specific throttling
      const throttleResult = this._applyThrottlingStrategy(jobId, conversionType, resourceIntensity, fileSize);
      
      if (throttleResult.shouldThrottle) {
        this._recordThrottle(jobId, throttleResult.reason);
      }
      
      return throttleResult;
    } catch (error) {
      this._recordThrottle(jobId, `error: ${error.message}`);
      return {
        shouldThrottle: true,
        reason: 'error',
        delay: this.config.baseThrottleDelay,
        resourceIntensity: ResourceIntensity.HIGH
      };
    }
  }

  /**
   * Throttle a job
   */
  throttleJob(jobId, conversionType, delay, reason) {
    const resourceIntensity = this._getResourceIntensity(conversionType);
    const throttledJob = new ThrottledJob(jobId, conversionType, resourceIntensity, Date.now());
    
    throttledJob.addDelay(delay, reason);
    this.throttledJobs.set(jobId, throttledJob);
    
    this.emit(ThrottlingEvents.JOB_THROTTLED, {
      jobId,
      conversionType,
      resourceIntensity,
      delay,
      reason,
      timestamp: Date.now()
    });
    
    // Schedule job release
    setTimeout(() => {
      this._releaseThrottledJob(jobId);
    }, delay);
  }

  /**
   * Register job start
   */
  registerJobStart(jobId, conversionType, fileSize = 0) {
    const resourceIntensity = this._getResourceIntensity(conversionType, fileSize);
    
    if (resourceIntensity === ResourceIntensity.HIGH) {
      this.activeHighResourceJobs.add(jobId);
    } else if (resourceIntensity === ResourceIntensity.EXTREME) {
      this.activeExtremeResourceJobs.add(jobId);
    }
  }

  /**
   * Register job completion
   */
  registerJobCompletion(jobId, success = true) {
    this.activeHighResourceJobs.delete(jobId);
    this.activeExtremeResourceJobs.delete(jobId);
    this.throttledJobs.delete(jobId);
    
    // Update circuit breaker
    if (success) {
      this._recordCircuitSuccess();
    } else {
      this._recordCircuitFailure();
    }
  }

  /**
   * Get throttling status
   */
  getThrottlingStatus() {
    return {
      strategy: this.config.strategy,
      isRunning: this.isRunning,
      throttledJobs: this.throttledJobs.size,
      activeHighResourceJobs: this.activeHighResourceJobs.size,
      activeExtremeResourceJobs: this.activeExtremeResourceJobs.size,
      circuitState: this.circuitState,
      circuitFailureCount: this.circuitFailureCount,
      tokenBucket: {
        availableTokens: this.tokenBucket.getAvailableTokens(),
        capacity: this.tokenBucket.capacity
      },
      slidingWindow: {
        currentRequests: this.slidingWindow.getRequestCount(),
        maxRequests: this.config.slidingWindow.maxRequests
      },
      systemResources: { ...this.systemResources }
    };
  }

  /**
   * Get detailed throttling information
   */
  getDetailedThrottlingInfo() {
    const throttledJobsInfo = Array.from(this.throttledJobs.values())
      .map(job => job.toJSON());
    
    return {
      status: this.getThrottlingStatus(),
      throttledJobs: throttledJobsInfo,
      recentHistory: this.throttleHistory.slice(-50), // Last 50 events
      resourceThresholds: this.config.resourceThresholds
    };
  }

  /**
   * Change throttling strategy
   */
  setStrategy(strategy) {
    if (!Object.values(ThrottlingStrategy).includes(strategy)) {
      throw new Error(`Invalid throttling strategy: ${strategy}`);
    }
    
    const oldStrategy = this.config.strategy;
    this.config.strategy = strategy;
    
    this.emit(ThrottlingEvents.STRATEGY_CHANGED, {
      oldStrategy,
      newStrategy: strategy,
      timestamp: Date.now()
    });
  }

  /**
   * Get resource intensity for a conversion type
   */
  _getResourceIntensity(conversionType, fileSize = 0) {
    const profile = ConversionResourceProfiles[conversionType];
    if (!profile) return ResourceIntensity.MEDIUM;
    
    const totalResourceUsage = profile.cpu + profile.memory + profile.disk;
    const sizeFactor = fileSize > 0 ? Math.min(2.0, fileSize / (100 * 1024 * 1024)) : 1.0;
    const adjustedUsage = totalResourceUsage * sizeFactor;
    
    if (adjustedUsage >= 2.0) return ResourceIntensity.EXTREME;
    if (adjustedUsage >= 1.5) return ResourceIntensity.HIGH;
    if (adjustedUsage >= 1.0) return ResourceIntensity.MEDIUM;
    return ResourceIntensity.LOW;
  }

  /**
   * Apply throttling strategy
   */
  _applyThrottlingStrategy(jobId, conversionType, resourceIntensity, fileSize) {
    switch (this.config.strategy) {
      case ThrottlingStrategy.NONE:
        return { shouldThrottle: false };
      
      case ThrottlingStrategy.LINEAR:
        return this._applyLinearThrottling(resourceIntensity);
      
      case ThrottlingStrategy.EXPONENTIAL:
        return this._applyExponentialThrottling(jobId, resourceIntensity);
      
      case ThrottlingStrategy.ADAPTIVE:
        return this._applyAdaptiveThrottling(resourceIntensity);
      
      case ThrottlingStrategy.CIRCUIT_BREAKER:
        return this._applyCircuitBreakerThrottling(resourceIntensity);
      
      case ThrottlingStrategy.TOKEN_BUCKET:
        return this._applyTokenBucketThrottling(resourceIntensity);
      
      case ThrottlingStrategy.SLIDING_WINDOW:
        return this._applySlidingWindowThrottling(resourceIntensity);
      
      default:
        return this._applyAdaptiveThrottling(resourceIntensity);
    }
  }

  /**
   * Apply linear throttling
   */
  _applyLinearThrottling(resourceIntensity) {
    const concurrentCount = this._getConcurrentCount(resourceIntensity);
    const maxConcurrent = this._getMaxConcurrent(resourceIntensity);
    
    if (concurrentCount >= maxConcurrent) {
      return {
        shouldThrottle: true,
        reason: 'linear_limit_exceeded',
        delay: this.config.baseThrottleDelay,
        resourceIntensity
      };
    }
    
    return { shouldThrottle: false, resourceIntensity };
  }

  /**
   * Apply exponential throttling
   */
  _applyExponentialThrottling(jobId, resourceIntensity) {
    const existingJob = this.throttledJobs.get(jobId);
    const throttleCount = existingJob ? existingJob.throttleCount : 0;
    
    const concurrentCount = this._getConcurrentCount(resourceIntensity);
    const maxConcurrent = this._getMaxConcurrent(resourceIntensity);
    
    if (concurrentCount >= maxConcurrent) {
      const delay = Math.min(
        this.config.baseThrottleDelay * Math.pow(this.config.throttleMultiplier, throttleCount),
        this.config.maxThrottleDelay
      );
      
      return {
        shouldThrottle: true,
        reason: 'exponential_backoff',
        delay,
        resourceIntensity
      };
    }
    
    return { shouldThrottle: false, resourceIntensity };
  }

  /**
   * Apply adaptive throttling
   */
  _applyAdaptiveThrottling(resourceIntensity) {
    const systemPressure = this._calculateSystemPressure();
    const concurrentCount = this._getConcurrentCount(resourceIntensity);
    const maxConcurrent = this._getMaxConcurrent(resourceIntensity);
    
    // Adjust limits based on system pressure
    const adjustedMaxConcurrent = Math.floor(maxConcurrent * (1 - systemPressure * 0.5));
    
    if (concurrentCount >= adjustedMaxConcurrent) {
      const delay = this.config.baseThrottleDelay * (1 + systemPressure);
      
      return {
        shouldThrottle: true,
        reason: 'adaptive_system_pressure',
        delay,
        resourceIntensity
      };
    }
    
    return { shouldThrottle: false, resourceIntensity };
  }

  /**
   * Apply circuit breaker throttling
   */
  _applyCircuitBreakerThrottling(resourceIntensity) {
    if (this.circuitState === CircuitState.OPEN) {
      return {
        shouldThrottle: true,
        reason: 'circuit_breaker_open',
        delay: this.config.circuitBreaker.recoveryTimeout,
        resourceIntensity
      };
    }
    
    if (this.circuitState === CircuitState.HALF_OPEN) {
      if (this.circuitHalfOpenCalls >= this.config.circuitBreaker.halfOpenMaxCalls) {
        return {
          shouldThrottle: true,
          reason: 'circuit_breaker_half_open_limit',
          delay: this.config.baseThrottleDelay,
          resourceIntensity
        };
      }
      this.circuitHalfOpenCalls++;
    }
    
    return { shouldThrottle: false, resourceIntensity };
  }

  /**
   * Apply token bucket throttling
   */
  _applyTokenBucketThrottling(resourceIntensity) {
    const tokensRequired = resourceIntensity === ResourceIntensity.EXTREME ? 3 :
                          resourceIntensity === ResourceIntensity.HIGH ? 2 : 1;
    
    if (!this.tokenBucket.consume(tokensRequired)) {
      return {
        shouldThrottle: true,
        reason: 'token_bucket_empty',
        delay: this.config.tokenBucket.refillInterval,
        resourceIntensity
      };
    }
    
    return { shouldThrottle: false, resourceIntensity };
  }

  /**
   * Apply sliding window throttling
   */
  _applySlidingWindowThrottling(resourceIntensity) {
    if (!this.slidingWindow.recordRequest()) {
      return {
        shouldThrottle: true,
        reason: 'sliding_window_limit',
        delay: this.config.slidingWindow.windowSize / this.config.slidingWindow.maxRequests,
        resourceIntensity
      };
    }
    
    return { shouldThrottle: false, resourceIntensity };
  }

  /**
   * Calculate system pressure
   */
  _calculateSystemPressure() {
    const cpuPressure = Math.max(0, this.systemResources.cpu - this.config.resourceThresholds.cpu);
    const memoryPressure = Math.max(0, this.systemResources.memory - this.config.resourceThresholds.memory);
    const diskPressure = Math.max(0, this.systemResources.disk - this.config.resourceThresholds.disk);
    
    return Math.min(1.0, (cpuPressure + memoryPressure + diskPressure) / 3);
  }

  /**
   * Get concurrent job count for resource intensity
   */
  _getConcurrentCount(resourceIntensity) {
    if (resourceIntensity === ResourceIntensity.EXTREME) {
      return this.activeExtremeResourceJobs.size;
    } else if (resourceIntensity === ResourceIntensity.HIGH) {
      return this.activeHighResourceJobs.size;
    }
    return 0;
  }

  /**
   * Get max concurrent jobs for resource intensity
   */
  _getMaxConcurrent(resourceIntensity) {
    if (resourceIntensity === ResourceIntensity.EXTREME) {
      return this.config.maxConcurrentExtremeResourceJobs;
    } else if (resourceIntensity === ResourceIntensity.HIGH) {
      return this.config.maxConcurrentHighResourceJobs;
    }
    return Infinity;
  }

  /**
   * Check if circuit is open
   */
  _isCircuitOpen() {
    if (this.circuitState === CircuitState.OPEN) {
      // Check if recovery timeout has passed
      if (Date.now() - this.circuitLastFailure > this.config.circuitBreaker.recoveryTimeout) {
        this.circuitState = CircuitState.HALF_OPEN;
        this.circuitHalfOpenCalls = 0;
        
        this.emit(ThrottlingEvents.CIRCUIT_OPENED, {
          state: CircuitState.HALF_OPEN,
          timestamp: Date.now()
        });
        
        return false;
      }
      return true;
    }
    
    return false;
  }

  /**
   * Record circuit breaker success
   */
  _recordCircuitSuccess() {
    if (this.circuitState === CircuitState.HALF_OPEN) {
      this.circuitState = CircuitState.CLOSED;
      this.circuitFailureCount = 0;
      this.circuitHalfOpenCalls = 0;
      
      this.emit(ThrottlingEvents.CIRCUIT_CLOSED, {
        timestamp: Date.now()
      });
    }
  }

  /**
   * Record circuit breaker failure
   */
  _recordCircuitFailure() {
    this.circuitFailureCount++;
    this.circuitLastFailure = Date.now();
    
    if (this.circuitFailureCount >= this.config.circuitBreaker.failureThreshold) {
      this.circuitState = CircuitState.OPEN;
      
      this.emit(ThrottlingEvents.CIRCUIT_OPENED, {
        failureCount: this.circuitFailureCount,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Release throttled job
   */
  _releaseThrottledJob(jobId) {
    const throttledJob = this.throttledJobs.get(jobId);
    if (throttledJob && throttledJob.isReady()) {
      this.throttledJobs.delete(jobId);
      
      this.emit(ThrottlingEvents.JOB_DELAYED, {
        jobId,
        totalDelay: throttledJob.totalDelay,
        throttleCount: throttledJob.throttleCount,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Record throttle event
   */
  _recordThrottle(jobId, reason) {
    this.throttleHistory.push({
      jobId,
      reason,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.throttleHistory.length > this.maxHistorySize) {
      this.throttleHistory.shift();
    }
  }

  /**
   * Start monitoring
   */
  _startMonitoring() {
    this.monitoringTimer = setInterval(() => {
      this._checkThrottledJobs();
    }, 5000); // Check every 5 seconds
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
   * Check and release ready throttled jobs
   */
  _checkThrottledJobs() {
    for (const [jobId, throttledJob] of this.throttledJobs.entries()) {
      if (throttledJob.isReady()) {
        this._releaseThrottledJob(jobId);
      }
    }
  }
}

/**
 * Global high-resource job throttler instance
 */
let globalHighResourceJobThrottler = null;

function getGlobalHighResourceJobThrottler(options = {}) {
  if (!globalHighResourceJobThrottler) {
    globalHighResourceJobThrottler = new HighResourceJobThrottler(options);
  }
  return globalHighResourceJobThrottler;
}

module.exports = {
  HighResourceJobThrottler,
  ThrottlingStrategy,
  ResourceIntensity,
  ThrottlingEvents,
  CircuitState,
  ThrottledJob,
  TokenBucket,
  SlidingWindow,
  getGlobalHighResourceJobThrottler
};