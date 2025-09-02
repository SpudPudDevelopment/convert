const { PreferencesAPI } = require('../../shared/api/PreferencesAPI');
const { PreferencesValidator } = require('../../shared/api/PreferencesValidator');
const { PreferencesCache } = require('../../shared/api/PreferencesCache');
const { PreferencesEventSystem } = require('../../shared/api/PreferencesEventSystem');
const { UserPreferences } = require('../../shared/models/UserPreferences');

// Mock UserPreferences
jest.mock('../../shared/models/UserPreferences', () => {
  class MockUserPreferences {
    constructor(data = {}) {
      this.theme = data.theme || 'system';
      this.quality = data.quality || 'medium';
      this.outputFormat = data.outputFormat || 'mp4';
      this.autoSave = data.autoSave || false;
      this.advanced = data.advanced || {
        maxConcurrentJobs: 2,
        tempDirectory: '/tmp',
        enableHardwareAcceleration: true
      };
      this.recentJobs = data.recentJobs || [];
      this.savedPresets = data.savedPresets || [];
      this.recentJobsSettings = data.recentJobsSettings || {
        maxCount: 100,
        maxAge: 2592000000,
        autoCleanup: true
      };
    }

    getPreference(path) {
      const keys = path.split('.');
      let value = this;
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return undefined;
        }
      }
      return value;
    }

    setPreference(path, value) {
      const keys = path.split('.');
      const lastKey = keys.pop();
      let target = this;
      
      for (const key of keys) {
        if (!(key in target)) {
          target[key] = {};
        }
        target = target[key];
      }
      
      target[lastKey] = value;
      return true;
    }

    updatePreferences(updates) {
      for (const [path, value] of Object.entries(updates)) {
        this.setPreference(path, value);
      }
      return { success: true, updated: Object.keys(updates) };
    }

    resetPreferences(paths) {
      if (!paths) {
        // Reset all to defaults
        Object.assign(this, new MockUserPreferences());
      } else {
        const defaults = new MockUserPreferences();
        for (const path of paths) {
          const defaultValue = defaults.getPreference(path);
          if (defaultValue !== undefined) {
            this.setPreference(path, defaultValue);
          }
        }
      }
      return { success: true, reset: paths || 'all' };
    }

    validate() {
      return { valid: true, errors: [] };
    }

    toJSON() {
      return {
        theme: this.theme,
        quality: this.quality,
        outputFormat: this.outputFormat,
        autoSave: this.autoSave,
        advanced: this.advanced,
        recentJobs: this.recentJobs,
        savedPresets: this.savedPresets,
        recentJobsSettings: this.recentJobsSettings
      };
    }

    static fromJSON(data) {
      return new MockUserPreferences(data);
    }

    static createDefault() {
      return new MockUserPreferences();
    }
  }

  return { UserPreferences: MockUserPreferences };
});

describe('PreferencesAPI', () => {
  let api;
  let mockUserPreferences;
  let mockValidator;
  let mockCache;
  let mockEventSystem;

  beforeEach(() => {
    // Create mock instances
    mockUserPreferences = new UserPreferences();
    mockValidator = new PreferencesValidator();
    mockCache = new PreferencesCache();
    mockEventSystem = new PreferencesEventSystem();

    // Create API instance
    api = new PreferencesAPI({
      enableCache: true,
      enableValidation: true,
      enableEvents: true
    });
  });

  afterEach(() => {
    if (api) {
      api.removeAllListeners();
    }
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should create instance with default options', () => {
      const defaultApi = new PreferencesAPI();
      expect(defaultApi).toBeInstanceOf(PreferencesAPI);
      expect(defaultApi.options.enableCache).toBe(true);
      expect(defaultApi.options.enableValidation).toBe(true);
      expect(defaultApi.options.enableEvents).toBe(true);
    });

    test('should create instance with custom options', () => {
      const customApi = new PreferencesAPI({
        enableCache: false,
        enableValidation: false,
        enableEvents: false,
        validator: mockValidator,
        cache: mockCache,
        eventSystem: mockEventSystem
      });

      expect(customApi.options.enableCache).toBe(false);
      expect(customApi.options.enableValidation).toBe(false);
      expect(customApi.options.enableEvents).toBe(false);
    });

    test('should initialize with EventEmitter capabilities', () => {
      expect(typeof api.on).toBe('function');
      expect(typeof api.emit).toBe('function');
      expect(typeof api.removeListener).toBe('function');
    });
  });

  describe('initialize', () => {
    test('should initialize with user preferences', async () => {
      const result = await api.initialize(mockUserPreferences);
      
      expect(result.success).toBe(true);
      expect(api.userPreferences).toBe(mockUserPreferences);
      expect(api.initialized).toBe(true);
    });

    test('should initialize with validation when enabled', async () => {
      const spy = jest.spyOn(mockUserPreferences, 'validate');
      
      await api.initialize(mockUserPreferences, {
        validateOnInit: true
      });
      
      expect(spy).toHaveBeenCalled();
    });

    test('should handle initialization errors', async () => {
      const invalidPrefs = null;
      
      const result = await api.initialize(invalidPrefs);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(api.initialized).toBe(false);
    });

    test('should emit initialization events', async () => {
      const eventSpy = jest.fn();
      api.on('initialized', eventSpy);
      
      await api.initialize(mockUserPreferences);
      
      expect(eventSpy).toHaveBeenCalledWith({
        type: 'initialized',
        timestamp: expect.any(Number),
        success: true
      });
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should get simple preference value', () => {
      const theme = api.get('theme');
      expect(theme).toBe('system');
    });

    test('should get nested preference value', () => {
      const maxJobs = api.get('advanced.maxConcurrentJobs');
      expect(maxJobs).toBe(2);
    });

    test('should return undefined for non-existent preference', () => {
      const nonExistent = api.get('nonExistent');
      expect(nonExistent).toBeUndefined();
    });

    test('should return default value when preference not found', () => {
      const value = api.get('nonExistent', { default: 'defaultValue' });
      expect(value).toBe('defaultValue');
    });

    test('should use cache when enabled', () => {
      // First call should cache the value
      const theme1 = api.get('theme');
      const theme2 = api.get('theme');
      
      expect(theme1).toBe(theme2);
      expect(theme1).toBe('system');
    });

    test('should emit cache events', () => {
      const cacheHitSpy = jest.fn();
      const cacheMissSpy = jest.fn();
      
      api.on('cache_hit', cacheHitSpy);
      api.on('cache_miss', cacheMissSpy);
      
      // First call should be cache miss
      api.get('theme');
      
      // Second call should be cache hit
      api.get('theme');
      
      expect(cacheMissSpy).toHaveBeenCalled();
      expect(cacheHitSpy).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should set simple preference value', async () => {
      const result = await api.set('theme', 'dark');
      
      expect(result.success).toBe(true);
      expect(api.get('theme')).toBe('dark');
    });

    test('should set nested preference value', async () => {
      const result = await api.set('advanced.maxConcurrentJobs', 4);
      
      expect(result.success).toBe(true);
      expect(api.get('advanced.maxConcurrentJobs')).toBe(4);
    });

    test('should validate value when validation enabled', async () => {
      // Mock validator to reject invalid values
      const mockValidate = jest.fn().mockReturnValue({
        valid: false,
        errors: [{ type: 'invalid_value', path: 'theme', message: 'Invalid theme' }]
      });
      
      api.validator = { validate: mockValidate };
      
      const result = await api.set('theme', 'invalid-theme');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(mockValidate).toHaveBeenCalled();
    });

    test('should emit preference change events', async () => {
      const changeSpy = jest.fn();
      api.on('preference_changed', changeSpy);
      
      await api.set('theme', 'dark');
      
      expect(changeSpy).toHaveBeenCalledWith({
        type: 'preference_changed',
        path: 'theme',
        oldValue: 'system',
        newValue: 'dark',
        timestamp: expect.any(Number)
      });
    });

    test('should update cache when value changes', async () => {
      // Get initial value to cache it
      const initialTheme = api.get('theme');
      expect(initialTheme).toBe('system');
      
      // Set new value
      await api.set('theme', 'dark');
      
      // Get value again - should return new value from cache
      const newTheme = api.get('theme');
      expect(newTheme).toBe('dark');
    });

    test('should handle set errors gracefully', async () => {
      // Mock userPreferences.setPreference to throw error
      const originalSet = mockUserPreferences.setPreference;
      mockUserPreferences.setPreference = jest.fn().mockImplementation(() => {
        throw new Error('Set failed');
      });
      
      const result = await api.set('theme', 'dark');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      
      // Restore original method
      mockUserPreferences.setPreference = originalSet;
    });
  });

  describe('updateMultiple', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should update multiple preferences successfully', async () => {
      const updates = {
        theme: 'dark',
        quality: 'high',
        autoSave: true
      };
      
      const result = await api.updateMultiple(updates);
      
      expect(result.success).toBe(true);
      expect(result.updated).toEqual(Object.keys(updates));
      expect(api.get('theme')).toBe('dark');
      expect(api.get('quality')).toBe('high');
      expect(api.get('autoSave')).toBe(true);
    });

    test('should validate all updates when validateAll enabled', async () => {
      const mockValidate = jest.fn().mockReturnValue({
        valid: false,
        errors: [{ type: 'invalid_value', path: 'theme', message: 'Invalid theme' }]
      });
      
      api.validator = { validate: mockValidate };
      
      const updates = {
        theme: 'invalid-theme',
        quality: 'high'
      };
      
      const result = await api.updateMultiple(updates, {
        validateAll: true
      });
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(mockValidate).toHaveBeenCalled();
    });

    test('should emit events for each updated preference', async () => {
      const changeSpy = jest.fn();
      api.on('preference_changed', changeSpy);
      
      const updates = {
        theme: 'dark',
        quality: 'high'
      };
      
      await api.updateMultiple(updates);
      
      expect(changeSpy).toHaveBeenCalledTimes(2);
      expect(changeSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'preference_changed',
        path: 'theme',
        newValue: 'dark'
      }));
      expect(changeSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'preference_changed',
        path: 'quality',
        newValue: 'high'
      }));
    });

    test('should handle transaction mode', async () => {
      const updates = {
        theme: 'dark',
        quality: 'high',
        autoSave: true
      };
      
      const result = await api.updateMultiple(updates, {
        transaction: true
      });
      
      expect(result.success).toBe(true);
      expect(result.transaction).toBe(true);
    });
  });

  describe('reset', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
      // Set some non-default values
      await api.set('theme', 'dark');
      await api.set('quality', 'high');
    });

    test('should reset specific preferences to defaults', async () => {
      const result = await api.reset(['theme', 'quality']);
      
      expect(result.success).toBe(true);
      expect(result.reset).toEqual(['theme', 'quality']);
      expect(api.get('theme')).toBe('system'); // default
      expect(api.get('quality')).toBe('medium'); // default
    });

    test('should reset all preferences when no paths specified', async () => {
      const result = await api.reset();
      
      expect(result.success).toBe(true);
      expect(result.reset).toBe('all');
      expect(api.get('theme')).toBe('system');
      expect(api.get('quality')).toBe('medium');
    });

    test('should emit reset events', async () => {
      const resetSpy = jest.fn();
      api.on('preferences_reset', resetSpy);
      
      await api.reset(['theme']);
      
      expect(resetSpy).toHaveBeenCalledWith({
        type: 'preferences_reset',
        paths: ['theme'],
        timestamp: expect.any(Number)
      });
    });

    test('should clear cache for reset preferences', async () => {
      // Cache the values
      api.get('theme');
      api.get('quality');
      
      // Reset
      await api.reset(['theme']);
      
      // Should get fresh values
      expect(api.get('theme')).toBe('system');
    });
  });

  describe('validate', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should validate preference data', () => {
      const data = {
        theme: 'dark',
        quality: 'high',
        autoSave: true
      };
      
      const result = api.validate(data);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should return validation errors for invalid data', () => {
      // Mock validator to return errors
      const mockValidate = jest.fn().mockReturnValue({
        valid: false,
        errors: [
          { type: 'invalid_value', path: 'theme', message: 'Invalid theme' },
          { type: 'invalid_type', path: 'autoSave', message: 'Must be boolean' }
        ]
      });
      
      api.validator = { validate: mockValidate };
      
      const data = {
        theme: 'invalid-theme',
        autoSave: 'not-boolean'
      };
      
      const result = api.validate(data);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    test('should emit validation error events', () => {
      const errorSpy = jest.fn();
      api.on('validation_error', errorSpy);
      
      // Mock validator to return errors
      const mockValidate = jest.fn().mockReturnValue({
        valid: false,
        errors: [{ type: 'invalid_value', path: 'theme', message: 'Invalid theme' }]
      });
      
      api.validator = { validate: mockValidate };
      
      const data = { theme: 'invalid-theme' };
      api.validate(data);
      
      expect(errorSpy).toHaveBeenCalledWith({
        type: 'validation_error',
        error: expect.objectContaining({
          type: 'invalid_value',
          path: 'theme'
        }),
        timestamp: expect.any(Number)
      });
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should export preferences data', async () => {
      const exported = await api.export();
      
      expect(exported.success).toBe(true);
      expect(exported.data).toBeDefined();
      expect(exported.data.theme).toBe('system');
      expect(exported.data.quality).toBe('medium');
    });

    test('should export with custom options', async () => {
      const exported = await api.export({
        includeDefaults: false,
        format: 'json'
      });
      
      expect(exported.success).toBe(true);
      expect(exported.format).toBe('json');
    });

    test('should handle export errors', async () => {
      // Mock toJSON to throw error
      const originalToJSON = mockUserPreferences.toJSON;
      mockUserPreferences.toJSON = jest.fn().mockImplementation(() => {
        throw new Error('Export failed');
      });
      
      const exported = await api.export();
      
      expect(exported.success).toBe(false);
      expect(exported.error).toBeDefined();
      
      // Restore original method
      mockUserPreferences.toJSON = originalToJSON;
    });
  });

  describe('import', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should import preferences data', async () => {
      const importData = {
        theme: 'dark',
        quality: 'high',
        autoSave: true
      };
      
      const result = await api.import(importData);
      
      expect(result.success).toBe(true);
      expect(api.get('theme')).toBe('dark');
      expect(api.get('quality')).toBe('high');
      expect(api.get('autoSave')).toBe(true);
    });

    test('should validate imported data when validation enabled', async () => {
      const mockValidate = jest.fn().mockReturnValue({
        valid: false,
        errors: [{ type: 'invalid_value', path: 'theme', message: 'Invalid theme' }]
      });
      
      api.validator = { validate: mockValidate };
      
      const importData = {
        theme: 'invalid-theme'
      };
      
      const result = await api.import(importData, {
        validate: true
      });
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test('should merge with existing preferences when merge enabled', async () => {
      // Set initial values
      await api.set('theme', 'dark');
      await api.set('quality', 'high');
      
      const importData = {
        theme: 'light', // This should override
        autoSave: true  // This should be added
      };
      
      const result = await api.import(importData, {
        merge: true
      });
      
      expect(result.success).toBe(true);
      expect(api.get('theme')).toBe('light'); // overridden
      expect(api.get('quality')).toBe('high'); // preserved
      expect(api.get('autoSave')).toBe(true); // added
    });

    test('should create backup when backup enabled', async () => {
      const backupSpy = jest.fn();
      api.on('backup_created', backupSpy);
      
      const importData = {
        theme: 'dark'
      };
      
      await api.import(importData, {
        backup: true
      });
      
      expect(backupSpy).toHaveBeenCalled();
    });
  });

  describe('getAll', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should return all preferences', () => {
      const all = api.getAll();
      
      expect(all).toBeDefined();
      expect(all.theme).toBe('system');
      expect(all.quality).toBe('medium');
      expect(all.advanced).toBeDefined();
      expect(all.advanced.maxConcurrentJobs).toBe(2);
    });

    test('should return cached data when available', () => {
      // First call
      const all1 = api.getAll();
      
      // Second call should return same reference if cached
      const all2 = api.getAll();
      
      expect(all1).toEqual(all2);
    });
  });

  describe('isInitialized', () => {
    test('should return false before initialization', () => {
      expect(api.isInitialized()).toBe(false);
    });

    test('should return true after initialization', async () => {
      await api.initialize(mockUserPreferences);
      expect(api.isInitialized()).toBe(true);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should return API statistics', () => {
      const stats = api.getStats();
      
      expect(stats).toBeDefined();
      expect(stats.initialized).toBe(true);
      expect(stats.cacheEnabled).toBe(true);
      expect(stats.validationEnabled).toBe(true);
      expect(stats.eventsEnabled).toBe(true);
      expect(typeof stats.operationCount).toBe('number');
    });

    test('should include cache statistics when cache enabled', () => {
      // Perform some operations to generate cache stats
      api.get('theme');
      api.get('quality');
      
      const stats = api.getStats();
      
      expect(stats.cache).toBeDefined();
      expect(typeof stats.cache.hitRate).toBe('number');
      expect(typeof stats.cache.size).toBe('number');
    });
  });

  describe('error handling', () => {
    test('should handle operations before initialization', async () => {
      const uninitializedApi = new PreferencesAPI();
      
      const result = await uninitializedApi.set('theme', 'dark');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    test('should emit error events for critical failures', async () => {
      const errorSpy = jest.fn();
      api.on('error', errorSpy);
      
      // Try to operate on uninitialized API
      await api.set('theme', 'dark');
      
      expect(errorSpy).toHaveBeenCalledWith({
        type: 'error',
        error: expect.any(String),
        operation: 'set',
        timestamp: expect.any(Number)
      });
    });

    test('should handle invalid preference paths gracefully', () => {
      // This should not throw an error
      expect(() => {
        api.get('');
        api.get(null);
        api.get(undefined);
      }).not.toThrow();
    });
  });

  describe('event system integration', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should forward events to external event system when configured', async () => {
      const externalEventSpy = jest.fn();
      const externalEventSystem = {
        publish: externalEventSpy
      };
      
      api.eventSystem = externalEventSystem;
      
      await api.set('theme', 'dark');
      
      expect(externalEventSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'preference_changed',
        path: 'theme',
        newValue: 'dark'
      }));
    });

    test('should handle event system errors gracefully', async () => {
      const faultyEventSystem = {
        publish: jest.fn().mockImplementation(() => {
          throw new Error('Event system error');
        })
      };
      
      api.eventSystem = faultyEventSystem;
      
      // This should not throw an error
      const result = await api.set('theme', 'dark');
      
      expect(result.success).toBe(true); // Operation should still succeed
    });
  });

  describe('performance', () => {
    beforeEach(async () => {
      await api.initialize(mockUserPreferences);
    });

    test('should handle large number of operations efficiently', async () => {
      const startTime = Date.now();
      const operations = [];
      
      // Perform 100 get operations
      for (let i = 0; i < 100; i++) {
        operations.push(api.get('theme'));
      }
      
      await Promise.all(operations);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second
    });

    test('should handle concurrent operations safely', async () => {
      const operations = [];
      
      // Perform concurrent set operations
      for (let i = 0; i < 10; i++) {
        operations.push(api.set(`test${i}`, `value${i}`));
      }
      
      const results = await Promise.all(operations);
      
      // All operations should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
      
      // Verify all values were set correctly
      for (let i = 0; i < 10; i++) {
        expect(api.get(`test${i}`)).toBe(`value${i}`);
      }
    });
  });
});