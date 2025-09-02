import React, { useState, useEffect } from 'react';
import ProgressBar from './ProgressBar';
import './JobQueue.css';

const JobQueue = ({ 
  jobs = [], 
  onCancelJob = null,
  onPauseJob = null,
  onResumeJob = null,
  onRemoveJob = null,
  onClearCompleted = null,
  onRetryJob = null,
  maxVisibleJobs = 5,
  showCompleted = true
}) => {
  const [expandedJobs, setExpandedJobs] = useState(new Set());
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'completed', 'failed'
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'name', 'progress'

  // Filter and sort jobs
  const filteredJobs = jobs
    .filter(job => {
      switch (filter) {
        case 'active':
          return job.status === 'converting' || job.status === 'pending' || job.status === 'paused';
        case 'completed':
          return job.status === 'completed';
        case 'failed':
          return job.status === 'error' || job.status === 'cancelled';
        default:
          return showCompleted || job.status !== 'completed';
      }
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'name':
          return a.fileName.localeCompare(b.fileName);
        case 'progress':
          return b.progress - a.progress;
        default: // newest
          return b.createdAt - a.createdAt;
      }
    });

  const visibleJobs = filteredJobs.slice(0, maxVisibleJobs);
  const hiddenJobsCount = filteredJobs.length - visibleJobs.length;

  // Get job counts for filter badges
  const jobCounts = {
    all: jobs.length,
    active: jobs.filter(job => ['converting', 'pending', 'paused'].includes(job.status)).length,
    completed: jobs.filter(job => job.status === 'completed').length,
    failed: jobs.filter(job => ['error', 'cancelled'].includes(job.status)).length
  };

  const toggleJobExpansion = (jobId) => {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobs(newExpanded);
  };

  const getJobIcon = (status) => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'converting':
        return '🔄';
      case 'paused':
        return '⏸️';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      case 'cancelled':
        return '⏹️';
      default:
        return '📄';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '--';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '--';
    return new Date(timestamp).toLocaleTimeString();
  };

  if (jobs.length === 0) {
    return (
      <div className="job-queue empty">
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>No conversion jobs</h3>
          <p>Your conversion queue is empty. Add files to start converting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="job-queue">
      <div className="queue-header">
        <div className="queue-title">
          <h3>Conversion Queue</h3>
          <span className="job-count">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
        </div>
        
        <div className="queue-controls">
          <div className="filter-tabs">
            {Object.entries(jobCounts).map(([filterType, count]) => (
              <button
                key={filterType}
                className={`filter-tab ${filter === filterType ? 'active' : ''}`}
                onClick={() => setFilter(filterType)}
                disabled={count === 0}
              >
                {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
                {count > 0 && <span className="count-badge">{count}</span>}
              </button>
            ))}
          </div>
          
          <div className="sort-controls">
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A-Z</option>
              <option value="progress">Progress</option>
            </select>
          </div>
          
          {onClearCompleted && jobCounts.completed > 0 && (
            <button 
              className="clear-completed-btn"
              onClick={onClearCompleted}
              title="Clear completed jobs"
            >
              Clear Completed
            </button>
          )}
        </div>
      </div>

      <div className="job-list">
        {visibleJobs.map((job) => {
          const isExpanded = expandedJobs.has(job.id);
          
          return (
            <div key={job.id} className={`job-item ${job.status}`}>
              <div className="job-summary" onClick={() => toggleJobExpansion(job.id)}>
                <div className="job-info">
                  <div className="job-icon">{getJobIcon(job.status)}</div>
                  <div className="job-details">
                    <div className="job-name" title={job.fileName}>
                      {job.fileName.length > 30 ? `${job.fileName.substring(0, 27)}...` : job.fileName}
                    </div>
                    <div className="job-meta">
                      <span className="format-info">
                        {job.inputFormat?.toUpperCase()} → {job.outputFormat?.toUpperCase()}
                      </span>
                      <span className="time-info">{formatTime(job.createdAt)}</span>
                      {job.fileSize && (
                        <span className="size-info">{formatFileSize(job.fileSize)}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="job-actions">
                  {job.status === 'converting' && (
                    <>
                      {onPauseJob && (
                        <button 
                          className="action-btn pause-btn"
                          onClick={(e) => { e.stopPropagation(); onPauseJob(job.id); }}
                          title="Pause conversion"
                        >
                          ⏸️
                        </button>
                      )}
                      {onCancelJob && (
                        <button 
                          className="action-btn cancel-btn"
                          onClick={(e) => { e.stopPropagation(); onCancelJob(job.id); }}
                          title="Cancel conversion"
                        >
                          ❌
                        </button>
                      )}
                    </>
                  )}
                  
                  {job.status === 'paused' && onResumeJob && (
                    <button 
                      className="action-btn resume-btn"
                      onClick={(e) => { e.stopPropagation(); onResumeJob(job.id); }}
                      title="Resume conversion"
                    >
                      ▶️
                    </button>
                  )}
                  
                  {(job.status === 'error' || job.status === 'cancelled') && onRetryJob && (
                    <button 
                      className="action-btn retry-btn"
                      onClick={(e) => { e.stopPropagation(); onRetryJob(job.id); }}
                      title="Retry conversion"
                    >
                      🔄
                    </button>
                  )}
                  
                  {onRemoveJob && ['completed', 'error', 'cancelled'].includes(job.status) && (
                    <button 
                      className="action-btn remove-btn"
                      onClick={(e) => { e.stopPropagation(); onRemoveJob(job.id); }}
                      title="Remove from queue"
                    >
                      🗑️
                    </button>
                  )}
                  
                  <button className="expand-btn" title={isExpanded ? 'Collapse' : 'Expand'}>
                    {isExpanded ? '▼' : '▶'}
                  </button>
                </div>
              </div>
              
              {isExpanded && (
                <div className="job-expanded">
                  <ProgressBar
                    progress={job.progress || 0}
                    status={job.status}
                    fileName={job.fileName}
                    startTime={job.startTime}
                    estimatedSize={job.estimatedSize}
                    currentSize={job.currentSize}
                    onCancel={job.status === 'converting' ? () => onCancelJob?.(job.id) : null}
                    onPause={job.status === 'converting' ? () => onPauseJob?.(job.id) : null}
                    onResume={job.status === 'paused' ? () => onResumeJob?.(job.id) : null}
                    showDetails={true}
                    compact={false}
                  />
                  
                  {job.error && (
                    <div className="job-error">
                      <strong>Error:</strong> {job.error}
                    </div>
                  )}
                  
                  {job.outputPath && job.status === 'completed' && (
                    <div className="job-output">
                      <strong>Output:</strong> 
                      <span className="output-path" title={job.outputPath}>
                        {job.outputPath}
                      </span>
                    </div>
                  )}
                  
                  {job.settings && Object.keys(job.settings).length > 0 && (
                    <div className="job-settings">
                      <strong>Settings:</strong>
                      <div className="settings-list">
                        {Object.entries(job.settings).map(([key, value]) => (
                          <span key={key} className="setting-item">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        
        {hiddenJobsCount > 0 && (
          <div className="hidden-jobs-notice">
            <p>+ {hiddenJobsCount} more job{hiddenJobsCount !== 1 ? 's' : ''} (use filters to see more)</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobQueue;