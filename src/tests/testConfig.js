/**
 * Test Configuration and Utilities
 * Centralized configuration for all tests
 */

// Test environment configuration
export const TEST_CONFIG = {
  // Timeouts
  TIMEOUTS: {
    SHORT: 1000,
    MEDIUM: 5000,
    LONG: 10000,
    VERY_LONG: 30000
  },
  
  // Mock data
  MOCK_DATA: {
    FILES: {
      PDF: { name: 'test.pdf', type: 'application/pdf', size: 1024 },
      DOCX: { name: 'test.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 2048 },
      JPG: { name: 'test.jpg', type: 'image/jpeg', size: 512 },
      PNG: { name: 'test.png', type: 'image/png', size: 768 },
      MP3: { name: 'test.mp3', type: 'audio/mpeg', size: 1536 },
      MP4: { name: 'test.mp4', type: 'video/mp4', size: 3072 }
    },
    
    PATHS: {
      INPUT: '/mock/input',
      OUTPUT: '/mock/output',
      TEMP: '/mock/temp'
    },
    
    SETTINGS: {
      DOCUMENT: {
        quality: 'high',
        format: 'pdf',
        preserveMetadata: true
      },
      IMAGE: {
        quality: 90,
        format: 'jpeg',
        resize: false
      },
      AUDIO: {
        bitrate: '192k',
        format: 'mp3',
        channels: 2
      },
      VIDEO: {
        codec: 'h264',
        format: 'mp4',
        quality: 'high'
      }
    }
  },
  
  // Test categories
  CATEGORIES: {
    UNIT: 'unit',
    INTEGRATION: 'integration',
    E2E: 'e2e',
    PERFORMANCE: 'performance'
  }
};

// Test utilities
export const TestUtils = {
  /**
   * Create a mock file object
   */
  createMockFile: (name, type, size = 1024) => {
    return new File(['mock content'], name, { type });
  },
  
  /**
   * Create mock job data
   */
  createMockJob: (overrides = {}) => {
    return {
      id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: 'Test Job',
      type: 'document',
      status: 'pending',
      createdAt: Date.now(),
      metadata: {
        version: '1.0.0',
        platform: 'darwin',
        userAgent: 'Electron'
      },
      ...overrides
    };
  },
  
  /**
   * Create mock conversion settings
   */
  createMockSettings: (type = 'document', overrides = {}) => {
    const baseSettings = TEST_CONFIG.MOCK_DATA.SETTINGS[type.toUpperCase()] || {};
    return { ...baseSettings, ...overrides };
  },
  
  /**
   * Wait for a specified time (useful for async tests)
   */
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * Mock console methods to reduce noise in tests
   */
  mockConsole: () => {
    const originalConsole = { ...console };
    
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
    console.debug = jest.fn();
    
    return {
      restore: () => {
        Object.assign(console, originalConsole);
      }
    };
  },
  
  /**
   * Create a mock event emitter
   */
  createMockEventEmitter: () => {
    const listeners = new Map();
    
    return {
      on: jest.fn((event, listener) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(listener);
      }),
      off: jest.fn((event, listener) => {
        if (listeners.has(event)) {
          const eventListeners = listeners.get(event);
          const index = eventListeners.indexOf(listener);
          if (index > -1) {
            eventListeners.splice(index, 1);
          }
        }
      }),
      emit: jest.fn((event, ...args) => {
        if (listeners.has(event)) {
          listeners.get(event).forEach(listener => listener(...args));
        }
      }),
      removeAllListeners: jest.fn((event) => {
        if (event) {
          listeners.delete(event);
        } else {
          listeners.clear();
        }
      })
    };
  }
};

// Test matchers for custom assertions
export const customMatchers = {
  toBeValidJob: (received) => {
    const pass = received && 
                 typeof received.id === 'string' &&
                 typeof received.name === 'string' &&
                 typeof received.type === 'string' &&
                 typeof received.status === 'string' &&
                 typeof received.createdAt === 'number';
    
    return {
      pass,
      message: () => `Expected ${received} to be a valid job object`
    };
  },
  
  toBeValidSettings: (received) => {
    const pass = received && typeof received === 'object';
    
    return {
      pass,
      message: () => `Expected ${received} to be a valid settings object`
    };
  }
};

// Extend Jest matchers
if (typeof expect !== 'undefined') {
  expect.extend(customMatchers);
}

export default {
  TEST_CONFIG,
  TestUtils,
  customMatchers
};
