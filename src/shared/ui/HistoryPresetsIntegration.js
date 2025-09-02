/**
 * UI Integration Layer for Job History and Presets
 * Provides React components and hooks for managing history and presets
 */

import React, { useState, useEffect, useCallback, useMemo, useContext, createContext } from 'react';
import { JobHistoryAPI } from '../api/JobHistoryAPI';
import { PresetImportExportService } from '../services/PresetImportExportService';
import { PresetCategorizationService } from '../services/PresetCategorizationService';
import { ConversionPreset } from '../models/ConversionPreset';

/**
 * History and Presets Context
 */
const HistoryPresetsContext = createContext({
  // History state
  jobs: [],
  jobsLoading: false,
  jobsError: null,
  totalJobs: 0,
  
  // Presets state
  presets: [],
  presetsLoading: false,
  presetsError: null,
  categories: [],
  
  // Actions
  refreshJobs: () => {},
  searchJobs: () => {},
  deleteJob: () => {},
  exportJobs: () => {},
  
  loadPresets: () => {},
  savePreset: () => {},
  deletePreset: () => {},
  importPresets: () => {},
  exportPresets: () => {},
  categorizePreset: () => {}
});

/**
 * History and Presets Provider
 */
export const HistoryPresetsProvider = ({ children, apiConfig = {} }) => {
  // History state
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState(null);
  const [totalJobs, setTotalJobs] = useState(0);
  const [jobsFilters, setJobsFilters] = useState({});
  const [jobsPagination, setJobsPagination] = useState({ page: 1, limit: 20 });
  
  // Presets state
  const [presets, setPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState(null);
  const [categories, setCategories] = useState([]);
  
  // Services
  const historyAPI = useMemo(() => new JobHistoryAPI(apiConfig), [apiConfig]);
  const importExportService = useMemo(() => new PresetImportExportService(), []);
  const categorizationService = useMemo(() => new PresetCategorizationService(), []);
  
  /**
   * Load jobs with filters and pagination
   */
  const loadJobs = useCallback(async (filters = {}, pagination = {}) => {
    setJobsLoading(true);
    setJobsError(null);
    
    try {
      const queryFilters = { ...jobsFilters, ...filters };
      const queryPagination = { ...jobsPagination, ...pagination };
      
      const result = await historyAPI.getJobs({
        ...queryFilters,
        page: queryPagination.page,
        limit: queryPagination.limit
      });
      
      setJobs(result.jobs);
      setTotalJobs(result.total);
      setJobsFilters(queryFilters);
      setJobsPagination(queryPagination);
      
    } catch (error) {
      setJobsError(error.message);
    } finally {
      setJobsLoading(false);
    }
  }, [historyAPI, jobsFilters, jobsPagination]);
  
  /**
   * Search jobs
   */
  const searchJobs = useCallback(async (query, options = {}) => {
    setJobsLoading(true);
    setJobsError(null);
    
    try {
      const result = await historyAPI.searchJobs(query, {
        page: 1,
        limit: 20,
        ...options
      });
      
      setJobs(result.jobs);
      setTotalJobs(result.total);
      
    } catch (error) {
      setJobsError(error.message);
    } finally {
      setJobsLoading(false);
    }
  }, [historyAPI]);
  
  /**
   * Delete job
   */
  const deleteJob = useCallback(async (jobId) => {
    try {
      await historyAPI.deleteJob(jobId);
      setJobs(prev => prev.filter(job => job.id !== jobId));
      setTotalJobs(prev => prev - 1);
      return true;
    } catch (error) {
      setJobsError(error.message);
      return false;
    }
  }, [historyAPI]);
  
  /**
   * Export jobs
   */
  const exportJobs = useCallback(async (jobIds, format = 'json') => {
    try {
      const result = await historyAPI.exportJobs(jobIds, { format });
      return result;
    } catch (error) {
      setJobsError(error.message);
      throw error;
    }
  }, [historyAPI]);
  
  /**
   * Load presets
   */
  const loadPresets = useCallback(async (filters = {}) => {
    setPresetsLoading(true);
    setPresetsError(null);
    
    try {
      // This would integrate with a preset storage service
      // For now, we'll simulate loading presets
      const mockPresets = [];
      setPresets(mockPresets);
      
      // Load categories
      const mockCategories = Object.values(ConversionPreset.PresetCategory);
      setCategories(mockCategories);
      
    } catch (error) {
      setPresetsError(error.message);
    } finally {
      setPresetsLoading(false);
    }
  }, []);
  
  /**
   * Save preset
   */
  const savePreset = useCallback(async (presetData) => {
    try {
      const preset = new ConversionPreset(presetData);
      const validation = preset.validate();
      
      if (!validation.isValid) {
        throw new Error(`Invalid preset: ${validation.errors.join(', ')}`);
      }
      
      // Auto-categorize if needed
      if (preset.category === ConversionPreset.PresetCategory.CUSTOM) {
        const suggestion = await categorizationService.categorizePreset(preset);
        if (suggestion.confidence > 0.8) {
          preset.category = suggestion.category;
        }
      }
      
      // This would integrate with a preset storage service
      setPresets(prev => {
        const existing = prev.findIndex(p => p.id === preset.id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = preset;
          return updated;
        } else {
          return [...prev, preset];
        }
      });
      
      return preset;
    } catch (error) {
      setPresetsError(error.message);
      throw error;
    }
  }, [categorizationService]);
  
  /**
   * Delete preset
   */
  const deletePreset = useCallback(async (presetId) => {
    try {
      // This would integrate with a preset storage service
      setPresets(prev => prev.filter(p => p.id !== presetId));
      return true;
    } catch (error) {
      setPresetsError(error.message);
      return false;
    }
  }, []);
  
  /**
   * Import presets
   */
  const importPresets = useCallback(async (source, sourceType, options = {}) => {
    setPresetsLoading(true);
    setPresetsError(null);
    
    try {
      const result = await importExportService.importPresets(source, sourceType, options);
      
      if (result.success && result.presets.length > 0) {
        setPresets(prev => {
          const newPresets = [...prev];
          
          for (const preset of result.presets) {
            const existing = newPresets.findIndex(p => p.id === preset.id);
            if (existing >= 0) {
              if (options.overwriteExisting) {
                newPresets[existing] = preset;
              }
            } else {
              newPresets.push(preset);
            }
          }
          
          return newPresets;
        });
      }
      
      return result;
    } catch (error) {
      setPresetsError(error.message);
      throw error;
    } finally {
      setPresetsLoading(false);
    }
  }, [importExportService]);
  
  /**
   * Export presets
   */
  const exportPresets = useCallback(async (presetIds, filePath, options = {}) => {
    try {
      const presetsToExport = presets.filter(p => presetIds.includes(p.id));
      const result = await importExportService.exportPresets(presetsToExport, filePath, options);
      return result;
    } catch (error) {
      setPresetsError(error.message);
      throw error;
    }
  }, [presets, importExportService]);
  
  /**
   * Categorize preset
   */
  const categorizePreset = useCallback(async (preset) => {
    try {
      const result = await categorizationService.categorizePreset(preset);
      return result;
    } catch (error) {
      setPresetsError(error.message);
      throw error;
    }
  }, [categorizationService]);
  
  /**
   * Refresh jobs
   */
  const refreshJobs = useCallback(() => {
    loadJobs(jobsFilters, jobsPagination);
  }, [loadJobs, jobsFilters, jobsPagination]);
  
  // Initial load
  useEffect(() => {
    loadJobs();
    loadPresets();
  }, []);
  
  const contextValue = {
    // History state
    jobs,
    jobsLoading,
    jobsError,
    totalJobs,
    jobsFilters,
    jobsPagination,
    
    // Presets state
    presets,
    presetsLoading,
    presetsError,
    categories,
    
    // Actions
    loadJobs,
    refreshJobs,
    searchJobs,
    deleteJob,
    exportJobs,
    
    loadPresets,
    savePreset,
    deletePreset,
    importPresets,
    exportPresets,
    categorizePreset
  };
  
  return (
    <HistoryPresetsContext.Provider value={contextValue}>
      {children}
    </HistoryPresetsContext.Provider>
  );
};

/**
 * Hook to use history and presets context
 */
export const useHistoryPresets = () => {
  const context = useContext(HistoryPresetsContext);
  if (!context) {
    throw new Error('useHistoryPresets must be used within a HistoryPresetsProvider');
  }
  return context;
};

/**
 * Hook for job history management
 */
export const useJobHistory = () => {
  const {
    jobs,
    jobsLoading,
    jobsError,
    totalJobs,
    jobsFilters,
    jobsPagination,
    loadJobs,
    refreshJobs,
    searchJobs,
    deleteJob,
    exportJobs
  } = useHistoryPresets();
  
  return {
    jobs,
    loading: jobsLoading,
    error: jobsError,
    total: totalJobs,
    filters: jobsFilters,
    pagination: jobsPagination,
    load: loadJobs,
    refresh: refreshJobs,
    search: searchJobs,
    delete: deleteJob,
    export: exportJobs
  };
};

/**
 * Hook for preset management
 */
export const usePresets = () => {
  const {
    presets,
    presetsLoading,
    presetsError,
    categories,
    loadPresets,
    savePreset,
    deletePreset,
    importPresets,
    exportPresets,
    categorizePreset
  } = useHistoryPresets();
  
  return {
    presets,
    loading: presetsLoading,
    error: presetsError,
    categories,
    load: loadPresets,
    save: savePreset,
    delete: deletePreset,
    import: importPresets,
    export: exportPresets,
    categorize: categorizePreset
  };
};

/**
 * Job History Table Component
 */
export const JobHistoryTable = ({
  onJobSelect,
  onJobDelete,
  onJobExport,
  showActions = true,
  className = ''
}) => {
  const { jobs, loading, error, total, pagination, load, delete: deleteJob } = useJobHistory();
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  
  const handleSelectJob = (jobId, selected) => {
    setSelectedJobs(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(jobId);
      } else {
        newSet.delete(jobId);
      }
      return newSet;
    });
  };
  
  const handleSelectAll = (selected) => {
    if (selected) {
      setSelectedJobs(new Set(jobs.map(job => job.id)));
    } else {
      setSelectedJobs(new Set());
    }
  };
  
  const handleDeleteSelected = async () => {
    const promises = Array.from(selectedJobs).map(jobId => deleteJob(jobId));
    await Promise.all(promises);
    setSelectedJobs(new Set());
  };
  
  const handlePageChange = (page) => {
    load({}, { ...pagination, page });
  };
  
  if (loading) {
    return <div className="loading">Loading job history...</div>;
  }
  
  if (error) {
    return <div className="error">Error loading jobs: {error}</div>;
  }
  
  return (
    <div className={`job-history-table ${className}`}>
      {showActions && (
        <div className="table-actions">
          <button
            onClick={handleDeleteSelected}
            disabled={selectedJobs.size === 0}
            className="btn btn-danger"
          >
            Delete Selected ({selectedJobs.size})
          </button>
          
          <button
            onClick={() => onJobExport?.(Array.from(selectedJobs))}
            disabled={selectedJobs.size === 0}
            className="btn btn-secondary"
          >
            Export Selected
          </button>
        </div>
      )}
      
      <table className="table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={selectedJobs.size === jobs.length && jobs.length > 0}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
            </th>
            <th>Job ID</th>
            <th>File Name</th>
            <th>Status</th>
            <th>Format</th>
            <th>Size</th>
            <th>Duration</th>
            <th>Created</th>
            {showActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {jobs.map(job => (
            <tr key={job.id} className={`status-${job.status}`}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedJobs.has(job.id)}
                  onChange={(e) => handleSelectJob(job.id, e.target.checked)}
                />
              </td>
              <td>
                <button
                  className="link-button"
                  onClick={() => onJobSelect?.(job)}
                >
                  {job.id}
                </button>
              </td>
              <td>{job.fileName}</td>
              <td>
                <span className={`status-badge status-${job.status}`}>
                  {job.status}
                </span>
              </td>
              <td>{job.outputFormat}</td>
              <td>{formatFileSize(job.fileSize)}</td>
              <td>{formatDuration(job.duration)}</td>
              <td>{formatDate(job.createdAt)}</td>
              {showActions && (
                <td>
                  <button
                    onClick={() => onJobDelete?.(job.id)}
                    className="btn btn-sm btn-danger"
                  >
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      
      {total > pagination.limit && (
        <div className="pagination">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="btn btn-secondary"
          >
            Previous
          </button>
          
          <span className="page-info">
            Page {pagination.page} of {Math.ceil(total / pagination.limit)}
          </span>
          
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page >= Math.ceil(total / pagination.limit)}
            className="btn btn-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Job Search Component
 */
export const JobSearch = ({ onSearch, className = '' }) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    format: '',
    dateRange: ''
  });
  
  const { search } = useJobHistory();
  
  const handleSearch = () => {
    const searchOptions = {
      ...filters,
      ...(filters.dateRange && { dateRange: parseDateRange(filters.dateRange) })
    };
    
    search(query, searchOptions);
    onSearch?.(query, searchOptions);
  };
  
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  return (
    <div className={`job-search ${className}`}>
      <div className="search-input">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search jobs..."
          className="form-control"
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} className="btn btn-primary">
          Search
        </button>
      </div>
      
      <div className="search-filters">
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="form-control"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        
        <select
          value={filters.format}
          onChange={(e) => handleFilterChange('format', e.target.value)}
          className="form-control"
        >
          <option value="">All Formats</option>
          <option value="mp4">MP4</option>
          <option value="avi">AVI</option>
          <option value="mov">MOV</option>
          <option value="jpg">JPG</option>
          <option value="png">PNG</option>
          <option value="pdf">PDF</option>
        </select>
        
        <select
          value={filters.dateRange}
          onChange={(e) => handleFilterChange('dateRange', e.target.value)}
          className="form-control"
        >
          <option value="">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>
    </div>
  );
};

/**
 * Preset Library Component
 */
export const PresetLibrary = ({
  onPresetSelect,
  onPresetEdit,
  onPresetDelete,
  showActions = true,
  className = ''
}) => {
  const { presets, loading, error, categories } = usePresets();
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredPresets = useMemo(() => {
    return presets.filter(preset => {
      const matchesCategory = !selectedCategory || preset.category === selectedCategory;
      const matchesSearch = !searchQuery || 
        preset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        preset.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesCategory && matchesSearch;
    });
  }, [presets, selectedCategory, searchQuery]);
  
  if (loading) {
    return <div className="loading">Loading presets...</div>;
  }
  
  if (error) {
    return <div className="error">Error loading presets: {error}</div>;
  }
  
  return (
    <div className={`preset-library ${className}`}>
      <div className="library-filters">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search presets..."
          className="form-control"
        />
        
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="form-control"
        >
          <option value="">All Categories</option>
          {categories.map(category => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      
      <div className="preset-grid">
        {filteredPresets.map(preset => (
          <div key={preset.id} className="preset-card">
            <div className="preset-header">
              <h3 className="preset-name">{preset.name}</h3>
              <span className="preset-category">{preset.category}</span>
            </div>
            
            <div className="preset-description">
              {preset.description}
            </div>
            
            <div className="preset-tags">
              {preset.tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
            
            <div className="preset-stats">
              <span>Used {preset.usageCount} times</span>
              <span>Rating: {preset.averageRating}/5</span>
            </div>
            
            {showActions && (
              <div className="preset-actions">
                <button
                  onClick={() => onPresetSelect?.(preset)}
                  className="btn btn-primary"
                >
                  Use Preset
                </button>
                
                <button
                  onClick={() => onPresetEdit?.(preset)}
                  className="btn btn-secondary"
                >
                  Edit
                </button>
                
                <button
                  onClick={() => onPresetDelete?.(preset.id)}
                  className="btn btn-danger"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {filteredPresets.length === 0 && (
        <div className="empty-state">
          {searchQuery || selectedCategory ? 
            'No presets match your filters.' : 
            'No presets available. Create your first preset!'
          }
        </div>
      )}
    </div>
  );
};

/**
 * Utility functions
 */
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(ms) {
  if (!ms) return 'Unknown';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function parseDateRange(range) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (range) {
    case 'today':
      return {
        start: today.getTime(),
        end: now.getTime()
      };
    
    case 'week':
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return {
        start: weekStart.getTime(),
        end: now.getTime()
      };
    
    case 'month':
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return {
        start: monthStart.getTime(),
        end: now.getTime()
      };
    
    case 'year':
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return {
        start: yearStart.getTime(),
        end: now.getTime()
      };
    
    default:
      return null;
  }
}

export default {
  HistoryPresetsProvider,
  useHistoryPresets,
  useJobHistory,
  usePresets,
  JobHistoryTable,
  JobSearch,
  PresetLibrary
};