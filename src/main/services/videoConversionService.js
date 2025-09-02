const ffmpegService = require('./ffmpegService');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

class VideoConversionService {
  constructor() {
    this.ffmpegService = ffmpegService;
    this.supportedFormats = ['mp4', 'mov'];
    this.videoCodecs = {
      mp4: ['h264', 'h265', 'mpeg4'],
      mov: ['h264', 'prores', 'mjpeg']
    };
    this.audioCodecs = {
      mp4: ['aac', 'mp3'],
      mov: ['aac', 'pcm_s16le']
    };
    this.formatMimeTypes = {
      mp4: ['video/mp4', 'video/x-msvideo'],
      mov: ['video/quicktime', 'video/x-quicktime']
    };
    
    // Video quality presets
    this.qualityPresets = {
      mp4: {
        low: { videoBitrate: '500k', audioBitrate: '64k', crf: 28 },
        medium: { videoBitrate: '1500k', audioBitrate: '128k', crf: 23 },
        high: { videoBitrate: '3000k', audioBitrate: '192k', crf: 18 },
        ultra: { videoBitrate: '6000k', audioBitrate: '256k', crf: 15 }
      },
      mov: {
        low: { videoBitrate: '800k', audioBitrate: '64k', quality: 'medium' },
        medium: { videoBitrate: '2000k', audioBitrate: '128k', quality: 'high' },
        high: { videoBitrate: '4000k', audioBitrate: '192k', quality: 'max' },
        ultra: { videoBitrate: '8000k', audioBitrate: '256k', quality: 'max' }
      }
    };
    
    // Default settings for each format
    this.defaultSettings = {
      mp4: {
        videoCodec: 'h264',
        audioCodec: 'aac',
        videoBitrate: '1500k',
        audioBitrate: '128k',
        frameRate: null, // preserve original
        resolution: null, // preserve original
        crf: 23, // Constant Rate Factor for quality
        preset: 'medium' // encoding speed vs compression
      },
      mov: {
        videoCodec: 'h264',
        audioCodec: 'aac',
        videoBitrate: '2000k',
        audioBitrate: '128k',
        frameRate: null,
        resolution: null,
        quality: 'high'
      }
    };
    
    // Active conversions for cancellation support
    this.activeConversions = new Map();
  }

  /**
   * Initialize the video conversion service
   */
  async initialize() {
    try {
      if (!this.ffmpegService.isReady()) {
        await this.ffmpegService.initialize();
      }
      console.log('Video conversion service initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize video conversion service:', error);
      throw error;
    }
  }

  /**
   * Get supported video formats
   */
  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  /**
   * Get default settings for a format
   */
  getDefaultSettings(format) {
    const normalizedFormat = format.toLowerCase().replace('.', '');
    return this.defaultSettings[normalizedFormat] || this.defaultSettings.mp4;
  }

  /**
   * Get quality presets for a format
   */
  getQualityPresets(format) {
    const normalizedFormat = format.toLowerCase().replace('.', '');
    return this.qualityPresets[normalizedFormat] || this.qualityPresets.mp4;
  }

  /**
   * Detect video format from file path or content
   */
  async detectVideoFormat(filePath) {
    try {
      // First try by extension
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      if (this.supportedFormats.includes(ext)) {
        return ext;
      }

      // If extension detection fails, use FFmpeg to probe the file
      const videoInfo = await this.getVideoInfo(filePath);
      if (videoInfo && videoInfo.format) {
        const detectedFormat = this.mapContainerToFormat(videoInfo.format);
        if (detectedFormat) {
          return detectedFormat;
        }
      }

      throw new Error(`Unsupported video format: ${ext}`);
    } catch (error) {
      throw new Error(`Failed to detect video format: ${error.message}`);
    }
  }

  /**
   * Map container format to our supported formats
   */
  mapContainerToFormat(container) {
    const containerMap = {
      'mov,mp4,m4a,3gp,3g2,mj2': 'mp4',
      'mov': 'mov',
      'mp4': 'mp4',
      'quicktime': 'mov'
    };
    
    for (const [key, format] of Object.entries(containerMap)) {
      if (container.includes(key)) {
        return format;
      }
    }
    
    return null;
  }

  /**
   * Get video file information using FFmpeg
   */
  async getVideoInfo(inputPath) {
    try {
      const args = [
        '-i', inputPath,
        '-f', 'null',
        '-'
      ];

      const result = await this.ffmpegService.executeFFmpeg(args);
      return this.parseVideoInfo(result.stderr);
    } catch (error) {
      throw new Error(`Failed to get video info: ${error.message}`);
    }
  }

  /**
   * Parse video information from FFmpeg output
   */
  parseVideoInfo(ffmpegOutput) {
    const info = {
      duration: null,
      videoBitrate: null,
      audioBitrate: null,
      resolution: null,
      frameRate: null,
      videoCodec: null,
      audioCodec: null,
      format: null,
      audioChannels: null,
      audioSampleRate: null
    };

    // Parse duration
    const durationMatch = ffmpegOutput.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
    if (durationMatch) {
      info.duration = durationMatch[1];
    }

    // Parse input format
    const formatMatch = ffmpegOutput.match(/Input #0, ([^,]+)/);
    if (formatMatch) {
      info.format = formatMatch[1];
    }

    // Parse video stream info
    const videoMatch = ffmpegOutput.match(/Stream #\d+:\d+.*?: Video: ([^,]+), [^,]*, (\d+x\d+)[^,]*, ([\d.]+) fps/);
    if (videoMatch) {
      info.videoCodec = videoMatch[1];
      info.resolution = videoMatch[2];
      info.frameRate = parseFloat(videoMatch[3]);
    }

    // Parse audio stream info
    const audioMatch = ffmpegOutput.match(/Stream #\d+:\d+.*?: Audio: ([^,]+), (\d+) Hz, ([^,]+), [^,]+, (\d+) kb\/s/);
    if (audioMatch) {
      info.audioCodec = audioMatch[1];
      info.audioSampleRate = parseInt(audioMatch[2]);
      info.audioChannels = audioMatch[3];
      info.audioBitrate = parseInt(audioMatch[4]);
    }

    // Parse overall bitrate
    const bitrateMatch = ffmpegOutput.match(/bitrate: (\d+) kb\/s/);
    if (bitrateMatch) {
      const totalBitrate = parseInt(bitrateMatch[1]);
      if (!info.videoBitrate && info.audioBitrate) {
        info.videoBitrate = totalBitrate - info.audioBitrate;
      }
    }

    return info;
  }

  /**
   * Get format from file path
   */
  getFormatFromPath(filePath) {
    return path.extname(filePath).toLowerCase().replace('.', '');
  }

  /**
   * Validate input video file
   */
  async validateInputFile(inputPath) {
    try {
      // Check if file exists
      await fs.access(inputPath);
      
      // Check if it's a supported format
      const format = await this.detectVideoFormat(inputPath);
      if (!this.supportedFormats.includes(format)) {
        throw new Error(`Unsupported input format: ${format}`);
      }
      
      // Get video info to ensure it's a valid video file
      const videoInfo = await this.getVideoInfo(inputPath);
      if (!videoInfo.videoCodec) {
        throw new Error('No video stream found in input file');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Input file validation failed: ${error.message}`);
    }
  }

  /**
   * Validate output file path
   */
  async validateOutputFile(outputPath) {
    try {
      const outputDir = path.dirname(outputPath);
      
      // Check if output directory exists, create if it doesn't
      try {
        await fs.access(outputDir);
      } catch {
        await fs.mkdir(outputDir, { recursive: true });
      }
      
      // Check if output format is supported
      const format = this.getFormatFromPath(outputPath);
      if (!this.supportedFormats.includes(format)) {
        throw new Error(`Unsupported output format: ${format}`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Output file validation failed: ${error.message}`);
    }
  }

  /**
   * Build FFmpeg arguments for video conversion
   */
  buildFFmpegArgs(inputPath, outputPath, settings = {}, videoInfo = null) {
    const outputFormat = this.getFormatFromPath(outputPath);
    const defaultSettings = this.getDefaultSettings(outputFormat);
    const finalSettings = { ...defaultSettings, ...settings };

    // Validate settings before building arguments
    this.validateVideoSettings(finalSettings);

    const args = ['-i', inputPath];

    // Apply video quality settings (codec, CRF, bitrate, preset)
    this.applyVideoQualitySettings(args, finalSettings);

    // Apply audio stream settings (codec, bitrate, sample rate, channels)
    this.applyAudioStreamSettings(args, finalSettings);

    // Apply frame rate settings
    this.applyFrameRateSettings(args, finalSettings);

    // Apply resolution scaling (with aspect ratio handling)
    if (videoInfo) {
      this.applyResolutionScaling(args, finalSettings, videoInfo);
    } else if (finalSettings.resolution) {
      // Fallback to simple resolution setting if no video info available
      args.push('-s', finalSettings.resolution);
    }

    // Advanced video filters
    if (finalSettings.videoFilters && finalSettings.videoFilters.length > 0) {
      const filterString = finalSettings.videoFilters.join(',');
      if (args.includes('-vf')) {
        // Combine with existing video filters
        const vfIndex = args.indexOf('-vf');
        args[vfIndex + 1] = `${args[vfIndex + 1]},${filterString}`;
      } else {
        args.push('-vf', filterString);
      }
    }

    // Metadata preservation
    args.push('-map_metadata', '0');

    // Copy chapters if present
    args.push('-map_chapters', '0');

    // Advanced encoding options
    if (finalSettings.profile) {
      args.push('-profile:v', finalSettings.profile);
    }

    if (finalSettings.level) {
      args.push('-level', finalSettings.level);
    }

    if (finalSettings.pixelFormat) {
      args.push('-pix_fmt', finalSettings.pixelFormat);
    }

    // GOP (Group of Pictures) settings
    if (finalSettings.gopSize) {
      args.push('-g', finalSettings.gopSize.toString());
    }

    if (finalSettings.keyintMin) {
      args.push('-keyint_min', finalSettings.keyintMin.toString());
    }

    // B-frame settings
    if (finalSettings.bframes !== undefined) {
      args.push('-bf', finalSettings.bframes.toString());
    }

    // Rate control settings
    if (finalSettings.maxrate) {
      args.push('-maxrate', finalSettings.maxrate);
    }

    if (finalSettings.bufsize) {
      args.push('-bufsize', finalSettings.bufsize);
    }

    // Threading
    if (finalSettings.threads) {
      args.push('-threads', finalSettings.threads.toString());
    }

    // Progress reporting
    args.push('-progress', 'pipe:1');

    // Overwrite output file
    args.push('-y');

    // Output file
    args.push(outputPath);

    return args;
  }

  /**
   * Convert time string to seconds
   */
  timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Parse progress from FFmpeg output
   */
  parseProgress(progressData, totalDuration) {
    const lines = progressData.split('\n');
    let currentTime = 0;
    
    for (const line of lines) {
      if (line.startsWith('out_time=')) {
        const timeStr = line.split('=')[1];
        currentTime = this.timeToSeconds(timeStr);
        break;
      }
    }
    
    if (totalDuration > 0) {
      const progress = Math.min((currentTime / totalDuration) * 100, 100);
      return {
        percentage: Math.round(progress * 100) / 100,
        currentTime,
        totalDuration,
        timeRemaining: totalDuration - currentTime
      };
    }
    
    return {
      percentage: 0,
      currentTime,
      totalDuration: 0,
      timeRemaining: 0
    };
  }

  /**
   * Format duration in seconds to readable format
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Convert video between MP4 and MOV formats
   */
  async convertVideo(inputPath, outputPath, options = {}) {
    try {
      console.log('Starting video conversion:', {
        input: inputPath,
        output: outputPath,
        options
      });

      // Validate input and output files
      await this.validateInputFile(inputPath);
      await this.validateOutputFile(outputPath);

      // Detect input format and get video info
      const inputFormat = await this.detectVideoFormat(inputPath);
      const outputFormat = this.getFormatFromPath(outputPath);
      const videoInfo = await this.getVideoInfo(inputPath);

      console.log('Video info:', videoInfo);
      console.log(`Converting from ${inputFormat} to ${outputFormat}`);

      // Check if same format conversion (copy mode)
      if (inputFormat === outputFormat && !options.forceReencode) {
        console.log('Same format detected, using copy mode for faster conversion');
        return await this.copyVideoWithMetadata(inputPath, outputPath, options);
      }

      // Get conversion pipeline for the format pair
      const pipeline = this.getConversionPipeline(inputFormat, outputFormat);
      if (!pipeline) {
        throw new Error(`Conversion from ${inputFormat} to ${outputFormat} is not supported`);
      }

      // Apply settings and build FFmpeg arguments
      const settings = this.applyConversionSettings(pipeline, options, videoInfo);
      const args = this.buildFFmpegArgs(inputPath, outputPath, settings, videoInfo);

      console.log('FFmpeg arguments:', args);

      // Calculate total duration for progress tracking
      const totalDuration = this.timeToSeconds(videoInfo.duration);
      let conversionStartTime = Date.now();

      // Execute conversion with progress tracking
      const result = await this.ffmpegService.executeFFmpeg(args, {
        onProgress: (data) => {
          if (options.onProgress) {
            const progress = this.parseProgress(data, totalDuration);
            const enhancedProgress = this.calculateEnhancedProgress(
              progress,
              conversionStartTime,
              videoInfo
            );
            options.onProgress(enhancedProgress);
          }
        }
      });

      // Validate output file was created successfully
      await this.validateOutputFile(outputPath);

      console.log('Video conversion completed successfully');
      return {
        success: true,
        inputPath,
        outputPath,
        inputFormat,
        outputFormat,
        pipeline: pipeline.name,
        settings,
        videoInfo
      };
    } catch (error) {
      console.error('Video conversion failed:', error);
      throw error;
    }
  }

  /**
   * Copy video with metadata preservation (for same format conversions)
   */
  async copyVideoWithMetadata(inputPath, outputPath, options = {}) {
    const args = [
      '-i', inputPath,
      '-c', 'copy', // Copy streams without re-encoding
      '-map_metadata', '0', // Preserve metadata
      '-y', // Overwrite output
      outputPath
    ];

    const videoInfo = await this.getVideoInfo(inputPath);
    const totalDuration = this.timeToSeconds(videoInfo.duration);
    let conversionStartTime = Date.now();

    await this.ffmpegService.executeFFmpeg(args, {
      onProgress: (data) => {
        if (options.onProgress) {
          const progress = this.parseProgress(data, totalDuration);
          const enhancedProgress = this.calculateEnhancedProgress(
            progress,
            conversionStartTime,
            videoInfo
          );
          options.onProgress(enhancedProgress);
        }
      }
    });

    return {
      success: true,
      inputPath,
      outputPath,
      mode: 'copy',
      videoInfo
    };
  }

  /**
   * Get conversion pipeline for format pair
   */
  getConversionPipeline(inputFormat, outputFormat) {
    const pipelines = {
      'mp4_to_mov': {
        name: 'MP4 to MOV',
        input: 'mp4',
        output: 'mov',
        preferredVideoCodec: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
        preferredAudioCodec: 'aac',
        supportedVideoCodecs: ['libx264', 'libx265', 'h264_videotoolbox', 'hevc_videotoolbox', 'prores'],
        supportedAudioCodecs: ['aac', 'pcm_s16le', 'alac'],
        settings: {
          videoCodec: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
          audioCodec: 'aac',
          videoBitrate: '2000k',
          audioBitrate: '128k',
          movflags: '+faststart',
          pixelFormat: 'yuv420p'
        },
        containerOptions: {
          preserveMetadata: true,
          fastStart: true,
          compatibilityMode: 'quicktime'
        }
      },
      'mov_to_mp4': {
        name: 'MOV to MP4',
        input: 'mov',
        output: 'mp4',
        preferredVideoCodec: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
        preferredAudioCodec: 'aac',
        supportedVideoCodecs: ['libx264', 'libx265', 'h264_videotoolbox', 'hevc_videotoolbox'],
        supportedAudioCodecs: ['aac', 'mp3'],
        settings: {
          videoCodec: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
          audioCodec: 'aac',
          crf: 23,
          preset: 'medium',
          audioBitrate: '128k',
          movflags: '+faststart',
          pixelFormat: 'yuv420p'
        },
        containerOptions: {
          preserveMetadata: true,
          fastStart: true,
          compatibilityMode: 'web'
        }
      },
      'mp4_to_mp4': {
        name: 'MP4 Re-encode',
        input: 'mp4',
        output: 'mp4',
        preferredVideoCodec: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
        preferredAudioCodec: 'aac',
        supportedVideoCodecs: ['libx264', 'libx265', 'h264_videotoolbox', 'hevc_videotoolbox'],
        supportedAudioCodecs: ['aac', 'mp3'],
        settings: {
          videoCodec: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
          audioCodec: 'aac',
          crf: 23,
          preset: 'medium',
          audioBitrate: '128k',
          movflags: '+faststart'
        },
        containerOptions: {
          preserveMetadata: true,
          fastStart: true,
          compatibilityMode: 'web'
        }
      },
      'mov_to_mov': {
        name: 'MOV Re-encode',
        input: 'mov',
        output: 'mov',
        preferredVideoCodec: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
        preferredAudioCodec: 'aac',
        supportedVideoCodecs: ['libx264', 'libx265', 'h264_videotoolbox', 'hevc_videotoolbox', 'prores'],
        supportedAudioCodecs: ['aac', 'pcm_s16le', 'alac'],
        settings: {
          videoCodec: process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
          audioCodec: 'aac',
          videoBitrate: '2000k',
          audioBitrate: '128k',
          pixelFormat: 'yuv420p'
        },
        containerOptions: {
          preserveMetadata: true,
          fastStart: true,
          compatibilityMode: 'quicktime'
        }
      }
    };

    const pipelineKey = `${inputFormat}_to_${outputFormat}`;
    return pipelines[pipelineKey] || null;
  }

  /**
   * Apply conversion settings based on pipeline and user options
   */
  applyConversionSettings(pipeline, options, videoInfo) {
    const settings = { ...pipeline.settings };

    // Apply user-specified settings
    if (options.videoCodec) settings.videoCodec = options.videoCodec;
    if (options.audioCodec) settings.audioCodec = options.audioCodec;
    if (options.videoBitrate) settings.videoBitrate = options.videoBitrate;
    if (options.audioBitrate) settings.audioBitrate = options.audioBitrate;
    if (options.frameRate) settings.frameRate = options.frameRate;
    if (options.resolution) settings.resolution = options.resolution;
    if (options.crf !== undefined) settings.crf = options.crf;
    if (options.preset) settings.preset = options.preset;
    if (options.quality) settings.quality = options.quality;

    // Apply quality preset if specified
    if (options.qualityPreset) {
      const presets = this.getQualityPresets(pipeline.output);
      const presetSettings = presets[options.qualityPreset];
      if (presetSettings) {
        Object.assign(settings, presetSettings);
      }
    }

    // Validate codec compatibility
    this.validateCodecCompatibility(settings, pipeline.output);

    return settings;
  }

  /**
   * Validate codec compatibility with output format
   */
  validateCodecCompatibility(settings, outputFormat) {
    const supportedVideoCodecs = this.videoCodecs[outputFormat] || [];
    const supportedAudioCodecs = this.audioCodecs[outputFormat] || [];

    if (settings.videoCodec && !supportedVideoCodecs.includes(settings.videoCodec)) {
      console.warn(`Video codec ${settings.videoCodec} may not be optimal for ${outputFormat}`);
    }

    if (settings.audioCodec && !supportedAudioCodecs.includes(settings.audioCodec)) {
      console.warn(`Audio codec ${settings.audioCodec} may not be optimal for ${outputFormat}`);
    }
  }

  /**
   * Calculate enhanced progress with time estimation
   */
  calculateEnhancedProgress(progress, startTime, videoInfo) {
    const elapsed = (Date.now() - startTime) / 1000;
    const estimatedTotal = progress.percentage > 0 ? (elapsed / progress.percentage) * 100 : 0;
    const timeRemaining = Math.max(0, estimatedTotal - elapsed);

    return {
      ...progress,
      elapsedTime: elapsed,
      estimatedTimeRemaining: timeRemaining,
      estimatedTotalTime: estimatedTotal,
      formattedElapsed: this.formatDuration(elapsed),
      formattedRemaining: this.formatDuration(timeRemaining),
      inputInfo: {
        resolution: videoInfo.resolution,
        duration: videoInfo.duration,
        videoCodec: videoInfo.videoCodec,
        audioCodec: videoInfo.audioCodec
      }
    };
  }

  /**
   * Check if conversion between formats is supported
   */
  isConversionSupported(inputFormat, outputFormat) {
    return this.getConversionPipeline(inputFormat, outputFormat) !== null;
  }

  /**
   * Get available conversion pipelines
   */
  getAvailablePipelines() {
    return [
      { from: 'mp4', to: 'mov', name: 'MP4 to MOV' },
      { from: 'mov', to: 'mp4', name: 'MOV to MP4' }
    ];
  }

  /**
   * Get quality presets for video conversion
   */
  getQualityPresets(format) {
    const presets = {
      mp4: {
        'ultra': {
          crf: 18,
          preset: 'slow',
          videoBitrate: '8000k',
          audioBitrate: '320k'
        },
        'high': {
          crf: 20,
          preset: 'medium',
          videoBitrate: '4000k',
          audioBitrate: '192k'
        },
        'medium': {
          crf: 23,
          preset: 'medium',
          videoBitrate: '2000k',
          audioBitrate: '128k'
        },
        'low': {
          crf: 28,
          preset: 'fast',
          videoBitrate: '1000k',
          audioBitrate: '96k'
        },
        'web': {
          crf: 25,
          preset: 'fast',
          videoBitrate: '1500k',
          audioBitrate: '128k',
          resolution: '1280x720'
        }
      },
      mov: {
        'ultra': {
          videoBitrate: '10000k',
          audioBitrate: '320k',
          videoCodec: 'h264'
        },
        'high': {
          videoBitrate: '5000k',
          audioBitrate: '192k',
          videoCodec: 'h264'
        },
        'medium': {
          videoBitrate: '2500k',
          audioBitrate: '128k',
          videoCodec: 'h264'
        },
        'low': {
          videoBitrate: '1200k',
          audioBitrate: '96k',
          videoCodec: 'h264'
        },
        'prores': {
          videoCodec: 'prores',
          audioBitrate: '192k'
        }
      }
    };

    return presets[format] || presets.mp4;
  }

  /**
   * Convert time string to seconds
   */
  timeToSeconds(timeString) {
    if (!timeString) return 0;
    
    const parts = timeString.split(':');
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts.map(parseFloat);
      return hours * 3600 + minutes * 60 + seconds;
    } else if (parts.length === 2) {
      const [minutes, seconds] = parts.map(parseFloat);
      return minutes * 60 + seconds;
    }
    
    return parseFloat(timeString) || 0;
  }

  /**
   * Validate and normalize video settings
   */
  validateVideoSettings(settings) {
    const errors = [];
    const warnings = [];

    // Validate video codec
    if (settings.videoCodec && !this.isValidVideoCodec(settings.videoCodec)) {
      errors.push(`Invalid video codec: ${settings.videoCodec}`);
    }

    // Validate audio codec
    if (settings.audioCodec && !this.isValidAudioCodec(settings.audioCodec)) {
      errors.push(`Invalid audio codec: ${settings.audioCodec}`);
    }

    // Validate resolution
    if (settings.resolution && !this.isValidResolution(settings.resolution)) {
      errors.push(`Invalid resolution format: ${settings.resolution}`);
    }

    // Validate frame rate
    if (settings.frameRate && !this.isValidFrameRate(settings.frameRate)) {
      errors.push(`Invalid frame rate: ${settings.frameRate}`);
    }

    // Validate bitrates
    if (settings.videoBitrate && !this.isValidBitrate(settings.videoBitrate)) {
      errors.push(`Invalid video bitrate: ${settings.videoBitrate}`);
    }

    if (settings.audioBitrate && !this.isValidBitrate(settings.audioBitrate)) {
      errors.push(`Invalid audio bitrate: ${settings.audioBitrate}`);
    }

    // Validate CRF value
    if (settings.crf !== undefined && !this.isValidCRF(settings.crf)) {
      errors.push(`Invalid CRF value: ${settings.crf} (must be 0-51)`);
    }

    // Validate preset
    if (settings.preset && !this.isValidPreset(settings.preset)) {
      warnings.push(`Unknown preset: ${settings.preset}`);
    }

    if (errors.length > 0) {
      throw new Error(`Video settings validation failed: ${errors.join(', ')}`);
    }

    if (warnings.length > 0) {
      console.warn('Video settings warnings:', warnings.join(', '));
    }

    return true;
  }

  /**
   * Validate video codec
   */
  isValidVideoCodec(codec) {
    const validCodecs = ['h264', 'h265', 'hevc', 'vp8', 'vp9', 'av1', 'prores', 'dnxhd', 'copy'];
    return validCodecs.includes(codec.toLowerCase());
  }

  /**
   * Validate audio codec
   */
  isValidAudioCodec(codec) {
    const validCodecs = ['aac', 'mp3', 'ac3', 'eac3', 'flac', 'pcm_s16le', 'pcm_s24le', 'copy'];
    return validCodecs.includes(codec.toLowerCase());
  }

  /**
   * Validate resolution format
   */
  isValidResolution(resolution) {
    const resolutionPattern = /^\d+x\d+$/;
    if (!resolutionPattern.test(resolution)) return false;
    
    const [width, height] = resolution.split('x').map(Number);
    return width > 0 && height > 0 && width <= 7680 && height <= 4320; // Up to 8K
  }

  /**
   * Validate frame rate
   */
  isValidFrameRate(frameRate) {
    const rate = parseFloat(frameRate);
    return rate > 0 && rate <= 120;
  }

  /**
   * Validate bitrate format
   */
  isValidBitrate(bitrate) {
    const bitratePattern = /^\d+[kmKM]?$/;
    return bitratePattern.test(bitrate);
  }

  /**
   * Validate CRF value
   */
  isValidCRF(crf) {
    const crfValue = parseInt(crf);
    return crfValue >= 0 && crfValue <= 51;
  }

  /**
   * Validate encoding preset
   */
  isValidPreset(preset) {
    const validPresets = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
    return validPresets.includes(preset.toLowerCase());
  }

  /**
   * Apply resolution scaling
   */
  applyResolutionScaling(args, settings, inputInfo) {
    if (!settings.resolution) return;

    const [targetWidth, targetHeight] = settings.resolution.split('x').map(Number);
    const inputResolution = inputInfo.resolution;
    
    if (inputResolution) {
      const [inputWidth, inputHeight] = inputResolution.split('x').map(Number);
      
      // Calculate scaling with aspect ratio preservation
      const inputAspect = inputWidth / inputHeight;
      const targetAspect = targetWidth / targetHeight;
      
      let scaleFilter;
      if (settings.maintainAspectRatio !== false) {
        // Maintain aspect ratio by fitting within target dimensions
        scaleFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`;
      } else {
        // Stretch to exact dimensions
        scaleFilter = `scale=${targetWidth}:${targetHeight}`;
      }
      
      args.push('-vf', scaleFilter);
    } else {
      // Fallback if input resolution unknown
      args.push('-vf', `scale=${targetWidth}:${targetHeight}`);
    }
  }

  /**
   * Apply frame rate settings
   */
  applyFrameRateSettings(args, settings) {
    if (settings.frameRate) {
      args.push('-r', settings.frameRate.toString());
    }
  }

  /**
   * Apply audio stream settings
   */
  applyAudioStreamSettings(args, settings) {
    // Audio codec
    if (settings.audioCodec) {
      args.push('-c:a', settings.audioCodec);
    }

    // Audio bitrate
    if (settings.audioBitrate) {
      args.push('-b:a', settings.audioBitrate);
    }

    // Audio sample rate
    if (settings.audioSampleRate) {
      args.push('-ar', settings.audioSampleRate.toString());
    }

    // Audio channels
    if (settings.audioChannels) {
      args.push('-ac', settings.audioChannels.toString());
    }

    // Audio quality (for codecs that support it)
    if (settings.audioQuality && settings.audioCodec === 'aac') {
      args.push('-q:a', settings.audioQuality.toString());
    }
  }

  /**
   * Apply video quality settings
   */
  applyVideoQualitySettings(args, settings) {
    // Video codec
    if (settings.videoCodec) {
      args.push('-c:v', settings.videoCodec);
    }

    // CRF (Constant Rate Factor) for quality-based encoding
    if (settings.crf !== undefined) {
      args.push('-crf', settings.crf.toString());
    }
    // Video bitrate (if not using CRF)
    else if (settings.videoBitrate) {
      args.push('-b:v', settings.videoBitrate);
    }

    // Encoding preset
    if (settings.preset) {
      args.push('-preset', settings.preset);
    }

    // Two-pass encoding
    if (settings.twoPass && settings.videoBitrate) {
      // This would require separate implementation for two-pass encoding
      console.log('Two-pass encoding requested but not implemented in this method');
    }
  }

  /**
   * Get recommended settings for target use case
   */
  getRecommendedSettings(useCase, inputInfo) {
    const recommendations = {
      'web-streaming': {
        videoCodec: 'h264',
        audioCodec: 'aac',
        preset: 'fast',
        crf: 25,
        resolution: '1280x720',
        frameRate: 30,
        audioBitrate: '128k'
      },
      'high-quality': {
        videoCodec: 'h264',
        audioCodec: 'aac',
        preset: 'slow',
        crf: 18,
        audioBitrate: '192k'
      },
      'mobile-optimized': {
        videoCodec: 'h264',
        audioCodec: 'aac',
        preset: 'fast',
        crf: 28,
        resolution: '854x480',
        frameRate: 24,
        audioBitrate: '96k'
      },
      'archive': {
        videoCodec: 'h265',
        audioCodec: 'aac',
        preset: 'slow',
        crf: 20,
        audioBitrate: '128k'
      }
    };

    return recommendations[useCase] || recommendations['high-quality'];
  }

  /**
   * Calculate optimal settings based on input characteristics
   */
  calculateOptimalSettings(inputInfo, targetFormat, constraints = {}) {
    const settings = {};

    // Base codec selection
    if (targetFormat === 'mp4') {
      settings.videoCodec = 'h264';
      settings.audioCodec = 'aac';
    } else if (targetFormat === 'mov') {
      settings.videoCodec = 'h264';
      settings.audioCodec = 'aac';
    }

    // Resolution optimization
    if (inputInfo.resolution && !constraints.resolution) {
      const [width, height] = inputInfo.resolution.split('x').map(Number);
      
      // Downscale if too large for web delivery
      if (constraints.maxWidth && width > constraints.maxWidth) {
        const aspectRatio = width / height;
        settings.resolution = `${constraints.maxWidth}x${Math.round(constraints.maxWidth / aspectRatio)}`;
      }
    }

    // Bitrate optimization based on resolution and frame rate
    if (inputInfo.resolution && !constraints.videoBitrate) {
      const [width, height] = inputInfo.resolution.split('x').map(Number);
      const pixels = width * height;
      const frameRate = parseFloat(inputInfo.frameRate) || 30;
      
      // Rough bitrate calculation (bits per pixel per frame)
      const bitsPerPixelPerFrame = 0.1; // Conservative estimate
      const calculatedBitrate = Math.round((pixels * frameRate * bitsPerPixelPerFrame) / 1000);
      settings.videoBitrate = `${Math.min(calculatedBitrate, 8000)}k`; // Cap at 8Mbps
    }

    // Apply constraints
    Object.assign(settings, constraints);

    return settings;
  }

  /**
   * Enhanced progress tracking with frame-based monitoring
   */
  createProgressTracker(totalDuration, totalFrames, videoInfo) {
    let lastFrameCount = 0;
    let lastTimeProcessed = 0;
    let conversionStartTime = Date.now();
    let frameRate = parseFloat(videoInfo.frameRate) || 30;
    
    return {
      startTime: conversionStartTime,
      totalDuration,
      totalFrames,
      frameRate,
      lastFrameCount,
      lastTimeProcessed,
      
      updateProgress: function(currentFrame, currentTime) {
        const now = Date.now();
        const elapsed = (now - conversionStartTime) / 1000;
        
        // Frame-based progress
        const frameProgress = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;
        
        // Time-based progress
        const timeProgress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
        
        // Use the more accurate progress indicator
        const progress = Math.max(frameProgress, timeProgress);
        
        // Calculate processing speed
        const framesDelta = currentFrame - this.lastFrameCount;
        const timeDelta = currentTime - this.lastTimeProcessed;
        const processingSpeed = framesDelta > 0 ? framesDelta / (elapsed || 1) : 0;
        
        // Estimate remaining time
        const remainingFrames = Math.max(0, totalFrames - currentFrame);
        const remainingTime = processingSpeed > 0 ? remainingFrames / processingSpeed : 0;
        
        // Update tracking values
        this.lastFrameCount = currentFrame;
        this.lastTimeProcessed = currentTime;
        
        return {
          percentage: Math.min(100, Math.max(0, progress)),
          currentFrame,
          totalFrames,
          currentTime,
          totalDuration,
          elapsedTime: elapsed,
          estimatedTimeRemaining: remainingTime,
          processingSpeed: processingSpeed,
          frameRate: frameRate,
          formattedElapsed: this.formatDuration(elapsed),
          formattedRemaining: this.formatDuration(remainingTime),
          formattedCurrentTime: this.formatDuration(currentTime),
          formattedTotalDuration: this.formatDuration(totalDuration)
        };
      },
      
      formatDuration: function(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
      }
    };
  }

  /**
   * Enhanced progress parsing with frame detection
   */
  parseProgress(data, totalDuration, totalFrames = null) {
    const progressData = {
      percentage: 0,
      currentFrame: 0,
      currentTime: 0,
      fps: 0,
      bitrate: '',
      speed: '',
      size: ''
    };

    // Parse frame count
    const frameMatch = data.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      progressData.currentFrame = parseInt(frameMatch[1]);
    }

    // Parse current time
    const timeMatch = data.match(/time=([\d:.]+)/);
    if (timeMatch) {
      progressData.currentTime = this.timeToSeconds(timeMatch[1]);
    }

    // Parse FPS
    const fpsMatch = data.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) {
      progressData.fps = parseFloat(fpsMatch[1]);
    }

    // Parse bitrate
    const bitrateMatch = data.match(/bitrate=\s*([\d.]+\w*\/s)/);
    if (bitrateMatch) {
      progressData.bitrate = bitrateMatch[1];
    }

    // Parse speed
    const speedMatch = data.match(/speed=\s*([\d.]+x)/);
    if (speedMatch) {
      progressData.speed = speedMatch[1];
    }

    // Parse output size
    const sizeMatch = data.match(/size=\s*(\d+\w*)/);
    if (sizeMatch) {
      progressData.size = sizeMatch[1];
    }

    // Calculate percentage based on available data
    if (totalFrames && progressData.currentFrame > 0) {
      progressData.percentage = (progressData.currentFrame / totalFrames) * 100;
    } else if (totalDuration && progressData.currentTime > 0) {
      progressData.percentage = (progressData.currentTime / totalDuration) * 100;
    }

    progressData.percentage = Math.min(100, Math.max(0, progressData.percentage));

    return progressData;
  }

  /**
   * Conversion cancellation support
   */
  createCancellationToken() {
    let cancelled = false;
    let cancellationCallbacks = [];
    
    return {
      isCancelled: () => cancelled,
      
      cancel: () => {
        if (!cancelled) {
          cancelled = true;
          cancellationCallbacks.forEach(callback => {
            try {
              callback();
            } catch (error) {
              console.error('Error in cancellation callback:', error);
            }
          });
        }
      },
      
      onCancellation: (callback) => {
        if (typeof callback === 'function') {
          cancellationCallbacks.push(callback);
        }
      },
      
      throwIfCancelled: () => {
        if (cancelled) {
          throw new Error('Conversion was cancelled');
        }
      }
    };
  }

  /**
   * Convert video with cancellation support
   */
  async convertVideoWithCancellation(inputPath, outputPath, options = {}) {
    const cancellationToken = options.cancellationToken || this.createCancellationToken();
    
    try {
      // Check for cancellation before starting
      cancellationToken.throwIfCancelled();
      
      console.log('Starting video conversion with cancellation support:', {
        input: inputPath,
        output: outputPath,
        options
      });

      // Validate input and output files
      await this.validateInputFile(inputPath);
      await this.validateOutputFile(outputPath);
      cancellationToken.throwIfCancelled();

      // Get video information
      const inputFormat = await this.detectVideoFormat(inputPath);
      const outputFormat = this.getFormatFromPath(outputPath);
      const videoInfo = await this.getVideoInfo(inputPath);
      cancellationToken.throwIfCancelled();

      // Calculate total frames for progress tracking
      const totalDuration = this.timeToSeconds(videoInfo.duration);
      const frameRate = parseFloat(videoInfo.frameRate) || 30;
      const totalFrames = Math.round(totalDuration * frameRate);

      // Create progress tracker
      const progressTracker = this.createProgressTracker(totalDuration, totalFrames, videoInfo);

      // Get conversion pipeline
      const pipeline = this.getConversionPipeline(inputFormat, outputFormat);
      if (!pipeline) {
        throw new Error(`Conversion from ${inputFormat} to ${outputFormat} is not supported`);
      }

      // Apply settings and build FFmpeg arguments
      const settings = this.applyConversionSettings(pipeline, options, videoInfo);
      const args = this.buildFFmpegArgs(inputPath, outputPath, settings, videoInfo);

      console.log('FFmpeg arguments:', args);
      cancellationToken.throwIfCancelled();

      // Execute conversion with enhanced progress tracking and cancellation
      let ffmpegProcess = null;
      
      // Set up cancellation handler
      cancellationToken.onCancellation(() => {
        if (ffmpegProcess && ffmpegProcess.kill) {
          console.log('Cancelling video conversion...');
          ffmpegProcess.kill('SIGTERM');
          
          // Force kill after timeout
          setTimeout(() => {
            if (ffmpegProcess && !ffmpegProcess.killed) {
              ffmpegProcess.kill('SIGKILL');
            }
          }, 5000);
        }
      });

      const result = await this.ffmpegService.executeFFmpeg(args, {
        onProgress: (data) => {
          cancellationToken.throwIfCancelled();
          
          if (options.onProgress) {
            const basicProgress = this.parseProgress(data, totalDuration, totalFrames);
            const enhancedProgress = progressTracker.updateProgress(
              basicProgress.currentFrame,
              basicProgress.currentTime
            );
            
            // Combine basic and enhanced progress data
            const fullProgress = {
              ...basicProgress,
              ...enhancedProgress,
              inputInfo: {
                resolution: videoInfo.resolution,
                duration: videoInfo.duration,
                frameRate: videoInfo.frameRate,
                videoCodec: videoInfo.videoCodec,
                audioCodec: videoInfo.audioCodec
              }
            };
            
            options.onProgress(fullProgress);
          }
        },
        onProcessCreated: (process) => {
          ffmpegProcess = process;
        }
      });

      // Final cancellation check
      cancellationToken.throwIfCancelled();

      // Validate output file was created successfully
      await this.validateOutputFile(outputPath);

      console.log('Video conversion completed successfully');
      return {
        success: true,
        inputPath,
        outputPath,
        inputFormat,
        outputFormat,
        pipeline: pipeline.name,
        settings,
        videoInfo,
        totalFrames,
        cancelled: false
      };
    } catch (error) {
      if (error.message === 'Conversion was cancelled') {
        console.log('Video conversion was cancelled');
        return {
          success: false,
          cancelled: true,
          error: error.message
        };
      }
      
      console.error('Video conversion failed:', error);
      throw error;
    }
  }

  /**
   * Batch conversion with progress tracking and cancellation
   */
  async convertVideoBatch(conversions, options = {}) {
    const results = [];
    const cancellationToken = options.cancellationToken || this.createCancellationToken();
    let completedCount = 0;
    
    try {
      for (let i = 0; i < conversions.length; i++) {
        cancellationToken.throwIfCancelled();
        
        const conversion = conversions[i];
        const conversionOptions = {
          ...conversion.options,
          cancellationToken,
          onProgress: (progress) => {
            if (options.onBatchProgress) {
              const batchProgress = {
                currentConversion: i + 1,
                totalConversions: conversions.length,
                completedConversions: completedCount,
                currentFile: conversion.inputPath,
                currentProgress: progress,
                overallProgress: ((completedCount + progress.percentage / 100) / conversions.length) * 100
              };
              options.onBatchProgress(batchProgress);
            }
            
            if (conversion.options && conversion.options.onProgress) {
              conversion.options.onProgress(progress);
            }
          }
        };
        
        try {
          const result = await this.convertVideoWithCancellation(
            conversion.inputPath,
            conversion.outputPath,
            conversionOptions
          );
          
          results.push(result);
          if (result.success) {
            completedCount++;
          }
        } catch (error) {
          results.push({
            success: false,
            inputPath: conversion.inputPath,
            outputPath: conversion.outputPath,
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        results,
        completedCount,
        totalCount: conversions.length,
        cancelled: cancellationToken.isCancelled()
      };
    } catch (error) {
      if (error.message === 'Conversion was cancelled') {
        return {
          success: false,
          cancelled: true,
          results,
          completedCount,
          totalCount: conversions.length
        };
      }
      throw error;
     }
   }

  /**
   * Resource optimization and monitoring
   */
  createResourceMonitor() {
    const startTime = Date.now();
    let peakMemoryUsage = 0;
    let totalProcessedFrames = 0;
    let totalProcessedDuration = 0;
    
    return {
      startTime,
      peakMemoryUsage,
      totalProcessedFrames,
      totalProcessedDuration,
      
      updateStats: function(currentFrame, currentTime, memoryUsage = 0) {
        this.totalProcessedFrames = Math.max(this.totalProcessedFrames, currentFrame);
        this.totalProcessedDuration = Math.max(this.totalProcessedDuration, currentTime);
        this.peakMemoryUsage = Math.max(this.peakMemoryUsage, memoryUsage);
      },
      
      getPerformanceStats: function() {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const framesPerSecond = elapsed > 0 ? this.totalProcessedFrames / elapsed : 0;
        const timeProcessingRatio = elapsed > 0 ? this.totalProcessedDuration / elapsed : 0;
        
        return {
          elapsedTime: elapsed,
          totalProcessedFrames: this.totalProcessedFrames,
          totalProcessedDuration: this.totalProcessedDuration,
          framesPerSecond: framesPerSecond,
          timeProcessingRatio: timeProcessingRatio,
          peakMemoryUsage: this.peakMemoryUsage,
          efficiency: timeProcessingRatio > 0 ? Math.min(100, (timeProcessingRatio * 100)) : 0
        };
      }
    };
  }

  /**
   * Advanced error handling with retry logic
   */
  async convertVideoWithRetry(inputPath, outputPath, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    const backoffMultiplier = options.backoffMultiplier || 2;
    
    let lastError = null;
    let currentDelay = retryDelay;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Video conversion attempt ${attempt}/${maxRetries}`);
        
        const result = await this.convertVideoWithCancellation(inputPath, outputPath, {
          ...options,
          attempt,
          maxRetries
        });
        
        if (result.success) {
          if (attempt > 1) {
            console.log(`Video conversion succeeded on attempt ${attempt}`);
          }
          return result;
        }
        
        if (result.cancelled) {
          return result; // Don't retry if cancelled
        }
        
        lastError = new Error(result.error || 'Conversion failed');
      } catch (error) {
        lastError = error;
        console.error(`Video conversion attempt ${attempt} failed:`, error.message);
        
        // Don't retry for certain types of errors
        if (this.isNonRetryableError(error)) {
          console.log('Non-retryable error detected, stopping retries');
          throw error;
        }
        
        // Don't retry if this is the last attempt
        if (attempt === maxRetries) {
          break;
        }
        
        // Wait before retrying
        console.log(`Waiting ${currentDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= backoffMultiplier;
      }
    }
    
    throw new Error(`Video conversion failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
  }

  /**
   * Check if an error should not be retried
   */
  isNonRetryableError(error) {
    const nonRetryablePatterns = [
      /no such file or directory/i,
      /permission denied/i,
      /invalid data found/i,
      /unsupported codec/i,
      /conversion was cancelled/i,
      /disk full/i,
      /out of memory/i
    ];
    
    return nonRetryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Memory-optimized batch processing
   */
  async convertVideoBatchOptimized(conversions, options = {}) {
    const maxConcurrent = options.maxConcurrent || 2;
    const memoryThreshold = options.memoryThreshold || 1024 * 1024 * 1024; // 1GB
    const results = [];
    const resourceMonitor = this.createResourceMonitor();
    
    // Process conversions in chunks to manage memory
    for (let i = 0; i < conversions.length; i += maxConcurrent) {
      const chunk = conversions.slice(i, i + maxConcurrent);
      
      try {
        // Check memory usage before processing chunk
        const memoryUsage = process.memoryUsage();
        if (memoryUsage.heapUsed > memoryThreshold) {
          console.warn('High memory usage detected, forcing garbage collection');
          if (global.gc) {
            global.gc();
          }
          
          // Wait a bit for memory to be freed
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Process chunk concurrently
        const chunkPromises = chunk.map(async (conversion, index) => {
          const globalIndex = i + index;
          
          try {
            const conversionOptions = {
              ...conversion.options,
              onProgress: (progress) => {
                resourceMonitor.updateStats(
                  progress.currentFrame,
                  progress.currentTime,
                  process.memoryUsage().heapUsed
                );
                
                if (options.onBatchProgress) {
                  const batchProgress = {
                    currentConversion: globalIndex + 1,
                    totalConversions: conversions.length,
                    completedConversions: results.filter(r => r.success).length,
                    currentFile: conversion.inputPath,
                    currentProgress: progress,
                    overallProgress: ((results.length + progress.percentage / 100) / conversions.length) * 100,
                    performanceStats: resourceMonitor.getPerformanceStats()
                  };
                  options.onBatchProgress(batchProgress);
                }
              }
            };
            
            const result = await this.convertVideoWithRetry(
              conversion.inputPath,
              conversion.outputPath,
              conversionOptions
            );
            
            return result;
          } catch (error) {
            return {
              success: false,
              inputPath: conversion.inputPath,
              outputPath: conversion.outputPath,
              error: error.message
            };
          }
        });
        
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
        
        // Log progress
        const completed = results.filter(r => r.success).length;
        console.log(`Batch progress: ${completed}/${conversions.length} conversions completed`);
        
      } catch (error) {
        console.error('Error processing batch chunk:', error);
        
        // Add failed results for remaining conversions in chunk
        chunk.forEach(conversion => {
          results.push({
            success: false,
            inputPath: conversion.inputPath,
            outputPath: conversion.outputPath,
            error: error.message
          });
        });
      }
    }
    
    const finalStats = resourceMonitor.getPerformanceStats();
    console.log('Batch conversion completed. Performance stats:', finalStats);
    
    return {
      success: true,
      results,
      completedCount: results.filter(r => r.success).length,
      totalCount: conversions.length,
      performanceStats: finalStats
    };
  }

  /**
   * Comprehensive error analysis and reporting
   */
  analyzeConversionError(error, inputPath, outputPath, options = {}) {
    const errorAnalysis = {
      type: 'unknown',
      severity: 'medium',
      category: 'general',
      suggestions: [],
      retryable: true,
      inputPath,
      outputPath,
      timestamp: new Date().toISOString(),
      originalError: error.message
    };
    
    const errorMessage = error.message.toLowerCase();
    
    // Analyze error type and provide suggestions
    if (errorMessage.includes('no such file')) {
      errorAnalysis.type = 'file_not_found';
      errorAnalysis.category = 'input';
      errorAnalysis.severity = 'high';
      errorAnalysis.retryable = false;
      errorAnalysis.suggestions.push('Verify that the input file exists and is accessible');
    } else if (errorMessage.includes('permission denied')) {
      errorAnalysis.type = 'permission_error';
      errorAnalysis.category = 'filesystem';
      errorAnalysis.severity = 'high';
      errorAnalysis.retryable = false;
      errorAnalysis.suggestions.push('Check file permissions and ensure write access to output directory');
    } else if (errorMessage.includes('invalid data') || errorMessage.includes('corrupt')) {
      errorAnalysis.type = 'corrupted_input';
      errorAnalysis.category = 'input';
      errorAnalysis.severity = 'high';
      errorAnalysis.retryable = false;
      errorAnalysis.suggestions.push('Input file may be corrupted or in an unsupported format');
    } else if (errorMessage.includes('unsupported codec')) {
      errorAnalysis.type = 'codec_error';
      errorAnalysis.category = 'encoding';
      errorAnalysis.severity = 'medium';
      errorAnalysis.retryable = true;
      errorAnalysis.suggestions.push('Try using a different codec or quality preset');
    } else if (errorMessage.includes('out of memory') || errorMessage.includes('memory')) {
      errorAnalysis.type = 'memory_error';
      errorAnalysis.category = 'resources';
      errorAnalysis.severity = 'high';
      errorAnalysis.retryable = true;
      errorAnalysis.suggestions.push('Reduce video resolution or quality settings', 'Close other applications to free memory');
    } else if (errorMessage.includes('disk full') || errorMessage.includes('no space')) {
      errorAnalysis.type = 'disk_space_error';
      errorAnalysis.category = 'filesystem';
      errorAnalysis.severity = 'high';
      errorAnalysis.retryable = false;
      errorAnalysis.suggestions.push('Free up disk space before retrying conversion');
    } else if (errorMessage.includes('timeout') || errorMessage.includes('killed')) {
      errorAnalysis.type = 'timeout_error';
      errorAnalysis.category = 'performance';
      errorAnalysis.severity = 'medium';
      errorAnalysis.retryable = true;
      errorAnalysis.suggestions.push('Try with lower quality settings', 'Increase timeout duration');
    } else if (errorMessage.includes('cancelled')) {
      errorAnalysis.type = 'user_cancelled';
      errorAnalysis.category = 'user_action';
      errorAnalysis.severity = 'low';
      errorAnalysis.retryable = false;
      errorAnalysis.suggestions.push('Conversion was cancelled by user');
    }
    
    return errorAnalysis;
  }

  /**
   * Performance optimization recommendations
   */
  getOptimizationRecommendations(videoInfo, targetFormat, performanceStats = {}) {
    const recommendations = [];
    
    // Analyze input video characteristics
    const resolution = videoInfo.resolution || '';
    const duration = this.timeToSeconds(videoInfo.duration || '0');
    const frameRate = parseFloat(videoInfo.frameRate) || 30;
    
    // Resolution-based recommendations
    if (resolution.includes('4K') || resolution.includes('3840x2160')) {
      recommendations.push({
        type: 'resolution',
        priority: 'high',
        suggestion: 'Consider reducing resolution to 1080p for faster processing',
        impact: 'Significantly faster conversion, smaller file size'
      });
    }
    
    // Frame rate recommendations
    if (frameRate > 60) {
      recommendations.push({
        type: 'framerate',
        priority: 'medium',
        suggestion: 'Consider reducing frame rate to 30fps or 60fps',
        impact: 'Faster processing, smaller file size'
      });
    }
    
    // Duration-based recommendations
    if (duration > 3600) { // > 1 hour
      recommendations.push({
        type: 'duration',
        priority: 'medium',
        suggestion: 'Consider splitting long videos into smaller segments',
        impact: 'Better memory management, easier to resume if interrupted'
      });
    }
    
    // Performance-based recommendations
    if (performanceStats.efficiency && performanceStats.efficiency < 50) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        suggestion: 'System performance is low, consider closing other applications',
        impact: 'Faster conversion, more stable processing'
      });
    }
    
    // Format-specific recommendations
    if (targetFormat === 'mp4') {
      recommendations.push({
        type: 'codec',
        priority: 'low',
        suggestion: 'Use H.264 codec for better compatibility',
        impact: 'Wider device support, good compression'
      });
    } else if (targetFormat === 'mov') {
      recommendations.push({
        type: 'codec',
        priority: 'low',
        suggestion: 'Consider ProRes codec for professional workflows',
        impact: 'Higher quality, larger file size'
      });
    }
    
    return recommendations;
  }

  /**
   * System resource validation
   */
  async validateSystemResources(inputPath, options = {}) {
    const validation = {
      sufficient: true,
      warnings: [],
      recommendations: []
    };
    
    try {
      // Check available memory
      const memoryUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const freeMemory = require('os').freemem();
      
      if (freeMemory < 512 * 1024 * 1024) { // Less than 512MB free
        validation.warnings.push('Low available memory detected');
        validation.recommendations.push('Close other applications to free memory');
      }
      
      // Check disk space
      const fs = require('fs');
      const stats = await fs.promises.stat(inputPath);
      const inputSize = stats.size;
      
      // Estimate output size (rough approximation)
      const estimatedOutputSize = inputSize * 1.5; // Conservative estimate
      
      try {
        const outputDir = require('path').dirname(options.outputPath || inputPath);
        const diskStats = await fs.promises.statfs(outputDir);
        const availableSpace = diskStats.bavail * diskStats.bsize;
        
        if (availableSpace < estimatedOutputSize) {
          validation.sufficient = false;
          validation.warnings.push('Insufficient disk space for conversion');
          validation.recommendations.push(`Free at least ${Math.ceil(estimatedOutputSize / (1024 * 1024))}MB of disk space`);
        }
      } catch (diskError) {
        validation.warnings.push('Could not check disk space');
      }
      
      // Check CPU load (basic check)
      const loadAvg = require('os').loadavg();
      if (loadAvg[0] > require('os').cpus().length) {
        validation.warnings.push('High CPU load detected');
        validation.recommendations.push('Consider waiting for system load to decrease');
      }
      
    } catch (error) {
      validation.warnings.push(`Resource validation failed: ${error.message}`);
    }
    
    return validation;
  }
 }

// Export singleton instance
const videoConversionService = new VideoConversionService();
module.exports = videoConversionService;