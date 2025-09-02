import { useState, useEffect, useCallback, useMemo } from 'react';
import { RecentJobsManager, RecentJobsEvents } from '../../shared/services/RecentJobsManager.js';
import { useUserPreferencesContext } from '../contexts/UserPreferencesContext.js';

/**
 * Custom hook for managing recent jobs
 * Provides comprehensive functionality for tracking and managing recent conversion jobs
 */
export const useRecentJobs = () => {
  const { userPreferences } = useUserPreferencesContext();
  const [recentJobsManager, setRecentJobsManager] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize RecentJobsManager when userPreferences is available
  useEffect(() => {
    if (userPreferences) {
      const manager = new RecentJobsManager(userPreferences);
      setRecentJobsManager(manager);
      setIsLoading(false);

      // Set up event listeners
      const handleJobAdded = (event) => {
        setJobs(prev => [event.job, ...prev.filter(j => j.id !== event.job.id)]);
        setStatistics(manager.getStatistics());
      };

      const handleJobUpdated = (event) => {
        setJobs(prev => prev.map(job => 
          job.id === event.jobId ? { ...job, ...event.updates } : job
        ));
        setStatistics(manager.getStatistics());
      };

      const handleJobRemoved = (event) => {
        setJobs(prev => prev.filter(job => job.id !== event.jobId));
        setStatistics(manager.getStatistics());
      };

      const handleJobsCleared = () => {
        setJobs([]);
        setStatistics(manager.getStatistics());
      };

      const handleCleanupPerformed = (event) => {
        // Refresh jobs list after cleanup
        setJobs(manager.getJobs());
        setStatistics(manager.getStatistics());
      };

      manager.on(RecentJobsEvents.JOB_ADDED, handleJobAdded);
      manager.on(RecentJobsEvents.JOB_UPDATED, handleJobUpdated);
      manager.on(RecentJobsEvents.JOB_REMOVED, handleJobRemoved);
      manager.on(RecentJobsEvents.JOBS_CLEARED, handleJobsCleared);
      manager.on(RecentJobsEvents.CLEANUP_PERFORMED, handleCleanupPerformed);

      // Initial data load
      setJobs(manager.getJobs());
      setStatistics(manager.getStatistics());

      // Cleanup function
      return () => {
        manager.removeAllListeners();
      };
    }
  }, [userPreferences]);

  // Add a new job to recent history
  const addJob = useCallback((jobData) => {
    if (!recentJobsManager) {
      setError('RecentJobsManager not initialized');
      return null;
    }

    try {
      const job = recentJobsManager.addJob(jobData);
      setError(null);
      return job;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [recentJobsManager]);

  // Update an existing job
  const updateJob = useCallback((jobId, updates) => {
    if (!recentJobsManager) {
      setError('RecentJobsManager not initialized');
      return false;
    }

    try {
      const success = recentJobsManager.updateJob(jobId, updates);
      setError(null);
      return success;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [recentJobsManager]);

  // Remove a job from history
  const removeJob = useCallback((jobId) => {
    if (!recentJobsManager) {
      setError('RecentJobsManager not initialized');
      return false;
    }

    try {
      const success = recentJobsManager.removeJob(jobId);
      setError(null);
      return success;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [recentJobsManager]);

  // Get jobs with filtering and sorting
  const getJobs = useCallback((options = {}) => {
    if (!recentJobsManager) {
      return [];
    }

    try {
      const filteredJobs = recentJobsManager.getJobs(options);
      setError(null);
      return filteredJobs;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [recentJobsManager]);

  // Get jobs by conversion type
  const getJobsByType = useCallback((conversionType, options = {}) => {
    if (!recentJobsManager) {
      return [];
    }

    try {
      const typeJobs = recentJobsManager.getJobsByType(conversionType, options);
      setError(null);
      return typeJobs;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [recentJobsManager]);

  // Get today's jobs
  const getTodaysJobs = useCallback((options = {}) => {
    if (!recentJobsManager) {
      return [];
    }

    try {
      const todaysJobs = recentJobsManager.getTodaysJobs(options);
      setError(null);
      return todaysJobs;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [recentJobsManager]);

  // Get jobs from last N days
  const getJobsFromLastDays = useCallback((days, options = {}) => {
    if (!recentJobsManager) {
      return [];
    }

    try {
      const recentJobs = recentJobsManager.getJobsFromLastDays(days, options);
      setError(null);
      return recentJobs;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [recentJobsManager]);

  // Get frequently used settings
  const getFrequentSettings = useCallback((options = {}) => {
    if (!recentJobsManager) {
      return [];
    }

    try {
      const frequentSettings = recentJobsManager.getFrequentSettings(options);
      setError(null);
      return frequentSettings;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [recentJobsManager]);

  // Clear all jobs
  const clearAllJobs = useCallback(() => {
    if (!recentJobsManager) {
      setError('RecentJobsManager not initialized');
      return false;
    }

    try {
      const success = recentJobsManager.clearAllJobs();
      setError(null);
      return success;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [recentJobsManager]);

  // Perform cleanup
  const cleanup = useCallback((options = {}) => {
    if (!recentJobsManager) {
      setError('RecentJobsManager not initialized');
      return 0;
    }

    try {
      const removedCount = recentJobsManager.cleanup(options);
      setError(null);
      return removedCount;
    } catch (err) {
      setError(err.message);
      return 0;
    }
  }, [recentJobsManager]);

  // Export data
  const exportData = useCallback((options = {}) => {
    if (!recentJobsManager) {
      setError('RecentJobsManager not initialized');
      return null;
    }

    try {
      const exportedData = recentJobsManager.exportData(options);
      setError(null);
      return exportedData;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [recentJobsManager]);

  // Import data
  const importData = useCallback((data, options = {}) => {
    if (!recentJobsManager) {
      setError('RecentJobsManager not initialized');
      return 0;
    }

    try {
      const importedCount = recentJobsManager.importData(data, options);
      setError(null);
      return importedCount;
    } catch (err) {
      setError(err.message);
      return 0;
    }
  }, [recentJobsManager]);

  // Memoized derived data
  const derivedData = useMemo(() => {
    if (!jobs.length) {
      return {
        recentJobs: [],
        jobsByType: {},
        todaysJobs: [],
        thisWeeksJobs: [],
        completedJobs: [],
        failedJobs: [],
        totalJobs: 0
      };
    }

    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

    const jobsByType = jobs.reduce((acc, job) => {
      const type = job.type || 'unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(job);
      return acc;
    }, {});

    return {
      recentJobs: jobs.slice(0, 10), // Most recent 10 jobs
      jobsByType,
      todaysJobs: jobs.filter(job => job.createdAt >= todayTimestamp),
      thisWeeksJobs: jobs.filter(job => job.createdAt >= weekAgo),
      completedJobs: jobs.filter(job => job.status === 'completed'),
      failedJobs: jobs.filter(job => job.status === 'failed'),
      totalJobs: jobs.length
    };
  }, [jobs]);

  return {
    // State
    jobs,
    statistics,
    isLoading,
    error,
    
    // Derived data
    ...derivedData,
    
    // Actions
    addJob,
    updateJob,
    removeJob,
    getJobs,
    getJobsByType,
    getTodaysJobs,
    getJobsFromLastDays,
    getFrequentSettings,
    clearAllJobs,
    cleanup,
    exportData,
    importData,
    
    // Manager instance (for advanced usage)
    recentJobsManager
  };
};

/**
 * Hook for recent jobs with automatic refresh
 * Automatically refreshes jobs list at specified intervals
 */
export const useRecentJobsWithRefresh = (refreshInterval = 30000) => {
  const recentJobsHook = useRecentJobs();
  const { recentJobsManager } = recentJobsHook;
  
  useEffect(() => {
    if (!recentJobsManager || !refreshInterval) {
      return;
    }
    
    const interval = setInterval(() => {
      // Trigger a refresh by getting fresh statistics
      recentJobsHook.statistics = recentJobsManager.getStatistics();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [recentJobsManager, refreshInterval]);
  
  return recentJobsHook;
};

/**
 * Hook for recent jobs filtering
 * Provides easy filtering functionality with state management
 */
export const useRecentJobsFilter = () => {
  const [filters, setFilters] = useState({
    type: null,
    status: null,
    search: '',
    dateRange: null,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
  
  const { getJobs } = useRecentJobs();
  
  const filteredJobs = useMemo(() => {
    const filterOptions = {
      ...filters,
      search: filters.search || undefined,
      type: filters.type || undefined,
      status: filters.status || undefined
    };
    
    // Remove undefined values
    Object.keys(filterOptions).forEach(key => {
      if (filterOptions[key] === undefined) {
        delete filterOptions[key];
      }
    });
    
    return getJobs(filterOptions);
  }, [filters, getJobs]);
  
  const updateFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);
  
  const resetFilters = useCallback(() => {
    setFilters({
      type: null,
      status: null,
      search: '',
      dateRange: null,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });
  }, []);
  
  return {
    filters,
    filteredJobs,
    updateFilter,
    resetFilters,
    setFilters
  };
};

export default useRecentJobs;