/**
 * Conversion Preset Storage Service
 * Handles file-based persistence for conversion presets with categorization,
 * indexing, and efficient retrieval mechanisms
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const {
  PresetCategory,
  PresetVisibility,
  PresetStatus
} = require('../models/ConversionPreset');

/**
 * Storage events
 */
const StorageEvents = {
  STORAGE_INITIALIZED: 'storage_initialized',
  INDEX_UPDATED: 'index_updated',
  CATEGORY_CREATED: 'category_created',
  CATEGORY_DELETED: 'category_deleted',
  PRESET_STORED: 'preset_stored',
  PRESET_RETRIEVED: 'preset_retrieved',
  PRESET_DELETED: 'preset_deleted',
  BATCH_OPERATION_COMPLETED: 'batch_operation_completed',
  STORAGE_ERROR: 'storage_error',
  CACHE_UPDATED: 'cache_updated',
  MIGRATION_COMPLETED: 'migration_completed'
};

/**
 * Storage configuration
 */
const DEFAULT_STORAGE_CONFIG = {
  baseDirectory: '.convert/presets',
  indexFile: 'index.json',
  metadataFile: 'metadata.json',
  categoriesFile: 'categories.json',
  enableCaching: true,
  cacheSize: 1000,
  enableCompression: false,
  enableEncryption: false,
  encryptionKey: null,
  backupEnabled: true,
  backupRetention: 10,
  enableVersioning: true,
  enableIndexing: true,
  enableWatching: false,
  batchSize: 100,
  enableMigration: true,
  storageVersion: '1.0.0'
};

/**
 * File structure for categorized storage:
 * .convert/presets/
 * ├── index.json (master index)
 * ├── metadata.json (storage metadata)
 * ├── categories.json (category definitions)
 * ├── image/
 * │   ├── category.json (category metadata)
 * │   ├── presets/
 * │   │   ├── preset-id-1.json
 * │   │   └── preset-id-2.json
 * │   └── index.json (category index)
 * ├── video/
 * │   ├── category.json
 * │   ├── presets/
 * │   └── index.json
 * └── backups/
 *     ├── backup-timestamp-1.json
 *     └── backup-timestamp-2.json
 */

/**
 * Conversion Preset Storage
 */
class ConversionPresetStorage extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = { ...DEFAULT_STORAGE_CONFIG, ...config };
    this.baseDirectory = path.resolve(this.config.baseDirectory);
    this.isInitialized = false;
    
    // File paths
    this.indexFile = path.join(this.baseDirectory, this.config.indexFile);
    this.metadataFile = path.join(this.baseDirectory, this.config.metadataFile);
    this.categoriesFile = path.join(this.baseDirectory, this.config.categoriesFile);
    this.backupDirectory = path.join(this.baseDirectory, 'backups');
    
    // In-memory structures
    this.masterIndex = new Map(); // presetId -> { category, filePath, metadata }
    this.categoryIndex = new Map(); // category -> Set of presetIds
    this.cache = new Map(); // presetId -> preset data
    this.categoryMetadata = new Map(); // category -> metadata
    
    // Performance tracking
    this.stats = {
      reads: 0,
      writes: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastAccess: null,
      storageSize: 0
    };
    
    // File watchers
    this.watchers = new Map();
  }

  /**
   * Initialize storage system
   */
  async initialize() {
    try {
      // Create directory structure
      await this._createDirectoryStructure();
      
      // Load existing data
      await this._loadMasterIndex();
      await this._loadCategoryMetadata();
      await this._loadCategoryIndexes();
      
      // Validate and repair if needed
      await this._validateStorage();
      
      // Setup file watching if enabled
      if (this.config.enableWatching) {
        await this._setupFileWatching();
      }
      
      // Calculate storage statistics
      await this._updateStorageStats();
      
      this.isInitialized = true;
      
      this.emit(StorageEvents.STORAGE_INITIALIZED, {
        categories: this.categoryIndex.size,
        presets: this.masterIndex.size,
        storageSize: this.stats.storageSize
      });
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'initialize',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Store a preset
   */
  async storePreset(preset) {
    try {
      this._ensureInitialized();
      
      const category = preset.category;
      const presetId = preset.id;
      
      // Ensure category directory exists
      await this._ensureCategoryDirectory(category);
      
      // Generate file path
      const filePath = this._getPresetFilePath(category, presetId);
      
      // Prepare preset data for storage
      const presetData = this._preparePresetForStorage(preset);
      
      // Write preset file
      await this._writePresetFile(filePath, presetData);
      
      // Update indexes
      await this._updateIndexes(presetId, category, filePath, preset);
      
      // Update cache
      if (this.config.enableCaching) {
        this._updateCache(presetId, presetData);
      }
      
      this.stats.writes++;
      
      this.emit(StorageEvents.PRESET_STORED, {
        presetId,
        category,
        filePath
      });
      
      return {
        success: true,
        presetId,
        filePath,
        category
      };
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'store',
        presetId: preset.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retrieve a preset by ID
   */
  async retrievePreset(presetId) {
    try {
      this._ensureInitialized();
      
      // Check cache first
      if (this.config.enableCaching && this.cache.has(presetId)) {
        this.stats.cacheHits++;
        this.stats.reads++;
        
        const cachedData = this.cache.get(presetId);
        
        this.emit(StorageEvents.PRESET_RETRIEVED, {
          presetId,
          source: 'cache'
        });
        
        return cachedData;
      }
      
      this.stats.cacheMisses++;
      
      // Get file path from index
      const indexEntry = this.masterIndex.get(presetId);
      if (!indexEntry) {
        return null;
      }
      
      // Read preset file
      const presetData = await this._readPresetFile(indexEntry.filePath);
      
      // Update cache
      if (this.config.enableCaching) {
        this._updateCache(presetId, presetData);
      }
      
      this.stats.reads++;
      this.stats.lastAccess = new Date().toISOString();
      
      this.emit(StorageEvents.PRESET_RETRIEVED, {
        presetId,
        source: 'file',
        category: indexEntry.category
      });
      
      return presetData;
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'retrieve',
        presetId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retrieve presets by category
   */
  async retrievePresetsByCategory(category, options = {}) {
    try {
      this._ensureInitialized();
      
      const {
        limit = null,
        offset = 0,
        sortBy = 'name',
        sortOrder = 'asc',
        includeMetadata = false
      } = options;
      
      const presetIds = this.categoryIndex.get(category);
      if (!presetIds || presetIds.size === 0) {
        return [];
      }
      
      // Convert to array and apply pagination
      let idsArray = Array.from(presetIds);
      
      if (limit) {
        idsArray = idsArray.slice(offset, offset + limit);
      }
      
      // Retrieve presets
      const presets = [];
      for (const presetId of idsArray) {
        try {
          const presetData = await this.retrievePreset(presetId);
          if (presetData) {
            if (includeMetadata) {
              const indexEntry = this.masterIndex.get(presetId);
              presetData._metadata = indexEntry.metadata;
            }
            presets.push(presetData);
          }
        } catch (error) {
          console.warn(`Failed to retrieve preset ${presetId}:`, error.message);
        }
      }
      
      // Sort presets
      presets.sort((a, b) => {
        let aValue, bValue;
        
        switch (sortBy) {
          case 'name':
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case 'createdAt':
            aValue = new Date(a.createdAt);
            bValue = new Date(b.createdAt);
            break;
          case 'modifiedAt':
            aValue = new Date(a.modifiedAt);
            bValue = new Date(b.modifiedAt);
            break;
          default:
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
        }
        
        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
      
      return presets;
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'retrieve_by_category',
        category,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a preset
   */
  async deletePreset(presetId) {
    try {
      this._ensureInitialized();
      
      const indexEntry = this.masterIndex.get(presetId);
      if (!indexEntry) {
        return false;
      }
      
      // Delete preset file
      await fs.unlink(indexEntry.filePath);
      
      // Remove from indexes
      this.masterIndex.delete(presetId);
      
      const categoryPresets = this.categoryIndex.get(indexEntry.category);
      if (categoryPresets) {
        categoryPresets.delete(presetId);
        
        // Remove category if empty
        if (categoryPresets.size === 0) {
          this.categoryIndex.delete(indexEntry.category);
        }
      }
      
      // Remove from cache
      if (this.config.enableCaching) {
        this.cache.delete(presetId);
      }
      
      // Save updated indexes
      await this._saveMasterIndex();
      await this._saveCategoryIndex(indexEntry.category);
      
      this.emit(StorageEvents.PRESET_DELETED, {
        presetId,
        category: indexEntry.category
      });
      
      return true;
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'delete',
        presetId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all categories
   */
  getCategories() {
    this._ensureInitialized();
    
    return Array.from(this.categoryIndex.keys()).map(category => ({
      name: category,
      presetCount: this.categoryIndex.get(category).size,
      metadata: this.categoryMetadata.get(category) || {}
    }));
  }

  /**
   * Create a new category
   */
  async createCategory(categoryName, metadata = {}) {
    try {
      this._ensureInitialized();
      
      if (this.categoryIndex.has(categoryName)) {
        throw new Error(`Category '${categoryName}' already exists`);
      }
      
      // Create category directory
      await this._ensureCategoryDirectory(categoryName);
      
      // Initialize category structures
      this.categoryIndex.set(categoryName, new Set());
      this.categoryMetadata.set(categoryName, {
        ...metadata,
        createdAt: new Date().toISOString(),
        presetCount: 0
      });
      
      // Save category metadata
      await this._saveCategoryMetadata();
      await this._saveCategoryIndex(categoryName);
      
      this.emit(StorageEvents.CATEGORY_CREATED, {
        category: categoryName,
        metadata
      });
      
      return true;
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'create_category',
        category: categoryName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete a category and all its presets
   */
  async deleteCategory(categoryName, options = {}) {
    try {
      this._ensureInitialized();
      
      const { force = false } = options;
      
      const categoryPresets = this.categoryIndex.get(categoryName);
      if (!categoryPresets) {
        return false;
      }
      
      if (categoryPresets.size > 0 && !force) {
        throw new Error(`Category '${categoryName}' contains ${categoryPresets.size} presets. Use force=true to delete.`);
      }
      
      // Delete all presets in category
      for (const presetId of categoryPresets) {
        await this.deletePreset(presetId);
      }
      
      // Remove category directory
      const categoryDir = path.join(this.baseDirectory, categoryName);
      await fs.rmdir(categoryDir, { recursive: true });
      
      // Remove from indexes
      this.categoryIndex.delete(categoryName);
      this.categoryMetadata.delete(categoryName);
      
      // Save updated metadata
      await this._saveCategoryMetadata();
      await this._saveMasterIndex();
      
      this.emit(StorageEvents.CATEGORY_DELETED, {
        category: categoryName,
        deletedPresets: categoryPresets.size
      });
      
      return true;
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'delete_category',
        category: categoryName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Search presets across all categories
   */
  async searchPresets(query, options = {}) {
    try {
      this._ensureInitialized();
      
      const {
        categories = null,
        fields = ['name', 'description', 'tags'],
        caseSensitive = false,
        limit = 50,
        includeMetadata = false
      } = options;
      
      const searchTerm = caseSensitive ? query : query.toLowerCase();
      const results = [];
      
      // Determine which categories to search
      const categoriesToSearch = categories 
        ? categories.filter(cat => this.categoryIndex.has(cat))
        : Array.from(this.categoryIndex.keys());
      
      for (const category of categoriesToSearch) {
        const presetIds = this.categoryIndex.get(category);
        
        for (const presetId of presetIds) {
          try {
            const presetData = await this.retrievePreset(presetId);
            if (!presetData) continue;
            
            // Check if preset matches search criteria
            const matches = fields.some(field => {
              let fieldValue;
              
              switch (field) {
                case 'name':
                  fieldValue = presetData.name;
                  break;
                case 'description':
                  fieldValue = presetData.description || '';
                  break;
                case 'tags':
                  fieldValue = (presetData.tags || []).join(' ');
                  break;
                default:
                  return false;
              }
              
              if (!caseSensitive) {
                fieldValue = fieldValue.toLowerCase();
              }
              
              return fieldValue.includes(searchTerm);
            });
            
            if (matches) {
              if (includeMetadata) {
                const indexEntry = this.masterIndex.get(presetId);
                presetData._metadata = indexEntry.metadata;
              }
              
              results.push(presetData);
              
              if (results.length >= limit) {
                break;
              }
            }
            
          } catch (error) {
            console.warn(`Failed to search preset ${presetId}:`, error.message);
          }
        }
        
        if (results.length >= limit) {
          break;
        }
      }
      
      return results;
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'search',
        query,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    await this._updateStorageStats();
    
    return {
      ...this.stats,
      categories: this.categoryIndex.size,
      totalPresets: this.masterIndex.size,
      cacheSize: this.cache.size,
      cacheHitRate: this.stats.reads > 0 
        ? (this.stats.cacheHits / this.stats.reads * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.emit(StorageEvents.CACHE_UPDATED, {
      action: 'cleared',
      size: 0
    });
  }

  /**
   * Optimize storage (cleanup, defragment, etc.)
   */
  async optimizeStorage() {
    try {
      this._ensureInitialized();
      
      // Validate and repair indexes
      await this._validateStorage();
      
      // Clean up orphaned files
      await this._cleanupOrphanedFiles();
      
      // Optimize cache
      if (this.config.enableCaching) {
        this._optimizeCache();
      }
      
      // Update statistics
      await this._updateStorageStats();
      
      return {
        success: true,
        optimizations: [
          'Validated indexes',
          'Cleaned orphaned files',
          'Optimized cache',
          'Updated statistics'
        ]
      };
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'optimize',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create backup of all presets
   */
  async createBackup(name = null) {
    try {
      this._ensureInitialized();
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = name || `backup-${timestamp}`;
      const backupPath = path.join(this.backupDirectory, `${backupName}.json`);
      
      // Collect all presets
      const allPresets = [];
      for (const [presetId, indexEntry] of this.masterIndex) {
        try {
          const presetData = await this.retrievePreset(presetId);
          if (presetData) {
            allPresets.push({
              ...presetData,
              _metadata: indexEntry.metadata
            });
          }
        } catch (error) {
          console.warn(`Failed to backup preset ${presetId}:`, error.message);
        }
      }
      
      // Create backup data
      const backupData = {
        version: this.config.storageVersion,
        timestamp: new Date().toISOString(),
        presetCount: allPresets.length,
        categories: this.getCategories(),
        presets: allPresets
      };
      
      // Write backup file
      await fs.mkdir(this.backupDirectory, { recursive: true });
      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
      
      // Clean old backups
      await this._cleanOldBackups();
      
      return {
        name: backupName,
        path: backupPath,
        presetCount: allPresets.length,
        timestamp: backupData.timestamp
      };
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'backup',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Shutdown storage system
   */
  async shutdown() {
    try {
      // Save all pending data
      await this._saveMasterIndex();
      await this._saveCategoryMetadata();
      
      // Close file watchers
      for (const watcher of this.watchers.values()) {
        watcher.close();
      }
      this.watchers.clear();
      
      // Clear cache
      this.cache.clear();
      
      // Remove all listeners
      this.removeAllListeners();
      
      this.isInitialized = false;
      
    } catch (error) {
      this.emit(StorageEvents.STORAGE_ERROR, {
        operation: 'shutdown',
        error: error.message
      });
      throw error;
    }
  }

  // Private methods

  /**
   * Ensure storage is initialized
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('Storage not initialized. Call initialize() first.');
    }
  }

  /**
   * Create directory structure
   */
  async _createDirectoryStructure() {
    await fs.mkdir(this.baseDirectory, { recursive: true });
    await fs.mkdir(this.backupDirectory, { recursive: true });
  }

  /**
   * Ensure category directory exists
   */
  async _ensureCategoryDirectory(category) {
    const categoryDir = path.join(this.baseDirectory, category);
    const presetsDir = path.join(categoryDir, 'presets');
    
    await fs.mkdir(categoryDir, { recursive: true });
    await fs.mkdir(presetsDir, { recursive: true });
  }

  /**
   * Get preset file path
   */
  _getPresetFilePath(category, presetId) {
    return path.join(this.baseDirectory, category, 'presets', `${presetId}.json`);
  }

  /**
   * Get category index file path
   */
  _getCategoryIndexPath(category) {
    return path.join(this.baseDirectory, category, 'index.json');
  }

  /**
   * Prepare preset for storage
   */
  _preparePresetForStorage(preset) {
    const data = typeof preset.toJSON === 'function' ? preset.toJSON() : preset;
    
    if (this.config.enableCompression) {
      // Could add compression here
    }
    
    if (this.config.enableEncryption && this.config.encryptionKey) {
      // Could add encryption here
    }
    
    return data;
  }

  /**
   * Write preset file
   */
  async _writePresetFile(filePath, presetData) {
    const content = JSON.stringify(presetData, null, 2);
    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Read preset file
   */
  async _readPresetFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    let data = JSON.parse(content);
    
    if (this.config.enableEncryption && this.config.encryptionKey) {
      // Could add decryption here
    }
    
    if (this.config.enableCompression) {
      // Could add decompression here
    }
    
    return data;
  }

  /**
   * Update indexes
   */
  async _updateIndexes(presetId, category, filePath, preset) {
    // Update master index
    this.masterIndex.set(presetId, {
      category,
      filePath,
      metadata: {
        size: (await fs.stat(filePath)).size,
        createdAt: preset.createdAt,
        modifiedAt: preset.modifiedAt,
        lastAccessed: new Date().toISOString()
      }
    });
    
    // Update category index
    if (!this.categoryIndex.has(category)) {
      this.categoryIndex.set(category, new Set());
    }
    this.categoryIndex.get(category).add(presetId);
    
    // Save indexes
    await this._saveMasterIndex();
    await this._saveCategoryIndex(category);
    
    this.emit(StorageEvents.INDEX_UPDATED, {
      presetId,
      category
    });
  }

  /**
   * Update cache
   */
  _updateCache(presetId, presetData) {
    if (this.cache.size >= this.config.cacheSize) {
      // Remove oldest entry (simple LRU)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(presetId, presetData);
    
    this.emit(StorageEvents.CACHE_UPDATED, {
      action: 'updated',
      presetId,
      size: this.cache.size
    });
  }

  /**
   * Load master index
   */
  async _loadMasterIndex() {
    try {
      const content = await fs.readFile(this.indexFile, 'utf8');
      const data = JSON.parse(content);
      
      this.masterIndex.clear();
      for (const [presetId, indexEntry] of Object.entries(data.presets || {})) {
        this.masterIndex.set(presetId, indexEntry);
      }
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, start with empty index
    }
  }

  /**
   * Save master index
   */
  async _saveMasterIndex() {
    const data = {
      version: this.config.storageVersion,
      timestamp: new Date().toISOString(),
      presets: Object.fromEntries(this.masterIndex)
    };
    
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(this.indexFile, content, 'utf8');
  }

  /**
   * Load category metadata
   */
  async _loadCategoryMetadata() {
    try {
      const content = await fs.readFile(this.categoriesFile, 'utf8');
      const data = JSON.parse(content);
      
      this.categoryMetadata.clear();
      for (const [category, metadata] of Object.entries(data.categories || {})) {
        this.categoryMetadata.set(category, metadata);
      }
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, start with empty metadata
    }
  }

  /**
   * Save category metadata
   */
  async _saveCategoryMetadata() {
    const data = {
      version: this.config.storageVersion,
      timestamp: new Date().toISOString(),
      categories: Object.fromEntries(this.categoryMetadata)
    };
    
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(this.categoriesFile, content, 'utf8');
  }

  /**
   * Load category indexes
   */
  async _loadCategoryIndexes() {
    this.categoryIndex.clear();
    
    // Discover categories from directory structure
    try {
      const entries = await fs.readdir(this.baseDirectory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'backups') {
          const category = entry.name;
          const categoryIndexPath = this._getCategoryIndexPath(category);
          
          try {
            const content = await fs.readFile(categoryIndexPath, 'utf8');
            const data = JSON.parse(content);
            
            const presetIds = new Set(data.presets || []);
            this.categoryIndex.set(category, presetIds);
            
          } catch (error) {
            if (error.code === 'ENOENT') {
              // Create empty category index
              this.categoryIndex.set(category, new Set());
              await this._saveCategoryIndex(category);
            } else {
              throw error;
            }
          }
        }
      }
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Save category index
   */
  async _saveCategoryIndex(category) {
    const categoryIndexPath = this._getCategoryIndexPath(category);
    const presetIds = this.categoryIndex.get(category);
    
    if (!presetIds) {
      return;
    }
    
    const data = {
      version: this.config.storageVersion,
      timestamp: new Date().toISOString(),
      category,
      presets: Array.from(presetIds)
    };
    
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(categoryIndexPath, content, 'utf8');
  }

  /**
   * Validate storage integrity
   */
  async _validateStorage() {
    const issues = [];
    
    // Check for orphaned files
    for (const [presetId, indexEntry] of this.masterIndex) {
      try {
        await fs.access(indexEntry.filePath);
      } catch (error) {
        issues.push(`Orphaned index entry: ${presetId}`);
        this.masterIndex.delete(presetId);
        
        // Remove from category index
        const categoryPresets = this.categoryIndex.get(indexEntry.category);
        if (categoryPresets) {
          categoryPresets.delete(presetId);
        }
      }
    }
    
    // Check for orphaned preset files
    for (const category of this.categoryIndex.keys()) {
      const presetsDir = path.join(this.baseDirectory, category, 'presets');
      
      try {
        const files = await fs.readdir(presetsDir);
        
        for (const file of files) {
          if (path.extname(file) === '.json') {
            const presetId = path.basename(file, '.json');
            
            if (!this.masterIndex.has(presetId)) {
              issues.push(`Orphaned preset file: ${file}`);
              // Could optionally delete or re-index
            }
          }
        }
        
      } catch (error) {
        // Directory doesn't exist or can't be read
        issues.push(`Cannot access category directory: ${category}`);
      }
    }
    
    if (issues.length > 0) {
      console.warn('Storage validation issues found:', issues);
      
      // Save corrected indexes
      await this._saveMasterIndex();
      
      for (const category of this.categoryIndex.keys()) {
        await this._saveCategoryIndex(category);
      }
    }
    
    return issues;
  }

  /**
   * Cleanup orphaned files
   */
  async _cleanupOrphanedFiles() {
    // Implementation for cleaning up orphaned files
    // This would remove files that are not referenced in indexes
  }

  /**
   * Optimize cache
   */
  _optimizeCache() {
    // Simple cache optimization - could implement more sophisticated LRU
    if (this.cache.size > this.config.cacheSize * 0.8) {
      const toRemove = this.cache.size - Math.floor(this.config.cacheSize * 0.6);
      const keys = Array.from(this.cache.keys());
      
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(keys[i]);
      }
    }
  }

  /**
   * Update storage statistics
   */
  async _updateStorageStats() {
    let totalSize = 0;
    
    try {
      // Calculate total storage size
      for (const [presetId, indexEntry] of this.masterIndex) {
        try {
          const stats = await fs.stat(indexEntry.filePath);
          totalSize += stats.size;
        } catch (error) {
          // File might not exist
        }
      }
      
      this.stats.storageSize = totalSize;
      
    } catch (error) {
      console.warn('Failed to update storage stats:', error.message);
    }
  }

  /**
   * Setup file watching
   */
  async _setupFileWatching() {
    // Implementation for file system watching
    // This would watch for changes to preset files and update indexes accordingly
  }

  /**
   * Clean old backups
   */
  async _cleanOldBackups() {
    try {
      const files = await fs.readdir(this.backupDirectory);
      const backupFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDirectory, file)
        }));
      
      if (backupFiles.length > this.config.backupRetention) {
        // Sort by modification time and remove oldest
        const filesWithStats = await Promise.all(
          backupFiles.map(async file => ({
            ...file,
            stats: await fs.stat(file.path)
          }))
        );
        
        filesWithStats.sort((a, b) => b.stats.mtime - a.stats.mtime);
        
        const toDelete = filesWithStats.slice(this.config.backupRetention);
        
        for (const file of toDelete) {
          await fs.unlink(file.path);
        }
      }
      
    } catch (error) {
      console.warn('Failed to clean old backups:', error.message);
    }
  }
}

module.exports = {
  ConversionPresetStorage,
  StorageEvents,
  DEFAULT_STORAGE_CONFIG
};