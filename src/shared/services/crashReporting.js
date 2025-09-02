const { captureException, captureMessage, addBreadcrumb, setUser, setTag, setContext } = require('@sentry/electron/main');
const { logger } = require('../utils/logger');
const os = require('os');
const { app } = require('electron');

class CrashReportingService {
  constructor() {
    this.isInitialized = false;
    this.userConsent = false;
  }

  /**
   * Initialize crash reporting with user consent
   * @param {boolean} hasUserConsent - Whether user has consented to crash reporting
   */
  initialize(hasUserConsent = false) {
    this.userConsent = hasUserConsent;
    this.isInitialized = true;

    if (hasUserConsent) {
      this.setupUserContext();
      this.setupSystemContext();
      logger.info('Crash reporting initialized with user consent');
    } else {
      logger.info('Crash reporting initialized without user consent - reports will not be sent');
    }
  }

  /**
   * Set up user context for crash reports
   */
  setupUserContext() {
    setUser({
      id: this.generateAnonymousId(),
      // Don't include personal information
    });
  }

  /**
   * Set up system context for crash reports
   */
  setupSystemContext() {
    setContext('system', {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      appVersion: app ? app.getVersion() : 'unknown',
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
    });

    setTag('platform', os.platform());
    setTag('arch', os.arch());
    setTag('app_version', app ? app.getVersion() : 'unknown');
  }

  /**
   * Generate anonymous user ID for tracking without personal information
   */
  generateAnonymousId() {
    // Generate a hash based on system info (not personal)
    const systemInfo = `${os.platform()}-${os.arch()}-${os.hostname()}`;
    return require('crypto').createHash('sha256').update(systemInfo).digest('hex').substring(0, 16);
  }

  /**
   * Report an error/exception
   * @param {Error} error - The error to report
   * @param {Object} context - Additional context
   */
  reportError(error, context = {}) {
    if (!this.isInitialized) {
      logger.warn('Crash reporting not initialized');
      return;
    }

    if (!this.userConsent) {
      logger.debug('Error occurred but not reported due to lack of user consent:', error.message);
      return;
    }

    try {
      // Add context if provided
      if (Object.keys(context).length > 0) {
        setContext('error_context', context);
      }

      // Add breadcrumb for the error
      addBreadcrumb({
        message: 'Error occurred',
        level: 'error',
        data: {
          errorMessage: error.message,
          errorStack: error.stack,
        },
      });

      captureException(error);
      logger.info('Error reported to crash reporting service');
    } catch (reportingError) {
      logger.error('Failed to report error to crash reporting service:', reportingError);
    }
  }

  /**
   * Report a message/event
   * @param {string} message - The message to report
   * @param {string} level - The severity level (info, warning, error)
   * @param {Object} context - Additional context
   */
  reportMessage(message, level = 'info', context = {}) {
    if (!this.isInitialized || !this.userConsent) {
      return;
    }

    try {
      if (Object.keys(context).length > 0) {
        setContext('message_context', context);
      }

      addBreadcrumb({
        message,
        level,
        data: context,
      });

      captureMessage(message, level);
    } catch (reportingError) {
      logger.error('Failed to report message to crash reporting service:', reportingError);
    }
  }

  /**
   * Add a breadcrumb for tracking user actions
   * @param {string} message - Description of the action
   * @param {Object} data - Additional data
   */
  addBreadcrumb(message, data = {}) {
    if (!this.isInitialized || !this.userConsent) {
      return;
    }

    try {
      addBreadcrumb({
        message,
        level: 'info',
        data,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to add breadcrumb:', error);
    }
  }

  /**
   * Update user consent for crash reporting
   * @param {boolean} hasConsent - Whether user has given consent
   */
  updateUserConsent(hasConsent) {
    this.userConsent = hasConsent;
    logger.info(`Crash reporting consent updated: ${hasConsent}`);

    if (hasConsent && this.isInitialized) {
      this.setupUserContext();
      this.setupSystemContext();
    }
  }

  /**
   * Get current crash reporting status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      userConsent: this.userConsent,
      active: this.isInitialized && this.userConsent,
    };
  }
}

// Export singleton instance
module.exports = new CrashReportingService();