import React, { useState } from 'react';
import RecentJobsList from './RecentJobsList';
import RecentJobsWidget from './RecentJobsWidget';
import './RecentJobsPanel.css';

/**
 * Panel component for managing recent jobs with different view modes
 */
const RecentJobsPanel = ({ 
  onReuseSettings,
  onJobSelect,
  viewMode = 'widget', // 'widget', 'list', 'collapsed'
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(viewMode !== 'collapsed');
  const [currentViewMode, setCurrentViewMode] = useState(viewMode);

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const handleViewModeChange = (mode) => {
    setCurrentViewMode(mode);
    if (mode === 'collapsed') {
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
    }
  };

  const handleReuseSettings = (settings, presetUsed) => {
    if (onReuseSettings) {
      onReuseSettings(settings, presetUsed);
    }
  };

  const handleJobSelect = (job) => {
    if (onJobSelect) {
      onJobSelect(job);
    }
  };

  return (
    <div className={`recent-jobs-panel ${className}`}>
      {/* Panel Header */}
      <div className="panel-header">
        <div className="panel-title">
          <h3>Recent Jobs</h3>
          <span className="panel-subtitle">Reuse settings from previous conversions</span>
        </div>
        
        <div className="panel-controls">
          {/* View Mode Selector */}
          <div className="view-mode-selector">
            <button
              className={`view-mode-btn ${currentViewMode === 'widget' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('widget')}
              title="Widget View"
            >
              📊
            </button>
            <button
              className={`view-mode-btn ${currentViewMode === 'list' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('list')}
              title="List View"
            >
              📋
            </button>
            <button
              className={`view-mode-btn ${currentViewMode === 'collapsed' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('collapsed')}
              title="Collapse Panel"
            >
              ➖
            </button>
          </div>
          
          {/* Expand/Collapse Toggle */}
          {currentViewMode !== 'collapsed' && (
            <button
              className="expand-toggle"
              onClick={handleToggleExpanded}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '🔼' : '🔽'}
            </button>
          )}
        </div>
      </div>

      {/* Panel Content */}
      {isExpanded && currentViewMode !== 'collapsed' && (
        <div className="panel-content">
          {currentViewMode === 'widget' ? (
            <RecentJobsWidget
              onReuseSettings={handleReuseSettings}
              onJobSelect={handleJobSelect}
              maxItems={5}
              showStatistics={true}
              className="panel-widget"
            />
          ) : (
            <RecentJobsList
              onReuseSettings={handleReuseSettings}
              onJobSelect={handleJobSelect}
              maxItems={10}
              showFilters={true}
              showStatistics={true}
              className="panel-list"
            />
          )}
        </div>
      )}

      {/* Collapsed State */}
      {currentViewMode === 'collapsed' && (
        <div className="panel-collapsed">
          <button
            className="expand-btn"
            onClick={() => handleViewModeChange('widget')}
            title="Show Recent Jobs"
          >
            📋 Recent Jobs
          </button>
        </div>
      )}
    </div>
  );
};

export default RecentJobsPanel;