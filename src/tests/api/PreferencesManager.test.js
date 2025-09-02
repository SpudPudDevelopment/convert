const { PreferencesManager } = require('../../shared/api/PreferencesManager');
const { PreferencesAPI } = require('../../shared/api/PreferencesAPI');
const { UserPreferences } = require('../../shared/models/UserPreferences');
const EventEmitter = require('events');

// Mock PreferencesAPI
jest.mock('../../shared/api/PreferencesAPI');

// Mock UserPreferences
class MockUserPreferences extends EventEmitter {
  constructor() {
    super();
    this.data = {
      theme: 'light',
      quality: 'medium',
      autoSave: true
    };
  }

  getPreference(key) {
    return this.data[key];
  }

  setPreference(key, value) {
    const oldValue = this.data[key];
    this.data[key] = value;
    this.emit('preferenceChanged', { key, value, oldValue });
    return true;
  }

  updatePreferences(updates) {
    const changes = [];
    for (const [key, value] of Object.entries(updates)) {
      const oldValue = this.data[key];
      this.data[key] = value;
      changes.push({ key, value, oldValue });
    }
    this.emit('preferencesUpdated', { changes });
    return true;
  }

  resetPreferences() {
    this.data = {
      theme: 'light',
      quality: 'medium',
      autoSave: true
    };
    this.emit('preferencesReset');
    return true;
  }

  validate() {
    return { valid: true, errors: [] };
  }

  toJSON() {
    return JSON.stringify(this.data);
  }

  fromJSON(json) {
    this.data = JSON.parse(json);
    return true;
  }

  getStats() {
    return {
      totalPreferences: Object.keys(this.data).length,
      lastModified: new Date()
    };
  }
}

describe('PreferencesManager', () => {
  let manager;
  let mockUserPreferences;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup PreferencesAPI mock
    PreferencesAPI.mockImplementation(() => {
      const api = new EventEmitter();
      api.userPreferences = new MockUserPreferences();
      api.isInitialized = jest.fn().mockReturnValue(true);
      api.get = jest.fn((key) => api.userPreferences.getPreference(key));
      api.set = jest.fn((key, value) => api.userPreferences.setPreference(key, value));
      api.updateMultiple = jest.fn((updates) => api.userPreferences.updatePreferences(updates));
      api.reset = jest.fn(() => api.userPreferences.resetPreferences());
      api.validate = jest.fn(() => api.userPreferences.validate());
      api.export = jest.fn(() => api.userPreferences.toJSON());
      api.import = jest.fn((data) => api.userPreferences.fromJSON(data));
      api.getAll = jest.fn(() => api.userPreferences.data);
      api.getStats = jest.fn(() => api.userPreferences.getStats());
      api.destroy = jest.fn();
      return api;
    });

    mockUserPreferences = new MockUserPreferences();
    manager = new PreferencesManager({
      maxInstances: 5,
      autoBackup: true,
      backupInterval: 1000
    });
  });

  afterEach(() => {
    if (manager) {
      manager.destroy();
    }
  });

  describe('constructor', () => {
    test('should create manager with default options', () => {
      const defaultManager = new PreferencesManager();
      
      expect(defaultManager).toBeInstanceOf(PreferencesManager);
      expect(defaultManager).toBeInstanceOf(EventEmitter);
      expect(defaultManager.options.maxInstances).toBe(10);
      expect(defaultManager.options.autoBackup).toBe(false);
    });

    test('should create manager with custom options', () => {
      const customOptions = {
        maxInstances: 3,
        autoBackup: true,
        backupInterval: 5000,
        enableTransactions: true
      };
      
      const customManager = new PreferencesManager(customOptions);
      
      expect(customManager.options.maxInstances).toBe(3);
      expect(customManager.options.autoBackup).toBe(true);
      expect(customManager.options.backupInterval).toBe(5000);
      expect(customManager.options.enableTransactions).toBe(true);
    });

    test('should initialize with empty instances map', () => {
      expect(manager.instances.size).toBe(0);
    });
  });

  describe('createInstance', () => {
    test('should create new PreferencesAPI instance', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      
      expect(instanceId).toBeDefined();
      expect(typeof instanceId).toBe('string');
      expect(manager.instances.size).toBe(1);
      expect(manager.instances.has(instanceId)).toBe(true);
    });

    test('should emit instanceCreated event', async () => {
      const eventSpy = jest.fn();
      manager.on('instanceCreated', eventSpy);
      
      const instanceId = await manager.createInstance(mockUserPreferences);
      
      expect(eventSpy).toHaveBeenCalledWith({
        instanceId,
        timestamp: expect.any(Date)
      });
    });

    test('should reject when max instances reached', async () => {
      // Create instances up to the limit
      for (let i = 0; i < manager.options.maxInstances; i++) {
        await manager.createInstance(new MockUserPreferences());
      }
      
      // Try to create one more
      await expect(manager.createInstance(mockUserPreferences))
        .rejects.toThrow('Maximum number of instances reached');
    });

    test('should assign unique IDs to instances', async () => {
      const id1 = await manager.createInstance(new MockUserPreferences());
      const id2 = await manager.createInstance(new MockUserPreferences());
      const id3 = await manager.createInstance(new MockUserPreferences());
      
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    test('should handle instance creation errors', async () => {
      // Mock PreferencesAPI to throw error
      PreferencesAPI.mockImplementation(() => {
        throw new Error('Creation failed');
      });
      
      await expect(manager.createInstance(mockUserPreferences))
        .rejects.toThrow('Creation failed');
    });
  });

  describe('getInstance', () => {
    test('should return existing instance', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      const instance = manager.getInstance(instanceId);
      
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(EventEmitter);
    });

    test('should return null for non-existent instance', () => {
      const instance = manager.getInstance('non-existent-id');
      
      expect(instance).toBeNull();
    });
  });

  describe('destroyInstance', () => {
    test('should destroy existing instance', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      
      expect(manager.instances.size).toBe(1);
      
      const result = await manager.destroyInstance(instanceId);
      
      expect(result).toBe(true);
      expect(manager.instances.size).toBe(0);
    });

    test('should emit instanceDestroyed event', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      const eventSpy = jest.fn();
      manager.on('instanceDestroyed', eventSpy);
      
      await manager.destroyInstance(instanceId);
      
      expect(eventSpy).toHaveBeenCalledWith({
        instanceId,
        timestamp: expect.any(Date)
      });
    });

    test('should return false for non-existent instance', async () => {
      const result = await manager.destroyInstance('non-existent-id');
      
      expect(result).toBe(false);
    });

    test('should call destroy method on instance', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      const instance = manager.getInstance(instanceId);
      
      await manager.destroyInstance(instanceId);
      
      expect(instance.destroy).toHaveBeenCalled();
    });
  });

  describe('listInstances', () => {
    test('should return empty array when no instances', () => {
      const instances = manager.listInstances();
      
      expect(instances).toEqual([]);
    });

    test('should return list of instance IDs', async () => {
      const id1 = await manager.createInstance(new MockUserPreferences());
      const id2 = await manager.createInstance(new MockUserPreferences());
      
      const instances = manager.listInstances();
      
      expect(instances).toHaveLength(2);
      expect(instances).toContain(id1);
      expect(instances).toContain(id2);
    });
  });

  describe('getStats', () => {
    test('should return manager statistics', async () => {
      await manager.createInstance(new MockUserPreferences());
      await manager.createInstance(new MockUserPreferences());
      
      const stats = manager.getStats();
      
      expect(stats).toEqual({
        totalInstances: 2,
        maxInstances: manager.options.maxInstances,
        activeInstances: 2,
        createdAt: expect.any(Date),
        lastActivity: expect.any(Date)
      });
    });

    test('should update lastActivity on instance operations', async () => {
      const initialStats = manager.getStats();
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await manager.createInstance(mockUserPreferences);
      const updatedStats = manager.getStats();
      
      expect(updatedStats.lastActivity.getTime())
        .toBeGreaterThan(initialStats.lastActivity.getTime());
    });
  });

  describe('backup functionality', () => {
    test('should create backup when autoBackup enabled', async () => {
      const backupManager = new PreferencesManager({
        autoBackup: true,
        backupInterval: 100
      });
      
      const backupSpy = jest.fn();
      backupManager.on('backupCreated', backupSpy);
      
      await backupManager.createInstance(mockUserPreferences);
      
      // Wait for backup interval
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(backupSpy).toHaveBeenCalled();
      
      backupManager.destroy();
    });

    test('should manually create backup', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      
      const backup = await manager.createBackup(instanceId);
      
      expect(backup).toBeDefined();
      expect(backup.instanceId).toBe(instanceId);
      expect(backup.timestamp).toBeInstanceOf(Date);
      expect(backup.data).toBeDefined();
    });

    test('should restore from backup', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      const instance = manager.getInstance(instanceId);
      
      // Create backup
      const backup = await manager.createBackup(instanceId);
      
      // Modify data
      await instance.set('theme', 'dark');
      
      // Restore backup
      const result = await manager.restoreBackup(instanceId, backup);
      
      expect(result).toBe(true);
      expect(instance.import).toHaveBeenCalledWith(backup.data);
    });

    test('should fail to backup non-existent instance', async () => {
      await expect(manager.createBackup('non-existent-id'))
        .rejects.toThrow('Instance not found');
    });
  });

  describe('transaction support', () => {
    test('should begin transaction', async () => {
      const transactionManager = new PreferencesManager({
        enableTransactions: true
      });
      
      const instanceId = await transactionManager.createInstance(mockUserPreferences);
      
      const transactionId = await transactionManager.beginTransaction(instanceId);
      
      expect(transactionId).toBeDefined();
      expect(typeof transactionId).toBe('string');
      
      transactionManager.destroy();
    });

    test('should commit transaction', async () => {
      const transactionManager = new PreferencesManager({
        enableTransactions: true
      });
      
      const instanceId = await transactionManager.createInstance(mockUserPreferences);
      const transactionId = await transactionManager.beginTransaction(instanceId);
      
      const result = await transactionManager.commitTransaction(transactionId);
      
      expect(result).toBe(true);
      
      transactionManager.destroy();
    });

    test('should rollback transaction', async () => {
      const transactionManager = new PreferencesManager({
        enableTransactions: true
      });
      
      const instanceId = await transactionManager.createInstance(mockUserPreferences);
      const transactionId = await transactionManager.beginTransaction(instanceId);
      
      const result = await transactionManager.rollbackTransaction(transactionId);
      
      expect(result).toBe(true);
      
      transactionManager.destroy();
    });

    test('should fail transaction operations when disabled', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      
      await expect(manager.beginTransaction(instanceId))
        .rejects.toThrow('Transactions not enabled');
    });
  });

  describe('event forwarding', () => {
    test('should forward preference change events', async () => {
      const eventSpy = jest.fn();
      manager.on('globalPreferenceChanged', eventSpy);
      
      const instanceId = await manager.createInstance(mockUserPreferences);
      const instance = manager.getInstance(instanceId);
      
      // Simulate preference change
      instance.emit('preferenceChanged', {
        key: 'theme',
        value: 'dark',
        oldValue: 'light'
      });
      
      expect(eventSpy).toHaveBeenCalledWith({
        instanceId,
        key: 'theme',
        value: 'dark',
        oldValue: 'light',
        timestamp: expect.any(Date)
      });
    });

    test('should forward validation errors', async () => {
      const errorSpy = jest.fn();
      manager.on('validationError', errorSpy);
      
      const instanceId = await manager.createInstance(mockUserPreferences);
      const instance = manager.getInstance(instanceId);
      
      // Simulate validation error
      instance.emit('validationError', {
        errors: [{ path: 'theme', message: 'Invalid value' }]
      });
      
      expect(errorSpy).toHaveBeenCalledWith({
        instanceId,
        errors: [{ path: 'theme', message: 'Invalid value' }],
        timestamp: expect.any(Date)
      });
    });
  });

  describe('error handling', () => {
    test('should handle instance creation errors gracefully', async () => {
      const errorSpy = jest.fn();
      manager.on('error', errorSpy);
      
      // Mock PreferencesAPI to throw error
      PreferencesAPI.mockImplementationOnce(() => {
        throw new Error('Creation failed');
      });
      
      await expect(manager.createInstance(mockUserPreferences))
        .rejects.toThrow('Creation failed');
      
      expect(errorSpy).toHaveBeenCalledWith({
        type: 'instanceCreationError',
        error: expect.any(Error),
        timestamp: expect.any(Date)
      });
    });

    test('should handle instance destruction errors', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      const instance = manager.getInstance(instanceId);
      
      // Mock destroy to throw error
      instance.destroy.mockImplementation(() => {
        throw new Error('Destruction failed');
      });
      
      const errorSpy = jest.fn();
      manager.on('error', errorSpy);
      
      await manager.destroyInstance(instanceId);
      
      expect(errorSpy).toHaveBeenCalledWith({
        type: 'instanceDestructionError',
        instanceId,
        error: expect.any(Error),
        timestamp: expect.any(Date)
      });
    });
  });

  describe('cleanup and destruction', () => {
    test('should destroy all instances on manager destruction', async () => {
      const id1 = await manager.createInstance(new MockUserPreferences());
      const id2 = await manager.createInstance(new MockUserPreferences());
      
      const instance1 = manager.getInstance(id1);
      const instance2 = manager.getInstance(id2);
      
      expect(manager.instances.size).toBe(2);
      
      await manager.destroy();
      
      expect(instance1.destroy).toHaveBeenCalled();
      expect(instance2.destroy).toHaveBeenCalled();
      expect(manager.instances.size).toBe(0);
    });

    test('should clear backup interval on destruction', async () => {
      const backupManager = new PreferencesManager({
        autoBackup: true,
        backupInterval: 1000
      });
      
      // Spy on clearInterval
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      await backupManager.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
    });

    test('should emit destroyed event', async () => {
      const eventSpy = jest.fn();
      manager.on('destroyed', eventSpy);
      
      await manager.destroy();
      
      expect(eventSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Date)
      });
    });
  });

  describe('performance', () => {
    test('should handle multiple concurrent instance operations', async () => {
      const promises = [];
      
      // Create multiple instances concurrently
      for (let i = 0; i < 5; i++) {
        promises.push(manager.createInstance(new MockUserPreferences()));
      }
      
      const instanceIds = await Promise.all(promises);
      
      expect(instanceIds).toHaveLength(5);
      expect(manager.instances.size).toBe(5);
      
      // Destroy all concurrently
      const destroyPromises = instanceIds.map(id => manager.destroyInstance(id));
      const results = await Promise.all(destroyPromises);
      
      expect(results.every(result => result === true)).toBe(true);
      expect(manager.instances.size).toBe(0);
    });

    test('should maintain performance with many instances', async () => {
      const startTime = Date.now();
      
      // Create maximum number of instances
      const promises = [];
      for (let i = 0; i < manager.options.maxInstances; i++) {
        promises.push(manager.createInstance(new MockUserPreferences()));
      }
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
      expect(manager.instances.size).toBe(manager.options.maxInstances);
    });
  });

  describe('memory management', () => {
    test('should clean up event listeners on instance destruction', async () => {
      const instanceId = await manager.createInstance(mockUserPreferences);
      const instance = manager.getInstance(instanceId);
      
      // Check that event listeners are attached
      expect(instance.listenerCount('preferenceChanged')).toBeGreaterThan(0);
      
      await manager.destroyInstance(instanceId);
      
      // Event listeners should be cleaned up
      expect(instance.listenerCount('preferenceChanged')).toBe(0);
    });

    test('should prevent memory leaks with many create/destroy cycles', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many create/destroy cycles
      for (let i = 0; i < 100; i++) {
        const instanceId = await manager.createInstance(new MockUserPreferences());
        await manager.destroyInstance(instanceId);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});