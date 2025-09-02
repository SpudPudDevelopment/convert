const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { renderHook, act } = require('@testing-library/react');
const { useRecentJobs, useRecentJobsFilter } = require('../../renderer/hooks/useRecentJobs.js');
const { RecentJobsManager } = require('../../shared/services/RecentJobsManager.js');
const { ConversionType, JobStatus } = require('../../shared/types/jobEnums.js');

// Mock UserPreferences
jest.mock('../../shared/models/UserPreferences.js', () => ({
  UserPreferences: jest.fn(() => ({
    recentJobs: [],
    recentJobsSettings: {
      maxCount: 100,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      autoCleanup: true
    },
    addRecentJob: jest.fn(),
    clearRecentJobs: jest.fn(),
    cleanupRecentJobs: jest.fn()
  }))
}));

describe('useRecentJobs', () => {
  let mockUserPreferences;

  beforeEach(() => {
    mockUserPreferences = new UserPreferences();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hook initialization', () => {
    it('should initialize with empty state when no userPreferences', () => {
      const { result } = renderHook(() => useRecentJobs());

      expect(result.current.jobs).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.recentJobsManager).toBeNull();
    });

    it('should initialize with userPreferences', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      expect(result.current.recentJobsManager).toBeDefined();
      expect(result.current.jobs).toEqual([]);
      expect(result.current.statistics).toBeDefined();
    });
  });

  describe('job management', () => {
    it('should add a new job', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      const jobData = {
        name: 'test-job',
        type: ConversionType.IMAGE,
        status: JobStatus.PENDING,
        sourceFiles: [{ name: 'test.jpg', size: 1024 }]
      };

      act(() => {
        const job = result.current.addJob(jobData);
        expect(job).toBeDefined();
      });
    });

    it('should update an existing job', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      let jobId;
      act(() => {
        const job = result.current.addJob({
          name: 'test-job',
          type: ConversionType.IMAGE,
          status: JobStatus.PENDING
        });
        jobId = job.id;
      });

      act(() => {
        const success = result.current.updateJob(jobId, {
          status: JobStatus.COMPLETED,
          duration: 5000
        });
        expect(success).toBe(true);
      });
    });

    it('should remove a job', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      let jobId;
      act(() => {
        const job = result.current.addJob({
          name: 'test-job',
          type: ConversionType.IMAGE
        });
        jobId = job.id;
      });

      act(() => {
        const success = result.current.removeJob(jobId);
        expect(success).toBe(true);
      });
    });

    it('should clear all jobs', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      act(() => {
        result.current.addJob({ name: 'job1', type: ConversionType.IMAGE });
        result.current.addJob({ name: 'job2', type: ConversionType.VIDEO });
      });

      act(() => {
        const success = result.current.clearAllJobs();
        expect(success).toBe(true);
      });
    });
  });

  describe('derived data', () => {
    it('should provide correct derived data', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      const today = Date.now();
      const yesterday = today - (24 * 60 * 60 * 1000);
      const lastWeek = today - (7 * 24 * 60 * 60 * 1000);

      act(() => {
        result.current.addJob({
          name: 'today-job',
          type: ConversionType.IMAGE,
          status: JobStatus.COMPLETED,
          createdAt: today
        });
        result.current.addJob({
          name: 'yesterday-job',
          type: ConversionType.VIDEO,
          status: JobStatus.FAILED,
          createdAt: yesterday
        });
        result.current.addJob({
          name: 'old-job',
          type: ConversionType.AUDIO,
          status: JobStatus.COMPLETED,
          createdAt: lastWeek
        });
      });

      expect(result.current.totalJobs).toBe(3);
      expect(result.current.completedJobs).toHaveLength(2);
      expect(result.current.failedJobs).toHaveLength(1);
      expect(result.current.todaysJobs).toHaveLength(1);
      expect(result.current.thisWeeksJobs).toHaveLength(2);
    });

    it('should group jobs by type', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      act(() => {
        result.current.addJob({ name: 'img1', type: ConversionType.IMAGE });
        result.current.addJob({ name: 'img2', type: ConversionType.IMAGE });
        result.current.addJob({ name: 'vid1', type: ConversionType.VIDEO });
      });

      expect(result.current.jobsByType[ConversionType.IMAGE]).toHaveLength(2);
      expect(result.current.jobsByType[ConversionType.VIDEO]).toHaveLength(1);
      expect(result.current.jobsByType[ConversionType.AUDIO]).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle errors when manager is not initialized', () => {
      const { result } = renderHook(() => useRecentJobs());

      act(() => {
        const job = result.current.addJob({ name: 'test' });
        expect(job).toBeNull();
        expect(result.current.error).toBe('RecentJobsManager not initialized');
      });
    });

    it('should handle manager errors', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      // Mock manager to throw error
      const originalAddJob = result.current.recentJobsManager.addJob;
      result.current.recentJobsManager.addJob = jest.fn(() => {
        throw new Error('Test error');
      });

      act(() => {
        const job = result.current.addJob({ name: 'test' });
        expect(job).toBeNull();
        expect(result.current.error).toBe('Test error');
      });

      // Restore original method
      result.current.recentJobsManager.addJob = originalAddJob;
    });
  });

  describe('data export/import', () => {
    it('should export job data', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      act(() => {
        result.current.addJob({ name: 'job1', type: ConversionType.IMAGE });
        result.current.addJob({ name: 'job2', type: ConversionType.VIDEO });
      });

      act(() => {
        const exportedData = result.current.exportData();
        expect(exportedData.jobs).toHaveLength(2);
        expect(exportedData.metadata).toBeDefined();
      });
    });

    it('should import job data', () => {
      const { result } = renderHook(() => useRecentJobs(mockUserPreferences));

      const importData = {
        jobs: [
          { name: 'imported-job1', type: ConversionType.IMAGE, createdAt: Date.now() },
          { name: 'imported-job2', type: ConversionType.VIDEO, createdAt: Date.now() }
        ],
        metadata: { version: '1.0.0' }
      };

      act(() => {
        const result_import = result.current.importData(importData);
        expect(result_import.imported).toBe(2);
      });
    });
  });
});

describe('useRecentJobsFilter', () => {
  let mockJobs;

  beforeEach(() => {
    mockJobs = [
      {
        id: '1',
        name: 'image-job',
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        createdAt: Date.now() - 1000,
        fileSize: 1024
      },
      {
        id: '2',
        name: 'video-job',
        type: ConversionType.VIDEO,
        status: JobStatus.FAILED,
        createdAt: Date.now() - 2000,
        fileSize: 2048
      },
      {
        id: '3',
        name: 'audio-job',
        type: ConversionType.AUDIO,
        status: JobStatus.COMPLETED,
        createdAt: Date.now() - 3000,
        fileSize: 512
      }
    ];
  });

  it('should initialize with default filters', () => {
    const mockGetJobs = jest.fn(() => mockJobs);
    const { result } = renderHook(() => useRecentJobsFilter(mockGetJobs));

    expect(result.current.filters.type).toBe('');
    expect(result.current.filters.status).toBe('');
    expect(result.current.filters.search).toBe('');
    expect(result.current.filters.sortBy).toBe('createdAt');
    expect(result.current.filters.sortOrder).toBe('desc');
    expect(result.current.filteredJobs).toEqual(mockJobs);
  });

  it('should filter jobs by type', () => {
    const mockGetJobs = jest.fn(() => mockJobs);
    const { result } = renderHook(() => useRecentJobsFilter(mockGetJobs));

    act(() => {
      result.current.updateFilter('type', ConversionType.IMAGE);
    });

    expect(result.current.filteredJobs).toHaveLength(1);
    expect(result.current.filteredJobs[0].name).toBe('image-job');
  });

  it('should filter jobs by status', () => {
    const mockGetJobs = jest.fn(() => mockJobs);
    const { result } = renderHook(() => useRecentJobsFilter(mockGetJobs));

    act(() => {
      result.current.updateFilter('status', JobStatus.COMPLETED);
    });

    expect(result.current.filteredJobs).toHaveLength(2);
    expect(result.current.filteredJobs.every(job => job.status === JobStatus.COMPLETED)).toBe(true);
  });

  it('should filter jobs by search term', () => {
    const mockGetJobs = jest.fn(() => mockJobs);
    const { result } = renderHook(() => useRecentJobsFilter(mockGetJobs));

    act(() => {
      result.current.updateFilter('search', 'video');
    });

    expect(result.current.filteredJobs).toHaveLength(1);
    expect(result.current.filteredJobs[0].name).toBe('video-job');
  });

  it('should sort jobs by different criteria', () => {
    const mockGetJobs = jest.fn(() => mockJobs);
    const { result } = renderHook(() => useRecentJobsFilter(mockGetJobs));

    // Sort by file size ascending
    act(() => {
      result.current.updateFilter('sortBy', 'fileSize');
      result.current.updateFilter('sortOrder', 'asc');
    });

    expect(result.current.filteredJobs[0].fileSize).toBe(512);
    expect(result.current.filteredJobs[2].fileSize).toBe(2048);
  });

  it('should reset filters', () => {
    const mockGetJobs = jest.fn(() => mockJobs);
    const { result } = renderHook(() => useRecentJobsFilter(mockGetJobs));

    act(() => {
      result.current.updateFilter('type', ConversionType.IMAGE);
      result.current.updateFilter('status', JobStatus.COMPLETED);
      result.current.updateFilter('search', 'test');
    });

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filters.type).toBe('');
    expect(result.current.filters.status).toBe('');
    expect(result.current.filters.search).toBe('');
    expect(result.current.filteredJobs).toEqual(mockJobs);
  });

  it('should combine multiple filters', () => {
    const mockGetJobs = jest.fn(() => mockJobs);
    const { result } = renderHook(() => useRecentJobsFilter(mockGetJobs));

    act(() => {
      result.current.updateFilter('status', JobStatus.COMPLETED);
      result.current.updateFilter('search', 'image');
    });

    expect(result.current.filteredJobs).toHaveLength(1);
    expect(result.current.filteredJobs[0].name).toBe('image-job');
  });

  it('should handle date range filtering', () => {
    const mockGetJobs = vi.fn(() => mockJobs);
    const { result } = renderHook(() => useRecentJobsFilter(mockGetJobs));

    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
    const tomorrow = Date.now() + (24 * 60 * 60 * 1000);

    act(() => {
      result.current.updateFilter('dateRange', {
        start: yesterday,
        end: tomorrow
      });
    });

    // Should include jobs created within the date range
    expect(result.current.filteredJobs.length).toBeGreaterThan(0);
  });
});