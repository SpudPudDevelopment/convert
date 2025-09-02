# Temporary Workspace Management Implementation

This document describes the implementation of the temporary workspace management system for the Convert application.

## Overview

The `TempWorkspaceService` provides a robust system for managing temporary files and directories during conversion processes. It ensures isolated workspaces, automatic cleanup, and efficient resource management.

## Architecture

### Core Components

1. **TempWorkspaceService**: Main service class that manages workspace lifecycle
2. **IPC Integration**: Handlers for communication between main and renderer processes
3. **Monitoring System**: Disk usage and workspace health monitoring
4. **Cleanup System**: Automatic and manual cleanup mechanisms

### Key Features

- **Isolated Workspaces**: Each conversion process gets its own temporary directory
- **Automatic Cleanup**: Scheduled cleanup of old and orphaned workspaces
- **Disk Monitoring**: Real-time disk usage tracking and limits
- **Recovery System**: Ability to recover from interrupted operations
- **Comprehensive Logging**: Detailed logging for debugging and monitoring
- **Statistics Tracking**: Performance and usage statistics

## Service Architecture

```
TempWorkspaceService
├── Workspace Management
│   ├── Create isolated directories
│   ├── Track active workspaces
│   └── Manage workspace metadata
├── Cleanup System
│   ├── Automatic cleanup intervals
│   ├── Orphaned workspace detection
│   └── Manual cleanup operations
├── Monitoring
│   ├── Disk usage tracking
│   ├── Workspace statistics
│   └── Health monitoring
└── IPC Integration
    ├── Main process handlers
    ├── Renderer service methods
    └── Preload API exposure
```

## Workspace Structure

Each workspace follows a standardized directory structure:

```
/tmp/convert-app/
├── workspace-{uuid}/
│   ├── .workspace.json          # Metadata file
│   ├── input/                   # Input files
│   ├── output/                  # Output files
│   ├── temp/                    # Temporary processing files
│   └── logs/                    # Operation logs
```

## API Reference

### TempWorkspaceService Methods

#### `initialize()`
Initializes the service and creates the base directory.

```javascript
await tempWorkspaceService.initialize();
```

#### `createWorkspace(options)`
Creates a new isolated workspace.

```javascript
const result = await tempWorkspaceService.createWorkspace({
  name: 'pdf-conversion',
  metadata: {
    inputFormat: 'pdf',
    outputFormat: 'docx',
    userId: 'user123'
  }
});

if (result.success) {
  console.log('Workspace created:', result.workspace.id);
  console.log('Path:', result.workspace.path);
}
```

**Options:**
- `name` (string): Human-readable workspace name
- `metadata` (object): Additional metadata to store
- `subdirectories` (array): Custom subdirectories to create

#### `getWorkspace(workspaceId)`
Retrieves workspace information.

```javascript
const result = await tempWorkspaceService.getWorkspace(workspaceId);
if (result.success) {
  console.log('Workspace:', result.workspace);
}
```

#### `updateWorkspaceStatus(workspaceId, status, metadata)`
Updates workspace status and metadata.

```javascript
await tempWorkspaceService.updateWorkspaceStatus(
  workspaceId,
  'processing',
  { progress: 50, currentStep: 'converting' }
);
```

**Status Values:**
- `active`: Workspace is being used
- `processing`: Conversion in progress
- `completed`: Operation completed successfully
- `failed`: Operation failed
- `abandoned`: Operation was interrupted

#### `cleanupWorkspace(workspaceId)`
Cleans up a specific workspace.

```javascript
const result = await tempWorkspaceService.cleanupWorkspace(workspaceId);
if (result.success) {
  console.log('Cleaned up:', result.stats.filesDeleted, 'files');
  console.log('Space freed:', result.stats.sizeFreed);
}
```

#### `cleanupAllWorkspaces()`
Cleans up all active workspaces.

```javascript
const result = await tempWorkspaceService.cleanupAllWorkspaces();
console.log(`Cleaned ${result.results.cleaned} workspaces`);
```

#### `cleanupOrphanedWorkspaces(maxAge)`
Cleans up old or orphaned workspaces.

```javascript
// Clean workspaces older than 24 hours
const result = await tempWorkspaceService.cleanupOrphanedWorkspaces(24 * 60 * 60 * 1000);
console.log(`Cleaned ${result.cleaned} orphaned workspaces`);
```

#### `getDiskUsage()`
Returns current disk usage statistics.

```javascript
const result = await tempWorkspaceService.getDiskUsage();
if (result.success) {
  console.log('Total size:', result.data.totalSizeFormatted);
  console.log('Usage:', result.data.usagePercentage + '%');
}
```

#### `getStats()`
Returns service statistics.

```javascript
const stats = tempWorkspaceService.getStats();
console.log('Active workspaces:', stats.active);
console.log('Total created:', stats.created);
console.log('Total cleaned:', stats.cleaned);
```

#### `getActiveWorkspaces()`
Returns list of active workspaces.

```javascript
const workspaces = tempWorkspaceService.getActiveWorkspaces();
workspaces.forEach(workspace => {
  console.log(`${workspace.name} (${workspace.status})`);
});
```

## IPC Integration

### Available IPC Channels

- `CREATE_WORKSPACE`: Create a new workspace
- `GET_WORKSPACE`: Get workspace information
- `UPDATE_WORKSPACE_STATUS`: Update workspace status
- `CLEANUP_WORKSPACE`: Clean up specific workspace
- `CLEANUP_ALL_WORKSPACES`: Clean up all workspaces
- `GET_ACTIVE_WORKSPACES`: Get list of active workspaces
- `GET_WORKSPACE_STATS`: Get service statistics
- `GET_DISK_USAGE`: Get disk usage information

### Renderer Usage

```javascript
// Create workspace
const workspace = await window.electronAPI.createWorkspace({
  name: 'my-conversion',
  metadata: { type: 'pdf-to-docx' }
});

// Update status
await window.electronAPI.updateWorkspaceStatus(
  workspace.id,
  'processing',
  { progress: 25 }
);

// Get disk usage
const diskUsage = await window.electronAPI.getDiskUsage();
console.log('Disk usage:', diskUsage.usagePercentage + '%');

// Cleanup when done
await window.electronAPI.cleanupWorkspace(workspace.id);
```

## Configuration

### Service Options

```javascript
const service = new TempWorkspaceService({
  baseDir: '/custom/temp/path',        // Base directory for workspaces
  maxWorkspaces: 100,                  // Maximum concurrent workspaces
  maxDiskUsage: 10 * 1024 * 1024 * 1024, // 10GB limit
  cleanupInterval: 60 * 60 * 1000,     // Cleanup every hour
  maxWorkspaceAge: 24 * 60 * 60 * 1000, // 24 hours max age
  enableMonitoring: true,              // Enable disk monitoring
  logLevel: 'info'                     // Logging level
});
```

### Default Configuration

- **Base Directory**: `{os.tmpdir()}/convert-app`
- **Max Workspaces**: 50
- **Max Disk Usage**: 5GB
- **Cleanup Interval**: 30 minutes
- **Max Workspace Age**: 24 hours
- **Monitoring**: Enabled
- **Log Level**: 'info'

## Error Handling

The service implements comprehensive error handling:

### Common Error Scenarios

1. **Disk Space Exhausted**
   ```javascript
   const result = await createWorkspace(options);
   if (!result.success && result.error.includes('disk space')) {
     // Handle disk space error
     await cleanupOrphanedWorkspaces();
   }
   ```

2. **Permission Errors**
   ```javascript
   if (result.error.includes('Permission denied')) {
     // Handle permission error
     console.error('Insufficient permissions for temp directory');
   }
   ```

3. **Workspace Limit Reached**
   ```javascript
   if (result.error.includes('Maximum number of workspaces')) {
     // Clean up old workspaces and retry
     await cleanupOrphanedWorkspaces();
     const retryResult = await createWorkspace(options);
   }
   ```

### Error Recovery

The service includes automatic recovery mechanisms:

- **Orphaned Workspace Detection**: Automatically detects and cleans up abandoned workspaces
- **Disk Space Monitoring**: Prevents new workspace creation when disk space is low
- **Graceful Degradation**: Continues operation even if some workspaces fail

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**: Workspace metadata is loaded only when needed
2. **Batch Operations**: Multiple workspaces can be cleaned up in batches
3. **Async Operations**: All I/O operations are asynchronous
4. **Memory Management**: Workspace data is cleaned from memory after cleanup

### Monitoring Metrics

- **Active Workspaces**: Number of currently active workspaces
- **Disk Usage**: Total disk space used by all workspaces
- **Operation Counts**: Statistics on create/cleanup operations
- **Error Rates**: Tracking of failed operations

## Security Considerations

### File System Security

- **Isolated Directories**: Each workspace is completely isolated
- **Path Validation**: All paths are validated to prevent directory traversal
- **Cleanup Verification**: Ensures complete removal of sensitive data
- **Permission Checks**: Validates file system permissions before operations

### Data Protection

- **Temporary Data**: All workspace data is considered temporary
- **Secure Deletion**: Files are securely deleted during cleanup
- **No Persistent Storage**: No workspace data persists beyond cleanup

## Testing

The service includes comprehensive test coverage:

### Test Categories

1. **Unit Tests**: Individual method testing
2. **Integration Tests**: IPC communication testing
3. **Error Handling Tests**: Error scenario validation
4. **Performance Tests**: Load and stress testing
5. **Security Tests**: Path validation and isolation testing

### Running Tests

```bash
# Run all tests
npm test tempWorkspaceService

# Run with coverage
npm run test:coverage tempWorkspaceService

# Run integration tests
npm run test:integration tempWorkspace
```

## Troubleshooting

### Common Issues

1. **Workspace Creation Fails**
   - Check disk space availability
   - Verify directory permissions
   - Check workspace limits

2. **Cleanup Not Working**
   - Verify file permissions
   - Check for locked files
   - Review cleanup interval settings

3. **High Disk Usage**
   - Run manual cleanup
   - Reduce workspace age limit
   - Increase cleanup frequency

### Debug Logging

Enable debug logging for detailed information:

```javascript
const service = new TempWorkspaceService({
  logLevel: 'debug'
});
```

## Future Enhancements

### Planned Features

1. **Workspace Templates**: Pre-configured workspace structures
2. **Compression**: Automatic compression of inactive workspaces
3. **Cloud Storage**: Optional cloud backup for important workspaces
4. **Advanced Monitoring**: Real-time performance metrics
5. **Workspace Sharing**: Secure workspace sharing between processes

### Performance Improvements

1. **Parallel Cleanup**: Concurrent cleanup operations
2. **Smart Caching**: Intelligent metadata caching
3. **Predictive Cleanup**: ML-based cleanup scheduling
4. **Resource Pooling**: Reusable workspace pools

## Conclusion

The temporary workspace management system provides a robust, secure, and efficient solution for handling temporary files during conversion processes. It ensures proper isolation, automatic cleanup, and comprehensive monitoring while maintaining high performance and reliability.