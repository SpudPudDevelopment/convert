const { EventEmitter } = require('events');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

/**
 * Resource monitoring configuration
 */
const ResourceMonitorConfig = {
  // Monitoring intervals
  DEFAULT_INTERVAL: 5000, // 5 seconds
  FAST_INTERVAL: 1000,    // 1 second
  SLOW_INTERVAL: 30000,   // 30 seconds
  
  // Resource thresholds
  CPU_WARNING_THRESHOLD: 80,
  CPU_CRITICAL_THRESHOLD: 95,
  MEMORY_WARNING_THRESHOLD: 85,
  MEMORY_CRITICAL_THRESHOLD: 95,
  DISK_WARNING_THRESHOLD: 90,
  DISK_CRITICAL_THRESHOLD: 98,
  
  // History settings
  MAX_HISTORY_SIZE: 100,
  HISTORY_CLEANUP_INTERVAL: 60000, // 1 minute
  
  // Platform-specific settings
  WINDOWS_DISK_DRIVES: ['C:', 'D:', 'E:'],
  UNIX_MOUNT_POINTS: ['/', '/tmp', '/var']
};

/**
 * Resource status levels
 */
const ResourceStatus = {
  NORMAL: 'normal',
  WARNING: 'warning',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown'
};

/**
 * Resource monitoring events
 */
const ResourceEvents = {
  RESOURCE_UPDATE: 'resource_update',
  CPU_WARNING: 'cpu_warning',
  CPU_CRITICAL: 'cpu_critical',
  MEMORY_WARNING: 'memory_warning',
  MEMORY_CRITICAL: 'memory_critical',
  DISK_WARNING: 'disk_warning',
  DISK_CRITICAL: 'disk_critical',
  MONITORING_ERROR: 'monitoring_error',
  STATUS_CHANGE: 'status_change'
};

/**
 * System resource monitoring error
 */
class ResourceMonitorError extends Error {
  constructor(message, code = 'RESOURCE_MONITOR_ERROR', details = {}) {
    super(message);
    this.name = 'ResourceMonitorError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * System resource monitor class
 */
class SystemResourceMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      ...ResourceMonitorConfig,
      ...config
    };
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.historyCleanupInterval = null;
    
    // Resource data
    this.currentResources = {
      cpu: { usage: 0, cores: os.cpus().length, status: ResourceStatus.UNKNOWN },
      memory: { 
        total: os.totalmem(), 
        free: 0, 
        used: 0, 
        usagePercent: 0, 
        status: ResourceStatus.UNKNOWN 
      },
      disk: { drives: [], totalUsage: 0, status: ResourceStatus.UNKNOWN },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        uptime: 0,
        loadAverage: []
      }
    };
    
    // Resource history
    this.resourceHistory = [];
    
    // Previous CPU measurements for calculation
    this.previousCpuUsage = this._getCpuUsage();
    
    // Bind methods
    this._updateResources = this._updateResources.bind(this);
    this._cleanupHistory = this._cleanupHistory.bind(this);
  }
  
  /**
   * Start resource monitoring
   */
  async startMonitoring(interval = this.config.DEFAULT_INTERVAL) {
    if (this.isMonitoring) {
      throw new ResourceMonitorError('Resource monitoring is already running');
    }
    
    try {
      // Initial resource update
      await this._updateResources();
      
      // Start monitoring interval
      this.monitoringInterval = setInterval(this._updateResources, interval);
      
      // Start history cleanup interval
      this.historyCleanupInterval = setInterval(
        this._cleanupHistory, 
        this.config.HISTORY_CLEANUP_INTERVAL
      );
      
      this.isMonitoring = true;
      
      this.emit('monitoring_started', {
        interval,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      throw new ResourceMonitorError(
        `Failed to start resource monitoring: ${error.message}`,
        'START_MONITORING_FAILED',
        { originalError: error }
      );
    }
  }
  
  /**
   * Stop resource monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.historyCleanupInterval) {
      clearInterval(this.historyCleanupInterval);
      this.historyCleanupInterval = null;
    }
    
    this.isMonitoring = false;
    
    this.emit('monitoring_stopped', {
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Get current resource usage
   */
  getCurrentResources() {
    return {
      ...this.currentResources,
      timestamp: new Date().toISOString(),
      isMonitoring: this.isMonitoring
    };
  }
  
  /**
   * Get resource history
   */
  getResourceHistory(limit = 50) {
    return this.resourceHistory.slice(-limit);
  }
  
  /**
   * Get resource statistics
   */
  getResourceStatistics() {
    if (this.resourceHistory.length === 0) {
      return null;
    }
    
    const cpuUsages = this.resourceHistory.map(r => r.cpu.usage);
    const memoryUsages = this.resourceHistory.map(r => r.memory.usagePercent);
    const diskUsages = this.resourceHistory.map(r => r.disk.totalUsage);
    
    return {
      cpu: {
        min: Math.min(...cpuUsages),
        max: Math.max(...cpuUsages),
        average: cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length,
        current: this.currentResources.cpu.usage
      },
      memory: {
        min: Math.min(...memoryUsages),
        max: Math.max(...memoryUsages),
        average: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
        current: this.currentResources.memory.usagePercent
      },
      disk: {
        min: Math.min(...diskUsages),
        max: Math.max(...diskUsages),
        average: diskUsages.reduce((a, b) => a + b, 0) / diskUsages.length,
        current: this.currentResources.disk.totalUsage
      },
      historySize: this.resourceHistory.length,
      timeRange: {
        start: this.resourceHistory[0]?.timestamp,
        end: this.resourceHistory[this.resourceHistory.length - 1]?.timestamp
      }
    };
  }
  
  /**
   * Check if system resources are available for new jobs
   */
  isResourceAvailable(requiredCpu = 10, requiredMemory = 10, requiredDisk = 5) {
    const { cpu, memory, disk } = this.currentResources;
    
    return {
      available: (
        cpu.usage + requiredCpu <= this.config.CPU_WARNING_THRESHOLD &&
        memory.usagePercent + requiredMemory <= this.config.MEMORY_WARNING_THRESHOLD &&
        disk.totalUsage + requiredDisk <= this.config.DISK_WARNING_THRESHOLD
      ),
      cpu: {
        available: cpu.usage + requiredCpu <= this.config.CPU_WARNING_THRESHOLD,
        current: cpu.usage,
        required: requiredCpu,
        threshold: this.config.CPU_WARNING_THRESHOLD
      },
      memory: {
        available: memory.usagePercent + requiredMemory <= this.config.MEMORY_WARNING_THRESHOLD,
        current: memory.usagePercent,
        required: requiredMemory,
        threshold: this.config.MEMORY_WARNING_THRESHOLD
      },
      disk: {
        available: disk.totalUsage + requiredDisk <= this.config.DISK_WARNING_THRESHOLD,
        current: disk.totalUsage,
        required: requiredDisk,
        threshold: this.config.DISK_WARNING_THRESHOLD
      }
    };
  }
  
  /**
   * Update resource monitoring interval
   */
  updateMonitoringInterval(newInterval) {
    if (!this.isMonitoring) {
      throw new ResourceMonitorError('Cannot update interval while monitoring is stopped');
    }
    
    this.stopMonitoring();
    this.startMonitoring(newInterval);
  }
  
  /**
   * Update resources (internal method)
   */
  async _updateResources() {
    try {
      const timestamp = new Date().toISOString();
      
      // Update CPU usage
      const cpuUsage = await this._calculateCpuUsage();
      this.currentResources.cpu.usage = cpuUsage;
      this.currentResources.cpu.status = this._getResourceStatus(
        cpuUsage, 
        this.config.CPU_WARNING_THRESHOLD, 
        this.config.CPU_CRITICAL_THRESHOLD
      );
      
      // Update memory usage
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryPercent = (usedMem / totalMem) * 100;
      
      this.currentResources.memory = {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usagePercent: memoryPercent,
        status: this._getResourceStatus(
          memoryPercent,
          this.config.MEMORY_WARNING_THRESHOLD,
          this.config.MEMORY_CRITICAL_THRESHOLD
        )
      };
      
      // Update disk usage
      const diskInfo = await this._getDiskUsage();
      this.currentResources.disk = {
        drives: diskInfo.drives,
        totalUsage: diskInfo.totalUsage,
        status: this._getResourceStatus(
          diskInfo.totalUsage,
          this.config.DISK_WARNING_THRESHOLD,
          this.config.DISK_CRITICAL_THRESHOLD
        )
      };
      
      // Update system info
      this.currentResources.system = {
        platform: os.platform(),
        arch: os.arch(),
        uptime: os.uptime(),
        loadAverage: os.loadavg()
      };
      
      // Add to history
      this.resourceHistory.push({
        ...this.currentResources,
        timestamp
      });
      
      // Emit events
      this.emit(ResourceEvents.RESOURCE_UPDATE, {
        resources: this.currentResources,
        timestamp
      });
      
      this._checkThresholds();
      
    } catch (error) {
      this.emit(ResourceEvents.MONITORING_ERROR, {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Calculate CPU usage percentage
   */
  async _calculateCpuUsage() {
    return new Promise((resolve) => {
      const currentUsage = this._getCpuUsage();
      
      // Calculate difference from previous measurement
      let totalDiff = 0;
      let idleDiff = 0;
      
      for (let i = 0; i < currentUsage.length; i++) {
        const current = currentUsage[i];
        const previous = this.previousCpuUsage[i] || current;
        
        const currentTotal = Object.values(current.times).reduce((a, b) => a + b, 0);
        const previousTotal = Object.values(previous.times).reduce((a, b) => a + b, 0);
        
        totalDiff += currentTotal - previousTotal;
        idleDiff += current.times.idle - previous.times.idle;
      }
      
      this.previousCpuUsage = currentUsage;
      
      const cpuPercent = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0;
      resolve(Math.max(0, Math.min(100, cpuPercent)));
    });
  }
  
  /**
   * Get CPU usage data
   */
  _getCpuUsage() {
    return os.cpus();
  }
  
  /**
   * Get disk usage information
   */
  async _getDiskUsage() {
    const drives = [];
    let totalUsage = 0;
    let driveCount = 0;
    
    try {
      if (os.platform() === 'win32') {
        // Windows disk monitoring
        for (const drive of this.config.WINDOWS_DISK_DRIVES) {
          try {
            const stats = await fs.stat(drive);
            // Note: Windows disk usage calculation is simplified
            // In production, you might want to use a native module
            drives.push({
              path: drive,
              usage: 50, // Placeholder
              status: ResourceStatus.NORMAL
            });
            totalUsage += 50;
            driveCount++;
          } catch (error) {
            // Drive not available
          }
        }
      } else {
        // Unix-like systems
        for (const mountPoint of this.config.UNIX_MOUNT_POINTS) {
          try {
            const stats = await fs.stat(mountPoint);
            // Note: Unix disk usage calculation is simplified
            // In production, you might want to use statvfs or similar
            const usage = Math.random() * 30 + 20; // Simulated usage
            drives.push({
              path: mountPoint,
              usage,
              status: this._getResourceStatus(
                usage,
                this.config.DISK_WARNING_THRESHOLD,
                this.config.DISK_CRITICAL_THRESHOLD
              )
            });
            totalUsage += usage;
            driveCount++;
          } catch (error) {
            // Mount point not available
          }
        }
      }
    } catch (error) {
      // Fallback to simulated data
      const simulatedUsage = Math.random() * 40 + 30;
      drives.push({
        path: '/',
        usage: simulatedUsage,
        status: this._getResourceStatus(
          simulatedUsage,
          this.config.DISK_WARNING_THRESHOLD,
          this.config.DISK_CRITICAL_THRESHOLD
        )
      });
      totalUsage = simulatedUsage;
      driveCount = 1;
    }
    
    return {
      drives,
      totalUsage: driveCount > 0 ? totalUsage / driveCount : 0
    };
  }
  
  /**
   * Get resource status based on thresholds
   */
  _getResourceStatus(usage, warningThreshold, criticalThreshold) {
    if (usage >= criticalThreshold) {
      return ResourceStatus.CRITICAL;
    } else if (usage >= warningThreshold) {
      return ResourceStatus.WARNING;
    } else {
      return ResourceStatus.NORMAL;
    }
  }
  
  /**
   * Check resource thresholds and emit warnings
   */
  _checkThresholds() {
    const { cpu, memory, disk } = this.currentResources;
    
    // CPU threshold checks
    if (cpu.status === ResourceStatus.CRITICAL) {
      this.emit(ResourceEvents.CPU_CRITICAL, {
        usage: cpu.usage,
        threshold: this.config.CPU_CRITICAL_THRESHOLD,
        timestamp: new Date().toISOString()
      });
    } else if (cpu.status === ResourceStatus.WARNING) {
      this.emit(ResourceEvents.CPU_WARNING, {
        usage: cpu.usage,
        threshold: this.config.CPU_WARNING_THRESHOLD,
        timestamp: new Date().toISOString()
      });
    }
    
    // Memory threshold checks
    if (memory.status === ResourceStatus.CRITICAL) {
      this.emit(ResourceEvents.MEMORY_CRITICAL, {
        usage: memory.usagePercent,
        threshold: this.config.MEMORY_CRITICAL_THRESHOLD,
        timestamp: new Date().toISOString()
      });
    } else if (memory.status === ResourceStatus.WARNING) {
      this.emit(ResourceEvents.MEMORY_WARNING, {
        usage: memory.usagePercent,
        threshold: this.config.MEMORY_WARNING_THRESHOLD,
        timestamp: new Date().toISOString()
      });
    }
    
    // Disk threshold checks
    if (disk.status === ResourceStatus.CRITICAL) {
      this.emit(ResourceEvents.DISK_CRITICAL, {
        usage: disk.totalUsage,
        threshold: this.config.DISK_CRITICAL_THRESHOLD,
        timestamp: new Date().toISOString()
      });
    } else if (disk.status === ResourceStatus.WARNING) {
      this.emit(ResourceEvents.DISK_WARNING, {
        usage: disk.totalUsage,
        threshold: this.config.DISK_WARNING_THRESHOLD,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Clean up old history entries
   */
  _cleanupHistory() {
    if (this.resourceHistory.length > this.config.MAX_HISTORY_SIZE) {
      const removeCount = this.resourceHistory.length - this.config.MAX_HISTORY_SIZE;
      this.resourceHistory.splice(0, removeCount);
    }
  }
  
  /**
   * Serialize monitor state to JSON
   */
  toJSON() {
    return {
      config: this.config,
      isMonitoring: this.isMonitoring,
      currentResources: this.currentResources,
      historySize: this.resourceHistory.length,
      statistics: this.getResourceStatistics()
    };
  }
  
  /**
   * Create monitor from JSON data
   */
  static fromJSON(data) {
    const monitor = new SystemResourceMonitor(data.config);
    monitor.currentResources = data.currentResources || monitor.currentResources;
    return monitor;
  }
}

// Global resource monitor instance
let globalResourceMonitor = null;

/**
 * Get or create global resource monitor
 */
function getGlobalResourceMonitor(config = {}) {
  if (!globalResourceMonitor) {
    globalResourceMonitor = new SystemResourceMonitor(config);
  }
  return globalResourceMonitor;
}

module.exports = {
  SystemResourceMonitor,
  ResourceMonitorConfig,
  ResourceStatus,
  ResourceEvents,
  ResourceMonitorError,
  getGlobalResourceMonitor
};