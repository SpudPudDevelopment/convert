import React, { useState, useEffect } from 'react';
import './UpdateNotification.css';

/**
 * UpdateNotification Component
 * Handles all update-related notifications and UI interactions
 */
const UpdateNotification = () => {
  const [updateState, setUpdateState] = useState({
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    updateInfo: null,
    downloadProgress: null
  });
  
  const [updateHistory, setUpdateHistory] = useState({
    currentVersion: '',
    previousVersions: [],
    canRollback: false
  });
  
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);

  useEffect(() => {
    // Load update history on component mount
    const loadUpdateHistory = async () => {
      if (window.electronAPI) {
        try {
          const history = await window.electronAPI.getUpdateHistory();
          setUpdateHistory(history);
        } catch (error) {
          console.error('Failed to load update history:', error);
        }
      }
    };
    
    loadUpdateHistory();
    
    // Listen for update events from main process
    const handleUpdateChecking = () => {
      setUpdateState(prev => ({ ...prev, checking: true, error: null }));
      if (window.notificationSystem) {
        window.notificationSystem.info('Checking for updates...', 3000);
      }
    };

    const handleUpdateAvailable = (event, updateInfo) => {
      setUpdateState(prev => ({
        ...prev,
        checking: false,
        available: true,
        updateInfo
      }));
      setShowUpdateDialog(true);
    };

    const handleUpdateNotAvailable = (event, info) => {
      setUpdateState(prev => ({ ...prev, checking: false, available: false }));
      if (window.notificationSystem) {
        window.notificationSystem.success('You are using the latest version!', 3000);
      }
    };

    const handleUpdateError = (event, error) => {
      const errorMessage = error?.message || 'Unknown update error';
      setUpdateState(prev => ({
        ...prev,
        checking: false,
        downloading: false,
        error: errorMessage
      }));
      if (window.notificationSystem) {
        window.notificationSystem.error(`Update error: ${errorMessage}`);
      }
    };

    const handleDownloadProgress = (event, progress) => {
      setUpdateState(prev => ({
        ...prev,
        downloadProgress: progress
      }));
    };

    const handleUpdateDownloaded = (event, info) => {
      setUpdateState(prev => ({
        ...prev,
        downloading: false,
        downloaded: true,
        updateInfo: info
      }));
      setShowProgressDialog(false);
      setShowRestartDialog(true);
    };

    const handleMenuCheckUpdates = () => {
      checkForUpdates();
    };

    // Register IPC listeners
    if (window.electronAPI) {
      window.electronAPI.on('update-checking', handleUpdateChecking);
      window.electronAPI.on('update-available', handleUpdateAvailable);
      window.electronAPI.on('update-not-available', handleUpdateNotAvailable);
      window.electronAPI.on('update-error', handleUpdateError);
      window.electronAPI.on('update-download-progress', handleDownloadProgress);
      window.electronAPI.on('update-downloaded', handleUpdateDownloaded);
      window.electronAPI.on('menu-check-updates', handleMenuCheckUpdates);
    }

    return () => {
      // Cleanup listeners
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('update-checking');
        window.electronAPI.removeAllListeners('update-available');
        window.electronAPI.removeAllListeners('update-not-available');
        window.electronAPI.removeAllListeners('update-error');
        window.electronAPI.removeAllListeners('update-download-progress');
        window.electronAPI.removeAllListeners('update-downloaded');
        window.electronAPI.removeAllListeners('menu-check-updates');
      }
    };
  }, []);

  const checkForUpdates = async () => {
    if (!window.electronAPI) {
      if (window.notificationSystem) {
        window.notificationSystem.error('Update functionality not available');
      }
      return;
    }

    try {
      const result = await window.electronAPI.invoke('check-for-updates');
      if (!result.available && result.message) {
        if (window.notificationSystem) {
          window.notificationSystem.info(result.message, 3000);
        }
      }
    } catch (error) {
      const errorMessage = error?.message || 'Unknown error';
      if (window.notificationSystem) {
        window.notificationSystem.error(`Failed to check for updates: ${errorMessage}`);
      }
    }
  };

  const downloadUpdate = async () => {
    if (!window.electronAPI) return;

    setUpdateState(prev => ({ ...prev, downloading: true }));
    setShowUpdateDialog(false);
    setShowProgressDialog(true);

    try {
      const result = await window.electronAPI.invoke('download-update');
      if (result.success) {
        setUpdateState(prev => ({ ...prev, downloading: false, downloaded: true }));
        setShowProgressDialog(false);
        setShowRestartDialog(true);
      } else {
        throw new Error(result.message || 'Download failed');
      }
    } catch (error) {
      const errorMessage = error?.message || 'Download failed';
      setUpdateState(prev => ({ ...prev, downloading: false, error: errorMessage }));
      setShowProgressDialog(false);
      if (window.notificationSystem) {
        window.notificationSystem.error(`Download failed: ${errorMessage}`);
      }
    }
  };

  const installUpdate = async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.invoke('install-update');
      if (result.success) {
        // Update will restart the app
        if (window.notificationSystem) {
          window.notificationSystem.success('Update installed successfully!');
        }
      } else {
        throw new Error(result.message || 'Installation failed');
      }
    } catch (error) {
      const errorMessage = error?.message || 'Installation failed';
      if (window.notificationSystem) {
        window.notificationSystem.error(`Installation failed: ${errorMessage}`);
      }
    }
  };

  const rollbackUpdate = async () => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.rollbackUpdate();
      if (result.success) {
        if (window.notificationSystem) {
          window.notificationSystem.success('Rollback initiated. Application will restart.');
        }
        setShowRollbackDialog(false);
      } else {
        throw new Error(result.reason || 'Rollback failed');
      }
    } catch (error) {
      const errorMessage = error?.message || 'Rollback failed';
      if (window.notificationSystem) {
        window.notificationSystem.error(`Rollback failed: ${errorMessage}`);
      }
    }
  };

  const showUpdateHistory = () => {
    setShowRollbackDialog(true);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  return (
    <>
      {/* Update Available Dialog */}
      {showUpdateDialog && (
        <div className="modal-overlay update-modal-overlay">
          <div className="modal update-modal">
            <div className="modal-header">
              <h3>🎉 Update Available</h3>
              <button
                className="modal-close"
                onClick={() => setShowUpdateDialog(false)}
                aria-label="Close update dialog"
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="update-info">
                <p className="update-version">
                  <strong>Version {updateState.updateInfo?.version}</strong> is now available!
                </p>
                
                {updateState.updateInfo?.releaseDate && (
                  <p className="update-date">
                    Released: {new Date(updateState.updateInfo.releaseDate).toLocaleDateString()}
                  </p>
                )}
                
                {updateState.updateInfo?.releaseNotes && (
                  <div className="update-notes">
                    <h4>What's New:</h4>
                    <div className="release-notes">
                      {updateState.updateInfo.releaseNotes}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-actions">
              <button
                className="btn btn-tertiary"
                onClick={showUpdateHistory}
                title="View update history and rollback options"
              >
                History
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowUpdateDialog(false)}
              >
                Later
              </button>
              <button
                className="btn btn-primary"
                onClick={downloadUpdate}
                disabled={updateState.downloading}
              >
                Download Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Progress Dialog */}
      {showProgressDialog && (
        <div className="modal-overlay update-modal-overlay">
          <div className="modal update-modal">
            <div className="modal-header">
              <h3>📥 Downloading Update</h3>
            </div>
            
            <div className="modal-content">
              <div className="download-progress">
                <div className="progress-info">
                  <span className="progress-text">
                    {updateState.downloadProgress?.percent || 0}% complete
                  </span>
                  {updateState.downloadProgress && (
                    <span className="progress-details">
                      {formatBytes(updateState.downloadProgress.transferred)} / {formatBytes(updateState.downloadProgress.total)}
                      {updateState.downloadProgress.bytesPerSecond > 0 && (
                        <> • {formatSpeed(updateState.downloadProgress.bytesPerSecond)}</>
                      )}
                    </span>
                  )}
                </div>
                
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${updateState.downloadProgress?.percent || 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restart Dialog */}
      {showRestartDialog && (
        <div className="modal-overlay update-modal-overlay">
          <div className="modal update-modal">
            <div className="modal-header">
              <h3>✅ Update Ready</h3>
            </div>
            
            <div className="modal-content">
              <div className="update-ready">
                <p>
                  <strong>Update downloaded successfully!</strong>
                </p>
                <p>
                  The application will restart to complete the installation.
                  Make sure to save any ongoing work before proceeding.
                </p>
              </div>
            </div>
            
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowRestartDialog(false)}
              >
                Restart Later
              </button>
              <button
                className="btn btn-primary"
                onClick={installUpdate}
              >
                Restart Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback/History Dialog */}
      {showRollbackDialog && (
        <div className="modal-overlay update-modal-overlay">
          <div className="modal update-modal">
            <div className="modal-header">
              <h3>📋 Update History</h3>
              <button
                className="modal-close"
                onClick={() => setShowRollbackDialog(false)}
                aria-label="Close history dialog"
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="update-history">
                <div className="current-version">
                  <h4>Current Version</h4>
                  <p className="version-info">
                    <strong>{updateHistory.currentVersion}</strong>
                    <span className="version-status">• Active</span>
                  </p>
                </div>
                
                {updateHistory.previousVersions.length > 0 ? (
                  <div className="previous-versions">
                    <h4>Previous Versions</h4>
                    <div className="version-list">
                      {updateHistory.previousVersions.map((version, index) => (
                        <div key={index} className="version-item">
                          <span className="version-number">{version.version}</span>
                          <span className="version-date">
                            {new Date(version.date).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="no-history">
                    <p>No previous versions available for rollback.</p>
                  </div>
                )}
                
                {!updateHistory.canRollback && (
                  <div className="rollback-info">
                    <p className="info-text">
                      💡 Rollback functionality is currently not implemented.
                      This feature would allow you to restore a previous version
                      if issues occur after an update.
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowRollbackDialog(false)}
              >
                Close
              </button>
              {updateHistory.canRollback && updateHistory.previousVersions.length > 0 && (
                <button
                  className="btn btn-warning"
                  onClick={rollbackUpdate}
                  title="Rollback to previous version"
                >
                  Rollback
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UpdateNotification;