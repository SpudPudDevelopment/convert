# Metadata and Error Handling Systems Implementation

This document provides comprehensive documentation for the metadata extraction/preservation system and error handling mechanisms implemented in the file conversion application.

## Table of Contents

1. [Overview](#overview)
2. [Metadata Service](#metadata-service)
3. [Error Handling Service](#error-handling-service)
4. [Integration](#integration)
5. [Usage Examples](#usage-examples)
6. [Configuration](#configuration)
7. [Testing](#testing)
8. [Performance Considerations](#performance-considerations)
9. [Security](#security)
10. [Troubleshooting](#troubleshooting)
11. [Future Enhancements](#future-enhancements)

## Overview

The metadata and error handling systems provide robust file metadata management and comprehensive error recovery mechanisms for the file conversion application. These systems ensure data integrity, provide detailed error reporting, and implement transaction-like operations for file system operations.

### Key Features

- **Metadata Extraction**: Extract comprehensive file metadata including timestamps, permissions, and custom fields
- **Metadata Preservation**: Preserve metadata across file operations with retry logic
- **Metadata Backup/Restore**: Create and restore metadata backups for data recovery
- **Error Recovery**: Implement retry mechanisms with exponential backoff
- **Transaction Management**: Provide transaction-like operations with rollback capabilities
- **Comprehensive Error Reporting**: Detailed error categorization and user-friendly messages
- **Permission Checking**: Validate file system permissions before operations
- **Error History**: Track and analyze error patterns

## Metadata Service

### Architecture

The `MetadataService` class provides comprehensive metadata management capabilities:

```javascript
const { MetadataService } = require('../services/metadataService');
const metadataService = new MetadataService();
```

### Core Methods

#### extractMetadata(filePath, options)

Extracts metadata from a file including:
- **Common metadata**: size, timestamps, permissions, ownership
- **Specific metadata**: file extension, basename, dirname
- **Custom metadata**: user-defined fields (optional)

```javascript
const metadata = await metadataService.extractMetadata('/path/to/file.txt', {
  includeCustom: true,
  customFields: ['author', 'title']
});
```

#### preserveMetadata(metadata, targetPath, options)

Preserves metadata to a target file with retry logic:
- Timestamps (mtime, atime)
- File permissions (mode)
- Ownership (uid, gid)
- Custom attributes

```javascript
const result = await metadataService.preserveMetadata(metadata, '/path/to/target.txt', {
  maxRetries: 3,
  retryDelay: 1000,
  preserveOwnership: true
});
```

#### createMetadataBackup(metadata, backupPath)

Creates a JSON backup of metadata for recovery purposes:

```javascript
const backup = await metadataService.createMetadataBackup(metadata, '/path/to/backup.json');
```

#### restoreMetadataBackup(backupPath)

Restores metadata from a backup file:

```javascript
const restored = await metadataService.restoreMetadataBackup('/path/to/backup.json');
```

#### compareMetadata(metadata1, metadata2)

Compares two metadata objects and identifies differences:

```javascript
const comparison = metadataService.compareMetadata(originalMetadata, currentMetadata);
if (!comparison.identical) {
  console.log('Differences found:', comparison.differences);
}
```

### Metadata Structure

```javascript
{
  common: {
    size: 1024,
    mtime: Date,
    atime: Date,
    ctime: Date,
    birthtime: Date,
    mode: 0o644,
    uid: 1000,
    gid: 1000,
    isFile: true,
    isDirectory: false
  },
  specific: {
    extension: '.txt',
    basename: 'file.txt',
    dirname: '/path/to',
    customFields: ['author', 'title']
  },
  extractedAt: Date
}
```

## Error Handling Service

### Architecture

The `ErrorHandlingService` class provides comprehensive error handling and recovery mechanisms:

```javascript
const { ErrorHandlingService } = require('../services/errorHandlingService');
const errorHandlingService = new ErrorHandlingService();
```

### Core Methods

#### executeWithRetry(operation, options)

Executes operations with retry logic and exponential backoff:

```javascript
const result = await errorHandlingService.executeWithRetry(async () => {
  return await fs.readFile('/path/to/file.txt');
}, {
  maxRetries: 3,
  baseDelay: 1000,
  exponentialBackoff: true,
  retryableErrors: ['EBUSY', 'EAGAIN', 'ENOSPC']
});
```

#### Transaction Management

Provides transaction-like operations with rollback capabilities:

```javascript
// Start transaction
const transaction = errorHandlingService.startTransaction('file-conversion-001');

// Add operations to transaction
errorHandlingService.addToTransaction('file-conversion-001', {
  type: 'file-create',
  path: '/temp/converted.txt'
});

// Commit or rollback
if (success) {
  await errorHandlingService.commitTransaction('file-conversion-001');
} else {
  await errorHandlingService.rollbackTransaction('file-conversion-001', 'Conversion failed');
}
```

#### handleFileSystemError(error, context)

Categorizes and provides detailed information about file system errors:

```javascript
const errorInfo = errorHandlingService.handleFileSystemError(error, {
  operation: 'read',
  filePath: '/path/to/file.txt'
});

console.log(`Severity: ${errorInfo.severity}`);
console.log(`User Message: ${errorInfo.userMessage}`);
console.log(`Suggestions: ${errorInfo.suggestions.join(', ')}`);
```

#### checkPermissions(filePath, operation)

Checks file system permissions before operations:

```javascript
const permissionCheck = await errorHandlingService.checkPermissions('/path/to/file.txt', 'write');
if (!permissionCheck.hasPermission) {
  console.log('Write permission denied');
}
```

### Error Categories

| Error Code | Category | Severity | Retryable | Description |
|------------|----------|----------|-----------|-------------|
| ENOENT | file-not-found | medium | false | File or directory not found |
| EACCES | permission-denied | high | false | Permission denied |
| ENOSPC | disk-space | critical | true | No space left on device |
| EBUSY | resource-busy | medium | true | Resource busy or locked |
| EMFILE | too-many-files | high | true | Too many open files |
| ENOTDIR | not-directory | medium | false | Not a directory |
| EISDIR | is-directory | medium | false | Is a directory |
| EEXIST | file-exists | low | false | File already exists |

### Recovery Actions

The service provides automated recovery suggestions:

- **Disk Space Issues**: Cleanup temporary files, move to different location
- **Permission Issues**: Check permissions, run with appropriate privileges
- **Resource Busy**: Wait and retry, close file handles
- **File Not Found**: Verify path, check parent directory

## Integration

### IPC Integration

Both services are integrated with the IPC system for frontend access:

```javascript
// Metadata operations
const metadata = await window.electronAPI.extractMetadata('/path/to/file.txt');
await window.electronAPI.preserveMetadata(metadata, '/path/to/target.txt');

// Error handling operations
const transaction = await window.electronAPI.startTransaction('conversion-001');
await window.electronAPI.commitTransaction('conversion-001');
```

### Service Integration

Services can be used together for robust file operations:

```javascript
class FileOperationService {
  async copyFileWithMetadata(sourcePath, targetPath) {
    const transactionId = `copy-${Date.now()}`;
    
    try {
      // Start transaction
      await this.errorHandlingService.startTransaction(transactionId);
      
      // Extract metadata
      const metadata = await this.metadataService.extractMetadata(sourcePath);
      
      // Copy file with retry
      await this.errorHandlingService.executeWithRetry(async () => {
        await fs.copyFile(sourcePath, targetPath);
      });
      
      // Preserve metadata
      await this.metadataService.preserveMetadata(metadata, targetPath);
      
      // Commit transaction
      await this.errorHandlingService.commitTransaction(transactionId);
      
      return { success: true };
    } catch (error) {
      // Rollback on failure
      await this.errorHandlingService.rollbackTransaction(transactionId, error.message);
      throw error;
    }
  }
}
```

## Usage Examples

### Basic Metadata Operations

```javascript
// Extract and preserve metadata during file conversion
async function convertWithMetadata(inputPath, outputPath) {
  // Extract original metadata
  const originalMetadata = await metadataService.extractMetadata(inputPath);
  
  // Create backup
  const backupPath = `${outputPath}.metadata.backup`;
  await metadataService.createMetadataBackup(originalMetadata, backupPath);
  
  // Perform conversion (implementation specific)
  await performConversion(inputPath, outputPath);
  
  // Preserve metadata
  await metadataService.preserveMetadata(originalMetadata, outputPath);
  
  // Verify preservation
  const newMetadata = await metadataService.extractMetadata(outputPath);
  const comparison = metadataService.compareMetadata(originalMetadata, newMetadata);
  
  if (!comparison.identical) {
    console.warn('Metadata preservation incomplete:', comparison.differences);
  }
}
```

### Error Handling with Transactions

```javascript
async function batchConversion(files) {
  const transactionId = `batch-${Date.now()}`;
  
  try {
    await errorHandlingService.startTransaction(transactionId);
    
    for (const file of files) {
      await errorHandlingService.executeWithRetry(async () => {
        // Check permissions first
        const readPermission = await errorHandlingService.checkPermissions(file.input, 'read');
        const writePermission = await errorHandlingService.checkPermissions(file.output, 'write');
        
        if (!readPermission.hasPermission || !writePermission.hasPermission) {
          throw new Error('Insufficient permissions');
        }
        
        // Add operation to transaction
        errorHandlingService.addToTransaction(transactionId, {
          type: 'file-conversion',
          input: file.input,
          output: file.output
        });
        
        // Perform conversion
        await convertFile(file.input, file.output);
      }, {
        maxRetries: 3,
        baseDelay: 1000
      });
    }
    
    await errorHandlingService.commitTransaction(transactionId);
    return { success: true, converted: files.length };
    
  } catch (error) {
    const errorInfo = errorHandlingService.handleFileSystemError(error);
    await errorHandlingService.rollbackTransaction(transactionId, errorInfo.userMessage);
    
    return {
      success: false,
      error: errorInfo.userMessage,
      suggestions: errorInfo.suggestions
    };
  }
}
```

## Configuration

### Metadata Service Configuration

```javascript
const metadataService = new MetadataService({
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true
  },
  preservationOptions: {
    preserveTimestamps: true,
    preservePermissions: true,
    preserveOwnership: false, // May require elevated privileges
    ignoreErrors: false
  },
  backupOptions: {
    compression: false,
    includeChecksum: true
  }
});
```

### Error Handling Service Configuration

```javascript
const errorHandlingService = new ErrorHandlingService({
  retryDefaults: {
    maxRetries: 3,
    baseDelay: 1000,
    exponentialBackoff: true,
    maxDelay: 30000
  },
  transactionOptions: {
    autoCleanup: true,
    maxTransactions: 100,
    timeoutMs: 300000 // 5 minutes
  },
  errorHistoryOptions: {
    maxEntries: 100,
    retentionDays: 7
  }
});
```

## Testing

### Running Tests

```bash
# Run metadata service tests
npm test -- metadataService.test.js

# Run error handling service tests
npm test -- errorHandlingService.test.js

# Run all tests with coverage
npm run test:coverage
```

### Test Coverage

The test suites provide comprehensive coverage:

- **Metadata Service**: 95%+ coverage including edge cases
- **Error Handling Service**: 95%+ coverage including retry logic
- **Integration Tests**: End-to-end scenarios
- **Performance Tests**: Load and stress testing

## Performance Considerations

### Metadata Operations

- **Caching**: Metadata is cached for frequently accessed files
- **Batch Operations**: Support for batch metadata extraction
- **Async Processing**: Non-blocking operations with progress tracking
- **Memory Management**: Efficient handling of large file metadata

### Error Handling

- **Retry Optimization**: Intelligent retry strategies based on error type
- **Transaction Cleanup**: Automatic cleanup of stale transactions
- **Error History**: Configurable retention and cleanup policies
- **Performance Monitoring**: Track operation timing and success rates

### Optimization Tips

1. **Batch Operations**: Group multiple operations for better performance
2. **Selective Metadata**: Extract only required metadata fields
3. **Async Processing**: Use Promise.all for parallel operations
4. **Error Filtering**: Configure retryable error types appropriately
5. **Transaction Scope**: Keep transactions focused and short-lived

## Security

### File System Security

- **Path Validation**: Prevent directory traversal attacks
- **Permission Checking**: Validate permissions before operations
- **Sandboxing**: Isolate file operations within allowed directories
- **Input Sanitization**: Sanitize file paths and metadata

### Metadata Security

- **Sensitive Data**: Filter sensitive metadata before logging
- **Backup Encryption**: Optional encryption for metadata backups
- **Access Control**: Restrict metadata access based on user permissions
- **Audit Trail**: Log metadata operations for security auditing

### Error Information

- **Information Disclosure**: Sanitize error messages for user display
- **Logging Security**: Secure logging of error details
- **Error Sanitization**: Remove sensitive paths from error messages

## Troubleshooting

### Common Issues

#### Metadata Preservation Failures

```javascript
// Check for common issues
const diagnosis = await metadataService.diagnosePreservationIssue(targetPath);
if (diagnosis.permissionIssue) {
  console.log('Permission issue detected:', diagnosis.details);
}
```

#### Transaction Rollback Issues

```javascript
// Monitor transaction health
const activeTransactions = errorHandlingService.getActiveTransactions();
for (const transaction of activeTransactions) {
  if (transaction.age > 300000) { // 5 minutes
    console.warn('Long-running transaction detected:', transaction.id);
  }
}
```

#### Error Handling Debugging

```javascript
// Enable detailed error logging
const errorStats = errorHandlingService.getStatistics();
console.log('Error patterns:', errorStats.errors.byCategory);

// Get recent error history
const recentErrors = errorHandlingService.getErrorHistory({
  since: new Date(Date.now() - 3600000) // Last hour
});
```

### Performance Issues

1. **Slow Metadata Operations**: Check file system performance and network latency
2. **High Retry Rates**: Analyze error patterns and adjust retry strategies
3. **Memory Usage**: Monitor metadata cache size and cleanup policies
4. **Transaction Overhead**: Optimize transaction scope and cleanup

### Debugging Tools

```javascript
// Enable debug logging
process.env.DEBUG = 'metadata:*,error-handling:*';

// Monitor service health
const metadataStats = metadataService.getStatistics();
const errorStats = errorHandlingService.getStatistics();

console.log('Service Health:', {
  metadata: metadataStats,
  errorHandling: errorStats
});
```

## Future Enhancements

### Planned Features

1. **Advanced Metadata Types**
   - EXIF data for images
   - ID3 tags for audio files
   - Document properties for office files

2. **Enhanced Error Recovery**
   - Machine learning for error prediction
   - Automated recovery workflows
   - Integration with system monitoring

3. **Performance Improvements**
   - Parallel metadata processing
   - Streaming metadata extraction
   - Distributed transaction support

4. **Security Enhancements**
   - End-to-end encryption for metadata
   - Digital signatures for integrity
   - Advanced access control

### Integration Opportunities

- **Cloud Storage**: Metadata synchronization with cloud services
- **Database Integration**: Persistent metadata storage
- **Monitoring Systems**: Integration with application monitoring
- **Backup Systems**: Automated metadata backup workflows

### API Extensions

- **REST API**: HTTP endpoints for metadata operations
- **GraphQL**: Flexible metadata querying
- **WebSocket**: Real-time error notifications
- **Plugin System**: Extensible metadata extractors

---

*This documentation is maintained as part of the file conversion application. For updates and contributions, please refer to the project repository.*