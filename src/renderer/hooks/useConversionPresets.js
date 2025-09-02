/**
 * React Hook for Conversion Presets Management
 * Provides state management and operations for conversion presets
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConversionPreset, PresetEvents } from '../models/ConversionPresetRenderer';

// Handle both Electron and web environments
let ipcRenderer = null;
if (typeof window !== 'undefined' && window.require) {
  try {
    ({ ipcRenderer } = window.require('electron'));
  } catch (error) {
    console.warn('Electron IPC not available, running in web mode');
  }
}

/**
 * Custom hook for managing conversion presets
 */
export const useConversionPresets = (options = {}) => {
  const {
    autoLoad = true,
    category = null,
    enableRealTimeUpdates = true
  } = options;

  // State management
  const [presets, setPresets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(category);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Refs for cleanup
  const ipcListenersRef = useRef([]);
  const loadingRef = useRef(false);

  /**
   * Load presets from the main process
   */
  const loadPresets = useCallback(async (filters = {}) => {
    if (loadingRef.current) return;
    
    try {
      setLoading(true);
      loadingRef.current = true;
      setError(null);

      if (!ipcRenderer) {
        // Web mode fallback - provide empty presets
        console.warn('IPC not available, using fallback preset data');
        setPresets([]);
        return;
      }

      const result = await ipcRenderer.invoke('preset-manager:getPresets', {
        category: filterCategory,
        search: searchQuery,
        sortBy,
        sortOrder,
        ...filters
      });

      if (result.success) {
        setPresets(result.presets || []);
      } else {
        throw new Error(result.error || 'Failed to load presets');
      }
    } catch (err) {
      console.error('Error loading presets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [filterCategory, searchQuery, sortBy, sortOrder]);

  /**
   * Load templates from the main process
   */
  const loadTemplates = useCallback(async (filters = {}) => {
    try {
      if (!ipcRenderer) {
        console.warn('IPC not available, using fallback template data');
        setTemplates([]);
        return;
      }

      const result = await ipcRenderer.invoke('preset-template:getTemplates', filters);
      
      if (result.success) {
        setTemplates(result.templates || []);
      } else {
        console.error('Failed to load templates:', result.error);
      }
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  }, []);

  /**
   * Create a new preset
   */
  const createPreset = useCallback(async (presetData) => {
    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, preset creation not supported in web mode');
        throw new Error('Preset creation not available in web mode');
      }

      const result = await ipcRenderer.invoke('preset-manager:createPreset', presetData);
      
      if (result.success) {
        await loadPresets();
        return result.preset;
      } else {
        throw new Error(result.error || 'Failed to create preset');
      }
    } catch (err) {
      console.error('Error creating preset:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadPresets]);

  /**
   * Update an existing preset
   */
  const updatePreset = useCallback(async (presetId, updates) => {
    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, preset update not supported in web mode');
        throw new Error('Preset update not available in web mode');
      }

      const result = await ipcRenderer.invoke('preset-manager:updatePreset', {
        id: presetId,
        updates
      });
      
      if (result.success) {
        await loadPresets();
        return result.preset;
      } else {
        throw new Error(result.error || 'Failed to update preset');
      }
    } catch (err) {
      console.error('Error updating preset:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadPresets]);

  /**
   * Delete a preset
   */
  const deletePreset = useCallback(async (presetId) => {
    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, preset deletion not supported in web mode');
        throw new Error('Preset deletion not available in web mode');
      }

      const result = await ipcRenderer.invoke('preset-manager:deletePreset', presetId);
      
      if (result.success) {
        await loadPresets();
        if (selectedPreset?.id === presetId) {
          setSelectedPreset(null);
        }
        return true;
      } else {
        throw new Error(result.error || 'Failed to delete preset');
      }
    } catch (err) {
      console.error('Error deleting preset:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadPresets, selectedPreset]);

  /**
   * Duplicate a preset
   */
  const duplicatePreset = useCallback(async (presetId, options = {}) => {
    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, preset duplication not supported in web mode');
        throw new Error('Preset duplication not available in web mode');
      }

      const result = await ipcRenderer.invoke('preset-template:duplicatePreset', {
        sourceId: presetId,
        ...options
      });
      
      if (result.success) {
        await loadPresets();
        return result.preset;
      } else {
        throw new Error(result.error || 'Failed to duplicate preset');
      }
    } catch (err) {
      console.error('Error duplicating preset:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadPresets]);

  /**
   * Create preset from template
   */
  const createFromTemplate = useCallback(async (templateId, customizations = {}) => {
    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, template creation not supported in web mode');
        throw new Error('Template creation not available in web mode');
      }

      const result = await ipcRenderer.invoke('preset-template:createFromTemplate', {
        templateId,
        customizations
      });
      
      if (result.success) {
        await loadPresets();
        return result.preset;
      } else {
        throw new Error(result.error || 'Failed to create preset from template');
      }
    } catch (err) {
      console.error('Error creating from template:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadPresets]);

  /**
   * Create template from preset
   */
  const createTemplate = useCallback(async (presetId, templateOptions = {}) => {
    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, template creation not supported in web mode');
        throw new Error('Template creation not available in web mode');
      }

      const result = await ipcRenderer.invoke('preset-template:createTemplate', {
        presetId,
        templateOptions
      });
      
      if (result.success) {
        await loadTemplates();
        return result.template;
      } else {
        throw new Error(result.error || 'Failed to create template');
      }
    } catch (err) {
      console.error('Error creating template:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadTemplates]);

  /**
   * Import presets from file
   */
  const importPresets = useCallback(async (filePath) => {
    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, preset import not supported in web mode');
        throw new Error('Preset import not available in web mode');
      }

      const result = await ipcRenderer.invoke('preset-manager:importPresets', filePath);
      
      if (result.success) {
        await loadPresets();
        return result.imported;
      } else {
        throw new Error(result.error || 'Failed to import presets');
      }
    } catch (err) {
      console.error('Error importing presets:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [loadPresets]);

  /**
   * Export presets to file
   */
  const exportPresets = useCallback(async (presetIds, filePath) => {
    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, preset export not supported in web mode');
        throw new Error('Preset export not available in web mode');
      }

      const result = await ipcRenderer.invoke('preset-manager:exportPresets', {
        presetIds,
        filePath
      });
      
      if (result.success) {
        return result.filePath;
      } else {
        throw new Error(result.error || 'Failed to export presets');
      }
    } catch (err) {
      console.error('Error exporting presets:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get preset statistics
   */
  const getStatistics = useCallback(async () => {
    try {
      if (!ipcRenderer) {
        console.warn('IPC not available, statistics not supported in web mode');
        return null;
      }

      const result = await ipcRenderer.invoke('preset-manager:getStatistics');
      return result.success ? result.statistics : null;
    } catch (err) {
      console.error('Error getting statistics:', err);
      return null;
    }
  }, []);

  /**
   * Search presets
   */
  const searchPresets = useCallback(async (query, filters = {}) => {
    try {
      if (!ipcRenderer) {
        console.warn('IPC not available, using local search in web mode');
        return presets.filter(preset => {
          const searchQuery = query.toLowerCase();
          return preset.name.toLowerCase().includes(searchQuery) ||
                 preset.description?.toLowerCase().includes(searchQuery) ||
                 preset.category?.toLowerCase().includes(searchQuery);
        });
      }

      const result = await ipcRenderer.invoke('preset-manager:searchPresets', {
        query,
        ...filters
      });
      
      return result.success ? result.presets : [];
    } catch (err) {
      console.error('Error searching presets:', err);
      return [];
    }
  }, [presets]);

  /**
   * Validate preset
   */
  const validatePreset = useCallback(async (presetData) => {
    try {
      if (!ipcRenderer) {
        console.warn('IPC not available, using basic validation in web mode');
        // Basic client-side validation
        const errors = [];
        if (!presetData.name) errors.push('Name is required');
        if (!presetData.settings) errors.push('Settings are required');
        return { isValid: errors.length === 0, errors };
      }

      const result = await ipcRenderer.invoke('preset-validator:validatePreset', presetData);
      return result.success ? result.validation : { isValid: false, errors: ['Validation failed'] };
    } catch (err) {
      console.error('Error validating preset:', err);
      return { isValid: false, errors: [err.message] };
    }
  }, []);

  /**
   * Setup IPC listeners for real-time updates
   */
  useEffect(() => {
    if (!enableRealTimeUpdates || !ipcRenderer) return;

    const listeners = [
      {
        channel: 'preset-manager:presetCreated',
        handler: (event, data) => {
          setPresets(prev => [...prev, data.preset]);
        }
      },
      {
        channel: 'preset-manager:presetUpdated',
        handler: (event, data) => {
          setPresets(prev => prev.map(p => 
            p.id === data.preset.id ? data.preset : p
          ));
          if (selectedPreset?.id === data.preset.id) {
            setSelectedPreset(data.preset);
          }
        }
      },
      {
        channel: 'preset-manager:presetDeleted',
        handler: (event, data) => {
          setPresets(prev => prev.filter(p => p.id !== data.presetId));
          if (selectedPreset?.id === data.presetId) {
            setSelectedPreset(null);
          }
        }
      },
      {
        channel: 'preset-manager:presetsImported',
        handler: () => {
          loadPresets();
        }
      },
      {
        channel: 'preset-template:templateCreated',
        handler: (event, data) => {
          setTemplates(prev => [...prev, data.template]);
        }
      }
    ];

    // Register listeners
    listeners.forEach(({ channel, handler }) => {
      ipcRenderer.on(channel, handler);
    });

    ipcListenersRef.current = listeners;

    return () => {
      // Cleanup listeners
      listeners.forEach(({ channel, handler }) => {
        ipcRenderer.removeListener(channel, handler);
      });
    };
  }, [enableRealTimeUpdates, loadPresets, selectedPreset]);

  /**
   * Initial load
   */
  useEffect(() => {
    if (autoLoad) {
      loadPresets();
      loadTemplates();
    }
  }, [autoLoad, loadPresets, loadTemplates]);

  /**
   * Reload when filters change
   */
  useEffect(() => {
    if (autoLoad) {
      loadPresets();
    }
  }, [filterCategory, searchQuery, sortBy, sortOrder, loadPresets, autoLoad]);

  /**
   * Filtered and sorted presets
   */
  const filteredPresets = presets.filter(preset => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        preset.name.toLowerCase().includes(query) ||
        preset.description?.toLowerCase().includes(query) ||
        preset.category?.toLowerCase().includes(query) ||
        preset.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }
    return true;
  });

  return {
    // State
    presets: filteredPresets,
    templates,
    loading,
    error,
    selectedPreset,
    searchQuery,
    filterCategory,
    sortBy,
    sortOrder,

    // Actions
    setSelectedPreset,
    setSearchQuery,
    setFilterCategory,
    setSortBy,
    setSortOrder,
    setError,

    // Operations
    loadPresets,
    loadTemplates,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    createFromTemplate,
    createTemplate,
    importPresets,
    exportPresets,
    searchPresets,
    validatePreset,
    getStatistics,

    // Computed
    hasPresets: presets.length > 0,
    hasTemplates: templates.length > 0,
    isFiltered: searchQuery || filterCategory,
    presetCount: presets.length,
    templateCount: templates.length
  };
};

/**
 * Hook for managing a single preset
 */
export const usePreset = (presetId) => {
  const [preset, setPreset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadPreset = useCallback(async () => {
    if (!presetId) return;

    try {
      setLoading(true);
      setError(null);

      if (!ipcRenderer) {
        console.warn('IPC not available, preset loading not supported in web mode');
        setError('Preset loading not available in web mode');
        return;
      }

      const result = await ipcRenderer.invoke('preset-manager:getPreset', presetId);
      
      if (result.success) {
        setPreset(result.preset);
      } else {
        throw new Error(result.error || 'Failed to load preset');
      }
    } catch (err) {
      console.error('Error loading preset:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [presetId]);

  useEffect(() => {
    loadPreset();
  }, [loadPreset]);

  return {
    preset,
    loading,
    error,
    reload: loadPreset
  };
};

/**
 * Hook for preset categories
 */
export const usePresetCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      
      if (!ipcRenderer) {
        console.warn('IPC not available, using default categories in web mode');
        setCategories(['General', 'Image', 'Video', 'Audio', 'Document']);
        return;
      }
      
      const result = await ipcRenderer.invoke('preset-manager:getCategories');
      
      if (result.success) {
        setCategories(result.categories || []);
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  return {
    categories,
    loading,
    reload: loadCategories
  };
};

export default useConversionPresets;