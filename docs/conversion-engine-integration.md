# Conversion Engine Integration

This document describes the integration of all conversion engines (document, image, audio, video) into the UI through a unified interface.

## Overview

The conversion engine integration provides a seamless experience for users to convert files across different media types using a single, unified interface. The system automatically detects file types and routes conversions to the appropriate specialized engines while maintaining a consistent user experience.

## Architecture

### Core Components

1. **UnifiedConversionService** (`src/shared/services/UnifiedConversionService.js`)
   - Central service that coordinates all conversion types
   - Handles file type detection and routing
   - Manages batch conversions and progress tracking
   - Provides unified error handling and statistics

2. **UnifiedConverter Component** (`src/renderer/components/UnifiedConverter.js`)
   - React component providing the unified UI interface
   - Auto-detects file types and categories
   - Dynamically adjusts format options based on detected types
   - Handles mixed file type scenarios

3. **Updated IPC Handlers** (`src/shared/ipc/mainHandlers.js`)
   - Modified to use the unified conversion service
   - Supports the new conversion options structure
   - Maintains backward compatibility

## Features

### Automatic File Type Detection

The system automatically detects file types based on file extensions:

- **Documents**: PDF, DOCX, DOC, TXT, RTF, ODT
- **Images**: JPG, JPEG, PNG, WEBP, GIF, BMP, TIFF, SVG
- **Audio**: MP3, WAV, FLAC, AAC, OGG, M4A
- **Video**: MP4, MOV, AVI, MKV, WEBM, WMV

### Smart Format Selection

- **Single Type**: When all files are the same type, shows only relevant format options
- **Mixed Types**: When files are of different types, shows all format options grouped by category
- **Dynamic UI**: Format dropdown adapts based on detected file types

### Unified Conversion Process

1. **File Selection**: Users can drag and drop or select files of any supported type
2. **Type Detection**: System automatically detects and categorizes files
3. **Format Selection**: Users choose output format(s) from dynamically populated options
4. **Settings Configuration**: Conversion settings adapt based on file types
5. **Batch Processing**: All files are converted using the appropriate engines
6. **Progress Tracking**: Real-time progress updates across all conversion types
7. **Result Summary**: Comprehensive results with success/failure statistics

## Usage

### Basic Usage

1. Open the "Universal" tab in the application
2. Drag and drop files or click to select files
3. The system will automatically detect file types and show a category badge
4. Select your desired output format from the dropdown
5. Configure any conversion settings if needed
6. Click "Convert Files" to start the conversion process

### Advanced Features

#### Mixed File Types

When you select files of different types (e.g., images and documents), the system will:

- Show "Mixed File Types" as the detected category
- Display format options grouped by category in the dropdown
- Apply appropriate settings for each file type during conversion

#### Batch Processing

- Convert multiple files simultaneously
- Progress tracking for each file
- Detailed results showing success/failure for each conversion
- Ability to retry failed conversions

#### Settings Reuse

- Save and reuse conversion settings from previous jobs
- Apply presets for specific conversion scenarios
- Maintain consistent quality settings across conversions

## Technical Implementation

### Service Integration

The `UnifiedConversionService` integrates with existing conversion engines:

```javascript
// Document conversions
const { convertPDFToDOCX, convertDOCXToPDF } = require('../utils/PDFToDOCXWrapper');

// Image conversions
const { getSharpService } = require('./SharpService');

// Audio conversions
const audioConversionService = require('../../main/services/audioConversionService');

// Video conversions
const videoConversionService = require('../../main/services/videoConversionService');
```

### Event Handling

The service provides comprehensive event handling:

```javascript
service.on('conversion-started', (data) => {
  // Handle conversion start
});

service.on('conversion-progress', (data) => {
  // Update progress UI
});

service.on('conversion-completed', (data) => {
  // Handle successful completion
});

service.on('conversion-error', (data) => {
  // Handle conversion errors
});
```

### Error Handling

- **File Type Errors**: Invalid or unsupported file types
- **Conversion Errors**: Engine-specific conversion failures
- **System Errors**: Resource allocation and permission issues
- **User Cancellation**: Graceful handling of user-initiated cancellations

## Configuration

### Supported Formats

Each conversion type supports specific input and output formats:

#### Documents
- **Input**: PDF, DOCX, DOC, TXT, RTF, ODT
- **Output**: PDF, DOCX, DOC, TXT, RTF, ODT

#### Images
- **Input**: JPG, JPEG, PNG, WEBP, GIF, BMP, TIFF, SVG
- **Output**: JPG, JPEG, PNG, WEBP, GIF, BMP, TIFF, SVG

#### Audio
- **Input**: MP3, WAV, FLAC, AAC, OGG, M4A
- **Output**: MP3, WAV, FLAC, AAC, OGG, M4A

#### Video
- **Input**: MP4, MOV, AVI, MKV, WEBM, WMV
- **Output**: MP4, MOV, AVI, MKV, WEBM, WMV

### Quality Settings

Each conversion type supports quality-specific settings:

- **Documents**: DPI, page size, orientation
- **Images**: Resolution, compression, color space
- **Audio**: Bitrate, sample rate, channels
- **Video**: Frame rate, codec, quality preset

## Performance Considerations

### Resource Management

- **Concurrent Conversions**: Limited to 3 simultaneous conversions by default
- **Memory Usage**: Monitored and managed per conversion type
- **Disk Space**: Temporary workspace management for large files
- **CPU Usage**: Resource allocation based on conversion complexity

### Optimization

- **Caching**: Conversion results cached to avoid redundant processing
- **Batch Processing**: Efficient handling of multiple files
- **Progress Tracking**: Real-time updates without performance impact
- **Error Recovery**: Graceful handling of partial failures

## Testing

### Unit Tests

Comprehensive test suite covering:

- File type detection accuracy
- Format validation
- Error handling scenarios
- Performance benchmarks
- Integration testing

### Manual Testing

Test scenarios include:

1. **Single File Conversion**: Convert individual files of each type
2. **Batch Conversion**: Convert multiple files of the same type
3. **Mixed Type Conversion**: Convert files of different types together
4. **Error Scenarios**: Test with invalid files, unsupported formats
5. **Performance Testing**: Large files, multiple concurrent conversions

## Future Enhancements

### Planned Features

1. **Format Detection**: Automatic format detection beyond file extensions
2. **Quality Presets**: Pre-configured quality settings for common use cases
3. **Batch Templates**: Save and reuse batch conversion configurations
4. **Advanced Filtering**: Filter files by type, size, or other criteria
5. **Conversion History**: Detailed history of all conversions with metadata

### Performance Improvements

1. **Parallel Processing**: Enhanced concurrent conversion capabilities
2. **Streaming**: Real-time conversion for large files
3. **Compression**: Optimized compression algorithms
4. **Hardware Acceleration**: GPU acceleration for video conversions

## Troubleshooting

### Common Issues

1. **File Type Not Detected**: Check file extension and ensure it's supported
2. **Conversion Fails**: Verify file integrity and available disk space
3. **Slow Performance**: Check system resources and concurrent conversion limits
4. **Format Not Available**: Ensure the target format is supported for the file type

### Debug Information

Enable debug logging to get detailed information about conversion processes:

```javascript
// Enable debug logging
logger.setLevel('debug');
```

## API Reference

### UnifiedConversionService Methods

- `convertFiles(options)`: Main conversion method
- `detectFileType(filePath)`: Detect file type from path
- `getSupportedFormats(fileType)`: Get supported formats for type
- `getStats()`: Get conversion statistics
- `cancelConversions(conversionId)`: Cancel active conversions

### Component Props

- `onFilesSelected`: Callback for file selection
- `onConversionComplete`: Callback for conversion completion
- `onError`: Callback for error handling
- `settings`: Conversion settings object
- `presets`: Available conversion presets

## Contributing

When adding new conversion types or formats:

1. Update the file type detection logic
2. Add format support to the appropriate conversion engine
3. Update the UI components to handle the new type
4. Add comprehensive tests
5. Update documentation

## License

This integration is part of the Convert application and follows the same licensing terms.
