const { EventEmitter } = require('events');
const { getGlobalResourceMonitor, ResourceStatus } = require('./SystemResourceMonitor');

/**
 * Concurrency control configuration
 */
const ConcurrencyConfig = {
  // Base concurrency limits
  MIN_CONCURRENT_JOBS: 1,
  MAX_CONCURRENT_JOBS: 8,
  DEFAULT_CONCURRENT_JOBS: 3,
  
  // Resource-based adjustments
  CPU_SCALE_FACTOR: 0.8,
  MEMORY_SCALE_FACTOR: 0.7,
  DISK_SCALE_FACTOR: 0.9,
  
  // Adjustment thresholds
  LOW_RESOURCE_THRESHOLD: 30,
  MEDIUM_RESOURCE_THRESHOLD: 60,
  HIGH_RESOURCE_THRESHOLD: 85,
  
  // Adjustment intervals
  ADJUSTMENT_INTERVAL: 10000, // 10 seconds
  STABILITY_PERIOD: 30000,    // 30 seconds
  
  // Performance factors
  PERFORMANCE_HISTORY_SIZE: 20,
  PERFORMANCE_WEIGHT: 0.3,
  RESOURCE_WEIGHT: 0.7,
  
  // Safety margins
  EMERGENCY_REDUCTION_FACTOR: 0.5,
  GRADUAL_INCREASE_FACTOR: 1.2,
  GRADUAL_DECREASE_FACTOR: 0.8
};

/**
 * Concurrency adjustment strategies
 */
const AdjustmentStrategy = {
  CONSERVATIVE: 'conservative',
  BALANCED: 'balanced',
  AGGRESSIVE: 'aggressive',
  CUSTOM: 'custom'
};

/**
 * Concurrency events
 */
const ConcurrencyEvents = {
  LIMIT_CHANGED: 'limit_changed',
  EMERGENCY_REDUCTION: 'emergency_reduction',
  PERFORMANCE_UPDATE: 'performance_update',
  STRATEGY_CHANGED: 'strategy_changed',
  MONITORING_ERROR: 'monitoring_error'
};

/**
 * Dynamic concurrency controller error
 */
class ConcurrencyControllerError extends Error {
  constructor(message, code = 'CONCURRENCY_CONTROLLER_ERROR', details = {}) {
    super(message);
    this.name = 'ConcurrencyControllerError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Dynamic concurrency controller class
 */
class DynamicConcurrencyController extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      ...ConcurrencyConfig,
      ...config
    };
    
    // Current state
    this.currentLimit = this.config.DEFAULT_CONCURRENT_JOBS;
    this.strategy = AdjustmentStrategy.BALANCED;
    this.isActive = false;
    this.adjustmentInterval = null;
    
    // Resource monitor
    this.resourceMonitor = getGlobalResourceMonitor();
    
    // Performance tracking
    this.performanceHistory = [];
    this.lastAdjustment = Date.now();
    this.adjustmentCount = 0;
    
    // Job tracking
    this.activeJobs = new Set();
    this.jobStartTimes = new Map();
    this.jobCompletionTimes = [];
    
    // Bind methods
    this._adjustConcurrency = this._adjustConcurrency.bind(this);
    this._onResourceUpdate = this._onResourceUpdate.bind(this);
  }
  
  /**
   * Start dynamic concurrency control
   */
  start() {
    if (this.isActive) {
      throw new ConcurrencyControllerError('Concurrency controller is already active');
    }
    
    try {
      // Start resource monitoring if not already started
      if (!this.resourceMonitor.isMonitoring) {
        this.resourceMonitor.startMonitoring();
      }
      
      // Listen to resource updates
      this.resourceMonitor.on('resource_update', this._onResourceUpdate);
      
      // Start adjustment interval
      this.adjustmentInterval = setInterval(
        this._adjustConcurrency,
        this.config.ADJUSTMENT_INTERVAL
      );
      
      this.isActive = true;
      
      this.emit('controller_started', {
        initialLimit: this.currentLimit,
        strategy: this.strategy,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      throw new ConcurrencyControllerError(
        `Failed to start concurrency controller: ${error.message}`,
        'START_CONTROLLER_FAILED',
        { originalError: error }
      );
    }
  }
  
  /**
   * Stop dynamic concurrency control
   */
  stop() {
    if (!this.isActive) {
      return;
    }
    
    if (this.adjustmentInterval) {
      clearInterval(this.adjustmentInterval);
      this.adjustmentInterval = null;
    }
    
    // Remove resource monitor listeners
    this.resourceMonitor.removeListener('resource_update', this._onResourceUpdate);
    
    this.isActive = false;
    
    this.emit('controller_stopped', {
      finalLimit: this.currentLimit,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Get current concurrency limit
   */
  getCurrentLimit() {
    return this.currentLimit;
  }
  
  /**
   * Set concurrency limit manually
   */
  setLimit(newLimit, reason = 'manual') {
    const oldLimit = this.currentLimit;
    this.currentLimit = Math.max(
      this.config.MIN_CONCURRENT_JOBS,
      Math.min(this.config.MAX_CONCURRENT_JOBS, newLimit)
    );
    
    if (oldLimit !== this.currentLimit) {
      this.emit(ConcurrencyEvents.LIMIT_CHANGED, {
        oldLimit,
        newLimit: this.currentLimit,
        reason,
        timestamp: new Date().toISOString()
      });
    }
    
    return this.currentLimit;
  }
  
  /**
   * Set adjustment strategy
   */
  setStrategy(strategy) {
    if (!Object.values(AdjustmentStrategy).includes(strategy)) {
      throw new ConcurrencyControllerError(`Invalid strategy: ${strategy}`);
    }
    
    const oldStrategy = this.strategy;
    this.strategy = strategy;
    
    this.emit(ConcurrencyEvents.STRATEGY_CHANGED, {
      oldStrategy,
      newStrategy: strategy,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Check if new job can be started
   */
  canStartJob() {
    return this.activeJobs.size < this.currentLimit;
  }
  
  /**
   * Register job start
   */
  registerJobStart(jobId) {
    this.activeJobs.add(jobId);
    this.jobStartTimes.set(jobId, Date.now());
    
    this.emit('job_started', {
      jobId,
      activeJobs: this.activeJobs.size,
      limit: this.currentLimit,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Register job completion
   */
  registerJobCompletion(jobId, success = true) {
    if (!this.activeJobs.has(jobId)) {
      return;
    }
    
    const startTime = this.jobStartTimes.get(jobId);
    const completionTime = Date.now();
    const duration = startTime ? completionTime - startTime : 0;
    
    this.activeJobs.delete(jobId);
    this.jobStartTimes.delete(jobId);
    
    // Track completion for performance analysis
    this.jobCompletionTimes.push({
      jobId,
      duration,
      success,
      timestamp: new Date().toISOString(),
      concurrencyLevel: this.activeJobs.size + 1 // +1 because we just removed this job
    });
    
    // Cleanup old completion data
    if (this.jobCompletionTimes.length > this.config.PERFORMANCE_HISTORY_SIZE) {
      this.jobCompletionTimes.shift();
    }
    
    this.emit('job_completed', {
      jobId,
      duration,
      success,
      activeJobs: this.activeJobs.size,
      limit: this.currentLimit,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    if (this.jobCompletionTimes.length === 0) {
      return null;
    }
    
    const completions = this.jobCompletionTimes;
    const durations = completions.map(c => c.duration);
    const successRate = completions.filter(c => c.success).length / completions.length;
    
    return {
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate,
      totalJobs: completions.length,
      activeJobs: this.activeJobs.size,
      currentLimit: this.currentLimit,
      efficiency: this._calculateEfficiency()
    };
  }
  
  /**
   * Get controller status
   */
  getStatus() {
    return {
      isActive: this.isActive,
      currentLimit: this.currentLimit,
      strategy: this.strategy,
      activeJobs: this.activeJobs.size,
      adjustmentCount: this.adjustmentCount,
      lastAdjustment: new Date(this.lastAdjustment).toISOString(),
      performance: this.getPerformanceMetrics(),
      resources: this.resourceMonitor.getCurrentResources()
    };
  }
  
  /**
   * Handle resource updates
   */
  _onResourceUpdate(data) {
    const { resources } = data;
    
    // Check for emergency conditions
    if (this._isEmergencyCondition(resources)) {
      this._handleEmergencyReduction(resources);
    }
  }
  
  /**
   * Adjust concurrency based on current conditions
   */
  _adjustConcurrency() {
    try {
      const resources = this.resourceMonitor.getCurrentResources();
      const performance = this.getPerformanceMetrics();
      
      const newLimit = this._calculateOptimalLimit(resources, performance);
      
      if (newLimit !== this.currentLimit) {
        const timeSinceLastAdjustment = Date.now() - this.lastAdjustment;
        
        // Ensure stability period has passed
        if (timeSinceLastAdjustment >= this.config.STABILITY_PERIOD) {
          this.setLimit(newLimit, 'automatic');
          this.lastAdjustment = Date.now();
          this.adjustmentCount++;
        }
      }
      
    } catch (error) {
      this.emit(ConcurrencyEvents.MONITORING_ERROR, {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Calculate optimal concurrency limit
   */
  _calculateOptimalLimit(resources, performance) {
    const resourceScore = this._calculateResourceScore(resources);
    const performanceScore = performance ? this._calculatePerformanceScore(performance) : 0.5;
    
    // Weighted combination of resource and performance scores
    const combinedScore = (
      resourceScore * this.config.RESOURCE_WEIGHT +
      performanceScore * this.config.PERFORMANCE_WEIGHT
    );
    
    // Apply strategy-specific adjustments
    const strategyMultiplier = this._getStrategyMultiplier();
    
    // Calculate base limit from combined score
    const baseLimit = Math.round(
      this.config.MIN_CONCURRENT_JOBS +
      (this.config.MAX_CONCURRENT_JOBS - this.config.MIN_CONCURRENT_JOBS) *
      combinedScore * strategyMultiplier
    );
    
    // Apply gradual adjustment
    return this._applyGradualAdjustment(baseLimit);
  }
  
  /**
   * Calculate resource availability score (0-1)
   */
  _calculateResourceScore(resources) {
    const { cpu, memory, disk } = resources;
    
    // Convert usage percentages to availability scores
    const cpuScore = Math.max(0, (100 - cpu.usage) / 100);
    const memoryScore = Math.max(0, (100 - memory.usagePercent) / 100);
    const diskScore = Math.max(0, (100 - disk.totalUsage) / 100);
    
    // Weighted average with different importance
    return (
      cpuScore * this.config.CPU_SCALE_FACTOR +
      memoryScore * this.config.MEMORY_SCALE_FACTOR +
      diskScore * this.config.DISK_SCALE_FACTOR
    ) / (this.config.CPU_SCALE_FACTOR + this.config.MEMORY_SCALE_FACTOR + this.config.DISK_SCALE_FACTOR);
  }
  
  /**
   * Calculate performance score (0-1)
   */
  _calculatePerformanceScore(performance) {
    // Higher efficiency and success rate = higher score
    const efficiencyScore = Math.min(1, performance.efficiency);
    const successScore = performance.successRate;
    
    // Consider average duration (lower is better)
    const durationScore = performance.averageDuration > 0 ?
      Math.max(0, 1 - (performance.averageDuration / 300000)) : // 5 minutes baseline
      0.5;
    
    return (efficiencyScore + successScore + durationScore) / 3;
  }
  
  /**
   * Get strategy-specific multiplier
   */
  _getStrategyMultiplier() {
    switch (this.strategy) {
      case AdjustmentStrategy.CONSERVATIVE:
        return 0.7;
      case AdjustmentStrategy.BALANCED:
        return 1.0;
      case AdjustmentStrategy.AGGRESSIVE:
        return 1.3;
      default:
        return 1.0;
    }
  }
  
  /**
   * Apply gradual adjustment to prevent oscillation
   */
  _applyGradualAdjustment(targetLimit) {
    const currentLimit = this.currentLimit;
    const difference = targetLimit - currentLimit;
    
    if (Math.abs(difference) <= 1) {
      return targetLimit;
    }
    
    // Gradual increase or decrease
    if (difference > 0) {
      return Math.ceil(currentLimit * this.config.GRADUAL_INCREASE_FACTOR);
    } else {
      return Math.floor(currentLimit * this.config.GRADUAL_DECREASE_FACTOR);
    }
  }
  
  /**
   * Check for emergency conditions
   */
  _isEmergencyCondition(resources) {
    const { cpu, memory, disk } = resources;
    
    return (
      cpu.status === ResourceStatus.CRITICAL ||
      memory.status === ResourceStatus.CRITICAL ||
      disk.status === ResourceStatus.CRITICAL
    );
  }
  
  /**
   * Handle emergency reduction
   */
  _handleEmergencyReduction(resources) {
    const emergencyLimit = Math.max(
      this.config.MIN_CONCURRENT_JOBS,
      Math.floor(this.currentLimit * this.config.EMERGENCY_REDUCTION_FACTOR)
    );
    
    this.setLimit(emergencyLimit, 'emergency');
    
    this.emit(ConcurrencyEvents.EMERGENCY_REDUCTION, {
      resources,
      oldLimit: this.currentLimit,
      newLimit: emergencyLimit,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Calculate system efficiency
   */
  _calculateEfficiency() {
    if (this.activeJobs.size === 0 || this.currentLimit === 0) {
      return 0;
    }
    
    // Efficiency = (active jobs / limit) * resource utilization factor
    const utilizationRatio = this.activeJobs.size / this.currentLimit;
    const resources = this.resourceMonitor.getCurrentResources();
    const resourceUtilization = (
      resources.cpu.usage +
      resources.memory.usagePercent +
      resources.disk.totalUsage
    ) / 300; // Average of three resources (0-1)
    
    return utilizationRatio * (1 - resourceUtilization);
  }
  
  /**
   * Serialize controller state to JSON
   */
  toJSON() {
    return {
      config: this.config,
      currentLimit: this.currentLimit,
      strategy: this.strategy,
      isActive: this.isActive,
      adjustmentCount: this.adjustmentCount,
      activeJobs: Array.from(this.activeJobs),
      performance: this.getPerformanceMetrics()
    };
  }
  
  /**
   * Create controller from JSON data
   */
  static fromJSON(data) {
    const controller = new DynamicConcurrencyController(data.config);
    controller.currentLimit = data.currentLimit || controller.currentLimit;
    controller.strategy = data.strategy || controller.strategy;
    controller.adjustmentCount = data.adjustmentCount || 0;
    
    if (data.activeJobs) {
      data.activeJobs.forEach(jobId => controller.activeJobs.add(jobId));
    }
    
    return controller;
  }
}

// Global concurrency controller instance
let globalConcurrencyController = null;

/**
 * Get or create global concurrency controller
 */
function getGlobalConcurrencyController(config = {}) {
  if (!globalConcurrencyController) {
    globalConcurrencyController = new DynamicConcurrencyController(config);
  }
  return globalConcurrencyController;
}

module.exports = {
  DynamicConcurrencyController,
  ConcurrencyConfig,
  AdjustmentStrategy,
  ConcurrencyEvents,
  ConcurrencyControllerError,
  getGlobalConcurrencyController
};