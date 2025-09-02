/**
 * Preset Manager Component
 * Main interface for managing conversion presets
 */

import React, { useState, useCallback, useRef } from 'react';
import { useConversionPresets, usePresetCategories } from '../hooks/useConversionPresets';

const PresetManager = ({ onPresetSelect, selectedPresetId, showTemplates = true }) => {
  // Hooks
  const {
    presets,
    templates,
    loading,
    error,
    selectedPreset,
    searchQuery,
    filterCategory,
    sortBy,
    sortOrder,
    setSelectedPreset,
    setSearchQuery,
    setFilterCategory,
    setSortBy,
    setSortOrder,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    createFromTemplate,
    createTemplate,
    importPresets,
    exportPresets,
    validatePreset,
    getStatistics
  } = useConversionPresets();

  const { categories } = usePresetCategories();

  // Local state
  const [activeTab, setActiveTab] = useState('presets');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState(null);
  const [selectedPresets, setSelectedPresets] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState(null);
  const [statistics, setStatistics] = useState(null);

  // Refs
  const fileInputRef = useRef(null);

  /**
   * Handle preset selection
   */
  const handlePresetSelect = useCallback((preset) => {
    setSelectedPreset(preset);
    if (onPresetSelect) {
      onPresetSelect(preset);
    }
  }, [setSelectedPreset, onPresetSelect]);

  /**
   * Handle preset creation
   */
  const handleCreatePreset = useCallback(async (presetData) => {
    try {
      const newPreset = await createPreset(presetData);
      setShowCreateModal(false);
      handlePresetSelect(newPreset);
      return newPreset;
    } catch (err) {
      console.error('Failed to create preset:', err);
      throw err;
    }
  }, [createPreset, handlePresetSelect]);

  /**
   * Handle preset editing
   */
  const handleEditPreset = useCallback((preset) => {
    setEditingPreset(preset);
    setShowEditModal(true);
  }, []);

  /**
   * Handle preset update
   */
  const handleUpdatePreset = useCallback(async (updates) => {
    try {
      if (!editingPreset) return;
      
      const updatedPreset = await updatePreset(editingPreset.id, updates);
      setShowEditModal(false);
      setEditingPreset(null);
      
      if (selectedPreset?.id === editingPreset.id) {
        setSelectedPreset(updatedPreset);
      }
      
      return updatedPreset;
    } catch (err) {
      console.error('Failed to update preset:', err);
      throw err;
    }
  }, [editingPreset, updatePreset, selectedPreset, setSelectedPreset]);

  /**
   * Handle preset deletion
   */
  const handleDeletePreset = useCallback((preset) => {
    setPresetToDelete(preset);
    setShowDeleteConfirm(true);
  }, []);

  /**
   * Confirm preset deletion
   */
  const confirmDeletePreset = useCallback(async () => {
    try {
      if (!presetToDelete) return;
      
      await deletePreset(presetToDelete.id);
      setShowDeleteConfirm(false);
      setPresetToDelete(null);
      
      // Remove from selection if selected
      setSelectedPresets(prev => {
        const newSet = new Set(prev);
        newSet.delete(presetToDelete.id);
        return newSet;
      });
    } catch (err) {
      console.error('Failed to delete preset:', err);
    }
  }, [presetToDelete, deletePreset]);

  /**
   * Handle preset duplication
   */
  const handleDuplicatePreset = useCallback(async (preset) => {
    try {
      const duplicated = await duplicatePreset(preset.id, {
        newName: `${preset.name} (Copy)`
      });
      handlePresetSelect(duplicated);
    } catch (err) {
      console.error('Failed to duplicate preset:', err);
    }
  }, [duplicatePreset, handlePresetSelect]);

  /**
   * Handle template creation
   */
  const handleCreateTemplate = useCallback(async (preset, templateOptions) => {
    try {
      await createTemplate(preset.id, templateOptions);
      setShowTemplateModal(false);
    } catch (err) {
      console.error('Failed to create template:', err);
      throw err;
    }
  }, [createTemplate]);

  /**
   * Handle creating preset from template
   */
  const handleCreateFromTemplate = useCallback(async (template, customizations) => {
    try {
      const newPreset = await createFromTemplate(template.id, customizations);
      handlePresetSelect(newPreset);
      setActiveTab('presets');
    } catch (err) {
      console.error('Failed to create from template:', err);
      throw err;
    }
  }, [createFromTemplate, handlePresetSelect]);

  /**
   * Handle preset import
   */
  const handleImportPresets = useCallback(async (file) => {
    try {
      const result = await importPresets(file.path);
      setShowImportModal(false);
      return result;
    } catch (err) {
      console.error('Failed to import presets:', err);
      throw err;
    }
  }, [importPresets]);

  /**
   * Handle preset export
   */
  const handleExportPresets = useCallback(async () => {
    try {
      const presetIds = selectedPresets.size > 0 
        ? Array.from(selectedPresets)
        : presets.map(p => p.id);
      
      const filePath = await exportPresets(presetIds);
      return filePath;
    } catch (err) {
      console.error('Failed to export presets:', err);
      throw err;
    }
  }, [selectedPresets, presets, exportPresets]);

  /**
   * Handle bulk selection
   */
  const handleBulkSelect = useCallback((presetId, selected) => {
    setSelectedPresets(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(presetId);
      } else {
        newSet.delete(presetId);
      }
      return newSet;
    });
  }, []);

  /**
   * Select all presets
   */
  const handleSelectAll = useCallback(() => {
    setSelectedPresets(new Set(presets.map(p => p.id)));
  }, [presets]);

  /**
   * Clear selection
   */
  const handleClearSelection = useCallback(() => {
    setSelectedPresets(new Set());
  }, []);

  /**
   * Load statistics
   */
  const loadStatistics = useCallback(async () => {
    try {
      const stats = await getStatistics();
      setStatistics(stats);
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  }, [getStatistics]);

  /**
   * Render preset card
   */
  const renderPresetCard = useCallback((preset) => {
    const isSelected = selectedPreset?.id === preset.id || preset.id === selectedPresetId;
    const isBulkSelected = selectedPresets.has(preset.id);

    return (
      <div
        key={preset.id}
        className={`preset-card ${isSelected ? 'selected' : ''} ${isBulkSelected ? 'bulk-selected' : ''}`}
        onClick={() => handlePresetSelect(preset)}
      >
        <div className="preset-card-header">
          <input
            type="checkbox"
            checked={isBulkSelected}
            onChange={(e) => {
              e.stopPropagation();
              handleBulkSelect(preset.id, e.target.checked);
            }}
            className="preset-checkbox"
          />
          <div className="preset-category-badge">
            {preset.category}
          </div>
        </div>
        
        <div className="preset-card-content">
          <h3 className="preset-name">{preset.name}</h3>
          <p className="preset-description">{preset.description}</p>
          
          <div className="preset-tags">
            {preset.tags?.map(tag => (
              <span key={tag} className="preset-tag">{tag}</span>
            ))}
          </div>
          
          <div className="preset-metadata">
            <span className="preset-date">
              {new Date(preset.createdAt).toLocaleDateString()}
            </span>
            <span className="preset-usage">
              Used {preset.metadata?.usage || 0} times
            </span>
          </div>
        </div>
        
        <div className="preset-card-actions">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditPreset(preset);
            }}
            className="preset-action-btn edit"
            title="Edit preset"
          >
            ✏️
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDuplicatePreset(preset);
            }}
            className="preset-action-btn duplicate"
            title="Duplicate preset"
          >
            📋
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeletePreset(preset);
            }}
            className="preset-action-btn delete"
            title="Delete preset"
          >
            🗑️
          </button>
        </div>
      </div>
    );
  }, [selectedPreset, selectedPresetId, selectedPresets, handlePresetSelect, handleBulkSelect, handleEditPreset, handleDuplicatePreset, handleDeletePreset]);

  /**
   * Render template card
   */
  const renderTemplateCard = useCallback((template) => {
    return (
      <div key={template.id} className="template-card">
        <div className="template-card-header">
          <div className="template-type-badge">
            {template.type}
          </div>
          <div className="template-category-badge">
            {template.category}
          </div>
        </div>
        
        <div className="template-card-content">
          <h3 className="template-name">{template.name}</h3>
          <p className="template-description">{template.description}</p>
          
          <div className="template-metadata">
            <span className="template-usage">
              Used {template.metadata?.usage || 0} times
            </span>
            {template.isDefault && (
              <span className="template-default-badge">Default</span>
            )}
          </div>
        </div>
        
        <div className="template-card-actions">
          <button
            onClick={() => handleCreateFromTemplate(template, {})}
            className="template-action-btn create"
          >
            Create Preset
          </button>
        </div>
      </div>
    );
  }, [handleCreateFromTemplate]);

  return (
    <div className="preset-manager">
      {/* Header */}
      <div className="preset-manager-header">
        <div className="header-title">
          <h2>Preset Manager</h2>
          {statistics && (
            <div className="header-stats">
              <span>{statistics.totalPresets} presets</span>
              <span>{statistics.totalTemplates} templates</span>
            </div>
          )}
        </div>
        
        <div className="header-actions">
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create Preset
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary"
          >
            Import
          </button>
          <button
            onClick={handleExportPresets}
            className="btn btn-secondary"
            disabled={selectedPresets.size === 0 && presets.length === 0}
          >
            Export
          </button>
          <button
            onClick={loadStatistics}
            className="btn btn-ghost"
          >
            📊
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="preset-manager-tabs">
        <button
          onClick={() => setActiveTab('presets')}
          className={`tab ${activeTab === 'presets' ? 'active' : ''}`}
        >
          Presets ({presets.length})
        </button>
        {showTemplates && (
          <button
            onClick={() => setActiveTab('templates')}
            className={`tab ${activeTab === 'templates' ? 'active' : ''}`}
          >
            Templates ({templates.length})
          </button>
        )}
      </div>

      {/* Filters and Search */}
      <div className="preset-manager-filters">
        <div className="search-section">
          <input
            type="text"
            placeholder="Search presets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="filter-section">
          <select
            value={filterCategory || ''}
            onChange={(e) => setFilterCategory(e.target.value || null)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="name">Sort by Name</option>
            <option value="createdAt">Sort by Date</option>
            <option value="usage">Sort by Usage</option>
            <option value="category">Sort by Category</option>
          </select>
          
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="sort-order-btn"
            title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        
        <div className="view-section">
          <button
            onClick={() => setViewMode('grid')}
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            title="Grid view"
          >
            ⊞
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            title="List view"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedPresets.size > 0 && (
        <div className="bulk-actions">
          <span className="bulk-count">
            {selectedPresets.size} selected
          </span>
          <button
            onClick={handleClearSelection}
            className="btn btn-ghost btn-sm"
          >
            Clear
          </button>
          <button
            onClick={handleSelectAll}
            className="btn btn-ghost btn-sm"
          >
            Select All
          </button>
          <button
            onClick={handleExportPresets}
            className="btn btn-secondary btn-sm"
          >
            Export Selected
          </button>
        </div>
      )}

      {/* Content */}
      <div className="preset-manager-content">
        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading presets...</p>
          </div>
        )}
        
        {error && (
          <div className="error-state">
            <p>Error: {error}</p>
            <button onClick={() => window.location.reload()} className="btn btn-secondary">
              Retry
            </button>
          </div>
        )}
        
        {!loading && !error && (
          <>
            {activeTab === 'presets' && (
              <div className={`presets-grid ${viewMode}`}>
                {presets.length === 0 ? (
                  <div className="empty-state">
                    <h3>No presets found</h3>
                    <p>Create your first preset to get started</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="btn btn-primary"
                    >
                      Create Preset
                    </button>
                  </div>
                ) : (
                  presets.map(renderPresetCard)
                )}
              </div>
            )}
            
            {activeTab === 'templates' && showTemplates && (
              <div className={`templates-grid ${viewMode}`}>
                {templates.length === 0 ? (
                  <div className="empty-state">
                    <h3>No templates found</h3>
                    <p>Templates help you quickly create presets</p>
                  </div>
                ) : (
                  templates.map(renderTemplateCard)
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <PresetCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePreset}
          categories={categories}
        />
      )}
      
      {showEditModal && editingPreset && (
        <PresetEditModal
          preset={editingPreset}
          onClose={() => {
            setShowEditModal(false);
            setEditingPreset(null);
          }}
          onUpdate={handleUpdatePreset}
          categories={categories}
        />
      )}
      
      {showDeleteConfirm && presetToDelete && (
        <ConfirmDialog
          title="Delete Preset"
          message={`Are you sure you want to delete "${presetToDelete.name}"? This action cannot be undone.`}
          onConfirm={confirmDeletePreset}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setPresetToDelete(null);
          }}
        />
      )}
      
      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImportPresets}
        />
      )}
    </div>
  );
};

/**
 * Preset Create Modal Component
 */
const PresetCreateModal = ({ onClose, onCreate, categories }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    tags: [],
    settings: {}
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      await onCreate(formData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal preset-create-modal">
        <div className="modal-header">
          <h3>Create New Preset</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-content">
          {error && (
            <div className="error-message">{error}</div>
          )}
          
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
              placeholder="Enter preset name"
            />
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              required
            >
              <option value="">Select category</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe this preset"
              rows={3}
            />
          </div>
          
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Creating...' : 'Create Preset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Preset Edit Modal Component
 */
const PresetEditModal = ({ preset, onClose, onUpdate, categories }) => {
  const [formData, setFormData] = useState({
    name: preset.name,
    description: preset.description || '',
    category: preset.category,
    tags: preset.tags || []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      await onUpdate(formData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal preset-edit-modal">
        <div className="modal-header">
          <h3>Edit Preset</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-content">
          {error && (
            <div className="error-message">{error}</div>
          )}
          
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              required
            >
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>
          
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Updating...' : 'Update Preset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Confirm Dialog Component
 */
const ConfirmDialog = ({ title, message, onConfirm, onCancel }) => {
  return (
    <div className="modal-overlay">
      <div className="modal confirm-dialog">
        <div className="modal-header">
          <h3>{title}</h3>
        </div>
        
        <div className="modal-content">
          <p>{message}</p>
        </div>
        
        <div className="modal-actions">
          <button onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn btn-danger">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Import Modal Component
 */
const ImportModal = ({ onClose, onImport }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    
    try {
      setLoading(true);
      setError(null);
      await onImport(selectedFile);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal import-modal">
        <div className="modal-header">
          <h3>Import Presets</h3>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        
        <div className="modal-content">
          {error && (
            <div className="error-message">{error}</div>
          )}
          
          <div className="file-upload-area">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            <div
              className="file-drop-zone"
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? (
                <div className="file-selected">
                  <p>📄 {selectedFile.name}</p>
                  <p className="file-size">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="file-placeholder">
                  <p>Click to select a preset file</p>
                  <p className="file-hint">Supports .json files</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedFile || loading}
            className="btn btn-primary"
          >
            {loading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PresetManager;