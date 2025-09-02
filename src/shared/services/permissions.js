const { app, dialog, shell } = require('electron');
const { logger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class PermissionsService {
  constructor() {
    this.permissionStatus = {
      fileSystem: 'unknown',
      downloads: 'unknown',
      camera: 'unknown',
      microphone: 'unknown',
    };
  }

  /**
   * Initialize permissions service and check current permissions
   */
  async initialize() {
    try {
      await this.checkAllPermissions();
      logger.info('Permissions service initialized');
    } catch (error) {
      logger.error('Failed to initialize permissions service:', error);
    }
  }

  /**
   * Check all required permissions
   */
  async checkAllPermissions() {
    await Promise.all([
      this.checkFileSystemPermissions(),
      this.checkDownloadsPermissions(),
      this.checkCameraPermissions(),
      this.checkMicrophonePermissions(),
    ]);
  }

  /**
   * Check file system permissions by attempting to access common directories
   */
  async checkFileSystemPermissions() {
    try {
      // Test read access to user's home directory
      const homeDir = os.homedir();
      await fs.access(homeDir, fs.constants.R_OK);
      
      // Test write access to a temporary location
      const tempDir = os.tmpdir();
      const testFile = path.join(tempDir, `convert-permission-test-${Date.now()}.tmp`);
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      
      this.permissionStatus.fileSystem = 'granted';
      logger.debug('File system permissions: granted');
    } catch (error) {
      this.permissionStatus.fileSystem = 'denied';
      logger.warn('File system permissions: denied', error.message);
    }
  }

  /**
   * Check downloads folder permissions
   */
  async checkDownloadsPermissions() {
    try {
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      await fs.access(downloadsDir, fs.constants.R_OK | fs.constants.W_OK);
      this.permissionStatus.downloads = 'granted';
      logger.debug('Downloads permissions: granted');
    } catch (error) {
      this.permissionStatus.downloads = 'denied';
      logger.warn('Downloads permissions: denied', error.message);
    }
  }

  /**
   * Check camera permissions (macOS specific)
   */
  async checkCameraPermissions() {
    if (process.platform !== 'darwin') {
      this.permissionStatus.camera = 'not_applicable';
      return;
    }

    try {
      // On macOS, we can check system preferences
      const { systemPreferences } = require('electron');
      if (systemPreferences && systemPreferences.getMediaAccessStatus) {
        const status = systemPreferences.getMediaAccessStatus('camera');
        this.permissionStatus.camera = status;
        logger.debug(`Camera permissions: ${status}`);
      } else {
        this.permissionStatus.camera = 'unknown';
      }
    } catch (error) {
      this.permissionStatus.camera = 'unknown';
      logger.warn('Could not check camera permissions:', error.message);
    }
  }

  /**
   * Check microphone permissions (macOS specific)
   */
  async checkMicrophonePermissions() {
    if (process.platform !== 'darwin') {
      this.permissionStatus.microphone = 'not_applicable';
      return;
    }

    try {
      const { systemPreferences } = require('electron');
      if (systemPreferences && systemPreferences.getMediaAccessStatus) {
        const status = systemPreferences.getMediaAccessStatus('microphone');
        this.permissionStatus.microphone = status;
        logger.debug(`Microphone permissions: ${status}`);
      } else {
        this.permissionStatus.microphone = 'unknown';
      }
    } catch (error) {
      this.permissionStatus.microphone = 'unknown';
      logger.warn('Could not check microphone permissions:', error.message);
    }
  }

  /**
   * Request file system permissions by showing a dialog
   */
  async requestFileSystemPermissions(mainWindow) {
    try {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'File Access Permission',
        message: 'Convert needs access to your files to perform conversions.',
        detail: 'Please select the files or folders you want to convert when prompted.',
        buttons: ['OK', 'Cancel'],
        defaultId: 0,
      });

      if (result.response === 0) {
        // User clicked OK, now show file dialog to establish permission
        const fileResult = await dialog.showOpenDialog(mainWindow, {
          title: 'Grant File Access',
          message: 'Select any file to grant Convert access to your files',
          properties: ['openFile'],
          buttonLabel: 'Grant Access',
        });

        if (!fileResult.canceled && fileResult.filePaths.length > 0) {
          this.permissionStatus.fileSystem = 'granted';
          logger.info('File system permissions granted by user');
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Failed to request file system permissions:', error);
      return false;
    }
  }

  /**
   * Request camera permissions
   */
  async requestCameraPermissions(mainWindow) {
    if (process.platform !== 'darwin') {
      return true; // Not applicable on non-macOS
    }

    try {
      const { systemPreferences } = require('electron');
      if (systemPreferences && systemPreferences.askForMediaAccess) {
        const granted = await systemPreferences.askForMediaAccess('camera');
        this.permissionStatus.camera = granted ? 'granted' : 'denied';
        logger.info(`Camera permissions ${granted ? 'granted' : 'denied'} by user`);
        return granted;
      }
      return false;
    } catch (error) {
      logger.error('Failed to request camera permissions:', error);
      return false;
    }
  }

  /**
   * Request microphone permissions
   */
  async requestMicrophonePermissions(mainWindow) {
    if (process.platform !== 'darwin') {
      return true; // Not applicable on non-macOS
    }

    try {
      const { systemPreferences } = require('electron');
      if (systemPreferences && systemPreferences.askForMediaAccess) {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        this.permissionStatus.microphone = granted ? 'granted' : 'denied';
        logger.info(`Microphone permissions ${granted ? 'granted' : 'denied'} by user`);
        return granted;
      }
      return false;
    } catch (error) {
      logger.error('Failed to request microphone permissions:', error);
      return false;
    }
  }

  /**
   * Show system preferences for manual permission configuration
   */
  async openSystemPreferences(section = 'security') {
    try {
      if (process.platform === 'darwin') {
        await shell.openExternal(`x-apple.systempreferences:com.apple.preference.${section}`);
        logger.info(`Opened system preferences: ${section}`);
      } else {
        logger.warn('System preferences only available on macOS');
      }
    } catch (error) {
      logger.error('Failed to open system preferences:', error);
    }
  }

  /**
   * Show troubleshooting dialog for permission issues
   */
  async showTroubleshootingDialog(mainWindow, permissionType) {
    const troubleshootingSteps = {
      fileSystem: [
        '1. Make sure Convert has Full Disk Access in System Preferences',
        '2. Go to System Preferences > Security & Privacy > Privacy',
        '3. Select "Full Disk Access" from the left sidebar',
        '4. Click the lock icon and enter your password',
        '5. Check the box next to Convert',
        '6. Restart Convert'
      ],
      camera: [
        '1. Go to System Preferences > Security & Privacy > Privacy',
        '2. Select "Camera" from the left sidebar',
        '3. Check the box next to Convert',
        '4. Restart Convert if needed'
      ],
      microphone: [
        '1. Go to System Preferences > Security & Privacy > Privacy',
        '2. Select "Microphone" from the left sidebar',
        '3. Check the box next to Convert',
        '4. Restart Convert if needed'
      ]
    };

    const steps = troubleshootingSteps[permissionType] || ['Please check your system permissions.'];

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Permission Required',
      message: `Convert needs ${permissionType} permissions to function properly.`,
      detail: steps.join('\n'),
      buttons: ['Open System Preferences', 'Try Again', 'Cancel'],
      defaultId: 0,
    });

    if (result.response === 0) {
      await this.openSystemPreferences();
    } else if (result.response === 1) {
      await this.checkAllPermissions();
    }

    return result.response;
  }

  /**
   * Get current permission status
   */
  getPermissionStatus() {
    return { ...this.permissionStatus };
  }

  /**
   * Check if all required permissions are granted
   */
  hasAllRequiredPermissions() {
    return (
      this.permissionStatus.fileSystem === 'granted' &&
      this.permissionStatus.downloads === 'granted'
    );
  }

  /**
   * Validate file access before operations
   */
  async validateFileAccess(filePath) {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      return true;
    } catch (error) {
      logger.warn(`Cannot access file: ${filePath}`, error.message);
      return false;
    }
  }

  /**
   * Validate directory write access
   */
  async validateDirectoryWriteAccess(dirPath) {
    try {
      await fs.access(dirPath, fs.constants.W_OK);
      return true;
    } catch (error) {
      logger.warn(`Cannot write to directory: ${dirPath}`, error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new PermissionsService();