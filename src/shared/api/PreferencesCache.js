/**
 * Preferences Cache
 * High-performance caching mechanism for frequently accessed preferences
 */

const { EventEmitter } = require('events');

/**
 * Cache Events
 */
const CacheEvents = {
  HIT: 'cache_hit',
  MISS: 'cache_miss',
  SET: 'cache_set',
  DELETE: 'cache_delete',
  CLEAR: 'cache_clear',
  EXPIRE: 'cache_expire',
  EVICT: 'cache_evict',
  STATS_UPDATE: 'stats_update'
};

/**
 * Cache Entry class
 */
class CacheEntry {
  constructor(key, value, ttl = null, options = {}) {
    this.key = key;
    this.value = value;
    this.createdAt = new Date();
    this.lastAccessed = new Date(this.createdAt);
    this.accessCount = 0;
    this.ttl = typeof ttl === 'number' ? ttl : (options.ttl || null); // null means no expiration
    this.priority = options.priority || 'normal';
    this.tags = options.tags || [];
    this.metadata = options.metadata || {};
    this.expiresAt = this.ttl > 0 ? new Date(this.createdAt.getTime() + this.ttl) : null;
  }
  
  /**
   * Check if entry is expired
   * @returns {boolean} Whether entry is expired
   */
  isExpired() {
    if (this.ttl === null || this.ttl === 0) return false;
    return Date.now() - this.createdAt.getTime() > this.ttl;
  }
  
  /**
   * Access the entry (updates access stats)
   * @returns {*} The cached value
   */
  access() {
    this.lastAccessed = new Date();
    this.accessCount++;
    return this.value;
  }
  
  /**
   * Get entry age in milliseconds
   * @returns {number} Age in milliseconds
   */
  getAge() {
    return Date.now() - this.createdAt.getTime();
  }
  
  /**
   * Get time since last access
   * @returns {number} Time in milliseconds
   */
  getTimeSinceLastAccess() {
    return Date.now() - this.lastAccessed.getTime();
  }
  
  /**
   * Update the cached value
   * @param {*} newValue - New value
   * @param {Object} options - Update options
   */
  update(newValue, options = {}) {
    this.value = newValue;
    this.lastAccessed = new Date();
    
    if (options.resetStats) {
      this.accessCount = 0;
      this.createdAt = new Date();
    }
    
    if (options.ttl !== undefined) {
      this.ttl = options.ttl;
    }
    
    if (options.priority) {
      this.priority = options.priority;
    }
    
    if (options.tags) {
      this.tags = options.tags;
    }
    
    if (options.metadata) {
      this.metadata = { ...this.metadata, ...options.metadata };
    }
  }
  
  /**
   * Get time to live in milliseconds
   * @returns {number|null} Time to live in milliseconds, 0 if expired, null if no TTL
   */
  getTimeToLive() {
    if (this.ttl === null || this.ttl === 0) return null; // No expiration
    const remaining = (this.createdAt.getTime() + this.ttl) - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Touch the entry (update last accessed time and increment access count)
   */
  touch() {
    this.lastAccessed = new Date();
    this.accessCount++;
  }

  /**
   * Get entry statistics
   * @returns {Object} Entry statistics
   */
  getStats() {
    return {
      key: this.key,
      createdAt: this.createdAt,
      lastAccessed: this.lastAccessed,
      accessCount: this.accessCount,
      age: this.getAge(),
      timeSinceLastAccess: this.getTimeSinceLastAccess(),
      priority: this.priority,
      tags: [...this.tags],
      ttl: this.ttl,
      expired: this.isExpired()
    };
  }
}

/**
 * LRU (Least Recently Used) Cache Implementation
 */
class LRUCache extends EventEmitter {
  constructor(capacity = 100) {
    super();
    if (capacity <= 0) {
      throw new Error('Capacity must be greater than 0');
    }
    this.capacity = capacity;
    this.cache = new Map();
    this.accessOrder = new Map(); // Track access order for LRU
  }
  
  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }
    
    const entry = this.cache.get(key);
    
    // Check if entry is expired
    if (entry && entry.isExpired && entry.isExpired()) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return undefined;
    }
    
    // Move to end (most recent) by deleting and re-adding
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    // Update access order and access the entry
    this.accessOrder.set(key, Date.now());
    if (entry && entry.access) {
      entry.access();
    }
    return entry ? entry.value : undefined;
  }
  
  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    // If at capacity and key doesn't exist, evict LRU
    if (this.cache.size >= this.capacity && !this.cache.has(key)) {
      this._evictLRU();
    }
    
    this.cache.set(key, value);
    this.accessOrder.set(key, Date.now());
  }
  
  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether key existed
   */
  delete(key) {
    this.accessOrder.delete(key);
    return this.cache.delete(key);
  }
  
  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {boolean} Whether key exists
   */
  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }
    
    const entry = this.cache.get(key);
    if (entry && entry.isExpired && entry.isExpired()) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
  }
  
  /**
   * Get cache size
   * @returns {number} Number of entries
   */
  get size() {
    return this.cache.size;
  }
  
  /**
   * Get all keys
   * @returns {Array} Array of keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Get all values
   * @returns {Iterator} Values iterator
   */
  values() {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }
  
  /**
   * Evict least recently used entry
   */
  _evictLRU() {
    let oldestKey = null;
    let oldestTime = Infinity;
    
    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      const evictedEntry = this.cache.get(oldestKey);
      this.delete(oldestKey);
      
      this.emit('evicted', {
        key: oldestKey,
        entry: evictedEntry,
        reason: 'capacity'
      });
    }
  }
}

/**
 * Preferences Cache class
 */
class PreferencesCache extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    this.enableStats = options.enableStats !== false;
    this.enableLRU = options.enableLRU !== false;
    
    // Store options for reference
    this.options = {
      maxSize: this.maxSize,
      defaultTTL: this.defaultTTL,
      cleanupInterval: this.cleanupInterval,
      enableStats: this.enableStats,
      enableLRU: this.enableLRU
    };
    
    // Validate TTL
    if (this.defaultTTL < 0) {
      throw new Error('TTL must be a positive number');
    }
    
    // Storage
    this.entries = new Map();
    this.lruCache = this.enableLRU ? new LRUCache(this.maxSize) : null;
    
    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      expirations: 0,
      totalRequests: 0,
      hitRate: 0,
      averageAccessTime: 0
    };
    
    // Cleanup timer
    this.cleanupTimer = null;
    this._startCleanup();
    
    // Access time tracking
    this.accessTimes = [];
    this.maxAccessTimeHistory = 1000;
    
    // Timestamps
    this.createdAt = new Date();
    this.lastActivity = new Date();
  }
  
  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @param {Object} options - Get options
   * @returns {*} Cached value or undefined
   */
  get(key, options = {}) {
    const startTime = Date.now();
    
    try {
      // Validate key
      if (key === null || key === undefined) {
        throw new Error('Key must be a string');
      }
      
      // Check if entry exists
      if (!this.entries.has(key)) {
        this._recordMiss(key, startTime);
        
        this.emit('miss', {
          key,
          timestamp: new Date()
        });
        
        return undefined;
      }
      
      const entry = this.entries.get(key);
      
      // Check if expired
      if (entry.isExpired()) {
        this.delete(key);
        this._recordExpiration(key);
        this._recordMiss(key, startTime);
        
        this.emit('miss', {
          key,
          timestamp: new Date()
        });
        
        return undefined;
      }
      
      // Update LRU cache
      if (this.lruCache) {
        this.lruCache.get(key);
      }
      
      // Access the entry
      const value = entry.access();
      
      this._recordHit(key, startTime);
      
      this.emit('hit', {
        key,
        value,
        timestamp: new Date()
      });
      
      // Clone value if requested
      if (options.clone && typeof value === 'object' && value !== null) {
        return JSON.parse(JSON.stringify(value));
      }
      
      return value;
      
    } catch (error) {
      this._recordMiss(key, startTime);
      
      this.emit('error', { operation: 'get', key, error: error.message });
      return undefined;
    }
  }
  
  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number|Object} ttlOrOptions - TTL in milliseconds or options object
   * @returns {boolean} Success status
   */
  set(key, value, ttlOrOptions = {}) {
    try {
      // Validate key
      if (key === null || key === undefined) {
        throw new Error('Key must be a string');
      }
      
      // Handle TTL parameter (can be number or options object)
      let ttl, options;
      if (typeof ttlOrOptions === 'number') {
        ttl = ttlOrOptions;
        options = {};
      } else if (typeof ttlOrOptions === 'string') {
        // String TTL is invalid
        throw new Error('TTL must be a positive number');
      } else {
        ttl = ttlOrOptions.ttl !== undefined ? ttlOrOptions.ttl : this.defaultTTL;
        options = ttlOrOptions;
      }
      
      // Validate TTL
      if (typeof ttl !== 'number') {
        throw new Error('TTL must be a positive number');
      }
      if (ttl < 0) {
        throw new Error('TTL must be a positive number');
      }
      
      // Check cache size limit
      if (this.entries.size >= this.maxSize && !this.entries.has(key)) {
        this._evictEntries();
      }
      
      // Create cache entry
      const entryOptions = {
        priority: options.priority || 'normal',
        tags: options.tags || [],
        metadata: options.metadata || {}
      };
      
      const entry = new CacheEntry(key, value, ttl, entryOptions);
      this.entries.set(key, entry);
      
      // Update LRU cache
      if (this.lruCache) {
        this.lruCache.set(key, entry);
      }
      
      this._recordSet(key);
      
      this.emit('set', {
        key,
        value,
        ttl: ttl,
        timestamp: new Date()
      });
      
      return true;
      
    } catch (error) {
      this.emit('error', { operation: 'set', key, error: error.message });
      return false;
    }
  }
  
  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether key existed
   */
  delete(key) {
    const existed = this.entries.has(key);
    
    if (existed) {
      this.entries.delete(key);
      
      if (this.lruCache) {
        this.lruCache.delete(key);
      }
      
      this._recordDelete(key);
      
      this.emit('delete', {
        key,
        timestamp: new Date()
      });
    }
    
    return existed;
  }
  
  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether key exists and is not expired
   */
  has(key) {
    if (!this.entries.has(key)) {
      return false;
    }
    
    const entry = this.entries.get(key);
    if (entry.isExpired()) {
      this.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Clear all cache entries
   */
  clear() {
    const count = this.entries.size;
    this.entries.clear();
    
    if (this.lruCache) {
      this.lruCache.clear();
    }
    
    // Reset stats
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      expirations: 0,
      totalRequests: 0,
      hitRate: 0,
      averageAccessTime: 0
    };
    
    this.emit('clear', {
      timestamp: new Date()
    });
  }
  
  /**
   * Get multiple values from cache
   * @param {Array} keys - Array of cache keys
   * @param {Object} options - Get options
   * @returns {Object} Object with key-value pairs
   */
  getMultiple(keys, options = {}) {
    const result = {};
    
    for (const key of keys) {
      const value = this.get(key, options);
      if (value !== undefined) {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  /**
   * Set multiple values in cache
   * @param {Object} entries - Object with key-value pairs
   * @param {Object} options - Set options
   * @returns {Object} Object with success status for each key
   */
  setMultiple(entries, options = {}) {
    const result = {};
    
    for (const [key, value] of Object.entries(entries)) {
      result[key] = this.set(key, value, options);
    }
    
    return result;
  }
  
  /**
   * Delete entries by tag
   * @param {string} tag - Tag to match
   * @returns {number} Number of entries deleted
   */
  deleteByTag(tag) {
    let deleted = 0;
    
    for (const [key, entry] of this.entries) {
      if (entry.tags.includes(tag)) {
        this.delete(key);
        deleted++;
      }
    }
    
    return deleted;
  }
  
  /**
   * Get entries by tag
   * @param {string} tag - Tag to match
   * @returns {Object} Object with matching entries
   */
  getByTag(tag) {
    const result = {};
    
    for (const [key, entry] of this.entries) {
      if (entry.tags.includes(tag) && !entry.isExpired()) {
        result[key] = entry.access();
      }
    }
    
    return result;
  }
  
  /**
   * Update cache entry
   * @param {string} key - Cache key
   * @param {*} value - New value
   * @param {Object} options - Update options
   * @returns {boolean} Success status
   */
  update(key, value, options = {}) {
    if (!this.entries.has(key)) {
      return this.set(key, value, options);
    }
    
    const entry = this.entries.get(key);
    entry.update(value, options);
    
    this.emit(CacheEvents.SET, {
      key,
      value,
      options,
      timestamp: Date.now(),
      operation: 'update'
    });
    
    return true;
  }
  
  /**
   * Get cache size
   * @returns {number} Number of entries in cache
   */
  size() {
    return this.entries.size;
  }
  
  /**
   * Get all cached keys
   * @returns {Array} Array of keys
   */
  keys() {
    return Array.from(this.entries.keys());
  }
  
  /**
   * Get all cached values
   * @returns {Array} Array of values
   */
  values() {
    return Array.from(this.entries.values()).map(entry => entry.value);
  }
  
  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) : 0;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      size: this.entries.size,
      maxSize: this.options.maxSize,
      hitRate: hitRate,
      createdAt: this.createdAt || new Date(),
      lastActivity: this.lastActivity || new Date()
    };
  }
  
  /**
   * Get detailed entry statistics
   * @returns {Array} Array of entry statistics
   */
  getEntryStats() {
    return Array.from(this.entries.values()).map(entry => entry.getStats());
  }
  
  /**
   * Get cache keys
   * @param {Object} options - Filter options
   * @returns {Array} Array of cache keys
   */
  getKeys(options = {}) {
    let keys = Array.from(this.entries.keys());
    
    if (options.tag) {
      keys = keys.filter(key => {
        const entry = this.entries.get(key);
        return entry && entry.tags.includes(options.tag);
      });
    }
    
    if (options.priority) {
      keys = keys.filter(key => {
        const entry = this.entries.get(key);
        return entry && entry.priority === options.priority;
      });
    }
    
    if (options.excludeExpired) {
      keys = keys.filter(key => {
        const entry = this.entries.get(key);
        return entry && !entry.isExpired();
      });
    }
    
    return keys;
  }
  
  /**
   * Cleanup expired entries
   * @returns {number} Number of entries cleaned up
   */
  cleanup() {
    const expiredKeys = [];
    
    // First, collect all expired keys
    for (const [key, entry] of this.entries) {
      if (entry.isExpired()) {
        expiredKeys.push(key);
      }
    }
    
    // Then delete them
    for (const key of expiredKeys) {
      this.entries.delete(key);
      if (this.lruCache) {
        this.lruCache.delete(key);
      }
      this._recordExpiration(key);
    }
    
    // Emit cleanup event
    this.emit('cleanup', {
      removedCount: expiredKeys.length,
      timestamp: new Date()
    });
    
    return expiredKeys.length;
  }
  
  /**
   * Configure cache settings
   * @param {Object} options - Configuration options
   */
  configure(options = {}) {
    if (options.maxSize !== undefined) {
      this.maxSize = Math.max(1, options.maxSize);
      if (this.lruCache) {
        this.lruCache.maxSize = this.maxSize;
      }
    }
    
    if (options.defaultTTL !== undefined) {
      this.defaultTTL = Math.max(0, options.defaultTTL);
    }
    
    if (options.cleanupInterval !== undefined) {
      this.cleanupInterval = Math.max(1000, options.cleanupInterval);
      this._restartCleanup();
    }
    
    if (options.enableStats !== undefined) {
      this.enableStats = options.enableStats;
    }
  }
  
  /**
   * Start cleanup timer
   */
  _startCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }
  
  /**
   * Restart cleanup timer
   */
  _restartCleanup() {
    this._startCleanup();
  }
  
  /**
   * Evict entries when cache is full
   */
  _evictEntries() {
    if (this.lruCache) {
      // Use LRU eviction
      const lruKeys = this.lruCache.keys();
      const toEvict = Math.ceil(this.maxSize * 0.1); // Evict 10%
      
      for (let i = 0; i < toEvict && lruKeys.length > 0; i++) {
        const key = lruKeys[0];
        this.delete(key);
        this._recordEviction(key);
      }
    } else {
      // Evict oldest entries
      const entries = Array.from(this.entries.entries())
        .sort(([, a], [, b]) => a.createdAt - b.createdAt);
      
      const toEvict = Math.ceil(this.maxSize * 0.1);
      
      for (let i = 0; i < toEvict && entries.length > 0; i++) {
        const [key] = entries[i];
        this.delete(key);
        this._recordEviction(key);
      }
    }
  }
  
  /**
   * Record cache hit
   */
  _recordHit(key, startTime) {
    if (!this.enableStats) return;
    
    this.stats.hits++;
    this.stats.totalRequests++;
    this.lastActivity = new Date();
    
    const accessTime = Date.now() - startTime;
    this.accessTimes.push(accessTime);
    
    if (this.accessTimes.length > this.maxAccessTimeHistory) {
      this.accessTimes.shift();
    }
    
    this.emit(CacheEvents.HIT, {
      key,
      accessTime,
      timestamp: Date.now()
    });
  }
  
  /**
   * Record cache miss
   */
  _recordMiss(key, startTime) {
    if (!this.enableStats) return;
    
    this.stats.misses++;
    this.stats.totalRequests++;
    
    const accessTime = Date.now() - startTime;
    
    this.emit(CacheEvents.MISS, {
      key,
      accessTime,
      timestamp: Date.now()
    });
  }
  
  /**
   * Record cache set
   */
  _recordSet(key) {
    if (!this.enableStats) return;
    this.stats.sets++;
    this.lastActivity = new Date();
  }
  
  /**
   * Record cache delete
   */
  _recordDelete(key) {
    if (!this.enableStats) return;
    this.stats.deletes++;
    this.lastActivity = new Date();
  }
  
  /**
   * Record cache eviction
   */
  _recordEviction(key) {
    if (!this.enableStats) return;
    
    this.stats.evictions++;
    
    this.emit(CacheEvents.EVICT, {
      key,
      timestamp: Date.now()
    });
  }
  
  /**
   * Record cache expiration
   */
  _recordExpiration(key) {
    if (!this.enableStats) return;
    
    this.stats.expirations++;
    
    this.emit(CacheEvents.EXPIRE, {
      key,
      timestamp: Date.now()
    });
  }
  
  /**
   * Estimate memory usage
   */
  _estimateMemoryUsage() {
    let size = 0;
    
    for (const [key, entry] of this.entries) {
      size += key.length * 2; // Approximate string size
      size += this._estimateObjectSize(entry.value);
      size += 200; // Approximate entry overhead
    }
    
    return size;
  }
  
  /**
   * Estimate object size
   */
  _estimateObjectSize(obj) {
    if (obj === null || obj === undefined) return 0;
    
    switch (typeof obj) {
      case 'string':
        return obj.length * 2;
      case 'number':
        return 8;
      case 'boolean':
        return 4;
      case 'object':
        if (Array.isArray(obj)) {
          return obj.reduce((sum, item) => sum + this._estimateObjectSize(item), 0);
        }
        return Object.entries(obj).reduce((sum, [key, value]) => {
          return sum + key.length * 2 + this._estimateObjectSize(value);
        }, 0);
      default:
        return 50; // Approximate for other types
    }
  }
  
  /**
   * Destroy cache and cleanup resources
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.clear();
    this.removeAllListeners();
  }
}

module.exports = {
  PreferencesCache,
  CacheEntry,
  CacheEvents,
  LRUCache
};