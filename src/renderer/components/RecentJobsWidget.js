import React, { useState } from 'react';
import { useRecentJobs } from '../hooks/useRecentJobs.js';
import { ConversionType, JobStatus } from '../../shared/types/jobEnums.js';
import './RecentJobsWidget.css';

/**
 * Compact widget for displaying recent jobs in sidebars or dashboards
 */
const RecentJobsWidget = ({ 
  maxItems = 5,
  showStatistics = true,
  onJobSelect = null,
  onReuseSettings = null,
  onViewAll = null,
  className = ''
}) => {
  const {
    jobs,
    statistics,
    isLoading,
    error,
    removeJob
  } = useRecentJobs();
  
  const [expandedJob, setExpandedJob] = useState(null);
  
  // Get recent jobs limited by maxItems
  const recentJobs = jobs.slice(0, maxItems);
  
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
  
  // Get conversion type icon
  const getConversionTypeIcon = (type) => {
    switch (type) {
      case ConversionType.DOCUMENT:
        return '📄';
      case ConversionType.IMAGE:
        return '🖼️';
      case ConversionType.AUDIO:
        return '🎵';
      case ConversionType.VIDEO:
        return '🎬';
      default:
        return '📁';
    }
  };
  
  // Get relative time
  const getRelativeTime = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  };
  
  // Toggle job expansion
  const toggleJobExpansion = (jobId) => {
    setExpandedJob(expandedJob === jobId ? null : jobId);
  };
  
  if (isLoading) {
    return (
      <div className={`recent-jobs-widget loading ${className}`}>
        <div className="widget-header">
          <h4>Recent Jobs</h4>
        </div>
        <div className="loading-content">
          <span className="loading-spinner">⏳</span>
          <span>Loading...</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={`recent-jobs-widget error ${className}`}>
        <div className="widget-header">
          <h4>Recent Jobs</h4>
        </div>
        <div className="error-content">
          <span className="error-icon">⚠️</span>
          <span>Error loading jobs</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`recent-jobs-widget ${className}`}>
      {/* Header */}
      <div className="widget-header">
        <h4>Recent Jobs</h4>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="view-all-btn"
            title="View all recent jobs"
          >
            View All
          </button>
        )}
      </div>
      
      {/* Statistics */}
      {statistics && showStatistics && (
        <div className="widget-stats">
          <div className="stat-item">
            <span className="stat-value">{statistics.totalJobs}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{statistics.completedJobs}</span>
            <span className="stat-label">Done</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{statistics.failedJobs}</span>
            <span className="stat-label">Failed</span>
          </div>
        </div>
      )}
      
      {/* Jobs List */}
      <div className="widget-jobs">
        {recentJobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>No recent jobs</p>
          </div>
        ) : (
          <div className="jobs-list">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className={`job-item ${expandedJob === job.id ? 'expanded' : ''}`}
              >
                <div 
                  className="job-summary"
                  onClick={() => {
                    if (onJobSelect) {
                      onJobSelect(job);
                    } else {
                      toggleJobExpansion(job.id);
                    }
                  }}
                >
                  <div className="job-icon">
                    {getConversionTypeIcon(job.type)}
                  </div>
                  
                  <div className="job-info">
                    <div className="job-name">{job.name}</div>
                    <div className="job-meta">
                      <span className="job-format">{job.targetFormat}</span>
                      <span className="job-time">{getRelativeTime(job.createdAt)}</span>
                    </div>
                  </div>
                  
                  <div className="job-status">
                    {getStatusIcon(job.status)}
                  </div>
                  
                  <button
                    className="expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleJobExpansion(job.id);
                    }}
                    title={expandedJob === job.id ? 'Collapse' : 'Expand'}
                  >
                    {expandedJob === job.id ? '▲' : '▼'}
                  </button>
                </div>
                
                {/* Expanded Details */}
                {expandedJob === job.id && (
                  <div className="job-details">
                    <div className="detail-row">
                      <span className="detail-label">Size:</span>
                      <span className="detail-value">{formatFileSize(job.fileSize)}</span>
                    </div>
                    
                    <div className="detail-row">
                      <span className="detail-label">Duration:</span>
                      <span className="detail-value">{formatDuration(job.duration)}</span>
                    </div>
                    
                    {job.sourceFiles && job.sourceFiles.length > 0 && (
                      <div className="detail-row">
                        <span className="detail-label">Files:</span>
                        <span className="detail-value">
                          {job.sourceFiles.length} file{job.sourceFiles.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    
                    {job.presetUsed && (
                      <div className="detail-row">
                        <span className="detail-label">Preset:</span>
                        <span className="detail-value">{job.presetUsed}</span>
                      </div>
                    )}
                    
                    <div className="detail-row">
                      <span className="detail-label">Created:</span>
                      <span className="detail-value">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {/* Actions */}
                    <div className="job-actions">
                      {onReuseSettings && job.settings && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReuseSettings(job.settings, job.presetUsed);
                          }}
                          className="action-btn reuse-btn"
                          title="Reuse settings"
                        >
                          🔄 Reuse
                        </button>
                      )}
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeJob(job.id);
                          if (expandedJob === job.id) {
                            setExpandedJob(null);
                          }
                        }}
                        className="action-btn remove-btn"
                        title="Remove from history"
                      >
                        🗑️ Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {/* Show more indicator */}
        {jobs.length > maxItems && (
          <div className="more-jobs">
            <span>+{jobs.length - maxItems} more jobs</span>
            {onViewAll && (
              <button onClick={onViewAll} className="view-more-btn">
                View All
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentJobsWidget;