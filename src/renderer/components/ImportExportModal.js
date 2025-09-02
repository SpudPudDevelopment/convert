import React, { useState, useEffect } from 'react';
import { UserPreferences } from '../models/UserPreferences.js';

/**
 * Enhanced Import/Export Modal Component
 * Provides advanced options, progress indicators, and detailed feedback
 */
const ImportExportModal = ({ 
  isOpen, 
  onClose, 
  mode, // 'import' or 'export' - defaults to 'export'
  onExport, 
  onImport,
  onImportComplete,
  onExportComplete,
  preferences 
}) => {
  const [activeTab, setActiveTab] = useState(mode || 'export'); // Default to export
  const [step, setStep] = useState(1); // 1: options, 2: progress, 3: complete
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  
  // Export options
  const [exportOptions, setExportOptions] = useState({
    sections: {
      general: true,
      appearance: true,
      conversion: true,
      notifications: true,
      advanced: false
    },
    includePresets: true,
    includeRecentJobs: false,
    includeStatistics: false,
    format: 'json',
    compression: false
  });
  
  // Import options
  const [importOptions, setImportOptions] = useState({
    strategy: 'merge', // 'replace', 'merge', 'selective'
    sections: {
      general: true,
      appearance: true,
      conversion: true,
      notifications: true,
      advanced: false
    },
    mergePresets: true,
    overwriteSettings: false,
    createBackup: true,
    validateData: true
  });
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setProgress(0);
      setStatus('');
      setError(null);
      setPreviewData(null);
      setSelectedFile(null);
      setImportPreview(null);
      setActiveTab(mode || 'export');
    }
  }, [isOpen, mode]);

  // Handle file selection and validation
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setSelectedFile(file);
    setError(null);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate import data structure
      if (!data.preferences && !data.presets && !data.savedPresets) {
        throw new Error('Invalid preferences file format');
      }
      
      // Enhanced validation for preferences structure
      if (data.preferences) {
        // Check if preferences sections are objects
        for (const [section, value] of Object.entries(data.preferences)) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            throw new Error(`Invalid preferences structure: ${section} must be an object`);
          }
        }
        
        // Check for invalid fields
        const validSections = ['general', 'appearance', 'conversion', 'notifications', 'advanced'];
        const invalidSections = Object.keys(data.preferences).filter(section => 
          !validSections.includes(section)
        );
        
        if (invalidSections.length > 0) {
          throw new Error(`Invalid preferences sections: ${invalidSections.join(', ')}`);
        }
      }
      
      setPreviewData(data);
      setImportPreview({
        new: data.presets ? data.presets.map(p => p.name) : [],
        modified: [],
        unchanged: data.preferences ? Object.keys(data.preferences) : []
      });
      
    } catch (err) {
      setError(`Invalid file: ${err.message}`);
      setSelectedFile(null);
      setPreviewData(null);
      setImportPreview(null);
    }
  };

  // Handle export process
  const handleExport = async () => {
    setStep(2);
    setProgress(0);
    setStatus('Preparing export...');
    
    try {
      // Simulate progress steps
      const steps = [
        { progress: 20, status: 'Collecting preferences...' },
        { progress: 40, status: 'Processing settings...' },
        { progress: 60, status: 'Generating export data...' },
        { progress: 80, status: 'Creating file...' },
        { progress: 100, status: 'Export complete!' }
      ];
      
      for (const stepData of steps) {
        await new Promise(resolve => setTimeout(resolve, 50));
        setProgress(stepData.progress);
        setStatus(stepData.status);
      }
      
      // Perform actual export
      let exportData;
      if (onExport) {
        exportData = await onExport({
          sections: Object.keys(exportOptions.sections).filter(
            key => exportOptions.sections[key]
          ),
          includePresets: exportOptions.includePresets,
          includeRecentJobs: exportOptions.includeRecentJobs,
          includeStatistics: exportOptions.includeStatistics,
          format: exportOptions.format
        });
      } else {
        exportData = {
          preferences: preferences,
          presets: exportOptions.includePresets ? [] : [], // TODO: Get actual presets
          recentJobs: exportOptions.includeRecentJobs ? [] : [], // TODO: Get actual recent jobs
          statistics: exportOptions.includeStatistics ? {} : {}, // TODO: Get actual statistics
          exportDate: new Date().toISOString(),
          version: '1.0.0'
        };
      }
      
      // Ensure we have valid data to export
      if (!exportData) {
        throw new Error('Export failed: No data returned from export function');
      }
      
      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `convert-preferences-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setStep(3);
      setStatus('Export completed successfully!');
      
      // Call completion callback if provided
      if (onExportComplete) {
        onExportComplete();
      }
      
    } catch (err) {
      setError(`Export failed: ${err.message}`);
      setStep(1);
    }
  };

  // Handle import process
  const handleImport = async () => {
    if (!previewData) {
      setError('No file selected or preview data unavailable');
      return;
    }
    
    setStep(2);
    setProgress(0);
    setStatus('Preparing import...');
    
    try {
      // Simulate progress steps
      const steps = [
        { progress: 15, status: 'Validating data...' },
        { progress: 30, status: 'Creating backup...' },
        { progress: 50, status: 'Processing preferences...' },
        { progress: 70, status: 'Merging settings...' },
        { progress: 90, status: 'Applying changes...' },
        { progress: 100, status: 'Import complete!' }
      ];
      
      for (const stepData of steps) {
        await new Promise(resolve => setTimeout(resolve, 50));
        setProgress(stepData.progress);
        setStatus(stepData.status);
      }
      
      // Perform actual import
      try {
        if (onImport) {
          await onImport(previewData, {
            strategy: importOptions.strategy,
            sections: Object.keys(importOptions.sections).filter(
              key => importOptions.sections[key]
            ),
            mergePresets: importOptions.mergePresets,
            overwriteSettings: importOptions.overwriteSettings,
            createBackup: importOptions.createBackup,
            validateData: importOptions.validateData
          });
        }
        
        setStep(3);
        setStatus('Import completed successfully!');
        
        // Call completion callback if provided
        if (onImportComplete) {
          onImportComplete();
        }
      } catch (err) {
        setError(`Import failed: ${err.message}`);
        setStep(1);
        throw err;
      }
      
    } catch (err) {
      setError(`Import failed: ${err.message}`);
      setStep(1);
    }
  };

  // Handle section toggle
  const toggleSection = (section, optionsType = 'exportOptions') => {
    const options = optionsType === 'exportOptions' ? exportOptions : importOptions;
    const setOptions = optionsType === 'exportOptions' ? setExportOptions : setImportOptions;
    
    setOptions({
      ...options,
      sections: {
        ...options.sections,
        [section]: !options.sections[section]
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="import-export-modal">
        <div className="modal-header">
          <h2>Import/Export Settings</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        
        <div className="modal-content">
          {step === 1 && (
            <div className="options-step">
              {/* Tab Navigation */}
              <div className="tab-navigation">
                <button 
                  className={`tab-button ${activeTab === 'export' ? 'active' : ''}`}
                  onClick={() => setActiveTab('export')}
                >
                  Export
                </button>
                <button 
                  className={`tab-button ${activeTab === 'import' ? 'active' : ''}`}
                  onClick={() => setActiveTab('import')}
                >
                  Import
                </button>
              </div>
              
              {/* Tab Content */}
              {activeTab === 'export' ? (
                <ExportOptions 
                  options={exportOptions}
                  setOptions={setExportOptions}
                  toggleSection={toggleSection}
                  onNext={handleExport}
                />
              ) : (
                <ImportOptions 
                  options={importOptions}
                  setOptions={setImportOptions}
                  toggleSection={toggleSection}
                  selectedFile={selectedFile}
                  onFileSelect={handleFileSelect}
                  importPreview={importPreview}
                  error={error}
                  onNext={handleImport}
                />
              )}
            </div>
          )}
          
          {step === 2 && (
            <div className="progress-step">
              <div className="progress-container">
                <div className="progress-circle">
                  <svg className="progress-ring" width="120" height="120">
                    <circle
                      className="progress-ring-circle"
                      stroke="#e0e0e0"
                      strokeWidth="8"
                      fill="transparent"
                      r="52"
                      cx="60"
                      cy="60"
                    />
                    <circle
                      className="progress-ring-circle progress"
                      stroke="#4CAF50"
                      strokeWidth="8"
                      fill="transparent"
                      r="52"
                      cx="60"
                      cy="60"
                      style={{
                        strokeDasharray: `${2 * Math.PI * 52}`,
                        strokeDashoffset: `${2 * Math.PI * 52 * (1 - progress / 100)}`,
                        transition: 'stroke-dashoffset 0.3s ease'
                      }}
                    />
                  </svg>
                  <div className="progress-text">
                    <span className="progress-percentage">{progress}%</span>
                  </div>
                </div>
                <div className="progress-status">
                  <p>{status}</p>
                </div>
              </div>
            </div>
          )}
          
          {step === 3 && (
            <div className="complete-step">
              <div className="success-icon">✅</div>
              <h3>Operation Completed</h3>
              <p>{status}</p>
              <button className="primary-button" onClick={onClose}>
                Done
              </button>
            </div>
          )}
          
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Export Options Component
const ExportOptions = ({ options, setOptions, toggleSection, onNext }) => {
  const sections = [
    { key: 'general', label: 'General Settings', icon: '⚙️' },
    { key: 'appearance', label: 'Appearance', icon: '🎨' },
    { key: 'conversion', label: 'Conversion', icon: '🔄' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'advanced', label: 'Advanced', icon: '🔧' }
  ];

  return (
    <div className="export-options">
      <h3>Export Options</h3>
      
      <div className="option-group">
        <h4>Sections to Export</h4>
        <div className="section-list">
          <label className="section-item">
            <input
              type="checkbox"
              checked={Object.values(options.sections).every(v => v)}
              onChange={(e) => {
                const newValue = e.target.checked;
                setOptions({
                  ...options,
                  sections: Object.keys(options.sections).reduce((acc, key) => {
                    acc[key] = newValue;
                    return acc;
                  }, {})
                });
              }}
            />
            <span className="section-icon">📋</span>
            <span className="section-label">All Settings</span>
          </label>
          {sections.map(section => (
            <label key={section.key} className="section-item">
              <input
                type="checkbox"
                checked={options.sections[section.key]}
                onChange={() => toggleSection(section.key)}
              />
              <span className="section-icon">{section.icon}</span>
              <span className="section-label">{section.label}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div className="option-group">
        <h4>Additional Data</h4>
        <label className="option-item">
          <input
            type="checkbox"
            checked={options.includePresets}
            onChange={(e) => setOptions({...options, includePresets: e.target.checked})}
          />
          <span>Presets Only</span>
        </label>
        <label className="option-item">
          <input
            type="checkbox"
            checked={options.includeRecentJobs}
            onChange={(e) => setOptions({...options, includeRecentJobs: e.target.checked})}
          />
          <span>Recent Jobs</span>
        </label>
        <label className="option-item">
          <input
            type="checkbox"
            checked={options.includeStatistics}
            onChange={(e) => setOptions({...options, includeStatistics: e.target.checked})}
          />
          <span>Usage Statistics</span>
        </label>
      </div>
      
      <div className="option-group">
        <h4>Export Format</h4>
        <div className="format-options">
          <label className="format-item">
            <input
              type="radio"
              name="format"
              value="json"
              checked={options.format === 'json'}
              onChange={(e) => setOptions({...options, format: e.target.value})}
            />
            <span>JSON (Recommended)</span>
          </label>
        </div>
      </div>
      
      <div className="modal-actions">
        <button className="primary-button" onClick={onNext}>
          Export Settings
        </button>
      </div>
    </div>
  );
};

// Import Options Component
const ImportOptions = ({ 
  options, 
  setOptions, 
  toggleSection, 
  selectedFile, 
  onFileSelect, 
  importPreview, 
  error, 
  onNext 
}) => {
  const sections = [
    { key: 'general', label: 'General Settings', icon: '⚙️' },
    { key: 'appearance', label: 'Appearance', icon: '🎨' },
    { key: 'conversion', label: 'Conversion', icon: '🔄' },
    { key: 'notifications', label: 'Notifications', icon: '🔔' },
    { key: 'advanced', label: 'Advanced', icon: '🔧' }
  ];

  return (
    <div className="import-options">
      <h3>Import Options</h3>
      
      <div className="option-group">
        <h4>Select File</h4>
        <div className="file-input-container">
          <label className="file-input-label">
            <input
              type="file"
              accept=".json"
              onChange={onFileSelect}
              style={{ display: 'none' }}
            />
            <span className="file-input-button">
              {selectedFile ? selectedFile.name : 'Choose preferences file...'}
            </span>
          </label>
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
      
      {importPreview && (
        <div className="option-group">
          <h4>Import Preview</h4>
          <div className="import-preview">
            {importPreview.new.length > 0 && (
              <div className="preview-section">
                <h5>New Items ({importPreview.new.length})</h5>
                <ul>
                  {importPreview.new.map((item, index) => (
                    <li key={index} className="new-item">+ {item}</li>
                  ))}
                </ul>
              </div>
            )}
            {importPreview.modified.length > 0 && (
              <div className="preview-section">
                <h5>Modified Items ({importPreview.modified.length})</h5>
                <ul>
                  {importPreview.modified.map((item, index) => (
                    <li key={index} className="modified-item">~ {item}</li>
                  ))}
                </ul>
              </div>
            )}
            {importPreview.unchanged.length > 0 && (
              <div className="preview-section">
                <h5>Unchanged Items ({importPreview.unchanged.length})</h5>
                <ul>
                  {importPreview.unchanged.slice(0, 3).map((item, index) => (
                    <li key={index} className="unchanged-item">= {item}</li>
                  ))}
                  {importPreview.unchanged.length > 3 && (
                    <li className="more-items">... and {importPreview.unchanged.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="option-group">
        <h4>Merge Strategy</h4>
        <div className="strategy-options">
          <label className="strategy-item">
            <input
              type="radio"
              name="strategy"
              value="merge"
              checked={options.strategy === 'merge'}
              onChange={(e) => setOptions({...options, strategy: e.target.value})}
            />
            <div className="strategy-content">
              <span className="strategy-title">Merge (Recommended)</span>
              <span className="strategy-description">Combine with existing preferences</span>
            </div>
          </label>
          <label className="strategy-item">
            <input
              type="radio"
              name="strategy"
              value="replace"
              checked={options.strategy === 'replace'}
              onChange={(e) => setOptions({...options, strategy: e.target.value})}
            />
            <div className="strategy-content">
              <span className="strategy-title">Replace All</span>
              <span className="strategy-description">Replace all current preferences</span>
            </div>
          </label>
          <label className="strategy-item">
            <input
              type="radio"
              name="strategy"
              value="selective"
              checked={options.strategy === 'selective'}
              onChange={(e) => setOptions({...options, strategy: e.target.value})}
            />
            <div className="strategy-content">
              <span className="strategy-title">Selective</span>
              <span className="strategy-description">Import only selected sections</span>
            </div>
          </label>
        </div>
      </div>
      
      {options.strategy === 'selective' && (
        <div className="option-group">
          <h4>Select sections to import:</h4>
          <div className="section-list">
            {sections.map(section => (
              <label key={section.key} className="section-item">
                <input
                  type="checkbox"
                  checked={options.sections[section.key]}
                  onChange={() => toggleSection(section.key, 'importOptions')}
                />
                <span className="section-icon">{section.icon}</span>
                <span className="section-label">{section.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      
      <div className="option-group">
        <h4>Import Settings</h4>
        <label className="option-item">
          <input
            type="checkbox"
            checked={options.createBackup}
            onChange={(e) => setOptions({...options, createBackup: e.target.checked})}
          />
          <span>Create backup before import</span>
        </label>
        <label className="option-item">
          <input
            type="checkbox"
            checked={options.mergePresets}
            onChange={(e) => setOptions({...options, mergePresets: e.target.checked})}
          />
          <span>Merge conversion presets</span>
        </label>
        <label className="option-item">
          <input
            type="checkbox"
            checked={options.validateData}
            onChange={(e) => setOptions({...options, validateData: e.target.checked})}
          />
          <span>Validate imported data</span>
        </label>
      </div>
      
      <div className="modal-actions">
        <button 
          className="primary-button" 
          onClick={onNext}
          disabled={!selectedFile}
        >
          Import Preferences
        </button>
      </div>
    </div>
  );
};

export default ImportExportModal;