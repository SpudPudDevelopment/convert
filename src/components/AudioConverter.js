import React, { useState, useEffect, useCallback } from 'react';

const AudioConverter = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [outputFormat, setOutputFormat] = useState('mp3');
  const [outputDirectory, setOutputDirectory] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState({});
  const [supportedFormats, setSupportedFormats] = useState([]);
  const [audioSettings, setAudioSettings] = useState({
    bitrate: '128k',
    sampleRate: '44100',
    channels: '2'
  });
  const [errors, setErrors] = useState([]);
  const [completedConversions, setCompletedConversions] = useState([]);

  // Initialize audio conversion service
  useEffect(() => {
    const initializeService = async () => {
      try {
        await window.electronAPI.initializeAudioConversion();
        const formats = await window.electronAPI.getSupportedAudioFormats();
        setSupportedFormats(formats);
        const defaultSettings = await window.electronAPI.getDefaultAudioSettings();
        setAudioSettings(defaultSettings);
      } catch (error) {
        console.error('Failed to initialize audio conversion service:', error);
        setErrors(prev => [...prev, 'Failed to initialize audio conversion service']);
      }
    };

    initializeService();
  }, []);

  // Handle file selection
  const handleFileSelect = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Audio Files', extensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filesWithInfo = await Promise.all(
          result.filePaths.map(async (filePath) => {
            try {
              const audioInfo = await window.electronAPI.getAudioInfo(filePath);
              return {
                path: filePath,
                name: filePath.split('/').pop(),
                ...audioInfo
              };
            } catch (error) {
              console.error(`Failed to get audio info for ${filePath}:`, error);
              return {
                path: filePath,
                name: filePath.split('/').pop(),
                error: 'Failed to read audio information'
              };
            }
          })
        );
        setSelectedFiles(filesWithInfo);
      }
    } catch (error) {
      console.error('Error selecting files:', error);
      setErrors(prev => [...prev, 'Error selecting files']);
    }
  };

  // Handle output directory selection
  const handleOutputDirectorySelect = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        setOutputDirectory(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error selecting output directory:', error);
      setErrors(prev => [...prev, 'Error selecting output directory']);
    }
  };

  // Handle conversion progress
  const handleConversionProgress = useCallback((data) => {
    setConversionProgress(prev => ({
      ...prev,
      [data.fileId]: data.progress
    }));
  }, []);

  // Handle conversion completion
  const handleConversionComplete = useCallback((data) => {
    setCompletedConversions(prev => [...prev, data]);
    setConversionProgress(prev => {
      const updated = { ...prev };
      delete updated[data.fileId];
      return updated;
    });
  }, []);

  // Handle conversion errors
  const handleConversionError = useCallback((data) => {
    setErrors(prev => [...prev, `Conversion failed for ${data.fileName}: ${data.error}`]);
    setConversionProgress(prev => {
      const updated = { ...prev };
      delete updated[data.fileId];
      return updated;
    });
  }, []);

  // Set up event listeners
  useEffect(() => {
    const removeProgressListener = window.electronAPI.onConversionProgress(handleConversionProgress);
    const removeCompleteListener = window.electronAPI.onConversionComplete(handleConversionComplete);
    const removeErrorListener = window.electronAPI.onConversionError(handleConversionError);

    return () => {
      removeProgressListener();
      removeCompleteListener();
      removeErrorListener();
    };
  }, [handleConversionProgress, handleConversionComplete, handleConversionError]);

  // Start conversion
  const handleStartConversion = async () => {
    if (selectedFiles.length === 0) {
      setErrors(prev => [...prev, 'Please select audio files to convert']);
      return;
    }

    if (!outputDirectory) {
      setErrors(prev => [...prev, 'Please select an output directory']);
      return;
    }

    setIsConverting(true);
    setErrors([]);
    setCompletedConversions([]);

    try {
      for (const file of selectedFiles) {
        if (file.error) {
          setErrors(prev => [...prev, `Skipping ${file.name}: ${file.error}`]);
          continue;
        }

        const outputFileName = `${file.name.split('.')[0]}.${outputFormat}`;
        const outputPath = `${outputDirectory}/${outputFileName}`;

        await window.electronAPI.convertAudio(file.path, outputPath, {
          format: outputFormat,
          ...audioSettings,
          fileId: file.path
        });
      }
    } catch (error) {
      console.error('Conversion error:', error);
      setErrors(prev => [...prev, 'Conversion process failed']);
    } finally {
      setIsConverting(false);
    }
  };

  // Remove file from selection
  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Clear errors
  const clearErrors = () => {
    setErrors([]);
  };

  return (
    <div className="audio-converter">
      <div className="audio-converter-header">
        <h2>Audio Converter</h2>
        <p>Convert audio files between different formats</p>
      </div>

      <div className="audio-converter-content">
        {/* File Selection */}
        <div className="section">
          <h3>Select Audio Files</h3>
          <button 
            className="btn btn-primary" 
            onClick={handleFileSelect}
            disabled={isConverting}
          >
            Choose Files
          </button>
          
          {selectedFiles.length > 0 && (
            <div className="selected-files">
              <h4>Selected Files ({selectedFiles.length})</h4>
              <div className="file-list">
                {selectedFiles.map((file, index) => (
                  <div key={index} className={`file-item ${file.error ? 'error' : ''}`}>
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      {file.duration && (
                        <span className="file-details">
                          {file.format} • {file.duration}s • {file.bitrate}
                        </span>
                      )}
                      {file.error && (
                        <span className="file-error">{file.error}</span>
                      )}
                    </div>
                    <button 
                      className="btn btn-small btn-danger"
                      onClick={() => removeFile(index)}
                      disabled={isConverting}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Output Settings */}
        <div className="section">
          <h3>Output Settings</h3>
          
          <div className="settings-grid">
            <div className="setting-group">
              <label htmlFor="output-format">Output Format</label>
              <select 
                id="output-format"
                value={outputFormat} 
                onChange={(e) => setOutputFormat(e.target.value)}
                disabled={isConverting}
              >
                {supportedFormats.map(format => (
                  <option key={format} value={format}>{format.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="setting-group">
              <label htmlFor="bitrate">Bitrate</label>
              <select 
                id="bitrate"
                value={audioSettings.bitrate} 
                onChange={(e) => setAudioSettings(prev => ({ ...prev, bitrate: e.target.value }))}
                disabled={isConverting}
              >
                <option value="64k">64 kbps</option>
                <option value="128k">128 kbps</option>
                <option value="192k">192 kbps</option>
                <option value="256k">256 kbps</option>
                <option value="320k">320 kbps</option>
              </select>
            </div>

            <div className="setting-group">
              <label htmlFor="sample-rate">Sample Rate</label>
              <select 
                id="sample-rate"
                value={audioSettings.sampleRate} 
                onChange={(e) => setAudioSettings(prev => ({ ...prev, sampleRate: e.target.value }))}
                disabled={isConverting}
              >
                <option value="22050">22.05 kHz</option>
                <option value="44100">44.1 kHz</option>
                <option value="48000">48 kHz</option>
                <option value="96000">96 kHz</option>
              </select>
            </div>

            <div className="setting-group">
              <label htmlFor="channels">Channels</label>
              <select 
                id="channels"
                value={audioSettings.channels} 
                onChange={(e) => setAudioSettings(prev => ({ ...prev, channels: e.target.value }))}
                disabled={isConverting}
              >
                <option value="1">Mono</option>
                <option value="2">Stereo</option>
              </select>
            </div>
          </div>
        </div>

        {/* Output Directory */}
        <div className="section">
          <h3>Output Directory</h3>
          <div className="output-directory">
            <input 
              type="text" 
              value={outputDirectory} 
              placeholder="Select output directory..."
              readOnly
            />
            <button 
              className="btn btn-secondary" 
              onClick={handleOutputDirectorySelect}
              disabled={isConverting}
            >
              Browse
            </button>
          </div>
        </div>

        {/* Conversion Controls */}
        <div className="section">
          <button 
            className="btn btn-success btn-large"
            onClick={handleStartConversion}
            disabled={isConverting || selectedFiles.length === 0 || !outputDirectory}
          >
            {isConverting ? 'Converting...' : 'Start Conversion'}
          </button>
        </div>

        {/* Progress */}
        {Object.keys(conversionProgress).length > 0 && (
          <div className="section">
            <h3>Conversion Progress</h3>
            <div className="progress-list">
              {Object.entries(conversionProgress).map(([fileId, progress]) => {
                const file = selectedFiles.find(f => f.path === fileId);
                return (
                  <div key={fileId} className="progress-item">
                    <span className="progress-file">{file?.name || fileId}</span>
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <span className="progress-percent">{progress}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed Conversions */}
        {completedConversions.length > 0 && (
          <div className="section">
            <h3>Completed Conversions</h3>
            <div className="completed-list">
              {completedConversions.map((conversion, index) => (
                <div key={index} className="completed-item">
                  <span className="completed-file">{conversion.fileName}</span>
                  <span className="completed-status">✓ Converted successfully</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="section">
            <div className="errors">
              <div className="errors-header">
                <h3>Errors</h3>
                <button className="btn btn-small" onClick={clearErrors}>Clear</button>
              </div>
              <div className="error-list">
                {errors.map((error, index) => (
                  <div key={index} className="error-item">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioConverter;