import '@testing-library/jest-dom';
import './testConfig';

// Mock process for Node.js environment
global.process = {
  ...global.process,
  platform: 'darwin',
  env: {
    NODE_ENV: 'test',
    ...global.process.env
  },
  cwd: jest.fn(() => '/mock/working/directory'),
  memoryUsage: jest.fn(() => ({
    rss: 1024 * 1024 * 50, // 50MB
    heapTotal: 1024 * 1024 * 30, // 30MB
    heapUsed: 1024 * 1024 * 20, // 20MB
    external: 1024 * 1024 * 5 // 5MB
  }))
};

// Mock logger to prevent file system operations in tests
jest.mock('../shared/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    time: jest.fn(),
    timeEnd: jest.fn(),
    logMemoryUsage: jest.fn(),
    reportError: jest.fn()
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    time: jest.fn(),
    timeEnd: jest.fn(),
    logMemoryUsage: jest.fn(),
    reportError: jest.fn()
  }))
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

// Mock window.electronAPI for Electron-specific functionality
Object.defineProperty(window, 'electronAPI', {
  value: {
    invoke: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    send: jest.fn()
  }
});

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = jest.fn();

// Ensure URL exists on window
if (!window.URL) {
  window.URL = {};
}

Object.defineProperty(window.URL, 'createObjectURL', {
  value: mockCreateObjectURL,
  writable: true,
  configurable: true
});
Object.defineProperty(window.URL, 'revokeObjectURL', {
  value: mockRevokeObjectURL,
  writable: true,
  configurable: true
});

// Mock FileReader
const mockFileReader = {
  readAsText: jest.fn(),
  readAsDataURL: jest.fn(),
  result: null,
  onload: null,
  onerror: null,
  onprogress: null
};
Object.defineProperty(window, 'FileReader', {
  value: jest.fn(() => mockFileReader)
});

// Mock File API
const originalFile = global.File;
global.File = class extends originalFile {
  constructor(bits, name, options) {
    super(bits, name, options);
    // Store the content for the text() method
    this._content = Array.isArray(bits) ? bits.join('') : bits || '';
    this.text = jest.fn().mockResolvedValue(this._content);
  }
};
global.mockFileReader = mockFileReader;

// Mock crypto for ID generation
Object.defineProperty(window, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
    getRandomValues: jest.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    })
  }
});

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset localStorage and sessionStorage
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  sessionStorageMock.removeItem.mockClear();
  sessionStorageMock.clear.mockClear();
  
  // Reset FileReader mock
  mockFileReader.result = null;
  mockFileReader.onload = null;
  mockFileReader.onerror = null;
  mockFileReader.onprogress = null;
});

// Suppress specific console errors/warnings that are expected in tests
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Warning: ReactDOM.render is deprecated') ||
     args[0].includes('Warning: An invalid form control') ||
     args[0].includes('Warning: Failed prop type'))
  ) {
    return;
  }
  originalConsoleError.call(console, ...args);
};

console.warn = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Warning: componentWillReceiveProps') ||
     args[0].includes('Warning: componentWillMount'))
  ) {
    return;
  }
  originalConsoleWarn.call(console, ...args);
};

// Global test utilities
global.createMockFile = (name = 'test.json', content = '{}', type = 'application/json') => {
  return new File([content], name, { type });
};

global.createMockJobData = (overrides = {}) => {
  return {
    id: 'mock-job-' + Math.random().toString(36).substr(2, 9),
    inputFile: 'test.pdf',
    outputFile: 'test.docx',
    format: 'docx',
    status: 'completed',
    timestamp: new Date(),
    startTime: new Date(),
    endTime: new Date(),
    fileSize: 1024,
    metadata: {
      version: '1.0.0',
      platform: 'darwin',
      userAgent: 'Electron'
    },
    ...overrides
  };
};

global.createMockPresetData = (overrides = {}) => {
  return {
    id: 'mock-preset-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Preset',
    description: 'Test preset description',
    settings: {
      quality: 'high',
      format: 'docx'
    },
    category: 'document',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
};

// Mock service utilities
global.createMockConversionService = () => ({
  convertFormat: jest.fn(() => Promise.resolve({
    success: true,
    outputPath: '/mock/output/file.pdf',
    processingTime: 1000,
    compressionRatio: 0.8
  })),
  batchConvert: jest.fn(() => Promise.resolve([
    {
      success: true,
      outputPath: '/mock/output/file1.pdf',
      processingTime: 1000
    }
  ])),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  cancelConversion: jest.fn(),
  cancelAllConversions: jest.fn(),
  cleanup: jest.fn()
});

// Mock user preferences
global.createMockUserPreferences = () => ({
  addRecentJob: jest.fn(),
  getRecentJobs: jest.fn(() => []),
  clearRecentJobs: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  preferences: {
    general: {},
    appearance: {},
    conversion: {},
    notifications: {}
  },
  recentJobsSettings: {
    maxCount: 50,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    autoCleanup: true
  }
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};