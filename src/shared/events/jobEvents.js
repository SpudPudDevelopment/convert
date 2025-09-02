import { EventEmitter } from 'events';
import { JobStatus } from '../types/jobEnums.js';

/**
 * Job event types enumeration
 */
export const JobEventType = {
  // Lifecycle events
  JOB_CREATED: 'job_created',
  JOB_STARTED: 'job_started',
  JOB_COMPLETED: 'job_completed',
  JOB_FAILED: 'job_failed',
  JOB_CANCELLED: 'job_cancelled',
  JOB_PAUSED: 'job_paused',
  JOB_RESUMED: 'job_resumed',
  JOB_RETRIED: 'job_retried',
  
  // Progress events
  JOB_PROGRESS: 'job_progress',
  JOB_STAGE_CHANGED: 'job_stage_changed',
  
  // Status events
  JOB_STATUS_CHANGED: 'job_status_changed',
  JOB_PRIORITY_CHANGED: 'job_priority_changed',
  
  // Error and warning events
  JOB_ERROR: 'job_error',
  JOB_WARNING: 'job_warning',
  
  // Queue events
  JOB_QUEUED: 'job_queued',
  JOB_DEQUEUED: 'job_dequeued',
  
  // Dependency events
  JOB_DEPENDENCY_RESOLVED: 'job_dependency_resolved',
  JOB_DEPENDENCY_FAILED: 'job_dependency_failed',
  
  // Batch events
  BATCH_STARTED: 'batch_started',
  BATCH_COMPLETED: 'batch_completed',
  BATCH_FAILED: 'batch_failed',
  BATCH_PROGRESS: 'batch_progress'
};

/**
 * Event priority levels
 */
export const EventPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Base job event class
 */
export class JobEvent {
  constructor({
    type,
    jobId,
    timestamp = new Date(),
    priority = EventPriority.NORMAL,
    data = {},
    source = 'system'
  } = {}) {
    this.type = type;
    this.jobId = jobId;
    this.timestamp = timestamp;
    this.priority = priority;
    this.data = { ...data };
    this.source = source;
    this.id = this.generateEventId();
  }

  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      jobId: this.jobId,
      timestamp: this.timestamp.toISOString(),
      priority: this.priority,
      data: this.data,
      source: this.source
    };
  }

  static fromJSON(data) {
    const event = new JobEvent({
      type: data.type,
      jobId: data.jobId,
      timestamp: new Date(data.timestamp),
      priority: data.priority,
      data: data.data,
      source: data.source
    });
    event.id = data.id;
    return event;
  }
}

/**
 * Specific event classes for different event types
 */
export class JobLifecycleEvent extends JobEvent {
  constructor({ jobId, status, previousStatus = null, message = null, ...options }) {
    super({
      type: JobEventType.JOB_STATUS_CHANGED,
      jobId,
      data: { status, previousStatus, message },
      ...options
    });
  }
}

export class JobProgressEvent extends JobEvent {
  constructor({ jobId, progress, stage = null, estimatedTimeRemaining = null, ...options }) {
    super({
      type: JobEventType.JOB_PROGRESS,
      jobId,
      data: { progress, stage, estimatedTimeRemaining },
      ...options
    });
  }
}

export class JobErrorEvent extends JobEvent {
  constructor({ jobId, error, fatal = false, retryable = true, ...options }) {
    super({
      type: JobEventType.JOB_ERROR,
      jobId,
      priority: fatal ? EventPriority.CRITICAL : EventPriority.HIGH,
      data: { error, fatal, retryable },
      ...options
    });
  }
}

export class JobWarningEvent extends JobEvent {
  constructor({ jobId, warning, code = null, ...options }) {
    super({
      type: JobEventType.JOB_WARNING,
      jobId,
      priority: EventPriority.NORMAL,
      data: { warning, code },
      ...options
    });
  }
}

export class BatchEvent extends JobEvent {
  constructor({ batchId, jobIds = [], progress = null, ...options }) {
    super({
      jobId: batchId, // Use batchId as jobId for batch events
      data: { batchId, jobIds, progress },
      ...options
    });
  }
}

/**
 * Event listener interface
 */
export class JobEventListener {
  constructor({
    id = null,
    name = 'Unnamed Listener',
    eventTypes = [],
    jobIds = [], // Empty array means listen to all jobs
    priority = EventPriority.NORMAL,
    enabled = true,
    handler = null
  } = {}) {
    this.id = id || this.generateListenerId();
    this.name = name;
    this.eventTypes = new Set(eventTypes);
    this.jobIds = new Set(jobIds);
    this.priority = priority;
    this.enabled = enabled;
    this.handler = handler;
    this.createdAt = new Date();
    this.lastTriggered = null;
    this.triggerCount = 0;
  }

  generateListenerId() {
    return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if this listener should handle the given event
   */
  shouldHandle(event) {
    if (!this.enabled) return false;
    
    // Check event type filter
    if (this.eventTypes.size > 0 && !this.eventTypes.has(event.type)) {
      return false;
    }
    
    // Check job ID filter
    if (this.jobIds.size > 0 && !this.jobIds.has(event.jobId)) {
      return false;
    }
    
    return true;
  }

  /**
   * Handle an event
   */
  async handle(event) {
    if (!this.shouldHandle(event)) return false;
    
    try {
      this.lastTriggered = new Date();
      this.triggerCount++;
      
      if (this.handler) {
        await this.handler(event, this);
      }
      
      return true;
    } catch (error) {
      console.error(`Error in event listener ${this.name}:`, error);
      return false;
    }
  }

  /**
   * Add event types to listen for
   */
  addEventTypes(...types) {
    types.forEach(type => this.eventTypes.add(type));
  }

  /**
   * Remove event types
   */
  removeEventTypes(...types) {
    types.forEach(type => this.eventTypes.delete(type));
  }

  /**
   * Add job IDs to listen for
   */
  addJobIds(...jobIds) {
    jobIds.forEach(id => this.jobIds.add(id));
  }

  /**
   * Remove job IDs
   */
  removeJobIds(...jobIds) {
    jobIds.forEach(id => this.jobIds.delete(id));
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      eventTypes: Array.from(this.eventTypes),
      jobIds: Array.from(this.jobIds),
      priority: this.priority,
      enabled: this.enabled,
      createdAt: this.createdAt.toISOString(),
      lastTriggered: this.lastTriggered?.toISOString() || null,
      triggerCount: this.triggerCount
    };
  }
}

/**
 * Event notification manager
 */
export class JobEventNotifier extends EventEmitter {
  constructor() {
    super();
    this.listeners = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    this.enabled = true;
  }

  /**
   * Register an event listener
   */
  addListener(listener) {
    if (!(listener instanceof JobEventListener)) {
      throw new Error('Listener must be an instance of JobEventListener');
    }
    
    this.listeners.set(listener.id, listener);
    this.emit('listenerAdded', listener);
    return listener.id;
  }

  /**
   * Remove an event listener
   */
  removeListener(listenerId) {
    const listener = this.listeners.get(listenerId);
    if (listener) {
      this.listeners.delete(listenerId);
      this.emit('listenerRemoved', listener);
      return true;
    }
    return false;
  }

  /**
   * Get a listener by ID
   */
  getListener(listenerId) {
    return this.listeners.get(listenerId);
  }

  /**
   * Get all listeners
   */
  getAllListeners() {
    return Array.from(this.listeners.values());
  }

  /**
   * Enable/disable a listener
   */
  setListenerEnabled(listenerId, enabled) {
    const listener = this.listeners.get(listenerId);
    if (listener) {
      listener.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Notify all relevant listeners of an event
   */
  async notify(event) {
    if (!this.enabled) return;
    
    if (!(event instanceof JobEvent)) {
      throw new Error('Event must be an instance of JobEvent');
    }
    
    // Add to history
    this.addToHistory(event);
    
    // Emit the event on this EventEmitter
    this.emit('event', event);
    this.emit(event.type, event);
    
    // Notify all matching listeners
    const promises = [];
    for (const listener of this.listeners.values()) {
      if (listener.shouldHandle(event)) {
        promises.push(listener.handle(event));
      }
    }
    
    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error notifying listeners:', error);
    }
  }

  /**
   * Add event to history
   */
  addToHistory(event) {
    this.eventHistory.push(event);
    
    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get event history
   */
  getEventHistory({
    jobId = null,
    eventTypes = [],
    since = null,
    limit = 100
  } = {}) {
    let filtered = this.eventHistory;
    
    if (jobId) {
      filtered = filtered.filter(event => event.jobId === jobId);
    }
    
    if (eventTypes.length > 0) {
      filtered = filtered.filter(event => eventTypes.includes(event.type));
    }
    
    if (since) {
      filtered = filtered.filter(event => event.timestamp >= since);
    }
    
    return filtered.slice(-limit);
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * Enable/disable the notifier
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Get statistics about listeners and events
   */
  getStatistics() {
    const listenerStats = {
      total: this.listeners.size,
      enabled: 0,
      disabled: 0,
      byPriority: {}
    };
    
    for (const listener of this.listeners.values()) {
      if (listener.enabled) {
        listenerStats.enabled++;
      } else {
        listenerStats.disabled++;
      }
      
      listenerStats.byPriority[listener.priority] = 
        (listenerStats.byPriority[listener.priority] || 0) + 1;
    }
    
    const eventStats = {
      total: this.eventHistory.length,
      byType: {},
      byPriority: {}
    };
    
    for (const event of this.eventHistory) {
      eventStats.byType[event.type] = (eventStats.byType[event.type] || 0) + 1;
      eventStats.byPriority[event.priority] = (eventStats.byPriority[event.priority] || 0) + 1;
    }
    
    return {
      listeners: listenerStats,
      events: eventStats,
      enabled: this.enabled
    };
  }
}

/**
 * Predefined event listener factories
 */
export class EventListenerFactory {
  /**
   * Create a console logger listener
   */
  static createConsoleLogger({
    name = 'Console Logger',
    eventTypes = [],
    jobIds = [],
    logLevel = 'info'
  } = {}) {
    return new JobEventListener({
      name,
      eventTypes,
      jobIds,
      handler: (event) => {
        const timestamp = event.timestamp.toISOString();
        const message = `[${timestamp}] ${event.type} - Job: ${event.jobId}`;
        
        switch (event.priority) {
          case EventPriority.CRITICAL:
            console.error(message, event.data);
            break;
          case EventPriority.HIGH:
            console.warn(message, event.data);
            break;
          default:
            console.log(message, event.data);
        }
      }
    });
  }

  /**
   * Create a file logger listener
   */
  static createFileLogger({
    name = 'File Logger',
    eventTypes = [],
    jobIds = [],
    logFile = 'job-events.log'
  } = {}) {
    return new JobEventListener({
      name,
      eventTypes,
      jobIds,
      handler: async (event) => {
        const fs = await import('fs');
        const logEntry = `${event.timestamp.toISOString()} - ${event.type} - ${event.jobId} - ${JSON.stringify(event.data)}\n`;
        
        try {
          await fs.promises.appendFile(logFile, logEntry);
        } catch (error) {
          console.error('Failed to write to log file:', error);
        }
      }
    });
  }

  /**
   * Create a progress tracker listener
   */
  static createProgressTracker({
    name = 'Progress Tracker',
    onProgress = null
  } = {}) {
    return new JobEventListener({
      name,
      eventTypes: [JobEventType.JOB_PROGRESS],
      handler: (event) => {
        if (onProgress) {
          onProgress(event.jobId, event.data.progress, event.data);
        }
      }
    });
  }

  /**
   * Create an error handler listener
   */
  static createErrorHandler({
    name = 'Error Handler',
    onError = null,
    autoRetry = false
  } = {}) {
    return new JobEventListener({
      name,
      eventTypes: [JobEventType.JOB_ERROR, JobEventType.JOB_FAILED],
      handler: (event) => {
        if (onError) {
          onError(event.jobId, event.data.error, event.data);
        }
        
        if (autoRetry && event.data.retryable) {
          // Implementation would depend on having access to job manager
          console.log(`Auto-retry would be triggered for job ${event.jobId}`);
        }
      }
    });
  }
}

// Create a global notifier instance
export const globalJobNotifier = new JobEventNotifier();

export default {
  JobEventType,
  EventPriority,
  JobEvent,
  JobLifecycleEvent,
  JobProgressEvent,
  JobErrorEvent,
  JobWarningEvent,
  BatchEvent,
  JobEventListener,
  JobEventNotifier,
  EventListenerFactory,
  globalJobNotifier
};