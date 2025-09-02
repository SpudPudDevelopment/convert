/**
 * Development Utilities
 * Provides helpful debugging and development tools
 */

const { config } = require('../config/development.js');
const { logger } = require('./logger.js');

class DevUtils {
  constructor() {
    this.performanceMarks = new Map();
    this.setupGlobalErrorHandling();
  }

  // Global error handling setup
  setupGlobalErrorHandling() {
    if (!config.isDev) return;

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.reportError(error, { type: 'uncaughtException' });
      if (config.errorHandling.enableDetailedErrors) {
        console.error('Uncaught Exception:', error);
      }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.reportError(new Error(reason), { 
        type: 'unhandledRejection',
        promise: promise.toString()
      });
      if (config.errorHandling.enableDetailedErrors) {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      }
    });
  }

  // Performance measurement
  startPerformanceMark(name) {
    if (!config.performance.enableProfiling) return;
    
    this.performanceMarks.set(name, {
      startTime: Date.now(),
      startMemory: process.memoryUsage().heapUsed
    });
    
    logger.debug(`Performance mark started: ${name}`);
  }

  endPerformanceMark(name) {
    if (!config.performance.enableProfiling) return;
    
    const mark = this.performanceMarks.get(name);
    if (!mark) {
      logger.warn(`Performance mark not found: ${name}`);
      return;
    }
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    const duration = endTime - mark.startTime;
    const memoryDiff = endMemory - mark.startMemory;
    
    const result = {
      name,
      duration: `${duration}ms`,
      memoryDiff: `${Math.round(memoryDiff / 1024)} KB`
    };
    
    logger.debug(`Performance mark completed: ${name}`, result);
    
    // Log slow operations
    if (config.performance.logSlowOperations && duration > 1000) {
      logger.warn(`Slow operation detected: ${name}`, result);
    }
    
    this.performanceMarks.delete(name);
    return result;
  }

  // Debug information
  getDebugInfo() {
    return {
      environment: {
        isDev: config.isDev,
        isProduction: config.isProduction,
        isTest: config.isTest,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      config: config
    };
  }

  // Log debug information
  logDebugInfo() {
    if (!config.isDev) return;
    
    const debugInfo = this.getDebugInfo();
    logger.debug('Debug Information', debugInfo);
  }

  // Validate environment setup
  validateEnvironment() {
    const issues = [];
    
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 16) {
      issues.push(`Node.js version ${nodeVersion} is below recommended minimum (16.x)`);
    }
    
    // Check required environment variables
    const requiredEnvVars = ['NODE_ENV'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        issues.push(`Missing environment variable: ${envVar}`);
      }
    }
    
    // Check development dependencies in dev mode
    if (config.isDev) {
      try {
        require('electron-reload');
      } catch (err) {
        issues.push('electron-reload not available for hot reloading');
      }
      
      try {
        require('electron-debug');
      } catch (err) {
        issues.push('electron-debug not available for debugging');
      }
    }
    
    if (issues.length > 0) {
      logger.warn('Environment validation issues found:', issues);
    } else {
      logger.info('Environment validation passed');
    }
    
    return issues;
  }

  // Hot reload utilities
  setupHotReload() {
    if (!config.debug.enableHotReload || !config.isDev) return;
    
    logger.info('Hot reload enabled for development');
    
    // Watch for changes in shared modules
    const fs = require('fs');
    const path = require('path');
    
    const watchPaths = [
      path.join(process.cwd(), 'src/shared'),
      path.join(process.cwd(), 'public/electron.js')
    ];
    
    watchPaths.forEach(watchPath => {
      if (fs.existsSync(watchPath)) {
        fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
          if (filename && (filename.endsWith('.js') || filename.endsWith('.json'))) {
            logger.debug(`File changed: ${filename} (${eventType})`);
          }
        });
      }
    });
  }

  // Memory leak detection
  detectMemoryLeaks() {
    if (!config.performance.enableMemoryMonitoring) return;
    
    const initialMemory = process.memoryUsage().heapUsed;
    
    setInterval(() => {
      const currentMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = currentMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
      
      if (memoryIncreaseMB > 50) { // Alert if memory increased by more than 50MB
        logger.warn('Potential memory leak detected', {
          initialMemory: `${Math.round(initialMemory / 1024 / 1024)} MB`,
          currentMemory: `${Math.round(currentMemory / 1024 / 1024)} MB`,
          increase: `${Math.round(memoryIncreaseMB)} MB`
        });
      }
    }, 30000); // Check every 30 seconds
  }

  // Initialize development utilities
  initialize() {
    if (!config.isDev) return;
    
    logger.info('Initializing development utilities');
    
    this.validateEnvironment();
    this.setupHotReload();
    this.detectMemoryLeaks();
    this.logDebugInfo();
    
    // Log memory usage periodically
    setInterval(() => {
      logger.logMemoryUsage();
    }, 60000); // Every minute
  }
}

// Create singleton instance
const devUtils = new DevUtils();

module.exports = { devUtils };