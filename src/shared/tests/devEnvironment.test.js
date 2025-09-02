/**
 * Development Environment Tests
 * Basic tests to verify the development setup is working
 */

const config = require('../config/development');
const logger = require('../utils/logger');
const devUtils = require('../utils/devUtils');

// Simple test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0
    };
  }

  test(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async run() {
    console.log('\n🧪 Running Development Environment Tests\n');
    
    for (const test of this.tests) {
      try {
        await test.testFn();
        console.log(`✅ ${test.name}`);
        this.results.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}: ${error.message}`);
        this.results.failed++;
      }
      this.results.total++;
    }
    
    this.printResults();
  }

  printResults() {
    console.log('\n📊 Test Results:');
    console.log(`   Total: ${this.results.total}`);
    console.log(`   Passed: ${this.results.passed}`);
    console.log(`   Failed: ${this.results.failed}`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n⚠️  Some tests failed. Check the output above.');
    }
  }
}

// Test assertions
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertExists(value, message) {
  if (value === undefined || value === null) {
    throw new Error(message || 'Value should exist');
  }
}

// Create test runner instance
const runner = new TestRunner();

// Configuration tests
runner.test('Config module loads correctly', () => {
  assertExists(config, 'Config should be defined');
  assertExists(config.isDev, 'isDev flag should be defined');
  assertExists(config.devServer, 'devServer config should be defined');
});

runner.test('Environment detection works', () => {
  assert(typeof config.isDev === 'boolean', 'isDev should be boolean');
  assert(typeof config.isProduction === 'boolean', 'isProduction should be boolean');
  assert(typeof config.isTest === 'boolean', 'isTest should be boolean');
});

runner.test('Dev server configuration is valid', () => {
  assertEqual(config.devServer.port, 3000, 'Dev server port should be 3000');
  assertEqual(config.devServer.host, 'localhost', 'Dev server host should be localhost');
  assertExists(config.devServer.url, 'Dev server URL should be defined');
});

// Logger tests
runner.test('Logger module loads correctly', () => {
  assertExists(logger, 'Logger should be defined');
  assert(typeof logger.info === 'function', 'Logger should have info method');
  assert(typeof logger.error === 'function', 'Logger should have error method');
  assert(typeof logger.debug === 'function', 'Logger should have debug method');
});

runner.test('Logger methods work', () => {
  // These should not throw errors
  logger.info('Test info message');
  logger.debug('Test debug message');
  logger.warn('Test warning message');
});

// DevUtils tests
runner.test('DevUtils module loads correctly', () => {
  assertExists(devUtils, 'DevUtils should be defined');
  assert(typeof devUtils.getDebugInfo === 'function', 'DevUtils should have getDebugInfo method');
  assert(typeof devUtils.validateEnvironment === 'function', 'DevUtils should have validateEnvironment method');
});

runner.test('Debug info is available', () => {
  const debugInfo = devUtils.getDebugInfo();
  assertExists(debugInfo, 'Debug info should be available');
  assertExists(debugInfo.environment, 'Environment info should be available');
  assertExists(debugInfo.memory, 'Memory info should be available');
});

runner.test('Environment validation runs', () => {
  const issues = devUtils.validateEnvironment();
  assert(Array.isArray(issues), 'Validation should return an array');
});

// Performance tests
runner.test('Performance marking works', () => {
  devUtils.startPerformanceMark('test-operation');
  // Simulate some work
  for (let i = 0; i < 1000; i++) {
    Math.random();
  }
  const result = devUtils.endPerformanceMark('test-operation');
  
  if (config.performance.enableProfiling) {
    assertExists(result, 'Performance result should be available when profiling is enabled');
  }
});

// File system tests
runner.test('Required directories exist', () => {
  const fs = require('fs');
  const path = require('path');
  
  const requiredDirs = [
    'src',
    'src/shared',
    'src/shared/config',
    'src/shared/utils',
    'public'
  ];
  
  for (const dir of requiredDirs) {
    const dirPath = path.join(process.cwd(), dir);
    assert(fs.existsSync(dirPath), `Directory ${dir} should exist`);
  }
});

// Module dependency tests
runner.test('Required dependencies are available', () => {
  const requiredModules = ['electron', 'react', 'react-dom'];
  
  for (const moduleName of requiredModules) {
    try {
      require(moduleName);
    } catch (error) {
      throw new Error(`Required module ${moduleName} is not available`);
    }
  }
});

// Development dependencies test (only in dev mode)
if (config.isDev) {
  runner.test('Development dependencies are available', () => {
    const devModules = ['webpack', 'webpack-dev-server', 'babel-loader'];
    
    for (const moduleName of devModules) {
      try {
        require(moduleName);
      } catch (error) {
        throw new Error(`Development module ${moduleName} is not available`);
      }
    }
  });
}

// Export the test runner for external use
module.exports = {
  runner,
  assert,
  assertEqual,
  assertExists
};

// Run tests if this file is executed directly
if (require.main === module) {
  runner.run().catch(console.error);
}