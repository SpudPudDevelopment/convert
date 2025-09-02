/**
 * Temporary Workspace Management Service
 * Handles creation, management, and cleanup of temporary directories for conversion processes
 */

const { EventEmitter } = require('events');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../utils/logger.js');

class TempWorkspaceService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      baseDir: options.baseDir || path.join(os.tmpdir(), 'convert-app'),
      maxWorkspaces: options.maxWorkspaces || 50,
      maxDiskUsage: options.maxDiskUsage || 5 * 1024 * 1024 * 1024, // 5GB
      cleanupInterval: options.cleanupInterval || 30 * 60 * 1000, // 30 minutes
      maxAge: options.maxAge || 24 * 60 * 60 * 1000, // 24 hours
      enableLogging: options.enableLogging !== false,
      enableMonitoring: options.enableMonitoring !== false,
      ...options
    };
    
    // Active workspaces tracking
    this.activeWorkspaces = new Map();
    this.workspaceStats = {
      created: 0,
      cleaned: 0,
      failed: 0,
      totalSize: 0
    };
    
    // Cleanup and monitoring intervals
    this.cleanupInterval = null;
    this.monitoringInterval = null;
    
    // Logger
    this.logger = this.options.enableLogging ? createLogger('TempWorkspace') : null;
    
    // Initialize service
    this.initialize();
  }
  
  /**
   * Initialize the temporary workspace service
   */
  async initialize() {
    try {
      // Ensure base directory exists
      await this.ensureBaseDirectory();
      
      // Start cleanup scheduler
      if (this.options.cleanupInterval > 0) {
        this.startCleanupScheduler();
      }
      
      // Start disk monitoring
      if (this.options.enableMonitoring) {
        this.startDiskMonitoring();
      }
      
      // Clean up any orphaned workspaces from previous sessions
      await this.cleanupOrphanedWorkspaces();
      
      this.log('info', 'TempWorkspaceService initialized', {
        baseDir: this.options.baseDir,
        maxWorkspaces: this.options.maxWorkspaces,
        maxDiskUsage: this.formatBytes(this.options.maxDiskUsage)
      });
      
      this.emit('initialized');
    } catch (error) {
      this.log('error', 'Failed to initialize TempWorkspaceService', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Create a new isolated temporary workspace
   * @param {Object} options - Workspace creation options
   * @returns {Promise<Object>} Workspace information
   */
  async createWorkspace(options = {}) {
    try {
      // Check workspace limits
      await this.checkLimits();
      
      const workspaceId = options.id || uuidv4();
      const workspaceName = options.name || `workspace-${Date.now()}`;
      const workspacePath = path.join(this.options.baseDir, workspaceId);
      
      // Create workspace directory
      await fs.mkdir(workspacePath, { recursive: true });
      
      // Create subdirectories
      const subdirs = {
        input: path.join(workspacePath, 'input'),
        output: path.join(workspacePath, 'output'),
        temp: path.join(workspacePath, 'temp'),
        logs: path.join(workspacePath, 'logs')
      };
      
      for (const [name, dirPath] of Object.entries(subdirs)) {
        await fs.mkdir(dirPath, { recursive: true });
      }
      
      // Create workspace metadata
      const workspace = {
        id: workspaceId,
        name: workspaceName,
        path: workspacePath,
        subdirs,
        createdAt: new Date(),
        lastAccessed: new Date(),
        size: 0,
        fileCount: 0,
        status: 'active',
        processId: options.processId || null,
        metadata: options.metadata || {}
      };
      
      // Save workspace metadata
      const metadataPath = path.join(workspacePath, '.workspace.json');
      await fs.writeFile(metadataPath, JSON.stringify(workspace, null, 2));
      
      // Track workspace
      this.activeWorkspaces.set(workspaceId, workspace);
      this.workspaceStats.created++;
      
      this.log('info', 'Created workspace', {
        id: workspaceId,
        name: workspaceName,
        path: workspacePath
      });
      
      this.emit('workspaceCreated', workspace);
      
      return {
        success: true,
        workspace
      };
    } catch (error) {
      this.workspaceStats.failed++;
      this.log('error', 'Failed to create workspace', { error: error.message });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get workspace information
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Object>} Workspace information
   */
  async getWorkspace(workspaceId) {
    try {
      let workspace = this.activeWorkspaces.get(workspaceId);
      
      if (!workspace) {
        // Try to load from disk
        const workspacePath = path.join(this.options.baseDir, workspaceId);
        const metadataPath = path.join(workspacePath, '.workspace.json');
        
        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          workspace = JSON.parse(metadataContent);
          workspace.createdAt = new Date(workspace.createdAt);
          workspace.lastAccessed = new Date(workspace.lastAccessed);
          
          // Re-track workspace
          this.activeWorkspaces.set(workspaceId, workspace);
        } catch (error) {
          return {
            success: false,
            error: 'Workspace not found'
          };
        }
      }
      
      // Update last accessed time
      workspace.lastAccessed = new Date();
      await this.updateWorkspaceMetadata(workspace);
      
      // Get current size and file count
      const stats = await this.getWorkspaceStats(workspace.path);
      workspace.size = stats.size;
      workspace.fileCount = stats.fileCount;
      
      return {
        success: true,
        workspace
      };
    } catch (error) {
      this.log('error', 'Failed to get workspace', { workspaceId, error: error.message });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Update workspace status
   * @param {string} workspaceId - Workspace ID
   * @param {string} status - New status
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Update result
   */
  async updateWorkspaceStatus(workspaceId, status, metadata = {}) {
    try {
      const workspaceResult = await this.getWorkspace(workspaceId);
      if (!workspaceResult.success) {
        return workspaceResult;
      }
      
      const workspace = workspaceResult.workspace;
      workspace.status = status;
      workspace.lastAccessed = new Date();
      workspace.metadata = { ...workspace.metadata, ...metadata };
      
      await this.updateWorkspaceMetadata(workspace);
      
      this.log('info', 'Updated workspace status', {
        id: workspaceId,
        status,
        metadata
      });
      
      this.emit('workspaceUpdated', workspace);
      
      return {
        success: true,
        workspace
      };
    } catch (error) {
      this.log('error', 'Failed to update workspace status', {
        workspaceId,
        status,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Clean up a specific workspace
   * @param {string} workspaceId - Workspace ID
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupWorkspace(workspaceId, options = {}) {
    try {
      const workspace = this.activeWorkspaces.get(workspaceId);
      if (!workspace && !options.force) {
        return {
          success: false,
          error: 'Workspace not found'
        };
      }
      
      const workspacePath = workspace ? workspace.path : path.join(this.options.baseDir, workspaceId);
      
      // Get workspace stats before cleanup
      let stats = { size: 0, fileCount: 0 };
      try {
        stats = await this.getWorkspaceStats(workspacePath);
      } catch (error) {
        // Workspace might not exist, continue with cleanup
      }
      
      // Remove workspace directory
      try {
        await fs.rm(workspacePath, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
      
      // Remove from tracking
      this.activeWorkspaces.delete(workspaceId);
      this.workspaceStats.cleaned++;
      this.workspaceStats.totalSize = Math.max(0, this.workspaceStats.totalSize - stats.size);
      
      this.log('info', 'Cleaned up workspace', {
        id: workspaceId,
        path: workspacePath,
        size: this.formatBytes(stats.size),
        fileCount: stats.fileCount
      });
      
      this.emit('workspaceCleaned', {
        id: workspaceId,
        path: workspacePath,
        size: stats.size,
        fileCount: stats.fileCount
      });
      
      return {
        success: true,
        stats
      };
    } catch (error) {
      this.log('error', 'Failed to cleanup workspace', {
        workspaceId,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Clean up all workspaces
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupAllWorkspaces(options = {}) {
    try {
      const workspaceIds = Array.from(this.activeWorkspaces.keys());
      const results = {
        total: workspaceIds.length,
        cleaned: 0,
        failed: 0,
        errors: []
      };
      
      for (const workspaceId of workspaceIds) {
        const result = await this.cleanupWorkspace(workspaceId, options);
        if (result.success) {
          results.cleaned++;
        } else {
          results.failed++;
          results.errors.push({
            workspaceId,
            error: result.error
          });
        }
      }
      
      this.log('info', 'Cleaned up all workspaces', results);
      
      return {
        success: true,
        results
      };
    } catch (error) {
      this.log('error', 'Failed to cleanup all workspaces', { error: error.message });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Clean up orphaned workspaces from previous sessions
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupOrphanedWorkspaces() {
    try {
      const baseDir = this.options.baseDir;
      
      // Check if base directory exists
      try {
        await fs.access(baseDir);
      } catch (error) {
        return { success: true, cleaned: 0 };
      }
      
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      const directories = entries.filter(entry => entry.isDirectory());
      
      let cleaned = 0;
      const errors = [];
      
      for (const dir of directories) {
        const dirPath = path.join(baseDir, dir.name);
        const metadataPath = path.join(dirPath, '.workspace.json');
        
        try {
          // Check if workspace has metadata
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          
          // Check if workspace is old or orphaned
          const createdAt = new Date(metadata.createdAt);
          const age = Date.now() - createdAt.getTime();
          
          if (age > this.options.maxAge) {
            await fs.rm(dirPath, { recursive: true, force: true });
            cleaned++;
            
            this.log('info', 'Cleaned orphaned workspace', {
              id: dir.name,
              path: dirPath,
              age: this.formatDuration(age)
            });
          }
        } catch (error) {
          // If no metadata or invalid, consider it orphaned
          try {
            await fs.rm(dirPath, { recursive: true, force: true });
            cleaned++;
            
            this.log('info', 'Cleaned invalid workspace', {
              path: dirPath
            });
          } catch (cleanupError) {
            errors.push({
              path: dirPath,
              error: cleanupError.message
            });
          }
        }
      }
      
      this.log('info', 'Orphaned workspace cleanup completed', {
        cleaned,
        errors: errors.length
      });
      
      return {
        success: true,
        cleaned,
        errors
      };
    } catch (error) {
      this.log('error', 'Failed to cleanup orphaned workspaces', { error: error.message });
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get all active workspaces
   * @returns {Array} List of active workspaces
   */
  getActiveWorkspaces() {
    return Array.from(this.activeWorkspaces.values());
  }
  
  /**
   * Get workspace statistics
   * @returns {Object} Workspace statistics
   */
  getStats() {
    return {
      ...this.workspaceStats,
      active: this.activeWorkspaces.size,
      totalSizeFormatted: this.formatBytes(this.workspaceStats.totalSize)
    };
  }
  
  /**
   * Get disk usage information
   * @returns {Promise<Object>} Disk usage stats
   */
  async getDiskUsage() {
    try {
      const stats = await fs.stat(this.options.baseDir);
      const totalSize = await this.calculateTotalSize(this.options.baseDir);
      
      return {
        success: true,
        data: {
          totalSize,
          totalSizeFormatted: this.formatBytes(totalSize),
          maxSize: this.options.maxDiskUsage,
          maxSizeFormatted: this.formatBytes(this.options.maxDiskUsage),
          usagePercentage: (totalSize / this.options.maxDiskUsage) * 100,
          available: this.options.maxDiskUsage - totalSize,
          availableFormatted: this.formatBytes(this.options.maxDiskUsage - totalSize)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Start cleanup scheduler
   */
  startCleanupScheduler() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.scheduledCleanup();
      } catch (error) {
        this.log('error', 'Scheduled cleanup failed', { error: error.message });
      }
    }, this.options.cleanupInterval);
    
    this.log('info', 'Cleanup scheduler started', {
      interval: this.formatDuration(this.options.cleanupInterval)
    });
  }
  
  /**
   * Start disk monitoring
   */
  startDiskMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorDiskUsage();
      } catch (error) {
        this.log('error', 'Disk monitoring failed', { error: error.message });
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    this.log('info', 'Disk monitoring started');
  }
  
  /**
   * Perform scheduled cleanup
   */
  async scheduledCleanup() {
    const now = Date.now();
    const workspacesToClean = [];
    
    // Find workspaces to clean
    for (const [id, workspace] of this.activeWorkspaces) {
      const age = now - workspace.createdAt.getTime();
      const lastAccessAge = now - workspace.lastAccessed.getTime();
      
      // Clean if workspace is old or hasn't been accessed recently
      if (age > this.options.maxAge || 
          (workspace.status === 'completed' && lastAccessAge > 60 * 60 * 1000) || // 1 hour
          workspace.status === 'failed') {
        workspacesToClean.push(id);
      }
    }
    
    // Clean up identified workspaces
    for (const workspaceId of workspacesToClean) {
      await this.cleanupWorkspace(workspaceId);
    }
    
    if (workspacesToClean.length > 0) {
      this.log('info', 'Scheduled cleanup completed', {
        cleaned: workspacesToClean.length
      });
    }
  }
  
  /**
   * Monitor disk usage and clean up if necessary
   */
  async monitorDiskUsage() {
    const usage = await this.getDiskUsage();
    if (!usage.success) return;
    
    const { usagePercentage, totalSize } = usage.data;
    
    // Emit warning if usage is high
    if (usagePercentage > 80) {
      this.emit('diskUsageWarning', {
        percentage: usagePercentage,
        totalSize,
        maxSize: this.options.maxDiskUsage
      });
      
      this.log('warn', 'High disk usage detected', {
        percentage: `${usagePercentage.toFixed(1)}%`,
        totalSize: this.formatBytes(totalSize)
      });
    }
    
    // Force cleanup if usage is critical
    if (usagePercentage > 90) {
      this.log('warn', 'Critical disk usage, forcing cleanup');
      await this.forceCleanup();
    }
  }
  
  /**
   * Force cleanup of oldest workspaces
   */
  async forceCleanup() {
    const workspaces = Array.from(this.activeWorkspaces.values())
      .sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());
    
    const toClean = Math.ceil(workspaces.length * 0.3); // Clean 30% of workspaces
    
    for (let i = 0; i < toClean && i < workspaces.length; i++) {
      await this.cleanupWorkspace(workspaces[i].id);
    }
    
    this.log('info', 'Force cleanup completed', { cleaned: toClean });
  }
  
  /**
   * Check workspace and disk limits before creating new workspace
   */
  async checkLimits() {
    // Check workspace count limit
    if (this.activeWorkspaces.size >= this.options.maxWorkspaces) {
      throw new Error(`Maximum number of workspaces (${this.options.maxWorkspaces}) reached`);
    }
    
    // Check disk usage limit
    const usage = await this.getDiskUsage();
    if (usage.success && usage.data.usagePercentage > 95) {
      throw new Error('Disk usage limit exceeded');
    }
  }
  
  /**
   * Ensure base directory exists
   */
  async ensureBaseDirectory() {
    try {
      await fs.mkdir(this.options.baseDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
  
  /**
   * Update workspace metadata file
   */
  async updateWorkspaceMetadata(workspace) {
    const metadataPath = path.join(workspace.path, '.workspace.json');
    await fs.writeFile(metadataPath, JSON.stringify(workspace, null, 2));
    this.activeWorkspaces.set(workspace.id, workspace);
  }
  
  /**
   * Get workspace statistics (size and file count)
   */
  async getWorkspaceStats(workspacePath) {
    try {
      const stats = { size: 0, fileCount: 0 };
      
      const entries = await fs.readdir(workspacePath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = path.join(workspacePath, entry.name);
        
        if (entry.isDirectory()) {
          const subStats = await this.getWorkspaceStats(entryPath);
          stats.size += subStats.size;
          stats.fileCount += subStats.fileCount;
        } else {
          const fileStat = await fs.stat(entryPath);
          stats.size += fileStat.size;
          stats.fileCount++;
        }
      }
      
      return stats;
    } catch (error) {
      return { size: 0, fileCount: 0 };
    }
  }
  
  /**
   * Calculate total size of directory
   */
  async calculateTotalSize(dirPath) {
    try {
      const stats = await this.getWorkspaceStats(dirPath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
  
  /**
   * Format duration to human readable format
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  
  /**
   * Log message if logging is enabled
   */
  log(level, message, data = {}) {
    if (this.logger) {
      this.logger[level](message, data);
    }
  }
  
  /**
   * Cleanup service and stop all intervals
   */
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.removeAllListeners();
    
    this.log('info', 'TempWorkspaceService cleaned up');
  }
}

module.exports = { TempWorkspaceService };