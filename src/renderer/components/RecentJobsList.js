import React, { useState, useMemo } from 'react';
import { useRecentJobs, useRecentJobsFilter } from '../hooks/useRecentJobs.js';
import { ConversionType, JobStatus } from '../../shared/types/jobEnums.js';
import './RecentJobsList.css';

/**
 * Component for displaying and managing recent conversion jobs
 */
const RecentJobsList = ({ 
  maxItems = 20,
  showFilters = true,
  showStatistics = true,
  onJobSelect = null,
  onReuseSettings = null,
  className = ''
}) => {
  const {
    jobs,
    statistics,
    isLoading,
    error,
    removeJob,
    clearAllJobs,
    cleanup
  } = useRecentJobs();
  
  const {
    filters,
    filteredJobs,
    updateFilter,
    resetFilters
  } = useRecentJobsFilter();
  
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  
  // Limit displayed jobs
  const displayedJobs = useMemo(() => {
    return filteredJobs.slice(0, maxItems);
  }, [filteredJobs, maxItems]);
  
  // Handle job selection
  const handleJobSelect = (jobId, isSelected) => {
    const newSelected = new Set(selectedJobs);
    if (isSelected) {
      newSelected.add(jobId);
    } else {
      newSelected.delete(jobId);
    }
    setSelectedJobs(newSelected);
  };
  
  // Handle select all
  const handleSelectAll = (selectAll) => {
    if (selectAll) {
      setSelectedJobs(new Set(displayedJobs.map(job => job.id)));
    } else {
      setSelectedJobs(new Set());
    }
  };
  
  // Handle remove selected jobs
  const handleRemoveSelected = () => {
    selectedJobs.forEach(jobId => removeJob(jobId));
    setSelectedJobs(new Set());
  };
  
  // Handle clear all jobs
  const handleClearAll = () => {
    clearAllJobs();
    setSelectedJobs(new Set());
    setShowConfirmClear(false);
  };
  
  // Handle cleanup old jobs
  const handleCleanup = () => {
    cleanup({ olderThanDays: 30 });
    setSelectedJobs(new Set());
  };
  
  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };
  
  // Format duration
  const formatDuration = (ms) => {
    if (!ms) return 'Unknown';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };
  
  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case JobStatus.COMPLETED:
        return '✅';
      case JobStatus.FAILED:
        return '❌';
      case JobStatus.CANCELLED:
        return '⏹️';
      case JobStatus.IN_PROGRESS:
        return '⏳';
      default:
        return '❓';
    }
  };
  
  // Get conversion type display name
  const getConversionTypeDisplay = (type) => {
    switch (type) {
      case ConversionType.DOCUMENT:
        return 'Document';
      case ConversionType.IMAGE:
        return 'Image';
      case ConversionType.AUDIO:
        return 'Audio';
      case ConversionType.VIDEO:
        return 'Video';
      default:
        return 'Unknown';
    }
  };
  
  if (isLoading) {
    return (
      <div className={`recent-jobs-list loading ${className}`}>
        <div className="loading-spinner">Loading recent jobs...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={`recent-jobs-list error ${className}`}>
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          Error loading recent jobs: {error}
        </div>
      </div>
    );
  }
  
  return (
    <div className={`recent-jobs-list ${className}`}>
      {/* Header */}
      <div className="recent-jobs-header">
        <h3>Recent Jobs</h3>
        {statistics && showStatistics && (
          <div className="statistics">
            <span className="stat">
              Total: {statistics.totalJobs}
            </span>
            <span className="stat">
              Completed: {statistics.completedJobs}
            </span>
            <span className="stat">
              Failed: {statistics.failedJobs}
            </span>
          </div>
        )}
      </div>
      
      {/* Filters */}
      {showFilters && (
        <div className="filters">
          <div className="filter-row">
            <select
              value={filters.type || ''}
              onChange={(e) => updateFilter('type', e.target.value || null)}
              className="filter-select"
            >
              <option value="">All Types</option>
              <option value={ConversionType.DOCUMENT}>Document</option>
              <option value={ConversionType.IMAGE}>Image</option>
              <option value={ConversionType.AUDIO}>Audio</option>
              <option value={ConversionType.VIDEO}>Video</option>
            </select>
            
            <select
              value={filters.status || ''}
              onChange={(e) => updateFilter('status', e.target.value || null)}
              className="filter-select"
            >
              <option value="">All Status</option>
              <option value={JobStatus.COMPLETED}>Completed</option>
              <option value={JobStatus.FAILED}>Failed</option>
              <option value={JobStatus.CANCELLED}>Cancelled</option>
              <option value={JobStatus.IN_PROGRESS}>In Progress</option>
            </select>
            
            <input
              type="text"
              placeholder="Search jobs..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="filter-input"
            />
            
            <button
              onClick={resetFilters}
              className="filter-reset-btn"
              title="Reset filters"
            >
              🔄
            </button>
          </div>
          
          <div className="filter-row">
            <select
              value={filters.sortBy}
              onChange={(e) => updateFilter('sortBy', e.target.value)}
              className="filter-select"
            >
              <option value="createdAt">Date Created</option>
              <option value="name">Name</option>
              <option value="duration">Duration</option>
              <option value="fileSize">File Size</option>
              <option value="status">Status</option>
            </select>
            
            <select
              value={filters.sortOrder}
              onChange={(e) => updateFilter('sortOrder', e.target.value)}
              className="filter-select"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>
      )}
      
      {/* Actions */}
      <div className="actions">
        <div className="selection-actions">
          <label className="select-all">
            <input
              type="checkbox"
              checked={selectedJobs.size === displayedJobs.length && displayedJobs.length > 0}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
            Select All ({selectedJobs.size})
          </label>
          
          {selectedJobs.size > 0 && (
            <button
              onClick={handleRemoveSelected}
              className="remove-selected-btn"
            >
              Remove Selected ({selectedJobs.size})
            </button>
          )}
        </div>
        
        <div className="bulk-actions">
          <button
            onClick={handleCleanup}
            className="cleanup-btn"
            title="Remove jobs older than 30 days"
          >
            Cleanup Old
          </button>
          
          <button
            onClick={() => setShowConfirmClear(true)}
            className="clear-all-btn"
            disabled={jobs.length === 0}
          >
            Clear All
          </button>
        </div>
      </div>
      
      {/* Jobs List */}
      <div className="jobs-container">
        {displayedJobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>No recent jobs found</p>
            {filters.search || filters.type || filters.status ? (
              <button onClick={resetFilters} className="reset-filters-btn">
                Clear Filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="jobs-list">
            {displayedJobs.map((job) => (
              <div
                key={job.id}
                className={`job-item ${selectedJobs.has(job.id) ? 'selected' : ''}`}
                onClick={() => onJobSelect && onJobSelect(job)}
              >
                <div className="job-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedJobs.has(job.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleJobSelect(job.id, e.target.checked);
                    }}
                  />
                </div>
                
                <div className="job-info">
                  <div className="job-header">
                    <span className="job-name">{job.name}</span>
                    <span className="job-status">
                      {getStatusIcon(job.status)} {job.status}
                    </span>
                  </div>
                  
                  <div className="job-details">
                    <span className="job-type">
                      {getConversionTypeDisplay(job.type)}
                    </span>
                    <span className="job-format">
                      {job.targetFormat}
                    </span>
                    <span className="job-size">
                      {formatFileSize(job.fileSize)}
                    </span>
                    <span className="job-duration">
                      {formatDuration(job.duration)}
                    </span>
                  </div>
                  
                  <div className="job-meta">
                    <span className="job-date">
                      {new Date(job.createdAt).toLocaleString()}
                    </span>
                    {job.presetUsed && (
                      <span className="job-preset">
                        Preset: {job.presetUsed}
                      </span>
                    )}
                  </div>
                  
                  {job.sourceFiles && job.sourceFiles.length > 0 && (
                    <div className="job-files">
                      <span className="files-count">
                        {job.sourceFiles.length} file{job.sourceFiles.length !== 1 ? 's' : ''}
                      </span>
                      <span className="first-file">
                        {job.sourceFiles[0].split('/').pop()}
                        {job.sourceFiles.length > 1 && ` +${job.sourceFiles.length - 1} more`}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="job-actions">
                  {onReuseSettings && job.settings && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReuseSettings(job.settings, job.presetUsed);
                      }}
                      className="reuse-btn"
                      title="Reuse these settings"
                    >
                      🔄
                    </button>
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeJob(job.id);
                    }}
                    className="remove-btn"
                    title="Remove from history"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {filteredJobs.length > maxItems && (
          <div className="load-more">
            <p>Showing {maxItems} of {filteredJobs.length} jobs</p>
          </div>
        )}
      </div>
      
      {/* Confirm Clear Dialog */}
      {showConfirmClear && (
        <div className="confirm-dialog-overlay">
          <div className="confirm-dialog">
            <h4>Clear All Recent Jobs?</h4>
            <p>This action cannot be undone. All job history will be permanently removed.</p>
            <div className="confirm-actions">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="confirm-btn"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecentJobsList;