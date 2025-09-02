# Error Handling and Job Re-queueing Implementation

This document describes the comprehensive error handling and job re-queueing system implemented for the file conversion application.

## Overview

The system provides robust error handling for all conversion types (audio, video, document, image) with automatic recovery strategies and manual job re-queueing capabilities.

## Architecture

### Core Components

1. **ConversionErrorHandler** (`src/shared/services/ConversionErrorHandler.js`)
   - Central error handling service
   - Error classification and severity determination
   - Recovery strategy management
   - Error history tracking

2. **JobQueue** (`src/shared/services/JobQueue.js`)
   - Job processing queue with error handling
   - Job re-queueing functionality
   - Retry mechanism with exponential backoff

3. **QueueManager** (`src/shared/services/QueueManager.js`)
   - High-level queue operations
   - Job validation and management
   - Re-queueing with validation

4. **ErrorHandler UI Component** (`src/renderer/components/ErrorHandler.js`)
   - User-friendly error display
   - Recovery option presentation
   - Manual intervention interface

## Error Types and Classification

### File System Errors
- `FILE_NOT_FOUND`: File doesn't exist
- `FILE_ACCESS_DENIED`: Permission issues
- `FILE_CORRUPTED`: Damaged files
- `FILE_TOO_LARGE`: Size limit exceeded
- `DISK_SPACE_INSUFFICIENT`: Storage issues

### Format Errors
- `UNSUPPORTED_INPUT_FORMAT`: Input format not supported
- `UNSUPPORTED_OUTPUT_FORMAT`: Output format not supported
- `INCOMPATIBLE_FORMATS`: Format conversion not possible
- `FORMAT_DETECTION_FAILED`: Cannot detect file format

### Conversion Engine Errors
- `CONVERSION_ENGINE_ERROR`: General engine failure
- `FFMPEG_ERROR`: FFmpeg-specific errors
- `SHARP_ERROR`: Image processing errors
- `LIBREOFFICE_ERROR`: Document conversion errors
- `PANDOC_ERROR`: Markdown conversion errors

### Processing Errors
- `PROCESSING_TIMEOUT`: Operation timed out
- `MEMORY_LIMIT_EXCEEDED`: Insufficient memory
- `CPU_LIMIT_EXCEEDED`: CPU resource limits
- `CONCURRENT_LIMIT_EXCEEDED`: Too many simultaneous conversions

### Type-Specific Errors

#### Audio Errors
- `AUDIO_CODEC_ERROR`: Codec issues
- `AUDIO_BITRATE_ERROR`: Bitrate problems
- `AUDIO_SAMPLE_RATE_ERROR`: Sample rate issues
- `AUDIO_CHANNEL_ERROR`: Channel configuration problems

#### Video Errors
- `VIDEO_CODEC_ERROR`: Video codec issues
- `VIDEO_FRAME_RATE_ERROR`: Frame rate problems
- `VIDEO_RESOLUTION_ERROR`: Resolution issues
- `VIDEO_BITRATE_ERROR`: Video bitrate problems

#### Document Errors
- `DOCUMENT_PARSE_ERROR`: Parsing failures
- `DOCUMENT_ENCRYPTED`: Encrypted documents
- `DOCUMENT_PASSWORD_REQUIRED`: Password-protected files
- `DOCUMENT_CORRUPTED`: Damaged documents

#### Image Errors
- `IMAGE_CORRUPTED`: Corrupted image files
- `IMAGE_RESOLUTION_TOO_HIGH`: Resolution too high
- `IMAGE_COLOR_SPACE_ERROR`: Color space issues
- `IMAGE_FORMAT_UNSUPPORTED`: Unsupported image format

## Error Severity Levels

### Critical
- Memory limit exceeded
- Disk space insufficient
- File access denied

### High
- File corrupted
- Document encrypted
- Unsupported formats
- Conversion engine errors

### Medium
- Processing timeouts
- Codec errors
- Quality issues

### Low
- User cancellations
- Minor format issues

## Recovery Strategies

### Automatic Recovery
1. **Retry**: Simple retry with same settings
2. **Retry with Different Settings**: Modify quality/parameters
3. **Fallback Format**: Try alternative output format
4. **Reduce Quality**: Lower quality settings
5. **Split File**: Break large files into chunks

### Manual Recovery
1. **Skip File**: Skip problematic files
2. **Manual Intervention**: User action required
3. **Abort Conversion**: Stop entire process

## Job Re-queueing Implementation

### Features
- **Automatic Re-queueing**: Failed jobs automatically re-queued with retry logic
- **Manual Re-queueing**: Users can manually re-queue failed jobs
- **Priority Management**: Re-queued jobs can have different priorities
- **Settings Modification**: Re-queue with modified conversion settings
- **Validation**: Comprehensive validation before re-queueing

### Implementation Details

#### JobQueue.reQueueJob()
```javascript
reQueueJob(jobId, options = {}) {
  // Reset job state
  job.resetForRequeue();
  
  // Update priority if specified
  if (options.priority) {
    job.priority = options.priority;
  }
  
  // Update settings if specified
  if (options.settings) {
    job.settings = { ...job.settings, ...options.settings };
  }
  
  // Add to front of queue for immediate processing
  this.queue.unshift(jobId);
}
```

#### ConversionJob.resetForRequeue()
```javascript
resetForRequeue() {
  // Reset status and timing
  this.status = JobStatus.PENDING;
  this.startedAt = null;
  this.completedAt = null;
  
  // Reset progress
  this.progress = {
    percentage: 0,
    stage: 'queued',
    message: 'Job re-queued for processing'
  };
  
  // Clear error and warnings
  this.error = null;
  this.warnings = [];
}
```

### UI Integration

#### Retry Button Implementation
```javascript
const retryJob = (jobId) => {
  const job = jobs.find(j => j.id === jobId);
  if (job) {
    updateJob(jobId, { 
      status: 'pending', 
      progress: 0, 
      error: null,
      startTime: null 
    });
    
    // Re-queue the job for processing
    if (window.electronAPI && window.electronAPI.retryJob) {
      window.electronAPI.retryJob(jobId).then(result => {
        if (result.success) {
          updateJob(jobId, { 
            status: 'queued',
            queuePosition: result.queuePosition,
            estimatedWaitTime: result.estimatedWaitTime
          });
        } else {
          updateJob(jobId, { 
            status: 'failed',
            error: result.error
          });
        }
      });
    }
  }
};
```

## Error Handling Flow

### 1. Error Detection
```javascript
try {
  const result = await conversionService.convertFormat(inputPath, outputPath, format, options);
  return result;
} catch (error) {
  // Error caught and passed to handler
  const conversionError = this.errorHandler.handleError(error, context);
  return { success: false, error: conversionError };
}
```

### 2. Error Classification
```javascript
classifyError(error, context) {
  const message = error.message.toLowerCase();
  const conversionType = context.conversionType;
  
  // Classify based on error message and context
  if (message.includes('no such file')) {
    return ConversionErrorTypes.FILE_NOT_FOUND;
  }
  // ... more classification logic
}
```

### 3. Recovery Strategy Selection
```javascript
getRecoveryStrategies(type) {
  const strategyMap = {
    [ConversionErrorTypes.FILE_NOT_FOUND]: [RecoveryStrategies.MANUAL_INTERVENTION],
    [ConversionErrorTypes.CONVERSION_ENGINE_ERROR]: [RecoveryStrategies.RETRY, RecoveryStrategies.RETRY_WITH_DIFFERENT_SETTINGS],
    [ConversionErrorTypes.MEMORY_LIMIT_EXCEEDED]: [RecoveryStrategies.REDUCE_QUALITY, RecoveryStrategies.SPLIT_FILE],
    // ... more strategies
  };
  
  return strategyMap[type] || [RecoveryStrategies.MANUAL_INTERVENTION];
}
```

### 4. Recovery Execution
```javascript
async attemptRecovery(error, context) {
  for (const strategy of error.recoveryStrategies) {
    try {
      const result = await this.executeRecoveryStrategy(strategy, error, context);
      if (result.success) {
        return result;
      }
    } catch (recoveryError) {
      console.error(`Recovery strategy ${strategy} failed:`, recoveryError);
    }
  }
  
  return { success: false, error: 'All recovery strategies failed' };
}
```

## UI Error Display

### ErrorHandler Component Features
- **Visual Severity Indicators**: Color-coded error types
- **Detailed Error Information**: Expandable error details
- **Recovery Options**: Context-aware recovery buttons
- **User-Friendly Messages**: Clear, actionable error descriptions
- **Responsive Design**: Works on all screen sizes

### Error Display Example
```
🚨 File Not Found
The specified file could not be found. Please check the file path and try again.

[Show Details] [Manual Intervention] [Abort Conversion]
```

## Configuration Options

### Error Handler Configuration
```javascript
const errorHandler = new ConversionErrorHandler({
  maxRecoveryAttempts: 3,
  enableAutomaticRecovery: true,
  logErrors: true,
  notifyUser: true
});
```

### Queue Configuration
```javascript
const jobQueue = new JobQueue({
  maxConcurrent: 2,
  maxRetries: 3,
  retryDelay: 5000,
  processingTimeout: 30000
});
```

## Best Practices

### Error Handling
1. **Always classify errors**: Use specific error types for better recovery
2. **Provide context**: Include relevant information in error context
3. **Log errors**: Maintain error history for debugging
4. **User feedback**: Show clear, actionable error messages

### Job Re-queueing
1. **Validate before re-queueing**: Ensure job can be re-queued
2. **Reset job state**: Clear previous error information
3. **Update settings**: Allow modification of conversion parameters
4. **Priority management**: Consider job priority for re-queueing

### Recovery Strategies
1. **Start simple**: Try basic retry first
2. **Escalate gradually**: Move to more complex recovery strategies
3. **User involvement**: Request manual intervention when needed
4. **Resource consideration**: Be mindful of system resources

## Testing

### Error Simulation
```javascript
// Test different error types
const testErrors = [
  new Error('No such file or directory'),
  new Error('Permission denied'),
  new Error('FFmpeg error: Invalid codec'),
  new Error('Memory limit exceeded')
];

testErrors.forEach(error => {
  const conversionError = errorHandler.handleError(error, context);
  console.log('Error type:', conversionError.type);
  console.log('Recovery strategies:', conversionError.recoveryStrategies);
});
```

### Re-queueing Tests
```javascript
// Test job re-queueing
const job = new ConversionJob({ sourceFile: 'test.mp4', settings: {} });
job.updateStatus(JobStatus.FAILED);
job.setError(new Error('Test error'));

const success = queue.reQueueJob(job.id, { priority: JobPriority.HIGH });
console.log('Re-queue success:', success);
```

## Monitoring and Analytics

### Error Statistics
```javascript
const stats = errorHandler.getErrorStats();
console.log('Total errors:', stats.total);
console.log('By type:', stats.byType);
console.log('By severity:', stats.bySeverity);
console.log('Retryable errors:', stats.retryable);
```

### Queue Statistics
```javascript
const queueStats = jobQueue.getStats();
console.log('Queue length:', queueStats.queueLength);
console.log('Processing count:', queueStats.processingCount);
console.log('Completed jobs:', queueStats.completedJobs);
console.log('Failed jobs:', queueStats.failedJobs);
```

## Future Enhancements

### Planned Features
1. **Machine Learning**: Predict error likelihood and optimize recovery
2. **Advanced Recovery**: More sophisticated recovery strategies
3. **Batch Recovery**: Handle multiple failed jobs simultaneously
4. **Error Prevention**: Proactive error detection and prevention
5. **Performance Optimization**: Optimize error handling performance

### Integration Opportunities
1. **External Services**: Integrate with external error reporting services
2. **Analytics**: Send error data to analytics platforms
3. **User Feedback**: Collect user feedback on error handling
4. **Automated Testing**: Automated error scenario testing

## Conclusion

The comprehensive error handling and job re-queueing system provides robust, user-friendly error management for the file conversion application. It automatically handles common errors, provides clear feedback to users, and offers multiple recovery options to ensure successful conversions.
