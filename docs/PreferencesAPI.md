# Preferences API Documentation

The Preferences API provides a comprehensive, high-performance system for managing application preferences with advanced features including validation, caching, event handling, and safe module integration.

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Quick Start](#quick-start)
4. [API Reference](#api-reference)
5. [Event System](#event-system)
6. [Validation](#validation)
7. [Caching](#caching)
8. [Best Practices](#best-practices)
9. [Examples](#examples)
10. [Troubleshooting](#troubleshooting)

## Overview

The Preferences API consists of several interconnected components:

- **PreferencesAPI**: Main interface for preference management
- **PreferencesManager**: Manages multiple API instances with safety features
- **PreferencesEventSystem**: Advanced event handling with filtering and batching
- **PreferencesValidator**: Comprehensive validation with type safety
- **PreferencesCache**: High-performance caching with LRU eviction

### Key Features

- 🔒 **Type Safety**: Comprehensive validation with custom schemas
- ⚡ **High Performance**: Advanced caching with LRU eviction
- 📡 **Event System**: Sophisticated event handling with filtering
- 🛡️ **Safety**: Transaction support and automatic backups
- 🔧 **Extensible**: Custom validators and sanitizers
- 📊 **Monitoring**: Detailed statistics and performance metrics

## Core Components

### PreferencesAPI

The main interface for accessing and modifying preferences.

```javascript
const { PreferencesAPI } = require('./src/shared/api/PreferencesAPI');

const api = new PreferencesAPI({
  enableCache: true,
  enableValidation: true,
  enableEvents: true
});
```

### PreferencesManager

Manages multiple PreferencesAPI instances with advanced safety features.

```javascript
const { PreferencesManager } = require('./src/shared/api/PreferencesManager');

const manager = new PreferencesManager({
  maxInstances: 10,
  enableBackup: true,
  backupInterval: 300000 // 5 minutes
});
```

## Quick Start

### Basic Usage

```javascript
const { PreferencesAPI } = require('./src/shared/api/PreferencesAPI');

// Create API instance
const preferences = new PreferencesAPI();

// Initialize with user preferences
await preferences.initialize(userPreferences);

// Get a preference
const theme = preferences.get('theme');
console.log('Current theme:', theme); // 'dark'

// Set a preference
const success = await preferences.set('theme', 'light');
if (success) {
  console.log('Theme updated successfully');
}

// Update multiple preferences
const result = await preferences.updateMultiple({
  'quality': 'high',
  'outputFormat': 'mp4',
  'autoSave': true
});

console.log('Update results:', result);
```

### With Validation

```javascript
const { PreferencesAPI } = require('./src/shared/api/PreferencesAPI');
const { PreferencesValidator } = require('./src/shared/api/PreferencesValidator');

// Create validator with custom rules
const validator = new PreferencesValidator();
validator.addCustomValidator('customBitrate', (value) => {
  if (value < 100 || value > 50000) {
    return 'Bitrate must be between 100 and 50000';
  }
  return null;
});

// Create API with validation
const preferences = new PreferencesAPI({
  validator,
  enableValidation: true
});

// This will be validated
const result = await preferences.set('customBitrate', 75000);
if (!result.success) {
  console.error('Validation failed:', result.errors);
}
```

### With Events

```javascript
const { PreferencesAPI } = require('./src/shared/api/PreferencesAPI');

const preferences = new PreferencesAPI({ enableEvents: true });

// Listen for preference changes
preferences.on('preference_changed', (event) => {
  console.log(`Preference ${event.path} changed from ${event.oldValue} to ${event.newValue}`);
});

// Listen for validation errors
preferences.on('validation_error', (event) => {
  console.error('Validation error:', event.error);
});

// Set a preference (will trigger events)
await preferences.set('theme', 'dark');
```

## API Reference

### PreferencesAPI

#### Constructor

```javascript
new PreferencesAPI(options)
```

**Options:**
- `enableCache` (boolean): Enable caching (default: true)
- `enableValidation` (boolean): Enable validation (default: true)
- `enableEvents` (boolean): Enable event system (default: true)
- `validator` (PreferencesValidator): Custom validator instance
- `cache` (PreferencesCache): Custom cache instance
- `eventSystem` (PreferencesEventSystem): Custom event system

#### Methods

##### `initialize(userPreferences, options)`

Initialize the API with user preferences.

```javascript
await preferences.initialize(userPreferences, {
  validateOnInit: true,
  cacheOnInit: true
});
```

##### `get(path, options)`

Get a preference value.

```javascript
const value = preferences.get('theme');
const nested = preferences.get('advanced.maxConcurrentJobs');
const withDefault = preferences.get('nonexistent', { default: 'fallback' });
```

##### `set(path, value, options)`

Set a preference value.

```javascript
const result = await preferences.set('theme', 'dark', {
  validate: true,
  cache: true,
  emit: true
});

if (result.success) {
  console.log('Preference updated');
} else {
  console.error('Update failed:', result.errors);
}
```

##### `updateMultiple(updates, options)`

Update multiple preferences atomically.

```javascript
const result = await preferences.updateMultiple({
  'theme': 'dark',
  'quality': 'high',
  'autoSave': true
}, {
  transaction: true,
  validateAll: true
});
```

##### `reset(paths, options)`

Reset preferences to default values.

```javascript
// Reset specific preferences
await preferences.reset(['theme', 'quality']);

// Reset all preferences
await preferences.reset();
```

##### `validate(data, options)`

Validate preference data.

```javascript
const result = preferences.validate({
  theme: 'invalid-theme',
  quality: 'high'
});

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

##### `export(options)`

Export preferences data.

```javascript
const exported = await preferences.export({
  includeDefaults: false,
  format: 'json'
});
```

##### `import(data, options)`

Import preferences data.

```javascript
const result = await preferences.import(importedData, {
  merge: true,
  validate: true,
  backup: true
});
```

### PreferencesManager

#### Constructor

```javascript
new PreferencesManager(options)
```

**Options:**
- `maxInstances` (number): Maximum API instances (default: 10)
- `enableBackup` (boolean): Enable automatic backups (default: true)
- `backupInterval` (number): Backup interval in ms (default: 300000)
- `enableTransactions` (boolean): Enable transaction support (default: true)

#### Methods

##### `createInstance(id, options)`

Create a new PreferencesAPI instance.

```javascript
const instance = await manager.createInstance('main-app', {
  enableCache: true,
  enableValidation: true
});
```

##### `getInstance(id)`

Get an existing instance.

```javascript
const instance = manager.getInstance('main-app');
```

##### `destroyInstance(id)`

Destroy an instance.

```javascript
const success = await manager.destroyInstance('main-app');
```

##### `beginTransaction(instanceIds)`

Begin a transaction across multiple instances.

```javascript
const transaction = await manager.beginTransaction(['app1', 'app2']);

try {
  await transaction.set('app1', 'theme', 'dark');
  await transaction.set('app2', 'theme', 'dark');
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
}
```

## Event System

The event system provides sophisticated event handling with filtering, batching, and subscription management.

### Basic Events

```javascript
const { PreferencesEventSystem } = require('./src/shared/api/PreferencesEventSystem');

const eventSystem = new PreferencesEventSystem();

// Subscribe to events
const subscriptionId = eventSystem.subscribe({
  callback: (event) => {
    console.log('Preference changed:', event);
  }
});

// Publish an event
eventSystem.publish({
  type: 'preference_changed',
  path: 'theme',
  oldValue: 'light',
  newValue: 'dark',
  userId: 'user123'
});
```

### Advanced Filtering

```javascript
// Subscribe with path filter
const themeSubscription = eventSystem.subscribe({
  callback: (event) => console.log('Theme changed:', event),
  filters: [{
    type: 'path',
    paths: ['theme', 'advanced.theme'],
    mode: 'prefix'
  }]
});

// Subscribe with value filter
const qualitySubscription = eventSystem.subscribe({
  callback: (event) => console.log('Quality set to high:', event),
  filters: [{
    type: 'value',
    field: 'newValue',
    operator: 'equals',
    value: 'high'
  }]
});

// Subscribe with custom filter
const customSubscription = eventSystem.subscribe({
  callback: (event) => console.log('Custom filter matched:', event),
  filters: [{
    type: 'custom',
    predicate: (event) => {
      return event.path.startsWith('advanced.') && event.userId === 'admin';
    }
  }]
});
```

### Event Batching

```javascript
// Subscribe with batching
const batchSubscription = eventSystem.subscribe({
  callback: (events) => {
    console.log(`Received batch of ${events.length} events:`, events);
  },
  batchSize: 5,
  batchTimeout: 1000 // 1 second
});
```

### Event Types

- `preference_changed`: Preference value changed
- `preference_added`: New preference added
- `preference_removed`: Preference removed
- `preferences_reset`: Preferences reset to defaults
- `validation_error`: Validation failed
- `cache_hit`: Cache hit occurred
- `cache_miss`: Cache miss occurred
- `transaction_started`: Transaction began
- `transaction_committed`: Transaction committed
- `transaction_rolled_back`: Transaction rolled back

## Validation

The validation system provides comprehensive type checking and custom validation rules.

### Built-in Validation

```javascript
const { PreferencesValidator, PREFERENCE_SCHEMA } = require('./src/shared/api/PreferencesValidator');

const validator = new PreferencesValidator(PREFERENCE_SCHEMA);

// Validate data
const result = validator.validate({
  theme: 'dark',
  quality: 'high',
  customBitrate: 2000
});

if (result.valid) {
  console.log('Validation passed');
  console.log('Sanitized data:', result.sanitized);
} else {
  console.error('Validation errors:', result.errors);
}
```

### Custom Validators

```javascript
// Add custom validator
validator.addCustomValidator('customResolution', (value, context) => {
  if (value.width * value.height > 8294400) { // 4K limit
    return 'Resolution exceeds 4K limit';
  }
  return null;
});

// Add custom sanitizer
validator.addCustomSanitizer('theme', (value) => {
  return value.toLowerCase().trim();
});
```

### Validation Schema

The built-in schema supports:

- **Type validation**: string, number, boolean, array, object
- **Range validation**: min/max for numbers, minLength/maxLength for strings
- **Enum validation**: Predefined allowed values
- **Pattern validation**: Regular expression matching
- **Custom validation**: Custom validator functions
- **Dependency validation**: Cross-field validation
- **Array validation**: Item validation and size limits
- **Object validation**: Nested property validation

## Caching

The caching system provides high-performance preference access with LRU eviction.

### Basic Caching

```javascript
const { PreferencesCache } = require('./src/shared/api/PreferencesCache');

const cache = new PreferencesCache({
  maxSize: 1000,
  defaultTTL: 300000, // 5 minutes
  enableLRU: true
});

// Set cached value
cache.set('user:123:theme', 'dark', {
  ttl: 600000, // 10 minutes
  tags: ['user:123', 'theme'],
  priority: 'high'
});

// Get cached value
const theme = cache.get('user:123:theme');
if (theme) {
  console.log('Cache hit:', theme);
} else {
  console.log('Cache miss');
}
```

### Advanced Caching

```javascript
// Set multiple values
cache.setMultiple({
  'user:123:theme': 'dark',
  'user:123:quality': 'high',
  'user:123:autoSave': true
}, {
  tags: ['user:123'],
  ttl: 300000
});

// Get multiple values
const values = cache.getMultiple([
  'user:123:theme',
  'user:123:quality',
  'user:123:autoSave'
]);

// Delete by tag
const deleted = cache.deleteByTag('user:123');
console.log(`Deleted ${deleted} entries`);

// Get cache statistics
const stats = cache.getStats();
console.log('Cache stats:', stats);
```

### Cache Events

```javascript
cache.on('cache_hit', (event) => {
  console.log(`Cache hit for ${event.key} (${event.accessTime}ms)`);
});

cache.on('cache_miss', (event) => {
  console.log(`Cache miss for ${event.key}`);
});

cache.on('cache_evict', (event) => {
  console.log(`Evicted ${event.key} from cache`);
});
```

## Best Practices

### 1. Use Appropriate Cache TTL

```javascript
// Short TTL for frequently changing data
cache.set('user:status', status, { ttl: 30000 }); // 30 seconds

// Long TTL for stable data
cache.set('user:preferences', prefs, { ttl: 3600000 }); // 1 hour

// No TTL for static data
cache.set('app:config', config, { ttl: 0 }); // Never expires
```

### 2. Use Tags for Efficient Cache Management

```javascript
// Tag by user
cache.set('user:123:theme', 'dark', { tags: ['user:123'] });
cache.set('user:123:quality', 'high', { tags: ['user:123'] });

// Clear all user data
cache.deleteByTag('user:123');

// Tag by feature
cache.set('video:quality', 'high', { tags: ['video', 'processing'] });
cache.set('video:format', 'mp4', { tags: ['video', 'output'] });
```

### 3. Handle Validation Errors Gracefully

```javascript
const result = await preferences.set('quality', userInput);

if (!result.success) {
  // Show user-friendly error messages
  const errorMessages = result.errors.map(error => {
    switch (error.type) {
      case 'invalid_value':
        return `Invalid ${error.path}: ${error.message}`;
      case 'invalid_range':
        return `${error.path} must be between ${error.constraints.min} and ${error.constraints.max}`;
      default:
        return error.message;
    }
  });
  
  showErrorToUser(errorMessages.join(', '));
} else {
  showSuccessMessage('Preferences updated successfully');
}
```

### 4. Use Transactions for Related Changes

```javascript
const transaction = await manager.beginTransaction(['main-app']);

try {
  // Update related preferences atomically
  await transaction.set('main-app', 'quality', 'high');
  await transaction.set('main-app', 'customBitrate', 5000);
  await transaction.set('main-app', 'outputFormat', 'mp4');
  
  await transaction.commit();
  console.log('All preferences updated successfully');
} catch (error) {
  await transaction.rollback();
  console.error('Transaction failed, changes rolled back:', error);
}
```

### 5. Monitor Performance

```javascript
// Monitor cache performance
setInterval(() => {
  const stats = cache.getStats();
  if (stats.hitRate < 80) {
    console.warn('Low cache hit rate:', stats.hitRate + '%');
  }
}, 60000);

// Monitor validation performance
preferences.on('validation_error', (event) => {
  console.warn('Validation error:', event.error.type, event.error.path);
});

// Monitor event system performance
eventSystem.on('system_error', (event) => {
  console.error('Event system error:', event.error);
});
```

## Examples

### Complete Application Setup

```javascript
const { PreferencesManager } = require('./src/shared/api/PreferencesManager');
const { PreferencesValidator } = require('./src/shared/api/PreferencesValidator');
const { UserPreferences } = require('./src/shared/models/UserPreferences');

class ApplicationPreferences {
  constructor() {
    this.manager = new PreferencesManager({
      maxInstances: 5,
      enableBackup: true,
      backupInterval: 300000
    });
    
    this.validator = new PreferencesValidator();
    this.setupCustomValidation();
  }
  
  async initialize(userId) {
    // Load user preferences
    const userPrefs = await UserPreferences.load(userId);
    
    // Create API instance
    this.api = await this.manager.createInstance(userId, {
      validator: this.validator,
      enableCache: true,
      enableValidation: true,
      enableEvents: true
    });
    
    // Initialize with user data
    await this.api.initialize(userPrefs);
    
    // Setup event listeners
    this.setupEventListeners();
    
    return this.api;
  }
  
  setupCustomValidation() {
    // Add custom validator for video resolution
    this.validator.addCustomValidator('customResolution', (value) => {
      if (value.width % 2 !== 0 || value.height % 2 !== 0) {
        return 'Resolution dimensions must be even numbers';
      }
      return null;
    });
    
    // Add sanitizer for file paths
    this.validator.addCustomSanitizer('advanced.tempDirectory', (value) => {
      return value.replace(/\\/g, '/').replace(/\/+/g, '/');
    });
  }
  
  setupEventListeners() {
    // Listen for preference changes
    this.api.on('preference_changed', (event) => {
      console.log(`Preference ${event.path} changed:`, event.oldValue, '->', event.newValue);
      
      // Trigger UI updates
      this.notifyUI(event.path, event.newValue);
    });
    
    // Listen for validation errors
    this.api.on('validation_error', (event) => {
      console.error('Validation error:', event.error);
      this.showValidationError(event.error);
    });
    
    // Listen for cache events
    this.api.on('cache_miss', (event) => {
      console.log('Cache miss for:', event.key);
    });
  }
  
  async updateTheme(theme) {
    const result = await this.api.set('theme', theme);
    if (result.success) {
      document.body.className = `theme-${theme}`;
    }
    return result;
  }
  
  async updateVideoSettings(settings) {
    const result = await this.api.updateMultiple(settings, {
      transaction: true,
      validateAll: true
    });
    
    if (result.success) {
      this.notifyVideoSettingsChanged(settings);
    }
    
    return result;
  }
  
  async exportSettings() {
    return await this.api.export({
      includeDefaults: false,
      format: 'json'
    });
  }
  
  async importSettings(data) {
    return await this.api.import(data, {
      merge: true,
      validate: true,
      backup: true
    });
  }
  
  notifyUI(path, value) {
    // Implement UI notification logic
    window.dispatchEvent(new CustomEvent('preference-changed', {
      detail: { path, value }
    }));
  }
  
  showValidationError(error) {
    // Implement error display logic
    console.error('Validation failed:', error.message);
  }
  
  notifyVideoSettingsChanged(settings) {
    // Implement video settings change notification
    console.log('Video settings updated:', settings);
  }
}

// Usage
const appPrefs = new ApplicationPreferences();
const api = await appPrefs.initialize('user123');

// Update preferences
await appPrefs.updateTheme('dark');
await appPrefs.updateVideoSettings({
  quality: 'high',
  outputFormat: 'mp4',
  customBitrate: 5000
});
```

### React Integration

```javascript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { PreferencesAPI } from './src/shared/api/PreferencesAPI';

const PreferencesContext = createContext();

export const PreferencesProvider = ({ children, userId }) => {
  const [api, setApi] = useState(null);
  const [preferences, setPreferences] = useState({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const initializePreferences = async () => {
      try {
        const prefsApi = new PreferencesAPI({
          enableCache: true,
          enableValidation: true,
          enableEvents: true
        });
        
        // Load user preferences
        const userPrefs = await loadUserPreferences(userId);
        await prefsApi.initialize(userPrefs);
        
        // Listen for changes
        prefsApi.on('preference_changed', (event) => {
          setPreferences(prev => ({
            ...prev,
            [event.path]: event.newValue
          }));
        });
        
        setApi(prefsApi);
        setPreferences(prefsApi.getAll());
        setLoading(false);
      } catch (error) {
        console.error('Failed to initialize preferences:', error);
        setLoading(false);
      }
    };
    
    if (userId) {
      initializePreferences();
    }
  }, [userId]);
  
  const updatePreference = async (path, value) => {
    if (!api) return { success: false, error: 'API not initialized' };
    
    const result = await api.set(path, value);
    return result;
  };
  
  const updateMultiple = async (updates) => {
    if (!api) return { success: false, error: 'API not initialized' };
    
    const result = await api.updateMultiple(updates, {
      transaction: true,
      validateAll: true
    });
    return result;
  };
  
  const value = {
    preferences,
    updatePreference,
    updateMultiple,
    loading,
    api
  };
  
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return context;
};

// Usage in components
const ThemeSelector = () => {
  const { preferences, updatePreference } = usePreferences();
  
  const handleThemeChange = async (theme) => {
    const result = await updatePreference('theme', theme);
    if (!result.success) {
      console.error('Failed to update theme:', result.errors);
    }
  };
  
  return (
    <select 
      value={preferences.theme || 'system'} 
      onChange={(e) => handleThemeChange(e.target.value)}
    >
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="system">System</option>
    </select>
  );
};
```

## Troubleshooting

### Common Issues

#### 1. Validation Errors

**Problem**: Preferences fail validation

**Solution**:
```javascript
// Check validation result
const result = await preferences.set('quality', 'invalid');
if (!result.success) {
  console.log('Validation errors:', result.errors);
  // Handle each error type appropriately
}

// Use sanitized data
const validationResult = validator.validate(data);
if (validationResult.valid) {
  await preferences.import(validationResult.sanitized);
}
```

#### 2. Cache Misses

**Problem**: Low cache hit rate

**Solution**:
```javascript
// Monitor cache performance
const stats = cache.getStats();
if (stats.hitRate < 80) {
  // Increase cache size
  cache.configure({ maxSize: 2000 });
  
  // Increase TTL for stable data
  cache.set(key, value, { ttl: 600000 }); // 10 minutes
}
```

#### 3. Memory Usage

**Problem**: High memory usage

**Solution**:
```javascript
// Monitor memory usage
const stats = cache.getStats();
if (stats.memoryUsage > 50000000) { // 50MB
  // Reduce cache size
  cache.configure({ maxSize: 500 });
  
  // Enable more aggressive cleanup
  cache.configure({ cleanupInterval: 30000 }); // 30 seconds
}
```

#### 4. Event System Performance

**Problem**: Event processing is slow

**Solution**:
```javascript
// Configure event system for better performance
eventSystem.configure({
  maxQueueSize: 500,
  processingDelay: 0
});

// Use batching for high-frequency events
const subscription = eventSystem.subscribe({
  callback: (events) => {
    // Process batch of events
    processBatch(events);
  },
  batchSize: 10,
  batchTimeout: 100
});
```

### Debug Mode

```javascript
// Enable debug logging
const preferences = new PreferencesAPI({
  debug: true,
  enableCache: true,
  enableValidation: true
});

// Listen for debug events
preferences.on('debug', (event) => {
  console.log('Debug:', event.operation, event.data);
});
```

### Performance Monitoring

```javascript
// Monitor API performance
const monitor = {
  start: Date.now(),
  operations: 0,
  errors: 0
};

preferences.on('operation_complete', (event) => {
  monitor.operations++;
  if (event.duration > 100) {
    console.warn('Slow operation:', event.operation, event.duration + 'ms');
  }
});

preferences.on('error', (event) => {
  monitor.errors++;
  console.error('API error:', event.error);
});

// Log performance summary every minute
setInterval(() => {
  const elapsed = Date.now() - monitor.start;
  const opsPerSecond = (monitor.operations / elapsed) * 1000;
  const errorRate = (monitor.errors / monitor.operations) * 100;
  
  console.log('Performance:', {
    operationsPerSecond: opsPerSecond.toFixed(2),
    errorRate: errorRate.toFixed(2) + '%',
    totalOperations: monitor.operations
  });
}, 60000);
```

This documentation provides a comprehensive guide to using the Preferences API system. For additional help or feature requests, please refer to the source code or contact the development team.