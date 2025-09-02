# IPC Architecture Documentation

## Overview

This document describes the Inter-Process Communication (IPC) architecture implemented in the Convert application. The IPC system enables secure communication between the main Electron process and the renderer process.

## Architecture Components

### 1. Shared Types (`src/shared/types/ipc.js`)

Defines the communication protocol including:
- **IPC_CHANNELS**: Channel names for different operations
- **MESSAGE_TYPES**: Types of messages exchanged
- **FILE_DIALOG_TYPES**: File dialog configurations
- **SUPPORTED_FILE_TYPES**: File types supported for conversion
- **CONVERSION_STATUS**: Status values for conversion operations
- **THEME_TYPES**: Theme-related constants
- **LOG_LEVELS**: Logging levels
- **ERROR_TYPES**: Error classification

### 2. Main Process Handlers (`src/shared/ipc/mainHandlers.js`)

Implements IPC handlers for the main process:
- **System Information**: App version, name, platform, architecture
- **File Operations**: Open/save dialogs, file reading/writing
- **Window Controls**: Minimize, maximize, close operations
- **Theme Management**: System theme detection and changes
- **Settings**: Application settings management
- **Error Logging**: Centralized error logging

### 3. Renderer Service (`src/shared/ipc/rendererService.js`)

Provides a clean API for renderer process communication:
- **System Methods**: `getAppVersion()`, `getSystemInfo()`
- **File Methods**: `showOpenDialog()`, `showSaveDialog()`, `readFile()`, `writeFile()`
- **Conversion Methods**: `convertFile()`, `getConversionProgress()`
- **Window Methods**: `minimizeWindow()`, `maximizeWindow()`, `closeWindow()`
- **Settings Methods**: `getSettings()`, `updateSettings()`
- **Event Listeners**: Theme changes, conversion progress, errors

### 4. IPC Utilities (`src/shared/utils/ipcUtils.js`)

Common utilities for IPC operations:
- **Retry Logic**: `withRetry()` for failed operations
- **Timeout Handling**: `withTimeout()` for operation timeouts
- **Batch Operations**: `batchIPCOperations()` for concurrent calls
- **Validation**: Message and response validation
- **Error Handling**: Safe IPC calls with graceful error handling
- **Performance**: Debouncing, throttling, and performance measurement

### 5. Preload Script (`public/preload.js`)

Securely exposes IPC API to renderer process:
- Uses `contextBridge` for secure communication
- Exposes `window.electronAPI` with all IPC methods
- Implements event listeners for main process events

## Security Considerations

1. **Context Isolation**: Enabled to prevent renderer access to Node.js APIs
2. **Preload Script**: All IPC communication goes through the preload script
3. **Input Validation**: All IPC messages are validated before processing
4. **Error Handling**: Errors are sanitized before sending to renderer

## Usage Examples

### Getting App Version
```javascript
const response = await window.electronAPI.getAppVersion();
if (response.success) {
  console.log('App version:', response.data);
} else {
  console.error('Error:', response.error);
}
```

### File Selection
```javascript
const response = await window.electronAPI.showOpenDialog({
  properties: ['openFile', 'multiSelections'],
  filters: [{ name: 'Images', extensions: ['jpg', 'png'] }]
});

if (response.success && !response.data.canceled) {
  console.log('Selected files:', response.data.filePaths);
}
```

### File Conversion
```javascript
const conversionOptions = {
  files: selectedFiles,
  outputFormat: 'pdf',
  quality: 'high'
};

const response = await window.electronAPI.convertFile(conversionOptions);
if (response.success) {
  console.log('Conversion completed');
}
```

### Event Listeners
```javascript
// Listen for theme changes
const unsubscribe = window.electronAPI.onThemeChanged((themeData) => {
  console.log('Theme changed:', themeData.themeSource);
});

// Clean up listener
unsubscribe();
```

## Error Handling

All IPC operations return a standardized response format:
```javascript
{
  success: boolean,
  data?: any,
  error?: {
    type: string,
    message: string,
    code?: string
  }
}
```

## Performance Considerations

1. **Debouncing**: Frequent operations are debounced to prevent spam
2. **Throttling**: Resource-intensive operations are throttled
3. **Batch Operations**: Multiple operations can be batched for efficiency
4. **Progress Tracking**: Long-running operations provide progress updates

## Future Enhancements

1. **Streaming**: Support for streaming large file operations
2. **Caching**: IPC response caching for frequently accessed data
3. **Compression**: Message compression for large data transfers
4. **Encryption**: Additional encryption for sensitive data