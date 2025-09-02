/**
 * usePresetCategories Hook
 * Manages preset categories with CRUD operations and state management
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PresetCategoryManager } from '../../shared/models/ConversionPreset';

/**
 * Hook for managing preset categories
 * @returns {Object} Category management state and operations
 */
export const usePresetCategories = () => {
  // State
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryStats, setCategoryStats] = useState({});

  // Category manager instance
  const categoryManager = useMemo(() => new PresetCategoryManager(), []);

  /**
   * Load all categories
   */
  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get categories from IPC
      const result = await window.electronAPI.invoke('preset-categories-get-all');
      
      if (result.success) {
        setCategories(result.categories || []);
        setCategoryStats(result.stats || {});
      } else {
        throw new Error(result.error || 'Failed to load categories');
      }
    } catch (err) {
      console.error('Error loading categories:', err);
      setError(err.message);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new category
   * @param {Object} categoryData - Category data
   * @returns {Promise<Object>} Created category
   */
  const createCategory = useCallback(async (categoryData) => {
    try {
      setError(null);
      
      // Validate category data
      const validation = categoryManager.validateCategory(categoryData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Create category via IPC
      const result = await window.electronAPI.invoke('preset-categories-create', categoryData);
      
      if (result.success) {
        // Update local state
        setCategories(prev => [...prev, result.category]);
        setCategoryStats(prev => ({
          ...prev,
          [result.category.id]: { presetCount: 0, lastUsed: null }
        }));
        
        return result.category;
      } else {
        throw new Error(result.error || 'Failed to create category');
      }
    } catch (err) {
      console.error('Error creating category:', err);
      setError(err.message);
      throw err;
    }
  }, [categoryManager]);

  /**
   * Update an existing category
   * @param {string} categoryId - Category ID
   * @param {Object} updates - Category updates
   * @returns {Promise<Object>} Updated category
   */
  const updateCategory = useCallback(async (categoryId, updates) => {
    try {
      setError(null);
      
      // Find existing category
      const existingCategory = categories.find(cat => cat.id === categoryId);
      if (!existingCategory) {
        throw new Error('Category not found');
      }
      
      // Merge updates
      const updatedData = { ...existingCategory, ...updates };
      
      // Validate updated data
      const validation = categoryManager.validateCategory(updatedData);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Update category via IPC
      const result = await window.electronAPI.invoke('preset-categories-update', categoryId, updates);
      
      if (result.success) {
        // Update local state
        setCategories(prev => prev.map(cat => 
          cat.id === categoryId ? result.category : cat
        ));
        
        return result.category;
      } else {
        throw new Error(result.error || 'Failed to update category');
      }
    } catch (err) {
      console.error('Error updating category:', err);
      setError(err.message);
      throw err;
    }
  }, [categories, categoryManager]);

  /**
   * Delete a category
   * @param {string} categoryId - Category ID
   * @param {Object} options - Delete options
   * @returns {Promise<boolean>} Success status
   */
  const deleteCategory = useCallback(async (categoryId, options = {}) => {
    try {
      setError(null);
      
      // Check if category exists
      const category = categories.find(cat => cat.id === categoryId);
      if (!category) {
        throw new Error('Category not found');
      }
      
      // Check if category has presets
      const stats = categoryStats[categoryId];
      if (stats && stats.presetCount > 0 && !options.force) {
        throw new Error(`Category "${category.name}" contains ${stats.presetCount} presets. Use force option to delete.`);
      }
      
      // Delete category via IPC
      const result = await window.electronAPI.invoke('preset-categories-delete', categoryId, options);
      
      if (result.success) {
        // Update local state
        setCategories(prev => prev.filter(cat => cat.id !== categoryId));
        setCategoryStats(prev => {
          const newStats = { ...prev };
          delete newStats[categoryId];
          return newStats;
        });
        
        return true;
      } else {
        throw new Error(result.error || 'Failed to delete category');
      }
    } catch (err) {
      console.error('Error deleting category:', err);
      setError(err.message);
      throw err;
    }
  }, [categories, categoryStats]);

  /**
   * Get category by ID
   * @param {string} categoryId - Category ID
   * @returns {Object|null} Category or null if not found
   */
  const getCategoryById = useCallback((categoryId) => {
    return categories.find(cat => cat.id === categoryId) || null;
  }, [categories]);

  /**
   * Get categories by type
   * @param {string} type - Category type
   * @returns {Array} Filtered categories
   */
  const getCategoriesByType = useCallback((type) => {
    return categories.filter(cat => cat.type === type);
  }, [categories]);

  /**
   * Get default category for a type
   * @param {string} type - Category type
   * @returns {Object|null} Default category or null
   */
  const getDefaultCategory = useCallback((type) => {
    return categories.find(cat => cat.type === type && cat.isDefault) || null;
  }, [categories]);

  /**
   * Search categories
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   * @returns {Array} Filtered categories
   */
  const searchCategories = useCallback((query, filters = {}) => {
    let filtered = [...categories];
    
    // Text search
    if (query && query.trim()) {
      const searchTerm = query.toLowerCase().trim();
      filtered = filtered.filter(cat => 
        cat.name.toLowerCase().includes(searchTerm) ||
        cat.description.toLowerCase().includes(searchTerm) ||
        (cat.tags && cat.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
      );
    }
    
    // Type filter
    if (filters.type) {
      filtered = filtered.filter(cat => cat.type === filters.type);
    }
    
    // Visibility filter
    if (filters.visibility) {
      filtered = filtered.filter(cat => cat.visibility === filters.visibility);
    }
    
    // Custom filter
    if (filters.isCustom !== undefined) {
      filtered = filtered.filter(cat => cat.isCustom === filters.isCustom);
    }
    
    return filtered;
  }, [categories]);

  /**
   * Get category statistics
   * @param {string} categoryId - Category ID
   * @returns {Object} Category statistics
   */
  const getCategoryStats = useCallback((categoryId) => {
    return categoryStats[categoryId] || { presetCount: 0, lastUsed: null };
  }, [categoryStats]);

  /**
   * Refresh category statistics
   */
  const refreshStats = useCallback(async () => {
    try {
      const result = await window.electronAPI.invoke('preset-categories-get-stats');
      if (result.success) {
        setCategoryStats(result.stats || {});
      }
    } catch (err) {
      console.error('Error refreshing category stats:', err);
    }
  }, []);

  /**
   * Reset categories to defaults
   */
  const resetToDefaults = useCallback(async () => {
    try {
      setError(null);
      
      const result = await window.electronAPI.invoke('preset-categories-reset-defaults');
      
      if (result.success) {
        setCategories(result.categories || []);
        setCategoryStats(result.stats || {});
        return true;
      } else {
        throw new Error(result.error || 'Failed to reset categories');
      }
    } catch (err) {
      console.error('Error resetting categories:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Computed values
  const categoriesByType = useMemo(() => {
    const grouped = {};
    categories.forEach(cat => {
      if (!grouped[cat.type]) {
        grouped[cat.type] = [];
      }
      grouped[cat.type].push(cat);
    });
    return grouped;
  }, [categories]);

  const totalCategories = categories.length;
  const customCategories = categories.filter(cat => cat.isCustom).length;
  const defaultCategories = categories.filter(cat => cat.isDefault).length;

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Listen for category updates from main process
  useEffect(() => {
    const handleCategoryUpdate = (event, data) => {
      switch (data.type) {
        case 'category-created':
          setCategories(prev => [...prev, data.category]);
          break;
        case 'category-updated':
          setCategories(prev => prev.map(cat => 
            cat.id === data.category.id ? data.category : cat
          ));
          break;
        case 'category-deleted':
          setCategories(prev => prev.filter(cat => cat.id !== data.categoryId));
          break;
        case 'stats-updated':
          setCategoryStats(prev => ({ ...prev, ...data.stats }));
          break;
        default:
          break;
      }
    };

    // Register IPC listener
    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on('preset-categories-updated', handleCategoryUpdate);
    }

    // Cleanup
    return () => {
      if (window.electronAPI && window.electronAPI.removeListener) {
        window.electronAPI.removeListener('preset-categories-updated', handleCategoryUpdate);
      }
    };
  }, []);

  return {
    // State
    categories,
    loading,
    error,
    categoryStats,
    
    // Computed
    categoriesByType,
    totalCategories,
    customCategories,
    defaultCategories,
    
    // Operations
    loadCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getCategoryById,
    getCategoriesByType,
    getDefaultCategory,
    searchCategories,
    getCategoryStats,
    refreshStats,
    resetToDefaults,
    
    // Utilities
    categoryManager
  };
};

export default usePresetCategories;