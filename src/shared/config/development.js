/**
 * Development Environment Configuration
 * Centralizes development settings and utilities
 */

// Check if app is packaged (production build)
// Note: This will be evaluated in the main process context
const isPackaged = process.env.NODE_ENV === 'production' || 
                   (typeof process !== 'undefined' && process.versions && process.versions.electron && !process.defaultApp) ||
                   (typeof process !== 'undefined' && process.type === 'browser');

const isDev = !isPackaged && (process.env.ELECTRON_IS_DEV === 'true' || process.env.NODE_ENV === 'development');
const isProduction = isPackaged || process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Development configuration
const config = {
  // Environment flags
  isDev,
  isProduction,
  isTest,
  isPackaged,
  
  // Development server settings
  devServer: {
    port: 3000,
    host: 'localhost',
    url: 'http://localhost:3000'
  },
  
  // Logging configuration
  logging: {
    level: isDev ? 'debug' : 'info',
    enableConsole: isDev,
    enableFile: true,
    logDir: 'logs'
  },
  
  // Debug settings
  debug: {
    showDevTools: isDev,
    enableElectronDebug: isDev,
    enableReactDevTools: isDev,
    enableHotReload: isDev
  },
  
  // Performance monitoring
  performance: {
    enableProfiling: isDev,
    enableMemoryMonitoring: isDev,
    logSlowOperations: isDev
  },
  
  // Error handling
  errorHandling: {
    showErrorOverlay: isDev,
    enableCrashReporting: !isDev,
    enableDetailedErrors: isDev
  }
};

// Environment-specific overrides
if (isTest) {
  config.logging.enableConsole = false;
  config.debug.showDevTools = false;
}

module.exports = { config };