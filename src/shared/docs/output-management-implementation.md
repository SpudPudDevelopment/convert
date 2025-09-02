# Output Management System Implementation

## Overview

The Output Management System provides comprehensive functionality for handling file output operations during conversion processes. It manages output directory selection, file naming patterns, conflict resolution, and batch processing with a focus on user experience and data integrity.

## Architecture

### Core Components

1. **OutputManagementService** - Main service class handling all output operations
2. **IPC Integration** - Seamless communication between main and renderer processes
3. **Conflict Resolution** - Multiple strategies for handling file conflicts
4. **Naming Patterns** - Flexible file naming with variable substitution
5. **Batch Processing** - Efficient handling of multiple file operations

### Service Structure

```
OutputManagementService
├── Directory Management
│   ├── selectOutputDirectory()
│   ├── validateOutputDirectory()
│   └── ensureDirectoryExists()
├── Path Generation
│   ├── generateOutputPath()
│   ├── previewOutputPaths()
│   └── replaceVariables()
├── Conflict Resolution
│   ├── resolveConflict()
│   ├── generateUniqueFilename()
│   └── checkFileExists()
├── Processing
│   ├── processOutput()
│   └── processBatchOutput()
└── Utilities
    ├── getNamingPatterns()
    ├── getConflictStrategies()
    └── getStats()
```

## Key Features

### 1. Directory Selection and Validation

- **Interactive Selection**: Native file dialog for directory selection
- **Path Validation**: Comprehensive validation of directory paths
- **Permission Checking**: Verification of read/write permissions
- **Auto-Creation**: Automatic creation of non-existent directories

### 2. Flexible Naming Patterns

- **Variable Substitution**: Support for dynamic variables in filenames
- **Predefined Patterns**: Common naming patterns for different use cases
- **Custom Patterns**: User-defined naming schemes
- **Preview System**: Real-time preview of generated filenames

### 3. Conflict Resolution Strategies

- **Auto-Rename**: Automatic generation of unique filenames
- **Overwrite**: Replace existing files
- **Skip**: Skip conflicting files
- **Prompt**: Interactive user decision for each conflict

### 4. Batch Processing

- **Bulk Operations**: Process multiple files simultaneously
- **Progress Tracking**: Monitor batch operation progress
- **Error Handling**: Graceful handling of individual file failures
- **Summary Reports**: Detailed results of batch operations

## Service Methods

### Directory Operations

#### `selectOutputDirectory()`
Opens a native directory selection dialog.

```javascript
const result = await outputService.selectOutputDirectory();
// Returns: { success: boolean, path?: string, error?: string }
```

#### `validateOutputDirectory(directoryPath)`
Validates a directory path for output operations.

```javascript
const validation = await outputService.validateOutputDirectory('/path/to/output');
// Returns: { valid: boolean, path: string, exists: boolean, writable: boolean, error?: string }
```

### Path Generation

#### `generateOutputPath(inputPath, outputDir, pattern, variables)`
Generates an output path based on input file and naming pattern.

```javascript
const result = await outputService.generateOutputPath(
  '/input/document.pdf',
  '/output',
  '{name}_{timestamp}.{ext}',
  { ext: 'docx', timestamp: '20231201' }
);
// Returns: { success: boolean, path?: string, error?: string }
```

#### `previewOutputPaths(inputPaths, outputDir, pattern, variables)`
Previews output paths for multiple input files.

```javascript
const preview = await outputService.previewOutputPaths(
  ['/input/doc1.pdf', '/input/doc2.pdf'],
  '/output',
  '{name}.{ext}',
  { ext: 'docx' }
);
// Returns: { success: boolean, previews: Array<{input, output, success}> }
```

### Conflict Resolution

#### `resolveConflict(outputPath, strategy, options)`
Resolves file conflicts using specified strategy.

```javascript
const resolution = await outputService.resolveConflict(
  '/output/document.docx',
  'auto-rename',
  { maxAttempts: 100 }
);
// Returns: { success: boolean, action: string, originalPath: string, resolvedPath?: string }
```

### Processing Operations

#### `processOutput(inputPath, outputDir, pattern, variables, conflictStrategy)`
Processes a single file output operation.

```javascript
const result = await outputService.processOutput(
  '/input/document.pdf',
  '/output',
  '{name}.{ext}',
  { ext: 'docx' },
  'auto-rename'
);
// Returns: { success: boolean, inputPath: string, outputPath?: string, conflict?: object, error?: string }
```

#### `processBatchOutput(inputPaths, outputDir, pattern, variables, conflictStrategy)`
Processes multiple file output operations.

```javascript
const batchResult = await outputService.processBatchOutput(
  ['/input/doc1.pdf', '/input/doc2.pdf'],
  '/output',
  '{name}.{ext}',
  { ext: 'docx' },
  'auto-rename'
);
// Returns: { success: boolean, results: Array, summary: object, error?: string }
```

## IPC Integration

### Available Channels

- `SELECT_OUTPUT_DIRECTORY` - Directory selection dialog
- `VALIDATE_OUTPUT_DIRECTORY` - Directory validation
- `GENERATE_OUTPUT_PATH` - Single path generation
- `PREVIEW_OUTPUT_PATHS` - Batch path preview
- `RESOLVE_CONFLICT` - Conflict resolution
- `PROCESS_OUTPUT` - Single file processing
- `PROCESS_BATCH_OUTPUT` - Batch file processing
- `GET_NAMING_PATTERNS` - Available naming patterns
- `GET_CONFLICT_STRATEGIES` - Available conflict strategies
- `GET_OUTPUT_STATS` - Service statistics

### Renderer Usage

```javascript
// Select output directory
const directory = await window.electronAPI.selectOutputDirectory();

// Generate output path
const outputPath = await window.electronAPI.generateOutputPath(
  inputPath, outputDir, pattern, variables
);

// Process batch output
const batchResult = await window.electronAPI.processBatchOutput(
  inputPaths, outputDir, pattern, variables, conflictStrategy
);
```

## Naming Patterns

### Available Variables

- `{name}` - Original filename without extension
- `{ext}` - Target file extension
- `{timestamp}` - Current timestamp
- `{date}` - Current date (YYYY-MM-DD)
- `{counter}` - Sequential counter
- `{custom}` - Custom user-defined value

### Predefined Patterns

1. **Original Name**: `{name}.{ext}`
2. **With Timestamp**: `{name}_{timestamp}.{ext}`
3. **With Date**: `{name}_{date}.{ext}`
4. **With Counter**: `{name}_{counter}.{ext}`
5. **Custom**: User-defined pattern

### Pattern Examples

```javascript
// Input: document.pdf, Extension: docx
'{name}.{ext}' → 'document.docx'
'{name}_{timestamp}.{ext}' → 'document_1701432000000.docx'
'{name}_{date}.{ext}' → 'document_2023-12-01.docx'
'converted_{name}.{ext}' → 'converted_document.docx'
```

## Conflict Resolution

### Strategies

1. **Auto-Rename**
   - Automatically generates unique filenames
   - Appends numeric suffix (e.g., `document_1.docx`)
   - Configurable maximum attempts

2. **Overwrite**
   - Replaces existing files
   - No backup or confirmation
   - Use with caution

3. **Skip**
   - Skips files that would cause conflicts
   - Continues with remaining files
   - Reports skipped files

4. **Prompt**
   - Interactive user decision
   - Per-file conflict resolution
   - Allows mixed strategies

### Auto-Rename Algorithm

```javascript
// Original: document.docx
// Conflicts: document_1.docx, document_2.docx, ..., document_99.docx
// Generated: document_100.docx
```

## Error Handling

### Common Error Types

- **Invalid Path**: Malformed or empty paths
- **Permission Denied**: Insufficient file system permissions
- **Directory Not Found**: Non-existent output directories
- **Disk Space**: Insufficient storage space
- **File System**: General file system errors

### Error Response Format

```javascript
{
  success: false,
  error: 'Error description',
  code: 'ERROR_CODE',
  details: { /* Additional error context */ }
}
```

## Performance Considerations

### Optimization Strategies

1. **Batch Operations**
   - Process multiple files in single operations
   - Reduce IPC overhead
   - Improve user experience

2. **Path Validation Caching**
   - Cache directory validation results
   - Avoid repeated file system checks
   - Improve response times

3. **Conflict Detection**
   - Early conflict detection
   - Minimize file system operations
   - Batch conflict resolution

4. **Memory Management**
   - Stream large file operations
   - Limit concurrent operations
   - Monitor memory usage

## Security

### Path Validation

- **Path Traversal Prevention**: Validate against directory traversal attacks
- **Sanitization**: Clean user-provided paths and filenames
- **Permission Checking**: Verify appropriate file system permissions
- **Sandbox Compliance**: Respect application sandbox restrictions

### Safe Operations

```javascript
// Validate paths before operations
const validation = await validateOutputDirectory(userPath);
if (!validation.valid) {
  throw new Error(`Invalid directory: ${validation.error}`);
}

// Sanitize filenames
const safeName = filename.replace(/[<>:"/\\|?*]/g, '_');
```

## Testing

### Test Coverage

- **Unit Tests**: Individual method testing
- **Integration Tests**: IPC communication testing
- **Error Scenarios**: Edge case and error handling
- **Performance Tests**: Batch operation efficiency

### Mock Dependencies

```javascript
// Mock file system operations
jest.mock('fs/promises');
jest.mock('electron');

// Test conflict resolution
fs.access.mockResolvedValue(); // File exists
const result = await service.resolveConflict(path, 'auto-rename');
expect(result.action).toBe('auto-rename');
```

## Usage Examples

### Basic Output Processing

```javascript
// Select output directory
const directory = await outputService.selectOutputDirectory();
if (!directory.success) return;

// Generate output path
const outputPath = await outputService.generateOutputPath(
  inputFile,
  directory.path,
  '{name}.{ext}',
  { ext: 'docx' }
);

// Process with conflict resolution
const result = await outputService.processOutput(
  inputFile,
  directory.path,
  '{name}.{ext}',
  { ext: 'docx' },
  'auto-rename'
);
```

### Batch Processing

```javascript
// Preview batch output
const preview = await outputService.previewOutputPaths(
  inputFiles,
  outputDirectory,
  '{name}_{timestamp}.{ext}',
  { ext: 'docx', timestamp: Date.now() }
);

// Process batch with progress tracking
const batchResult = await outputService.processBatchOutput(
  inputFiles,
  outputDirectory,
  '{name}_{timestamp}.{ext}',
  { ext: 'docx', timestamp: Date.now() },
  'auto-rename'
);

console.log(`Processed ${batchResult.summary.successful}/${batchResult.summary.total} files`);
```

### Custom Naming Pattern

```javascript
// Get available patterns
const patterns = outputService.getNamingPatterns();

// Use custom pattern
const customResult = await outputService.generateOutputPath(
  inputFile,
  outputDir,
  'converted_{name}_{date}.{ext}',
  {
    ext: 'docx',
    date: new Date().toISOString().split('T')[0]
  }
);
```

## Configuration

### Service Options

```javascript
const options = {
  maxRenameAttempts: 100,
  defaultConflictStrategy: 'auto-rename',
  enablePreview: true,
  validatePaths: true
};

const outputService = new OutputManagementService(options);
```

### Pattern Configuration

```javascript
// Add custom pattern
outputService.addNamingPattern({
  name: 'Project Format',
  pattern: '{project}_{name}_{version}.{ext}',
  description: 'Project-specific naming'
});
```

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Check directory permissions
   - Verify application sandbox settings
   - Use alternative output location

2. **Path Generation Failures**
   - Validate input file paths
   - Check naming pattern syntax
   - Verify variable availability

3. **Conflict Resolution Issues**
   - Check available disk space
   - Verify conflict strategy settings
   - Monitor file system limits

### Debug Information

```javascript
// Enable debug logging
const stats = outputService.getStats();
console.log('Output service stats:', stats);

// Check service health
const validation = await outputService.validateOutputDirectory(outputDir);
console.log('Directory validation:', validation);
```

## Future Enhancements

### Planned Features

1. **Template System**
   - Predefined output templates
   - User-customizable templates
   - Template sharing and import

2. **Advanced Conflict Resolution**
   - Content-based conflict detection
   - Merge strategies for compatible files
   - Version control integration

3. **Output Monitoring**
   - Real-time output tracking
   - File system event monitoring
   - Automatic cleanup and organization

4. **Cloud Integration**
   - Cloud storage output support
   - Automatic synchronization
   - Remote directory management

5. **Performance Optimization**
   - Parallel processing
   - Streaming operations
   - Memory usage optimization

## Conclusion

The Output Management System provides a robust, flexible, and user-friendly solution for handling file output operations in the conversion application. With comprehensive conflict resolution, flexible naming patterns, and efficient batch processing, it ensures reliable and predictable output handling for all conversion scenarios.