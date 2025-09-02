const { app, BrowserWindow, ipcMain, Menu, nativeTheme, screen } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');

// Override environment detection for production builds BEFORE loading other modules
if (app.isPackaged || process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'production';
  process.env.ELECTRON_IS_DEV = 'false';
}

// Get the app's resource path for correct imports in packaged app
const isDevMode = process.env.NODE_ENV === 'development' || !app.isPackaged;
const resourcePath = isDevMode ? path.join(__dirname, '..') : path.join(__dirname, '..');

// Local configuration for main process (avoid loading shared config before env is set)
const localConfig = {
  isDev: isDevMode,
  isProduction: !isDevMode,
  debug: {
    showDevTools: isDevMode
  }
};

const { registerMainHandlers } = require(path.join(resourcePath, 'src/shared/ipc/mainHandlers.js'));
const { config } = require(path.join(resourcePath, 'src/shared/config/development.js'));
const { logger } = require(path.join(resourcePath, 'src/shared/utils/logger.js'));
const { devUtils } = require(path.join(resourcePath, 'src/shared/utils/devUtils.js'));
const { init: initSentry } = require('@sentry/electron/main');
const crashReporting = require(path.join(resourcePath, 'src/shared/services/crashReporting.js'));
const permissions = require(path.join(resourcePath, 'src/shared/services/permissions.js'));
const audioConversionService = require(path.join(resourcePath, 'src/main/services/audioConversionService.js'));

// Initialize Sentry for crash reporting
initSentry({
  dsn: process.env.SENTRY_DSN || 'https://your-sentry-dsn@sentry.io/project-id',
  environment: process.env.NODE_ENV || 'development',
  debug: localConfig.isDev,
  beforeSend(event) {
    // Filter out sensitive information
    if (event.user) {
      delete event.user.ip_address;
    }
    return event;
  },
  integrations: [
    // Add additional integrations if needed
  ],
  tracesSampleRate: localConfig.isDev ? 1.0 : 0.1,
});

// Version comparison utilities
function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  const maxLength = Math.max(v1parts.length, v2parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }
  
  return 0;
}

function isValidVersion(version) {
  const versionRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;
  return versionRegex.test(version);
}

function shouldAllowUpdate(currentVersion, newVersion, allowDowngrade = false) {
  if (!isValidVersion(currentVersion) || !isValidVersion(newVersion)) {
    return false;
  }
  
  const comparison = compareVersions(newVersion, currentVersion);
  
  if (comparison > 0) {
    // New version is higher - always allow
    return true;
  } else if (comparison < 0) {
    // New version is lower - only allow if downgrade is enabled
    return allowDowngrade;
  } else {
    // Same version - don't allow
    return false;
  }
}

// Development environment detection
const isDev = localConfig.isDev;

// Enable live reload for Electron in development
if (isDev) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
    logger.info('Electron hot reload enabled');
  } catch (err) {
    logger.warn('electron-reload not available in development', err.message);
  }
  
  // Enable debugging
  try {
    require('electron-debug')({ showDevTools: localConfig.debug.showDevTools });
    logger.info('Electron debug tools enabled');
  } catch (err) {
    logger.warn('electron-debug not available', err.message);
  }
  
  // Initialize development utilities
  devUtils.initialize();
}

let mainWindow;
let windowState = {
  width: 1200,
  height: 800,
  x: undefined,
  y: undefined,
  isMaximized: false
};

function createWindow() {
  // Get display bounds for proper window positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // Calculate center position if no saved position
  if (windowState.x === undefined || windowState.y === undefined) {
    windowState.x = Math.round((screenWidth - windowState.width) / 2);
    windowState.y = Math.round((screenHeight - windowState.height) / 2);
  }
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev,
      webSecurity: false
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff'
  });

  // Load the app
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  logger.info(`Loading URL: ${startUrl}`);
  console.log(`Loading URL: ${startUrl}`);
  console.log(`__dirname: ${__dirname}`);
  console.log(`HTML path: ${path.join(__dirname, '../build/index.html')}`);
  
  // Check if the HTML file exists in production
  if (!isDev) {
    const htmlPath = path.join(__dirname, '../build/index.html');
    try {
      if (fs.existsSync(htmlPath)) {
        console.log(`HTML file exists at: ${htmlPath}`);
        const stats = fs.statSync(htmlPath);
        console.log(`HTML file size: ${stats.size} bytes`);
        
        // Read and log the HTML content for debugging
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        console.log(`HTML content preview: ${htmlContent.substring(0, 200)}...`);
        
        // Check if bundle.js exists
        const bundlePath = path.join(__dirname, '../build/bundle.js');
        if (fs.existsSync(bundlePath)) {
          const bundleStats = fs.statSync(bundlePath);
          console.log(`Bundle.js exists at: ${bundlePath}, size: ${bundleStats.size} bytes`);
        } else {
          console.error(`Bundle.js does not exist at: ${bundlePath}`);
        }
      } else {
        console.error(`HTML file does not exist at: ${htmlPath}`);
        // Try alternative paths
        const altPaths = [
          path.join(__dirname, 'index.html'),
          path.join(__dirname, '../index.html'),
          path.join(__dirname, '../../build/index.html')
        ];
        altPaths.forEach(altPath => {
          if (fs.existsSync(altPath)) {
            console.log(`Found HTML file at alternative path: ${altPath}`);
          }
        });
      }
    } catch (err) {
      console.error('Error checking HTML file:', err);
    }
  }
  
  mainWindow.loadURL(startUrl).catch(err => {
    logger.error('Failed to load URL:', err);
    console.error('Failed to load URL:', err);
  });

  // Restore window state
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }
  
  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    logger.info('Window ready to show, displaying window');
    console.log('Window ready to show, displaying window');
    mainWindow.show();
    
    // Open dev tools in development to see renderer console
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
    
    // Ensure window is visible and focused
    mainWindow.focus();
    mainWindow.moveTop();
    
    // Log window state for debugging
    logger.info(`Window visible: ${mainWindow.isVisible()}, minimized: ${mainWindow.isMinimized()}`);
    logger.info(`Window bounds: ${JSON.stringify(mainWindow.getBounds())}`);
  });
  
  // Add error handling for load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    logger.error(`Failed to load ${validatedURL}: ${errorCode} - ${errorDescription}`);
    console.error(`Failed to load ${validatedURL}: ${errorCode} - ${errorDescription}`);
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('Page finished loading');
    console.log('Page finished loading');
    
    // Execute simple JavaScript in renderer to check basic functionality
    setTimeout(() => {
      mainWindow.webContents.executeJavaScript(`
        console.log('Renderer process started');
        console.log('Document title:', document.title);
        console.log('Root element:', document.getElementById('root'));
        console.log('Body content length:', document.body ? document.body.innerHTML.length : 0);
        
        // Check for any console errors
        const originalError = console.error;
        console.error = function(...args) {
          console.log('CONSOLE ERROR:', ...args);
          originalError.apply(console, args);
        };
        
        document.title;
      `).then(result => {
        console.log('Renderer accessible, page title:', result);
        
        // Try to get more info if basic access works
        return mainWindow.webContents.executeJavaScript(`
          JSON.stringify({
            url: window.location.href,
            hasRoot: !!document.getElementById('root'),
            bodyLength: document.body ? document.body.innerHTML.length : 0,
            scripts: Array.from(document.scripts).map(s => s.src),
            errors: window.errors || []
          });
        `);
      }).then(result => {
        console.log('Renderer details:', result);
      }).catch(err => {
        console.log('Renderer access failed:', err.message);
      });
    }, 2000);
  });
  
  // Add error handling for renderer process crashes
  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('Renderer process crashed:', { killed });
  });
  
  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer process became unresponsive');
  });
  
  // Add console message handling
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer console [${level}]: ${message} at ${sourceId}:${line}`);
  });

  // Open DevTools in development
  if (localConfig.debug.showDevTools) {
    mainWindow.webContents.openDevTools();
    logger.debug('DevTools opened for main window');
  }

  // Save window state before closing
  mainWindow.on('close', () => {
    if (!mainWindow.isDestroyed()) {
      windowState.isMaximized = mainWindow.isMaximized();
      if (!windowState.isMaximized) {
        const bounds = mainWindow.getBounds();
        windowState.width = bounds.width;
        windowState.height = bounds.height;
        windowState.x = bounds.x;
        windowState.y = bounds.y;
      }
    }
  });
  
  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Handle window state changes
  mainWindow.on('maximize', () => {
    windowState.isMaximized = true;
  });
  
  mainWindow.on('unmaximize', () => {
    windowState.isMaximized = false;
  });
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Conversion',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-new-conversion');
            }
          }
        },
        {
          label: 'Open Files',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-open-files');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-preferences');
            }
          }
        },
        { type: 'separator' },
        {
          role: 'quit'
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Convert',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-about');
            }
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-check-updates');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: () => {
            require('electron').shell.openExternal('https://github.com/your-repo/convert');
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });

    // Window menu
    template[4].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Handle system theme changes
function setupThemeHandling() {
  // Listen for theme changes
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme-changed', {
        shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
        themeSource: nativeTheme.themeSource
      });
    }
  });
}

// Auto-updater configuration
function setupAutoUpdater() {
  // Load configuration from app-update.yml if it exists
  // app-update.yml is outside the asar file in the Resources directory
  const configPath = isDevMode 
    ? path.join(__dirname, '../app-update.yml')
    : path.join(process.resourcesPath, 'app-update.yml');
  if (fs.existsSync(configPath)) {
    try {
      const yaml = require('js-yaml');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configContent);
      
      // Apply configuration to autoUpdater
      if (config.channel) {
        autoUpdater.channel = config.channel;
      }
      if (config.allowDowngrade !== undefined) {
        autoUpdater.allowDowngrade = config.allowDowngrade;
      }
      if (config.allowPrerelease !== undefined) {
        autoUpdater.allowPrerelease = config.allowPrerelease;
      }
      if (config.autoInstallOnAppQuit !== undefined) {
        autoUpdater.autoInstallOnAppQuit = config.autoInstallOnAppQuit;
      }
      
      console.log('Auto-updater configuration loaded from app-update.yml');
    } catch (error) {
      console.warn('Failed to load app-update.yml configuration:', error.message);
    }
  }
  
  // Skip update checks in development
  if (isDev) {
    console.log('Skipping auto-updater in development mode');
    return;
  }
  
  // Configure auto-updater for production
  autoUpdater.autoDownload = false; // Don't auto-download, ask user first
  autoUpdater.autoInstallOnAppQuit = true;
  
  // Set up event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
    if (mainWindow) {
      mainWindow.webContents.send('update-checking');
    }
  });
  
  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        releaseName: info.releaseName,
        downloadedFile: info.downloadedFile
      });
    }
  });
  
  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available', info);
    }
  });
  
  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', {
        message: err.message,
        stack: err.stack
      });
    }
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    console.log(logMessage);
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', {
        percent: Math.round(progressObj.percent),
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    }
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        downloadedFile: info.downloadedFile
      });
    }
  });
  
  // Check for updates on startup (after a delay)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.error('Failed to check for updates:', err);
    });
  }, 3000); // Wait 3 seconds after startup
  
  // Set up periodic update checks (every 4 hours)
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.error('Failed to check for updates:', err);
    });
  }, 4 * 60 * 60 * 1000); // 4 hours
}

// IPC handlers for auto-updater
function setupUpdateIpcHandlers() {
  ipcMain.handle('check-for-updates', async () => {
    if (isDev) {
      console.log('Skipping update check in development mode');
      return { updateAvailable: false, reason: 'development' };
    }
    
    try {
      const result = await autoUpdater.checkForUpdates();
      const updateInfo = result?.updateInfo;
      
      if (updateInfo && !shouldAllowUpdate(app.getVersion(), updateInfo.version)) {
        console.log(`Update blocked: ${updateInfo.version} is not newer than ${app.getVersion()}`);
        return { updateAvailable: false, reason: 'version_not_newer' };
      }
      
      return { updateAvailable: !!result, updateInfo };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { updateAvailable: false, error: error.message };
    }
  });
  
  ipcMain.handle('download-update', async () => {
    if (isDev) {
      return { success: false, message: 'Updates disabled in development' };
    }
    
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      console.error('Error downloading update:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('install-update', async () => {
    if (isDev) {
      console.log('Skipping update installation in development mode');
      return { success: false, reason: 'development' };
    }
    
    try {
      autoUpdater.quitAndInstall();
      return { success: true };
    } catch (error) {
      console.error('Error installing update:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Rollback functionality
  ipcMain.handle('rollback-update', async () => {
    if (isDev) {
      console.log('Rollback not available in development mode');
      return { success: false, reason: 'development' };
    }
    
    try {
      // In a real implementation, you would restore from a backup
      // For now, we'll just provide the interface
      console.log('Rollback requested - this would restore previous version');
      return { success: false, reason: 'not_implemented' };
    } catch (error) {
      console.error('Error during rollback:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('get-update-history', () => {
    // In a real implementation, this would return update history
    return {
      currentVersion: app.getVersion(),
      previousVersions: [],
      canRollback: false
    };
  });
  
  // get-app-version handler is now handled in mainHandlers.js
}

// IPC handlers for crash reporting
function setupCrashReportingIpcHandlers() {
  ipcMain.handle('crash-reporting-get-status', () => {
    return crashReporting.getStatus();
  });
  
  ipcMain.handle('crash-reporting-update-consent', (event, hasConsent) => {
    crashReporting.updateUserConsent(hasConsent);
    return { success: true };
  });
  
  ipcMain.handle('crash-reporting-report-error', (event, errorData, context) => {
    try {
      const error = new Error(errorData.message);
      error.stack = errorData.stack;
      crashReporting.reportError(error, context);
      return { success: true };
    } catch (err) {
      logger.error('Failed to report error via IPC:', err);
      return { success: false, error: err.message };
    }
  });
  
  ipcMain.handle('crash-reporting-add-breadcrumb', (event, message, data) => {
    crashReporting.addBreadcrumb(message, data);
    return { success: true };
  });
}

// IPC handlers for audio conversion
function setupAudioConversionIpcHandlers() {
  ipcMain.handle('audio-conversion-initialize', async () => {
    try {
      await audioConversionService.initialize();
      return { success: true };
    } catch (error) {
      logger.error('Failed to initialize audio conversion service:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('audio-conversion-get-supported-formats', () => {
    try {
      const formats = audioConversionService.getSupportedFormats();
      return { success: true, formats };
    } catch (error) {
      logger.error('Failed to get supported formats:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('audio-conversion-get-default-settings', (event, format) => {
    try {
      const settings = audioConversionService.getDefaultSettings(format);
      return { success: true, settings };
    } catch (error) {
      logger.error('Failed to get default settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('audio-conversion-get-info', async (event, filePath) => {
    try {
      const info = await audioConversionService.getAudioInfo(filePath);
      return { success: true, info };
    } catch (error) {
      logger.error('Failed to get audio info:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('audio-conversion-convert', async (event, inputPath, outputPath, options = {}) => {
    try {
      // Set up progress callback
      const progressCallback = (progressData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('audio-conversion-progress', {
            inputPath,
            outputPath,
            progress: progressData
          });
        }
      };

      const result = await audioConversionService.convertAudio(inputPath, outputPath, {
        ...options,
        onProgress: progressCallback
      });
      
      return { success: true, result };
    } catch (error) {
      logger.error('Audio conversion failed:', error);
      crashReporting.reportError(error, { 
        context: 'audio_conversion',
        inputPath,
        outputPath,
        options 
      });
      return { success: false, error: error.message };
    }
  });
}

// IPC handlers for permissions
function setupPermissionsIpcHandlers() {
  ipcMain.handle('permissions-get-status', () => {
    return permissions.getPermissionStatus();
  });
  
  ipcMain.handle('permissions-check-all', async () => {
    try {
      await permissions.checkAllPermissions();
      return { success: true, status: permissions.getPermissionStatus() };
    } catch (error) {
      logger.error('Failed to check permissions:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('permissions-request-file-system', async () => {
    try {
      const granted = await permissions.requestFileSystemPermissions(mainWindow);
      return { success: true, granted };
    } catch (error) {
      logger.error('Failed to request file system permissions:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('permissions-request-camera', async () => {
    try {
      const granted = await permissions.requestCameraPermissions(mainWindow);
      return { success: true, granted };
    } catch (error) {
      logger.error('Failed to request camera permissions:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('permissions-request-microphone', async () => {
    try {
      const granted = await permissions.requestMicrophonePermissions(mainWindow);
      return { success: true, granted };
    } catch (error) {
      logger.error('Failed to request microphone permissions:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('permissions-show-troubleshooting', async (event, permissionType) => {
    try {
      const result = await permissions.showTroubleshootingDialog(mainWindow, permissionType);
      return { success: true, result };
    } catch (error) {
      logger.error('Failed to show troubleshooting dialog:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('permissions-validate-file-access', async (event, filePath) => {
    try {
      const hasAccess = await permissions.validateFileAccess(filePath);
      return { success: true, hasAccess };
    } catch (error) {
      logger.error('Failed to validate file access:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('permissions-validate-directory-write', async (event, dirPath) => {
    try {
      const hasAccess = await permissions.validateDirectoryWriteAccess(dirPath);
      return { success: true, hasAccess };
    } catch (error) {
      logger.error('Failed to validate directory write access:', error);
      return { success: false, error: error.message };
    }
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  createWindow();
  createMenu();
  setupThemeHandling();
  setupAutoUpdater();
  setupUpdateIpcHandlers();
  setupCrashReportingIpcHandlers();
  setupPermissionsIpcHandlers();
  setupAudioConversionIpcHandlers();
  
  // Initialize services
  try {
    // Initialize crash reporting (user consent will be handled via IPC)
    crashReporting.initialize(false); // Start without consent, will be updated via settings
    
    // Initialize permissions service
    await permissions.initialize();
    
    // Initialize audio conversion service
    await audioConversionService.initialize();
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    crashReporting.reportError(error, { context: 'service_initialization' });
  }
  
  // Register IPC handlers
  registerMainHandlers(mainWindow);
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, keep the app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// Legacy IPC handlers are now managed by shared/ipc/mainHandlers.js
// This ensures consistent IPC communication across the application