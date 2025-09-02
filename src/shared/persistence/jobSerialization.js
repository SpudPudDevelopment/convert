import { ConversionJob } from '../types/ConversionJob.js';
import { ConversionSettings, createConversionSettings } from '../types/ConversionSettings.js';
import { JobEvent } from '../events/jobEvents.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Serialization formats
 */
export const SerializationFormat = {
  JSON: 'json',
  BINARY: 'binary',
  COMPRESSED: 'compressed'
};

/**
 * Serialization error class
 */
export class SerializationError extends Error {
  constructor(message, code = null, originalError = null) {
    super(message);
    this.name = 'SerializationError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Job serializer class
 */
export class JobSerializer {
  constructor({
    format = SerializationFormat.JSON,
    includeEvents = true,
    includeMetrics = true,
    compression = false,
    encryption = false,
    encryptionKey = null
  } = {}) {
    this.format = format;
    this.includeEvents = includeEvents;
    this.includeMetrics = includeMetrics;
    this.compression = compression;
    this.encryption = encryption;
    this.encryptionKey = encryptionKey;
  }

  /**
   * Serialize a single job
   */
  async serializeJob(job) {
    if (!(job instanceof ConversionJob)) {
      throw new SerializationError('Input must be a ConversionJob instance', 'INVALID_INPUT');
    }

    try {
      // Convert job to serializable object
      const jobData = this.prepareJobData(job);
      
      // Add metadata
      const serializedData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        format: this.format,
        checksum: null,
        data: jobData
      };

      // Calculate checksum
      serializedData.checksum = this.calculateChecksum(jobData);

      // Apply transformations based on format
      let result;
      switch (this.format) {
        case SerializationFormat.JSON:
          result = JSON.stringify(serializedData, null, 2);
          break;
        case SerializationFormat.BINARY:
          result = this.toBinary(serializedData);
          break;
        case SerializationFormat.COMPRESSED:
          result = await this.compress(JSON.stringify(serializedData));
          break;
        default:
          throw new SerializationError(`Unsupported format: ${this.format}`, 'UNSUPPORTED_FORMAT');
      }

      // Apply encryption if enabled
      if (this.encryption && this.encryptionKey) {
        result = await this.encrypt(result);
      }

      return result;
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      throw new SerializationError(
        `Failed to serialize job: ${error.message}`,
        'SERIALIZATION_FAILED',
        error
      );
    }
  }

  /**
   * Serialize multiple jobs
   */
  async serializeJobs(jobs) {
    if (!Array.isArray(jobs)) {
      throw new SerializationError('Input must be an array of ConversionJob instances', 'INVALID_INPUT');
    }

    try {
      const serializedJobs = [];
      
      for (const job of jobs) {
        if (!(job instanceof ConversionJob)) {
          throw new SerializationError('All items must be ConversionJob instances', 'INVALID_INPUT');
        }
        serializedJobs.push(this.prepareJobData(job));
      }

      const batchData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        format: this.format,
        count: serializedJobs.length,
        checksum: null,
        data: serializedJobs
      };

      // Calculate checksum for the entire batch
      batchData.checksum = this.calculateChecksum(serializedJobs);

      // Apply format-specific serialization
      let result;
      switch (this.format) {
        case SerializationFormat.JSON:
          result = JSON.stringify(batchData, null, 2);
          break;
        case SerializationFormat.BINARY:
          result = this.toBinary(batchData);
          break;
        case SerializationFormat.COMPRESSED:
          result = await this.compress(JSON.stringify(batchData));
          break;
        default:
          throw new SerializationError(`Unsupported format: ${this.format}`, 'UNSUPPORTED_FORMAT');
      }

      if (this.encryption && this.encryptionKey) {
        result = await this.encrypt(result);
      }

      return result;
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      throw new SerializationError(
        `Failed to serialize jobs: ${error.message}`,
        'BATCH_SERIALIZATION_FAILED',
        error
      );
    }
  }

  /**
   * Prepare job data for serialization
   */
  prepareJobData(job) {
    const jobData = job.toJSON();
    
    // Filter data based on options
    if (!this.includeEvents) {
      delete jobData.events;
    }
    
    if (!this.includeMetrics) {
      delete jobData.metrics;
    }
    
    // Ensure settings are properly serialized
    if (jobData.settings && typeof jobData.settings === 'object') {
      jobData.settings = {
        ...jobData.settings,
        _type: job.settings.constructor.name
      };
    }
    
    return jobData;
  }

  /**
   * Calculate checksum for data integrity
   */
  calculateChecksum(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Convert to binary format
   */
  toBinary(data) {
    const jsonString = JSON.stringify(data);
    return Buffer.from(jsonString, 'utf8');
  }

  /**
   * Compress data
   */
  async compress(data) {
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (error, compressed) => {
        if (error) {
          reject(new SerializationError('Compression failed', 'COMPRESSION_FAILED', error));
        } else {
          resolve(compressed);
        }
      });
    });
  }

  /**
   * Encrypt data
   */
  async encrypt(data) {
    if (!this.encryptionKey) {
      throw new SerializationError('Encryption key is required', 'MISSING_ENCRYPTION_KEY');
    }

    try {
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(algorithm, this.encryptionKey);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        algorithm,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        data: encrypted
      };
    } catch (error) {
      throw new SerializationError('Encryption failed', 'ENCRYPTION_FAILED', error);
    }
  }
}

/**
 * Job deserializer class
 */
export class JobDeserializer {
  constructor({
    validateChecksum = true,
    strictValidation = true,
    encryptionKey = null
  } = {}) {
    this.validateChecksum = validateChecksum;
    this.strictValidation = strictValidation;
    this.encryptionKey = encryptionKey;
  }

  /**
   * Deserialize a single job
   */
  async deserializeJob(serializedData) {
    try {
      // Decrypt if necessary
      let data = serializedData;
      if (typeof data === 'object' && data.algorithm) {
        data = await this.decrypt(data);
      }

      // Parse based on format
      let parsedData;
      if (Buffer.isBuffer(data)) {
        // Binary format
        parsedData = JSON.parse(data.toString('utf8'));
      } else if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch {
          // Might be compressed
          const decompressed = await this.decompress(data);
          parsedData = JSON.parse(decompressed);
        }
      } else {
        parsedData = data;
      }

      // Validate structure
      this.validateSerializedData(parsedData);

      // Verify checksum
      if (this.validateChecksum && parsedData.checksum) {
        const calculatedChecksum = this.calculateChecksum(parsedData.data);
        if (calculatedChecksum !== parsedData.checksum) {
          throw new SerializationError('Checksum validation failed', 'CHECKSUM_MISMATCH');
        }
      }

      // Reconstruct job
      return this.reconstructJob(parsedData.data);
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      throw new SerializationError(
        `Failed to deserialize job: ${error.message}`,
        'DESERIALIZATION_FAILED',
        error
      );
    }
  }

  /**
   * Deserialize multiple jobs
   */
  async deserializeJobs(serializedData) {
    try {
      // Decrypt if necessary
      let data = serializedData;
      if (typeof data === 'object' && data.algorithm) {
        data = await this.decrypt(data);
      }

      // Parse based on format
      let parsedData;
      if (Buffer.isBuffer(data)) {
        parsedData = JSON.parse(data.toString('utf8'));
      } else if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch {
          const decompressed = await this.decompress(data);
          parsedData = JSON.parse(decompressed);
        }
      } else {
        parsedData = data;
      }

      // Validate batch structure
      this.validateBatchData(parsedData);

      // Verify checksum
      if (this.validateChecksum && parsedData.checksum) {
        const calculatedChecksum = this.calculateChecksum(parsedData.data);
        if (calculatedChecksum !== parsedData.checksum) {
          throw new SerializationError('Batch checksum validation failed', 'CHECKSUM_MISMATCH');
        }
      }

      // Reconstruct jobs
      const jobs = [];
      for (const jobData of parsedData.data) {
        jobs.push(this.reconstructJob(jobData));
      }

      return jobs;
    } catch (error) {
      if (error instanceof SerializationError) {
        throw error;
      }
      throw new SerializationError(
        `Failed to deserialize jobs: ${error.message}`,
        'BATCH_DESERIALIZATION_FAILED',
        error
      );
    }
  }

  /**
   * Reconstruct a ConversionJob from serialized data
   */
  reconstructJob(jobData) {
    try {
      // Reconstruct settings
      if (jobData.settings) {
        const settingsType = jobData.settings._type;
        delete jobData.settings._type;
        
        // Use factory to create appropriate settings type
        if (jobData.settings.conversionType) {
          jobData.settings = createConversionSettings(
            jobData.settings.conversionType,
            jobData.settings
          );
        } else {
          jobData.settings = new ConversionSettings(jobData.settings);
        }
      }

      // Create job from data
      const job = ConversionJob.fromJSON(jobData);

      return job;
    } catch (error) {
      throw new SerializationError(
        `Failed to reconstruct job: ${error.message}`,
        'JOB_RECONSTRUCTION_FAILED',
        error
      );
    }
  }

  /**
   * Validate serialized data structure
   */
  validateSerializedData(data) {
    if (!data || typeof data !== 'object') {
      throw new SerializationError('Invalid serialized data structure', 'INVALID_STRUCTURE');
    }

    if (!data.version) {
      throw new SerializationError('Missing version information', 'MISSING_VERSION');
    }

    if (!data.data) {
      throw new SerializationError('Missing job data', 'MISSING_DATA');
    }

    if (this.strictValidation) {
      const requiredFields = ['id', 'sourceFile', 'settings', 'status', 'createdAt'];
      for (const field of requiredFields) {
        if (!(field in data.data)) {
          throw new SerializationError(`Missing required field: ${field}`, 'MISSING_REQUIRED_FIELD');
        }
      }
    }
  }

  /**
   * Validate batch data structure
   */
  validateBatchData(data) {
    if (!data || typeof data !== 'object') {
      throw new SerializationError('Invalid batch data structure', 'INVALID_STRUCTURE');
    }

    if (!data.version) {
      throw new SerializationError('Missing version information', 'MISSING_VERSION');
    }

    if (!Array.isArray(data.data)) {
      throw new SerializationError('Batch data must be an array', 'INVALID_BATCH_DATA');
    }

    if (data.count !== undefined && data.count !== data.data.length) {
      throw new SerializationError('Batch count mismatch', 'COUNT_MISMATCH');
    }
  }

  /**
   * Calculate checksum for verification
   */
  calculateChecksum(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Decompress data
   */
  async decompress(data) {
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (error, decompressed) => {
        if (error) {
          reject(new SerializationError('Decompression failed', 'DECOMPRESSION_FAILED', error));
        } else {
          resolve(decompressed.toString('utf8'));
        }
      });
    });
  }

  /**
   * Decrypt data
   */
  async decrypt(encryptedData) {
    if (!this.encryptionKey) {
      throw new SerializationError('Encryption key is required for decryption', 'MISSING_ENCRYPTION_KEY');
    }

    try {
      const { algorithm, iv, authTag, data } = encryptedData;
      const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
      
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new SerializationError('Decryption failed', 'DECRYPTION_FAILED', error);
    }
  }
}

/**
 * File persistence manager
 */
export class JobPersistenceManager {
  constructor({
    baseDirectory = './job-data',
    format = SerializationFormat.JSON,
    autoBackup = true,
    maxBackups = 5,
    compression = false,
    encryption = false,
    encryptionKey = null
  } = {}) {
    this.baseDirectory = baseDirectory;
    this.format = format;
    this.autoBackup = autoBackup;
    this.maxBackups = maxBackups;
    this.serializer = new JobSerializer({ format, compression, encryption, encryptionKey });
    this.deserializer = new JobDeserializer({ encryptionKey });
  }

  /**
   * Initialize storage directory
   */
  async initialize() {
    try {
      await fs.promises.mkdir(this.baseDirectory, { recursive: true });
      
      if (this.autoBackup) {
        const backupDir = path.join(this.baseDirectory, 'backups');
        await fs.promises.mkdir(backupDir, { recursive: true });
      }
    } catch (error) {
      throw new SerializationError(
        `Failed to initialize storage: ${error.message}`,
        'INITIALIZATION_FAILED',
        error
      );
    }
  }

  /**
   * Save a job to file
   */
  async saveJob(job, filename = null) {
    if (!filename) {
      filename = `job_${job.id}.${this.getFileExtension()}`;
    }

    const filePath = path.join(this.baseDirectory, filename);
    
    try {
      // Create backup if file exists
      if (this.autoBackup && await this.fileExists(filePath)) {
        await this.createBackup(filePath);
      }

      const serializedData = await this.serializer.serializeJob(job);
      
      if (Buffer.isBuffer(serializedData)) {
        await fs.promises.writeFile(filePath, serializedData);
      } else {
        await fs.promises.writeFile(filePath, serializedData, 'utf8');
      }

      return filePath;
    } catch (error) {
      throw new SerializationError(
        `Failed to save job: ${error.message}`,
        'SAVE_FAILED',
        error
      );
    }
  }

  /**
   * Load a job from file
   */
  async loadJob(filename) {
    const filePath = path.resolve(this.baseDirectory, filename);
    
    try {
      const data = await fs.promises.readFile(filePath);
      return await this.deserializer.deserializeJob(data);
    } catch (error) {
      throw new SerializationError(
        `Failed to load job: ${error.message}`,
        'LOAD_FAILED',
        error
      );
    }
  }

  /**
   * Save multiple jobs to file
   */
  async saveJobs(jobs, filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `jobs_batch_${timestamp}.${this.getFileExtension()}`;
    }

    const filePath = path.join(this.baseDirectory, filename);
    
    try {
      if (this.autoBackup && await this.fileExists(filePath)) {
        await this.createBackup(filePath);
      }

      const serializedData = await this.serializer.serializeJobs(jobs);
      
      if (Buffer.isBuffer(serializedData)) {
        await fs.promises.writeFile(filePath, serializedData);
      } else {
        await fs.promises.writeFile(filePath, serializedData, 'utf8');
      }

      return filePath;
    } catch (error) {
      throw new SerializationError(
        `Failed to save jobs: ${error.message}`,
        'BATCH_SAVE_FAILED',
        error
      );
    }
  }

  /**
   * Load multiple jobs from file
   */
  async loadJobs(filename) {
    const filePath = path.resolve(this.baseDirectory, filename);
    
    try {
      const data = await fs.promises.readFile(filePath);
      return await this.deserializer.deserializeJobs(data);
    } catch (error) {
      throw new SerializationError(
        `Failed to load jobs: ${error.message}`,
        'BATCH_LOAD_FAILED',
        error
      );
    }
  }

  /**
   * List all job files
   */
  async listJobFiles() {
    try {
      const files = await fs.promises.readdir(this.baseDirectory);
      const extension = this.getFileExtension();
      return files.filter(file => file.endsWith(`.${extension}`));
    } catch (error) {
      throw new SerializationError(
        `Failed to list job files: ${error.message}`,
        'LIST_FAILED',
        error
      );
    }
  }

  /**
   * Delete a job file
   */
  async deleteJob(filename) {
    const filePath = path.join(this.baseDirectory, filename);
    
    try {
      if (this.autoBackup) {
        await this.createBackup(filePath);
      }
      
      await fs.promises.unlink(filePath);
      return true;
    } catch (error) {
      throw new SerializationError(
        `Failed to delete job: ${error.message}`,
        'DELETE_FAILED',
        error
      );
    }
  }

  /**
   * Create backup of existing file
   */
  async createBackup(filePath) {
    try {
      const backupDir = path.join(this.baseDirectory, 'backups');
      const filename = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${timestamp}_${filename}`);
      
      await fs.promises.copyFile(filePath, backupPath);
      
      // Clean up old backups
      await this.cleanupBackups(filename);
    } catch (error) {
      console.warn('Failed to create backup:', error.message);
    }
  }

  /**
   * Clean up old backup files
   */
  async cleanupBackups(originalFilename) {
    try {
      const backupDir = path.join(this.baseDirectory, 'backups');
      const files = await fs.promises.readdir(backupDir);
      
      const backupFiles = files
        .filter(file => file.endsWith(`_${originalFilename}`))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file),
          time: fs.promises.stat(path.join(backupDir, file)).then(stats => stats.mtime)
        }));
      
      if (backupFiles.length > this.maxBackups) {
        // Sort by modification time and remove oldest
        const sortedFiles = await Promise.all(
          backupFiles.map(async file => ({
            ...file,
            time: await file.time
          }))
        );
        
        sortedFiles.sort((a, b) => b.time - a.time);
        
        for (let i = this.maxBackups; i < sortedFiles.length; i++) {
          await fs.promises.unlink(sortedFiles[i].path);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup backups:', error.message);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file extension based on format
   */
  getFileExtension() {
    switch (this.format) {
      case SerializationFormat.JSON:
        return 'json';
      case SerializationFormat.BINARY:
        return 'bin';
      case SerializationFormat.COMPRESSED:
        return 'gz';
      default:
        return 'dat';
    }
  }
}

export default {
  SerializationFormat,
  SerializationError,
  JobSerializer,
  JobDeserializer,
  JobPersistenceManager
};