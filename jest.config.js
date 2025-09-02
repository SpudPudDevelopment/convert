module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupTests.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock heavy dependencies
    '^pdfjs-dist/legacy/build/pdf.js$': '<rootDir>/src/tests/__mocks__/pdfjs.js',
    '^sharp$': '<rootDir>/src/tests/__mocks__/sharp.js',
    '^ffmpeg-static$': '<rootDir>/src/tests/__mocks__/ffmpeg-static.js'
  },
  // Disable snapshot testing for now
  snapshotSerializers: [],
  testPathIgnorePatterns: ['/node_modules/', '/build/', '/dist/'],
  // Disable snapshots completely
  testEnvironmentOptions: {
    snapshot: false
  },
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ],
  globals: {
    'process.env.NODE_ENV': 'test'
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(js|jsx)',
    '<rootDir>/src/**/?(*.)(test|spec).(js|jsx)',
    '<rootDir>/src/tests/**/*.test.js',
    '<rootDir>/src/tests/**/*.spec.js'
  ],
  collectCoverageFrom: [
    'src/renderer/**/*.{js,jsx}',
    'src/shared/**/*.{js,jsx}',
    '!src/**/*.test.{js,jsx}',
    '!src/**/*.spec.{js,jsx}',
    '!src/renderer/index.js',
    '!src/tests/**/*'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/',
    '/src/tests/__mocks__/'
  ],
  // Add test timeout
  testTimeout: 10000,
  // Improve error reporting
  verbose: true,
  // Clear mocks between tests
  clearMocks: true,
  // Reset modules between tests
  resetModules: true,
  // Restore mocks between tests
  restoreMocks: true
};