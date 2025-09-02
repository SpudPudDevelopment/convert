/**
 * File Selection Service
 * Provides unified file selection functionality for dialogs and drag-and-drop
 */

class FileSelectionService {
  constructor() {
    this.supportedFormats = {
      documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'html', 'epub'],
      images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff'],
      audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'],
      video: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'flv']
    };
    
    this.maxFileSize = 100 * 1024 * 1024; // 100MB default
    this.maxFiles = 50; // Maximum files per selection
  }

  /**
   * Get file filters for dialog
   * @returns {Array} File filters array
   */
  getFileFilters() {
    return [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Documents', extensions: this.supportedFormats.documents },
      { name: 'Images', extensions: this.supportedFormats.images },
      { name: 'Audio', extensions: this.supportedFormats.audio },
      { name: 'Video', extensions: this.supportedFormats.video }
    ];
  }

  /**
   * Get web-compatible accept string for file input
   * @returns {string} Accept attribute value
   */
  getWebAcceptString() {
    const allExtensions = [
      ...this.supportedFormats.documents.map(ext => `.${ext}`),
      ...this.supportedFormats.images.map(ext => `.${ext}`),
      ...this.supportedFormats.audio.map(ext => `.${ext}`),
      ...this.supportedFormats.video.map(ext => `.${ext}`)
    ];
    return allExtensions.join(',');
  }

  /**
   * Show native file dialog
   * @param {Object} options - Dialog options
   * @returns {Promise<Object>} Selection result
   */
  async showFileDialog(options = {}) {
    try {
      if (window.electronAPI) {
        // Electron environment
        const dialogOptions = {
          properties: ['openFile', 'multiSelections'],
          filters: this.getFileFilters(),
          ...options
        };

        const response = await window.electronAPI.showOpenDialog(dialogOptions);
        
        if (response.success && !response.data.canceled && response.data.filePaths.length > 0) {
          const files = await this.processFilePaths(response.data.filePaths);
          return {
            success: true,
            files: files,
            source: 'dialog'
          };
        }
        
        return {
          success: false,
          error: 'No files selected or dialog canceled'
        };
      } else {
        // Web environment - use HTML file input
        return new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = this.getWebAcceptString();
          
          input.onchange = async (e) => {
            if (e.target.files && e.target.files.length > 0) {
              const files = await this.processDroppedFiles(e.target.files);
              resolve({
                success: true,
                files: files,
                source: 'dialog'
              });
            } else {
              resolve({
                success: false,
                error: 'No files selected'
              });
            }
          };
          
          input.oncancel = () => {
            resolve({
              success: false,
              error: 'Dialog canceled'
            });
          };
          
          input.click();
        });
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process dropped files from drag and drop or file input
   * @param {FileList} fileList - HTML5 FileList object
   * @returns {Promise<Array>} Processed files array
   */
  async processDroppedFiles(fileList) {
    const files = [];
    
    for (let i = 0; i < Math.min(fileList.length, this.maxFiles); i++) {
      const file = fileList[i];
      
      try {
        const processedFile = {
          path: file.path || file.name, // Use file.path in Electron, fallback to name in web
          name: file.name,
          size: file.size,
          extension: this.getFileExtension(file.name),
          category: this.getFileCategory(this.getFileExtension(file.name)),
          lastModified: file.lastModified,
          file: file // Keep reference to original File object for web
        };
        
        const validation = this.validateFile(processedFile);
        if (validation.valid) {
          files.push(processedFile);
        } else {
          console.warn(`File ${processedFile.name} validation failed:`, validation.errors);
        }
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }
    
    return files;
  }

  /**
   * Process file paths (Electron only)
   * @param {Array} filePaths - Array of file paths
   * @returns {Promise<Array>} Processed files
   */
  async processFilePaths(filePaths) {
    if (!window.electronAPI) {
      throw new Error('processFilePaths is only available in Electron environment');
    }
    
    const files = [];
    
    for (const filePath of filePaths) {
      try {
        const stats = await this.getFileStats(filePath);
        if (stats.success) {
          const file = {
            path: filePath,
            name: stats.data.name,
            size: stats.data.size,
            extension: this.getFileExtension(stats.data.name),
            category: this.getFileCategory(this.getFileExtension(stats.data.name)),
            lastModified: stats.data.lastModified
          };
          
          const validation = this.validateFile(file);
          if (validation.valid) {
            files.push(file);
          } else {
            console.warn(`File ${file.name} validation failed:`, validation.errors);
          }
        }
      } catch (error) {
        console.error(`Error processing file ${filePath}:`, error);
      }
    }
    
    return files;
  }

  /**
   * Get file stats (Electron only)
   * @param {string} filePath - File path
   * @returns {Promise<Object>} File stats
   */
  async getFileStats(filePath) {
    if (!window.electronAPI) {
      throw new Error('getFileStats is only available in Electron environment');
    }
    
    try {
      return await window.electronAPI.getFileStats(filePath);
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate file against size and format restrictions
   * @param {Object} file - File object to validate
   * @returns {Object} Validation result
   */
  validateFile(file) {
    const errors = [];
    
    // Check file size
    if (file.size > this.maxFileSize) {
      errors.push(`File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(this.maxFileSize)})`);
    }
    
    // Check if format is supported
    if (!this.isSupportedFormat(file.extension)) {
      errors.push(`File format '${file.extension}' is not supported`);
    }
    
    // Check file name
    if (!file.name || file.name.trim() === '') {
      errors.push('File name is required');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Check if file format is supported
   * @param {string} extension - File extension
   * @returns {boolean} True if supported
   */
  isSupportedFormat(extension) {
    const normalizedExt = extension.toLowerCase().replace('.', '');
    
    return Object.values(this.supportedFormats)
      .some(formats => formats.includes(normalizedExt));
  }

  /**
   * Get file extension from filename
   * @param {string} filename - File name
   * @returns {string} File extension
   */
  getFileExtension(filename) {
    if (!filename) return '';
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : '';
  }

  /**
   * Get file category based on extension
   * @param {string} extension - File extension
   * @returns {string} File category
   */
  getFileCategory(extension) {
    const normalizedExt = extension.toLowerCase().replace('.', '');
    
    for (const [category, formats] of Object.entries(this.supportedFormats)) {
      if (formats.includes(normalizedExt)) {
        return category.slice(0, -1); // Remove 's' from plural
      }
    }
    
    return 'unknown';
  }

  /**
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size string
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get supported output formats for input extension
   * @param {string} inputExtension - Input file extension
   * @returns {Array} Array of supported output formats
   */
  getSupportedOutputFormats(inputExtension) {
    const category = this.getFileCategory(inputExtension);
    
    switch (category) {
      case 'document':
        return this.supportedFormats.documents;
      case 'image':
        return this.supportedFormats.images;
      case 'audio':
        return this.supportedFormats.audio;
      case 'video':
        return this.supportedFormats.video;
      default:
        return [];
    }
  }

  /**
   * Set maximum file size
   * @param {number} sizeInBytes - Maximum file size in bytes
   */
  setMaxFileSize(sizeInBytes) {
    this.maxFileSize = sizeInBytes;
  }

  /**
   * Set maximum number of files
   * @param {number} maxFiles - Maximum number of files
   */
  setMaxFiles(maxFiles) {
    this.maxFiles = maxFiles;
  }
}

export default new FileSelectionService();