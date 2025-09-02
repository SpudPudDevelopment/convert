const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event');
const { act } = require('react-dom/test-utils');
const RecentJobsManager = require('../../shared/services/RecentJobsManager.js');
const { ConversionType, JobStatus } = require('../../shared/types/jobEnums.js');

// Mock electron APIs
const mockElectronAPI = {
  store: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn()
  },
  path: {
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn(path => path.split('/').slice(0, -1).join('/')),
    basename: jest.fn(path => path.split('/').pop())
  },
  fs: {
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => '{}'),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn()
  }
};

global.electronAPI = mockElectronAPI;

// Mock React components for integration testing
const MockFileConverter = ({ onJobComplete }) => {
  const handleConvert = () => {
    const job = {
      id: 'test-job-1',
      name: 'integration-test',
      type: ConversionType.IMAGE,
      status: JobStatus.PENDING,
      sourceFiles: [{ name: 'test.jpg', size: 1024 }],
      outputFormat: 'png',
      settings: { quality: 90 },
      presetUsed: 'high-quality',
      createdAt: Date.now()
    };
    
    onJobComplete(job);
  };

  return (
    <div>
      <button onClick={handleConvert}>Start Conversion</button>
    </div>
  );
};

const MockRecentJobsDisplay = ({ jobs, onReuseSettings, onRemoveJob }) => {
  return (
    <div>
      <div data-testid="jobs-count">{jobs.length} jobs</div>
      {jobs.map(job => (
        <div key={job.id} data-testid={`job-${job.id}`}>
          <span>{job.name}</span>
          <span>{job.status}</span>
          <button onClick={() => onReuseSettings(job.settings, job.presetUsed)}>
            Reuse Settings
          </button>
          <button onClick={() => onRemoveJob(job.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
};

describe('Recent Jobs Integration Tests', () => {
  let recentJobsManager;
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock store data
    mockElectronAPI.store.get.mockImplementation((key) => {
      if (key === 'recentJobs') {
        return [];
      }
      if (key === 'userPreferences.recentJobs') {
        return {
          maxCount: 50,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          autoCleanup: true
        };
      }
      return null;
    });
    
    recentJobsManager = new RecentJobsManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Job Lifecycle', () => {
    it('should handle complete job lifecycle from creation to removal', async () => {
      let jobs = [];
      let currentSettings = null;
      let currentPreset = null;

      const handleJobComplete = (job) => {
        recentJobsManager.addJob(job);
        jobs = recentJobsManager.getJobs();
      };

      const handleReuseSettings = (settings, preset) => {
        currentSettings = settings;
        currentPreset = preset;
      };

      const handleRemoveJob = (jobId) => {
        recentJobsManager.removeJob(jobId);
        jobs = recentJobsManager.getJobs();
      };

      const TestApp = () => {
        const [jobsList, setJobsList] = React.useState(jobs);
        
        React.useEffect(() => {
          setJobsList([...jobs]);
        }, [jobs]);

        return (
          <div>
            <MockFileConverter onJobComplete={handleJobComplete} />
            <MockRecentJobsDisplay 
              jobs={jobsList}
              onReuseSettings={handleReuseSettings}
              onRemoveJob={handleRemoveJob}
            />
          </div>
        );
      };

      render(<TestApp />);

      // Step 1: Start a conversion
      const convertButton = screen.getByText('Start Conversion');
      await user.click(convertButton);

      // Verify job was added
      await waitFor(() => {
        expect(screen.getByText('1 jobs')).toBeInTheDocument();
        expect(screen.getByTestId('job-test-job-1')).toBeInTheDocument();
        expect(screen.getByText('integration-test')).toBeInTheDocument();
      });

      // Step 2: Reuse settings from the job
      const reuseButton = screen.getByText('Reuse Settings');
      await user.click(reuseButton);

      expect(currentSettings).toEqual({ quality: 90 });
      expect(currentPreset).toBe('high-quality');

      // Step 3: Remove the job
      const removeButton = screen.getByText('Remove');
      await user.click(removeButton);

      await waitFor(() => {
        expect(screen.getByText('0 jobs')).toBeInTheDocument();
        expect(screen.queryByTestId('job-test-job-1')).not.toBeInTheDocument();
      });

      // Verify store was updated
      expect(mockElectronAPI.store.set).toHaveBeenCalledWith('recentJobs', []);
    });

    it('should handle job updates and status changes', async () => {
      const job = {
        id: 'update-test-job',
        name: 'update-test',
        type: ConversionType.VIDEO,
        status: JobStatus.PENDING,
        sourceFiles: [{ name: 'test.mp4', size: 2048 }],
        outputFormat: 'avi',
        settings: { bitrate: 1000 },
        createdAt: Date.now()
      };

      // Add initial job
      recentJobsManager.addJob(job);
      expect(recentJobsManager.getJobs()).toHaveLength(1);
      expect(recentJobsManager.getJobs()[0].status).toBe(JobStatus.PENDING);

      // Update job to in-progress
      recentJobsManager.updateJob(job.id, {
        status: JobStatus.IN_PROGRESS,
        startedAt: Date.now()
      });

      let updatedJob = recentJobsManager.getJobs()[0];
      expect(updatedJob.status).toBe(JobStatus.IN_PROGRESS);
      expect(updatedJob.startedAt).toBeDefined();

      // Update job to completed
      recentJobsManager.updateJob(job.id, {
        status: JobStatus.COMPLETED,
        completedAt: Date.now(),
        duration: 5000,
        fileSize: 1800
      });

      updatedJob = recentJobsManager.getJobs()[0];
      expect(updatedJob.status).toBe(JobStatus.COMPLETED);
      expect(updatedJob.completedAt).toBeDefined();
      expect(updatedJob.duration).toBe(5000);
      expect(updatedJob.fileSize).toBe(1800);

      // Verify store was updated each time
      expect(mockElectronAPI.store.set).toHaveBeenCalledTimes(3);
    });

    it('should handle job failure with error information', async () => {
      const job = {
        id: 'failed-job',
        name: 'failed-conversion',
        type: ConversionType.AUDIO,
        status: JobStatus.PENDING,
        sourceFiles: [{ name: 'test.mp3', size: 512 }],
        outputFormat: 'wav',
        settings: { sampleRate: 44100 },
        createdAt: Date.now()
      };

      recentJobsManager.addJob(job);

      // Update job to failed with error
      recentJobsManager.updateJob(job.id, {
        status: JobStatus.FAILED,
        error: 'Codec not supported',
        failedAt: Date.now()
      });

      const failedJob = recentJobsManager.getJobs()[0];
      expect(failedJob.status).toBe(JobStatus.FAILED);
      expect(failedJob.error).toBe('Codec not supported');
      expect(failedJob.failedAt).toBeDefined();
    });
  });

  describe('Data Persistence and Recovery', () => {
    it('should persist jobs across application restarts', () => {
      const jobs = [
        {
          id: 'persist-1',
          name: 'persistent-job-1',
          type: ConversionType.IMAGE,
          status: JobStatus.COMPLETED,
          createdAt: Date.now() - 1000
        },
        {
          id: 'persist-2',
          name: 'persistent-job-2',
          type: ConversionType.VIDEO,
          status: JobStatus.FAILED,
          createdAt: Date.now() - 2000
        }
      ];

      // Simulate existing data in store
      mockElectronAPI.store.get.mockImplementation((key) => {
        if (key === 'recentJobs') {
          return jobs;
        }
        return null;
      });

      // Create new manager instance (simulating app restart)
      const newManager = new RecentJobsManager();
      const loadedJobs = newManager.getJobs();

      expect(loadedJobs).toHaveLength(2);
      expect(loadedJobs[0].id).toBe('persist-1');
      expect(loadedJobs[1].id).toBe('persist-2');
    });

    it('should handle corrupted data gracefully', () => {
      // Simulate corrupted data in store
      mockElectronAPI.store.get.mockImplementation((key) => {
        if (key === 'recentJobs') {
          return 'corrupted-data';
        }
        return null;
      });

      // Should not throw and should start with empty array
      const manager = new RecentJobsManager();
      expect(manager.getJobs()).toEqual([]);
    });

    it('should export and import data correctly', () => {
      const jobs = [
        {
          id: 'export-1',
          name: 'export-job-1',
          type: ConversionType.IMAGE,
          status: JobStatus.COMPLETED,
          createdAt: Date.now()
        }
      ];

      recentJobsManager.addJob(jobs[0]);

      // Export data
      const exportedData = recentJobsManager.exportData();
      expect(exportedData).toHaveProperty('jobs');
      expect(exportedData).toHaveProperty('exportedAt');
      expect(exportedData.jobs).toHaveLength(1);

      // Clear and import
      recentJobsManager.clearAllJobs();
      expect(recentJobsManager.getJobs()).toHaveLength(0);

      recentJobsManager.importData(exportedData);
      expect(recentJobsManager.getJobs()).toHaveLength(1);
      expect(recentJobsManager.getJobs()[0].id).toBe('export-1');
    });
  });

  describe('Performance and Cleanup', () => {
    it('should handle large numbers of jobs efficiently', () => {
      const startTime = performance.now();
      
      // Add 1000 jobs
      for (let i = 0; i < 1000; i++) {
        recentJobsManager.addJob({
          id: `perf-job-${i}`,
          name: `performance-test-${i}`,
          type: ConversionType.IMAGE,
          status: JobStatus.COMPLETED,
          createdAt: Date.now() - i * 1000
        });
      }

      const addTime = performance.now() - startTime;
      expect(addTime).toBeLessThan(1000); // Should complete in under 1 second

      // Test retrieval performance
      const retrievalStart = performance.now();
      const jobs = recentJobsManager.getJobs();
      const retrievalTime = performance.now() - retrievalStart;
      
      expect(retrievalTime).toBeLessThan(100); // Should retrieve in under 100ms
      expect(jobs).toHaveLength(50); // Should be limited by maxCount
    });

    it('should automatically cleanup old jobs', () => {
      const oldDate = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      const recentDate = Date.now() - (1 * 24 * 60 * 60 * 1000); // 1 day ago

      // Add old and recent jobs
      recentJobsManager.addJob({
        id: 'old-job',
        name: 'old-job',
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        createdAt: oldDate
      });

      recentJobsManager.addJob({
        id: 'recent-job',
        name: 'recent-job',
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        createdAt: recentDate
      });

      expect(recentJobsManager.getJobs()).toHaveLength(2);

      // Run cleanup
      const cleanedCount = recentJobsManager.cleanup();
      expect(cleanedCount).toBe(1);
      expect(recentJobsManager.getJobs()).toHaveLength(1);
      expect(recentJobsManager.getJobs()[0].id).toBe('recent-job');
    });
  });

  describe('Filtering and Sorting Integration', () => {
    beforeEach(() => {
      // Add test jobs with different properties
      const testJobs = [
        {
          id: 'filter-1',
          name: 'image-conversion-1',
          type: ConversionType.IMAGE,
          status: JobStatus.COMPLETED,
          createdAt: Date.now() - 1000,
          duration: 5000
        },
        {
          id: 'filter-2',
          name: 'video-conversion-1',
          type: ConversionType.VIDEO,
          status: JobStatus.FAILED,
          createdAt: Date.now() - 2000,
          duration: 0
        },
        {
          id: 'filter-3',
          name: 'image-conversion-2',
          type: ConversionType.IMAGE,
          status: JobStatus.COMPLETED,
          createdAt: Date.now() - 3000,
          duration: 3000
        }
      ];

      testJobs.forEach(job => recentJobsManager.addJob(job));
    });

    it('should filter jobs by type correctly', () => {
      const imageJobs = recentJobsManager.getJobs({ type: ConversionType.IMAGE });
      expect(imageJobs).toHaveLength(2);
      expect(imageJobs.every(job => job.type === ConversionType.IMAGE)).toBe(true);

      const videoJobs = recentJobsManager.getJobs({ type: ConversionType.VIDEO });
      expect(videoJobs).toHaveLength(1);
      expect(videoJobs[0].type).toBe(ConversionType.VIDEO);
    });

    it('should filter jobs by status correctly', () => {
      const completedJobs = recentJobsManager.getJobs({ status: JobStatus.COMPLETED });
      expect(completedJobs).toHaveLength(2);
      expect(completedJobs.every(job => job.status === JobStatus.COMPLETED)).toBe(true);

      const failedJobs = recentJobsManager.getJobs({ status: JobStatus.FAILED });
      expect(failedJobs).toHaveLength(1);
      expect(failedJobs[0].status).toBe(JobStatus.FAILED);
    });

    it('should search jobs by name correctly', () => {
      const searchResults = recentJobsManager.getJobs({ search: 'image' });
      expect(searchResults).toHaveLength(2);
      expect(searchResults.every(job => job.name.includes('image'))).toBe(true);
    });

    it('should sort jobs correctly', () => {
      // Sort by duration ascending
      const sortedByDuration = recentJobsManager.getJobs({ 
        sortBy: 'duration', 
        sortOrder: 'asc' 
      });
      expect(sortedByDuration[0].duration).toBe(0);
      expect(sortedByDuration[1].duration).toBe(3000);
      expect(sortedByDuration[2].duration).toBe(5000);

      // Sort by name descending
      const sortedByName = recentJobsManager.getJobs({ 
        sortBy: 'name', 
        sortOrder: 'desc' 
      });
      expect(sortedByName[0].name).toBe('video-conversion-1');
      expect(sortedByName[2].name).toBe('image-conversion-1');
    });

    it('should combine filters and sorting', () => {
      const results = recentJobsManager.getJobs({
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        sortBy: 'duration',
        sortOrder: 'desc'
      });

      expect(results).toHaveLength(2);
      expect(results[0].duration).toBe(5000);
      expect(results[1].duration).toBe(3000);
      expect(results.every(job => 
        job.type === ConversionType.IMAGE && 
        job.status === JobStatus.COMPLETED
      )).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid job data gracefully', () => {
      expect(() => {
        recentJobsManager.addJob(null);
      }).not.toThrow();

      expect(() => {
        recentJobsManager.addJob({});
      }).not.toThrow();

      expect(() => {
        recentJobsManager.updateJob('non-existent-id', { status: JobStatus.COMPLETED });
      }).not.toThrow();
    });

    it('should handle storage errors gracefully', () => {
      mockElectronAPI.store.set.mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => {
        recentJobsManager.addJob({
          id: 'error-test',
          name: 'error-test',
          type: ConversionType.IMAGE,
          status: JobStatus.COMPLETED
        });
      }).not.toThrow();
    });

    it('should handle concurrent operations safely', async () => {
      const promises = [];
      
      // Simulate concurrent job additions
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              recentJobsManager.addJob({
                id: `concurrent-${i}`,
                name: `concurrent-job-${i}`,
                type: ConversionType.IMAGE,
                status: JobStatus.COMPLETED,
                createdAt: Date.now()
              });
              resolve();
            }, Math.random() * 10);
          })
        );
      }

      await Promise.all(promises);
      
      const jobs = recentJobsManager.getJobs();
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.length).toBeLessThanOrEqual(10);
    });
  });
});