import { EventEmitter } from 'events';
import { globalJobNotifier, JobEventType, EventPriority } from '../events/jobEvents.js';

/**
 * Queue state change event types
 */
export const QueueStateEventType = {
  // Queue structure changes
  QUEUE_INITIALIZED: 'queue_initialized',
  QUEUE_DESTROYED: 'queue_destroyed',
  QUEUE_CLEARED: 'queue_cleared',
  QUEUE_RESTORED: 'queue_restored',
  
  // Job lifecycle in queue
  JOB_ADDED: 'job_added',
  JOB_REMOVED: 'job_removed',
  JOB_MOVED: 'job_moved',
  JOB_PRIORITY_CHANGED: 'job_priority_changed',
  
  // Queue processing state
  QUEUE_STARTED: 'queue_started',
  QUEUE_PAUSED: 'queue_paused',
  QUEUE_RESUMED: 'queue_resumed',
  QUEUE_STOPPED: 'queue_stopped',
  
  // Job processing state
  JOB_PROCESSING_STARTED: 'job_processing_started',
  JOB_PROCESSING_COMPLETED: 'job_processing_completed',
  JOB_PROCESSING_FAILED: 'job_processing_failed',
  JOB_PROCESSING_CANCELLED: 'job_processing_cancelled',
  
  // Queue statistics
  QUEUE_STATS_UPDATED: 'queue_stats_updated',
  PROCESSING_STATS_UPDATED: 'processing_stats_updated',
  
  // Resource and scheduling
  RESOURCE_STATE_CHANGED: 'resource_state_changed',
  SCHEDULING_STATE_CHANGED: 'scheduling_state_changed',
  THROTTLING_STATE_CHANGED: 'throttling_state_changed',
  
  // Persistence
  QUEUE_STATE_SAVED: 'queue_state_saved',
  QUEUE_STATE_LOADED: 'queue_state_loaded',
  BACKUP_CREATED: 'backup_created',
  
  // Errors and warnings
  QUEUE_ERROR: 'queue_error',
  QUEUE_WARNING: 'queue_warning',
  
  // Batch operations
  BATCH_OPERATION_STARTED: 'batch_operation_started',
  BATCH_OPERATION_COMPLETED: 'batch_operation_completed',
  BATCH_OPERATION_FAILED: 'batch_operation_failed'
};

/**
 * Queue state change event class
 */
export class QueueStateEvent {
  constructor(type, data = {}) {
    this.type = type;
    this.timestamp = Date.now();
    this.id = this.generateEventId();
    this.data = data;
    this.priority = this.determinePriority(type);
  }

  /**
   * Generate unique event ID
   */
  generateEventId() {
    return `qse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Determine event priority based on type
   */
  determinePriority(type) {
    const highPriorityEvents = [
      QueueStateEventType.QUEUE_ERROR,
      QueueStateEventType.JOB_PROCESSING_FAILED,
      QueueStateEventType.QUEUE_DESTROYED
    ];
    
    const mediumPriorityEvents = [
      QueueStateEventType.QUEUE_WARNING,
      QueueStateEventType.JOB_PROCESSING_STARTED,
      QueueStateEventType.JOB_PROCESSING_COMPLETED,
      QueueStateEventType.RESOURCE_STATE_CHANGED
    ];
    
    if (highPriorityEvents.includes(type)) {
      return EventPriority.HIGH;
    } else if (mediumPriorityEvents.includes(type)) {
      return EventPriority.MEDIUM;
    } else {
      return EventPriority.LOW;
    }
  }

  /**
   * Convert event to JSON
   */
  toJSON() {
    return {
      type: this.type,
      timestamp: this.timestamp,
      id: this.id,
      data: this.data,
      priority: this.priority
    };
  }

  /**
   * Create event from JSON
   */
  static fromJSON(json) {
    const event = new QueueStateEvent(json.type, json.data);
    event.timestamp = json.timestamp;
    event.id = json.id;
    event.priority = json.priority;
    return event;
  }
}

/**
 * Queue state event manager
 * Manages and distributes queue state change events to UI components
 */
export class QueueStateEventManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Event history
      maxEventHistory: config.maxEventHistory || 1000,
      enableEventHistory: config.enableEventHistory !== false,
      
      // Event filtering
      enableEventFiltering: config.enableEventFiltering !== false,
      defaultEventFilter: config.defaultEventFilter || null,
      
      // Event batching
      enableEventBatching: config.enableEventBatching || false,
      batchInterval: config.batchInterval || 100, // ms
      maxBatchSize: config.maxBatchSize || 50,
      
      // Performance
      enableEventThrottling: config.enableEventThrottling || false,
      throttleInterval: config.throttleInterval || 50, // ms
      
      // Persistence
      enableEventPersistence: config.enableEventPersistence || false,
      persistenceFile: config.persistenceFile || 'queue-events.json',
      
      ...config
    };
    
    // Event state
    this.eventHistory = [];
    this.eventFilters = new Map();
    this.eventListeners = new Map();
    this.batchedEvents = [];
    this.lastEventTime = new Map();
    
    // Timers
    this.batchTimer = null;
    
    // Statistics
    this.stats = {
      totalEvents: 0,
      eventsByType: new Map(),
      lastEventTime: 0,
      averageEventInterval: 0
    };
    
    // Initialize
    this.initialize();
  }

  /**
   * Initialize event manager
   */
  initialize() {
    // Start batch timer if enabled
    if (this.config.enableEventBatching) {
      this.startBatchTimer();
    }
    
    // Load persisted events if enabled
    if (this.config.enableEventPersistence) {
      this.loadPersistedEvents();
    }
    
    this.emit('initialized');
  }

  /**
   * Emit a queue state event
   * @param {string} type - Event type
   * @param {Object} data - Event data
   * @returns {QueueStateEvent} The created event
   */
  emitQueueEvent(type, data = {}) {
    const event = new QueueStateEvent(type, data);
    
    // Apply throttling if enabled
    if (this.config.enableEventThrottling) {
      const lastTime = this.lastEventTime.get(type) || 0;
      const now = Date.now();
      
      if (now - lastTime < this.config.throttleInterval) {
        return event; // Skip throttled event
      }
      
      this.lastEventTime.set(type, now);
    }
    
    // Update statistics
    this.updateEventStats(event);
    
    // Add to history
    if (this.config.enableEventHistory) {
      this.addToHistory(event);
    }
    
    // Handle event distribution
    if (this.config.enableEventBatching) {
      this.addToBatch(event);
    } else {
      this.distributeEvent(event);
    }
    
    // Persist event if enabled
    if (this.config.enableEventPersistence) {
      this.persistEvent(event);
    }
    
    return event;
  }

  /**
   * Register an event listener with optional filtering
   * @param {string} listenerId - Unique listener ID
   * @param {Function} callback - Event callback function
   * @param {Object} options - Listener options
   */
  registerListener(listenerId, callback, options = {}) {
    const listener = {
      id: listenerId,
      callback,
      filter: options.filter || null,
      priority: options.priority || EventPriority.MEDIUM,
      enabled: options.enabled !== false,
      eventTypes: options.eventTypes || null, // Array of specific event types
      metadata: options.metadata || {}
    };
    
    this.eventListeners.set(listenerId, listener);
    
    this.emit('listenerRegistered', {
      listenerId,
      eventTypes: listener.eventTypes,
      priority: listener.priority
    });
    
    return listener;
  }

  /**
   * Unregister an event listener
   * @param {string} listenerId - Listener ID to remove
   */
  unregisterListener(listenerId) {
    const removed = this.eventListeners.delete(listenerId);
    
    if (removed) {
      this.emit('listenerUnregistered', { listenerId });
    }
    
    return removed;
  }

  /**
   * Enable or disable a listener
   * @param {string} listenerId - Listener ID
   * @param {boolean} enabled - Enable state
   */
  setListenerEnabled(listenerId, enabled) {
    const listener = this.eventListeners.get(listenerId);
    if (listener) {
      listener.enabled = enabled;
      this.emit('listenerStateChanged', { listenerId, enabled });
    }
  }

  /**
   * Distribute event to registered listeners
   * @param {QueueStateEvent} event - Event to distribute
   */
  distributeEvent(event) {
    const listeners = Array.from(this.eventListeners.values())
      .filter(listener => this.shouldReceiveEvent(listener, event))
      .sort((a, b) => b.priority - a.priority); // Higher priority first
    
    for (const listener of listeners) {
      try {
        listener.callback(event);
      } catch (error) {
        this.emit('listenerError', {
          listenerId: listener.id,
          error: error.message,
          event: event.toJSON()
        });
      }
    }
    
    // Emit to EventEmitter listeners
    this.emit('queueStateEvent', event);
    this.emit(event.type, event);
  }

  /**
   * Check if listener should receive event
   * @param {Object} listener - Listener configuration
   * @param {QueueStateEvent} event - Event to check
   * @returns {boolean} Should receive event
   */
  shouldReceiveEvent(listener, event) {
    if (!listener.enabled) {
      return false;
    }
    
    // Check event type filter
    if (listener.eventTypes && !listener.eventTypes.includes(event.type)) {
      return false;
    }
    
    // Apply custom filter
    if (listener.filter && typeof listener.filter === 'function') {
      try {
        return listener.filter(event);
      } catch (error) {
        this.emit('filterError', {
          listenerId: listener.id,
          error: error.message
        });
        return false;
      }
    }
    
    return true;
  }

  /**
   * Add event to batch for later distribution
   * @param {QueueStateEvent} event - Event to batch
   */
  addToBatch(event) {
    this.batchedEvents.push(event);
    
    // Check if batch is full
    if (this.batchedEvents.length >= this.config.maxBatchSize) {
      this.flushBatch();
    }
  }

  /**
   * Flush batched events
   */
  flushBatch() {
    if (this.batchedEvents.length === 0) {
      return;
    }
    
    const events = [...this.batchedEvents];
    this.batchedEvents = [];
    
    // Distribute batch
    this.emit('eventBatch', events);
    
    // Distribute individual events
    for (const event of events) {
      this.distributeEvent(event);
    }
  }

  /**
   * Start batch timer
   */
  startBatchTimer() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.batchInterval);
  }

  /**
   * Add event to history
   * @param {QueueStateEvent} event - Event to add
   */
  addToHistory(event) {
    this.eventHistory.push(event);
    
    // Trim history if too large
    if (this.eventHistory.length > this.config.maxEventHistory) {
      this.eventHistory = this.eventHistory.slice(-this.config.maxEventHistory);
    }
  }

  /**
   * Get event history
   * @param {Object} options - Filter options
   * @returns {Array} Filtered event history
   */
  getEventHistory(options = {}) {
    let history = [...this.eventHistory];
    
    // Filter by event types
    if (options.eventTypes) {
      history = history.filter(event => options.eventTypes.includes(event.type));
    }
    
    // Filter by time range
    if (options.since) {
      history = history.filter(event => event.timestamp >= options.since);
    }
    
    if (options.until) {
      history = history.filter(event => event.timestamp <= options.until);
    }
    
    // Filter by priority
    if (options.priority) {
      history = history.filter(event => event.priority >= options.priority);
    }
    
    // Limit results
    if (options.limit) {
      history = history.slice(-options.limit);
    }
    
    return history;
  }

  /**
   * Clear event history
   */
  clearEventHistory() {
    const clearedCount = this.eventHistory.length;
    this.eventHistory = [];
    
    this.emit('historyCleared', { clearedCount });
  }

  /**
   * Update event statistics
   * @param {QueueStateEvent} event - Event to process
   */
  updateEventStats(event) {
    this.stats.totalEvents++;
    
    // Update event type count
    const typeCount = this.stats.eventsByType.get(event.type) || 0;
    this.stats.eventsByType.set(event.type, typeCount + 1);
    
    // Update timing statistics
    const now = Date.now();
    if (this.stats.lastEventTime > 0) {
      const interval = now - this.stats.lastEventTime;
      this.stats.averageEventInterval = 
        (this.stats.averageEventInterval * (this.stats.totalEvents - 1) + interval) / this.stats.totalEvents;
    }
    this.stats.lastEventTime = now;
  }

  /**
   * Get event statistics
   * @returns {Object} Event statistics
   */
  getEventStats() {
    return {
      ...this.stats,
      eventsByType: Object.fromEntries(this.stats.eventsByType),
      activeListeners: this.eventListeners.size,
      historySize: this.eventHistory.length,
      batchedEvents: this.batchedEvents.length
    };
  }

  /**
   * Persist event to storage
   * @param {QueueStateEvent} event - Event to persist
   */
  async persistEvent(event) {
    // Implementation would depend on storage backend
    // This is a placeholder for future implementation
    try {
      // Could save to file, database, etc.
      this.emit('eventPersisted', { eventId: event.id });
    } catch (error) {
      this.emit('persistenceError', {
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Load persisted events
   */
  async loadPersistedEvents() {
    // Implementation would depend on storage backend
    // This is a placeholder for future implementation
    try {
      this.emit('eventsLoaded', { count: 0 });
    } catch (error) {
      this.emit('loadError', { error: error.message });
    }
  }

  /**
   * Create a UI-specific event listener
   * @param {string} componentId - UI component ID
   * @param {Array} eventTypes - Event types to listen for
   * @param {Function} updateCallback - UI update callback
   * @returns {string} Listener ID
   */
  createUIListener(componentId, eventTypes, updateCallback) {
    const listenerId = `ui_${componentId}_${Date.now()}`;
    
    const wrappedCallback = (event) => {
      // Transform event for UI consumption
      const uiEvent = {
        type: event.type,
        timestamp: event.timestamp,
        data: event.data,
        priority: event.priority,
        componentId
      };
      
      updateCallback(uiEvent);
    };
    
    this.registerListener(listenerId, wrappedCallback, {
      eventTypes,
      priority: EventPriority.HIGH,
      metadata: { componentType: 'ui', componentId }
    });
    
    return listenerId;
  }

  /**
   * Create a logging event listener
   * @param {string} logLevel - Log level (debug, info, warn, error)
   * @param {Function} logFunction - Logging function
   * @returns {string} Listener ID
   */
  createLogListener(logLevel = 'info', logFunction = console.log) {
    const listenerId = `log_${logLevel}_${Date.now()}`;
    
    const logCallback = (event) => {
      const logMessage = `[${new Date(event.timestamp).toISOString()}] ${event.type}: ${JSON.stringify(event.data)}`;
      logFunction(logMessage);
    };
    
    // Filter events by log level
    const eventFilter = (event) => {
      switch (logLevel) {
        case 'error':
          return event.priority === EventPriority.HIGH;
        case 'warn':
          return event.priority >= EventPriority.MEDIUM;
        case 'info':
          return event.priority >= EventPriority.LOW;
        case 'debug':
        default:
          return true;
      }
    };
    
    this.registerListener(listenerId, logCallback, {
      filter: eventFilter,
      priority: EventPriority.LOW,
      metadata: { listenerType: 'log', logLevel }
    });
    
    return listenerId;
  }

  /**
   * Cleanup and destroy event manager
   */
  destroy() {
    // Clear timers
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Flush any remaining batched events
    this.flushBatch();
    
    // Clear listeners and history
    this.eventListeners.clear();
    this.eventHistory = [];
    this.batchedEvents = [];
    
    // Remove all event listeners
    this.removeAllListeners();
    
    this.emit('destroyed');
  }
}

// Global queue state event manager instance
export const globalQueueEventManager = new QueueStateEventManager();

// Convenience functions for common event types
export const QueueEvents = {
  /**
   * Emit job added event
   */
  jobAdded: (jobId, priority, queueSize) => {
    return globalQueueEventManager.emitQueueEvent(QueueStateEventType.JOB_ADDED, {
      jobId,
      priority,
      queueSize,
      timestamp: Date.now()
    });
  },

  /**
   * Emit job removed event
   */
  jobRemoved: (jobId, reason, queueSize) => {
    return globalQueueEventManager.emitQueueEvent(QueueStateEventType.JOB_REMOVED, {
      jobId,
      reason,
      queueSize,
      timestamp: Date.now()
    });
  },

  /**
   * Emit job processing started event
   */
  jobProcessingStarted: (jobId, processingInfo) => {
    return globalQueueEventManager.emitQueueEvent(QueueStateEventType.JOB_PROCESSING_STARTED, {
      jobId,
      ...processingInfo,
      timestamp: Date.now()
    });
  },

  /**
   * Emit job processing completed event
   */
  jobProcessingCompleted: (jobId, result) => {
    return globalQueueEventManager.emitQueueEvent(QueueStateEventType.JOB_PROCESSING_COMPLETED, {
      jobId,
      result,
      timestamp: Date.now()
    });
  },

  /**
   * Emit queue stats updated event
   */
  queueStatsUpdated: (stats) => {
    return globalQueueEventManager.emitQueueEvent(QueueStateEventType.QUEUE_STATS_UPDATED, {
      stats,
      timestamp: Date.now()
    });
  },

  /**
   * Emit resource state changed event
   */
  resourceStateChanged: (resourceInfo) => {
    return globalQueueEventManager.emitQueueEvent(QueueStateEventType.RESOURCE_STATE_CHANGED, {
      ...resourceInfo,
      timestamp: Date.now()
    });
  },

  /**
   * Emit queue error event
   */
  queueError: (error, context) => {
    return globalQueueEventManager.emitQueueEvent(QueueStateEventType.QUEUE_ERROR, {
      error: error.message,
      stack: error.stack,
      context,
      timestamp: Date.now()
    });
  }
};

export default QueueStateEventManager;