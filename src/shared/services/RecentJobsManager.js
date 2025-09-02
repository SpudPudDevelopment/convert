import { EventEmitter } from 'events';
import { ConversionType, JobStatus } from '../types/jobEnums.js';
import { UserPreferences, RecentJob } from '../../renderer/models/UserPreferences.js';

/**
 * Events emitted by RecentJobsManager
 */
export const RecentJobsEvents = {
  JOB_ADDED: 'job_added',
  JOB_UPDATED: 'job_updated',
  JOB_REMOVED: 'job_removed',
  JOBS_CLEARED: 'jobs_cleared',
  JOBS_FILTERED: 'jobs_filtered',
  CLEANUP_PERFORMED: 'cleanup_performed'
};

/**
 * Enhanced Recent Jobs Manager
 * Provides comprehensive functionality for tracking and managing recent conversion jobs
 */
export class RecentJobsManager extends EventEmitter {
  constructor(userPreferences = null) {
    super();
    
    this.userPreferences = userPreferences;
    this.maxHistorySize = 100; // Default max history size
    this.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    this.autoCleanupEnabled = true;
    
    // Initialize settings from user preferences if available
    if (this.userPreferences) {
      this.maxHistorySize = this.userPreferences.recentJobsSettings?.maxCount || 100;
      this.maxAge = this.userPreferences.recentJobsSettings?.maxAge || this.maxAge;
      this.autoCleanupEnabled = this.userPreferences.recentJobsSettings?.autoCleanup !== false;
    }
    
    // Performance tracking
    this.stats = {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      averageDuration: 0,
      totalProcessingTime: 0,
      lastCleanup: Date.now()
    };
    
    this._updateStats();
  }
  
  /**
   * Add a new job to recent history
   * @param {Object} jobData - Job data to add
   * @returns {RecentJob} The created job entry
   */
  addJob(jobData) {
    // Create enhanced job entry with additional metadata
    const enhancedJobData = {
      ...jobData,
      id: jobData.id || this._generateJobId(),
      createdAt: jobData.createdAt || Date.now(),
      updatedAt: Date.now(),
      metadata: {
        ...jobData.metadata,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Electron',
        platform: typeof process !== 'undefined' ? process.platform : 'unknown',
        version: '1.0.0' // App version
      }
    };
    
    const job = new RecentJob(enhancedJobData);
    
    // Add to user preferences if available
    if (this.userPreferences) {
      this.userPreferences.addRecentJob(job);
    }
    
    // Update statistics
    this._updateStats();
    
    // Emit event
    this.emit(RecentJobsEvents.JOB_ADDED, {
      job: job.toJSON(),
      timestamp: Date.now()
    });
    
    // Auto-cleanup if enabled
    if (this.autoCleanupEnabled) {
      this._performAutoCleanup();
    }
    
    return job;
  }
  
  /**
   * Update an existing job in the history
   * @param {string} jobId - ID of the job to update
   * @param {Object} updates - Updates to apply
   * @returns {boolean} True if job was found and updated
   */
  updateJob(jobId, updates) {
    if (!this.userPreferences) {
      return false;
    }
    
    const jobIndex = this.userPreferences.recentJobs.findIndex(job => job.id === jobId);
    if (jobIndex === -1) {
      return false;
    }
    
    const job = this.userPreferences.recentJobs[jobIndex];
    
    // Apply updates
    Object.assign(job, updates, {
      updatedAt: Date.now()
    });
    
    // Update user preferences timestamp
    this.userPreferences.updatedAt = Date.now();
    
    // Update statistics
    this._updateStats();
    
    // Emit event
    this.emit(RecentJobsEvents.JOB_UPDATED, {
      jobId,
      updates,
      job: job.toJSON(),
      timestamp: Date.now()
    });
    
    return true;
  }
  
  /**
   * Remove a job from the history
   * @param {string} jobId - ID of the job to remove
   * @returns {boolean} True if job was found and removed
   */
  removeJob(jobId) {
    if (!this.userPreferences) {
      return false;
    }
    
    const initialLength = this.userPreferences.recentJobs.length;
    this.userPreferences.recentJobs = this.userPreferences.recentJobs.filter(job => job.id !== jobId);
    
    if (this.userPreferences.recentJobs.length < initialLength) {
      this.userPreferences.updatedAt = Date.now();
      
      // Update statistics
      this._updateStats();
      
      // Emit event
      this.emit(RecentJobsEvents.JOB_REMOVED, {
        jobId,
        timestamp: Date.now()
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Get recent jobs with advanced filtering and sorting
   * @param {Object} options - Filtering and sorting options
   * @returns {Array} Filtered and sorted jobs
   */
  getJobs(options = {}) {
    if (!this.userPreferences) {
      return [];
    }
    
    let jobs = [...this.userPreferences.recentJobs];
    
    // Apply filters
    jobs = this._applyFilters(jobs, options);
    
    // Apply sorting
    jobs = this._applySorting(jobs, options);
    
    // Apply pagination
    if (options.offset || options.limit) {
      const offset = options.offset || 0;
      const limit = options.limit || jobs.length;
      jobs = jobs.slice(offset, offset + limit);
    }
    
    // Emit filtering event for analytics
    this.emit(RecentJobsEvents.JOBS_FILTERED, {
      filterOptions: options,
      resultCount: jobs.length,
      timestamp: Date.now()
    });
    
    return jobs;
  }
  
  /**
   * Get jobs by conversion type
   * @param {string} conversionType - Type of conversion
   * @param {Object} options - Additional options
   * @returns {Array} Jobs of the specified type
   */
  getJobsByType(conversionType, options = {}) {
    return this.getJobs({
      ...options,
      type: conversionType
    });
  }
  
  /**
   * Get jobs from today
   * @param {Object} options - Additional options
   * @returns {Array} Jobs from today
   */
  getTodaysJobs(options = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.getJobs({
      ...options,
      since: today.getTime()
    });
  }
  
  /**
   * Get jobs from the last N days
   * @param {number} days - Number of days to look back
   * @param {Object} options - Additional options
   * @returns {Array} Jobs from the specified period
   */
  getJobsFromLastDays(days, options = {}) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return this.getJobs({
      ...options,
      since
    });
  }
  
  /**
   * Get frequently used settings from recent jobs
   * @param {Object} options - Options for analysis
   * @returns {Array} Most frequently used settings
   */
  getFrequentSettings(options = {}) {
    const jobs = this.getJobs({ limit: options.analysisLimit || 50 });
    const settingsMap = new Map();
    
    jobs.forEach(job => {
      if (job.settings) {
        const settingsKey = JSON.stringify(job.settings);
        const count = settingsMap.get(settingsKey) || 0;
        settingsMap.set(settingsKey, count + 1);
      }
    });
    
    // Convert to array and sort by frequency
    const frequentSettings = Array.from(settingsMap.entries())
      .map(([settingsJson, count]) => ({
        settings: JSON.parse(settingsJson),
        count,
        percentage: (count / jobs.length) * 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, options.limit || 10);
    
    return frequentSettings;
  }
  
  /**
   * Get conversion statistics
   * @returns {Object} Statistics about recent conversions
   */
  getStatistics() {
    return {
      ...this.stats,
      currentHistorySize: this.userPreferences?.recentJobs?.length || 0,
      maxHistorySize: this.maxHistorySize,
      oldestJob: this._getOldestJob(),
      newestJob: this._getNewestJob(),
      conversionTypeBreakdown: this._getConversionTypeBreakdown(),
      statusBreakdown: this._getStatusBreakdown()
    };
  }
  
  /**
   * Clear all recent jobs
   * @returns {boolean} True if jobs were cleared
   */
  clearAllJobs() {
    if (!this.userPreferences) {
      return false;
    }
    
    const clearedCount = this.userPreferences.recentJobs.length;
    this.userPreferences.clearRecentJobs();
    
    // Reset statistics
    this.stats = {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      averageDuration: 0,
      totalProcessingTime: 0,
      lastCleanup: Date.now()
    };
    
    // Emit event
    this.emit(RecentJobsEvents.JOBS_CLEARED, {
      clearedCount,
      timestamp: Date.now()
    });
    
    return true;
  }
  
  /**
   * Perform cleanup of old jobs
   * @param {Object} options - Cleanup options
   * @returns {number} Number of jobs removed
   */
  cleanup(options = {}) {
    if (!this.userPreferences) {
      return 0;
    }
    
    const maxAge = options.maxAge || this.maxAge;
    const maxCount = options.maxCount || this.maxHistorySize;
    const now = Date.now();
    
    const initialCount = this.userPreferences.recentJobs.length;
    
    // Remove jobs older than maxAge
    this.userPreferences.recentJobs = this.userPreferences.recentJobs.filter(job => 
      (now - job.createdAt) <= maxAge
    );
    
    // Limit to maxCount (keep most recent)
    if (this.userPreferences.recentJobs.length > maxCount) {
      this.userPreferences.recentJobs = this.userPreferences.recentJobs
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, maxCount);
    }
    
    const removedCount = initialCount - this.userPreferences.recentJobs.length;
    
    if (removedCount > 0) {
      this.userPreferences.updatedAt = Date.now();
      this.stats.lastCleanup = Date.now();
      
      // Update statistics
      this._updateStats();
      
      // Emit event
      this.emit(RecentJobsEvents.CLEANUP_PERFORMED, {
        removedCount,
        remainingCount: this.userPreferences.recentJobs.length,
        timestamp: Date.now()
      });
    }
    
    return removedCount;
  }
  
  /**
   * Export recent jobs data
   * @param {Object} options - Export options
   * @returns {Object} Exported data
   */
  exportData(options = {}) {
    const jobs = this.getJobs(options);
    
    return {
      exportedAt: Date.now(),
      version: '1.0.0',
      totalJobs: jobs.length,
      jobs: jobs.map(job => job.toJSON ? job.toJSON() : job),
      statistics: this.getStatistics(),
      settings: {
        maxHistorySize: this.maxHistorySize,
        maxAge: this.maxAge,
        autoCleanupEnabled: this.autoCleanupEnabled
      }
    };
  }
  
  /**
   * Import recent jobs data
   * @param {Object} data - Data to import
   * @param {Object} options - Import options
   * @returns {number} Number of jobs imported
   */
  importData(data, options = {}) {
    if (!data.jobs || !Array.isArray(data.jobs)) {
      throw new Error('Invalid import data: jobs array is required');
    }
    
    let importedCount = 0;
    
    data.jobs.forEach(jobData => {
      try {
        if (options.skipDuplicates) {
          // Check if job already exists
          const existingJob = this.userPreferences?.recentJobs?.find(job => job.id === jobData.id);
          if (existingJob) {
            return; // Skip duplicate
          }
        }
        
        this.addJob(jobData);
        importedCount++;
      } catch (error) {
        console.warn('Failed to import job:', jobData.id, error);
      }
    });
    
    return importedCount;
  }
  
  // Private methods
  
  /**
   * Generate unique job ID
   * @returns {string} Unique job ID
   */
  _generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Apply filters to jobs array
   * @param {Array} jobs - Jobs to filter
   * @param {Object} options - Filter options
   * @returns {Array} Filtered jobs
   */
  _applyFilters(jobs, options) {
    let filtered = jobs;
    
    // Filter by type
    if (options.type) {
      filtered = filtered.filter(job => job.type === options.type);
    }
    
    // Filter by status
    if (options.status) {
      filtered = filtered.filter(job => job.status === options.status);
    }
    
    // Filter by date range
    if (options.since) {
      filtered = filtered.filter(job => job.createdAt >= options.since);
    }
    
    if (options.until) {
      filtered = filtered.filter(job => job.createdAt <= options.until);
    }
    
    // Filter by preset used
    if (options.presetUsed) {
      filtered = filtered.filter(job => job.presetUsed === options.presetUsed);
    }
    
    // Filter by file size range
    if (options.minFileSize) {
      filtered = filtered.filter(job => job.fileSize >= options.minFileSize);
    }
    
    if (options.maxFileSize) {
      filtered = filtered.filter(job => job.fileSize <= options.maxFileSize);
    }
    
    // Filter by duration range
    if (options.minDuration) {
      filtered = filtered.filter(job => job.duration >= options.minDuration);
    }
    
    if (options.maxDuration) {
      filtered = filtered.filter(job => job.duration <= options.maxDuration);
    }
    
    // Text search in job name or source files
    if (options.search) {
      const searchTerm = options.search.toLowerCase();
      filtered = filtered.filter(job => {
        const nameMatch = job.name?.toLowerCase().includes(searchTerm);
        const fileMatch = job.sourceFiles?.some(file => 
          file.name?.toLowerCase().includes(searchTerm)
        );
        return nameMatch || fileMatch;
      });
    }
    
    return filtered;
  }
  
  /**
   * Apply sorting to jobs array
   * @param {Array} jobs - Jobs to sort
   * @param {Object} options - Sort options
   * @returns {Array} Sorted jobs
   */
  _applySorting(jobs, options) {
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';
    
    return jobs.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      // Handle special sorting cases
      if (sortBy === 'name') {
        aValue = (aValue || '').toLowerCase();
        bValue = (bValue || '').toLowerCase();
      }
      
      // Compare values
      let comparison = 0;
      if (aValue < bValue) {
        comparison = -1;
      } else if (aValue > bValue) {
        comparison = 1;
      }
      
      // Apply sort order
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
  
  /**
   * Perform automatic cleanup
   */
  _performAutoCleanup() {
    // Only cleanup if it's been more than 1 hour since last cleanup
    const hoursSinceLastCleanup = (Date.now() - this.stats.lastCleanup) / (1000 * 60 * 60);
    
    if (hoursSinceLastCleanup >= 1) {
      this.cleanup();
    }
  }
  
  /**
   * Update internal statistics
   */
  _updateStats() {
    if (!this.userPreferences?.recentJobs) {
      return;
    }
    
    const jobs = this.userPreferences.recentJobs;
    
    this.stats.totalJobs = jobs.length;
    this.stats.successfulJobs = jobs.filter(job => job.status === 'completed').length;
    this.stats.failedJobs = jobs.filter(job => job.status === 'failed').length;
    
    // Calculate average duration
    const completedJobs = jobs.filter(job => job.status === 'completed' && job.duration > 0);
    if (completedJobs.length > 0) {
      this.stats.totalProcessingTime = completedJobs.reduce((sum, job) => sum + job.duration, 0);
      this.stats.averageDuration = this.stats.totalProcessingTime / completedJobs.length;
    }
  }
  
  /**
   * Get oldest job
   * @returns {Object|null} Oldest job or null
   */
  _getOldestJob() {
    if (!this.userPreferences?.recentJobs?.length) {
      return null;
    }
    
    return this.userPreferences.recentJobs.reduce((oldest, job) => 
      job.createdAt < oldest.createdAt ? job : oldest
    );
  }
  
  /**
   * Get newest job
   * @returns {Object|null} Newest job or null
   */
  _getNewestJob() {
    if (!this.userPreferences?.recentJobs?.length) {
      return null;
    }
    
    return this.userPreferences.recentJobs.reduce((newest, job) => 
      job.createdAt > newest.createdAt ? job : newest
    );
  }
  
  /**
   * Get conversion type breakdown
   * @returns {Object} Breakdown by conversion type
   */
  _getConversionTypeBreakdown() {
    if (!this.userPreferences?.recentJobs?.length) {
      return {};
    }
    
    const breakdown = {};
    
    this.userPreferences.recentJobs.forEach(job => {
      const type = job.type || 'unknown';
      breakdown[type] = (breakdown[type] || 0) + 1;
    });
    
    return breakdown;
  }
  
  /**
   * Get status breakdown
   * @returns {Object} Breakdown by job status
   */
  _getStatusBreakdown() {
    if (!this.userPreferences?.recentJobs?.length) {
      return {};
    }
    
    const breakdown = {};
    
    this.userPreferences.recentJobs.forEach(job => {
      const status = job.status || 'unknown';
      breakdown[status] = (breakdown[status] || 0) + 1;
    });
    
    return breakdown;
  }
}

export default RecentJobsManager;