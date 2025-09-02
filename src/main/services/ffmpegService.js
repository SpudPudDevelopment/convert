const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegStatic = require('ffmpeg-static');

class FFmpegService {
  constructor() {
    this.ffmpegPath = null;
    this.isInitialized = false;
  }

  /**
   * Initialize FFmpeg service and verify binary availability
   */
  async initialize() {
    try {
      // Get FFmpeg binary path from ffmpeg-static
      this.ffmpegPath = ffmpegStatic;
      
      if (!this.ffmpegPath || !fs.existsSync(this.ffmpegPath)) {
        throw new Error('FFmpeg binary not found');
      }

      // Verify FFmpeg is working
      await this.verifyFFmpeg();
      this.isInitialized = true;
      
      console.log('FFmpeg service initialized successfully');
      console.log('FFmpeg path:', this.ffmpegPath);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize FFmpeg service:', error);
      throw error;
    }
  }

  /**
   * Verify FFmpeg binary is working
   */
  async verifyFFmpeg() {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.ffmpegPath, ['-version']);
      
      let output = '';
      ffmpeg.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0 && output.includes('ffmpeg version')) {
          resolve(true);
        } else {
          reject(new Error('FFmpeg verification failed'));
        }
      });
      
      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get FFmpeg binary path
   */
  getFFmpegPath() {
    if (!this.isInitialized) {
      throw new Error('FFmpeg service not initialized');
    }
    return this.ffmpegPath;
  }

  /**
   * Execute FFmpeg command with arguments
   */
  async executeFFmpeg(args, options = {}) {
    if (!this.isInitialized) {
      throw new Error('FFmpeg service not initialized');
    }

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      ffmpeg.stdout.on('data', (data) => {
        stdout += data.toString();
        if (options.onProgress) {
          options.onProgress(data.toString());
        }
      });

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
        if (options.onProgress) {
          options.onProgress(data.toString());
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}: ${stderr}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get audio file information
   */
  async getAudioInfo(inputPath) {
    try {
      const args = [
        '-i', inputPath,
        '-f', 'null',
        '-'
      ];

      const result = await this.executeFFmpeg(args);
      return this.parseAudioInfo(result.stderr);
    } catch (error) {
      throw new Error(`Failed to get audio info: ${error.message}`);
    }
  }

  /**
   * Parse audio information from FFmpeg output
   */
  parseAudioInfo(ffmpegOutput) {
    const info = {
      duration: null,
      bitrate: null,
      sampleRate: null,
      channels: null,
      codec: null,
      format: null
    };

    // Parse duration
    const durationMatch = ffmpegOutput.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
    if (durationMatch) {
      info.duration = durationMatch[1];
    }

    // Parse bitrate
    const bitrateMatch = ffmpegOutput.match(/bitrate: (\d+) kb\/s/);
    if (bitrateMatch) {
      info.bitrate = parseInt(bitrateMatch[1]);
    }

    // Parse audio stream info
    const audioMatch = ffmpegOutput.match(/Stream #\d+:\d+.*?: Audio: ([^,]+), (\d+) Hz, ([^,]+), [^,]+, (\d+) kb\/s/);
    if (audioMatch) {
      info.codec = audioMatch[1];
      info.sampleRate = parseInt(audioMatch[2]);
      info.channels = audioMatch[3];
      if (!info.bitrate) {
        info.bitrate = parseInt(audioMatch[4]);
      }
    }

    return info;
  }

  /**
   * Check if service is initialized
   */
  isReady() {
    return this.isInitialized;
  }
}

// Export singleton instance
const ffmpegService = new FFmpegService();
module.exports = ffmpegService;