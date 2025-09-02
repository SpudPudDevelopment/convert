/**
 * useConversionPresets Hook
 * React hook for managing conversion presets
 */

const { useState, useEffect, useCallback } = require('react');
const { ConversionPresetManager } = require('../services/ConversionPresetManager');
const { PresetEvents } = require('../models/ConversionPreset');

/**
 * Hook for managing conversion presets
 */
function useConversionPresets() {
  const [presets, setPresets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [presetManager] = useState(() => new ConversionPresetManager());

  // Load categories
  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const categoriesData = await presetManager.getCategories();
      setCategories(categoriesData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [presetManager]);

  // Load presets
  const loadPresets = useCallback(async (category = null) => {
    try {
      setLoading(true);
      setError(null);
      const presetsData = category 
        ? await presetManager.getPresetsByCategory(category)
        : await presetManager.getAllPresets();
      setPresets(presetsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [presetManager]);

  // Create preset
  const createPreset = useCallback(async (presetData) => {
    try {
      setLoading(true);
      setError(null);
      const newPreset = await presetManager.createPreset(presetData);
      setPresets(prev => [...prev, newPreset]);
      return newPreset;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [presetManager]);

  // Update preset
  const updatePreset = useCallback(async (id, updates) => {
    try {
      setLoading(true);
      setError(null);
      const updatedPreset = await presetManager.updatePreset(id, updates);
      setPresets(prev => prev.map(p => p.id === id ? updatedPreset : p));
      return updatedPreset;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [presetManager]);

  // Delete preset
  const deletePreset = useCallback(async (id) => {
    try {
      setLoading(true);
      setError(null);
      await presetManager.deletePreset(id);
      setPresets(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [presetManager]);

  // Duplicate preset
  const duplicatePreset = useCallback(async (id, newName) => {
    try {
      setLoading(true);
      setError(null);
      const duplicatedPreset = await presetManager.duplicatePreset(id, newName);
      setPresets(prev => [...prev, duplicatedPreset]);
      return duplicatedPreset;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [presetManager]);

  // Get preset by ID
  const getPreset = useCallback(async (id) => {
    try {
      return await presetManager.getPreset(id);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [presetManager]);

  // Use preset
  const usePreset = useCallback(async (id) => {
    try {
      const preset = await presetManager.usePreset(id);
      // Update usage statistics
      setPresets(prev => prev.map(p => 
        p.id === id ? { ...p, usageCount: (p.usageCount || 0) + 1, lastUsedAt: Date.now() } : p
      ));
      return preset;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [presetManager]);

  // Setup event listeners
  useEffect(() => {
    const handlePresetCreated = (preset) => {
      setPresets(prev => [...prev, preset]);
    };

    const handlePresetUpdated = (preset) => {
      setPresets(prev => prev.map(p => p.id === preset.id ? preset : p));
    };

    const handlePresetDeleted = (presetId) => {
      setPresets(prev => prev.filter(p => p.id !== presetId));
    };

    presetManager.on(PresetEvents.PRESET_CREATED, handlePresetCreated);
    presetManager.on(PresetEvents.PRESET_UPDATED, handlePresetUpdated);
    presetManager.on(PresetEvents.PRESET_DELETED, handlePresetDeleted);

    return () => {
      presetManager.off(PresetEvents.PRESET_CREATED, handlePresetCreated);
      presetManager.off(PresetEvents.PRESET_UPDATED, handlePresetUpdated);
      presetManager.off(PresetEvents.PRESET_DELETED, handlePresetDeleted);
    };
  }, [presetManager]);

  return {
    presets,
    categories,
    loading,
    error,
    loadCategories,
    loadPresets,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    getPreset,
    usePreset,
    presetManager
  };
}

module.exports = { useConversionPresets };