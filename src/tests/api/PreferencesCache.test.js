const {
  PreferencesCache,
  LRUCache,
  CacheEntry
} = require('../../shared/api/PreferencesCache');

describe('CacheEntry', () => {
  describe('constructor', () => {
    test('should create cache entry with required parameters', () => {
      const value = { theme: 'dark' };
      const entry = new CacheEntry('test-key', value);

      expect(entry.key).toBe('test-key');
      expect(entry.value).toBe(value);
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.lastAccessed).toBeInstanceOf(Date);
      expect(entry.accessCount).toBe(0);
      expect(entry.ttl).toBeNull();
    });

    test('should create cache entry with TTL', () => {
      const value = { theme: 'dark' };
      const ttl = 5000; // 5 seconds
      const entry = new CacheEntry('test-key', value, ttl);

      expect(entry.ttl).toBe(ttl);
      expect(entry.expiresAt).toBeInstanceOf(Date);
      expect(entry.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('isExpired', () => {
    test('should return false for entry without TTL', () => {
      const entry = new CacheEntry('test-key', { theme: 'dark' });
      expect(entry.isExpired()).toBe(false);
    });

    test('should return false for non-expired entry', () => {
      const entry = new CacheEntry('test-key', { theme: 'dark' }, 5000);
      expect(entry.isExpired()).toBe(false);
    });

    test('should return true for expired entry', () => {
      const entry = new CacheEntry('test-key', { theme: 'dark' }, 1);
      
      // Wait for expiration
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(entry.isExpired()).toBe(true);
          resolve();
        }, 10);
      });
    });
  });

  describe('touch', () => {
    test('should update lastAccessed and increment accessCount', () => {
      const entry = new CacheEntry('test-key', { theme: 'dark' });
      const initialLastAccessed = entry.lastAccessed;
      const initialAccessCount = entry.accessCount;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        entry.touch();

        expect(entry.lastAccessed.getTime()).toBeGreaterThan(initialLastAccessed.getTime());
        expect(entry.accessCount).toBe(initialAccessCount + 1);
      }, 10);
    });
  });

  describe('getAge', () => {
    test('should return age in milliseconds', () => {
      const entry = new CacheEntry('test-key', { theme: 'dark' });
      
      setTimeout(() => {
        const age = entry.getAge();
        expect(age).toBeGreaterThan(0);
        expect(age).toBeLessThan(100); // Should be very small
      }, 10);
    });
  });

  describe('getTimeToLive', () => {
    test('should return null for entry without TTL', () => {
      const entry = new CacheEntry('test-key', { theme: 'dark' });
      expect(entry.getTimeToLive()).toBeNull();
    });

    test('should return remaining TTL', () => {
      const entry = new CacheEntry('test-key', { theme: 'dark' }, 5000);
      const ttl = entry.getTimeToLive();
      
      expect(ttl).toBeGreaterThan(4000);
      expect(ttl).toBeLessThanOrEqual(5000);
    });

    test('should return 0 for expired entry', () => {
      const entry = new CacheEntry('test-key', { theme: 'dark' }, 1);
      
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(entry.getTimeToLive()).toBe(0);
          resolve();
        }, 10);
      });
    });
  });
});

describe('LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3); // Small cache for testing
  });

  describe('constructor', () => {
    test('should create LRU cache with specified capacity', () => {
      expect(cache.capacity).toBe(3);
      expect(cache.size).toBe(0);
      expect(cache.cache).toBeInstanceOf(Map);
    });

    test('should throw error for invalid capacity', () => {
      expect(() => new LRUCache(0)).toThrow('Capacity must be greater than 0');
      expect(() => new LRUCache(-1)).toThrow('Capacity must be greater than 0');
    });
  });

  describe('get', () => {
    test('should return undefined for non-existent key', () => {
      expect(cache.get('non-existent')).toBeUndefined();
    });

    test('should return value for existing key', () => {
      const entry = new CacheEntry('key1', { theme: 'dark' });
      cache.cache.set('key1', entry);

      const result = cache.get('key1');
      expect(result).toBe(entry.value);
    });

    test('should move accessed item to end (most recent)', () => {
      const entry1 = new CacheEntry('key1', { value: 1 });
      const entry2 = new CacheEntry('key2', { value: 2 });
      const entry3 = new CacheEntry('key3', { value: 3 });

      cache.cache.set('key1', entry1);
      cache.cache.set('key2', entry2);
      cache.cache.set('key3', entry3);

      // Access key1 to move it to end
      cache.get('key1');

      const keys = Array.from(cache.cache.keys());
      expect(keys[keys.length - 1]).toBe('key1');
    });

    test('should return undefined for expired entry', () => {
      const entry = new CacheEntry('key1', { theme: 'dark' }, 1);
      cache.cache.set('key1', entry);

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(cache.get('key1')).toBeUndefined();
          expect(cache.cache.has('key1')).toBe(false);
          resolve();
        }, 10);
      });
    });
  });

  describe('set', () => {
    test('should add new entry', () => {
      const entry = new CacheEntry('key1', { theme: 'dark' });
      cache.set('key1', entry);

      expect(cache.cache.has('key1')).toBe(true);
      expect(cache.size).toBe(1);
    });

    test('should update existing entry', () => {
      const entry1 = new CacheEntry('key1', { theme: 'dark' });
      const entry2 = new CacheEntry('key1', { theme: 'light' });

      cache.set('key1', entry1);
      cache.set('key1', entry2);

      expect(cache.cache.get('key1')).toBe(entry2);
      expect(cache.size).toBe(1);
    });

    test('should evict least recently used item when capacity exceeded', () => {
      const entry1 = new CacheEntry('key1', { value: 1 });
      const entry2 = new CacheEntry('key2', { value: 2 });
      const entry3 = new CacheEntry('key3', { value: 3 });
      const entry4 = new CacheEntry('key4', { value: 4 });

      cache.set('key1', entry1);
      cache.set('key2', entry2);
      cache.set('key3', entry3);
      
      expect(cache.size).toBe(3);
      
      // Adding fourth item should evict key1
      cache.set('key4', entry4);
      
      expect(cache.size).toBe(3);
      expect(cache.cache.has('key1')).toBe(false);
      expect(cache.cache.has('key4')).toBe(true);
    });

    test('should emit evicted event when item is evicted', () => {
      const evictedSpy = jest.fn();
      cache.on('evicted', evictedSpy);

      const entry1 = new CacheEntry('key1', { value: 1 });
      const entry2 = new CacheEntry('key2', { value: 2 });
      const entry3 = new CacheEntry('key3', { value: 3 });
      const entry4 = new CacheEntry('key4', { value: 4 });

      cache.set('key1', entry1);
      cache.set('key2', entry2);
      cache.set('key3', entry3);
      cache.set('key4', entry4); // Should evict key1

      expect(evictedSpy).toHaveBeenCalledWith({
        key: 'key1',
        entry: entry1,
        reason: 'capacity'
      });
    });
  });

  describe('delete', () => {
    test('should remove existing entry', () => {
      const entry = new CacheEntry('key1', { theme: 'dark' });
      cache.set('key1', entry);

      expect(cache.delete('key1')).toBe(true);
      expect(cache.cache.has('key1')).toBe(false);
      expect(cache.size).toBe(0);
    });

    test('should return false for non-existent entry', () => {
      expect(cache.delete('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    test('should remove all entries', () => {
      cache.set('key1', new CacheEntry('key1', { value: 1 }));
      cache.set('key2', new CacheEntry('key2', { value: 2 }));
      cache.set('key3', new CacheEntry('key3', { value: 3 }));

      expect(cache.size).toBe(3);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.cache.size).toBe(0);
    });
  });

  describe('has', () => {
    test('should return true for existing key', () => {
      const entry = new CacheEntry('key1', { theme: 'dark' });
      cache.set('key1', entry);

      expect(cache.has('key1')).toBe(true);
    });

    test('should return false for non-existent key', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    test('should return false for expired entry', () => {
      const entry = new CacheEntry('key1', { theme: 'dark' }, 1);
      cache.set('key1', entry);

      return new Promise((resolve) => {
        setTimeout(() => {
          expect(cache.has('key1')).toBe(false);
          resolve();
        }, 10);
      });
    });
  });

  describe('keys', () => {
    test('should return all keys', () => {
      cache.set('key1', new CacheEntry('key1', { value: 1 }));
      cache.set('key2', new CacheEntry('key2', { value: 2 }));
      cache.set('key3', new CacheEntry('key3', { value: 3 }));

      const keys = Array.from(cache.keys());
      expect(keys).toEqual(['key1', 'key2', 'key3']);
    });
  });

  describe('values', () => {
    test('should return all values', () => {
      const value1 = { value: 1 };
      const value2 = { value: 2 };
      const value3 = { value: 3 };

      cache.set('key1', new CacheEntry('key1', value1));
      cache.set('key2', new CacheEntry('key2', value2));
      cache.set('key3', new CacheEntry('key3', value3));

      const values = Array.from(cache.values());
      expect(values).toEqual([value1, value2, value3]);
    });
  });
});

describe('PreferencesCache', () => {
  let cache;

  beforeEach(() => {
    cache = new PreferencesCache({
      maxSize: 100,
      defaultTTL: 5000,
      cleanupInterval: 1000,
      enableStats: true
    });
  });

  afterEach(() => {
    if (cache) {
      cache.destroy();
    }
  });

  describe('constructor', () => {
    test('should create cache with default options', () => {
      const defaultCache = new PreferencesCache();

      expect(defaultCache.options.maxSize).toBe(1000);
      expect(defaultCache.options.defaultTTL).toBe(300000); // 5 minutes
      expect(defaultCache.options.cleanupInterval).toBe(60000); // 1 minute
      expect(defaultCache.options.enableStats).toBe(true);
    });

    test('should create cache with custom options', () => {
      const customOptions = {
        maxSize: 50,
        defaultTTL: 10000,
        cleanupInterval: 2000,
        enableStats: false
      };

      const customCache = new PreferencesCache(customOptions);

      expect(customCache.options.maxSize).toBe(50);
      expect(customCache.options.defaultTTL).toBe(10000);
      expect(customCache.options.cleanupInterval).toBe(2000);
      expect(customCache.options.enableStats).toBe(false);
    });

    test('should start cleanup interval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      new PreferencesCache({ cleanupInterval: 1000 });
      
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        1000
      );

      setIntervalSpy.mockRestore();
    });
  });

  describe('get', () => {
    test('should return cached value', () => {
      cache.set('theme', 'dark');
      
      const result = cache.get('theme');
      expect(result).toBe('dark');
    });

    test('should return undefined for non-existent key', () => {
      const result = cache.get('non-existent');
      expect(result).toBeUndefined();
    });

    test('should update stats on cache hit', () => {
      cache.set('theme', 'dark');
      cache.get('theme');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
    });

    test('should update stats on cache miss', () => {
      cache.get('non-existent');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
    });

    test('should emit hit event', () => {
      const hitSpy = jest.fn();
      cache.on('hit', hitSpy);
      
      cache.set('theme', 'dark');
      cache.get('theme');
      
      expect(hitSpy).toHaveBeenCalledWith({
        key: 'theme',
        value: 'dark',
        timestamp: expect.any(Date)
      });
    });

    test('should emit miss event', () => {
      const missSpy = jest.fn();
      cache.on('miss', missSpy);
      
      cache.get('non-existent');
      
      expect(missSpy).toHaveBeenCalledWith({
        key: 'non-existent',
        timestamp: expect.any(Date)
      });
    });
  });

  describe('set', () => {
    test('should cache value with default TTL', () => {
      cache.set('theme', 'dark');
      
      expect(cache.get('theme')).toBe('dark');
      expect(cache.has('theme')).toBe(true);
    });

    test('should cache value with custom TTL', () => {
      cache.set('theme', 'dark', 10000);
      
      const entry = cache.lruCache.cache.get('theme');
      expect(entry.ttl).toBe(10000);
    });

    test('should update stats on set', () => {
      cache.set('theme', 'dark');
      
      const stats = cache.getStats();
      expect(stats.sets).toBe(1);
    });

    test('should emit set event', () => {
      const setSpy = jest.fn();
      cache.on('set', setSpy);
      
      cache.set('theme', 'dark');
      
      expect(setSpy).toHaveBeenCalledWith({
        key: 'theme',
        value: 'dark',
        ttl: cache.options.defaultTTL,
        timestamp: expect.any(Date)
      });
    });
  });

  describe('delete', () => {
    test('should remove cached value', () => {
      cache.set('theme', 'dark');
      
      expect(cache.delete('theme')).toBe(true);
      expect(cache.has('theme')).toBe(false);
    });

    test('should return false for non-existent key', () => {
      expect(cache.delete('non-existent')).toBe(false);
    });

    test('should update stats on delete', () => {
      cache.set('theme', 'dark');
      cache.delete('theme');
      
      const stats = cache.getStats();
      expect(stats.deletes).toBe(1);
    });

    test('should emit delete event', () => {
      const deleteSpy = jest.fn();
      cache.on('delete', deleteSpy);
      
      cache.set('theme', 'dark');
      cache.delete('theme');
      
      expect(deleteSpy).toHaveBeenCalledWith({
        key: 'theme',
        timestamp: expect.any(Date)
      });
    });
  });

  describe('clear', () => {
    test('should remove all cached values', () => {
      cache.set('theme', 'dark');
      cache.set('quality', 'high');
      cache.set('format', 'mp4');
      
      expect(cache.size()).toBe(3);
      
      cache.clear();
      
      expect(cache.size()).toBe(0);
    });

    test('should reset stats on clear', () => {
      cache.set('theme', 'dark');
      cache.get('theme');
      
      cache.clear();
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);
    });

    test('should emit clear event', () => {
      const clearSpy = jest.fn();
      cache.on('clear', clearSpy);
      
      cache.clear();
      
      expect(clearSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Date)
      });
    });
  });

  describe('has', () => {
    test('should return true for existing key', () => {
      cache.set('theme', 'dark');
      expect(cache.has('theme')).toBe(true);
    });

    test('should return false for non-existent key', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    test('should return false for expired key', () => {
      cache.set('theme', 'dark', 1);
      
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(cache.has('theme')).toBe(false);
          resolve();
        }, 10);
      });
    });
  });

  describe('size', () => {
    test('should return number of cached items', () => {
      expect(cache.size()).toBe(0);
      
      cache.set('theme', 'dark');
      expect(cache.size()).toBe(1);
      
      cache.set('quality', 'high');
      expect(cache.size()).toBe(2);
      
      cache.delete('theme');
      expect(cache.size()).toBe(1);
    });
  });

  describe('keys', () => {
    test('should return all cached keys', () => {
      cache.set('theme', 'dark');
      cache.set('quality', 'high');
      cache.set('format', 'mp4');
      
      const keys = Array.from(cache.keys());
      expect(keys).toEqual(['theme', 'quality', 'format']);
    });
  });

  describe('values', () => {
    test('should return all cached values', () => {
      cache.set('theme', 'dark');
      cache.set('quality', 'high');
      cache.set('format', 'mp4');
      
      const values = Array.from(cache.values());
      expect(values).toEqual(['dark', 'high', 'mp4']);
    });
  });

  describe('cleanup', () => {
    test('should remove expired entries', () => {
      cache.set('expired', 'value', 1);
      cache.set('valid', 'value', 10000);
      
      return new Promise((resolve) => {
        setTimeout(() => {
          const removedCount = cache.cleanup();
          
          expect(removedCount).toBe(1);
          expect(cache.has('expired')).toBe(false);
          expect(cache.has('valid')).toBe(true);
          resolve();
        }, 10);
      });
    });

    test('should emit cleanup event', () => {
      const cleanupSpy = jest.fn();
      cache.on('cleanup', cleanupSpy);
      
      cache.set('expired', 'value', 1);
      
      return new Promise((resolve) => {
        setTimeout(() => {
          cache.cleanup();
          
          expect(cleanupSpy).toHaveBeenCalledWith({
            removedCount: 1,
            timestamp: expect.any(Date)
          });
          resolve();
        }, 10);
      });
    });
  });

  describe('getStats', () => {
    test('should return cache statistics', () => {
      cache.set('theme', 'dark');
      cache.get('theme'); // hit
      cache.get('non-existent'); // miss
      cache.delete('theme');
      
      const stats = cache.getStats();
      
      expect(stats).toEqual({
        hits: 1,
        misses: 1,
        sets: 1,
        deletes: 1,
        size: 0,
        maxSize: cache.options.maxSize,
        hitRate: 0.5, // 1 hit / 2 total
        createdAt: expect.any(Date),
        lastActivity: expect.any(Date)
      });
    });

    test('should handle zero total accesses for hit rate', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('performance', () => {
    test('should handle many cache operations efficiently', () => {
      const startTime = Date.now();
      
      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      for (let i = 0; i < 1000; i++) {
        cache.get(`key${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(1000); // 1 second
    });

    test('should maintain performance with cache eviction', () => {
      const smallCache = new PreferencesCache({ maxSize: 10 });
      
      const startTime = Date.now();
      
      // Add more items than cache capacity
      for (let i = 0; i < 100; i++) {
        smallCache.set(`key${i}`, `value${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // 100ms
      expect(smallCache.size()).toBe(10);
      
      smallCache.destroy();
    });
  });

  describe('memory management', () => {
    test('should respect max size limit', () => {
      const smallCache = new PreferencesCache({ maxSize: 5 });
      
      // Add more items than capacity
      for (let i = 0; i < 10; i++) {
        smallCache.set(`key${i}`, `value${i}`);
      }
      
      expect(smallCache.size()).toBe(5);
      
      smallCache.destroy();
    });

    test('should clean up resources on destroy', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      cache.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(cache.size()).toBe(0);
      
      clearIntervalSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    test('should handle invalid TTL values', () => {
      expect(() => {
        cache.set('key', 'value', -1);
      }).toThrow('TTL must be a positive number');
      
      expect(() => {
        cache.set('key', 'value', 'invalid');
      }).toThrow('TTL must be a positive number');
    });

    test('should handle null/undefined keys', () => {
      expect(() => {
        cache.set(null, 'value');
      }).toThrow('Key must be a string');
      
      expect(() => {
        cache.set(undefined, 'value');
      }).toThrow('Key must be a string');
      
      expect(() => {
        cache.get(null);
      }).toThrow('Key must be a string');
    });

    test('should handle cleanup errors gracefully', () => {
      const errorSpy = jest.fn();
      cache.on('error', errorSpy);
      
      // Mock an error in cleanup
      const originalCleanup = cache.lruCache.delete;
      cache.lruCache.delete = jest.fn(() => {
        throw new Error('Cleanup error');
      });
      
      cache.set('key', 'value', 1);
      
      setTimeout(() => {
        cache.cleanup();
        
        expect(errorSpy).toHaveBeenCalledWith({
          type: 'cleanupError',
          error: expect.any(Error),
          timestamp: expect.any(Date)
        });
        
        // Restore original method
        cache.lruCache.delete = originalCleanup;
      }, 10);
    });
  });
});