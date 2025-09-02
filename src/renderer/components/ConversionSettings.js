import React, { useState, useEffect, useCallback } from 'react';
import { useConversionPresets } from '../hooks/useConversionPresets';
import PresetManager from './PresetManager';
import '../styles/ConversionSettings.css';

// Tooltip data for complex settings
const tooltipData = {
  dpi: 'Dots Per Inch - Higher values create larger, more detailed files. 72 DPI for web, 300 DPI for print.',
  quality: 'Overall conversion quality. Higher quality produces better results but larger files.',
  bitrate: 'Audio quality in kilobits per second. Higher values mean better quality but larger files.',
  sampleRate: 'Audio sampling frequency. 44.1 kHz is CD quality, 48 kHz is professional standard.',
  frameRate: 'Video frames per second. 24 fps for cinema, 30 fps standard, 60 fps for smooth motion.',
  jpegQuality: 'JPEG compression level. Higher percentages preserve more detail but create larger files.',
  pngCompression: 'PNG compression level. Higher values create smaller files but take longer to process.',
  flacCompression: 'FLAC compression level. Higher values create smaller files with no quality loss.',
  videoQuality: 'Video encoding quality. Affects file size and visual fidelity.',
  audioCodec: 'Audio compression format. AAC is widely compatible, FLAC is lossless.',
  videoCodec: 'Video compression format. H.264 is widely compatible, H.265 offers better compression.',
  videoBitrate: 'Video data rate in megabits per second. Higher values mean better quality but larger files. Auto uses quality-based encoding.',
  audioBitrate: 'Audio data rate in kilobits per second. Higher values mean better audio quality but larger files.',
  colorSpace: 'Color representation method. sRGB for web, Adobe RGB for professional printing.',
  pageSize: 'Standard paper sizes for document conversion.',
  orientation: 'Page layout direction for documents.'
};

const ConversionSettings = ({ category, settings, onSettingsChange, disabled = false, selectedFiles = [], outputFormat = '', selectedPreset = null, onPresetChange = () => {} }) => {
  const [localSettings, setLocalSettings] = useState({
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
    videoCodec: 'h264',
    ...settings
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [hasValidated, setHasValidated] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');

  // Preset management hook
  const {
    presets,
    loading: presetsLoading,
    error: presetsError,
    loadPresets,
    createPreset,
    updatePreset,
    deletePreset
  } = useConversionPresets({ category, autoLoad: true });

  useEffect(() => {
    setLocalSettings(prev => ({ ...prev, ...settings }));
  }, [settings]);

  // Validation functions
  const validateSetting = (key, value) => {
    const errors = {};
    
    switch (key) {
      case 'dpi':
        if (value < 72 || value > 600) {
          errors[key] = 'DPI must be between 72 and 600';
        }
        break;
      case 'bitrate':
        if (value !== 'lossless' && (parseInt(value) < 64 || parseInt(value) > 320)) {
          errors[key] = 'Bitrate must be between 64 and 320 kbps';
        }
        break;
      case 'sampleRate':
        const validSampleRates = ['22050', '44100', '48000', '96000'];
        if (!validSampleRates.includes(value)) {
          errors[key] = 'Invalid sample rate';
        }
        break;
      case 'frameRate':
        if (parseInt(value) < 1 || parseInt(value) > 120) {
          errors[key] = 'Frame rate must be between 1 and 120 fps';
        }
        break;
      case 'jpegQuality':
        if (parseInt(value) < 1 || parseInt(value) > 100) {
          errors[key] = 'JPEG quality must be between 1 and 100';
        }
        break;
      case 'pngCompression':
        if (parseInt(value) < 0 || parseInt(value) > 9) {
          errors[key] = 'PNG compression must be between 0 and 9';
        }
        break;
      case 'flacCompression':
        if (parseInt(value) < 0 || parseInt(value) > 8) {
          errors[key] = 'FLAC compression must be between 0 and 8';
        }
        break;
      default:
        break;
    }
    
    return errors;
  };

  const validateAllSettings = (settings) => {
    let allErrors = {};
    
    Object.keys(settings).forEach(key => {
      const errors = validateSetting(key, settings[key]);
      allErrors = { ...allErrors, ...errors };
    });
    
    return allErrors;
  };

  const handleSettingChange = (key, value) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    
    // Validate the changed setting
    if (hasValidated) {
      const errors = validateSetting(key, value);
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        if (Object.keys(errors).length > 0) {
          Object.assign(newErrors, errors);
        } else {
          delete newErrors[key];
        }
        return newErrors;
      });
    }
    
    onSettingsChange(newSettings);
  };

  // Validate all settings when component mounts or settings change
  useEffect(() => {
    if (hasValidated) {
      const errors = validateAllSettings(localSettings);
      setValidationErrors(errors);
    }
  }, [localSettings, hasValidated]);

  // Trigger validation on first user interaction
  const triggerValidation = () => {
    if (!hasValidated) {
      setHasValidated(true);
      const errors = validateAllSettings(localSettings);
      setValidationErrors(errors);
    }
  };

  const getFileTypes = () => {
    return selectedFiles.map(file => file.type?.toLowerCase()).filter(Boolean);
  };

  const hasFileType = (types) => {
    const fileTypes = getFileTypes();
    return types.some(type => fileTypes.includes(type));
  };

  // Preset management functions
  const applyPreset = useCallback(async (preset) => {
    if (!preset || !preset.settings) return;
    
    try {
      const newSettings = { ...localSettings, ...preset.settings };
      setLocalSettings(newSettings);
      setSelectedPreset(preset);
      onSettingsChange(newSettings);
      onPresetChange(preset); // Notify parent component
      
      // Validate the new settings
      if (hasValidated) {
        const errors = validateAllSettings(newSettings);
        setValidationErrors(errors);
      }
    } catch (error) {
      console.error('Error applying preset:', error);
    }
  }, [localSettings, onSettingsChange, onPresetChange, hasValidated]);

  const saveCurrentAsPreset = useCallback(async () => {
    if (!presetName.trim()) return;
    
    try {
      const presetData = {
        name: presetName.trim(),
        description: presetDescription.trim(),
        category: category || 'custom',
        settings: localSettings,
        sourceFormat: selectedFiles[0]?.type || null,
        targetFormat: outputFormat || null,
        tags: [category, outputFormat].filter(Boolean)
      };
      
      await createPreset(presetData);
      setShowSavePresetDialog(false);
      setPresetName('');
      setPresetDescription('');
    } catch (error) {
      console.error('Error saving preset:', error);
    }
  }, [presetName, presetDescription, category, localSettings, selectedFiles, outputFormat, createPreset]);

  const resetToDefaults = useCallback(() => {
    setSelectedPreset(null);
    onPresetChange(null); // Clear preset selection in parent
    const defaultSettings = {
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
    };
    
    setLocalSettings(defaultSettings);
    onSettingsChange(defaultSettings);
    
    if (hasValidated) {
      const errors = validateAllSettings(defaultSettings);
      setValidationErrors(errors);
    }
  }, [onSettingsChange, onPresetChange, hasValidated]);

  const getFilteredPresets = useCallback(() => {
    if (!presets || presets.length === 0) return [];
    
    return presets.filter(preset => {
      // Filter by category if specified
      if (category && preset.category !== category) return false;
      
      // Filter by target format if specified
      if (outputFormat && preset.targetFormat && preset.targetFormat !== outputFormat) return false;
      
      return true;
    });
  }, [presets, category, outputFormat]);

  // Helper function to render error messages
  const renderError = (fieldName) => {
    if (validationErrors[fieldName]) {
      return (
        <div className="validation-error">
          <span className="error-icon">⚠</span>
          <span className="error-message">{validationErrors[fieldName]}</span>
        </div>
      );
    }
    return null;
  };

  // Helper function to get input class with error state
  const getInputClass = (fieldName) => {
    return validationErrors[fieldName] ? 'setting-input error' : 'setting-input';
  };

  // Tooltip component
  const Tooltip = ({ children, text, position = 'top' }) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
      <div 
        className="tooltip-container"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
        {isVisible && text && (
          <div className={`tooltip tooltip-${position}`}>
            {text}
          </div>
        )}
      </div>
    );
  };

  // Helper function to render setting item with optional tooltip
  const renderSettingItem = (id, label, children, tooltipKey = null) => {
    const content = (
      <div className="setting-item">
        <label htmlFor={id}>
          {label}
          {tooltipKey && tooltipData[tooltipKey] && (
            <span className="help-icon" title={tooltipData[tooltipKey]}>ⓘ</span>
          )}
        </label>
        {children}
        {renderError(id)}
      </div>
    );

    if (tooltipKey && tooltipData[tooltipKey]) {
      return (
        <Tooltip text={tooltipData[tooltipKey]} position="right">
          {content}
        </Tooltip>
      );
    }

    return content;
  };

  const renderDocumentSettings = () => (
    <div className="settings-group">
      <h4>Document Settings</h4>
      
      {renderSettingItem('quality', 'Quality:', (
        <select
          id="quality"
          className={getInputClass('quality')}
          value={localSettings.quality}
          onChange={(e) => {
            triggerValidation();
            handleSettingChange('quality', e.target.value);
          }}
          disabled={disabled}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="maximum">Maximum</option>
        </select>
      ), 'quality')}

      <div className="setting-item">
        <label htmlFor="pageSize">Page Size:</label>
        <select
          id="pageSize"
          value={localSettings.pageSize}
          onChange={(e) => handleSettingChange('pageSize', e.target.value)}
          disabled={disabled}
        >
          <option value="A4">A4</option>
          <option value="A3">A3</option>
          <option value="A5">A5</option>
          <option value="Letter">Letter</option>
          <option value="Legal">Legal</option>
          <option value="Tabloid">Tabloid</option>
        </select>
      </div>

      <div className="setting-item">
        <label htmlFor="orientation">Orientation:</label>
        <select
          id="orientation"
          value={localSettings.orientation}
          onChange={(e) => handleSettingChange('orientation', e.target.value)}
          disabled={disabled}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </div>

      {renderSettingItem('dpi', 'DPI:', (
        <select
          id="dpi"
          className={getInputClass('dpi')}
          value={localSettings.dpi}
          onChange={(e) => {
            triggerValidation();
            handleSettingChange('dpi', parseInt(e.target.value));
          }}
          disabled={disabled}
        >
          <option value="72">72 DPI (Web)</option>
          <option value="150">150 DPI (Standard)</option>
          <option value="300">300 DPI (Print)</option>
          <option value="600">600 DPI (High Quality)</option>
        </select>
      ), 'dpi')}

      {/* PDF-specific options */}
      {(outputFormat === 'pdf' || hasFileType(['pdf'])) && (
        <>
          <div className="setting-item">
            <label htmlFor="pdfVersion">PDF Version:</label>
            <select
              id="pdfVersion"
              value={localSettings.pdfVersion || '1.4'}
              onChange={(e) => handleSettingChange('pdfVersion', e.target.value)}
              disabled={disabled}
            >
              <option value="1.3">PDF 1.3</option>
              <option value="1.4">PDF 1.4 (Recommended)</option>
              <option value="1.5">PDF 1.5</option>
              <option value="1.6">PDF 1.6</option>
              <option value="1.7">PDF 1.7</option>
            </select>
          </div>
          
          <div className="setting-item">
            <label htmlFor="pdfOptimization">Optimization:</label>
            <select
              id="pdfOptimization"
              value={localSettings.pdfOptimization || 'standard'}
              onChange={(e) => handleSettingChange('pdfOptimization', e.target.value)}
              disabled={disabled}
            >
              <option value="none">None</option>
              <option value="standard">Standard</option>
              <option value="web">Web Optimized</option>
              <option value="print">Print Optimized</option>
            </select>
          </div>
        </>
      )}

      {/* Excel-specific options */}
      {(outputFormat === 'xlsx' || outputFormat === 'xls' || hasFileType(['xlsx', 'xls'])) && (
        <div className="setting-item">
          <label htmlFor="preserveFormulas">Preserve Formulas:</label>
          <select
            id="preserveFormulas"
            value={localSettings.preserveFormulas || 'true'}
            onChange={(e) => handleSettingChange('preserveFormulas', e.target.value)}
            disabled={disabled}
          >
            <option value="true">Yes</option>
            <option value="false">No (Values Only)</option>
          </select>
        </div>
      )}
    </div>
  );

  const renderImageSettings = () => (
    <div className="settings-group">
      <h4>Image Settings</h4>
      
      <div className="setting-item">
        <label htmlFor="quality">Quality:</label>
        <select
          id="quality"
          value={localSettings.quality}
          onChange={(e) => handleSettingChange('quality', e.target.value)}
          disabled={disabled}
        >
          <option value="low">Low (60%)</option>
          <option value="medium">Medium (80%)</option>
          <option value="high">High (90%)</option>
          <option value="maximum">Maximum (100%)</option>
        </select>
      </div>

      <div className="setting-item">
        <label htmlFor="resolution">Resolution:</label>
        <select
          id="resolution"
          value={localSettings.resolution}
          onChange={(e) => handleSettingChange('resolution', e.target.value)}
          disabled={disabled}
        >
          <option value="original">Keep Original</option>
          <option value="480p">480p (640×480)</option>
          <option value="720p">720p (1280×720)</option>
          <option value="1080p">1080p (1920×1080)</option>
          <option value="4k">4K (3840×2160)</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      <div className="setting-item">
        <label htmlFor="colorSpace">Color Space:</label>
        <select
          id="colorSpace"
          value={localSettings.colorSpace}
          onChange={(e) => handleSettingChange('colorSpace', e.target.value)}
          disabled={disabled}
        >
          <option value="auto">Auto</option>
          <option value="sRGB">sRGB</option>
          <option value="AdobeRGB">Adobe RGB</option>
          <option value="ProPhotoRGB">ProPhoto RGB</option>
          <option value="CMYK">CMYK</option>
        </select>
      </div>

      <div className="setting-item">
        <label htmlFor="compression">Compression:</label>
        <select
          id="compression"
          value={localSettings.compression}
          onChange={(e) => handleSettingChange('compression', e.target.value)}
          disabled={disabled}
        >
          <option value="none">None</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      {/* JPEG-specific options */}
      {(outputFormat === 'jpg' || outputFormat === 'jpeg' || hasFileType(['jpg', 'jpeg'])) && (
        <>
          {renderSettingItem('jpegQuality', 'JPEG Quality:', (
            <select
              id="jpegQuality"
              className={getInputClass('jpegQuality')}
              value={localSettings.jpegQuality || '85'}
              onChange={(e) => {
                triggerValidation();
                handleSettingChange('jpegQuality', e.target.value);
              }}
              disabled={disabled}
            >
              <option value="60">60% (Small file)</option>
              <option value="75">75% (Good quality)</option>
              <option value="85">85% (High quality)</option>
              <option value="95">95% (Maximum quality)</option>
              <option value="100">100% (Lossless)</option>
            </select>
          ), 'jpegQuality')}
          
          <div className="setting-item">
            <label htmlFor="progressive">Progressive JPEG:</label>
            <select
              id="progressive"
              value={localSettings.progressive || 'false'}
              onChange={(e) => handleSettingChange('progressive', e.target.value)}
              disabled={disabled}
            >
              <option value="false">No</option>
              <option value="true">Yes (Better web loading)</option>
            </select>
          </div>
        </>
      )}

      {/* PNG-specific options */}
      {(outputFormat === 'png' || hasFileType(['png'])) && (
        <>
          {renderSettingItem('pngCompression', 'PNG Compression:', (
            <select
              id="pngCompression"
              className={getInputClass('pngCompression')}
              value={localSettings.pngCompression || '6'}
              onChange={(e) => {
                triggerValidation();
                handleSettingChange('pngCompression', e.target.value);
              }}
              disabled={disabled}
            >
              <option value="0">0 (No compression)</option>
              <option value="3">3 (Fast)</option>
              <option value="6">6 (Balanced)</option>
              <option value="9">9 (Maximum compression)</option>
            </select>
          ), 'pngCompression')}
          
          <div className="setting-item">
            <label htmlFor="preserveTransparency">Preserve Transparency:</label>
            <select
              id="preserveTransparency"
              value={localSettings.preserveTransparency || 'true'}
              onChange={(e) => handleSettingChange('preserveTransparency', e.target.value)}
              disabled={disabled}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </>
      )}

      {/* WebP-specific options */}
      {(outputFormat === 'webp' || hasFileType(['webp'])) && (
        <div className="setting-item">
          <label htmlFor="webpLossless">WebP Mode:</label>
          <select
            id="webpLossless"
            value={localSettings.webpLossless || 'false'}
            onChange={(e) => handleSettingChange('webpLossless', e.target.value)}
            disabled={disabled}
          >
            <option value="false">Lossy (Smaller size)</option>
            <option value="true">Lossless (Better quality)</option>
          </select>
        </div>
      )}
    </div>
  );

  const renderAudioSettings = () => (
    <div className="settings-group">
      <h4>Audio Settings</h4>
      
      {renderSettingItem('bitrate', 'Bitrate:', (
        <select
          id="bitrate"
          className={getInputClass('bitrate')}
          value={localSettings.bitrate}
          onChange={(e) => {
            triggerValidation();
            handleSettingChange('bitrate', e.target.value);
          }}
          disabled={disabled}
        >
          <option value="128">128 kbps</option>
          <option value="192">192 kbps</option>
          <option value="256">256 kbps</option>
          <option value="320">320 kbps</option>
          <option value="lossless">Lossless</option>
        </select>
      ), 'bitrate')}

      {renderSettingItem('sampleRate', 'Sample Rate:', (
        <select
          id="sampleRate"
          className={getInputClass('sampleRate')}
          value={localSettings.sampleRate}
          onChange={(e) => {
            triggerValidation();
            handleSettingChange('sampleRate', e.target.value);
          }}
          disabled={disabled}
        >
          <option value="22050">22.05 kHz</option>
          <option value="44100">44.1 kHz (CD Quality)</option>
          <option value="48000">48 kHz</option>
          <option value="96000">96 kHz (High Resolution)</option>
        </select>
      ), 'sampleRate')}

      <div className="setting-item">
        <label htmlFor="channels">Channels:</label>
        <select
          id="channels"
          value={localSettings.channels}
          onChange={(e) => handleSettingChange('channels', e.target.value)}
          disabled={disabled}
        >
          <option value="mono">Mono</option>
          <option value="stereo">Stereo</option>
          <option value="5.1">5.1 Surround</option>
          <option value="7.1">7.1 Surround</option>
        </select>
      </div>

      <div className="setting-item">
        <label htmlFor="codec">Codec:</label>
        <select
          id="codec"
          value={localSettings.codec}
          onChange={(e) => handleSettingChange('codec', e.target.value)}
          disabled={disabled}
        >
          <option value="auto">Auto</option>
          <option value="mp3">MP3</option>
          <option value="aac">AAC</option>
          <option value="flac">FLAC</option>
          <option value="ogg">OGG Vorbis</option>
          <option value="wav">WAV</option>
        </select>
      </div>

      {/* MP3-specific options */}
      {(outputFormat === 'mp3' || hasFileType(['mp3'])) && (
        <>
          <div className="setting-item">
            <label htmlFor="mp3Quality">MP3 Quality:</label>
            <select
              id="mp3Quality"
              value={localSettings.mp3Quality || 'standard'}
              onChange={(e) => handleSettingChange('mp3Quality', e.target.value)}
              disabled={disabled}
            >
              <option value="low">Low (96 kbps)</option>
              <option value="standard">Standard (128 kbps)</option>
              <option value="good">Good (192 kbps)</option>
              <option value="high">High (256 kbps)</option>
              <option value="extreme">Extreme (320 kbps)</option>
            </select>
          </div>
          
          <div className="setting-item">
            <label htmlFor="mp3Mode">Encoding Mode:</label>
            <select
              id="mp3Mode"
              value={localSettings.mp3Mode || 'cbr'}
              onChange={(e) => handleSettingChange('mp3Mode', e.target.value)}
              disabled={disabled}
            >
              <option value="cbr">CBR (Constant bitrate)</option>
              <option value="vbr">VBR (Variable bitrate)</option>
            </select>
          </div>
        </>
      )}

      {/* AAC-specific options */}
      {(outputFormat === 'aac' || outputFormat === 'm4a' || hasFileType(['aac', 'm4a'])) && (
        <div className="setting-item">
          <label htmlFor="aacProfile">AAC Profile:</label>
          <select
            id="aacProfile"
            value={localSettings.aacProfile || 'lc'}
            onChange={(e) => handleSettingChange('aacProfile', e.target.value)}
            disabled={disabled}
          >
            <option value="lc">LC (Low Complexity)</option>
            <option value="he">HE (High Efficiency)</option>
            <option value="he-v2">HE-AAC v2</option>
          </select>
        </div>
      )}

      {/* FLAC-specific options */}
      {(outputFormat === 'flac' || hasFileType(['flac'])) && (
        renderSettingItem('flacCompression', 'FLAC Compression:', (
          <select
            id="flacCompression"
            className={getInputClass('flacCompression')}
            value={localSettings.flacCompression || '5'}
            onChange={(e) => {
              triggerValidation();
              handleSettingChange('flacCompression', e.target.value);
            }}
            disabled={disabled}
          >
            <option value="0">0 (Fastest)</option>
            <option value="3">3 (Fast)</option>
            <option value="5">5 (Default)</option>
            <option value="8">8 (Maximum compression)</option>
          </select>
        ), 'flacCompression')
      )}
    </div>
  );

  const renderVideoSettings = () => (
    <div className="settings-group">
      <h4>Video Settings</h4>
      
      <div className="setting-item">
        <label htmlFor="videoQuality">Video Quality:</label>
        <select
          id="videoQuality"
          value={localSettings.videoQuality}
          onChange={(e) => handleSettingChange('videoQuality', e.target.value)}
          disabled={disabled}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="ultra">Ultra</option>
        </select>
      </div>

      <div className="setting-item">
        <label htmlFor="resolution">Resolution:</label>
        <select
          id="resolution"
          value={localSettings.resolution}
          onChange={(e) => handleSettingChange('resolution', e.target.value)}
          disabled={disabled}
        >
          <option value="original">Keep Original</option>
          <option value="480p">480p (854×480)</option>
          <option value="720p">720p (1280×720)</option>
          <option value="1080p">1080p (1920×1080)</option>
          <option value="1440p">1440p (2560×1440)</option>
          <option value="4k">4K (3840×2160)</option>
        </select>
      </div>

      {renderSettingItem('frameRate', 'Frame Rate:', (
        <select
          id="frameRate"
          className={getInputClass('frameRate')}
          value={localSettings.frameRate}
          onChange={(e) => {
            triggerValidation();
            handleSettingChange('frameRate', e.target.value);
          }}
          disabled={disabled}
        >
          <option value="24">24 fps (Cinema)</option>
          <option value="30">30 fps (Standard)</option>
          <option value="60">60 fps (Smooth)</option>
          <option value="120">120 fps (High Frame Rate)</option>
        </select>
      ), 'frameRate')}

      <div className="setting-item">
        <label htmlFor="videoCodec">Video Codec:</label>
        <select
          id="videoCodec"
          value={localSettings.videoCodec}
          onChange={(e) => handleSettingChange('videoCodec', e.target.value)}
          disabled={disabled}
        >
          <option value="h264">H.264 (Most Compatible)</option>
          <option value="h265">H.265/HEVC (Smaller Size)</option>
          <option value="vp9">VP9 (Web Optimized)</option>
          <option value="av1">AV1 (Future Standard)</option>
        </select>
      </div>

      <div className="setting-item">
        <label htmlFor="audioCodec">Audio Codec:</label>
        <select
          id="audioCodec"
          value={localSettings.audioCodec}
          onChange={(e) => handleSettingChange('audioCodec', e.target.value)}
          disabled={disabled}
        >
          <option value="aac">AAC</option>
          <option value="mp3">MP3</option>
          <option value="ac3">AC3</option>
          <option value="flac">FLAC</option>
        </select>
      </div>

      {renderSettingItem('videoBitrate', 'Video Bitrate:', (
        <select
          id="videoBitrate"
          value={localSettings.videoBitrate || 'auto'}
          onChange={(e) => handleSettingChange('videoBitrate', e.target.value)}
          disabled={disabled}
        >
          <option value="auto">Auto (Quality-based)</option>
          <option value="1000k">1 Mbps (Low)</option>
          <option value="2000k">2 Mbps (Medium)</option>
          <option value="4000k">4 Mbps (High)</option>
          <option value="8000k">8 Mbps (Ultra)</option>
          <option value="12000k">12 Mbps (Professional)</option>
        </select>
      ), 'videoBitrate')}

      {renderSettingItem('audioBitrate', 'Audio Bitrate:', (
        <select
          id="audioBitrate"
          value={localSettings.audioBitrate || '128k'}
          onChange={(e) => handleSettingChange('audioBitrate', e.target.value)}
          disabled={disabled}
        >
          <option value="96k">96 kbps</option>
          <option value="128k">128 kbps (Standard)</option>
          <option value="192k">192 kbps (High)</option>
          <option value="256k">256 kbps</option>
          <option value="320k">320 kbps (Maximum)</option>
        </select>
      ), 'audioBitrate')}

      {/* MP4-specific options */}
      {(outputFormat === 'mp4' || hasFileType(['mp4'])) && (
        <>
          <div className="setting-item">
            <label htmlFor="mp4Profile">H.264 Profile:</label>
            <select
              id="mp4Profile"
              value={localSettings.mp4Profile || 'main'}
              onChange={(e) => handleSettingChange('mp4Profile', e.target.value)}
              disabled={disabled}
            >
              <option value="baseline">Baseline (Compatible)</option>
              <option value="main">Main (Balanced)</option>
              <option value="high">High (Best quality)</option>
            </select>
          </div>
          
          <div className="setting-item">
            <label htmlFor="mp4Preset">Encoding Speed:</label>
            <select
              id="mp4Preset"
              value={localSettings.mp4Preset || 'medium'}
              onChange={(e) => handleSettingChange('mp4Preset', e.target.value)}
              disabled={disabled}
            >
              <option value="ultrafast">Ultra Fast</option>
              <option value="fast">Fast</option>
              <option value="medium">Medium</option>
              <option value="slow">Slow (Better quality)</option>
              <option value="veryslow">Very Slow (Best quality)</option>
            </select>
          </div>
        </>
      )}

      {/* WebM-specific options */}
      {(outputFormat === 'webm' || hasFileType(['webm'])) && (
        <>
          <div className="setting-item">
            <label htmlFor="webmQuality">WebM Quality:</label>
            <select
              id="webmQuality"
              value={localSettings.webmQuality || 'good'}
              onChange={(e) => handleSettingChange('webmQuality', e.target.value)}
              disabled={disabled}
            >
              <option value="realtime">Realtime (Fastest)</option>
              <option value="good">Good (Balanced)</option>
              <option value="best">Best (Highest quality)</option>
            </select>
          </div>
          
          <div className="setting-item">
            <label htmlFor="webmCodec">WebM Codec:</label>
            <select
              id="webmCodec"
              value={localSettings.webmCodec || 'vp9'}
              onChange={(e) => handleSettingChange('webmCodec', e.target.value)}
              disabled={disabled}
            >
              <option value="vp8">VP8 (Compatible)</option>
              <option value="vp9">VP9 (Modern)</option>
              <option value="av1">AV1 (Future-proof)</option>
            </select>
          </div>
        </>
      )}

      {/* MOV-specific options */}
      {(outputFormat === 'mov' || hasFileType(['mov'])) && (
        <div className="setting-item">
          <label htmlFor="movCompatibility">QuickTime Compatibility:</label>
          <select
            id="movCompatibility"
            value={localSettings.movCompatibility || 'modern'}
            onChange={(e) => handleSettingChange('movCompatibility', e.target.value)}
            disabled={disabled}
          >
            <option value="legacy">Legacy (Older players)</option>
            <option value="modern">Modern (Recommended)</option>
            <option value="pro">Pro (Professional editing)</option>
          </select>
        </div>
      )}
    </div>
  );

  const renderSettingsForCategory = () => {
    switch (category) {
      case 'document':
        return renderDocumentSettings();
      case 'image':
        return renderImageSettings();
      case 'audio':
        return renderAudioSettings();
      case 'video':
        return renderVideoSettings();
      default:
        return (
          <div className="settings-group">
            <h4>General Settings</h4>
            <div className="setting-item">
              <label htmlFor="quality">Quality:</label>
              <select
                id="quality"
                value={localSettings.quality}
                onChange={(e) => handleSettingChange('quality', e.target.value)}
                disabled={disabled}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="maximum">Maximum</option>
              </select>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="conversion-settings">
      <div className="settings-header">
        <h3>Conversion Settings</h3>
        <div className="preset-controls">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowPresetManager(true)}
            disabled={disabled}
            title="Manage Presets"
          >
            📋 Presets
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowSavePresetDialog(true)}
            disabled={disabled || !Object.keys(localSettings).length}
            title="Save Current Settings as Preset"
          >
            💾 Save
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetToDefaults}
            disabled={disabled}
            title="Reset to Default Settings"
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Preset Selection */}
      {getFilteredPresets().length > 0 && (
        <div className="preset-selection">
          <label htmlFor="preset-select">Quick Presets:</label>
          <select
            id="preset-select"
            value={selectedPreset?.id || ''}
            onChange={(e) => {
              const preset = presets.find(p => p.id === e.target.value);
              if (preset) {
                applyPreset(preset);
              } else {
                setSelectedPreset(null);
              }
            }}
            disabled={disabled || presetsLoading}
          >
            <option value="">Select a preset...</option>
            {getFilteredPresets().map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.name} {preset.description && `- ${preset.description}`}
              </option>
            ))}
          </select>
          {selectedPreset && (
            <div className="selected-preset-info">
              <span className="preset-badge">
                📋 {selectedPreset.name}
              </span>
              {selectedPreset.description && (
                <span className="preset-description">
                  {selectedPreset.description}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preset Loading/Error States */}
      {presetsLoading && (
        <div className="preset-status loading">
          <span>Loading presets...</span>
        </div>
      )}
      
      {presetsError && (
        <div className="preset-status error">
          <span>Error loading presets: {presetsError}</span>
        </div>
      )}

      {/* Main Settings */}
      {renderSettingsForCategory()}

      {/* Preset Manager Modal */}
      {showPresetManager && (
        <div className="modal-overlay" onClick={() => setShowPresetManager(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Preset Manager</h3>
              <button
                type="button"
                className="btn btn-close"
                onClick={() => setShowPresetManager(false)}
              >
                ✕
              </button>
            </div>
            <PresetManager
              category={category}
              onPresetSelect={(preset) => {
                applyPreset(preset);
                setShowPresetManager(false);
              }}
              onClose={() => setShowPresetManager(false)}
            />
          </div>
        </div>
      )}

      {/* Save Preset Dialog */}
      {showSavePresetDialog && (
        <div className="modal-overlay" onClick={() => setShowSavePresetDialog(false)}>
          <div className="modal-content save-preset-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Save Preset</h3>
              <button
                type="button"
                className="btn btn-close"
                onClick={() => setShowSavePresetDialog(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="preset-name">Preset Name:</label>
                <input
                  id="preset-name"
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Enter preset name..."
                  maxLength={50}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="preset-description">Description (optional):</label>
                <textarea
                  id="preset-description"
                  value={presetDescription}
                  onChange={(e) => setPresetDescription(e.target.value)}
                  placeholder="Describe this preset..."
                  maxLength={200}
                  rows={3}
                />
              </div>
              <div className="preset-preview">
                <h4>Current Settings:</h4>
                <div className="settings-summary">
                  {Object.entries(localSettings).map(([key, value]) => (
                    <div key={key} className="setting-summary-item">
                      <span className="setting-key">{key}:</span>
                      <span className="setting-value">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSavePresetDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveCurrentAsPreset}
                disabled={!presetName.trim()}
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversionSettings;