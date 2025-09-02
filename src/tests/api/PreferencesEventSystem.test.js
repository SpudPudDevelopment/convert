const {
  PreferencesEventSystem,
  EventSubscription
} = require('../../shared/api/PreferencesEventSystem');
const EventEmitter = require('events');

describe('EventSubscription', () => {
  describe('constructor', () => {
    test('should create subscription with required parameters', () => {
      const callback = jest.fn();
      const subscription = new EventSubscription('test-id', 'preferenceChanged', callback);

      expect(subscription.id).toBe('test-id');
      expect(subscription.eventType).toBe('preferenceChanged');
      expect(subscription.callback).toBe(callback);
      expect(subscription.active).toBe(true);
      expect(subscription.createdAt).toBeInstanceOf(Date);
    });

    test('should create subscription with options', () => {
      const callback = jest.fn();
      const options = {
        pathFilter: 'theme',
        valueFilter: 'dark',
        userFilter: 'user123',
        customFilter: (event) => event.priority === 'high',
        batchSize: 10,
        batchTimeout: 500,
        priority: 5
      };

      const subscription = new EventSubscription('test-id', 'preferenceChanged', callback, options);

      expect(subscription.pathFilter).toBe('theme');
      expect(subscription.valueFilter).toBe('dark');
      expect(subscription.userFilter).toBe('user123');
      expect(subscription.customFilter).toBe(options.customFilter);
      expect(subscription.batchSize).toBe(10);
      expect(subscription.batchTimeout).toBe(500);
      expect(subscription.priority).toBe(5);
    });

    test('should use default values for optional parameters', () => {
      const callback = jest.fn();
      const subscription = new EventSubscription('test-id', 'preferenceChanged', callback);

      expect(subscription.pathFilter).toBeNull();
      expect(subscription.valueFilter).toBeNull();
      expect(subscription.userFilter).toBeNull();
      expect(subscription.customFilter).toBeNull();
      expect(subscription.batchSize).toBe(1);
      expect(subscription.batchTimeout).toBe(0);
      expect(subscription.priority).toBe(0);
    });
  });

  describe('matches', () => {
    let subscription;
    let callback;

    beforeEach(() => {
      callback = jest.fn();
    });

    test('should match event without filters', () => {
      subscription = new EventSubscription('test-id', 'preferenceChanged', callback);
      const event = {
        type: 'preferenceChanged',
        path: 'theme',
        value: 'dark'
      };

      expect(subscription.matches(event)).toBe(true);
    });

    test('should match event with path filter', () => {
      subscription = new EventSubscription('test-id', 'preferenceChanged', callback, {
        pathFilter: 'theme'
      });

      const matchingEvent = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      const nonMatchingEvent = { type: 'preferenceChanged', path: 'quality', value: 'high' };

      expect(subscription.matches(matchingEvent)).toBe(true);
      expect(subscription.matches(nonMatchingEvent)).toBe(false);
    });

    test('should match event with value filter', () => {
      subscription = new EventSubscription('test-id', 'preferenceChanged', callback, {
        valueFilter: 'dark'
      });

      const matchingEvent = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      const nonMatchingEvent = { type: 'preferenceChanged', path: 'theme', value: 'light' };

      expect(subscription.matches(matchingEvent)).toBe(true);
      expect(subscription.matches(nonMatchingEvent)).toBe(false);
    });

    test('should match event with user filter', () => {
      subscription = new EventSubscription('test-id', 'preferenceChanged', callback, {
        userFilter: 'user123'
      });

      const matchingEvent = { type: 'preferenceChanged', userId: 'user123', path: 'theme' };
      const nonMatchingEvent = { type: 'preferenceChanged', userId: 'user456', path: 'theme' };

      expect(subscription.matches(matchingEvent)).toBe(true);
      expect(subscription.matches(nonMatchingEvent)).toBe(false);
    });

    test('should match event with custom filter', () => {
      subscription = new EventSubscription('test-id', 'preferenceChanged', callback, {
        customFilter: (event) => event.priority === 'high'
      });

      const matchingEvent = { type: 'preferenceChanged', priority: 'high', path: 'theme' };
      const nonMatchingEvent = { type: 'preferenceChanged', priority: 'low', path: 'theme' };

      expect(subscription.matches(matchingEvent)).toBe(true);
      expect(subscription.matches(nonMatchingEvent)).toBe(false);
    });

    test('should match event with multiple filters', () => {
      subscription = new EventSubscription('test-id', 'preferenceChanged', callback, {
        pathFilter: 'theme',
        valueFilter: 'dark',
        userFilter: 'user123'
      });

      const matchingEvent = {
        type: 'preferenceChanged',
        path: 'theme',
        value: 'dark',
        userId: 'user123'
      };

      const nonMatchingEvent1 = {
        type: 'preferenceChanged',
        path: 'quality', // Wrong path
        value: 'dark',
        userId: 'user123'
      };

      const nonMatchingEvent2 = {
        type: 'preferenceChanged',
        path: 'theme',
        value: 'light', // Wrong value
        userId: 'user123'
      };

      expect(subscription.matches(matchingEvent)).toBe(true);
      expect(subscription.matches(nonMatchingEvent1)).toBe(false);
      expect(subscription.matches(nonMatchingEvent2)).toBe(false);
    });

    test('should not match inactive subscription', () => {
      subscription = new EventSubscription('test-id', 'preferenceChanged', callback);
      subscription.active = false;

      const event = { type: 'preferenceChanged', path: 'theme', value: 'dark' };

      expect(subscription.matches(event)).toBe(false);
    });
  });

  describe('addToBatch', () => {
    test('should add event to batch', () => {
      const callback = jest.fn();
      const subscription = new EventSubscription('test-id', 'preferenceChanged', callback, {
        batchSize: 3
      });

      const event = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      subscription.addToBatch(event);

      expect(subscription.batch).toHaveLength(1);
      expect(subscription.batch[0]).toBe(event);
    });

    test('should trigger callback when batch is full', () => {
      const callback = jest.fn();
      const subscription = new EventSubscription('test-id', 'preferenceChanged', callback, {
        batchSize: 2
      });

      const event1 = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      const event2 = { type: 'preferenceChanged', path: 'quality', value: 'high' };

      subscription.addToBatch(event1);
      expect(callback).not.toHaveBeenCalled();

      subscription.addToBatch(event2);
      expect(callback).toHaveBeenCalledWith([event1, event2]);
      expect(subscription.batch).toHaveLength(0);
    });
  });

  describe('flushBatch', () => {
    test('should flush batch and call callback', () => {
      const callback = jest.fn();
      const subscription = new EventSubscription('test-id', 'preferenceChanged', callback, {
        batchSize: 5
      });

      const event1 = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      const event2 = { type: 'preferenceChanged', path: 'quality', value: 'high' };

      subscription.addToBatch(event1);
      subscription.addToBatch(event2);

      subscription.flushBatch();

      expect(callback).toHaveBeenCalledWith([event1, event2]);
      expect(subscription.batch).toHaveLength(0);
    });

    test('should not call callback for empty batch', () => {
      const callback = jest.fn();
      const subscription = new EventSubscription('test-id', 'preferenceChanged', callback);

      subscription.flushBatch();

      expect(callback).not.toHaveBeenCalled();
    });
  });
});

describe('PreferencesEventSystem', () => {
  let eventSystem;

  beforeEach(() => {
    eventSystem = new PreferencesEventSystem({
      maxSubscriptions: 100,
      enableBatching: true,
      defaultBatchTimeout: 100,
      enablePriority: true
    });
  });

  afterEach(() => {
    if (eventSystem) {
      eventSystem.destroy();
    }
  });

  describe('constructor', () => {
    test('should create event system with default options', () => {
      const defaultSystem = new PreferencesEventSystem();

      expect(defaultSystem).toBeInstanceOf(PreferencesEventSystem);
      expect(defaultSystem).toBeInstanceOf(EventEmitter);
      expect(defaultSystem.options.maxSubscriptions).toBe(1000);
      expect(defaultSystem.options.enableBatching).toBe(false);
    });

    test('should create event system with custom options', () => {
      const customOptions = {
        maxSubscriptions: 50,
        enableBatching: true,
        defaultBatchTimeout: 200,
        enablePriority: true,
        enableGlobalFilters: true
      };

      const customSystem = new PreferencesEventSystem(customOptions);

      expect(customSystem.options.maxSubscriptions).toBe(50);
      expect(customSystem.options.enableBatching).toBe(true);
      expect(customSystem.options.defaultBatchTimeout).toBe(200);
      expect(customSystem.options.enablePriority).toBe(true);
      expect(customSystem.options.enableGlobalFilters).toBe(true);
    });
  });

  describe('subscribe', () => {
    test('should create subscription and return ID', () => {
      const callback = jest.fn();
      const subscriptionId = eventSystem.subscribe('preferenceChanged', callback);

      expect(subscriptionId).toBeDefined();
      expect(typeof subscriptionId).toBe('string');
      expect(eventSystem.subscriptions.has(subscriptionId)).toBe(true);
    });

    test('should create subscription with options', () => {
      const callback = jest.fn();
      const options = {
        pathFilter: 'theme',
        priority: 5
      };

      const subscriptionId = eventSystem.subscribe('preferenceChanged', callback, options);
      const subscription = eventSystem.subscriptions.get(subscriptionId);

      expect(subscription.pathFilter).toBe('theme');
      expect(subscription.priority).toBe(5);
    });

    test('should emit subscriptionCreated event', () => {
      const eventSpy = jest.fn();
      eventSystem.on('subscriptionCreated', eventSpy);

      const callback = jest.fn();
      const subscriptionId = eventSystem.subscribe('preferenceChanged', callback);

      expect(eventSpy).toHaveBeenCalledWith({
        subscriptionId,
        eventType: 'preferenceChanged',
        timestamp: expect.any(Date)
      });
    });

    test('should reject when max subscriptions reached', () => {
      // Create subscriptions up to the limit
      for (let i = 0; i < eventSystem.options.maxSubscriptions; i++) {
        eventSystem.subscribe('preferenceChanged', jest.fn());
      }

      // Try to create one more
      expect(() => {
        eventSystem.subscribe('preferenceChanged', jest.fn());
      }).toThrow('Maximum number of subscriptions reached');
    });

    test('should generate unique subscription IDs', () => {
      const callback = jest.fn();
      const id1 = eventSystem.subscribe('preferenceChanged', callback);
      const id2 = eventSystem.subscribe('preferenceChanged', callback);
      const id3 = eventSystem.subscribe('preferenceChanged', callback);

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe('unsubscribe', () => {
    test('should remove existing subscription', () => {
      const callback = jest.fn();
      const subscriptionId = eventSystem.subscribe('preferenceChanged', callback);

      expect(eventSystem.subscriptions.has(subscriptionId)).toBe(true);

      const result = eventSystem.unsubscribe(subscriptionId);

      expect(result).toBe(true);
      expect(eventSystem.subscriptions.has(subscriptionId)).toBe(false);
    });

    test('should emit subscriptionRemoved event', () => {
      const eventSpy = jest.fn();
      eventSystem.on('subscriptionRemoved', eventSpy);

      const callback = jest.fn();
      const subscriptionId = eventSystem.subscribe('preferenceChanged', callback);
      eventSystem.unsubscribe(subscriptionId);

      expect(eventSpy).toHaveBeenCalledWith({
        subscriptionId,
        timestamp: expect.any(Date)
      });
    });

    test('should return false for non-existent subscription', () => {
      const result = eventSystem.unsubscribe('non-existent-id');

      expect(result).toBe(false);
    });

    test('should clear batch timeout when unsubscribing', () => {
      const callback = jest.fn();
      const subscriptionId = eventSystem.subscribe('preferenceChanged', callback, {
        batchSize: 5,
        batchTimeout: 1000
      });

      const subscription = eventSystem.subscriptions.get(subscriptionId);
      subscription.batchTimeoutId = setTimeout(() => {}, 1000);

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      eventSystem.unsubscribe(subscriptionId);

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('publish', () => {
    test('should publish event to matching subscriptions', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      eventSystem.subscribe('preferenceChanged', callback1);
      eventSystem.subscribe('preferenceChanged', callback2, { pathFilter: 'theme' });
      eventSystem.subscribe('validationError', callback3);

      const event = {
        type: 'preferenceChanged',
        path: 'theme',
        value: 'dark'
      };

      eventSystem.publish(event);

      expect(callback1).toHaveBeenCalledWith(event);
      expect(callback2).toHaveBeenCalledWith(event);
      expect(callback3).not.toHaveBeenCalled();
    });

    test('should respect priority ordering', () => {
      const callOrder = [];
      const callback1 = jest.fn(() => callOrder.push('low'));
      const callback2 = jest.fn(() => callOrder.push('high'));
      const callback3 = jest.fn(() => callOrder.push('medium'));

      eventSystem.subscribe('preferenceChanged', callback1, { priority: 1 });
      eventSystem.subscribe('preferenceChanged', callback2, { priority: 10 });
      eventSystem.subscribe('preferenceChanged', callback3, { priority: 5 });

      const event = {
        type: 'preferenceChanged',
        path: 'theme',
        value: 'dark'
      };

      eventSystem.publish(event);

      expect(callOrder).toEqual(['high', 'medium', 'low']);
    });

    test('should handle batched subscriptions', (done) => {
      const callback = jest.fn();
      eventSystem.subscribe('preferenceChanged', callback, {
        batchSize: 3,
        batchTimeout: 50
      });

      const event1 = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      const event2 = { type: 'preferenceChanged', path: 'quality', value: 'high' };

      eventSystem.publish(event1);
      eventSystem.publish(event2);

      // Should not be called immediately
      expect(callback).not.toHaveBeenCalled();

      // Should be called after timeout
      setTimeout(() => {
        expect(callback).toHaveBeenCalledWith([event1, event2]);
        done();
      }, 100);
    });

    test('should add event to queue when processing', () => {
      const callback = jest.fn(() => {
        // Simulate slow processing
        const start = Date.now();
        while (Date.now() - start < 10) {}
      });

      eventSystem.subscribe('preferenceChanged', callback);

      const event1 = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      const event2 = { type: 'preferenceChanged', path: 'quality', value: 'high' };

      eventSystem.publish(event1);
      eventSystem.publish(event2); // Should be queued

      expect(eventSystem.eventQueue.length).toBeGreaterThan(0);
    });

    test('should apply global filters', () => {
      const globalFilter = jest.fn((event) => event.path !== 'blocked');
      eventSystem.addGlobalFilter(globalFilter);

      const callback = jest.fn();
      eventSystem.subscribe('preferenceChanged', callback);

      const allowedEvent = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      const blockedEvent = { type: 'preferenceChanged', path: 'blocked', value: 'test' };

      eventSystem.publish(allowedEvent);
      eventSystem.publish(blockedEvent);

      expect(callback).toHaveBeenCalledWith(allowedEvent);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('processQueue', () => {
    test('should process queued events', () => {
      const callback = jest.fn();
      eventSystem.subscribe('preferenceChanged', callback);

      // Add events to queue manually
      eventSystem.eventQueue.push(
        { type: 'preferenceChanged', path: 'theme', value: 'dark' },
        { type: 'preferenceChanged', path: 'quality', value: 'high' }
      );

      eventSystem.processQueue();

      expect(callback).toHaveBeenCalledTimes(2);
      expect(eventSystem.eventQueue).toHaveLength(0);
    });

    test('should handle errors during queue processing', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Processing error');
      });
      const normalCallback = jest.fn();

      eventSystem.subscribe('preferenceChanged', errorCallback);
      eventSystem.subscribe('preferenceChanged', normalCallback);

      const errorSpy = jest.fn();
      eventSystem.on('error', errorSpy);

      eventSystem.eventQueue.push({ type: 'preferenceChanged', path: 'theme', value: 'dark' });
      eventSystem.processQueue();

      expect(errorSpy).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled(); // Should still process other subscriptions
    });
  });

  describe('global filters', () => {
    test('should add global filter', () => {
      const filter = jest.fn();
      eventSystem.addGlobalFilter(filter);

      expect(eventSystem.globalFilters).toContain(filter);
    });

    test('should remove global filter', () => {
      const filter = jest.fn();
      eventSystem.addGlobalFilter(filter);

      expect(eventSystem.globalFilters).toContain(filter);

      eventSystem.removeGlobalFilter(filter);

      expect(eventSystem.globalFilters).not.toContain(filter);
    });

    test('should clear all global filters', () => {
      eventSystem.addGlobalFilter(jest.fn());
      eventSystem.addGlobalFilter(jest.fn());

      expect(eventSystem.globalFilters).toHaveLength(2);

      eventSystem.clearGlobalFilters();

      expect(eventSystem.globalFilters).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    test('should return system statistics', () => {
      const callback = jest.fn();
      eventSystem.subscribe('preferenceChanged', callback);
      eventSystem.subscribe('validationError', callback);

      eventSystem.publish({ type: 'preferenceChanged', path: 'theme', value: 'dark' });
      eventSystem.publish({ type: 'preferenceChanged', path: 'quality', value: 'high' });

      const stats = eventSystem.getStats();

      expect(stats).toEqual({
        totalSubscriptions: 2,
        activeSubscriptions: 2,
        totalEventsPublished: 2,
        totalEventsDelivered: 4, // 2 events × 2 subscriptions
        queueSize: 0,
        globalFilters: 0,
        createdAt: expect.any(Date),
        lastActivity: expect.any(Date)
      });
    });

    test('should update lastActivity on operations', () => {
      const initialStats = eventSystem.getStats();

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        eventSystem.subscribe('preferenceChanged', jest.fn());
        const updatedStats = eventSystem.getStats();

        expect(updatedStats.lastActivity.getTime())
          .toBeGreaterThan(initialStats.lastActivity.getTime());
      }, 10);
    });
  });

  describe('cleanup and destruction', () => {
    test('should clear all subscriptions on destroy', () => {
      eventSystem.subscribe('preferenceChanged', jest.fn());
      eventSystem.subscribe('validationError', jest.fn());

      expect(eventSystem.subscriptions.size).toBe(2);

      eventSystem.destroy();

      expect(eventSystem.subscriptions.size).toBe(0);
    });

    test('should clear event queue on destroy', () => {
      eventSystem.eventQueue.push(
        { type: 'preferenceChanged', path: 'theme', value: 'dark' },
        { type: 'preferenceChanged', path: 'quality', value: 'high' }
      );

      expect(eventSystem.eventQueue).toHaveLength(2);

      eventSystem.destroy();

      expect(eventSystem.eventQueue).toHaveLength(0);
    });

    test('should clear all timeouts on destroy', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      // Create subscription with batch timeout
      eventSystem.subscribe('preferenceChanged', jest.fn(), {
        batchSize: 5,
        batchTimeout: 1000
      });

      eventSystem.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    test('should emit destroyed event', () => {
      const eventSpy = jest.fn();
      eventSystem.on('destroyed', eventSpy);

      eventSystem.destroy();

      expect(eventSpy).toHaveBeenCalledWith({
        timestamp: expect.any(Date)
      });
    });
  });

  describe('performance', () => {
    test('should handle many subscriptions efficiently', () => {
      const startTime = Date.now();

      // Create many subscriptions
      for (let i = 0; i < 100; i++) {
        eventSystem.subscribe('preferenceChanged', jest.fn());
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100); // 100ms
      expect(eventSystem.subscriptions.size).toBe(100);
    });

    test('should publish events efficiently to many subscribers', () => {
      // Create many subscriptions
      for (let i = 0; i < 100; i++) {
        eventSystem.subscribe('preferenceChanged', jest.fn());
      }

      const startTime = Date.now();

      eventSystem.publish({
        type: 'preferenceChanged',
        path: 'theme',
        value: 'dark'
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100); // 100ms
    });
  });

  describe('error handling', () => {
    test('should handle subscription callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();

      eventSystem.subscribe('preferenceChanged', errorCallback);
      eventSystem.subscribe('preferenceChanged', normalCallback);

      const errorSpy = jest.fn();
      eventSystem.on('error', errorSpy);

      const event = { type: 'preferenceChanged', path: 'theme', value: 'dark' };
      eventSystem.publish(event);

      expect(errorSpy).toHaveBeenCalledWith({
        type: 'subscriptionError',
        subscriptionId: expect.any(String),
        error: expect.any(Error),
        event,
        timestamp: expect.any(Date)
      });

      expect(normalCallback).toHaveBeenCalledWith(event);
    });

    test('should handle invalid subscription parameters', () => {
      expect(() => {
        eventSystem.subscribe('', jest.fn());
      }).toThrow('Event type is required');

      expect(() => {
        eventSystem.subscribe('preferenceChanged', null);
      }).toThrow('Callback is required');

      expect(() => {
        eventSystem.subscribe('preferenceChanged', 'not-a-function');
      }).toThrow('Callback must be a function');
    });

    test('should handle invalid event objects', () => {
      const callback = jest.fn();
      eventSystem.subscribe('preferenceChanged', callback);

      const errorSpy = jest.fn();
      eventSystem.on('error', errorSpy);

      // Publish invalid event
      eventSystem.publish(null);
      eventSystem.publish(undefined);
      eventSystem.publish('not-an-object');

      expect(errorSpy).toHaveBeenCalledTimes(3);
      expect(callback).not.toHaveBeenCalled();
    });
  });
});