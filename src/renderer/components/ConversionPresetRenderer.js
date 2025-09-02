/**
 * ConversionPresetRenderer Component
 * React component for managing conversion presets
 */

import React, { useState, useCallback } from 'react';
import { useConversionPresets } from '../hooks/useConversionPresets';
import './PresetManager.css';

const ConversionPresetRenderer = () => {
  const {
    presets,
    templates,
    categories,
    loading,
    error,
    selectedPreset,
    searchQuery,
    filterCategory,
    sortBy,
    sortOrder,
    loadPresets,
    loadTemplates,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    createTemplate,
    createFromTemplate,
    importPresets,
    exportPresets,
    searchPresets,
    validatePreset,
    getStatistics,
    setSelectedPreset,
    setSearchQuery,
    setFilterCategory,
    setSortBy,
    setSortOrder
  } = useConversionPresets();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [operationError, setOperationError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  const handleCreatePreset = useCallback(async (event) => {
    event.preventDefault();
    
    // Clear previous errors
    setValidationErrors({});
    setOperationError(null);
    
    const formData = new FormData(event.target);
    const presetData = {
      name: formData.get('name'),
      description: formData.get('description'),
      category: formData.get('category'),
      settings: {}
    };
    
    // Client-side validation
    const errors = {};
    if (!presetData.name || presetData.name.trim().length === 0) {
      errors.name = 'Preset name is required';
    }
    if (!presetData.category) {
      errors.category = 'Category is required';
    }
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    try {
      const result = await createPreset(presetData);
      if (result.success) {
        setShowCreateModal(false);
        setOperationError(null);
        setValidationErrors({});
      } else {
        setOperationError(result.error || 'Failed to create preset');
      }
    } catch (error) {
      console.error('Failed to create preset:', error);
      setOperationError('An error occurred while creating the preset');
    }
  }, [createPreset]);

  const handleEditPreset = useCallback((preset) => {
    setEditingPreset(preset);
    setShowEditModal(true);
  }, []);

  const handleUpdatePreset = useCallback(async (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(event.target);
      const presetData = {
        name: formData.get('name'),
        description: formData.get('description'),
        category: formData.get('category'),
        settings: editingPreset.settings
      };
      const result = await updatePreset(editingPreset.id, presetData);
      if (result.success) {
        setShowEditModal(false);
        setEditingPreset(null);
        setOperationError(null);
      } else {
        setOperationError(result.error || 'Failed to update preset');
      }
    } catch (error) {
      console.error('Failed to update preset:', error);
      setOperationError('An error occurred while updating the preset');
    }
  }, [updatePreset, editingPreset]);

  const handleDeletePreset = useCallback(async (presetId) => {
    const preset = presets.find(p => p.id === presetId);
    const presetName = preset ? preset.name : 'this preset';
    if (window.confirm(`Are you sure you want to delete "${presetName}"?`)) {
      try {
        await deletePreset(presetId);
      } catch (error) {
        console.error('Failed to delete preset:', error);
      }
    }
  }, [deletePreset, presets]);

  const handleDuplicatePreset = useCallback(async (presetId) => {
    try {
      await duplicatePreset(presetId);
    } catch (error) {
      console.error('Failed to duplicate preset:', error);
    }
  }, [duplicatePreset]);

  const handleSearchChange = useCallback((event) => {
    setSearchQuery(event.target.value);
  }, [setSearchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, [setSearchQuery]);

  const handleCategoryChange = useCallback((event) => {
    setFilterCategory(event.target.value);
  }, [setFilterCategory]);

  const handleSortByChange = useCallback((event) => {
    setSortBy(event.target.value);
  }, [setSortBy]);

  const handleSortOrderChange = useCallback((event) => {
    setSortOrder(event.target.value);
  }, [setSortOrder]);

  if (loading) {
    return (
      <div className="preset-manager loading">
        <div className="loading-spinner">Loading presets...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="preset-manager error">
        <div className="error-message">Error: {error}</div>
        <button onClick={loadPresets} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="preset-manager">
      <div className="preset-header">
        <h2>Conversion Presets</h2>
        <div className="header-actions">
          <button 
            className="create-preset-button"
            onClick={() => setShowCreateModal(true)}
          >
            Create New Preset
          </button>
          <button 
            className="import-button"
            onClick={importPresets}
          >
            Import Presets
          </button>
          <button 
            className="export-button"
            onClick={exportPresets}
          >
            Export Presets
          </button>
        </div>
      </div>

      <div className="preset-controls">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search presets..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="search-input"
            aria-label="Search presets"
          />
          {searchQuery && (
            <button 
              className="clear-search-button"
              onClick={handleClearSearch}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="filter-controls">
          <select 
            value={filterCategory || 'All'}
            onChange={handleCategoryChange}
            className="category-filter"
            aria-label="Filter by category"
          >
            <option value="All">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select 
            value={sortBy}
            onChange={handleSortByChange}
            className="sort-by"
            aria-label="Sort by"
          >
            <option value="name">Name</option>
            <option value="category">Category</option>
            <option value="createdAt">Created Date</option>
            <option value="lastUsedAt">Last Used</option>
          </select>

          <select 
            value={sortOrder}
            onChange={handleSortOrderChange}
            className="sort-order"
            aria-label="Sort order"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      <div className="preset-list">
        {presets.length === 0 ? (
          <div className="empty-state">
            <h3>No presets found</h3>
            <p>Create your first preset to get started</p>
          </div>
        ) : (
          presets.map(preset => (
            <div 
              key={preset.id} 
              className={`preset-item ${selectedPreset?.id === preset.id ? 'selected' : ''}`}
              onClick={() => setSelectedPreset(preset)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedPreset(preset);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Select preset ${preset.name}`}
            >
              <div className="preset-info">
                <h4 className="preset-name">{preset.name}</h4>
                <p className="preset-description">{preset.description}</p>
                <div className="preset-meta">
                  <span className="preset-category">{preset.category}</span>
                  <span className="preset-date">
                    Created: {new Date(preset.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              
              <div className="preset-actions">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditPreset(preset);
                  }}
                  className="edit-button"
                  title="Edit preset"
                  aria-label="Preset actions"
                >
                  Edit
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicatePreset(preset.id);
                  }}
                  className="duplicate-button"
                  title="Duplicate preset"
                >
                  Duplicate
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePreset(preset.id);
                  }}
                  className="delete-button"
                  title="Delete preset"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Templates Section */}
      {templates && templates.length > 0 && (
        <div className="templates-section">
          <h3>Templates</h3>
          <div className="template-list">
            {templates.map(template => (
              <div 
                key={template.id} 
                className="template-item"
                onClick={() => createFromTemplate(template.id)}
              >
                <h4 className="template-name">{template.name}</h4>
                <p className="template-description">{template.description}</p>
                <span className="template-category">{template.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {operationError && (
        <div className="error-message">
          {operationError}
          <button 
            onClick={() => setOperationError(null)}
            className="close-error"
          >
            ×
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create New Preset</h3>
            <form onSubmit={handleCreatePreset}>
              <label htmlFor="preset-name">Preset Name</label>
              <input 
                id="preset-name"
                name="name" 
                placeholder="Preset name" 
                required 
              />
              {validationErrors.name && (
                <div className="field-error">
                  {validationErrors.name}
                </div>
              )}
              <label htmlFor="preset-description">Description</label>
              <textarea 
                id="preset-description"
                name="description" 
                placeholder="Description" 
              />
              <label htmlFor="preset-category">Category</label>
              <select id="preset-category" name="category" required>
                <option value="">Select category</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              {validationErrors.category && (
                <div className="field-error">
                  {validationErrors.category}
                </div>
              )}
              {operationError && (
                <div className="modal-error">
                  {operationError}
                </div>
              )}
              <div className="modal-actions">
                <button type="submit">Create Preset</button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowCreateModal(false);
                    setOperationError(null);
                    setValidationErrors({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingPreset && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Edit Preset</h3>
            <form onSubmit={handleUpdatePreset}>
              <label htmlFor="edit-preset-name">Preset Name</label>
              <input 
                id="edit-preset-name"
                name="name" 
                defaultValue={editingPreset.name}
                placeholder="Preset name" 
                required 
              />
              <label htmlFor="edit-preset-description">Description</label>
              <textarea 
                id="edit-preset-description"
                name="description" 
                defaultValue={editingPreset.description}
                placeholder="Description" 
              />
              <label htmlFor="edit-preset-category">Category</label>
              <select 
                id="edit-preset-category"
                name="category" 
                defaultValue={editingPreset.category}
                required
              >
                <option value="">Select category</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              {operationError && (
                <div className="modal-error">
                  {operationError}
                </div>
              )}
              <div className="modal-actions">
                <button type="submit">Update Preset</button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingPreset(null);
                    setOperationError(null);
                    setValidationErrors({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversionPresetRenderer;