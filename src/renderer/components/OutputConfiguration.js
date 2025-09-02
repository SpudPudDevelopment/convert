import React, { useState, useEffect, useCallback } from 'react';
import '../styles/OutputConfiguration.css';

const OutputConfiguration = ({
  selectedFiles = [],
  outputConfig = {},
  onConfigChange,
  disabled = false
}) => {
  const [outputDirectory, setOutputDirectory] = useState(outputConfig.outputDirectory || '');
  const [namingPattern, setNamingPattern] = useState(outputConfig.namingPattern || 'original');
  const [customSuffix, setCustomSuffix] = useState(outputConfig.customSuffix || '');
  const [conflictStrategy, setConflictStrategy] = useState(outputConfig.conflictStrategy || 'rename');
  const [preserveStructure, setPreserveStructure] = useState(outputConfig.preserveStructure || false);
  const [createSubfolders, setCreateSubfolders] = useState(outputConfig.createSubfolders || false);
  const [previewPaths, setPreviewPaths] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [availablePatterns, setAvailablePatterns] = useState({});

  // Load available naming patterns on mount
  useEffect(() => {
    const loadPatterns = async () => {
      try {
        const patterns = await window.electronAPI.getNamingPatterns();
        setAvailablePatterns(patterns);
      } catch (error) {
        console.error('Failed to load naming patterns:', error);
      }
    };
    loadPatterns();
  }, []);

  // Update preview when configuration changes
  useEffect(() => {
    if (selectedFiles.length > 0 && outputDirectory) {
      updatePreview();
    } else {
      setPreviewPaths([]);
    }
  }, [selectedFiles, outputDirectory, namingPattern, customSuffix, preserveStructure, createSubfolders]);

  // Notify parent of configuration changes
  useEffect(() => {
    if (onConfigChange) {
      const config = {
        outputDirectory,
        namingPattern,
        customSuffix,
        conflictStrategy,
        preserveStructure,
        createSubfolders,
        isValid: outputDirectory && !validationError
      };
      onConfigChange(config);
    }
  }, [outputDirectory, namingPattern, customSuffix, conflictStrategy, preserveStructure, createSubfolders, validationError, onConfigChange]);

  const selectOutputDirectory = async () => {
    try {
      const result = await window.electronAPI.selectOutputDirectory({
        title: 'Select Output Directory',
        defaultPath: outputDirectory
      });
      
      if (result.success && result.path) {
        setOutputDirectory(result.path);
        setValidationError('');
      } else if (result.error) {
        setValidationError(result.error);
      }
    } catch (error) {
      console.error('Failed to select output directory:', error);
      setValidationError('Failed to select directory');
    }
  };

  const validateOutputDirectory = async (path) => {
    if (!path) {
      setValidationError('');
      return;
    }

    setIsValidating(true);
    try {
      const validation = await window.electronAPI.validateOutputDirectory(path);
      if (validation.valid) {
        setValidationError('');
      } else {
        setValidationError(validation.error || 'Invalid directory');
      }
    } catch (error) {
      setValidationError('Failed to validate directory');
    } finally {
      setIsValidating(false);
    }
  };

  const updatePreview = async () => {
    if (!selectedFiles.length || !outputDirectory || !outputFormat) {
      return;
    }

    try {
      const inputPaths = selectedFiles.map(file => file.path);
      const variables = {
        ext: outputFormat,
        custom: customSuffix,
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0].replace(/-/g, '')
      };

      const preview = await window.electronAPI.previewOutputPaths(
        inputPaths,
        outputDirectory,
        namingPattern,
        variables
      );

      if (preview.success) {
        setPreviewPaths(preview.previews || []);
      } else {
        console.error('Failed to generate preview:', preview.error);
        setPreviewPaths([]);
      }
    } catch (error) {
      console.error('Error updating preview:', error);
      setPreviewPaths([]);
    }
  };

  const handleDirectoryChange = (e) => {
    const path = e.target.value;
    setOutputDirectory(path);
    validateOutputDirectory(path);
  };

  const getNamingPatternOptions = () => {
    const patterns = availablePatterns.patterns || {};
    return [
      { value: 'original', label: 'Original Name', description: 'Keep original filename' },
      { value: 'timestamp', label: 'With Timestamp', description: 'Add timestamp to filename' },
      { value: 'date', label: 'With Date', description: 'Add current date to filename' },
      { value: 'sequence', label: 'With Sequence', description: 'Add sequential number to filename' },
      { value: 'custom', label: 'Custom Pattern', description: 'Use custom suffix' }
    ];
  };

  const getConflictStrategyOptions = () => [
    { value: 'auto-rename', label: 'Auto-rename', description: 'Automatically rename conflicting files' },
    { value: 'overwrite', label: 'Overwrite', description: 'Replace existing files' },
    { value: 'skip', label: 'Skip', description: 'Skip files that would conflict' },
    { value: 'prompt', label: 'Ask Each Time', description: 'Prompt for each conflict' }
  ];

  return (
    <div className="output-configuration">
      <h3>Output Configuration</h3>
      
      {/* Output Directory Selection */}
      <div className="config-section">
        <label className="config-label">
          Output Directory
          <span className="required">*</span>
        </label>
        <div className="directory-selector">
          <input
            type="text"
            value={outputDirectory}
            onChange={handleDirectoryChange}
            placeholder="Select output directory..."
            className={`directory-input ${validationError ? 'error' : ''}`}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={selectOutputDirectory}
            className="browse-btn"
            disabled={disabled}
          >
            Browse
          </button>
        </div>
        {isValidating && (
          <div className="validation-status">Validating directory...</div>
        )}
        {validationError && (
          <div className="validation-error">{validationError}</div>
        )}
      </div>

      {/* File Naming Pattern */}
      <div className="config-section">
        <label className="config-label">
          File Naming Pattern
        </label>
        <select
          value={namingPattern}
          onChange={(e) => setNamingPattern(e.target.value)}
          className="pattern-select"
          disabled={disabled}
        >
          {getNamingPatternOptions().map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pattern-description">
          {getNamingPatternOptions().find(opt => opt.value === namingPattern)?.description}
        </div>
        
        {namingPattern === 'custom' && (
          <input
            type="text"
            value={customSuffix}
            onChange={(e) => setCustomSuffix(e.target.value)}
            placeholder="Enter custom suffix..."
            className="custom-suffix-input"
            disabled={disabled}
          />
        )}
      </div>

      {/* Conflict Resolution */}
      <div className="config-section">
        <label className="config-label">
          File Conflict Resolution
        </label>
        <select
          value={conflictStrategy}
          onChange={(e) => setConflictStrategy(e.target.value)}
          className="conflict-select"
          disabled={disabled}
        >
          {getConflictStrategyOptions().map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="strategy-description">
          {getConflictStrategyOptions().find(opt => opt.value === conflictStrategy)?.description}
        </div>
      </div>

      {/* Advanced Options */}
      <div className="config-section">
        <label className="config-label">
          Advanced Options
        </label>
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preserveStructure}
              onChange={(e) => setPreserveStructure(e.target.checked)}
              disabled={disabled}
            />
            <span className="checkbox-text">
              Preserve directory structure
            </span>
          </label>
        </div>
      </div>

      {/* Output Preview */}
      {previewPaths.length > 0 && (
        <div className="config-section">
          <label className="config-label">
            Output Preview
          </label>
          <div className="preview-container">
            {previewPaths.slice(0, 5).map((preview, index) => (
              <div key={index} className="preview-item">
                <div className="preview-input">
                  {selectedFiles[index]?.name || 'Unknown file'}
                </div>
                <div className="preview-arrow">→</div>
                <div className={`preview-output ${preview.success ? '' : 'error'}`}>
                  {preview.success ? preview.output.split('/').pop() : 'Error'}
                </div>
              </div>
            ))}
            {previewPaths.length > 5 && (
              <div className="preview-more">
                ... and {previewPaths.length - 5} more files
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OutputConfiguration;