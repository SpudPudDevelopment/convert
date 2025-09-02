import React, { useState, useEffect } from 'react';
import './PrivacySettings.css';

const PrivacySettings = ({ isOpen, onClose }) => {
  const [crashReportingStatus, setCrashReportingStatus] = useState({
    isEnabled: false,
    hasConsent: false,
    isInitialized: false
  });
  const [permissionStatus, setPermissionStatus] = useState({
    fileSystem: 'unknown',
    camera: 'unknown',
    microphone: 'unknown'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadPrivacyStatus();
    }

    // Listen for custom event to open settings
    const handleOpenSettings = () => {
      setIsOpen(true);
    };

    window.addEventListener('openPrivacySettings', handleOpenSettings);

    return () => {
      window.removeEventListener('openPrivacySettings', handleOpenSettings);
    };
  }, [isOpen]);

  const loadPrivacyStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load crash reporting status
      const crashStatus = await window.electronAPI.getCrashReportingStatus();
      setCrashReportingStatus(crashStatus);
      
      // Load permission status
      const permStatus = await window.electronAPI.getPermissionStatus();
      setPermissionStatus(permStatus);
    } catch (err) {
      console.error('Failed to load privacy status:', err);
      setError('Failed to load privacy settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCrashReportingToggle = async (enabled) => {
    try {
      setLoading(true);
      await window.electronAPI.updateCrashReportingConsent(enabled);
      
      // Reload status to reflect changes
      const updatedStatus = await window.electronAPI.getCrashReportingStatus();
      setCrashReportingStatus(updatedStatus);
      
      // Add breadcrumb for this action
      await window.electronAPI.addBreadcrumb(
        `Crash reporting ${enabled ? 'enabled' : 'disabled'}`,
        { userAction: true, timestamp: new Date().toISOString() }
      );
    } catch (err) {
      console.error('Failed to update crash reporting consent:', err);
      setError('Failed to update crash reporting settings.');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionRequest = async (permissionType) => {
    try {
      setLoading(true);
      let result;
      
      switch (permissionType) {
        case 'fileSystem':
          result = await window.electronAPI.requestFileSystemPermissions();
          break;
        case 'camera':
          result = await window.electronAPI.requestCameraPermissions();
          break;
        case 'microphone':
          result = await window.electronAPI.requestMicrophonePermissions();
          break;
        default:
          throw new Error(`Unknown permission type: ${permissionType}`);
      }
      
      if (result.success) {
        // Reload permission status
        const updatedStatus = await window.electronAPI.getPermissionStatus();
        setPermissionStatus(updatedStatus);
      } else {
        setError(`Failed to request ${permissionType} permission: ${result.error}`);
      }
    } catch (err) {
      console.error(`Failed to request ${permissionType} permission:`, err);
      setError(`Failed to request ${permissionType} permission.`);
    } finally {
      setLoading(false);
    }
  };

  const handleShowTroubleshooting = async (permissionType) => {
    try {
      await window.electronAPI.showPermissionTroubleshooting(permissionType);
    } catch (err) {
      console.error('Failed to show troubleshooting:', err);
      setError('Failed to show troubleshooting information.');
    }
  };

  const getPermissionStatusText = (status) => {
    switch (status) {
      case 'granted': return 'Granted';
      case 'denied': return 'Denied';
      case 'unknown': return 'Unknown';
      default: return 'Unknown';
    }
  };

  const getPermissionStatusClass = (status) => {
    switch (status) {
      case 'granted': return 'permission-granted';
      case 'denied': return 'permission-denied';
      case 'unknown': return 'permission-unknown';
      default: return 'permission-unknown';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="privacy-settings-overlay">
      <div className="privacy-settings-dialog">
        <div className="privacy-settings-header">
          <h2>Privacy & Permissions</h2>
          <button 
            className="close-button"
            onClick={onClose}
            aria-label="Close privacy settings"
          >
            ×
          </button>
        </div>
        
        {error && (
          <div className="privacy-error">
            <span className="error-icon">⚠️</span>
            {error}
            <button 
              className="error-dismiss"
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
        )}
        
        <div className="privacy-settings-content">
          {loading && (
            <div className="privacy-loading">
              <div className="loading-spinner"></div>
              <span>Loading privacy settings...</span>
            </div>
          )}
          
          {/* Crash Reporting Section */}
          <section className="privacy-section">
            <h3>Crash Reporting</h3>
            <p className="section-description">
              Help improve the application by automatically sending crash reports. 
              No personal information is collected.
            </p>
            
            <div className="setting-item">
              <div className="setting-info">
                <label htmlFor="crash-reporting-toggle">Enable Crash Reporting</label>
                <span className="setting-status">
                  Status: {crashReportingStatus.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="setting-control">
                <label className="toggle-switch">
                  <input
                    id="crash-reporting-toggle"
                    type="checkbox"
                    checked={crashReportingStatus.hasConsent}
                    onChange={(e) => handleCrashReportingToggle(e.target.checked)}
                    disabled={loading}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
            
            <div className="privacy-note">
              <strong>What we collect:</strong> Error messages, stack traces, and basic system information. 
              We do not collect personal files, user data, or IP addresses.
            </div>
          </section>
          
          {/* Permissions Section */}
          <section className="privacy-section">
            <h3>System Permissions</h3>
            <p className="section-description">
              Manage system permissions required for the application to function properly.
            </p>
            
            {/* File System Permission */}
            <div className="permission-item">
              <div className="permission-info">
                <h4>File System Access</h4>
                <p>Required for reading and writing files during conversion.</p>
                <span className={`permission-status ${getPermissionStatusClass(permissionStatus.fileSystem)}`}>
                  {getPermissionStatusText(permissionStatus.fileSystem)}
                </span>
              </div>
              <div className="permission-actions">
                {permissionStatus.fileSystem !== 'granted' && (
                  <button 
                    className="permission-button request"
                    onClick={() => handlePermissionRequest('fileSystem')}
                    disabled={loading}
                  >
                    Request Permission
                  </button>
                )}
                <button 
                  className="permission-button help"
                  onClick={() => handleShowTroubleshooting('fileSystem')}
                >
                  Help
                </button>
              </div>
            </div>
            
            {/* Camera Permission */}
            <div className="permission-item">
              <div className="permission-info">
                <h4>Camera Access</h4>
                <p>Optional: For capturing images or video content.</p>
                <span className={`permission-status ${getPermissionStatusClass(permissionStatus.camera)}`}>
                  {getPermissionStatusText(permissionStatus.camera)}
                </span>
              </div>
              <div className="permission-actions">
                {permissionStatus.camera !== 'granted' && (
                  <button 
                    className="permission-button request"
                    onClick={() => handlePermissionRequest('camera')}
                    disabled={loading}
                  >
                    Request Permission
                  </button>
                )}
                <button 
                  className="permission-button help"
                  onClick={() => handleShowTroubleshooting('camera')}
                >
                  Help
                </button>
              </div>
            </div>
            
            {/* Microphone Permission */}
            <div className="permission-item">
              <div className="permission-info">
                <h4>Microphone Access</h4>
                <p>Optional: For recording audio content.</p>
                <span className={`permission-status ${getPermissionStatusClass(permissionStatus.microphone)}`}>
                  {getPermissionStatusText(permissionStatus.microphone)}
                </span>
              </div>
              <div className="permission-actions">
                {permissionStatus.microphone !== 'granted' && (
                  <button 
                    className="permission-button request"
                    onClick={() => handlePermissionRequest('microphone')}
                    disabled={loading}
                  >
                    Request Permission
                  </button>
                )}
                <button 
                  className="permission-button help"
                  onClick={() => handleShowTroubleshooting('microphone')}
                >
                  Help
                </button>
              </div>
            </div>
          </section>
        </div>
        
        <div className="privacy-settings-footer">
          <button 
            className="privacy-button secondary"
            onClick={loadPrivacyStatus}
            disabled={loading}
          >
            Refresh Status
          </button>
          <button 
            className="privacy-button primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;