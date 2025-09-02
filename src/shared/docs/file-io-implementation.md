# Core File Reading and Writing Functionality Implementation

This document describes the implementation of the core file reading and writing functionality for the Convert application, covering the complete file I/O system with streaming, buffering, progress tracking, and queue management.

## Overview

The file I/O system consists of two main services:

1. **FileIOService** - High-level file operations for the renderer process
2. **FileStreamService** - Low-level streaming operations for the main process

## Architecture

```
Renderer Process          IPC Channel           Main Process
┌─────────────────┐      ┌─────────────┐      ┌──────────────────┐
│  FileIOService  │ ────▶│ IPC Handlers │ ────▶│ FileStreamService │
│                 │      │             │      │                  │
│ - Queue Mgmt    │      │ - READ_FILE │      │ - Streaming      │
│ - Progress      │      │ - WRITE_FILE│      │ - Validation     │
│ - Validation    │      │ - GET_INFO  │      │ - File Info      │
│ - Error Handle  │      │ - VALIDATE  │      │ - Error Handle   │
└─────────────────┘      └─────────────┘      └──────────────────┘
```

## Core Components

### 1. FileIOService (`src/shared/services/fileIOService.js`)

The main service for file operations in the renderer process.

#### Key Features:
- **Queue Management**: Handles concurrent file operations with configurable limits
- **Progress Tracking**: Real-time progress updates for file operations
- **Validation**: File validation before operations
- **Error Handling**: Comprehensive error handling with retries
- **Event System**: EventEmitter-based notifications

#### Main Methods:

```javascript
// Read a single file
const result = await fileIOService.readFile('/path/to/file.txt', {
  encoding: 'utf8',
  useStreaming: false,
  chunkSize: 64 * 1024,
  maxSize: 100 * 1024 * 1024
});

// Write a file with options
const result = await fileIOService.writeFile('/path/to/output.txt', content, {
  encoding: 'utf8',
  createBackup: true,
  createDirectories: true,
  overwrite: true
});

// Read multiple files concurrently
const result = await fileIOService.readMultipleFiles([
  '/path/to/file1.txt',
  '/path/to/file2.txt'
], {
  maxConcurrent: 3,
  continueOnError: true
});

// Get file information
const info = await fileIOService.getFileInfo('/path/to/file.txt');

// Validate file
const validation = await fileIOService.validateFile('/path/to/file.txt', {
  maxSize: 10 * 1024 * 1024,
  allowedExtensions: ['.txt', '.md']
});

// Copy file
const result = await fileIOService.copyFile('/source.txt', '/dest.txt');
```

#### Queue Management:

```javascript
// Set maximum concurrent operations (1-20)
fileIOService.setMaxConcurrentOperations(5);

// Get operation statistics
const stats = fileIOService.getOperationStats();
// Returns: { active: { total, byType }, completed, failed, maxConcurrent }

// Cancel specific operation
fileIOService.cancelOperation(operationId);

// Get operation progress
const progress = fileIOService.getOperationProgress(operationId);
```

#### Event System:

```javascript
// Listen for file operations
fileIOService.on('fileRead', (data) => {
  console.log(`File read: ${data.filePath}, Size: ${data.size}`);
});

fileIOService.on('fileWritten', (data) => {
  console.log(`File written: ${data.filePath}, Bytes: ${data.bytesWritten}`);
});

fileIOService.on('operationProgress', (data) => {
  console.log(`Progress: ${data.percentage}% - ${data.operationType}`);
});

fileIOService.on('operationError', (error) => {
  console.error(`Operation failed: ${error.message}`);
});
```

### 2. FileStreamService (`src/shared/services/fileStreamService.js`)

Low-level streaming service for the main process.

#### Key Features:
- **Streaming I/O**: Efficient handling of large files
- **Chunked Operations**: Read/write files in configurable chunks
- **Progress Tracking**: Real-time progress for streaming operations
- **Stream Management**: Track and manage active streams
- **File Validation**: Comprehensive file validation
- **MIME Type Detection**: Automatic MIME type detection

#### Main Methods:

```javascript
// Create read stream
const result = await fileStreamService.createReadStream('/path/to/file.txt', {
  encoding: 'utf8',
  chunkSize: 64 * 1024
});

// Create write stream
const result = await fileStreamService.createWriteStream('/path/to/output.txt', {
  encoding: 'utf8',
  overwrite: true,
  createDirectories: true
});

// Read file in chunks
const result = await fileStreamService.readFileChunked('/path/to/file.txt', {
  chunkSize: 64 * 1024,
  onProgress: (progress) => {
    console.log(`Read progress: ${progress.percentage}%`);
  }
});

// Write file in chunks
const result = await fileStreamService.writeFileChunked('/path/to/output.txt', content, {
  chunkSize: 64 * 1024,
  onProgress: (progress) => {
    console.log(`Write progress: ${progress.percentage}%`);
  }
});

// Copy file with streaming
const result = await fileStreamService.copyFile('/source.txt', '/dest.txt', {
  onProgress: (progress) => {
    console.log(`Copy progress: ${progress.percentage}%`);
  }
});
```

#### Stream Management:

```javascript
// Get active streams
const streams = fileStreamService.getActiveStreams();
// Returns array of: { id, type, filePath, createdAt }

// Close specific stream
const result = fileStreamService.closeStream(streamId);

// Cleanup all streams
fileStreamService.cleanup();
```

### 3. IPC Integration (`src/shared/ipc/mainHandlers.js`)

Enhanced IPC handlers that integrate with FileStreamService.

#### Available IPC Channels:

```javascript
// Basic file operations
IPC_CHANNELS.READ_FILE          // Enhanced with streaming support
IPC_CHANNELS.WRITE_FILE         // Enhanced with streaming support

// File information and validation
IPC_CHANNELS.GET_FILE_INFO      // Get detailed file information
IPC_CHANNELS.VALIDATE_FILE      // Validate file against criteria
IPC_CHANNELS.COPY_FILE          // Copy file with progress

// Batch operations
IPC_CHANNELS.READ_MULTIPLE_FILES // Read multiple files concurrently

// Stream management
IPC_CHANNELS.CREATE_READ_STREAM  // Create readable stream
IPC_CHANNELS.CREATE_WRITE_STREAM // Create writable stream
IPC_CHANNELS.CLOSE_STREAM        // Close specific stream
IPC_CHANNELS.GET_ACTIVE_STREAMS  // Get all active streams
```

#### Enhanced READ_FILE Handler:

```javascript
// Supports additional options:
{
  encoding: 'utf8',           // File encoding
  useStreaming: false,        // Use streaming for large files
  chunkSize: 65536,          // Chunk size for streaming
  maxSize: 104857600         // Maximum file size (100MB)
}

// Returns enhanced response:
{
  success: true,
  data: {
    content: 'file content',
    filePath: '/path/to/file.txt',
    size: 1024,
    sizeFormatted: '1.0 KB',
    lastModified: '2023-01-01T00:00:00.000Z',
    encoding: 'utf8',
    mimeType: 'text/plain'
  }
}
```

#### Enhanced WRITE_FILE Handler:

```javascript
// Supports additional options:
{
  encoding: 'utf8',           // File encoding
  useStreaming: false,        // Use streaming for large files
  chunkSize: 65536,          // Chunk size for streaming
  createDirectories: true,    // Create parent directories
  overwrite: true            // Overwrite existing files
}

// Returns enhanced response:
{
  success: true,
  data: {
    filePath: '/path/to/file.txt',
    size: 1024,
    sizeFormatted: '1.0 KB',
    lastModified: '2023-01-01T00:00:00.000Z',
    bytesWritten: 1024,
    mimeType: 'text/plain'
  }
}
```

### 4. Renderer Integration (`src/shared/ipc/rendererService.js`)

Exposed methods for renderer process consumption.

```javascript
// Available methods in renderer:
window.electronAPI.readFile(filePath, options)
window.electronAPI.writeFile(filePath, content, options)
window.electronAPI.getFileInfo(filePath)
window.electronAPI.validateFile(filePath, criteria)
window.electronAPI.copyFile(sourcePath, destPath, options)
window.electronAPI.readMultipleFiles(filePaths, options)
window.electronAPI.createReadStream(filePath, options)
window.electronAPI.createWriteStream(filePath, options)
window.electronAPI.closeStream(streamId)
window.electronAPI.getActiveStreams()
```

## File Validation

Comprehensive file validation system:

```javascript
const validation = await fileIOService.validateFile('/path/to/file.txt', {
  maxSize: 10 * 1024 * 1024,        // 10MB max
  allowedExtensions: ['.txt', '.md'], // Allowed extensions
  checkReadability: true,            // Check if file is readable
  checkEncoding: true               // Validate text encoding
});

// Returns:
{
  success: true,
  isValid: true,
  errors: [],           // Array of error messages
  warnings: [],         // Array of warning messages
  fileInfo: {           // Basic file information
    size: 1024,
    extension: '.txt',
    mimeType: 'text/plain'
  }
}
```

## Error Handling

### Error Types:

```javascript
// From ERROR_TYPES in ipc.js
ERROR_TYPES.FILE_NOT_FOUND      // File doesn't exist
ERROR_TYPES.PERMISSION_DENIED   // No permission to access
ERROR_TYPES.FILE_TOO_LARGE     // File exceeds size limit
ERROR_TYPES.INVALID_PATH       // Invalid file path
ERROR_TYPES.OPERATION_CANCELLED // Operation was cancelled
ERROR_TYPES.VALIDATION_FAILED  // File validation failed
ERROR_TYPES.STREAM_ERROR       // Streaming operation error
```

### Error Response Format:

```javascript
{
  success: false,
  error: 'Error message',
  errorType: 'FILE_NOT_FOUND',
  details: {
    filePath: '/path/to/file.txt',
    operation: 'read',
    timestamp: '2023-01-01T00:00:00.000Z'
  }
}
```

### Retry Logic:

Built-in retry logic with exponential backoff:

```javascript
// Configured in ipcUtils.js
const result = await withRetry(async () => {
  return await fileOperation();
}, {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000,
  backoffFactor: 2
});
```

## Performance Considerations

### Streaming Thresholds:
- Files > 10MB automatically use streaming
- Configurable chunk sizes (default: 64KB)
- Progress tracking for operations > 1MB

### Concurrency Limits:
- Default: 3 concurrent operations
- Configurable: 1-20 operations
- Queue management for excess operations

### Memory Management:
- Streaming for large files to prevent memory issues
- Automatic cleanup of completed operations
- Stream lifecycle management

## Testing

Comprehensive test suites:

- **FileIOService Tests**: `src/shared/tests/fileIOService.test.js`
- **FileStreamService Tests**: `src/shared/tests/fileStreamService.test.js`

### Running Tests:

```bash
# Run all file I/O tests
npm test -- --testPathPattern="file.*Service"

# Run specific test file
npm test src/shared/tests/fileIOService.test.js
```

## Usage Examples

### Basic File Operations:

```javascript
import { FileIOService } from '../services/fileIOService.js';

const fileIO = new FileIOService();

// Read a text file
try {
  const result = await fileIO.readFile('/path/to/document.txt');
  console.log('File content:', result.content);
  console.log('File size:', result.sizeFormatted);
} catch (error) {
  console.error('Failed to read file:', error.message);
}

// Write with backup
try {
  const result = await fileIO.writeFile('/path/to/output.txt', 'New content', {
    createBackup: true,
    createDirectories: true
  });
  console.log('File written:', result.filePath);
} catch (error) {
  console.error('Failed to write file:', error.message);
}
```

### Batch Operations:

```javascript
// Process multiple files
const files = ['/file1.txt', '/file2.txt', '/file3.txt'];

try {
  const result = await fileIO.readMultipleFiles(files, {
    maxConcurrent: 2,
    continueOnError: true
  });
  
  console.log(`Processed ${result.totalFiles} files`);
  console.log(`Success: ${result.successCount}, Errors: ${result.errorCount}`);
  
  result.results.forEach(file => {
    if (file.success) {
      console.log(`✓ ${file.filePath}: ${file.sizeFormatted}`);
    } else {
      console.log(`✗ ${file.filePath}: ${file.error}`);
    }
  });
} catch (error) {
  console.error('Batch operation failed:', error.message);
}
```

### Progress Tracking:

```javascript
// Track progress for large file operations
fileIO.on('operationProgress', (progress) => {
  console.log(`${progress.operationType}: ${progress.percentage}% complete`);
  console.log(`${progress.processedBytes} / ${progress.totalBytes} bytes`);
});

// Large file copy with progress
const result = await fileIO.copyFile('/large-file.zip', '/backup/large-file.zip');
```

### Stream Management:

```javascript
// Create and manage streams
const readStream = await window.electronAPI.createReadStream('/large-file.txt');
const writeStream = await window.electronAPI.createWriteStream('/output.txt');

// Get active streams
const activeStreams = await window.electronAPI.getActiveStreams();
console.log(`Active streams: ${activeStreams.length}`);

// Cleanup
await window.electronAPI.closeStream(readStream.streamId);
await window.electronAPI.closeStream(writeStream.streamId);
```

## Configuration

### Default Settings:

```javascript
// FileIOService defaults
const defaults = {
  maxConcurrentOperations: 3,
  defaultEncoding: 'utf8',
  defaultChunkSize: 64 * 1024,      // 64KB
  maxFileSize: 100 * 1024 * 1024,   // 100MB
  streamingThreshold: 10 * 1024 * 1024, // 10MB
  retryAttempts: 3,
  retryDelay: 1000
};

// FileStreamService defaults
const streamDefaults = {
  defaultChunkSize: 64 * 1024,      // 64KB
  defaultEncoding: 'utf8',
  createDirectories: true,
  overwriteExisting: true
};
```

### Customization:

```javascript
// Customize FileIOService
const fileIO = new FileIOService();
fileIO.setMaxConcurrentOperations(5);

// Custom validation criteria
const validation = await fileIO.validateFile('/file.txt', {
  maxSize: 50 * 1024 * 1024,        // 50MB
  allowedExtensions: ['.txt', '.md', '.json'],
  checkReadability: true
});
```

## Security Considerations

1. **Path Validation**: All file paths are validated to prevent directory traversal
2. **Size Limits**: Configurable file size limits to prevent memory exhaustion
3. **Extension Filtering**: Whitelist-based file extension validation
4. **Permission Checks**: Verify read/write permissions before operations
5. **Error Sanitization**: Error messages don't expose sensitive system information

## Future Enhancements

1. **Compression Support**: Built-in compression for large files
2. **Encryption**: File encryption/decryption capabilities
3. **Cloud Integration**: Support for cloud storage providers
4. **File Watching**: Real-time file system monitoring
5. **Metadata Extraction**: Enhanced metadata extraction for various file types
6. **Thumbnail Generation**: Image thumbnail generation
7. **File Indexing**: Full-text search capabilities

---

*This implementation provides a robust, scalable foundation for file operations in the Convert application, with comprehensive error handling, progress tracking, and performance optimization.*