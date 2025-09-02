const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { ConversionType, JobStatus } = require('../../shared/types/jobEnums.js');

// Mock the UserPreferences module to include our MockRecentJob
jest.mock('../../shared/models/UserPreferences.js', () => {
  const originalModule = jest.requireActual('../../shared/models/UserPreferences.js');
  
  // Mock RecentJob class
  class MockRecentJob {
    constructor(data = {}) {
      this.id = data.id || this._generateId();
      this.name = data.name || '';
      this.type = data.type || 'unknown';
      this.sourceFiles = data.sourceFiles || [];
      this.targetFormat = data.targetFormat || '';
      this.outputPath = data.outputPath || '';
      this.status = data.status || 'completed';
      this.duration = data.duration || 0;
      this.fileSize = data.fileSize || 0;
      this.createdAt = data.createdAt || Date.now();
      this.updatedAt = data.updatedAt || Date.now();
      this.settings = data.settings || {};
      this.presetUsed = data.presetUsed || null;
      this.metadata = data.metadata || {
        userAgent: 'test-agent',
        platform: 'test',
        version: '1.0.0'
      };
    }
    
    _generateId() {
      return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    toJSON() {
      return {
        id: this.id,
        name: this.name,
        type: this.type,
        sourceFiles: this.sourceFiles,
        targetFormat: this.targetFormat,
        outputPath: this.outputPath,
        status: this.status,
        duration: this.duration,
        fileSize: this.fileSize,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        settings: this.settings,
        presetUsed: this.presetUsed,
        metadata: this.metadata
      };
    }
  }
  
  return {
    ...originalModule,
    RecentJob: MockRecentJob
  };
});

const { RecentJobsManager, RecentJobsEvents } = require('../../shared/services/RecentJobsManager.js');
const { UserPreferences } = require('../../shared/models/UserPreferences.js');

describe('RecentJobsManager', () => {
  let manager;
  let userPreferences;
  let mockEventListener;

  beforeEach(() => {
    // Mock UserPreferences with the methods RecentJobsManager expects
    userPreferences = {
      recentJobs: [],
      recentJobsSettings: {
        maxCount: 100,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        autoCleanup: true
      },
      updatedAt: Date.now(),
      addRecentJob: jest.fn((job) => {
        userPreferences.recentJobs.unshift(job);
        userPreferences.updatedAt = Date.now();
      }),
      getRecentJobs: jest.fn((options = {}) => {
        let jobs = [...userPreferences.recentJobs];
        if (options.type) {
          jobs = jobs.filter(job => job.type === options.type);
        }
        if (options.status) {
          jobs = jobs.filter(job => job.status === options.status);
        }
        if (options.limit) {
          jobs = jobs.slice(0, options.limit);
        }
        return jobs;
      }),
      clearRecentJobs: jest.fn(() => {
        userPreferences.recentJobs = [];
        userPreferences.updatedAt = Date.now();
      }),
      cleanupRecentJobs: jest.fn(() => {
        const now = Date.now();
        const maxAge = userPreferences.recentJobsSettings.maxAge;
        const originalCount = userPreferences.recentJobs.length;
        userPreferences.recentJobs = userPreferences.recentJobs.filter(job => 
          (now - job.createdAt) <= maxAge
        );
        return originalCount - userPreferences.recentJobs.length;
      })
    };
    manager = new RecentJobsManager(userPreferences);
    mockEventListener = jest.fn();
  });

  afterEach(() => {
    manager.removeAllListeners();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default settings', () => {
      expect(manager.userPreferences).toBe(userPreferences);
      expect(manager.maxHistorySize).toBe(100);
      expect(manager.maxAge).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
      expect(manager.autoCleanupEnabled).toBe(true);
    });

    it('should initialize with custom settings from userPreferences', () => {
      const customUserPreferences = {
        recentJobs: [],
        recentJobsSettings: {
          maxCount: 50,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          autoCleanup: false
        },
        updatedAt: Date.now(),
        addRecentJob: jest.fn((job) => {
          customUserPreferences.recentJobs.unshift(job);
          customUserPreferences.updatedAt = Date.now();
        }),
        getRecentJobs: jest.fn(() => []),
        clearRecentJobs: jest.fn(() => {
          customUserPreferences.recentJobs = [];
          customUserPreferences.updatedAt = Date.now();
        }),
        cleanupRecentJobs: jest.fn(() => 0)
      };
      
      const customManager = new RecentJobsManager(customUserPreferences);

      expect(customManager.maxHistorySize).toBe(50);
      expect(customManager.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
      expect(customManager.autoCleanupEnabled).toBe(false);
    });
  });

  describe('addJob', () => {
    it('should add a new job and emit event', () => {
      manager.on(RecentJobsEvents.JOB_ADDED, mockEventListener);

      const jobData = {
        name: 'test-conversion',
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        sourceFiles: [{ name: 'test.jpg', size: 1024 }],
        outputFormat: 'png',
        fileSize: 1024,
        duration: 5000,
        settings: { quality: 90 }
      };

      const job = manager.addJob(jobData);

      expect(job).toBeDefined();
      expect(job.name).toBe('test-conversion');
      expect(job.type).toBe(ConversionType.IMAGE);
      expect(job.id).toBeDefined();
      expect(job.createdAt).toBeDefined();
      expect(mockEventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          job: expect.objectContaining({ name: 'test-conversion' }),
          timestamp: expect.any(Number)
        })
      );
    });

    it('should generate unique job IDs', () => {
      const job1 = manager.addJob({ name: 'job1', type: ConversionType.IMAGE });
      const job2 = manager.addJob({ name: 'job2', type: ConversionType.VIDEO });

      expect(job1.id).not.toBe(job2.id);
    });

    it('should add metadata to jobs', () => {
      const job = manager.addJob({ name: 'test', type: ConversionType.AUDIO });

      expect(job.metadata).toBeDefined();
      expect(job.metadata.version).toBe('1.0.0');
      expect(job.metadata.platform).toBeDefined();
    });
  });

  describe('updateJob', () => {
    it('should update existing job and emit event', () => {
      const job = manager.addJob({ name: 'test', type: ConversionType.IMAGE });
      manager.on(RecentJobsEvents.JOB_UPDATED, mockEventListener);

      const success = manager.updateJob(job.id, {
        status: JobStatus.COMPLETED,
        duration: 3000
      });

      expect(success).toBe(true);
      expect(mockEventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: job.id,
          updates: expect.objectContaining({
            status: JobStatus.COMPLETED,
            duration: 3000
          }),
          timestamp: expect.any(Number)
        })
      );
    });

    it('should return false for non-existent job', () => {
      const success = manager.updateJob('non-existent-id', { status: JobStatus.COMPLETED });
      expect(success).toBe(false);
    });
  });

  describe('removeJob', () => {
    it('should remove existing job and emit event', () => {
      const job = manager.addJob({ name: 'test', type: ConversionType.IMAGE });
      manager.on(RecentJobsEvents.JOB_REMOVED, mockEventListener);

      const success = manager.removeJob(job.id);

      expect(success).toBe(true);
      expect(manager.getJobs()).toHaveLength(0);
      expect(mockEventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: job.id,
          timestamp: expect.any(Number)
        })
      );
    });

    it('should return false for non-existent job', () => {
      const success = manager.removeJob('non-existent-id');
      expect(success).toBe(false);
    });
  });

  describe('getJobs', () => {
    beforeEach(() => {
      // Add test jobs
      manager.addJob({
        name: 'image-job',
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        createdAt: Date.now() - 1000
      });
      manager.addJob({
        name: 'video-job',
        type: ConversionType.VIDEO,
        status: JobStatus.FAILED,
        createdAt: Date.now() - 2000
      });
      manager.addJob({
        name: 'audio-job',
        type: ConversionType.AUDIO,
        status: JobStatus.COMPLETED,
        createdAt: Date.now() - 3000
      });
    });

    it('should return all jobs by default', () => {
      const jobs = manager.getJobs();
      expect(jobs).toHaveLength(3);
    });

    it('should filter jobs by type', () => {
      const imageJobs = manager.getJobs({ type: ConversionType.IMAGE });
      expect(imageJobs).toHaveLength(1);
      expect(imageJobs[0].name).toBe('image-job');
    });

    it('should filter jobs by status', () => {
      const completedJobs = manager.getJobs({ status: JobStatus.COMPLETED });
      expect(completedJobs).toHaveLength(2);
    });

    it('should sort jobs by creation date (newest first)', () => {
      const jobs = manager.getJobs({ sortBy: 'createdAt', sortOrder: 'desc' });
      expect(jobs[0].name).toBe('image-job');
      expect(jobs[2].name).toBe('audio-job');
    });

    it('should limit number of results', () => {
      const jobs = manager.getJobs({ limit: 2 });
      expect(jobs).toHaveLength(2);
    });

    it('should support pagination', () => {
      const firstPage = manager.getJobs({ limit: 2, offset: 0 });
      const secondPage = manager.getJobs({ limit: 2, offset: 2 });
      
      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(1);
      expect(firstPage[0].id).not.toBe(secondPage[0].id);
    });
  });

  describe('clearAllJobs', () => {
    it('should clear all jobs and emit event', () => {
      manager.addJob({ name: 'job1', type: ConversionType.IMAGE });
      manager.addJob({ name: 'job2', type: ConversionType.VIDEO });
      manager.on(RecentJobsEvents.JOBS_CLEARED, mockEventListener);

      const success = manager.clearAllJobs();

      expect(success).toBe(true);
      expect(manager.getJobs()).toHaveLength(0);
      expect(mockEventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          clearedCount: 2,
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('cleanup', () => {
    it('should remove old jobs based on maxAge', () => {
      const oldTime = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      const recentTime = Date.now() - (1 * 24 * 60 * 60 * 1000); // 1 day ago

      manager.addJob({ name: 'old-job', type: ConversionType.IMAGE, createdAt: oldTime });
      manager.addJob({ name: 'recent-job', type: ConversionType.VIDEO, createdAt: recentTime });
      manager.on(RecentJobsEvents.CLEANUP_PERFORMED, mockEventListener);

      const removedCount = manager.cleanup();

      expect(removedCount).toBe(1);
      expect(manager.getJobs()).toHaveLength(1);
      expect(manager.getJobs()[0].name).toBe('recent-job');
      expect(mockEventListener).toHaveBeenCalled();
    });

    it('should limit jobs to maxCount', () => {
      // Add more jobs than maxCount
      for (let i = 0; i < 105; i++) {
        manager.addJob({
          name: `job-${i}`,
          type: ConversionType.IMAGE,
          createdAt: Date.now() - i * 1000
        });
      }

      const removedCount = manager.cleanup({ maxCount: 50 });

      expect(removedCount).toBe(55);
      expect(manager.getJobs()).toHaveLength(50);
    });
  });

  describe('getStatistics', () => {
    beforeEach(() => {
      manager.addJob({
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        duration: 1000
      });
      manager.addJob({
        type: ConversionType.VIDEO,
        status: JobStatus.COMPLETED,
        duration: 2000
      });
      manager.addJob({
        type: ConversionType.AUDIO,
        status: JobStatus.FAILED,
        duration: 500
      });
    });

    it('should return correct statistics', () => {
      const stats = manager.getStatistics();

      expect(stats.totalJobs).toBe(3);
      expect(stats.successfulJobs).toBe(2);
      expect(stats.failedJobs).toBe(1);
      expect(stats.averageDuration).toBe(1500); // (1000 + 2000) / 2 completed jobs
      expect(stats.totalProcessingTime).toBe(3000); // 1000 + 2000 from completed jobs only
    });
  });

  describe('exportData and importData', () => {
    it('should export and import job data', () => {
      manager.addJob({ name: 'job1', type: ConversionType.IMAGE });
      manager.addJob({ name: 'job2', type: ConversionType.VIDEO });

      const exportedData = manager.exportData();
      expect(exportedData.jobs).toHaveLength(2);
      expect(exportedData.statistics).toBeDefined();
      expect(exportedData.settings).toBeDefined();

      // Clear jobs and import
      manager.clearAllJobs();
      expect(manager.getJobs()).toHaveLength(0);

      const importedCount = manager.importData(exportedData);
        expect(importedCount).toBe(2);
        expect(manager.getJobs()).toHaveLength(2);
    });

    it('should handle import conflicts', () => {
      const job = manager.addJob({ name: 'existing-job', type: ConversionType.IMAGE });
      
      const exportData = {
        jobs: [
          {
            id: job.id,
            name: 'conflicting-job',
            type: ConversionType.VIDEO,
            createdAt: Date.now()
          },
          {
            id: 'new-job-id',
            name: 'new-job',
            type: ConversionType.AUDIO,
            createdAt: Date.now()
          }
        ],
        metadata: { version: '1.0.0' }
      };

      const initialCount = manager.getJobs().length;
      const importedCount = manager.importData(exportData, { skipDuplicates: true });
      expect(importedCount).toBe(1); // Only new-job should be imported
      expect(manager.getJobs()).toHaveLength(initialCount + 1);
    });
  });
});