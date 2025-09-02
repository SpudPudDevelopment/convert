import React, { useState, useCallback } from 'react';
import DragDropZone from './DragDropZone';
import OutputConfiguration from './OutputConfiguration';
import ConversionSettings from './ConversionSettings';
import ProgressBar from './ProgressBar';
import JobQueue from './JobQueue';
import RecentJobsPanel from './RecentJobsPanel';
import { useRecentJobs } from '../hooks/useRecentJobs';

// Get category title
const getCategoryTitle = (category) => {
  switch (category) {
    case 'document':
      return 'Document';
    case 'image':
      return 'Image';
    case 'audio':
      return 'Audio';
    case 'video':
      return 'Video';
    case 'universal':
      return 'Universal';
    default:
      return 'File';
  }
};

// File type detection based on extension
const detectFileType = (fileName) => {
  const ext = fileName.split('.').pop().toLowerCase();
  const typeMap = {
    // Document formats
    'pdf': 'document',
    'docx': 'document', 
    'doc': 'document',
    'txt': 'document',
    'rtf': 'document',
    // Image formats
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'webp': 'image',
    'tiff': 'image',
    'bmp': 'image',
    'svg': 'image',
    // Audio formats
    'mp3': 'audio',
    'wav': 'audio',
    'flac': 'audio',
    'aac': 'audio',
    'ogg': 'audio',
    'm4a': 'audio',
    // Video formats
    'mp4': 'video',
    'mov': 'video',
    'avi': 'video',
    'mkv': 'video',
    'webm': 'video'
  };
  return typeMap[ext] || 'unknown';
};

const formatOptions = {
  document: ['PDF', 'DOCX', 'TXT', 'RTF'],
  image: ['JPEG', 'PNG', 'WEBP', 'TIFF', 'BMP'],
  audio: ['MP3', 'WAV', 'FLAC', 'AAC', 'OGG'],
  video: ['MP4', 'MOV', 'AVI', 'MKV', 'WEBM']
};

// Format options for each category
const getFormatOptions = (category) => {
  switch (category) {
    case 'universal':
      // Universal category supports all formats
      return [
        // Document formats
        { value: 'pdf', label: 'PDF (.pdf)' },
        { value: 'docx', label: 'Word Document (.docx)' },
        { value: 'txt', label: 'Plain Text (.txt)' },
        { value: 'rtf', label: 'Rich Text Format (.rtf)' },
        // Image formats
        { value: 'jpg', label: 'JPEG (.jpg)' },
        { value: 'png', label: 'PNG (.png)' },
        { value: 'webp', label: 'WebP (.webp)' },
        { value: 'gif', label: 'GIF (.gif)' },
        // Audio formats
        { value: 'mp3', label: 'MP3 (.mp3)' },
        { value: 'wav', label: 'WAV (.wav)' },
        { value: 'flac', label: 'FLAC (.flac)' },
        { value: 'aac', label: 'AAC (.aac)' },
        // Video formats
        { value: 'mp4', label: 'MP4 (.mp4)' },
        { value: 'avi', label: 'AVI (.avi)' },
        { value: 'mov', label: 'QuickTime (.mov)' },
        { value: 'mkv', label: 'Matroska (.mkv)' }
      ];
    case 'document':
      return [
        { value: 'pdf', label: 'PDF (.pdf)' },
        { value: 'docx', label: 'Word Document (.docx)' },
        { value: 'doc', label: 'Word Document (.doc)' },
        { value: 'xlsx', label: 'Excel Spreadsheet (.xlsx)' },
        { value: 'xls', label: 'Excel Spreadsheet (.xls)' },
        { value: 'pptx', label: 'PowerPoint (.pptx)' },
        { value: 'ppt', label: 'PowerPoint (.ppt)' },
        { value: 'txt', label: 'Plain Text (.txt)' },
        { value: 'rtf', label: 'Rich Text Format (.rtf)' },
        { value: 'odt', label: 'OpenDocument Text (.odt)' },
        { value: 'ods', label: 'OpenDocument Spreadsheet (.ods)' },
        { value: 'odp', label: 'OpenDocument Presentation (.odp)' }
      ];
    case 'image':
      return [
        { value: 'jpg', label: 'JPEG (.jpg)' },
        { value: 'jpeg', label: 'JPEG (.jpeg)' },
        { value: 'png', label: 'PNG (.png)' },
        { value: 'gif', label: 'GIF (.gif)' },
        { value: 'webp', label: 'WebP (.webp)' },
        { value: 'bmp', label: 'Bitmap (.bmp)' },
        { value: 'tiff', label: 'TIFF (.tiff)' },
        { value: 'svg', label: 'SVG (.svg)' },
        { value: 'ico', label: 'Icon (.ico)' },
        { value: 'heic', label: 'HEIC (.heic)' },
        { value: 'avif', label: 'AVIF (.avif)' }
      ];
    case 'audio':
      return [
        { value: 'mp3', label: 'MP3 (.mp3)' },
        { value: 'wav', label: 'WAV (.wav)' },
        { value: 'flac', label: 'FLAC (.flac)' },
        { value: 'aac', label: 'AAC (.aac)' },
        { value: 'ogg', label: 'OGG (.ogg)' },
        { value: 'm4a', label: 'M4A (.m4a)' },
        { value: 'wma', label: 'WMA (.wma)' },
        { value: 'aiff', label: 'AIFF (.aiff)' },
        { value: 'opus', label: 'Opus (.opus)' }
      ];
    case 'video':
      return [
        { value: 'mp4', label: 'MP4 (.mp4)' },
        { value: 'avi', label: 'AVI (.avi)' },
        { value: 'mov', label: 'QuickTime (.mov)' },
        { value: 'mkv', label: 'Matroska (.mkv)' },
        { value: 'webm', label: 'WebM (.webm)' },
        { value: 'wmv', label: 'Windows Media (.wmv)' },
        { value: 'flv', label: 'Flash Video (.flv)' },
        { value: 'm4v', label: 'M4V (.m4v)' },
        { value: '3gp', label: '3GP (.3gp)' },
        { value: 'ogv', label: 'OGV (.ogv)' }
      ];
    default:
      return [
        { value: 'pdf', label: 'PDF' },
        { value: 'jpg', label: 'JPEG' },
        { value: 'png', label: 'PNG' },
        { value: 'mp3', label: 'MP3' },
        { value: 'mp4', label: 'MP4' }
      ];
  }
};

const FileConverter = ({ category = 'document' }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [outputFormat, setOutputFormat] = useState('');
  const [progress, setProgress] = useState(0);
  const [conversionStatus, setConversionStatus] = useState('idle');
  const [conversionStartTime, setConversionStartTime] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [currentFileName, setCurrentFileName] = useState('');
  const [outputConfig, setOutputConfig] = useState({
    outputDirectory: '',
    namingPattern: 'original',
    customSuffix: '',
    conflictStrategy: 'rename',
    preserveStructure: false,
    createSubfolders: false
  });
  const [conversionSettings, setConversionSettings] = useState({
    quality: 'high',
    compression: 'medium',
    resolution: 'original',
    colorSpace: 'auto',
    dpi: 300,
    pageSize: 'A4',
    orientation: 'portrait',
    bitrate: '320',
    sampleRate: '44100',
    channels: 'stereo',
    codec: 'auto',
    frameRate: '30',
    videoQuality: 'high',
    audioCodec: 'aac',
    videoCodec: 'h264'
  });
  const [jobs, setJobs] = useState([]);
  const [nextJobId, setNextJobId] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [conversionController, setConversionController] = useState(null);
  
  // Recent jobs tracking
  const { addJob: addRecentJob, updateJob: updateRecentJob } = useRecentJobs();

  // Handle reusing settings from a previous job
  const handleReuseSettings = useCallback((jobSettings, presetUsed = null) => {
    if (!jobSettings) return;

    // Apply conversion settings
    if (jobSettings.conversionSettings) {
      setConversionSettings(prev => ({
        ...prev,
        ...jobSettings.conversionSettings
      }));
    }

    // Apply output configuration
    if (jobSettings.outputConfig) {
      setOutputConfig(prev => ({
        ...prev,
        ...jobSettings.outputConfig
      }));
    }

    // Apply output format
    if (jobSettings.outputFormat) {
      setOutputFormat(jobSettings.outputFormat);
    }

    // Apply preset if available
    if (presetUsed) {
      setSelectedPreset(presetUsed);
    }

    // Show success message or notification
    console.log('Settings applied from previous job:', {
      preset: presetUsed,
      format: jobSettings.outputFormat,
      settings: jobSettings.conversionSettings
    });
  }, []);

  // Reset output format and settings when category changes
  React.useEffect(() => {
    setOutputFormat('');
    // Reset settings to defaults for the new category
    setConversionSettings({
      quality: 'high',
      compression: 'medium',
      resolution: 'original',
      colorSpace: 'auto',
      dpi: 300,
      pageSize: 'A4',
      orientation: 'portrait',
      bitrate: '320',
      sampleRate: '44100',
      channels: 'stereo',
      codec: 'auto',
      frameRate: '30',
      videoQuality: 'high',
      audioCodec: 'aac',
      videoCodec: 'h264'
    });
  }, [category]);

  const handleFilesSelected = (result) => {
    if (result.success && result.files.length > 0) {
      const fileObjects = result.files.map(file => ({
        path: file.path,
        name: file.path.split('/').pop(),
        size: file.size || 0,
        type: file.path.split('.').pop().toLowerCase()
      }));
      
      setSelectedFiles(fileObjects);
      setConversionStatus('ready');
      
      // Auto-detect file type and switch to appropriate category
      if (fileObjects.length > 0) {
        const firstFileType = detectFileType(fileObjects[0].name);
        if (firstFileType !== 'unknown' && firstFileType !== category) {
          // Reset output format when switching categories
          setOutputFormat('');
        }
      }
    } else if (result.error) {
      console.error('Error selecting files:', result.error);
      setConversionStatus('error');
    }
  };

  const removeFile = (index) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    if (updatedFiles.length === 0) {
      setConversionStatus('idle');
    }
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0 || !outputFormat || !outputConfig.outputDirectory) {
      return;
    }

    // Reset cancellation and pause states
    setIsCancelled(false);
    setIsPaused(false);
    setConversionController(null);

    // Create a job for this conversion
    const jobId = createJob(selectedFiles, outputFormat, conversionSettings, outputConfig);
    
    setConversionStatus('converting');
    setProgress(0);
    setConversionStartTime(Date.now());
    setCurrentFileName(selectedFiles[0]?.name || '');

    // Update job status to converting
    updateJob(jobId, { 
      status: 'converting', 
      startTime: Date.now() 
    });

    try {
      // Create an AbortController for cancellation
      const controller = new AbortController();
      setConversionController(controller);
      
      // Prepare conversion jobs with file type detection
      const conversionJobs = selectedFiles.map(file => {
        const fileType = detectFileType(file.name);
        return {
          inputPath: file.path,
          outputFormat: outputFormat.toLowerCase(),
          fileType,
          settings: {
            // Common settings
            quality: conversionSettings.quality,
            compression: conversionSettings.compression,
            
            // Image-specific settings
            ...(fileType === 'image' && {
              resolution: conversionSettings.resolution,
              dpi: conversionSettings.dpi,
              colorSpace: conversionSettings.colorSpace
            }),
            
            // Document-specific settings
            ...(fileType === 'document' && {
              pageSize: conversionSettings.pageSize,
              orientation: conversionSettings.orientation,
              dpi: conversionSettings.dpi
            }),
            
            // Audio-specific settings
            ...(fileType === 'audio' && {
              bitrate: conversionSettings.bitrate,
              sampleRate: conversionSettings.sampleRate,
              channels: conversionSettings.channels,
              audioCodec: conversionSettings.audioCodec
            }),
            
            // Video-specific settings
            ...(fileType === 'video' && {
              frameRate: conversionSettings.frameRate,
              videoQuality: conversionSettings.videoQuality,
              videoCodec: conversionSettings.videoCodec,
              audioCodec: conversionSettings.audioCodec
            })
          }
        };
      });
      
      // Use the unified conversion service
      const conversionOptions = {
        jobs: conversionJobs,
        outputConfig: {
          outputDirectory: outputConfig.outputDirectory,
          namingPattern: outputConfig.namingPattern,
          customSuffix: outputConfig.customSuffix,
          conflictStrategy: outputConfig.conflictStrategy,
          preserveStructure: outputConfig.preserveStructure,
          createSubfolders: outputConfig.createSubfolders
        },
        batchSettings: {
          maxConcurrent: 3,
          preserveStructure: outputConfig.preserveStructure
        },
        preset: selectedPreset,
        signal: controller.signal,
        progressCallback: (progress) => {
          setProgress(progress);
        }
      };
      
      // Check for cancellation before starting
      if (isCancelled) {
        updateJob(jobId, { status: 'cancelled' });
        return;
      }
      
      const response = await window.electronAPI.convertFile(conversionOptions);
      
      if (response.success) {
        setProgress(100);
        setConversionStatus('completed');
        
        // Update job status to completed
        const completedJob = jobs.find(j => j.id === jobId);
        updateJob(jobId, { 
          status: 'completed', 
          progress: 100,
          results: response.results,
          summary: response.summary
        });
        
        // Update recent jobs tracking
        if (completedJob) {
          updateRecentJob(completedJob.fileName, {
            status: 'completed',
            duration: Date.now() - completedJob.createdAt,
            fileTypes: selectedFiles.map(f => detectFileType(f.name)),
            summary: response.summary
          });
        }
        
        // Reset after a delay
        setTimeout(() => {
          setSelectedFiles([]);
          setOutputFormat('');
          setConversionStatus('idle');
          setProgress(0);
        }, 3000);
      } else {
        console.error('Conversion failed:', response.error);
        setConversionStatus('error');
        
        // Update job status to error
        const errorJob = jobs.find(j => j.id === jobId);
        updateJob(jobId, { 
          status: 'error', 
          error: response.error 
        });
        
        // Update recent jobs tracking
        if (errorJob) {
          updateRecentJob(errorJob.fileName, {
            status: 'failed',
            error: response.error
          });
        }
      }
    } catch (error) {
      console.error('Conversion error:', error);
      
      // Check if error is due to cancellation
      const failedJob = jobs.find(j => j.id === jobId);
      if (error.name === 'AbortError' || isCancelled) {
        setConversionStatus('cancelled');
        updateJob(jobId, { status: 'cancelled' });
        
        // Update recent jobs tracking
        if (failedJob) {
          updateRecentJob(failedJob.fileName, {
            status: 'cancelled'
          });
        }
      } else {
        setConversionStatus('error');
        updateJob(jobId, { 
          status: 'error', 
          error: error.message 
        });
        
        // Update recent jobs tracking
        if (failedJob) {
          updateRecentJob(failedJob.fileName, {
            status: 'failed',
            error: error.message
          });
        }
      }
    } finally {
      setConversionStartTime(null);
      setCurrentFileName('');
      setConversionController(null);
      setIsCancelled(false);
      setIsPaused(false);
    }
  };

  // Handle conversion cancellation
  const handleCancel = useCallback(() => {
    setIsCancelled(true);
    setConversionStatus('cancelled');
    setProgress(0);
    setConversionStartTime(null);
    setCurrentFileName('');
    
    // Cancel the conversion controller if it exists
    if (conversionController) {
      conversionController.abort();
      setConversionController(null);
    }
    
    // Send cancellation signal to main process
    if (window.electronAPI && window.electronAPI.cancelConversion) {
      window.electronAPI.cancelConversion();
    }
  }, [conversionController]);

  // Handle conversion pause
  const handlePause = useCallback(() => {
    setIsPaused(true);
    setConversionStatus('paused');
    
    // Send pause signal to main process
    if (window.electronAPI && window.electronAPI.pauseConversion) {
      window.electronAPI.pauseConversion();
    }
  }, []);

  // Handle conversion resume
  const handleResume = useCallback(() => {
    setIsPaused(false);
    setConversionStatus('converting');
    
    // Send resume signal to main process
    if (window.electronAPI && window.electronAPI.resumeConversion) {
      window.electronAPI.resumeConversion();
    }
  }, []);

  // Job management functions
  const createJob = (files, outputFormat, settings, config) => {
    const job = {
      id: nextJobId.toString(),
      fileName: files.length === 1 ? files[0].name : `${files.length} files`,
      inputFormat: files[0]?.type || 'unknown',
      outputFormat,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      startTime: null,
      fileSize: files.reduce((total, file) => total + (file.size || 0), 0),
      files,
      settings,
      config,
      error: null,
      outputPath: null
    };
    
    setJobs(prev => [...prev, job]);
    setNextJobId(prev => prev + 1);
    
    // Add to recent jobs tracking
    addRecentJob({
      name: job.fileName,
      type: category,
      sourceFiles: files.map(f => f.path),
      targetFormat: outputFormat,
      outputPath: config.outputDirectory,
      status: 'pending',
      settings: {
        ...settings,
        outputConfig: config
      },
      presetUsed: selectedPreset?.name || null
    });
    
    return job.id;
  };

  const updateJob = (jobId, updates) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId ? { ...job, ...updates } : job
    ));
  };

  const removeJob = (jobId) => {
    setJobs(prev => prev.filter(job => job.id !== jobId));
  };

  const clearCompletedJobs = () => {
    setJobs(prev => prev.filter(job => job.status !== 'completed'));
  };

  const cancelJob = (jobId) => {
    updateJob(jobId, { status: 'cancelled' });
    
    // If this is the currently converting job, cancel the main conversion
    const job = jobs.find(j => j.id === jobId);
    if (job && job.status === 'converting') {
      handleCancel();
    }
    
    // Send cancellation signal to main process for this specific job
    if (window.electronAPI && window.electronAPI.cancelJob) {
      window.electronAPI.cancelJob(jobId);
    }
  };

  const pauseJob = (jobId) => {
    updateJob(jobId, { status: 'paused' });
    
    // If this is the currently converting job, pause the main conversion
    const job = jobs.find(j => j.id === jobId);
    if (job && job.status === 'converting') {
      handlePause();
    }
    
    // Send pause signal to main process for this specific job
    if (window.electronAPI && window.electronAPI.pauseJob) {
      window.electronAPI.pauseJob(jobId);
    }
  };

  const resumeJob = (jobId) => {
    updateJob(jobId, { status: 'converting' });
    
    // If this is the currently paused job, resume the main conversion
    const job = jobs.find(j => j.id === jobId);
    if (job && job.status === 'paused') {
      handleResume();
    }
    
    // Send resume signal to main process for this specific job
    if (window.electronAPI && window.electronAPI.resumeJob) {
      window.electronAPI.resumeJob(jobId);
    }
  };

  const retryJob = (jobId) => {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      updateJob(jobId, { 
        status: 'pending', 
        progress: 0, 
        error: null,
        startTime: null 
      });
      
      // Re-queue the job for processing
      if (window.electronAPI && window.electronAPI.retryJob) {
        window.electronAPI.retryJob(jobId).then(result => {
          if (result.success) {
            console.log(`Job ${jobId} re-queued successfully`);
            // Update job status to queued
            updateJob(jobId, { 
              status: 'queued',
              queuePosition: result.queuePosition,
              estimatedWaitTime: result.estimatedWaitTime
            });
          } else {
            console.error(`Failed to re-queue job ${jobId}:`, result.error);
            // Revert job status to failed
            updateJob(jobId, { 
              status: 'failed',
              error: result.error
            });
          }
        }).catch(error => {
          console.error(`Error re-queueing job ${jobId}:`, error);
          // Revert job status to failed
          updateJob(jobId, { 
            status: 'failed',
            error: error.message
          });
        });
      } else {
        console.warn('Electron API not available for job re-queueing');
        // Fallback: just update status to pending
        updateJob(jobId, { status: 'pending' });
      }
    }
  };

  return (
    <div className="file-converter-container">
      <div className="conversion-settings">
        <h2 className="settings-label">{getCategoryTitle(category)} Conversion</h2>
        
        <div className="settings-section">
          <DragDropZone
            onFilesSelected={handleFilesSelected}
            disabled={conversionStatus === 'converting'}
            maxFiles={50}
            showFileCount={true}
          />
          
          {selectedFiles.length > 0 && (
            <div className="file-list">
              <h3 className="settings-label">Selected Files ({selectedFiles.length}):</h3>
              <ul className="file-list">
                {selectedFiles.map((file, index) => (
                  <li key={index} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">.{file.type}</span>
                    <button 
                      className="file-remove"
                      onClick={() => removeFile(index)}
                      disabled={conversionStatus === 'converting'}
                      aria-label={`Remove ${file.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        {selectedFiles.length > 0 && (
          <>
            <OutputConfiguration
              selectedFiles={selectedFiles}
              outputConfig={outputConfig}
              onConfigChange={setOutputConfig}
              disabled={conversionStatus === 'converting'}
            />
            
            <ConversionSettings
              category={category}
              settings={conversionSettings}
              onSettingsChange={setConversionSettings}
              disabled={conversionStatus === 'converting'}
              selectedFiles={selectedFiles}
              outputFormat={outputFormat}
              selectedPreset={selectedPreset}
              onPresetChange={setSelectedPreset}
            />
            
            <div className="settings-section">
              <label className="settings-label">Output Format:</label>
              <div className="settings-controls">
                <select 
                  value={outputFormat} 
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className="select-control"
                >
                  <option value="">Select output format</option>
                  {getFormatOptions(category).map(format => (
                    <option key={format.value} value={format.value}>
                      {format.label}
                    </option>
                  ))}
                </select>
              
                <button 
                  className="convert-button"
                  onClick={handleConvert}
                  disabled={conversionStatus === 'converting' || !outputFormat || !outputConfig.outputDirectory}
                >
                  {conversionStatus === 'converting' ? 'Converting...' : 'Convert Files'}
                </button>
              </div>
            </div>
            
            {(conversionStatus === 'converting' || conversionStatus === 'paused' || conversionStatus === 'completed' || conversionStatus === 'error' || conversionStatus === 'cancelled') && (
              <div className="progress-container">
                <ProgressBar
                  progress={progress}
                  status={conversionStatus}
                  fileName={currentFileName}
                  startTime={conversionStartTime}
                  onCancel={(conversionStatus === 'converting' || conversionStatus === 'paused') ? handleCancel : null}
                  onPause={conversionStatus === 'converting' && !isPaused ? handlePause : null}
                  onResume={conversionStatus === 'paused' || isPaused ? handleResume : null}
                  showDetails={true}
                  compact={false}
                />
              </div>
            )}
            
            {conversionStatus === 'completed' && (
              <div className="conversion-success">
                <p>✅ Conversion completed successfully!</p>
              </div>
            )}
            
            {conversionStatus === 'paused' && (
              <div className="conversion-paused">
                <p>⏸️ Conversion is paused. Click resume to continue.</p>
              </div>
            )}
            
            {conversionStatus === 'error' && (
              <div className="conversion-error">
                <p>❌ Conversion failed. Please try again.</p>
              </div>
            )}
            
            {conversionStatus === 'cancelled' && (
              <div className="conversion-cancelled">
                <p>⏹️ Conversion was cancelled.</p>
              </div>
            )}
          </>
        )}
        
        {jobs.length > 0 && (
          <JobQueue
            jobs={jobs}
            onCancelJob={cancelJob}
            onPauseJob={pauseJob}
            onResumeJob={resumeJob}
            onRemoveJob={removeJob}
            onClearCompleted={clearCompletedJobs}
            onRetryJob={retryJob}
            maxVisibleJobs={5}
            showCompleted={true}
          />
        )}
        
        <RecentJobsPanel
          onReuseSettings={handleReuseSettings}
          defaultViewMode="widget"
        />
      </div>
    </div>
  );
};

export default FileConverter;