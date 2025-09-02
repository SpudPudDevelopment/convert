import React, { useState, useEffect } from 'react';
import './ErrorHandler.css';

/**
 * Error Handler Component
 * Displays and manages conversion errors with recovery options
 */
const ErrorHandler = ({ 
  error, 
  onRetry, 
  onSkip, 
  onAbort, 
  onManualIntervention,
  onDismiss 
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [recoveryAttempts, setRecoveryAttempts] = useState(0);

  useEffect(() => {
    if (error) {
      setRecoveryAttempts(0);
    }
  }, [error]);

  if (!error) {
    return null;
  }

  const getErrorIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'high':
        return '⚠️';
      case 'medium':
        return '⚠️';
      case 'low':
        return 'ℹ️';
      default:
        return '❌';
    }
  };

  const getErrorColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'error-critical';
      case 'high':
        return 'error-high';
      case 'medium':
        return 'error-medium';
      case 'low':
        return 'error-low';
      default:
        return 'error-medium';
    }
  };

  const getErrorTitle = (type) => {
    const titleMap = {
      'FILE_NOT_FOUND': 'File Not Found',
      'FILE_ACCESS_DENIED': 'Access Denied',
      'FILE_CORRUPTED': 'File Corrupted',
      'FILE_TOO_LARGE': 'File Too Large',
      'DISK_SPACE_INSUFFICIENT': 'Insufficient Disk Space',
      'UNSUPPORTED_INPUT_FORMAT': 'Unsupported Input Format',
      'UNSUPPORTED_OUTPUT_FORMAT': 'Unsupported Output Format',
      'CONVERSION_ENGINE_ERROR': 'Conversion Engine Error',
      'PROCESSING_TIMEOUT': 'Processing Timeout',
      'MEMORY_LIMIT_EXCEEDED': 'Memory Limit Exceeded',
      'AUDIO_CODEC_ERROR': 'Audio Codec Error',
      'VIDEO_CODEC_ERROR': 'Video Codec Error',
      'DOCUMENT_ENCRYPTED': 'Document Encrypted',
      'DOCUMENT_PASSWORD_REQUIRED': 'Password Required',
      'IMAGE_CORRUPTED': 'Image Corrupted',
      'USER_CANCELLED': 'Conversion Cancelled',
      'UNKNOWN_ERROR': 'Unknown Error'
    };

    return titleMap[type] || 'Conversion Error';
  };

  const getErrorDescription = (type, message) => {
    const descriptionMap = {
      'FILE_NOT_FOUND': 'The specified file could not be found. Please check the file path and try again.',
      'FILE_ACCESS_DENIED': 'Access to the file was denied. Please check file permissions.',
      'FILE_CORRUPTED': 'The file appears to be corrupted or damaged and cannot be processed.',
      'FILE_TOO_LARGE': 'The file is too large to process with current settings.',
      'DISK_SPACE_INSUFFICIENT': 'There is not enough disk space to complete the conversion.',
      'UNSUPPORTED_INPUT_FORMAT': 'The input file format is not supported for conversion.',
      'UNSUPPORTED_OUTPUT_FORMAT': 'The requested output format is not supported.',
      'CONVERSION_ENGINE_ERROR': 'An error occurred in the conversion engine.',
      'PROCESSING_TIMEOUT': 'The conversion took too long and timed out.',
      'MEMORY_LIMIT_EXCEEDED': 'The conversion requires more memory than available.',
      'AUDIO_CODEC_ERROR': 'An error occurred with the audio codec during conversion.',
      'VIDEO_CODEC_ERROR': 'An error occurred with the video codec during conversion.',
      'DOCUMENT_ENCRYPTED': 'The document is encrypted and requires a password.',
      'DOCUMENT_PASSWORD_REQUIRED': 'A password is required to access this document.',
      'IMAGE_CORRUPTED': 'The image file is corrupted and cannot be processed.',
      'USER_CANCELLED': 'The conversion was cancelled by the user.',
      'UNKNOWN_ERROR': 'An unexpected error occurred during conversion.'
    };

    return descriptionMap[type] || message || 'An error occurred during conversion.';
  };

  const getRecoveryOptions = (recoveryStrategies, retryable, userActionable) => {
    const options = [];

    if (retryable && recoveryAttempts < 3) {
      options.push({
        key: 'retry',
        label: 'Retry',
        action: () => {
          setRecoveryAttempts(prev => prev + 1);
          onRetry && onRetry();
        },
        primary: true
      });
    }

    if (recoveryStrategies.includes('retry_with_different_settings')) {
      options.push({
        key: 'retry_settings',
        label: 'Retry with Different Settings',
        action: () => onRetry && onRetry({ modifySettings: true }),
        primary: false
      });
    }

    if (recoveryStrategies.includes('fallback_format')) {
      options.push({
        key: 'fallback',
        label: 'Try Different Format',
        action: () => onRetry && onRetry({ fallbackFormat: true }),
        primary: false
      });
    }

    if (recoveryStrategies.includes('reduce_quality')) {
      options.push({
        key: 'reduce_quality',
        label: 'Reduce Quality',
        action: () => onRetry && onRetry({ reduceQuality: true }),
        primary: false
      });
    }

    if (recoveryStrategies.includes('skip_file')) {
      options.push({
        key: 'skip',
        label: 'Skip File',
        action: () => onSkip && onSkip(),
        primary: false
      });
    }

    if (userActionable) {
      options.push({
        key: 'manual',
        label: 'Manual Intervention',
        action: () => onManualIntervention && onManualIntervention(),
        primary: false
      });
    }

    options.push({
      key: 'abort',
      label: 'Abort Conversion',
      action: () => onAbort && onAbort(),
      primary: false,
      destructive: true
    });

    return options;
  };

  const recoveryOptions = getRecoveryOptions(
    error.recoveryStrategies || [],
    error.retryable,
    error.userActionable
  );

  return (
    <div className={`error-handler ${getErrorColor(error.severity || 'medium')}`}>
      <div className="error-header">
        <div className="error-icon">
          {getErrorIcon(error.severity || 'medium')}
        </div>
        <div className="error-content">
          <h3 className="error-title">
            {getErrorTitle(error.type || 'UNKNOWN_ERROR')}
          </h3>
          <p className="error-description">
            {getErrorDescription(error.type || 'UNKNOWN_ERROR', error.message)}
          </p>
        </div>
        <div className="error-actions">
          <button
            className="error-dismiss"
            onClick={() => onDismiss && onDismiss()}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="error-details">
        <button
          className="error-details-toggle"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>

        {showDetails && (
          <div className="error-details-content">
            <div className="error-detail">
              <strong>Error Type:</strong> {error.type || 'UNKNOWN_ERROR'}
            </div>
            <div className="error-detail">
              <strong>Severity:</strong> {error.severity || 'medium'}
            </div>
            <div className="error-detail">
              <strong>Retryable:</strong> {error.retryable ? 'Yes' : 'No'}
            </div>
            <div className="error-detail">
              <strong>User Action Required:</strong> {error.userActionable ? 'Yes' : 'No'}
            </div>
            {error.context && error.context.filePath && (
              <div className="error-detail">
                <strong>File:</strong> {error.context.filePath}
              </div>
            )}
            {error.timestamp && (
              <div className="error-detail">
                <strong>Time:</strong> {new Date(error.timestamp).toLocaleString()}
              </div>
            )}
            {recoveryAttempts > 0 && (
              <div className="error-detail">
                <strong>Recovery Attempts:</strong> {recoveryAttempts}/3
              </div>
            )}
          </div>
        )}
      </div>

      {recoveryOptions.length > 0 && (
        <div className="error-recovery">
          <h4>Recovery Options:</h4>
          <div className="error-recovery-options">
            {recoveryOptions.map(option => (
              <button
                key={option.key}
                className={`error-recovery-option ${option.primary ? 'primary' : ''} ${option.destructive ? 'destructive' : ''}`}
                onClick={option.action}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorHandler;
