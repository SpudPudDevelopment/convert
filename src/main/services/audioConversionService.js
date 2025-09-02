const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const ffmpegService = require('./ffmpegService');

class AudioConversionService {
  constructor() {
    this.ffmpegService = ffmpegService;
    this.supportedFormats = ['mp3', 'wav', 'aac', 'flac', 'ogg'];
    this.formatMimeTypes = {
      mp3: ['audio/mpeg', 'audio/mp3'],
      wav: ['audio/wav', 'audio/wave', 'audio/x-wav'],
      aac: ['audio/aac', 'audio/x-aac'],
      flac: ['audio/flac', 'audio/x-flac'],
      ogg: ['audio/ogg', 'application/ogg']
    };

    // Resource management
    this.maxConcurrentConversions = 3;
    this.activeConversions = new Set();
    this.conversionQueue = [];
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    
    // Memory and performance monitoring
    this.memoryThreshold = 1024 * 1024 * 1024; // 1GB
    this.performanceMetrics = {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      averageConversionTime: 0
    };
    // Quality presets for different use cases
    this.qualityPresets = {
      low: { name: 'Low Quality (Small File)', description: 'Optimized for file size' },
      medium: { name: 'Medium Quality (Balanced)', description: 'Good balance of quality and size' },
      high: { name: 'High Quality (Large File)', description: 'Optimized for audio quality' },
      lossless: { name: 'Lossless (Largest File)', description: 'No quality loss' }
    };

    // Default settings for each format with quality presets
    this.defaultSettings = {
      mp3: {
        codec: 'libmp3lame',
        bitrate: '192k',
        sampleRate: 44100,
        channels: 2,
        quality: 2, // VBR quality (0-9, lower is better)
        vbr: false,
        presets: {
          low: { bitrate: '96k', quality: 7, vbr: true },
          medium: { bitrate: '192k', quality: 2, vbr: false },
          high: { bitrate: '320k', quality: 0, vbr: false },
          lossless: { codec: 'flac' } // Redirect to FLAC for lossless
        }
      },
      wav: {
        codec: 'pcm_s16le',
        bitrate: null, // WAV doesn't use bitrate
        sampleRate: 44100,
        channels: 2,
        format: 'wav',
        presets: {
          low: { codec: 'pcm_s16le', sampleRate: 22050 },
          medium: { codec: 'pcm_s16le', sampleRate: 44100 },
          high: { codec: 'pcm_s24le', sampleRate: 48000 },
          lossless: { codec: 'pcm_s32le', sampleRate: 96000 }
        }
      },
      aac: {
        codec: 'aac',
        bitrate: '128k',
        sampleRate: 44100,
        channels: 2,
        vbr: false,
        presets: {
          low: { bitrate: '64k', vbr: true },
          medium: { bitrate: '128k', vbr: false },
          high: { bitrate: '256k', vbr: false },
          lossless: { codec: 'flac' } // Redirect to FLAC for lossless
        }
      },
      flac: {
        codec: 'flac',
        bitrate: null, // FLAC is lossless
        sampleRate: 44100,
        channels: 2,
        compressionLevel: 5,
        presets: {
          low: { compressionLevel: 0, sampleRate: 44100 },
          medium: { compressionLevel: 5, sampleRate: 44100 },
          high: { compressionLevel: 8, sampleRate: 48000 },
          lossless: { compressionLevel: 8, sampleRate: 96000 }
        }
      },
      ogg: {
        codec: 'libvorbis',
        bitrate: '192k',
        sampleRate: 44100,
        channels: 2,
        quality: 6, // VBR quality (0-10, higher is better)
        vbr: true,
        presets: {
          low: { quality: 2, vbr: true },
          medium: { quality: 6, vbr: true },
          high: { quality: 9, vbr: true },
          lossless: { codec: 'flac' } // Redirect to FLAC for lossless
        }
      }
    };
    this.conversionPipelines = this.initializeConversionPipelines();
  }

  /**
   * Initialize the audio conversion service
   */
  async initialize() {
    try {
      if (!ffmpegService.isReady()) {
        await ffmpegService.initialize();
      }
      console.log('Audio conversion service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize audio conversion service:', error);
      throw error;
    }
  }

  /**
   * Initialize conversion pipelines for all format combinations
   */
  initializeConversionPipelines() {
    const pipelines = {};
    
    this.supportedFormats.forEach(inputFormat => {
      pipelines[inputFormat] = {};
      this.supportedFormats.forEach(outputFormat => {
        if (inputFormat !== outputFormat) {
          pipelines[inputFormat][outputFormat] = this.createConversionPipeline(inputFormat, outputFormat);
        }
      });
    });
    
    return pipelines;
  }

  /**
   * Create a specific conversion pipeline for input/output format combination
   */
  createConversionPipeline(inputFormat, outputFormat) {
    return {
      name: `${inputFormat}_to_${outputFormat}`,
      inputFormat,
      outputFormat,
      validate: (inputPath, outputPath) => this.validateConversionPair(inputFormat, outputFormat, inputPath, outputPath),
      buildArgs: (inputPath, outputPath, settings) => this.buildPipelineArgs(inputFormat, outputFormat, inputPath, outputPath, settings)
    };
  }

  /**
   * Convert audio file to specified format using unified pipeline interface
   */
  async convertAudio(inputPath, outputPath, options = {}) {
    const startTime = Date.now();
    this.performanceMetrics.totalConversions++;
    
    try {
      // Validate input file and detect format
      await this.validateInputFile(inputPath);
      const inputFormat = await this.detectAudioFormat(inputPath);
      
      // Get output format from file extension
      const outputFormat = this.getFormatFromPath(outputPath);
      if (!this.supportedFormats.includes(outputFormat)) {
        throw new Error(`Unsupported output format: ${outputFormat}`);
      }

      // Check if conversion is needed
       if (inputFormat === outputFormat) {
         console.log('Input and output formats are the same, copying file...');
         await fs.copyFile(inputPath, outputPath);
         return {
           success: true,
           inputPath,
           outputPath,
           format: outputFormat,
           copied: true
         };
       }

      // Get conversion pipeline
      const pipeline = this.getConversionPipeline(inputFormat, outputFormat);
      
      // Validate conversion pair
      await pipeline.validate(inputPath, outputPath);

      // Merge with default settings
      const defaultSettings = this.getDefaultSettings(outputFormat);
      let mergedSettings = { ...defaultSettings, ...options };

      // Apply quality preset if specified
      if (options.preset) {
        mergedSettings = this.applyQualityPreset(mergedSettings, outputFormat, options.preset);
      }

      // Validate settings
      const validationErrors = this.validateAudioSettings(mergedSettings, outputFormat);
      if (validationErrors.length > 0) {
        throw new Error(`Invalid audio settings: ${validationErrors.join(', ')}`);
      }

      const settings = mergedSettings;

      // Get input file metadata for better progress estimation
      const inputInfo = await this.getAudioInfo(inputPath);
      const totalDuration = inputInfo.duration || 0;

      // Build FFmpeg arguments using pipeline
      const args = pipeline.buildArgs(inputPath, outputPath, settings);

      // Add enhanced metadata preservation
      this.addMetadataPreservation(args, settings);
      
      console.log('Starting audio conversion:', {
        input: inputPath,
        output: outputPath,
        inputFormat,
        outputFormat,
        pipeline: pipeline.name,
        settings
      });

      // Track conversion start time for progress estimation
       this.conversionStartTime = Date.now();

       // Execute conversion with enhanced progress tracking
       const result = await ffmpegService.executeFFmpeg(args, {
         onProgress: (progress) => {
           if (options.onProgress) {
             const enhancedProgress = this.calculateEnhancedProgress(progress, totalDuration, inputInfo);
             options.onProgress(enhancedProgress);
           }
         }
       });

      // Verify output file was created
      await this.validateOutputFile(outputPath);
      
      // Update performance metrics
      const conversionTime = Date.now() - startTime;
      this.performanceMetrics.successfulConversions++;
      this.performanceMetrics.averageConversionTime = 
        (this.performanceMetrics.averageConversionTime * (this.performanceMetrics.successfulConversions - 1) + conversionTime) / 
        this.performanceMetrics.successfulConversions;
      
      console.log('Audio conversion completed successfully');
      return {
        success: true,
        inputPath,
        outputPath,
        inputFormat,
        outputFormat,
        pipeline: pipeline.name,
        settings,
        conversionTime
      };
    } catch (error) {
      this.performanceMetrics.failedConversions++;
      const detailedError = this.createDetailedError(
        `Audio conversion failed: ${error.message}`,
        'CONVERSION_FAILED',
        {
          inputPath,
          outputPath,
          inputFormat: await this.detectAudioFormat(inputPath).catch(() => 'unknown'),
          outputFormat: this.getFormatFromPath(outputPath),
          conversionTime: Date.now() - startTime
        }
      );
      console.error('Audio conversion failed:', detailedError);
      throw detailedError;
    }
  }

  /**
   * Build FFmpeg arguments for conversion
   */
  buildFFmpegArgs(inputPath, outputPath, format, settings) {
    const args = [
      '-i', inputPath,
      '-y' // Overwrite output file
    ];

    // Add codec
    if (settings.codec) {
      args.push('-c:a', settings.codec);
    }

    // Handle VBR vs CBR encoding
    if (format === 'mp3') {
      if (settings.vbr && settings.quality !== undefined) {
        // VBR mode with quality setting
        args.push('-q:a', settings.quality.toString());
      } else if (settings.bitrate) {
        // CBR mode with bitrate
        args.push('-b:a', settings.bitrate);
      }
    } else if (format === 'aac') {
      if (settings.vbr && settings.quality !== undefined) {
        // VBR mode for AAC
        args.push('-vbr', settings.quality.toString());
      } else if (settings.bitrate) {
        // CBR mode
        args.push('-b:a', settings.bitrate);
      }
    } else if (format === 'ogg') {
      if (settings.quality !== undefined) {
        // OGG Vorbis uses quality-based encoding by default
        args.push('-q:a', settings.quality.toString());
      } else if (settings.bitrate) {
        // Managed bitrate mode
        args.push('-b:a', settings.bitrate);
      }
    } else {
      // For other formats, use bitrate if available
      if (settings.bitrate) {
        args.push('-b:a', settings.bitrate);
      }
    }

    // Add sample rate
    if (settings.sampleRate) {
      args.push('-ar', settings.sampleRate.toString());
    }

    // Add channels
    if (settings.channels) {
      args.push('-ac', settings.channels.toString());
    }

    // Format-specific settings
    switch (format) {
      case 'wav':
        // WAV format specification
        args.push('-f', 'wav');
        break;
      case 'aac':
        // AAC profile
        if (settings.profile) {
          args.push('-profile:a', settings.profile);
        }
        break;
      case 'flac':
        // FLAC compression level
        if (settings.compressionLevel !== undefined) {
          args.push('-compression_level', settings.compressionLevel.toString());
        }
        break;
    }

    // Add metadata preservation
    args.push('-map_metadata', '0');
    
    // Output file
    args.push(outputPath);

    return args;
  }

  /**
   * Get audio file information
   */
  async getAudioInfo(filePath) {
    try {
      await this.validateInputFile(filePath);
      return await ffmpegService.getAudioInfo(filePath);
    } catch (error) {
      throw new Error(`Failed to get audio info: ${error.message}`);
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  /**
   * Get available conversion pipelines
   */
  getAvailablePipelines() {
    const pipelines = [];
    Object.keys(this.conversionPipelines).forEach(inputFormat => {
      Object.keys(this.conversionPipelines[inputFormat]).forEach(outputFormat => {
        pipelines.push({
          name: this.conversionPipelines[inputFormat][outputFormat].name,
          inputFormat,
          outputFormat,
          description: `Convert ${inputFormat.toUpperCase()} to ${outputFormat.toUpperCase()}`
        });
      });
    });
    return pipelines;
  }

  /**
   * Check if conversion is supported
   */
  isConversionSupported(inputFormat, outputFormat) {
    return this.supportedFormats.includes(inputFormat) && 
           this.supportedFormats.includes(outputFormat) &&
           inputFormat !== outputFormat;
  }

  /**
   * Get default settings for a format
   */
  getDefaultSettings(format) {
    if (!this.supportedFormats.includes(format)) {
      throw new Error(`Unsupported format: ${format}`);
    }
    return { ...this.defaultSettings[format] };
  }

  /**
   * Get quality presets
   */
  getQualityPresets() {
    return this.qualityPresets;
  }

  /**
   * Get preset settings for a format and quality preset
   */
  getPresetSettings(format, preset) {
    const formatSettings = this.defaultSettings[format];
    if (!formatSettings || !formatSettings.presets || !formatSettings.presets[preset]) {
      return null;
    }
    return { ...formatSettings, ...formatSettings.presets[preset] };
  }

  /**
   * Apply quality preset to settings
   */
  applyQualityPreset(settings, format, preset) {
    const presetSettings = this.getPresetSettings(format, preset);
    if (!presetSettings) {
      throw new Error(`Invalid preset '${preset}' for format '${format}'`);
    }
    return { ...settings, ...presetSettings };
  }

  /**
   * Validate audio settings
   */
  validateAudioSettings(settings, format) {
    const errors = [];
    const formatDefaults = this.defaultSettings[format];
    
    if (!formatDefaults) {
      errors.push(`Unsupported format: ${format}`);
      return errors;
    }

    // Validate bitrate
    if (settings.bitrate && !this.isValidBitrate(settings.bitrate, format)) {
      errors.push(`Invalid bitrate '${settings.bitrate}' for format '${format}'`);
    }

    // Validate sample rate
    if (settings.sampleRate && !this.isValidSampleRate(settings.sampleRate)) {
      errors.push(`Invalid sample rate: ${settings.sampleRate}`);
    }

    // Validate channels
    if (settings.channels && !this.isValidChannels(settings.channels)) {
      errors.push(`Invalid channel count: ${settings.channels}`);
    }

    // Validate VBR settings
    if (settings.vbr !== undefined && !this.supportsVBR(format)) {
      errors.push(`VBR not supported for format: ${format}`);
    }

    // Validate quality settings
    if (settings.quality !== undefined && !this.isValidQuality(settings.quality, format)) {
      errors.push(`Invalid quality setting '${settings.quality}' for format '${format}'`);
    }

    return errors;
  }

  /**
   * Check if bitrate is valid for format
   */
  isValidBitrate(bitrate, format) {
    const validBitrates = {
      mp3: ['32k', '64k', '96k', '128k', '160k', '192k', '224k', '256k', '320k'],
      aac: ['32k', '64k', '96k', '128k', '160k', '192k', '224k', '256k', '320k'],
      ogg: ['32k', '64k', '96k', '128k', '160k', '192k', '224k', '256k', '320k']
    };
    return validBitrates[format] ? validBitrates[format].includes(bitrate) : true;
  }

  /**
   * Check if sample rate is valid
   */
  isValidSampleRate(sampleRate) {
    const validRates = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 176400, 192000];
    return validRates.includes(parseInt(sampleRate));
  }

  /**
   * Check if channel count is valid
   */
  isValidChannels(channels) {
    return Number.isInteger(channels) && channels >= 1 && channels <= 8;
  }

  /**
   * Check if format supports VBR
   */
  supportsVBR(format) {
    return ['mp3', 'aac', 'ogg'].includes(format);
  }

  /**
   * Check if quality setting is valid for format
   */
  isValidQuality(quality, format) {
    const qualityRanges = {
      mp3: { min: 0, max: 9 }, // Lower is better
      ogg: { min: 0, max: 10 }, // Higher is better
      flac: { min: 0, max: 8 } // Compression level
    };
    
    const range = qualityRanges[format];
    if (!range) return true; // Format doesn't use quality settings
    
    return Number.isInteger(quality) && quality >= range.min && quality <= range.max;
  }

  /**
   * Validate input file exists and is readable
   */
  async validateInputFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error('Input path is not a file');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Input file does not exist');
      }
      throw error;
    }
  }

  /**
   * Validate output file was created successfully
   */
  async validateOutputFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || stats.size === 0) {
        throw new Error('Output file was not created or is empty');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Output file was not created');
      }
      throw error;
    }
  }

  /**
   * Get conversion pipeline for input/output format combination
   */
  getConversionPipeline(inputFormat, outputFormat) {
    if (!this.conversionPipelines[inputFormat] || !this.conversionPipelines[inputFormat][outputFormat]) {
      throw new Error(`No conversion pipeline available for ${inputFormat} to ${outputFormat}`);
    }
    return this.conversionPipelines[inputFormat][outputFormat];
  }

  /**
   * Detect audio format from file
   */
  async detectAudioFormat(filePath) {
    try {
      // First try by extension
      const extFormat = this.getFormatFromPath(filePath);
      if (this.supportedFormats.includes(extFormat)) {
        // Verify with FFmpeg probe
        const audioInfo = await this.getAudioInfo(filePath);
        if (audioInfo && audioInfo.codec) {
          return this.mapCodecToFormat(audioInfo.codec) || extFormat;
        }
        return extFormat;
      }
      
      // Fallback to FFmpeg detection
      const audioInfo = await this.getAudioInfo(filePath);
      if (audioInfo && audioInfo.codec) {
        return this.mapCodecToFormat(audioInfo.codec);
      }
      
      throw new Error('Unable to detect audio format');
    } catch (error) {
      throw new Error(`Format detection failed: ${error.message}`);
    }
  }

  /**
   * Map FFmpeg codec to format
   */
  mapCodecToFormat(codec) {
    const codecMap = {
      'mp3': 'mp3',
      'mp3float': 'mp3',
      'libmp3lame': 'mp3',
      'pcm_s16le': 'wav',
      'pcm_s24le': 'wav',
      'pcm_s32le': 'wav',
      'aac': 'aac',
      'flac': 'flac',
      'vorbis': 'ogg',
      'libvorbis': 'ogg'
    };
    
    return codecMap[codec.toLowerCase()] || null;
  }

  /**
   * Validate conversion pair
   */
  async validateConversionPair(inputFormat, outputFormat, inputPath, outputPath) {
    // Validate input format is supported
    if (!this.supportedFormats.includes(inputFormat)) {
      throw new Error(`Unsupported input format: ${inputFormat}`);
    }
    
    // Validate output format is supported
    if (!this.supportedFormats.includes(outputFormat)) {
      throw new Error(`Unsupported output format: ${outputFormat}`);
    }
    
    // Validate paths
    await this.validateInputFile(inputPath);
    
    return true;
  }

  /**
   * Build pipeline-specific FFmpeg arguments
   */
  buildPipelineArgs(inputFormat, outputFormat, inputPath, outputPath, settings) {
    const args = ['-i', inputPath, '-y'];
    
    // Add format-specific optimizations
    switch (`${inputFormat}_to_${outputFormat}`) {
      case 'wav_to_mp3':
        args.push('-c:a', 'libmp3lame');
        if (settings.bitrate) args.push('-b:a', settings.bitrate);
        break;
      case 'mp3_to_wav':
        args.push('-c:a', 'pcm_s16le', '-f', 'wav');
        break;
      case 'flac_to_mp3':
        args.push('-c:a', 'libmp3lame');
        if (settings.bitrate) args.push('-b:a', settings.bitrate);
        break;
      case 'mp3_to_flac':
        args.push('-c:a', 'flac');
        break;
      default:
        // Use general conversion logic
        return this.buildFFmpegArgs(inputPath, outputPath, outputFormat, settings);
    }
    
    // Add common settings
    if (settings.sampleRate) args.push('-ar', settings.sampleRate.toString());
    if (settings.channels) args.push('-ac', settings.channels.toString());
    
    // Preserve metadata
    args.push('-map_metadata', '0');
    args.push(outputPath);
    
    return args;
  }

  /**
   * Get format from file path extension
   */
  getFormatFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return ext;
  }

  /**
   * Estimate conversion progress from FFmpeg output
   */
  parseProgress(ffmpegOutput, duration) {
    if (!duration) return null;
    
    // Parse time from FFmpeg output
    const timeMatch = ffmpegOutput.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
    if (!timeMatch) return null;
    
    const currentTime = this.timeToSeconds(timeMatch[1]);
    const totalTime = this.timeToSeconds(duration);
    
    if (totalTime > 0) {
      return Math.min(Math.round((currentTime / totalTime) * 100), 100);
    }
    
    return null;
  }

  /**
   * Convert time string to seconds
   */
  timeToSeconds(timeString) {
    const parts = timeString.split(':');
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Add enhanced metadata preservation to FFmpeg arguments
   */
  addMetadataPreservation(args, settings) {
    // Remove existing metadata mapping if present
    const metadataIndex = args.indexOf('-map_metadata');
    if (metadataIndex !== -1) {
      args.splice(metadataIndex, 2);
    }

    // Add comprehensive metadata preservation
    if (settings.preserveMetadata !== false) {
      // Copy all metadata
      args.push('-map_metadata', '0');
      
      // Preserve album art/cover art
      args.push('-map', '0:v?');
      args.push('-c:v', 'copy');
      
      // Preserve chapters if present
      args.push('-map_chapters', '0');
    }
  }

  /**
   * Calculate enhanced progress information
   */
  calculateEnhancedProgress(progress, totalDuration, inputInfo) {
    const enhancedProgress = {
      percent: progress.percent || 0,
      timeProcessed: progress.time || '00:00:00',
      speed: progress.speed || '0x',
      bitrate: progress.bitrate || '0kbits/s',
      fps: progress.fps || 0,
      frame: progress.frame || 0,
      size: progress.size || '0kB'
    };

    // Calculate more accurate percentage if we have duration info
    if (totalDuration > 0 && progress.time) {
      const currentSeconds = this.timeToSeconds(progress.time);
      const totalSeconds = this.timeToSeconds(totalDuration);
      enhancedProgress.percent = Math.min(Math.round((currentSeconds / totalSeconds) * 100), 100);
    }

    // Add estimated time remaining
    if (enhancedProgress.percent > 0 && progress.speed) {
      const speedMultiplier = parseFloat(progress.speed.replace('x', '')) || 1;
      const remainingPercent = 100 - enhancedProgress.percent;
      const estimatedRemainingMs = (remainingPercent / enhancedProgress.percent) * (Date.now() - (this.conversionStartTime || Date.now())) / speedMultiplier;
      enhancedProgress.estimatedTimeRemaining = this.formatDuration(estimatedRemainingMs / 1000);
    }

    // Add input file information for context
    if (inputInfo) {
      enhancedProgress.inputInfo = {
        duration: inputInfo.duration,
        bitrate: inputInfo.bitrate,
        sampleRate: inputInfo.sampleRate,
        channels: inputInfo.channels,
        codec: inputInfo.codec
      };
    }

    return enhancedProgress;
  }

  /**
    * Format duration in seconds to human readable format
    */
   formatDuration(seconds) {
     const hours = Math.floor(seconds / 3600);
     const minutes = Math.floor((seconds % 3600) / 60);
     const secs = Math.floor(seconds % 60);
     
     if (hours > 0) {
       return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
     } else {
       return `${minutes}:${secs.toString().padStart(2, '0')}`;
     }
   }

   /**
    * Convert audio with retry mechanism
    */
   async convertAudioWithRetry(inputPath, outputPath, options = {}) {
     const maxRetries = options.maxRetries || this.maxRetries;
     let lastError;

     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         console.log(`Conversion attempt ${attempt}/${maxRetries} for ${inputPath}`);
         const result = await this.convertAudio(inputPath, outputPath, options);
         
         // Update success metrics
         this.performanceMetrics.successfulConversions++;
         return result;
       } catch (error) {
         lastError = error;
         console.error(`Conversion attempt ${attempt} failed:`, error.message);
         
         if (attempt < maxRetries) {
           const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
           console.log(`Retrying in ${delay}ms...`);
           await this.sleep(delay);
         }
       }
     }

     // Update failure metrics
     this.performanceMetrics.failedConversions++;
     throw new Error(`Conversion failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
   }

   /**
    * Batch convert multiple audio files
    */
   async convertBatch(conversions, options = {}) {
     const {
       maxConcurrent = this.maxConcurrentConversions,
       onProgress,
       onFileComplete,
       onFileError,
       stopOnError = false
     } = options;

     const results = [];
     const errors = [];
     let completed = 0;

     // Process conversions in batches
     for (let i = 0; i < conversions.length; i += maxConcurrent) {
       const batch = conversions.slice(i, i + maxConcurrent);
       
       const batchPromises = batch.map(async (conversion, index) => {
         const conversionId = `${i + index}`;
         
         try {
           // Check resource limits before starting
           await this.checkResourceLimits();
           
           this.activeConversions.add(conversionId);
           
           const result = await this.convertAudioWithRetry(
             conversion.inputPath,
             conversion.outputPath,
             {
               ...conversion.options,
               onProgress: (progress) => {
                 if (conversion.options?.onProgress) {
                   conversion.options.onProgress(progress);
                 }
               }
             }
           );
           
           completed++;
           results.push({ ...result, index: i + index, success: true });
           
           if (onFileComplete) {
             onFileComplete(result, i + index);
           }
           
           if (onProgress) {
             onProgress({
               completed,
               total: conversions.length,
               percent: Math.round((completed / conversions.length) * 100)
             });
           }
           
           return result;
         } catch (error) {
           completed++;
           const errorResult = { 
             inputPath: conversion.inputPath, 
             outputPath: conversion.outputPath, 
             error: error.message, 
             index: i + index, 
             success: false 
           };
           
           errors.push(errorResult);
           results.push(errorResult);
           
           if (onFileError) {
             onFileError(error, i + index);
           }
           
           if (onProgress) {
             onProgress({
               completed,
               total: conversions.length,
               percent: Math.round((completed / conversions.length) * 100),
               errors: errors.length
             });
           }
           
           if (stopOnError) {
             throw error;
           }
         } finally {
           this.activeConversions.delete(conversionId);
         }
       });
       
       await Promise.all(batchPromises);
     }

     return {
       results,
       errors,
       summary: {
         total: conversions.length,
         successful: results.filter(r => r.success).length,
         failed: errors.length,
         successRate: Math.round((results.filter(r => r.success).length / conversions.length) * 100)
       }
     };
   }

   /**
    * Check system resource limits
    */
   async checkResourceLimits() {
     // Check memory usage
     const memUsage = process.memoryUsage();
     if (memUsage.heapUsed > this.memoryThreshold) {
       // Force garbage collection if available
       if (global.gc) {
         global.gc();
       }
       
       // Wait a bit for memory to be freed
       await this.sleep(100);
       
       const newMemUsage = process.memoryUsage();
       if (newMemUsage.heapUsed > this.memoryThreshold) {
         throw new Error(`Memory usage too high: ${Math.round(newMemUsage.heapUsed / 1024 / 1024)}MB`);
       }
     }

     // Check active conversions limit
     if (this.activeConversions.size >= this.maxConcurrentConversions) {
       throw new Error(`Too many active conversions: ${this.activeConversions.size}/${this.maxConcurrentConversions}`);
     }
   }

   /**
    * Get performance metrics
    */
   getPerformanceMetrics() {
     return {
       ...this.performanceMetrics,
       activeConversions: this.activeConversions.size,
       queuedConversions: this.conversionQueue.length,
       successRate: this.performanceMetrics.totalConversions > 0 
         ? Math.round((this.performanceMetrics.successfulConversions / this.performanceMetrics.totalConversions) * 100)
         : 0
     };
   }

   /**
    * Reset performance metrics
    */
   resetPerformanceMetrics() {
     this.performanceMetrics = {
       totalConversions: 0,
       successfulConversions: 0,
       failedConversions: 0,
       averageConversionTime: 0
     };
   }

   /**
    * Cancel all active conversions
    */
   async cancelAllConversions() {
     const activeIds = Array.from(this.activeConversions);
     console.log(`Cancelling ${activeIds.length} active conversions...`);
     
     // Clear the queue
     this.conversionQueue = [];
     
     // Note: In a real implementation, you'd need to track and cancel
     // the actual FFmpeg processes. This is a simplified version.
     this.activeConversions.clear();
     
     return activeIds.length;
   }

   /**
    * Sleep utility for delays
    */
   sleep(ms) {
     return new Promise(resolve => setTimeout(resolve, ms));
   }

   /**
    * Enhanced error handling with detailed error information
    */
   createDetailedError(message, code, details = {}) {
     const error = new Error(message);
     error.code = code;
     error.details = details;
     error.timestamp = new Date().toISOString();
     return error;
   }
 }

// Export singleton instance
const audioConversionService = new AudioConversionService();
module.exports = audioConversionService;