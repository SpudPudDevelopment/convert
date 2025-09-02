/**
 * FFmpeg Service
 * Handles audio and video conversion using FFmpeg
 */

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const ffmpegStatic = require('ffmpeg-static');

/**
 * FFmpeg processing events
 */
const FFmpegEvents = {
  PROCESSING_STARTED: 'processing_started',
  PROCESSING_PROGRESS: 'processing_progress',
  PROCESSING_COMPLETED: 'processing_completed',
  PROCESSING_FAILED: 'processing_failed',
  WARNING: 'warning',
  ERROR: 'error'
};

/**
 * Default FFmpeg options
 */
const DEFAULT_FFMPEG_OPTIONS = {
  // Audio options
  audioBitrate: '128k',
  audioSampleRate: 44100,
  audioChannels: 2,
  audioCodec: 'aac',
  
  // Video options
  videoBitrate: '1000k',
  videoCodec: 'libx264',
  videoResolution: null, // e.g., '1920x1080'
  videoFrameRate: null, // e.g., 30
  
  // General options
  overwrite: true,
  reportProgress: true,
  timeout: 300000, // 5 minutes
  
  // Quality presets
  preset: 'medium', // ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
  crf: 23 // Constant Rate Factor for video quality (0-51, lower is better)
};

/**
 * FFmpeg processing result
 */
class FFmpegResult {
  constructor(success, data = null, error = null, metadata = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * FFmpeg Service
 */
class FFmpegService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = { ...DEFAULT_FFMPEG_OPTIONS, ...options };
    this.activeProcesses = new Map();
    this.statistics = {
      totalProcessed: 0,
      successfulProcessed: 0,
      failedProcessed: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0
    };
    
    // Get FFmpeg binary path
    this.ffmpegPath = this.getFfmpegPath();
    
    // Supported formats
    this.supportedAudioFormats = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'opus', 'aiff'];
    this.supportedVideoFormats = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv', 'm4v', '3gp', 'ogv', 'ts', 'mts', 'mxf'];
    
    // Video codec mappings
    this.videoCodecs = {
      'mp4': ['libx264', 'libx265', 'h264_videotoolbox', 'hevc_videotoolbox'],
      'mov': ['libx264', 'libx265', 'prores', 'h264_videotoolbox', 'hevc_videotoolbox'],
      'avi': ['libx264', 'libxvid', 'mjpeg'],
      'mkv': ['libx264', 'libx265', 'libvpx', 'libvpx-vp9'],
      'webm': ['libvpx', 'libvpx-vp9'],
      'wmv': ['wmv2', 'msmpeg4v3'],
      'flv': ['libx264', 'flv1']
    };
    
    // Audio codec mappings
    this.audioCodecs = {
      'mp4': ['aac', 'mp3'],
      'mov': ['aac', 'pcm_s16le', 'alac'],
      'avi': ['mp3', 'ac3', 'pcm_s16le'],
      'mkv': ['aac', 'mp3', 'vorbis', 'opus', 'flac'],
      'webm': ['vorbis', 'opus'],
      'wmv': ['wmav2', 'mp3'],
      'flv': ['aac', 'mp3']
    };
  }
  
  /**
   * Get FFmpeg binary path
   */
  getFfmpegPath() {
    try {
      // In production, adjust path for unpacked asar
      let ffmpegPath = ffmpegStatic;
      if (process.env.NODE_ENV === 'production' && ffmpegPath.includes('app.asar')) {
        ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
      }
      return ffmpegPath;
    } catch (error) {
      throw new Error(`Failed to locate FFmpeg binary: ${error.message}`);
    }
  }
  
  /**
   * Convert audio file
   */
  async convertAudio(inputPath, outputPath, options = {}) {
    const mergedOptions = { ...this.options, ...options };
    
    const args = [
      '-i', inputPath,
      '-acodec', mergedOptions.audioCodec,
      '-ab', mergedOptions.audioBitrate,
      '-ar', mergedOptions.audioSampleRate.toString(),
      '-ac', mergedOptions.audioChannels.toString()
    ];
    
    if (mergedOptions.overwrite) {
      args.push('-y');
    }
    
    args.push(outputPath);
    
    return this.executeFFmpeg(args, inputPath, outputPath, 'audio');
  }
  
  /**
   * Convert video file with enhanced options
   */
  async convertVideo(inputPath, outputPath, options = {}) {
    const outputFormat = this.getFormatFromPath(outputPath);
    const mergedOptions = { ...this.options, ...options };
    
    // Auto-select optimal codecs if not specified
    if (!mergedOptions.videoCodec) {
      mergedOptions.videoCodec = this.getOptimalVideoCodec(outputFormat);
    }
    if (!mergedOptions.audioCodec) {
      mergedOptions.audioCodec = this.getOptimalAudioCodec(outputFormat);
    }
    
    const args = ['-i', inputPath];
    
    // Video codec and quality settings
    args.push('-c:v', mergedOptions.videoCodec);
    
    if (mergedOptions.crf && mergedOptions.videoCodec.includes('x264') || mergedOptions.videoCodec.includes('x265')) {
      args.push('-crf', mergedOptions.crf.toString());
    } else if (mergedOptions.videoBitrate) {
      args.push('-b:v', mergedOptions.videoBitrate);
    }
    
    // Audio codec and quality
    args.push('-c:a', mergedOptions.audioCodec);
    if (mergedOptions.audioBitrate) {
      args.push('-b:a', mergedOptions.audioBitrate);
    }
    
    // Encoding preset
    if (mergedOptions.preset && (mergedOptions.videoCodec.includes('x264') || mergedOptions.videoCodec.includes('x265'))) {
      args.push('-preset', mergedOptions.preset);
    }
    
    // Resolution scaling
    if (mergedOptions.videoResolution) {
      args.push('-s', mergedOptions.videoResolution);
    }
    
    // Frame rate
    if (mergedOptions.videoFrameRate) {
      args.push('-r', mergedOptions.videoFrameRate.toString());
    }
    
    // Additional video filters
    if (mergedOptions.videoFilters) {
      args.push('-vf', mergedOptions.videoFilters);
    }
    
    // Progress reporting
    args.push('-progress', 'pipe:1');
    
    if (mergedOptions.overwrite) {
      args.push('-y');
    }
    
    args.push(outputPath);
    
    return this.executeFFmpeg(args, inputPath, outputPath, 'video');
  }
  
  /**
   * Extract audio from video
   */
  async extractAudio(inputPath, outputPath, options = {}) {
    const mergedOptions = { ...this.options, ...options };
    
    const args = [
      '-i', inputPath,
      '-vn', // No video
      '-acodec', mergedOptions.audioCodec,
      '-ab', mergedOptions.audioBitrate,
      '-ar', mergedOptions.audioSampleRate.toString(),
      '-ac', mergedOptions.audioChannels.toString()
    ];
    
    if (mergedOptions.overwrite) {
      args.push('-y');
    }
    
    args.push(outputPath);
    
    return this.executeFFmpeg(args, inputPath, outputPath, 'audio_extraction');
  }
  
  /**
   * Get media information
   */
  async getMediaInfo(inputPath) {
    const args = [
      '-i', inputPath,
      '-f', 'null',
      '-'
    ];
    
    return new Promise((resolve, reject) => {
      const process = spawn(this.ffmpegPath, args);
      let stderr = '';
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        try {
          const info = this.parseMediaInfo(stderr);
          resolve(new FFmpegResult(true, info));
        } catch (error) {
          reject(new FFmpegResult(false, null, error.message));
        }
      });
      
      process.on('error', (error) => {
        reject(new FFmpegResult(false, null, error.message));
      });
    });
  }
  
  /**
   * Execute FFmpeg command
   */
  async executeFFmpeg(args, inputPath, outputPath, type) {
    const startTime = Date.now();
    const processId = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.emit(FFmpegEvents.PROCESSING_STARTED, {
      processId,
      inputPath,
      outputPath,
      type,
      args
    });
    
    return new Promise((resolve, reject) => {
      const process = spawn(this.ffmpegPath, args);
      this.activeProcesses.set(processId, process);
      
      let stderr = '';
      let duration = null;
      
      process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        // Parse duration from FFmpeg output
        if (!duration) {
          const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
          if (durationMatch) {
            const [, hours, minutes, seconds, centiseconds] = durationMatch;
            duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(centiseconds) / 100;
          }
        }
        
        // Parse progress
        if (this.options.reportProgress && duration) {
          const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
          if (timeMatch) {
            const [, hours, minutes, seconds, centiseconds] = timeMatch;
            const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(centiseconds) / 100;
            const progress = Math.min(100, (currentTime / duration) * 100);
            
            this.emit(FFmpegEvents.PROCESSING_PROGRESS, {
              processId,
              progress,
              currentTime,
              duration,
              inputPath,
              outputPath
            });
          }
        }
      });
      
      process.on('close', async (code) => {
        this.activeProcesses.delete(processId);
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        if (code === 0) {
          try {
            // Get output file stats
            const stats = await fs.stat(outputPath);
            const result = {
              inputPath,
              outputPath,
              fileSize: stats.size,
              processingTime,
              type
            };
            
            this.updateStatistics(true, processingTime);
            this.emit(FFmpegEvents.PROCESSING_COMPLETED, {
              processId,
              result
            });
            
            resolve(new FFmpegResult(true, result));
          } catch (error) {
            this.updateStatistics(false, processingTime);
            this.emit(FFmpegEvents.PROCESSING_FAILED, {
              processId,
              error: error.message
            });
            reject(new FFmpegResult(false, null, error.message));
          }
        } else {
          const error = `FFmpeg process exited with code ${code}. Error: ${stderr}`;
          this.updateStatistics(false, processingTime);
          this.emit(FFmpegEvents.PROCESSING_FAILED, {
            processId,
            error
          });
          reject(new FFmpegResult(false, null, error));
        }
      });
      
      process.on('error', (error) => {
        this.activeProcesses.delete(processId);
        const processingTime = Date.now() - startTime;
        this.updateStatistics(false, processingTime);
        this.emit(FFmpegEvents.ERROR, {
          processId,
          error: error.message
        });
        reject(new FFmpegResult(false, null, error.message));
      });
      
      // Set timeout
      if (this.options.timeout) {
        setTimeout(() => {
          if (this.activeProcesses.has(processId)) {
            process.kill('SIGTERM');
            this.activeProcesses.delete(processId);
            reject(new FFmpegResult(false, null, 'Processing timeout'));
          }
        }, this.options.timeout);
      }
    });
  }
  
  /**
   * Parse media information from FFmpeg output
   */
  parseMediaInfo(stderr) {
    const info = {
      duration: null,
      bitrate: null,
      size: null,
      video: null,
      audio: null
    };
    
    // Parse duration
    const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (durationMatch) {
      const [, hours, minutes, seconds, centiseconds] = durationMatch;
      info.duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds) + parseInt(centiseconds) / 100;
    }
    
    // Parse bitrate
    const bitrateMatch = stderr.match(/bitrate: (\d+) kb\/s/);
    if (bitrateMatch) {
      info.bitrate = parseInt(bitrateMatch[1]);
    }
    
    // Parse video stream
    const videoMatch = stderr.match(/Video: ([^,]+), ([^,]+), (\d+x\d+)/);
    if (videoMatch) {
      info.video = {
        codec: videoMatch[1],
        pixelFormat: videoMatch[2],
        resolution: videoMatch[3]
      };
    }
    
    // Parse audio stream
    const audioMatch = stderr.match(/Audio: ([^,]+), (\d+) Hz, ([^,]+)/);
    if (audioMatch) {
      info.audio = {
        codec: audioMatch[1],
        sampleRate: parseInt(audioMatch[2]),
        channels: audioMatch[3]
      };
    }
    
    return info;
  }
  
  /**
   * Cancel processing
   */
  cancelProcessing(processId) {
    if (this.activeProcesses.has(processId)) {
      const process = this.activeProcesses.get(processId);
      process.kill('SIGTERM');
      this.activeProcesses.delete(processId);
      return true;
    }
    return false;
  }
  
  /**
   * Cancel all active processes
   */
  cancelAllProcessing() {
    const processIds = Array.from(this.activeProcesses.keys());
    processIds.forEach(processId => this.cancelProcessing(processId));
    return processIds.length;
  }
  
  /**
   * Update statistics
   */
  updateStatistics(success, processingTime) {
    this.statistics.totalProcessed++;
    if (success) {
      this.statistics.successfulProcessed++;
    } else {
      this.statistics.failedProcessed++;
    }
    this.statistics.totalProcessingTime += processingTime;
    this.statistics.averageProcessingTime = this.statistics.totalProcessingTime / this.statistics.totalProcessed;
  }
  
  /**
   * Get supported formats
   */
  getSupportedFormats() {
    return {
      audio: this.supportedAudioFormats,
      video: this.supportedVideoFormats
    };
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    return { ...this.statistics };
  }
  
  /**
   * Get active processes
   */
  getActiveProcesses() {
    return Array.from(this.activeProcesses.keys());
  }
  
  /**
   * Check if format is supported
   */
  isFormatSupported(format, type = 'auto') {
    const ext = format.toLowerCase().replace('.', '');
    
    if (type === 'audio' || type === 'auto') {
      if (this.supportedAudioFormats.includes(ext)) {
        return { supported: true, type: 'audio' };
      }
    }
    
    if (type === 'video' || type === 'auto') {
      if (this.supportedVideoFormats.includes(ext)) {
        return { supported: true, type: 'video' };
      }
    }
    
    return { supported: false, type: null };
  }
  
  /**
   * Get format from file path
   */
  getFormatFromPath(filePath) {
    return path.extname(filePath).toLowerCase().replace('.', '');
  }
  
  /**
   * Get optimal video codec for format
   */
  getOptimalVideoCodec(format) {
    const codecs = this.videoCodecs[format];
    if (!codecs || codecs.length === 0) {
      return 'libx264'; // Default fallback
    }
    
    // Prefer hardware acceleration on macOS if available
    if (process.platform === 'darwin') {
      const hwCodec = codecs.find(codec => codec.includes('videotoolbox'));
      if (hwCodec) return hwCodec;
    }
    
    // Return first available codec
    return codecs[0];
  }
  
  /**
   * Get optimal audio codec for format
   */
  getOptimalAudioCodec(format) {
    const codecs = this.audioCodecs[format];
    if (!codecs || codecs.length === 0) {
      return 'aac'; // Default fallback
    }
    return codecs[0];
  }
  
  /**
   * Get supported codecs for format
   */
  getSupportedCodecs(format, type = 'video') {
    if (type === 'video') {
      return this.videoCodecs[format] || [];
    } else if (type === 'audio') {
      return this.audioCodecs[format] || [];
    }
    return [];
  }
  
  /**
   * Detect video format from file
   */
  async detectVideoFormat(filePath) {
    try {
      const mediaInfo = await this.getMediaInfo(filePath);
      if (mediaInfo.success && mediaInfo.data) {
        return {
          format: this.getFormatFromPath(filePath),
          container: mediaInfo.data.format,
          videoCodec: mediaInfo.data.videoCodec,
          audioCodec: mediaInfo.data.audioCodec,
          duration: mediaInfo.data.duration,
          resolution: mediaInfo.data.resolution,
          frameRate: mediaInfo.data.frameRate
        };
      }
    } catch (error) {
      console.warn('Failed to detect video format:', error.message);
    }
    
    return {
      format: this.getFormatFromPath(filePath),
      container: null,
      videoCodec: null,
      audioCodec: null
    };
  }
}

// Global service instance
let globalFFmpegService = null;

/**
 * Get global FFmpeg service instance
 */
function getFFmpegService(options = {}) {
  if (!globalFFmpegService) {
    globalFFmpegService = new FFmpegService(options);
  }
  return globalFFmpegService;
}

module.exports = {
  FFmpegService,
  FFmpegResult,
  FFmpegEvents,
  DEFAULT_FFMPEG_OPTIONS,
  getFFmpegService
};