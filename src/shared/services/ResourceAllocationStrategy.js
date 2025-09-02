/**
 * Resource Allocation Strategy for Conversion Jobs
 * Manages resource distribution among different conversion types
 */

const { EventEmitter } = require('events');
const path = require('path');

/**
 * Conversion type resource profiles
 */
const ConversionResourceProfiles = {
  // Image conversions
  IMAGE_RESIZE: {
    cpu: 0.3,
    memory: 0.2,
    disk: 0.1,
    priority: 'medium',
    estimatedDuration: 5000 // ms
  },
  IMAGE_FORMAT: {
    cpu: 0.4,
    memory: 0.3,
    disk: 0.2,
    priority: 'medium',
    estimatedDuration: 8000
  },
  IMAGE_COMPRESS: {
    cpu: 0.6,
    memory: 0.4,
    disk: 0.3,
    priority: 'medium',
    estimatedDuration: 12000
  },
  
  // Video conversions
  VIDEO_COMPRESS: {
    cpu: 0.8,
    memory: 0.6,
    disk: 0.5,
    priority: 'high',
    estimatedDuration: 60000
  },
  VIDEO_FORMAT: {
    cpu: 0.9,
    memory: 0.7,
    disk: 0.6,
    priority: 'high',
    estimatedDuration: 45000
  },
  VIDEO_TRANSCODE: {
    cpu: 0.95,
    memory: 0.8,
    disk: 0.7,
    priority: 'high',
    estimatedDuration: 120000
  },
  
  // Audio conversions
  AUDIO_FORMAT: {
    cpu: 0.3,
    memory: 0.2,
    disk: 0.2,
    priority: 'low',
    estimatedDuration: 10000
  },
  AUDIO_COMPRESS: {
    cpu: 0.5,
    memory: 0.3,
    disk: 0.3,
    priority: 'medium',
    estimatedDuration: 15000
  },
  
  // Document conversions
  DOCUMENT_PDF: {
    cpu: 0.4,
    memory: 0.5,
    disk: 0.3,
    priority: 'medium',
    estimatedDuration: 20000
  },
  DOCUMENT_IMAGE: {
    cpu: 0.6,
    memory: 0.6,
    disk: 0.4,
    priority: 'medium',
    estimatedDuration: 25000
  },
  
  // Archive operations
  ARCHIVE_CREATE: {
    cpu: 0.3,
    memory: 0.4,
    disk: 0.8,
    priority: 'low',
    estimatedDuration: 30000
  },
  ARCHIVE_EXTRACT: {
    cpu: 0.2,
    memory: 0.3,
    disk: 0.6,
    priority: 'low',
    estimatedDuration: 20000
  }
};

/**
 * Resource allocation strategies
 */
const AllocationStrategy = {
  FAIR: 'fair',           // Equal distribution
  PRIORITY: 'priority',   // Priority-based allocation
  ADAPTIVE: 'adaptive',   // Dynamic based on system state
  GREEDY: 'greedy',      // First-come-first-served with max resources
  BALANCED: 'balanced'    // Balance between priority and fairness
};

/**
 * Resource allocation events
 */
const AllocationEvents = {
  ALLOCATION_CHANGED: 'allocation_changed',
  RESOURCE_RESERVED: 'resource_reserved',
  RESOURCE_RELEASED: 'resource_released',
  STRATEGY_CHANGED: 'strategy_changed',
  ALLOCATION_FAILED: 'allocation_failed',
  REBALANCE_TRIGGERED: 'rebalance_triggered'
};

/**
 * Resource allocation state
 */
class ResourceAllocation {
  constructor(jobId, conversionType, allocation) {
    this.jobId = jobId;
    this.conversionType = conversionType;
    this.allocation = allocation;
    this.reservedAt = Date.now();
    this.lastUpdated = Date.now();
    this.isActive = true;
  }

  update(newAllocation) {
    this.allocation = { ...this.allocation, ...newAllocation };
    this.lastUpdated = Date.now();
  }

  release() {
    this.isActive = false;
    this.releasedAt = Date.now();
  }

  toJSON() {
    return {
      jobId: this.jobId,
      conversionType: this.conversionType,
      allocation: this.allocation,
      reservedAt: this.reservedAt,
      lastUpdated: this.lastUpdated,
      isActive: this.isActive,
      releasedAt: this.releasedAt
    };
  }
}

/**
 * Resource Allocation Strategy Manager
 */
class ResourceAllocationStrategy extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      strategy: options.strategy || AllocationStrategy.BALANCED,
      maxConcurrentJobs: options.maxConcurrentJobs || 5,
      resourceBuffer: options.resourceBuffer || 0.1, // 10% buffer
      rebalanceInterval: options.rebalanceInterval || 30000, // 30s
      priorityWeights: {
        high: 3,
        medium: 2,
        low: 1
      },
      adaptiveThresholds: {
        cpu: 0.8,
        memory: 0.85,
        disk: 0.9
      },
      ...options
    };
    
    this.allocations = new Map(); // jobId -> ResourceAllocation
    this.totalAllocated = {
      cpu: 0,
      memory: 0,
      disk: 0
    };
    
    this.systemResources = {
      cpu: 1.0,
      memory: 1.0,
      disk: 1.0
    };
    
    this.isRunning = false;
    this.rebalanceTimer = null;
    this.allocationHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Start the allocation strategy
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this._startRebalanceTimer();
    this.emit(AllocationEvents.STRATEGY_CHANGED, {
      strategy: this.config.strategy,
      timestamp: Date.now()
    });
  }

  /**
   * Stop the allocation strategy
   */
  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this._stopRebalanceTimer();
    
    // Release all allocations
    for (const allocation of this.allocations.values()) {
      allocation.release();
    }
    
    this._updateTotalAllocated();
  }

  /**
   * Update system resource availability
   */
  updateSystemResources(resources) {
    this.systemResources = { ...this.systemResources, ...resources };
    
    // Trigger rebalance if adaptive strategy
    if (this.config.strategy === AllocationStrategy.ADAPTIVE) {
      this._rebalanceAllocations();
    }
  }

  /**
   * Request resource allocation for a job
   */
  requestAllocation(jobId, conversionType, priority = 'medium', fileSize = 0) {
    try {
      const profile = ConversionResourceProfiles[conversionType];
      if (!profile) {
        throw new Error(`Unknown conversion type: ${conversionType}`);
      }

      // Calculate base allocation
      let allocation = this._calculateBaseAllocation(profile, fileSize);
      
      // Apply strategy-specific adjustments
      allocation = this._applyStrategyAdjustments(allocation, priority, conversionType);
      
      // Check if allocation is possible
      if (!this._canAllocate(allocation)) {
        this.emit(AllocationEvents.ALLOCATION_FAILED, {
          jobId,
          conversionType,
          requestedAllocation: allocation,
          reason: 'insufficient_resources',
          timestamp: Date.now()
        });
        return null;
      }

      // Create and store allocation
      const resourceAllocation = new ResourceAllocation(jobId, conversionType, allocation);
      this.allocations.set(jobId, resourceAllocation);
      this._updateTotalAllocated();
      
      // Add to history
      this._addToHistory('allocated', resourceAllocation);
      
      this.emit(AllocationEvents.RESOURCE_RESERVED, {
        jobId,
        allocation: allocation,
        timestamp: Date.now()
      });
      
      return allocation;
    } catch (error) {
      this.emit(AllocationEvents.ALLOCATION_FAILED, {
        jobId,
        conversionType,
        error: error.message,
        timestamp: Date.now()
      });
      return null;
    }
  }

  /**
   * Release resource allocation for a job
   */
  releaseAllocation(jobId) {
    const allocation = this.allocations.get(jobId);
    if (!allocation || !allocation.isActive) {
      return false;
    }

    allocation.release();
    this.allocations.delete(jobId);
    this._updateTotalAllocated();
    
    // Add to history
    this._addToHistory('released', allocation);
    
    this.emit(AllocationEvents.RESOURCE_RELEASED, {
      jobId,
      allocation: allocation.allocation,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Update allocation for an existing job
   */
  updateAllocation(jobId, newAllocation) {
    const allocation = this.allocations.get(jobId);
    if (!allocation || !allocation.isActive) {
      return false;
    }

    const oldAllocation = { ...allocation.allocation };
    allocation.update(newAllocation);
    this._updateTotalAllocated();
    
    this.emit(AllocationEvents.ALLOCATION_CHANGED, {
      jobId,
      oldAllocation,
      newAllocation: allocation.allocation,
      timestamp: Date.now()
    });
    
    return true;
  }

  /**
   * Get allocation for a specific job
   */
  getAllocation(jobId) {
    const allocation = this.allocations.get(jobId);
    return allocation && allocation.isActive ? allocation.allocation : null;
  }

  /**
   * Get all active allocations
   */
  getAllAllocations() {
    const activeAllocations = {};
    for (const [jobId, allocation] of this.allocations.entries()) {
      if (allocation.isActive) {
        activeAllocations[jobId] = allocation.allocation;
      }
    }
    return activeAllocations;
  }

  /**
   * Get available resources
   */
  getAvailableResources() {
    return {
      cpu: Math.max(0, this.systemResources.cpu - this.totalAllocated.cpu),
      memory: Math.max(0, this.systemResources.memory - this.totalAllocated.memory),
      disk: Math.max(0, this.systemResources.disk - this.totalAllocated.disk)
    };
  }

  /**
   * Get allocation statistics
   */
  getStatistics() {
    const activeCount = Array.from(this.allocations.values())
      .filter(a => a.isActive).length;
    
    return {
      strategy: this.config.strategy,
      activeAllocations: activeCount,
      totalAllocated: { ...this.totalAllocated },
      availableResources: this.getAvailableResources(),
      systemResources: { ...this.systemResources },
      utilizationPercentage: {
        cpu: (this.totalAllocated.cpu / this.systemResources.cpu) * 100,
        memory: (this.totalAllocated.memory / this.systemResources.memory) * 100,
        disk: (this.totalAllocated.disk / this.systemResources.disk) * 100
      },
      historySize: this.allocationHistory.length
    };
  }

  /**
   * Change allocation strategy
   */
  setStrategy(strategy) {
    if (!Object.values(AllocationStrategy).includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}`);
    }
    
    const oldStrategy = this.config.strategy;
    this.config.strategy = strategy;
    
    this.emit(AllocationEvents.STRATEGY_CHANGED, {
      oldStrategy,
      newStrategy: strategy,
      timestamp: Date.now()
    });
    
    // Trigger rebalance with new strategy
    this._rebalanceAllocations();
  }

  /**
   * Calculate base allocation based on profile and file size
   */
  _calculateBaseAllocation(profile, fileSize) {
    // Base allocation from profile
    let allocation = {
      cpu: profile.cpu,
      memory: profile.memory,
      disk: profile.disk
    };
    
    // Adjust based on file size (larger files need more resources)
    if (fileSize > 0) {
      const sizeFactor = Math.min(2.0, Math.max(0.5, fileSize / (100 * 1024 * 1024))); // 100MB baseline
      allocation.cpu *= sizeFactor;
      allocation.memory *= sizeFactor;
      allocation.disk *= sizeFactor;
    }
    
    return allocation;
  }

  /**
   * Apply strategy-specific adjustments
   */
  _applyStrategyAdjustments(allocation, priority, conversionType) {
    switch (this.config.strategy) {
      case AllocationStrategy.PRIORITY:
        return this._applyPriorityAdjustments(allocation, priority);
      
      case AllocationStrategy.ADAPTIVE:
        return this._applyAdaptiveAdjustments(allocation);
      
      case AllocationStrategy.BALANCED:
        return this._applyBalancedAdjustments(allocation, priority);
      
      case AllocationStrategy.GREEDY:
        return this._applyGreedyAdjustments(allocation);
      
      case AllocationStrategy.FAIR:
      default:
        return this._applyFairAdjustments(allocation);
    }
  }

  /**
   * Apply priority-based adjustments
   */
  _applyPriorityAdjustments(allocation, priority) {
    const weight = this.config.priorityWeights[priority] || 1;
    const factor = weight / 2; // Normalize to reasonable range
    
    return {
      cpu: allocation.cpu * factor,
      memory: allocation.memory * factor,
      disk: allocation.disk * factor
    };
  }

  /**
   * Apply adaptive adjustments based on system state
   */
  _applyAdaptiveAdjustments(allocation) {
    const available = this.getAvailableResources();
    const thresholds = this.config.adaptiveThresholds;
    
    // Reduce allocation if system is under pressure
    const cpuPressure = (this.systemResources.cpu - available.cpu) / this.systemResources.cpu;
    const memoryPressure = (this.systemResources.memory - available.memory) / this.systemResources.memory;
    const diskPressure = (this.systemResources.disk - available.disk) / this.systemResources.disk;
    
    const cpuFactor = cpuPressure > thresholds.cpu ? 0.7 : 1.0;
    const memoryFactor = memoryPressure > thresholds.memory ? 0.7 : 1.0;
    const diskFactor = diskPressure > thresholds.disk ? 0.7 : 1.0;
    
    return {
      cpu: allocation.cpu * cpuFactor,
      memory: allocation.memory * memoryFactor,
      disk: allocation.disk * diskFactor
    };
  }

  /**
   * Apply balanced adjustments
   */
  _applyBalancedAdjustments(allocation, priority) {
    // Combine priority and fair adjustments
    const priorityAdjusted = this._applyPriorityAdjustments(allocation, priority);
    const fairAdjusted = this._applyFairAdjustments(allocation);
    
    return {
      cpu: (priorityAdjusted.cpu + fairAdjusted.cpu) / 2,
      memory: (priorityAdjusted.memory + fairAdjusted.memory) / 2,
      disk: (priorityAdjusted.disk + fairAdjusted.disk) / 2
    };
  }

  /**
   * Apply greedy adjustments (maximize resource usage)
   */
  _applyGreedyAdjustments(allocation) {
    const available = this.getAvailableResources();
    
    return {
      cpu: Math.min(allocation.cpu * 1.5, available.cpu),
      memory: Math.min(allocation.memory * 1.5, available.memory),
      disk: Math.min(allocation.disk * 1.5, available.disk)
    };
  }

  /**
   * Apply fair adjustments (equal distribution)
   */
  _applyFairAdjustments(allocation) {
    const activeCount = Array.from(this.allocations.values())
      .filter(a => a.isActive).length;
    
    if (activeCount === 0) return allocation;
    
    const fairShare = 1 / (activeCount + 1); // +1 for the new job
    
    return {
      cpu: Math.min(allocation.cpu, fairShare),
      memory: Math.min(allocation.memory, fairShare),
      disk: Math.min(allocation.disk, fairShare)
    };
  }

  /**
   * Check if allocation is possible
   */
  _canAllocate(allocation) {
    const available = this.getAvailableResources();
    const buffer = this.config.resourceBuffer;
    
    return (
      allocation.cpu <= (available.cpu - buffer) &&
      allocation.memory <= (available.memory - buffer) &&
      allocation.disk <= (available.disk - buffer)
    );
  }

  /**
   * Update total allocated resources
   */
  _updateTotalAllocated() {
    this.totalAllocated = {
      cpu: 0,
      memory: 0,
      disk: 0
    };
    
    for (const allocation of this.allocations.values()) {
      if (allocation.isActive) {
        this.totalAllocated.cpu += allocation.allocation.cpu;
        this.totalAllocated.memory += allocation.allocation.memory;
        this.totalAllocated.disk += allocation.allocation.disk;
      }
    }
  }

  /**
   * Start rebalance timer
   */
  _startRebalanceTimer() {
    if (this.rebalanceTimer) return;
    
    this.rebalanceTimer = setInterval(() => {
      this._rebalanceAllocations();
    }, this.config.rebalanceInterval);
  }

  /**
   * Stop rebalance timer
   */
  _stopRebalanceTimer() {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }
  }

  /**
   * Rebalance allocations based on current strategy
   */
  _rebalanceAllocations() {
    if (!this.isRunning || this.allocations.size === 0) return;
    
    this.emit(AllocationEvents.REBALANCE_TRIGGERED, {
      strategy: this.config.strategy,
      activeAllocations: this.allocations.size,
      timestamp: Date.now()
    });
    
    // Implementation depends on strategy
    // For now, just emit the event
  }

  /**
   * Add allocation event to history
   */
  _addToHistory(action, allocation) {
    this.allocationHistory.push({
      action,
      jobId: allocation.jobId,
      conversionType: allocation.conversionType,
      allocation: { ...allocation.allocation },
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.allocationHistory.length > this.maxHistorySize) {
      this.allocationHistory.shift();
    }
  }
}

/**
 * Global resource allocation strategy instance
 */
let globalResourceAllocationStrategy = null;

function getGlobalResourceAllocationStrategy(options = {}) {
  if (!globalResourceAllocationStrategy) {
    globalResourceAllocationStrategy = new ResourceAllocationStrategy(options);
  }
  return globalResourceAllocationStrategy;
}

module.exports = {
  ResourceAllocationStrategy,
  ConversionResourceProfiles,
  AllocationStrategy,
  AllocationEvents,
  ResourceAllocation,
  getGlobalResourceAllocationStrategy
};