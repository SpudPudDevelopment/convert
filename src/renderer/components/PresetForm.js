/**
 * PresetForm Component
 * Form for creating and editing conversion presets
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConversionPreset } from '../../shared/models/ConversionPreset';
import usePresetCategories from '../hooks/usePresetCategories';
import './PresetForm.css';

const PresetForm = ({ 
  preset = null, 
  isEdit = false, 
  onSave, 
  onCancel, 
  onValidationChange 
}) => {
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    visibility: 'private',
    tags: [],
    settings: {
      format: '',
      quality: 'medium',
      resolution: '',
      bitrate: '',
      frameRate: '',
      codec: '',
      container: '',
      audioCodec: '',
      audioChannels: 'stereo',
      audioSampleRate: '44100',
      customOptions: {}
    },
    metadata: {
      author: '',
      version: '1.0.0',
      compatibility: [],
      requirements: []
    }
  });
  
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState({});
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  // Hooks
  const { categories, getCategoriesByType } = usePresetCategories();
  
  // Get categories for the current format type
  const availableCategories = useMemo(() => {
    if (!formData.settings.format) return categories;
    
    const formatType = getFormatType(formData.settings.format);
    return getCategoriesByType(formatType);
  }, [categories, getCategoriesByType, formData.settings.format]);
  
  // Format options based on category
  const formatOptions = useMemo(() => {
    const category = availableCategories.find(cat => cat.id === formData.category);
    if (!category) return [];
    
    return category.supportedFormats || [];
  }, [availableCategories, formData.category]);
  
  // Quality options
  const qualityOptions = [
    { value: 'low', label: 'Low Quality', description: 'Smaller file size, lower quality' },
    { value: 'medium', label: 'Medium Quality', description: 'Balanced size and quality' },
    { value: 'high', label: 'High Quality', description: 'Larger file size, better quality' },
    { value: 'lossless', label: 'Lossless', description: 'Maximum quality, largest size' },
    { value: 'custom', label: 'Custom', description: 'Custom quality settings' }
  ];
  
  // Resolution options
  const resolutionOptions = [
    '480p', '720p', '1080p', '1440p', '2160p (4K)', '4320p (8K)', 'Original', 'Custom'
  ];
  
  // Frame rate options
  const frameRateOptions = [
    '23.976', '24', '25', '29.97', '30', '50', '59.94', '60', 'Original', 'Custom'
  ];
  
  // Audio channel options
  const audioChannelOptions = [
    { value: 'mono', label: 'Mono (1.0)' },
    { value: 'stereo', label: 'Stereo (2.0)' },
    { value: '2.1', label: '2.1 Surround' },
    { value: '5.1', label: '5.1 Surround' },
    { value: '7.1', label: '7.1 Surround' },
    { value: 'original', label: 'Keep Original' }
  ];
  
  // Audio sample rate options
  const sampleRateOptions = [
    '22050', '44100', '48000', '96000', '192000', 'original'
  ];
  
  /**
   * Get format type from format string
   */
  const getFormatType = useCallback((format) => {
    const imageFormats = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'svg'];
    const videoFormats = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'];
    const audioFormats = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a'];
    
    const lowerFormat = format.toLowerCase();
    
    if (imageFormats.includes(lowerFormat)) return 'image';
    if (videoFormats.includes(lowerFormat)) return 'video';
    if (audioFormats.includes(lowerFormat)) return 'audio';
    
    return 'other';
  }, []);
  
  /**
   * Initialize form with preset data
   */
  useEffect(() => {
    if (preset) {
      setFormData({
        name: preset.name || '',
        description: preset.description || '',
        category: preset.category || '',
        visibility: preset.visibility || 'private',
        tags: preset.tags || [],
        settings: {
          format: preset.settings?.format || '',
          quality: preset.settings?.quality || 'medium',
          resolution: preset.settings?.resolution || '',
          bitrate: preset.settings?.bitrate || '',
          frameRate: preset.settings?.frameRate || '',
          codec: preset.settings?.codec || '',
          container: preset.settings?.container || '',
          audioCodec: preset.settings?.audioCodec || '',
          audioChannels: preset.settings?.audioChannels || 'stereo',
          audioSampleRate: preset.settings?.audioSampleRate || '44100',
          customOptions: preset.settings?.customOptions || {}
        },
        metadata: {
          author: preset.metadata?.author || '',
          version: preset.metadata?.version || '1.0.0',
          compatibility: preset.metadata?.compatibility || [],
          requirements: preset.metadata?.requirements || []
        }
      });
      setIsDirty(false);
    }
  }, [preset]);
  
  /**
   * Validate form data
   */
  const validateForm = useCallback(async () => {
    setIsValidating(true);
    
    try {
      // Create temporary preset for validation
      const tempPreset = new ConversionPreset({
        ...formData,
        id: preset?.id || 'temp',
        createdAt: preset?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Validate using ConversionPreset validation
      const validation = tempPreset.validate();
      
      if (validation.isValid) {
        setErrors({});
        setIsValid(true);
      } else {
        // Convert validation errors to form errors
        const formErrors = {};
        validation.errors.forEach(error => {
          const field = error.field || 'general';
          if (!formErrors[field]) {
            formErrors[field] = [];
          }
          formErrors[field].push(error.message);
        });
        
        setErrors(formErrors);
        setIsValid(false);
      }
      
      // Notify parent of validation change
      if (onValidationChange) {
        onValidationChange(validation.isValid, validation.errors);
      }
      
    } catch (error) {
      console.error('Validation error:', error);
      setErrors({ general: [error.message] });
      setIsValid(false);
    } finally {
      setIsValidating(false);
    }
  }, [formData, preset, onValidationChange]);
  
  /**
   * Handle form field changes
   */
  const handleFieldChange = useCallback((field, value) => {
    setFormData(prev => {
      const newData = { ...prev };
      
      // Handle nested fields
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        newData[parent] = {
          ...newData[parent],
          [child]: value
        };
      } else {
        newData[field] = value;
      }
      
      return newData;
    });
    
    setIsDirty(true);
  }, []);
  
  /**
   * Handle tag input
   */
  const handleTagInput = useCallback((e) => {
    const value = e.target.value;
    setTagInput(value);
    
    // Add tag on Enter or comma
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      addTag(value.trim());
    }
  }, []);
  
  /**
   * Add a tag
   */
  const addTag = useCallback((tag) => {
    if (tag && !formData.tags.includes(tag)) {
      handleFieldChange('tags', [...formData.tags, tag]);
    }
    setTagInput('');
  }, [formData.tags, handleFieldChange]);
  
  /**
   * Remove a tag
   */
  const removeTag = useCallback((tagToRemove) => {
    handleFieldChange('tags', formData.tags.filter(tag => tag !== tagToRemove));
  }, [formData.tags, handleFieldChange]);
  
  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (!isValid) {
      await validateForm();
      return;
    }
    
    try {
      // Create preset data
      const presetData = {
        ...formData,
        id: preset?.id,
        createdAt: preset?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Call save handler
      if (onSave) {
        await onSave(presetData);
      }
    } catch (error) {
      console.error('Save error:', error);
      setErrors({ general: [error.message] });
    }
  }, [formData, preset, isValid, onSave, validateForm]);
  
  /**
   * Handle cancel
   */
  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
  }, [onCancel]);
  
  // Validate form when data changes
  useEffect(() => {
    if (isDirty) {
      const timeoutId = setTimeout(validateForm, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [formData, isDirty, validateForm]);
  
  return (
    <div className="preset-form">
      <form onSubmit={handleSubmit}>
        {/* General Errors */}
        {errors.general && (
          <div className="error-message">
            {errors.general.map((error, index) => (
              <div key={index}>{error}</div>
            ))}
          </div>
        )}
        
        {/* Basic Information */}
        <div className="form-section">
          <h3>Basic Information</h3>
          
          <div className="form-group">
            <label htmlFor="name">Preset Name *</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="Enter preset name"
              className={errors.name ? 'error' : ''}
              required
            />
            {errors.name && (
              <div className="field-error">
                {errors.name.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </div>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Describe what this preset does"
              rows={3}
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="category">Category *</label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => handleFieldChange('category', e.target.value)}
                className={errors.category ? 'error' : ''}
                required
              >
                <option value="">Select category</option>
                {availableCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {errors.category && (
                <div className="field-error">
                  {errors.category.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="visibility">Visibility</label>
              <select
                id="visibility"
                value={formData.visibility}
                onChange={(e) => handleFieldChange('visibility', e.target.value)}
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
                <option value="public">Public</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="tags">Tags</label>
            <div className="tags-input">
              <div className="tags-list">
                {formData.tags.map((tag, index) => (
                  <span key={index} className="tag">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="tag-remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                id="tags"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInput}
                placeholder="Add tags (press Enter or comma to add)"
                className="tag-input"
              />
            </div>
          </div>
        </div>
        
        {/* Conversion Settings */}
        <div className="form-section">
          <h3>Conversion Settings</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="format">Output Format *</label>
              <select
                id="format"
                value={formData.settings.format}
                onChange={(e) => handleFieldChange('settings.format', e.target.value)}
                className={errors['settings.format'] ? 'error' : ''}
                required
              >
                <option value="">Select format</option>
                {formatOptions.map(format => (
                  <option key={format} value={format}>
                    {format.toUpperCase()}
                  </option>
                ))}
              </select>
              {errors['settings.format'] && (
                <div className="field-error">
                  {errors['settings.format'].map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="quality">Quality</label>
              <select
                id="quality"
                value={formData.settings.quality}
                onChange={(e) => handleFieldChange('settings.quality', e.target.value)}
              >
                {qualityOptions.map(option => (
                  <option key={option.value} value={option.value} title={option.description}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Video-specific settings */}
          {getFormatType(formData.settings.format) === 'video' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="resolution">Resolution</label>
                  <select
                    id="resolution"
                    value={formData.settings.resolution}
                    onChange={(e) => handleFieldChange('settings.resolution', e.target.value)}
                  >
                    <option value="">Keep original</option>
                    {resolutionOptions.map(res => (
                      <option key={res} value={res}>{res}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="frameRate">Frame Rate</label>
                  <select
                    id="frameRate"
                    value={formData.settings.frameRate}
                    onChange={(e) => handleFieldChange('settings.frameRate', e.target.value)}
                  >
                    <option value="">Keep original</option>
                    {frameRateOptions.map(rate => (
                      <option key={rate} value={rate}>{rate} fps</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="codec">Video Codec</label>
                  <input
                    id="codec"
                    type="text"
                    value={formData.settings.codec}
                    onChange={(e) => handleFieldChange('settings.codec', e.target.value)}
                    placeholder="e.g., h264, h265, vp9"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="bitrate">Bitrate</label>
                  <input
                    id="bitrate"
                    type="text"
                    value={formData.settings.bitrate}
                    onChange={(e) => handleFieldChange('settings.bitrate', e.target.value)}
                    placeholder="e.g., 2M, 5000k"
                  />
                </div>
              </div>
            </>
          )}
          
          {/* Audio settings */}
          {(getFormatType(formData.settings.format) === 'audio' || getFormatType(formData.settings.format) === 'video') && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="audioCodec">Audio Codec</label>
                  <input
                    id="audioCodec"
                    type="text"
                    value={formData.settings.audioCodec}
                    onChange={(e) => handleFieldChange('settings.audioCodec', e.target.value)}
                    placeholder="e.g., aac, mp3, flac"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="audioChannels">Audio Channels</label>
                  <select
                    id="audioChannels"
                    value={formData.settings.audioChannels}
                    onChange={(e) => handleFieldChange('settings.audioChannels', e.target.value)}
                  >
                    {audioChannelOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="audioSampleRate">Sample Rate</label>
                <select
                  id="audioSampleRate"
                  value={formData.settings.audioSampleRate}
                  onChange={(e) => handleFieldChange('settings.audioSampleRate', e.target.value)}
                >
                  {sampleRateOptions.map(rate => (
                    <option key={rate} value={rate}>
                      {rate === 'original' ? 'Keep Original' : `${rate} Hz`}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        
        {/* Metadata */}
        <div className="form-section">
          <h3>Metadata</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="author">Author</label>
              <input
                id="author"
                type="text"
                value={formData.metadata.author}
                onChange={(e) => handleFieldChange('metadata.author', e.target.value)}
                placeholder="Preset author"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="version">Version</label>
              <input
                id="version"
                type="text"
                value={formData.metadata.version}
                onChange={(e) => handleFieldChange('metadata.version', e.target.value)}
                placeholder="1.0.0"
              />
            </div>
          </div>
        </div>
        
        {/* Form Actions */}
        <div className="form-actions">
          <button
            type="button"
            onClick={handleCancel}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isValid || isValidating}
          >
            {isValidating ? 'Validating...' : (isEdit ? 'Update Preset' : 'Create Preset')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PresetForm;