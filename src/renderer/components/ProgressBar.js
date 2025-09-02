import React, { useState, useEffect } from 'react';

const ProgressBar = ({ 
  progress = 0, 
  status = 'idle', 
  fileName = '', 
  startTime = null,
  estimatedSize = null,
  currentSize = null,
  onCancel = null,
  onPause = null,
  onResume = null,
  showDetails = true,
  compact = false
}) => {
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

  // Update elapsed time
  useEffect(() => {
    let interval = null;
    
    if (status === 'converting' && startTime && !isPaused) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setTimeElapsed(elapsed);
        
        // Calculate estimated time remaining
        if (progress > 0 && progress < 100) {
          const totalEstimatedTime = elapsed / (progress / 100);
          const remaining = Math.max(0, totalEstimatedTime - elapsed);
          setEstimatedTimeRemaining(Math.floor(remaining));
        }
      }, 1000);
    } else if (status !== 'converting') {
      setTimeElapsed(0);
      setEstimatedTimeRemaining(null);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, startTime, progress, isPaused]);

  // Format time in MM:SS or HH:MM:SS format
  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '--:--';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return '--';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Get status display text and color
  const getStatusInfo = () => {
    switch (status) {
      case 'converting':
        return { text: isPaused ? 'Paused' : 'Converting...', color: isPaused ? '#f39c12' : '#3498db' };
      case 'completed':
        return { text: 'Completed', color: '#27ae60' };
      case 'error':
        return { text: 'Error', color: '#e74c3c' };
      case 'cancelled':
        return { text: 'Cancelled', color: '#95a5a6' };
      default:
        return { text: 'Ready', color: '#95a5a6' };
    }
  };

  const statusInfo = getStatusInfo();
  const clampedProgress = Math.min(100, Math.max(0, progress));

  const handlePauseResume = () => {
    if (isPaused) {
      setIsPaused(false);
      onResume && onResume();
    } else {
      setIsPaused(true);
      onPause && onPause();
    }
  };

  if (compact) {
    return (
      <div className="progress-bar-compact">
        <div className="progress-track">
          <div 
            className="progress-fill" 
            style={{ 
              width: `${clampedProgress}%`,
              backgroundColor: statusInfo.color
            }}
          />
        </div>
        <span className="progress-text">{Math.round(clampedProgress)}%</span>
      </div>
    );
  }

  return (
    <div className="progress-bar-container">
      {fileName && (
        <div className="progress-header">
          <span className="file-name" title={fileName}>
            {fileName.length > 40 ? `${fileName.substring(0, 37)}...` : fileName}
          </span>
          <span className="status-badge" style={{ color: statusInfo.color }}>
            {statusInfo.text}
          </span>
        </div>
      )}
      
      <div className="progress-main">
        <div className="progress-track">
          <div 
            className="progress-fill" 
            style={{ 
              width: `${clampedProgress}%`,
              backgroundColor: statusInfo.color
            }}
          >
            <div className="progress-shine" />
          </div>
        </div>
        
        <div className="progress-percentage">
          {Math.round(clampedProgress)}%
        </div>
      </div>

      {showDetails && (
        <div className="progress-details">
          <div className="progress-stats">
            <div className="stat-item">
              <span className="stat-label">Elapsed:</span>
              <span className="stat-value">{formatTime(timeElapsed)}</span>
            </div>
            
            {estimatedTimeRemaining !== null && status === 'converting' && (
              <div className="stat-item">
                <span className="stat-label">Remaining:</span>
                <span className="stat-value">{formatTime(estimatedTimeRemaining)}</span>
              </div>
            )}
            
            {currentSize && estimatedSize && (
              <div className="stat-item">
                <span className="stat-label">Size:</span>
                <span className="stat-value">
                  {formatSize(currentSize)} / {formatSize(estimatedSize)}
                </span>
              </div>
            )}
          </div>
          
          {(status === 'converting' || status === 'paused') && (onCancel || onPause || onResume) && (
            <div className="progress-controls">
              {(onPause || onResume) && (
                <button 
                  className="control-btn pause-resume-btn"
                  onClick={handlePauseResume}
                  title={isPaused ? 'Resume conversion' : 'Pause conversion'}
                >
                  {isPaused ? '▶️' : '⏸️'}
                </button>
              )}
              
              {onCancel && (
                <button 
                  className="control-btn cancel-btn"
                  onClick={onCancel}
                  title="Cancel conversion"
                >
                  ❌
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgressBar;