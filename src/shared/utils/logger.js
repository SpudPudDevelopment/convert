/**
 * Logging Utility
 * Provides structured logging for development and production
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { config } = require('../config/development.js');

class Logger {
  constructor() {
    // Use app.getPath('userData') for packaged app, process.cwd() for development
    const baseDir = app && app.isPackaged ? app.getPath('userData') : process.cwd();
    this.logDir = path.join(baseDir, config.logging.logDir);
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(data && { data })
    };
    
    return JSON.stringify(logEntry);
  }

  writeToFile(level, message, data) {
    if (!config.logging.enableFile) return;
    
    const logFile = path.join(this.logDir, `${level}.log`);
    const formattedMessage = this.formatMessage(level, message, data);
    
    fs.appendFileSync(logFile, formattedMessage + '\n');
  }

  writeToConsole(level, message, data) {
    if (!config.logging.enableConsole) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'error':
        console.error(prefix, message, data || '');
        break;
      case 'warn':
        console.warn(prefix, message, data || '');
        break;
      case 'info':
        console.info(prefix, message, data || '');
        break;
      case 'debug':
        console.log(prefix, message, data || '');
        break;
      default:
        console.log(prefix, message, data || '');
    }
  }

  log(level, message, data = null) {
    // Check if we should log this level
    const levels = ['error', 'warn', 'info', 'debug'];
    const configLevel = config.logging.level;
    const configLevelIndex = levels.indexOf(configLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    if (messageLevelIndex > configLevelIndex) {
      return; // Skip this log level
    }
    
    this.writeToConsole(level, message, data);
    this.writeToFile(level, message, data);
  }

  error(message, data = null) {
    this.log('error', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  debug(message, data = null) {
    this.log('debug', message, data);
  }

  // Performance logging
  time(label) {
    if (config.performance.enableProfiling) {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (config.performance.enableProfiling) {
      console.timeEnd(label);
    }
  }

  // Memory monitoring
  logMemoryUsage() {
    if (config.performance.enableMemoryMonitoring) {
      const usage = process.memoryUsage();
      this.debug('Memory Usage', {
        rss: `${Math.round(usage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(usage.external / 1024 / 1024)} MB`
      });
    }
  }

  // Error reporting
  reportError(error, context = {}) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    };
    
    this.error('Application Error', errorData);
    
    // In production, you might want to send this to an error reporting service
    if (config.errorHandling.enableCrashReporting) {
      // TODO: Implement crash reporting service integration
      console.log('Error would be reported to crash reporting service:', errorData);
    }
  }
}

// Create singleton instance
const logger = new Logger();

/**
 * Create a new logger instance with a specific name
 * @param {string} name - Logger name
 * @param {Object} options - Logger options
 * @returns {Logger} Logger instance
 */
function createLogger(name, options = {}) {
  const namedLogger = new Logger();
  namedLogger.name = name;
  
  // Override formatMessage to include logger name
  const originalFormatMessage = namedLogger.formatMessage;
  namedLogger.formatMessage = function(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      logger: this.name,
      message,
      ...(data && { data })
    };
    
    return JSON.stringify(logEntry);
  };
  
  return namedLogger;
}

module.exports = { logger, createLogger };