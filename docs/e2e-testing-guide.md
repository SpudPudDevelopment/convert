# End-to-End Testing Guide

This guide provides comprehensive documentation for the end-to-end testing suite of the file conversion application. The E2E tests verify the complete user workflow from file selection through conversion completion.

## Overview

The E2E testing suite consists of two main test files:

1. **`conversion-e2e.test.js`** - Tests all conversion types through the UI
2. **`file-handling-e2e.test.js`** - Tests file handling and output management
3. **`test-runner.js`** - Test runner script with configuration and reporting

## Test Structure

### Conversion E2E Tests

Tests all conversion types through the UI with real file handling:

#### Document Conversion Tests
- **PDF to DOCX conversion** - Tests successful document conversion
- **Error handling** - Tests encrypted document handling
- **Custom settings** - Tests conversion with custom DPI and quality settings

#### Image Conversion Tests
- **JPG to PNG conversion** - Tests successful image conversion
- **Corruption handling** - Tests corrupted image file detection
- **Quality settings** - Tests conversion with quality and compression settings

#### Audio Conversion Tests
- **MP3 to WAV conversion** - Tests successful audio conversion
- **Codec error handling** - Tests unsupported audio codec handling
- **Audio settings** - Tests conversion with bitrate, sample rate, and channel settings

#### Video Conversion Tests
- **MP4 to MOV conversion** - Tests successful video conversion
- **Codec error handling** - Tests unsupported video codec handling
- **Video settings** - Tests conversion with quality, frame rate, and codec settings

#### Unified Converter Tests
- **Mixed file types** - Tests detection and conversion of mixed file types
- **Partial failures** - Tests batch conversion with some files failing

#### Batch Processing Tests
- **Large batch processing** - Tests processing of 50+ files
- **Progress tracking** - Tests progress updates during batch processing

#### Error Recovery Tests
- **Retry failed conversion** - Tests retry mechanism for failed conversions
- **Manual intervention** - Tests manual intervention requests

### File Handling E2E Tests

Tests file validation, output directory management, and file operations:

#### File Validation Tests
- **Supported file types** - Tests validation of supported file formats
- **Unsupported file types** - Tests rejection of unsupported formats
- **File size limits** - Tests validation of file size constraints
- **Corrupted files** - Tests detection of corrupted files
- **Empty files** - Tests rejection of empty files

#### Output Directory Management Tests
- **Directory selection** - Tests directory selection via dialog
- **Permission validation** - Tests output directory write permissions
- **Directory creation** - Tests automatic creation of non-existent directories
- **Disk space validation** - Tests available disk space checking

#### File Operations Tests
- **Drag and drop** - Tests file drag and drop functionality
- **File removal** - Tests removing files from selection
- **Clear all files** - Tests clearing all selected files
- **File preview** - Tests file preview functionality

#### Output File Management Tests
- **Unique filenames** - Tests generation of unique output filenames
- **File conflicts** - Tests handling of output file conflicts
- **Metadata preservation** - Tests preservation of file metadata
- **Cleanup on failure** - Tests cleanup of partial output files

#### Batch File Processing Tests
- **Processing order** - Tests correct order of file processing
- **Mixed file types** - Tests batch processing with different file types
- **Progress tracking** - Tests progress updates during batch processing

## Running the Tests

### Prerequisites

1. **Node.js and npm** - Ensure you have Node.js installed
2. **Jest** - The testing framework should be installed
3. **Testing Library** - React Testing Library for component testing
4. **User Event** - For simulating user interactions

### Basic Test Execution

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test suite
npm run test:e2e -- --suite conversion-e2e.test.js

# Run with custom timeout
npm run test:e2e -- --timeout 60000
```

### Using the Test Runner

```bash
# Run all tests with default configuration
node src/tests/e2e/test-runner.js

# Run specific test suite
node src/tests/e2e/test-runner.js --suite conversion-e2e.test.js

# Run with custom configuration
node src/tests/e2e/test-runner.js --timeout 60000 --retries 3 --parallel

# List available test suites
node src/tests/e2e/test-runner.js --list

# Show help
node src/tests/e2e/test-runner.js --help
```

### Test Runner Options

| Option | Description | Default |
|--------|-------------|---------|
| `--timeout <ms>` | Set test timeout in milliseconds | 30000 |
| `--retries <n>` | Number of retries for flaky tests | 2 |
| `--parallel` | Run tests in parallel | false |
| `--no-coverage` | Disable coverage reporting | true |
| `--reporter <type>` | Set test reporter type | verbose |
| `--suite <file>` | Run specific test suite | all |
| `--list` | List available test suites | - |
| `--help` | Show help message | - |

## Test Configuration

### Timeouts

- **Short timeout**: 1000ms - For quick operations
- **Medium timeout**: 5000ms - For standard operations
- **Long timeout**: 10000ms - For complex operations
- **Very long timeout**: 30000ms - For batch processing

### Mock Data

The tests use comprehensive mock data including:

```javascript
const testFiles = {
  document: {
    pdf: TestUtils.createMockFile('test.pdf', 'application/pdf', 1024),
    docx: TestUtils.createMockFile('test.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 2048),
    txt: TestUtils.createMockFile('test.txt', 'text/plain', 512)
  },
  image: {
    jpg: TestUtils.createMockFile('test.jpg', 'image/jpeg', 1024),
    png: TestUtils.createMockFile('test.png', 'image/png', 1536),
    webp: TestUtils.createMockFile('test.webp', 'image/webp', 768)
  },
  audio: {
    mp3: TestUtils.createMockFile('test.mp3', 'audio/mpeg', 2048),
    wav: TestUtils.createMockFile('test.wav', 'audio/wav', 3072),
    flac: TestUtils.createMockFile('test.flac', 'audio/flac', 4096)
  },
  video: {
    mp4: TestUtils.createMockFile('test.mp4', 'video/mp4', 5120),
    mov: TestUtils.createMockFile('test.mov', 'video/quicktime', 6144),
    avi: TestUtils.createMockFile('test.avi', 'video/x-msvideo', 4096)
  }
};
```

### Mock Services

The tests mock the following services:

- **UnifiedConversionService** - Main conversion service
- **JobQueue** - Job queue management
- **QueueManager** - High-level queue operations
- **Electron API** - IPC communication

## Test Patterns

### User Interaction Testing

```javascript
// Setup user event
const user = userEvent.setup();

// Select file
const fileInput = screen.getByTestId('file-input');
await user.upload(fileInput, testFile);

// Select output format
const formatSelect = screen.getByDisplayValue('Select output format');
await user.selectOptions(formatSelect, 'pdf');

// Configure settings
const qualityInput = screen.getByTestId('quality-setting');
await user.clear(qualityInput);
await user.type(qualityInput, '85');

// Start conversion
const convertButton = screen.getByText('Convert Files');
await user.click(convertButton);
```

### Error Handling Testing

```javascript
// Mock error response
const mockError = mockConversionError('PROCESSING_FAILED', 'Conversion failed');
mockElectronAPI.invoke.mockResolvedValue(mockError);

// Verify error display
await waitFor(() => {
  expect(screen.getByText('Processing Failed')).toBeInTheDocument();
  expect(screen.getByText('Conversion failed')).toBeInTheDocument();
});

// Verify recovery options
expect(screen.getByText('Retry')).toBeInTheDocument();
expect(screen.getByText('Manual Intervention')).toBeInTheDocument();
```

### Progress Tracking Testing

```javascript
// Mock progress updates
let progressCallback;
mockElectronAPI.invoke.mockImplementation((channel, options) => {
  if (channel === 'convert-file') {
    progressCallback = options.progressCallback;
    return Promise.resolve(mockConversionSuccess('/output/converted'));
  }
  return Promise.resolve({ success: true });
});

// Simulate progress updates
await act(async () => {
  if (progressCallback) {
    progressCallback(25); // 25% progress
    progressCallback(50); // 50% progress
    progressCallback(100); // 100% progress
  }
});

// Verify progress display
await waitFor(() => {
  expect(screen.getByText('100%')).toBeInTheDocument();
});
```

## Test Reports

### Coverage Reports

Coverage reports are generated in the `src/tests/coverage/e2e/` directory and include:

- **Line coverage** - Percentage of code lines executed
- **Branch coverage** - Percentage of code branches executed
- **Function coverage** - Percentage of functions called
- **Statement coverage** - Percentage of statements executed

### Test Reports

Detailed test reports are saved to `src/tests/coverage/e2e/e2e-test-report.json` and include:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "configuration": {
    "TIMEOUT": 30000,
    "RETRIES": 2,
    "COVERAGE": true
  },
  "summary": {
    "total": 2,
    "passed": 2,
    "failed": 0,
    "duration": 45000
  },
  "results": [
    {
      "testFile": "conversion-e2e.test.js",
      "success": true,
      "attempts": 1,
      "output": "..."
    }
  ]
}
```

### Log Files

Test execution logs are saved to `src/tests/logs/e2e-tests.log` and include:

- Test execution timestamps
- Success/failure status
- Error messages
- Performance metrics

## Best Practices

### Test Organization

1. **Group related tests** - Use describe blocks to group related tests
2. **Clear test names** - Use descriptive test names that explain the scenario
3. **Setup and teardown** - Use beforeEach and afterEach for common setup
4. **Mock isolation** - Reset mocks between tests to prevent interference

### Test Reliability

1. **Use waitFor** - Always use waitFor for asynchronous operations
2. **Handle timeouts** - Set appropriate timeouts for different operations
3. **Retry flaky tests** - Use retry mechanism for potentially flaky tests
4. **Clean up resources** - Ensure proper cleanup after tests

### Test Data Management

1. **Use mock data** - Create comprehensive mock data for different scenarios
2. **Validate inputs** - Test with various input types and sizes
3. **Edge cases** - Include tests for edge cases and error conditions
4. **Realistic scenarios** - Test with realistic file sizes and types

### Performance Considerations

1. **Parallel execution** - Run tests in parallel when possible
2. **Resource cleanup** - Clean up resources to prevent memory leaks
3. **Timeout management** - Set appropriate timeouts for different operations
4. **Mock optimization** - Use efficient mocks to reduce test execution time

## Troubleshooting

### Common Issues

1. **Test timeouts** - Increase timeout values for slow operations
2. **Mock failures** - Ensure mocks are properly reset between tests
3. **Async operations** - Use waitFor for all asynchronous operations
4. **File system issues** - Ensure proper file system mocking

### Debugging

1. **Verbose output** - Use `--verbose` flag for detailed output
2. **Single test execution** - Run individual tests for debugging
3. **Mock inspection** - Check mock calls to verify behavior
4. **Log analysis** - Review test logs for error details

### Performance Optimization

1. **Parallel execution** - Enable parallel test execution
2. **Mock optimization** - Use lightweight mocks
3. **Resource management** - Properly clean up resources
4. **Test isolation** - Ensure tests don't interfere with each other

## Continuous Integration

### CI/CD Integration

The E2E tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run E2E Tests
  run: |
    npm install
    npm run test:e2e -- --timeout 60000 --retries 3
```

### Reporting

Test results can be integrated with reporting tools:

- **Coverage reports** - Upload to coverage services
- **Test results** - Parse JSON reports for dashboards
- **Logs** - Archive logs for debugging
- **Artifacts** - Save test artifacts for analysis

## Future Enhancements

### Planned Improvements

1. **Visual regression testing** - Add visual comparison tests
2. **Performance testing** - Add performance benchmarks
3. **Accessibility testing** - Add accessibility compliance tests
4. **Cross-platform testing** - Test on different platforms
5. **Load testing** - Test with large file batches

### Test Expansion

1. **More file formats** - Add tests for additional file formats
2. **Advanced scenarios** - Test complex conversion scenarios
3. **Integration tests** - Test with real conversion engines
4. **User workflow tests** - Test complete user workflows

## Conclusion

The E2E testing suite provides comprehensive coverage of the file conversion application's functionality. By following the patterns and best practices outlined in this guide, you can ensure reliable and maintainable tests that catch issues early in the development process.

For questions or issues with the testing suite, refer to the test logs and reports for detailed information about test execution and failures.
