/**
 * Test suite for ConversionPresetManager
 * Tests preset CRUD operations, validation, and storage functionality
 */

const { ConversionPresetManager } = require('../services/ConversionPresetManager.js');
const { ConversionPreset, PresetEvents } = require('../models/ConversionPreset.js');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// Mock electron API
const mockElectronAPI = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  getFileInfo: jest.fn(),
  validateFile: jest.fn(),
  copyFile: jest.fn(),
  deleteFile: jest.fn(),
  createDirectory: jest.fn(),
  pathExists: jest.fn()
};

// Mock window.electronAPI
global.window = {
  electronAPI: mockElectronAPI
};

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn(),
    stat: jest.fn()
  },
  constants: {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2
  }
}));

describe('ConversionPresetManager', () => {
  let presetManager;
  let mockEventEmitter;

  beforeEach(() => {
    mockEventEmitter = new EventEmitter();
    presetManager = new ConversionPresetManager();
    presetManager.eventEmitter = mockEventEmitter;
    jest.clearAllMocks();
  });

  afterEach(() => {
    presetManager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      expect(presetManager).toBeInstanceOf(ConversionPresetManager);
      expect(presetManager.presets).toEqual([]);
      expect(presetManager.templates).toEqual([]);
    });

    it('should load existing presets on initialization', async () => {
      const mockPresets = [
        {
          id: '1',
          name: 'Test Preset',
          category: 'Image',
          settings: { quality: 80 },
          createdAt: new Date().toISOString()
        }
      ];

      mockElectronAPI.pathExists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue({
        success: true,
        data: { content: JSON.stringify(mockPresets) }
      });

      await presetManager.initialize();

      expect(presetManager.presets).toHaveLength(1);
      expect(presetManager.presets[0].name).toBe('Test Preset');
    });
  });

  describe('createPreset', () => {
    it('should create a new preset successfully', async () => {
      const presetData = {
        name: 'New Preset',
        category: 'Image',
        description: 'Test preset',
        settings: {
          format: 'jpg',
          quality: 85
        }
      };

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      const result = await presetManager.createPreset(presetData);

      expect(result.success).toBe(true);
      expect(result.preset.name).toBe('New Preset');
      expect(result.preset.id).toBeDefined();
      expect(presetManager.presets).toHaveLength(1);
    });

    it('should validate preset data before creation', async () => {
      const invalidPresetData = {
        // Missing required name field
        category: 'Image',
        settings: {}
      };

      const result = await presetManager.createPreset(invalidPresetData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Name is required');
      expect(presetManager.presets).toHaveLength(0);
    });

    it('should prevent duplicate preset names', async () => {
      const presetData = {
        name: 'Duplicate Preset',
        category: 'Image',
        settings: { quality: 80 }
      };

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      // Create first preset
      await presetManager.createPreset(presetData);

      // Try to create duplicate
      const result = await presetManager.createPreset(presetData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
      expect(presetManager.presets).toHaveLength(1);
    });

    it('should emit presetCreated event', async () => {
      const presetData = {
        name: 'Event Test Preset',
        category: 'Image',
        settings: { quality: 90 }
      };

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      const eventSpy = jest.fn();
      mockEventEmitter.on(PresetEvents.PRESET_CREATED, eventSpy);

      await presetManager.createPreset(presetData);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        preset: expect.objectContaining({ name: 'Event Test Preset' })
      }));
    });
  });

  describe('updatePreset', () => {
    beforeEach(async () => {
      // Create a preset to update
      const presetData = {
        name: 'Original Preset',
        category: 'Image',
        settings: { quality: 80 }
      };

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      await presetManager.createPreset(presetData);
    });

    it('should update existing preset successfully', async () => {
      const presetId = presetManager.presets[0].id;
      const updateData = {
        name: 'Updated Preset',
        settings: { quality: 95 }
      };

      const result = await presetManager.updatePreset(presetId, updateData);

      expect(result.success).toBe(true);
      expect(result.preset.name).toBe('Updated Preset');
      expect(result.preset.settings.quality).toBe(95);
      expect(result.preset.updatedAt).toBeDefined();
    });

    it('should handle non-existent preset ID', async () => {
      const result = await presetManager.updatePreset('non-existent-id', {
        name: 'Updated Name'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should emit presetUpdated event', async () => {
      const presetId = presetManager.presets[0].id;
      const eventSpy = jest.fn();
      mockEventEmitter.on(PresetEvents.PRESET_UPDATED, eventSpy);

      await presetManager.updatePreset(presetId, { name: 'Event Updated' });

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        preset: expect.objectContaining({ name: 'Event Updated' })
      }));
    });
  });

  describe('deletePreset', () => {
    beforeEach(async () => {
      // Create presets to delete
      const presetData1 = {
        name: 'Preset 1',
        category: 'Image',
        settings: { quality: 80 }
      };
      const presetData2 = {
        name: 'Preset 2',
        category: 'Video',
        settings: { bitrate: 1000 }
      };

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      await presetManager.createPreset(presetData1);
      await presetManager.createPreset(presetData2);
    });

    it('should delete preset successfully', async () => {
      const presetId = presetManager.presets[0].id;
      const initialCount = presetManager.presets.length;

      const result = await presetManager.deletePreset(presetId);

      expect(result.success).toBe(true);
      expect(presetManager.presets).toHaveLength(initialCount - 1);
      expect(presetManager.getPreset(presetId)).toBeNull();
    });

    it('should handle non-existent preset ID', async () => {
      const result = await presetManager.deletePreset('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should emit presetDeleted event', async () => {
      const presetId = presetManager.presets[0].id;
      const eventSpy = jest.fn();
      mockEventEmitter.on(PresetEvents.PRESET_DELETED, eventSpy);

      await presetManager.deletePreset(presetId);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        presetId: presetId
      }));
    });
  });

  describe('getPresets', () => {
    beforeEach(async () => {
      // Create test presets
      const presets = [
        { name: 'Image Preset 1', category: 'Image', settings: { quality: 80 } },
        { name: 'Image Preset 2', category: 'Image', settings: { quality: 90 } },
        { name: 'Video Preset 1', category: 'Video', settings: { bitrate: 1000 } }
      ];

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      for (const preset of presets) {
        await presetManager.createPreset(preset);
      }
    });

    it('should return all presets when no filter is applied', () => {
      const result = presetManager.getPresets();

      expect(result.success).toBe(true);
      expect(result.presets).toHaveLength(3);
    });

    it('should filter presets by category', () => {
      const result = presetManager.getPresets({ category: 'Image' });

      expect(result.success).toBe(true);
      expect(result.presets).toHaveLength(2);
      expect(result.presets.every(p => p.category === 'Image')).toBe(true);
    });

    it('should search presets by name', () => {
      const result = presetManager.getPresets({ search: 'Video' });

      expect(result.success).toBe(true);
      expect(result.presets).toHaveLength(1);
      expect(result.presets[0].name).toContain('Video');
    });

    it('should sort presets by name', () => {
      const result = presetManager.getPresets({ sortBy: 'name', sortOrder: 'asc' });

      expect(result.success).toBe(true);
      expect(result.presets[0].name).toBe('Image Preset 1');
      expect(result.presets[1].name).toBe('Image Preset 2');
      expect(result.presets[2].name).toBe('Video Preset 1');
    });
  });

  describe('duplicatePreset', () => {
    beforeEach(async () => {
      const presetData = {
        name: 'Original Preset',
        category: 'Image',
        description: 'Original description',
        settings: { quality: 80 }
      };

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      await presetManager.createPreset(presetData);
    });

    it('should duplicate preset with new name', async () => {
      const originalId = presetManager.presets[0].id;
      const result = await presetManager.duplicatePreset(originalId, 'Duplicated Preset');

      expect(result.success).toBe(true);
      expect(result.preset.name).toBe('Duplicated Preset');
      expect(result.preset.id).not.toBe(originalId);
      expect(result.preset.settings).toEqual(presetManager.presets[0].settings);
      expect(presetManager.presets).toHaveLength(2);
    });

    it('should handle non-existent preset ID', async () => {
      const result = await presetManager.duplicatePreset('non-existent-id', 'New Name');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('importPresets', () => {
    it('should import presets from file successfully', async () => {
      const importData = [
        {
          name: 'Imported Preset 1',
          category: 'Image',
          settings: { quality: 85 }
        },
        {
          name: 'Imported Preset 2',
          category: 'Video',
          settings: { bitrate: 2000 }
        }
      ];

      mockElectronAPI.readFile.mockResolvedValue({
        success: true,
        data: { content: JSON.stringify(importData) }
      });
      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      const result = await presetManager.importPresets('/test/import.json');

      expect(result.success).toBe(true);
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(presetManager.presets).toHaveLength(2);
    });

    it('should handle invalid import file format', async () => {
      mockElectronAPI.readFile.mockResolvedValue({
        success: true,
        data: { content: 'invalid json' }
      });

      const result = await presetManager.importPresets('/test/invalid.json');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid file format');
    });

    it('should skip duplicate presets during import', async () => {
      // Create existing preset
      await presetManager.createPreset({
        name: 'Existing Preset',
        category: 'Image',
        settings: { quality: 80 }
      });

      const importData = [
        {
          name: 'Existing Preset', // Duplicate
          category: 'Image',
          settings: { quality: 90 }
        },
        {
          name: 'New Preset',
          category: 'Video',
          settings: { bitrate: 1000 }
        }
      ];

      mockElectronAPI.readFile.mockResolvedValue({
        success: true,
        data: { content: JSON.stringify(importData) }
      });
      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      const result = await presetManager.importPresets('/test/import.json');

      expect(result.success).toBe(true);
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(presetManager.presets).toHaveLength(2);
    });
  });

  describe('exportPresets', () => {
    beforeEach(async () => {
      // Create test presets
      const presets = [
        { name: 'Export Preset 1', category: 'Image', settings: { quality: 80 } },
        { name: 'Export Preset 2', category: 'Video', settings: { bitrate: 1000 } }
      ];

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      for (const preset of presets) {
        await presetManager.createPreset(preset);
      }
    });

    it('should export all presets successfully', async () => {
      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/export.json' }
      });

      const result = await presetManager.exportPresets('/test/export.json');

      expect(result.success).toBe(true);
      expect(result.exported).toBe(2);
      expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
        '/test/export.json',
        expect.stringContaining('Export Preset 1'),
        expect.any(Object)
      );
    });

    it('should export specific presets by IDs', async () => {
      const presetId = presetManager.presets[0].id;
      
      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/export.json' }
      });

      const result = await presetManager.exportPresets('/test/export.json', [presetId]);

      expect(result.success).toBe(true);
      expect(result.exported).toBe(1);
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      // Create test presets with usage data
      const presets = [
        { name: 'Popular Preset', category: 'Image', settings: { quality: 80 } },
        { name: 'Unused Preset', category: 'Image', settings: { quality: 90 } },
        { name: 'Video Preset', category: 'Video', settings: { bitrate: 1000 } }
      ];

      mockElectronAPI.writeFile.mockResolvedValue({
        success: true,
        data: { filePath: '/test/presets.json' }
      });

      for (const preset of presets) {
        await presetManager.createPreset(preset);
      }

      // Simulate usage
      presetManager.presets[0].usageCount = 10;
      presetManager.presets[0].lastUsed = new Date().toISOString();
    });

    it('should return comprehensive statistics', () => {
      const stats = presetManager.getStatistics();

      expect(stats.totalPresets).toBe(3);
      expect(stats.categoryCounts.Image).toBe(2);
      expect(stats.categoryCounts.Video).toBe(1);
      expect(stats.mostUsedPreset.name).toBe('Popular Preset');
      expect(stats.totalUsage).toBe(10);
    });
  });

  describe('validatePreset', () => {
    it('should validate correct preset data', () => {
      const validPreset = {
        name: 'Valid Preset',
        category: 'Image',
        settings: {
          format: 'jpg',
          quality: 85
        }
      };

      const result = presetManager.validatePreset(validPreset);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidPreset = {
        category: 'Image',
        settings: {}
      };

      const result = presetManager.validatePreset(invalidPreset);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name is required');
    });

    it('should validate settings structure', () => {
      const invalidPreset = {
        name: 'Invalid Settings',
        category: 'Image',
        settings: 'not an object'
      };

      const result = presetManager.validatePreset(invalidPreset);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Settings must be an object');
    });
  });
});