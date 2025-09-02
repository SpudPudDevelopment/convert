import { RecentJobsManager } from '../../shared/services/RecentJobsManager.js';
import { UserPreferences } from '../../shared/models/UserPreferences.js';

// Mock UserPreferences
jest.mock('../../shared/models/UserPreferences.js', () => ({
  UserPreferences: jest.fn().mockImplementation(() => ({
    getRecentJobs: jest.fn().mockReturnValue([]),
    addRecentJob: jest.fn(),
    clearRecentJobs: jest.fn(),
    removeRecentJob: jest.fn(),
    updateRecentJob: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn()
  }))
}));

describe('RecentJobsManager', () => {
  let manager;
  let mockUserPreferences;

  beforeEach(() => {
    mockUserPreferences = new UserPreferences();
    manager = new RecentJobsManager(mockUserPreferences);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with UserPreferences instance', () => {
      expect(manager.userPreferences).toBe(mockUserPreferences);
    });

    test('should set up event listeners', () => {
      expect(mockUserPreferences.on).toHaveBeenCalledWith('recentJobAdded', expect.any(Function));
      expect(mockUserPreferences.on).toHaveBeenCalledWith('recentJobsCleared', expect.any(Function));
    });
  });

  describe('Adding Recent Jobs', () => {
    const mockJobData = {
      inputFile: 'test.pdf',
      outputFile: 'test.docx',
      format: 'docx',
      status: 'completed',
      startTime: new Date(),
      endTime: new Date(),
      fileSize: 1024
    };

    test('should add a recent job', () => {
      mockUserPreferences.addRecentJob.mockReturnValue('job-id-1');
      
      const jobId = manager.addRecentJob(mockJobData);
      
      expect(mockUserPreferences.addRecentJob).toHaveBeenCalledWith(mockJobData);
      expect(jobId).toBe('job-id-1');
    });

    test('should validate required fields before adding', () => {
      const invalidJobData = {
        inputFile: 'test.pdf'
        // Missing required fields
      };
      
      expect(() => {
        manager.addRecentJob(invalidJobData);
      }).toThrow('Missing required job data');
    });

    test('should add timestamp if not provided', () => {
      const jobDataWithoutTimestamp = {
        inputFile: 'test.pdf',
        outputFile: 'test.docx',
        format: 'docx',
        status: 'completed'
      };
      
      manager.addRecentJob(jobDataWithoutTimestamp);
      
      expect(mockUserPreferences.addRecentJob).toHaveBeenCalledWith(
        expect.objectContaining({
          ...jobDataWithoutTimestamp,
          timestamp: expect.any(Date)
        })
      );
    });

    test('should generate unique ID if not provided', () => {
      manager.addRecentJob(mockJobData);
      
      expect(mockUserPreferences.addRecentJob).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockJobData,
          id: expect.any(String)
        })
      );
    });
  });

  describe('Retrieving Recent Jobs', () => {
    const mockJobs = [
      {
        id: '1',
        inputFile: 'test1.pdf',
        outputFile: 'test1.docx',
        format: 'docx',
        status: 'completed',
        timestamp: new Date('2024-01-01')
      },
      {
        id: '2',
        inputFile: 'test2.pdf',
        outputFile: 'test2.docx',
        format: 'docx',
        status: 'failed',
        timestamp: new Date('2024-01-02')
      }
    ];

    test('should get all recent jobs', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const jobs = manager.getRecentJobs();
      
      expect(jobs).toEqual(mockJobs);
      expect(mockUserPreferences.getRecentJobs).toHaveBeenCalled();
    });

    test('should filter jobs by status', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const completedJobs = manager.getRecentJobs({ status: 'completed' });
      
      expect(completedJobs).toHaveLength(1);
      expect(completedJobs[0].status).toBe('completed');
    });

    test('should filter jobs by format', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const docxJobs = manager.getRecentJobs({ format: 'docx' });
      
      expect(docxJobs).toHaveLength(2);
      expect(docxJobs.every(job => job.format === 'docx')).toBe(true);
    });

    test('should limit number of jobs returned', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const limitedJobs = manager.getRecentJobs({ limit: 1 });
      
      expect(limitedJobs).toHaveLength(1);
    });

    test('should sort jobs by timestamp (newest first)', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const sortedJobs = manager.getRecentJobs({ sortBy: 'timestamp', sortOrder: 'desc' });
      
      expect(sortedJobs[0].timestamp.getTime()).toBeGreaterThan(sortedJobs[1].timestamp.getTime());
    });
  });

  describe('Updating Recent Jobs', () => {
    test('should update a recent job', () => {
      const updateData = { status: 'completed', endTime: new Date() };
      mockUserPreferences.updateRecentJob.mockReturnValue(true);
      
      const result = manager.updateRecentJob('job-id-1', updateData);
      
      expect(mockUserPreferences.updateRecentJob).toHaveBeenCalledWith('job-id-1', updateData);
      expect(result).toBe(true);
    });

    test('should return false if job not found', () => {
      mockUserPreferences.updateRecentJob.mockReturnValue(false);
      
      const result = manager.updateRecentJob('non-existent-id', { status: 'completed' });
      
      expect(result).toBe(false);
    });
  });

  describe('Removing Recent Jobs', () => {
    test('should remove a specific job', () => {
      mockUserPreferences.removeRecentJob.mockReturnValue(true);
      
      const result = manager.removeRecentJob('job-id-1');
      
      expect(mockUserPreferences.removeRecentJob).toHaveBeenCalledWith('job-id-1');
      expect(result).toBe(true);
    });

    test('should clear all recent jobs', () => {
      manager.clearRecentJobs();
      
      expect(mockUserPreferences.clearRecentJobs).toHaveBeenCalled();
    });

    test('should remove jobs older than specified date', () => {
      const mockJobs = [
        {
          id: '1',
          inputFile: 'old.pdf',
          timestamp: new Date('2023-01-01')
        },
        {
          id: '2',
          inputFile: 'new.pdf',
          timestamp: new Date('2024-01-01')
        }
      ];
      
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      mockUserPreferences.removeRecentJob.mockReturnValue(true);
      
      const cutoffDate = new Date('2023-06-01');
      const removedCount = manager.removeJobsOlderThan(cutoffDate);
      
      expect(mockUserPreferences.removeRecentJob).toHaveBeenCalledWith('1');
      expect(mockUserPreferences.removeRecentJob).not.toHaveBeenCalledWith('2');
      expect(removedCount).toBe(1);
    });
  });

  describe('Job Statistics', () => {
    const mockJobs = [
      {
        id: '1',
        format: 'docx',
        status: 'completed',
        timestamp: new Date('2024-01-01')
      },
      {
        id: '2',
        format: 'pdf',
        status: 'completed',
        timestamp: new Date('2024-01-02')
      },
      {
        id: '3',
        format: 'docx',
        status: 'failed',
        timestamp: new Date('2024-01-03')
      }
    ];

    test('should get job statistics', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const stats = manager.getJobStatistics();
      
      expect(stats).toEqual({
        total: 3,
        completed: 2,
        failed: 1,
        pending: 0,
        byFormat: {
          docx: 2,
          pdf: 1
        }
      });
    });

    test('should get statistics for specific time period', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const startDate = new Date('2024-01-02');
      const endDate = new Date('2024-01-03');
      const stats = manager.getJobStatistics(startDate, endDate);
      
      expect(stats.total).toBe(2);
    });
  });

  describe('Search and Filter', () => {
    const mockJobs = [
      {
        id: '1',
        inputFile: 'document.pdf',
        outputFile: 'document.docx',
        format: 'docx',
        status: 'completed'
      },
      {
        id: '2',
        inputFile: 'image.jpg',
        outputFile: 'image.png',
        format: 'png',
        status: 'completed'
      },
      {
        id: '3',
        inputFile: 'report.pdf',
        outputFile: 'report.docx',
        format: 'docx',
        status: 'failed'
      }
    ];

    test('should search jobs by filename', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const results = manager.searchJobs('document');
      
      expect(results).toHaveLength(1);
      expect(results[0].inputFile).toBe('document.pdf');
    });

    test('should search jobs by multiple criteria', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const results = manager.searchJobs('pdf', {
        format: 'docx',
        status: 'completed'
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].inputFile).toBe('document.pdf');
    });

    test('should return empty array if no matches found', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const results = manager.searchJobs('nonexistent');
      
      expect(results).toHaveLength(0);
    });
  });

  describe('Export/Import', () => {
    const mockJobs = [
      {
        id: '1',
        inputFile: 'test.pdf',
        outputFile: 'test.docx',
        format: 'docx',
        status: 'completed',
        timestamp: new Date('2024-01-01')
      }
    ];

    test('should export recent jobs data', () => {
      mockUserPreferences.getRecentJobs.mockReturnValue(mockJobs);
      
      const exportedData = manager.exportRecentJobs();
      
      expect(exportedData).toEqual({
        version: '1.0',
        exportDate: expect.any(String),
        jobs: mockJobs
      });
    });

    test('should import recent jobs data', () => {
      const importData = {
        version: '1.0',
        exportDate: '2024-01-01T00:00:00.000Z',
        jobs: mockJobs
      };
      
      mockUserPreferences.addRecentJob.mockReturnValue('imported-job-1');
      
      const result = manager.importRecentJobs(importData);
      
      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(mockUserPreferences.addRecentJob).toHaveBeenCalledWith(mockJobs[0]);
    });

    test('should validate import data format', () => {
      const invalidData = {
        invalidFormat: true
      };
      
      const result = manager.importRecentJobs(invalidData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid import data format');
    });

    test('should handle import with merge strategy', () => {
      const importData = {
        version: '1.0',
        exportDate: '2024-01-01T00:00:00.000Z',
        jobs: mockJobs
      };
      
      mockUserPreferences.getRecentJobs.mockReturnValue([mockJobs[0]]); // Existing job
      
      const result = manager.importRecentJobs(importData, { mergeStrategy: 'skip' });
      
      expect(result.success).toBe(true);
      expect(result.skippedCount).toBe(1);
      expect(mockUserPreferences.addRecentJob).not.toHaveBeenCalled();
    });
  });

  describe('Event Handling', () => {
    test('should emit events when jobs are added', () => {
      const mockCallback = jest.fn();
      manager.on('jobAdded', mockCallback);
      
      const jobData = {
        inputFile: 'test.pdf',
        outputFile: 'test.docx',
        format: 'docx',
        status: 'completed'
      };
      
      manager.addRecentJob(jobData);
      
      expect(mockCallback).toHaveBeenCalled();
    });

    test('should emit events when jobs are cleared', () => {
      const mockCallback = jest.fn();
      manager.on('jobsCleared', mockCallback);
      
      manager.clearRecentJobs();
      
      expect(mockCallback).toHaveBeenCalled();
    });

    test('should remove event listeners', () => {
      const mockCallback = jest.fn();
      manager.on('jobAdded', mockCallback);
      manager.off('jobAdded', mockCallback);
      
      const jobData = {
        inputFile: 'test.pdf',
        outputFile: 'test.docx',
        format: 'docx',
        status: 'completed'
      };
      
      manager.addRecentJob(jobData);
      
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    test('should cleanup event listeners on destroy', () => {
      manager.destroy();
      
      expect(mockUserPreferences.off).toHaveBeenCalledWith('recentJobAdded', expect.any(Function));
      expect(mockUserPreferences.off).toHaveBeenCalledWith('recentJobsCleared', expect.any(Function));
    });
  });
});