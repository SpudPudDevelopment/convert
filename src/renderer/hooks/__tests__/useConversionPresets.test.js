/**
 * Test suite for useConversionPresets hook
 * Tests React hook functionality and IPC integration
 */

import { renderHook, act } from '@testing-library/react';
import { useConversionPresets, usePreset, usePresetCategories } from '../useConversionPresets.js';

// Mock IPC renderer
const mockIpcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn()
};

// Mock window.require for Electron environment
global.window = {
  require: jest.fn(() => ({
    ipcRenderer: mockIpcRenderer
  }))
};

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn()
};

describe('useConversionPresets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useConversionPresets());

      expect(result.current.presets).toEqual([]);
      expect(result.current.templates).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.selectedPreset).toBeNull();
    });

    it('should auto-load presets and templates when autoLoad is true', () => {
      mockIpcRenderer.invoke.mockResolvedValue({
        success: true,
        presets: [],
        templates: []
      });

      renderHook(() => useConversionPresets({ autoLoad: true }));

      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('preset-manager:getPresets', expect.any(Object));
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('preset-template:getTemplates');
    });

    it('should not auto-load when autoLoad is false', () => {
      renderHook(() => useConversionPresets({ autoLoad: false }));

      expect(mockIpcRenderer.invoke).not.toHaveBeenCalled();
    });
  });

  describe('loadPresets', () => {
    it('should load presets successfully', async () => {
      const mockPresets = [
        {
          id: '1',
          name: 'Test Preset',
          category: 'Image',
          settings: { quality: 80 }
        }
      ];

      mockIpcRenderer.invoke.mockResolvedValue({
        success: true,
        presets: mockPresets
      });

      const { result } = renderHook(() => useConversionPresets());

      await act(async () => {
        await result.current.loadPresets();
      });

      expect(result.current.presets).toEqual(mockPresets);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle load errors', async () => {
      const errorMessage = 'Failed to load presets';
      mockIpcRenderer.invoke.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() => useConversionPresets());

      await act(async () => {
        await result.current.loadPresets();
      });

      expect(result.current.presets).toEqual([]);
      expect(result.current.error).toBe(errorMessage);
      expect(result.current.loading).toBe(false);
    });

    it('should handle web mode fallback', async () => {
      // Mock web environment (no window.require)
      const originalRequire = global.window.require;
      global.window.require = undefined;

      const { result } = renderHook(() => useConversionPresets());

      await act(async () => {
        await result.current.loadPresets();
      });

      expect(result.current.presets).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith('IPC not available, using empty preset data in web mode');

      // Restore
      global.window.require = originalRequire;
    });
  });

  describe('createPreset', () => {
    it('should create preset successfully', async () => {
      const newPreset = {
        id: '2',
        name: 'New Preset',
        category: 'Image',
        settings: { quality: 90 }
      };

      mockIpcRenderer.invoke.mockResolvedValue({
        success: true,
        preset: newPreset
      });

      const { result } = renderHook(() => useConversionPresets());

      let createdPreset;
      await act(async () => {
        createdPreset = await result.current.createPreset({
          name: 'New Preset',
          category: 'Image',
          settings: { quality: 90 }
        });
      });

      expect(createdPreset.success).toBe(true);
      expect(createdPreset.preset).toEqual(newPreset);
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('preset-manager:createPreset', expect.any(Object));
    });

    it('should handle creation errors', async () => {
      mockIpcRenderer.invoke.mockResolvedValue({
        success: false,
        error: 'Preset name already exists'
      });

      const { result } = renderHook(() => useConversionPresets());

      let createResult;
      await act(async () => {
        createResult = await result.current.createPreset({
          name: 'Duplicate Preset',
          category: 'Image'
        });
      });

      expect(createResult.success).toBe(false);
      expect(createResult.error).toBe('Preset name already exists');
    });

    it('should handle web mode fallback', async () => {
      const originalRequire = global.window.require;
      global.window.require = undefined;

      const { result } = renderHook(() => useConversionPresets());

      await act(async () => {
        try {
          await result.current.createPreset({ name: 'Test' });
        } catch (error) {
          expect(error.message).toBe('Preset creation not available in web mode');
        }
      });

      expect(console.warn).toHaveBeenCalledWith('IPC not available, preset creation not supported in web mode');

      global.window.require = originalRequire;
    });
  });

  describe('updatePreset', () => {
    it('should update preset successfully', async () => {
      const updatedPreset = {
        id: '1',
        name: 'Updated Preset',
        category: 'Image',
        settings: { quality: 95 }
      };

      mockIpcRenderer.invoke.mockResolvedValue({
        success: true,
        preset: updatedPreset
      });

      const { result } = renderHook(() => useConversionPresets());

      let updateResult;
      await act(async () => {
        updateResult = await result.current.updatePreset('1', {
          name: 'Updated Preset',
          settings: { quality: 95 }
        });
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.preset).toEqual(updatedPreset);
    });
  });

  describe('deletePreset', () => {
    it('should delete preset successfully', async () => {
      mockIpcRenderer.invoke.mockResolvedValue({
        success: true
      });

      const { result } = renderHook(() => useConversionPresets());

      let deleteResult;
      await act(async () => {
        deleteResult = await result.current.deletePreset('1');
      });

      expect(deleteResult.success).toBe(true);
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('preset-manager:deletePreset', '1');
    });
  });

  describe('searchPresets', () => {
    it('should search presets via IPC', async () => {
      const searchResults = [
        {
          id: '1',
          name: 'Matching Preset',
          category: 'Image'
        }
      ];

      mockIpcRenderer.invoke.mockResolvedValue({
        success: true,
        presets: searchResults
      });

      const { result } = renderHook(() => useConversionPresets());

      let searchResult;
      await act(async () => {
        searchResult = await result.current.searchPresets('Matching');
      });

      expect(searchResult.success).toBe(true);
      expect(searchResult.presets).toEqual(searchResults);
    });

    it('should fallback to local search in web mode', async () => {
      const originalRequire = global.window.require;
      global.window.require = undefined;

      const { result } = renderHook(() => useConversionPresets());
      
      // Set some presets in state
      act(() => {
        result.current.presets = [
          { id: '1', name: 'Test Preset', category: 'Image' },
          { id: '2', name: 'Another Preset', category: 'Video' }
        ];
      });

      let searchResult;
      await act(async () => {
        searchResult = await result.current.searchPresets('Test');
      });

      expect(searchResult.success).toBe(true);
      expect(searchResult.presets).toHaveLength(1);
      expect(searchResult.presets[0].name).toBe('Test Preset');

      global.window.require = originalRequire;
    });
  });

  describe('validatePreset', () => {
    it('should validate preset via IPC', async () => {
      const validationResult = {
        success: true,
        validation: {
          isValid: true,
          errors: []
        }
      };

      mockIpcRenderer.invoke.mockResolvedValue(validationResult);

      const { result } = renderHook(() => useConversionPresets());

      let validation;
      await act(async () => {
        validation = await result.current.validatePreset({
          name: 'Valid Preset',
          settings: { quality: 80 }
        });
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should use basic validation in web mode', async () => {
      const originalRequire = global.window.require;
      global.window.require = undefined;

      const { result } = renderHook(() => useConversionPresets());

      let validation;
      await act(async () => {
        validation = await result.current.validatePreset({
          name: 'Test Preset',
          settings: { quality: 80 }
        });
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);

      // Test invalid preset
      await act(async () => {
        validation = await result.current.validatePreset({
          // Missing name
          settings: { quality: 80 }
        });
      });

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Name is required');

      global.window.require = originalRequire;
    });
  });

  describe('filtering and sorting', () => {
    beforeEach(() => {
      mockIpcRenderer.invoke.mockResolvedValue({
        success: true,
        presets: [
          { id: '1', name: 'Alpha Preset', category: 'Image', tags: ['photo'] },
          { id: '2', name: 'Beta Preset', category: 'Video', tags: ['movie'] },
          { id: '3', name: 'Gamma Preset', category: 'Image', tags: ['photo', 'web'] }
        ]
      });
    });

    it('should filter presets by search query', async () => {
      const { result } = renderHook(() => useConversionPresets({ autoLoad: true }));

      await act(async () => {
        result.current.setSearchQuery('Alpha');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].name).toBe('Alpha Preset');
    });

    it('should filter presets by category', async () => {
      const { result } = renderHook(() => useConversionPresets({ autoLoad: true }));

      await act(async () => {
        result.current.setFilterCategory('Image');
      });

      expect(result.current.presets).toHaveLength(2);
      expect(result.current.presets.every(p => p.category === 'Image')).toBe(true);
    });

    it('should search in tags', async () => {
      const { result } = renderHook(() => useConversionPresets({ autoLoad: true }));

      await act(async () => {
        result.current.setSearchQuery('photo');
      });

      expect(result.current.presets).toHaveLength(2);
    });
  });

  describe('real-time updates', () => {
    it('should setup IPC listeners when enableRealTimeUpdates is true', () => {
      renderHook(() => useConversionPresets({ enableRealTimeUpdates: true }));

      expect(mockIpcRenderer.on).toHaveBeenCalledWith('preset-manager:presetCreated', expect.any(Function));
      expect(mockIpcRenderer.on).toHaveBeenCalledWith('preset-manager:presetUpdated', expect.any(Function));
      expect(mockIpcRenderer.on).toHaveBeenCalledWith('preset-manager:presetDeleted', expect.any(Function));
    });

    it('should not setup listeners in web mode', () => {
      const originalRequire = global.window.require;
      global.window.require = undefined;

      renderHook(() => useConversionPresets({ enableRealTimeUpdates: true }));

      expect(mockIpcRenderer.on).not.toHaveBeenCalled();

      global.window.require = originalRequire;
    });

    it('should cleanup listeners on unmount', () => {
      const { unmount } = renderHook(() => useConversionPresets({ enableRealTimeUpdates: true }));

      unmount();

      expect(mockIpcRenderer.removeListener).toHaveBeenCalled();
    });
  });
});

describe('usePreset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load single preset successfully', async () => {
    const mockPreset = {
      id: '1',
      name: 'Single Preset',
      category: 'Image',
      settings: { quality: 80 }
    };

    mockIpcRenderer.invoke.mockResolvedValue({
      success: true,
      preset: mockPreset
    });

    const { result } = renderHook(() => usePreset('1'));

    // Wait for the effect to run
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.preset).toEqual(mockPreset);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle preset not found', async () => {
    mockIpcRenderer.invoke.mockResolvedValue({
      success: false,
      error: 'Preset not found'
    });

    const { result } = renderHook(() => usePreset('non-existent'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.preset).toBeNull();
    expect(result.current.error).toBe('Preset not found');
  });

  it('should handle web mode fallback', async () => {
    const originalRequire = global.window.require;
    global.window.require = undefined;

    const { result } = renderHook(() => usePreset('1'));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.preset).toBeNull();
    expect(result.current.error).toBe('Preset loading not available in web mode');

    global.window.require = originalRequire;
  });
});

describe('usePresetCategories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load categories successfully', async () => {
    const mockCategories = ['Image', 'Video', 'Audio', 'Document'];

    mockIpcRenderer.invoke.mockResolvedValue({
      success: true,
      categories: mockCategories
    });

    const { result } = renderHook(() => usePresetCategories());

    await act(async () => {
      await result.current.loadCategories();
    });

    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.loading).toBe(false);
  });

  it('should use default categories in web mode', async () => {
    const originalRequire = global.window.require;
    global.window.require = undefined;

    const { result } = renderHook(() => usePresetCategories());

    await act(async () => {
      await result.current.loadCategories();
    });

    expect(result.current.categories).toEqual(['General', 'Image', 'Video', 'Audio', 'Document']);
    expect(console.warn).toHaveBeenCalledWith('IPC not available, using default categories in web mode');

    global.window.require = originalRequire;
  });
});