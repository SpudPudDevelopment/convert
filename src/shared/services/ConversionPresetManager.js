/**
 * Conversion Preset Manager Service
 * High-level service for managing conversion presets with CRUD operations,
 * storage, categorization, and business logic
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const {
  ConversionPreset,
  PresetCategoryManager,
  PresetEvents,
  PresetCategory,
  PresetVisibility,
  PresetStatus,
  DEFAULT_PRESETS,
  VALIDATION_SCHEMAS
} = require('../models/ConversionPreset');

/**
 * Manager events
 */
const ManagerEvents = {
  MANAGER_INITIALIZED: 'manager_initialized',
  PRESETS_LOADED: 'presets_loaded',
  PRESETS_SAVED: 'presets_saved',
  PRESET_IMPORTED: 'preset_imported',
  PRESET_EXPORTED: 'preset_exported',
  BULK_OPERATION_COMPLETED: 'bulk_operation_completed',
  STORAGE_ERROR: 'storage_error',
  VALIDATION_ERROR: 'validation_error',
  BACKUP_CREATED: 'backup_created',
  BACKUP_RESTORED: 'backup_restored'
};

/**
 * Storage backends
 */
const StorageBackend = {
  FILE_SYSTEM: 'filesystem',
  MEMORY: 'memory',
  DATABASE: 'database'
};

/**
 * Sort options
 */
const SortOptions = {
  NAME: 'name',
  CREATED_DATE: 'createdAt',
  MODIFIED_DATE: 'modifiedAt',
  USAGE_COUNT: 'usageCount',
  CATEGORY: 'category',
  QUALITY: 'quality'
};

/**
 * Filter options
 */
const FilterOptions = {
  CATEGORY: 'category',
  STATUS: 'status',
  VISIBILITY: 'visibility',
  CREATOR: 'creator',
  TAGS: 'tags',
  FORMAT: 'format'
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  storageBackend: StorageBackend.FILE_SYSTEM,
  storagePath: '.convert/presets',
  backupEnabled: true,
  backupRetention: 10,
  autoSave: true,
  autoSaveInterval: 30000, // 30 seconds
  validateOnLoad: true,
  enableVersioning: true,
  maxPresets: 1000,
  enableSharing: true,
  enableUsageTracking: true,
  enableAutoBackup: true,
  autoBackupInterval: 3600000, // 1 hour
  compressionEnabled: true,
  encryptionEnabled: false,
  encryptionKey: null
};

/**
 * Conversion Preset Manager
 */
class ConversionPresetManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.presets = new Map();
    this.categories = new PresetCategoryManager();
    this.isInitialized = false;
    this.autoSaveTimer = null;
    this.autoBackupTimer = null;
    this.currentUser = null;
    this.userGroups = [];
    
    // Storage path setup
    this.storagePath = path.resolve(this.config.storagePath);
    this.presetsFile = path.join(this.storagePath, 'presets.json');
    this.backupDir = path.join(this.storagePath, 'backups');
    this.metadataFile = path.join(this.storagePath, 'metadata.json');
    
    // Bind methods
    this._handlePresetEvent = this._handlePresetEvent.bind(this);
    this._autoSave = this._autoSave.bind(this);
    this._autoBackup = this._autoBackup.bind(this);
  }

  /**
   * Initialize the preset manager
   */
  async initialize(userId = null, userGroups = []) {
    try {
      this.currentUser = userId;
      this.userGroups = userGroups;
      
      // Ensure storage directory exists
      await this._ensureStorageDirectory();
      
      // Load existing presets
      await this._loadPresets();
      
      // Initialize default presets if none exist
      if (this.presets.size === 0) {
        await this._initializeDefaultPresets();
      }
      
      // Setup auto-save if enabled
      if (this.config.autoSave) {
        this._setupAutoSave();
      }
      
      // Setup auto-backup if enabled
      if (this.config.enableAutoBackup) {
        this._setupAutoBackup();
      }
      
      this.isInitialized = true;
      this.emit(ManagerEvents.MANAGER_INITIALIZED, {
        presetCount: this.presets.size,
        categoryCount: this.categories.getAllCategories().length
      });
      
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'initialize',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create a new preset
   */
  async createPreset(presetData) {
    try {
      // Validate required fields
      if (!presetData.name || !presetData.category || !presetData.settings) {
        throw new Error('Missing required fields: name, category, settings');
      }
      
      // Check for duplicate names within category
      const existingPreset = this._findPresetByName(presetData.name, presetData.category);
      if (existingPreset) {
        throw new Error(`Preset with name '${presetData.name}' already exists in category '${presetData.category}'`);
      }
      
      // Create preset instance
      const preset = new ConversionPreset({
        ...presetData,
        creator: this.currentUser,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
      });
      
      // Validate preset
      const validation = preset.validate();
      if (!validation.isValid) {
        this.emit(ManagerEvents.VALIDATION_ERROR, {
          operation: 'create',
          errors: validation.errors
        });
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Add to collection
      this.presets.set(preset.id, preset);
      
      // Setup event listener
      preset.on(PresetEvents.PRESET_UPDATED, this._handlePresetEvent);
      preset.on(PresetEvents.PRESET_USED, this._handlePresetEvent);
      
      // Auto-save if enabled
      if (this.config.autoSave) {
        await this._savePresets();
      }
      
      this.emit(PresetEvents.PRESET_CREATED, { preset: preset.toJSON() });
      
      return preset;
      
    } catch (error) {
      this.emit(ManagerEvents.VALIDATION_ERROR, {
        operation: 'create',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get preset by ID
   */
  getPreset(id) {
    const preset = this.presets.get(id);
    if (!preset) {
      return null;
    }
    
    // Check access permissions
    if (!preset.hasAccess(this.currentUser, this.userGroups)) {
      return null;
    }
    
    return preset;
  }

  /**
   * Get all presets with optional filtering and sorting
   */
  getPresets(options = {}) {
    const {
      category = null,
      status = null,
      visibility = null,
      creator = null,
      tags = null,
      format = null,
      sortBy = SortOptions.NAME,
      sortOrder = 'asc',
      limit = null,
      offset = 0,
      includeSystem = true
    } = options;
    
    let presets = Array.from(this.presets.values());
    
    // Filter by access permissions
    presets = presets.filter(preset => 
      preset.hasAccess(this.currentUser, this.userGroups)
    );
    
    // Apply filters
    if (category) {
      presets = presets.filter(preset => preset.category === category);
    }
    
    if (status) {
      presets = presets.filter(preset => preset.status === status);
    }
    
    if (visibility) {
      presets = presets.filter(preset => preset.visibility === visibility);
    }
    
    if (creator) {
      presets = presets.filter(preset => preset.creator === creator);
    }
    
    if (tags && tags.length > 0) {
      presets = presets.filter(preset => 
        tags.some(tag => preset.tags.includes(tag))
      );
    }
    
    if (format) {
      presets = presets.filter(preset => 
        preset.settings.format === format
      );
    }
    
    if (!includeSystem) {
      presets = presets.filter(preset => 
        preset.visibility !== PresetVisibility.SYSTEM
      );
    }
    
    // Sort presets
    presets.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case SortOptions.NAME:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case SortOptions.CREATED_DATE:
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        case SortOptions.MODIFIED_DATE:
          aValue = new Date(a.modifiedAt);
          bValue = new Date(b.modifiedAt);
          break;
        case SortOptions.USAGE_COUNT:
          aValue = a.usageStats.totalUses;
          bValue = b.usageStats.totalUses;
          break;
        case SortOptions.CATEGORY:
          aValue = a.category;
          bValue = b.category;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    // Apply pagination
    if (limit) {
      presets = presets.slice(offset, offset + limit);
    }
    
    return presets.map(preset => preset.toJSON());
  }

  /**
   * Update an existing preset
   */
  async updatePreset(id, updates) {
    try {
      const preset = this.presets.get(id);
      if (!preset) {
        throw new Error(`Preset with ID '${id}' not found`);
      }
      
      // Check permissions
      if (!preset.hasAccess(this.currentUser, this.userGroups)) {
        throw new Error('Insufficient permissions to update preset');
      }
      
      // Update preset
      preset.update(updates);
      
      // Auto-save if enabled
      if (this.config.autoSave) {
        await this._savePresets();
      }
      
      return preset;
      
    } catch (error) {
      this.emit(ManagerEvents.VALIDATION_ERROR, {
        operation: 'update',
        presetId: id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a preset
   */
  async deletePreset(id) {
    try {
      const preset = this.presets.get(id);
      if (!preset) {
        throw new Error(`Preset with ID '${id}' not found`);
      }
      
      // Check permissions
      if (!preset.hasAccess(this.currentUser, this.userGroups)) {
        throw new Error('Insufficient permissions to delete preset');
      }
      
      // Remove event listeners
      preset.removeAllListeners();
      
      // Remove from collection
      this.presets.delete(id);
      
      // Auto-save if enabled
      if (this.config.autoSave) {
        await this._savePresets();
      }
      
      this.emit(PresetEvents.PRESET_DELETED, { presetId: id });
      
      return true;
      
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'delete',
        presetId: id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Duplicate a preset
   */
  async duplicatePreset(id, newName = null, modifications = {}) {
    try {
      const originalPreset = this.presets.get(id);
      if (!originalPreset) {
        throw new Error(`Preset with ID '${id}' not found`);
      }
      
      // Check permissions
      if (!originalPreset.hasAccess(this.currentUser, this.userGroups)) {
        throw new Error('Insufficient permissions to duplicate preset');
      }
      
      // Clone the preset
      const clonedPreset = originalPreset.clone(newName, this.currentUser);
      
      // Apply modifications
      if (Object.keys(modifications).length > 0) {
        clonedPreset.update(modifications);
      }
      
      // Add to collection
      this.presets.set(clonedPreset.id, clonedPreset);
      
      // Setup event listener
      clonedPreset.on(PresetEvents.PRESET_UPDATED, this._handlePresetEvent);
      clonedPreset.on(PresetEvents.PRESET_USED, this._handlePresetEvent);
      
      // Auto-save if enabled
      if (this.config.autoSave) {
        await this._savePresets();
      }
      
      this.emit(PresetEvents.PRESET_CREATED, { preset: clonedPreset.toJSON() });
      
      return clonedPreset;
      
    } catch (error) {
      this.emit(ManagerEvents.VALIDATION_ERROR, {
        operation: 'duplicate',
        presetId: id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Import presets from file or data
   */
  async importPresets(source, options = {}) {
    try {
      const {
        overwrite = false,
        validateOnly = false,
        categoryMapping = {},
        ownerOverride = null
      } = options;
      
      let importData;
      
      // Handle different source types
      if (typeof source === 'string') {
        // File path
        const fileContent = await fs.readFile(source, 'utf8');
        importData = JSON.parse(fileContent);
      } else if (typeof source === 'object') {
        // Direct data
        importData = source;
      } else {
        throw new Error('Invalid import source');
      }
      
      const results = {
        imported: 0,
        skipped: 0,
        errors: [],
        presets: []
      };
      
      // Process presets
      const presetsToImport = Array.isArray(importData) ? importData : [importData];
      
      for (const presetData of presetsToImport) {
        try {
          // Apply category mapping
          if (categoryMapping[presetData.category]) {
            presetData.category = categoryMapping[presetData.category];
          }
          
          // Override owner if specified
          if (ownerOverride) {
            presetData.creator = ownerOverride;
          }
          
          // Check for existing preset
          const existingPreset = this._findPresetByName(presetData.name, presetData.category);
          
          if (existingPreset && !overwrite) {
            results.skipped++;
            continue;
          }
          
          if (validateOnly) {
            // Just validate without importing
            const tempPreset = new ConversionPreset(presetData);
            const validation = tempPreset.validate();
            if (!validation.isValid) {
              results.errors.push({
                name: presetData.name,
                errors: validation.errors
              });
            }
          } else {
            // Actually import
            if (existingPreset && overwrite) {
              await this.deletePreset(existingPreset.id);
            }
            
            const importedPreset = await this.createPreset(presetData);
            results.imported++;
            results.presets.push(importedPreset.toJSON());
          }
          
        } catch (error) {
          results.errors.push({
            name: presetData.name || 'Unknown',
            error: error.message
          });
        }
      }
      
      this.emit(ManagerEvents.PRESET_IMPORTED, results);
      
      return results;
      
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'import',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Export presets to file or return data
   */
  async exportPresets(options = {}) {
    try {
      const {
        presetIds = null,
        category = null,
        outputPath = null,
        includeUsageStats = false,
        includeSharing = false,
        format = 'json'
      } = options;
      
      let presetsToExport;
      
      if (presetIds) {
        // Export specific presets
        presetsToExport = presetIds
          .map(id => this.presets.get(id))
          .filter(preset => preset && preset.hasAccess(this.currentUser, this.userGroups));
      } else {
        // Export all accessible presets
        presetsToExport = this.getPresets({ category, includeSystem: false })
          .map(presetData => this.presets.get(presetData.id));
      }
      
      // Convert to export format
      const exportData = presetsToExport.map(preset => 
        preset.export(includeUsageStats, includeSharing)
      );
      
      // Handle output
      if (outputPath) {
        const content = format === 'json' 
          ? JSON.stringify(exportData, null, 2)
          : exportData;
        
        await fs.writeFile(outputPath, content, 'utf8');
        
        this.emit(ManagerEvents.PRESET_EXPORTED, {
          count: exportData.length,
          outputPath
        });
        
        return { success: true, count: exportData.length, path: outputPath };
      } else {
        this.emit(ManagerEvents.PRESET_EXPORTED, {
          count: exportData.length
        });
        
        return exportData;
      }
      
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'export',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get preset statistics
   */
  getStatistics() {
    const stats = {
      total: this.presets.size,
      byCategory: {},
      byStatus: {},
      byVisibility: {},
      totalUsage: 0,
      averageUsage: 0,
      mostUsed: null,
      recentlyCreated: [],
      recentlyModified: []
    };
    
    const accessiblePresets = Array.from(this.presets.values())
      .filter(preset => preset.hasAccess(this.currentUser, this.userGroups));
    
    // Calculate statistics
    accessiblePresets.forEach(preset => {
      // By category
      stats.byCategory[preset.category] = (stats.byCategory[preset.category] || 0) + 1;
      
      // By status
      stats.byStatus[preset.status] = (stats.byStatus[preset.status] || 0) + 1;
      
      // By visibility
      stats.byVisibility[preset.visibility] = (stats.byVisibility[preset.visibility] || 0) + 1;
      
      // Usage statistics
      stats.totalUsage += preset.usageStats.totalUses;
      
      // Most used preset
      if (!stats.mostUsed || preset.usageStats.totalUses > stats.mostUsed.usageStats.totalUses) {
        stats.mostUsed = preset.toJSON();
      }
    });
    
    // Average usage
    stats.averageUsage = accessiblePresets.length > 0 
      ? stats.totalUsage / accessiblePresets.length 
      : 0;
    
    // Recently created (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    stats.recentlyCreated = accessiblePresets
      .filter(preset => new Date(preset.createdAt) > sevenDaysAgo)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10)
      .map(preset => preset.toJSON());
    
    // Recently modified (last 7 days)
    stats.recentlyModified = accessiblePresets
      .filter(preset => new Date(preset.modifiedAt) > sevenDaysAgo)
      .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt))
      .slice(0, 10)
      .map(preset => preset.toJSON());
    
    return stats;
  }

  /**
   * Search presets
   */
  searchPresets(query, options = {}) {
    const {
      category = null,
      searchFields = ['name', 'description', 'tags'],
      caseSensitive = false,
      exactMatch = false,
      limit = 50
    } = options;
    
    const searchTerm = caseSensitive ? query : query.toLowerCase();
    
    let presets = Array.from(this.presets.values())
      .filter(preset => preset.hasAccess(this.currentUser, this.userGroups));
    
    // Filter by category if specified
    if (category) {
      presets = presets.filter(preset => preset.category === category);
    }
    
    // Search in specified fields
    const results = presets.filter(preset => {
      return searchFields.some(field => {
        let fieldValue;
        
        switch (field) {
          case 'name':
            fieldValue = preset.name;
            break;
          case 'description':
            fieldValue = preset.description;
            break;
          case 'tags':
            fieldValue = preset.tags.join(' ');
            break;
          default:
            return false;
        }
        
        if (!caseSensitive) {
          fieldValue = fieldValue.toLowerCase();
        }
        
        return exactMatch 
          ? fieldValue === searchTerm
          : fieldValue.includes(searchTerm);
      });
    });
    
    // Sort by relevance (name matches first, then description, then tags)
    results.sort((a, b) => {
      const aNameMatch = (caseSensitive ? a.name : a.name.toLowerCase()).includes(searchTerm);
      const bNameMatch = (caseSensitive ? b.name : b.name.toLowerCase()).includes(searchTerm);
      
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;
      
      return a.name.localeCompare(b.name);
    });
    
    return results.slice(0, limit).map(preset => preset.toJSON());
  }

  /**
   * Create backup
   */
  async createBackup(name = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = name || `backup-${timestamp}`;
      const backupPath = path.join(this.backupDir, `${backupName}.json`);
      
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Export all presets
      const exportData = await this.exportPresets({
        includeUsageStats: true,
        includeSharing: true
      });
      
      // Create backup metadata
      const backupData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        presetCount: exportData.length,
        creator: this.currentUser,
        presets: exportData
      };
      
      // Write backup file
      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
      
      // Clean old backups if retention limit exceeded
      await this._cleanOldBackups();
      
      this.emit(ManagerEvents.BACKUP_CREATED, {
        name: backupName,
        path: backupPath,
        presetCount: exportData.length
      });
      
      return {
        name: backupName,
        path: backupPath,
        presetCount: exportData.length,
        timestamp: backupData.timestamp
      };
      
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'backup',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Restore from backup
   */
  async restoreBackup(backupPath, options = {}) {
    try {
      const { clearExisting = false, overwrite = false } = options;
      
      // Read backup file
      const backupContent = await fs.readFile(backupPath, 'utf8');
      const backupData = JSON.parse(backupContent);
      
      // Validate backup format
      if (!backupData.presets || !Array.isArray(backupData.presets)) {
        throw new Error('Invalid backup format');
      }
      
      // Clear existing presets if requested
      if (clearExisting) {
        this.presets.clear();
      }
      
      // Import presets from backup
      const results = await this.importPresets(backupData.presets, {
        overwrite,
        ownerOverride: this.currentUser
      });
      
      this.emit(ManagerEvents.BACKUP_RESTORED, {
        backupPath,
        ...results
      });
      
      return results;
      
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'restore',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get available backups
   */
  async getBackups() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      
      const files = await fs.readdir(this.backupDir);
      const backups = [];
      
      for (const file of files) {
        if (path.extname(file) === '.json') {
          const filePath = path.join(this.backupDir, file);
          const stats = await fs.stat(filePath);
          
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            
            backups.push({
              name: path.basename(file, '.json'),
              path: filePath,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime,
              presetCount: data.presetCount || (data.presets ? data.presets.length : 0),
              version: data.version || 'unknown'
            });
          } catch (parseError) {
            // Skip invalid backup files
            continue;
          }
        }
      }
      
      // Sort by creation date (newest first)
      backups.sort((a, b) => new Date(b.created) - new Date(a.created));
      
      return backups;
      
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'list_backups',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Save presets to storage
   */
  async savePresets() {
    await this._savePresets();
  }

  /**
   * Reload presets from storage
   */
  async reloadPresets() {
    await this._loadPresets();
    this.emit(ManagerEvents.PRESETS_LOADED, {
      count: this.presets.size
    });
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    // Clear timers
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
      this.autoBackupTimer = null;
    }
    
    // Save current state
    if (this.config.autoSave) {
      await this._savePresets();
    }
    
    // Remove all listeners
    this.removeAllListeners();
    
    // Clear preset listeners
    for (const preset of this.presets.values()) {
      preset.removeAllListeners();
    }
    
    this.isInitialized = false;
  }

  // Private methods

  /**
   * Ensure storage directory exists
   */
  async _ensureStorageDirectory() {
    await fs.mkdir(this.storagePath, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  /**
   * Load presets from storage
   */
  async _loadPresets() {
    try {
      const content = await fs.readFile(this.presetsFile, 'utf8');
      const data = JSON.parse(content);
      
      this.presets.clear();
      
      for (const presetData of data.presets || []) {
        try {
          const preset = ConversionPreset.fromJSON(presetData);
          
          if (this.config.validateOnLoad) {
            const validation = preset.validate();
            if (!validation.isValid) {
              console.warn(`Invalid preset '${preset.name}':`, validation.errors);
              continue;
            }
          }
          
          this.presets.set(preset.id, preset);
          
          // Setup event listeners
          preset.on(PresetEvents.PRESET_UPDATED, this._handlePresetEvent);
          preset.on(PresetEvents.PRESET_USED, this._handlePresetEvent);
          
        } catch (error) {
          console.warn(`Failed to load preset:`, error.message);
        }
      }
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, start with empty collection
    }
  }

  /**
   * Save presets to storage
   */
  async _savePresets() {
    try {
      const data = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        presets: Array.from(this.presets.values()).map(preset => preset.toJSON())
      };
      
      const content = JSON.stringify(data, null, 2);
      
      if (this.config.compressionEnabled) {
        // Could add compression here if needed
      }
      
      await fs.writeFile(this.presetsFile, content, 'utf8');
      
      this.emit(ManagerEvents.PRESETS_SAVED, {
        count: this.presets.size
      });
      
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'save',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Initialize default presets
   */
  async _initializeDefaultPresets() {
    for (const [category, presets] of Object.entries(DEFAULT_PRESETS)) {
      for (const [name, settings] of Object.entries(presets)) {
        try {
          await this.createPreset({
            name,
            description: `Default ${category} preset for ${name.toLowerCase()}`,
            category,
            settings,
            visibility: PresetVisibility.SYSTEM,
            status: PresetStatus.ACTIVE,
            tags: ['default', 'system', category]
          });
        } catch (error) {
          console.warn(`Failed to create default preset '${name}':`, error.message);
        }
      }
    }
  }

  /**
   * Find preset by name and category
   */
  _findPresetByName(name, category) {
    for (const preset of this.presets.values()) {
      if (preset.name === name && preset.category === category) {
        return preset;
      }
    }
    return null;
  }

  /**
   * Handle preset events
   */
  _handlePresetEvent(event) {
    // Forward preset events
    this.emit(event.type, event.data);
    
    // Trigger auto-save if enabled
    if (this.config.autoSave && 
        [PresetEvents.PRESET_UPDATED, PresetEvents.PRESET_USED].includes(event.type)) {
      // Debounce auto-save
      clearTimeout(this._autoSaveDebounce);
      this._autoSaveDebounce = setTimeout(() => {
        this._savePresets().catch(error => {
          this.emit(ManagerEvents.STORAGE_ERROR, {
            operation: 'auto_save',
            error: error.message
          });
        });
      }, 1000);
    }
  }

  /**
   * Setup auto-save timer
   */
  _setupAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(this._autoSave, this.config.autoSaveInterval);
  }

  /**
   * Auto-save handler
   */
  async _autoSave() {
    try {
      await this._savePresets();
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'auto_save',
        error: error.message
      });
    }
  }

  /**
   * Setup auto-backup timer
   */
  _setupAutoBackup() {
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
    }
    
    this.autoBackupTimer = setInterval(this._autoBackup, this.config.autoBackupInterval);
  }

  /**
   * Auto-backup handler
   */
  async _autoBackup() {
    try {
      await this.createBackup(`auto-backup-${Date.now()}`);
    } catch (error) {
      this.emit(ManagerEvents.STORAGE_ERROR, {
        operation: 'auto_backup',
        error: error.message
      });
    }
  }

  /**
   * Clean old backups
   */
  async _cleanOldBackups() {
    try {
      const backups = await this.getBackups();
      
      if (backups.length > this.config.backupRetention) {
        const toDelete = backups.slice(this.config.backupRetention);
        
        for (const backup of toDelete) {
          await fs.unlink(backup.path);
        }
      }
    } catch (error) {
      // Non-critical error, just log it
      console.warn('Failed to clean old backups:', error.message);
    }
  }
}

module.exports = {
  ConversionPresetManager,
  ManagerEvents,
  StorageBackend,
  SortOptions,
  FilterOptions,
  DEFAULT_CONFIG
};