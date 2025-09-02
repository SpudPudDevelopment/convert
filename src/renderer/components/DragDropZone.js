import React, { useState, useCallback, useRef } from 'react';
import fileSelectionService from '../../shared/services/fileSelectionService';

const DragDropZone = ({ 
  onFilesSelected, 
  disabled = false, 
  children, 
  className = '', 
  acceptedTypes = null,
  maxFiles = 50,
  showFileCount = true
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const dropZoneRef = useRef(null);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    setDragCounter(prev => prev + 1);
    
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    setDragCounter(prev => {
      const newCounter = prev - 1;
      if (newCounter === 0) {
        setIsDragOver(false);
      }
      return newCounter;
    });
  }, [disabled]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    // Set the drop effect
    e.dataTransfer.dropEffect = 'copy';
  }, [disabled]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    setIsDragOver(false);
    setDragCounter(0);
    
    const files = e.dataTransfer.files;
    
    if (files && files.length > 0) {
      try {
        // Set max files if provided
        if (maxFiles !== fileSelectionService.maxFiles) {
          fileSelectionService.setMaxFiles(maxFiles);
        }
        
        const result = await fileSelectionService.processDroppedFiles(files);
        
        if (onFilesSelected) {
          onFilesSelected(result);
        }
      } catch (error) {
        console.error('Error processing dropped files:', error);
        if (onFilesSelected) {
          onFilesSelected({
            success: false,
            error: 'Failed to process dropped files',
            files: []
          });
        }
      }
    }
  }, [disabled, maxFiles, onFilesSelected]);

  const handleClick = useCallback(async () => {
    if (disabled) return;
    
    try {
      // Set max files if provided
      if (maxFiles !== fileSelectionService.maxFiles) {
        fileSelectionService.setMaxFiles(maxFiles);
      }
      
      const result = await fileSelectionService.showFileDialog({
        filters: acceptedTypes ? [acceptedTypes] : fileSelectionService.getFileFilters()
      });
      
      if (onFilesSelected) {
        onFilesSelected(result);
      }
    } catch (error) {
      console.error('Error opening file dialog:', error);
      if (onFilesSelected) {
        onFilesSelected({
          success: false,
          error: 'Failed to open file dialog',
          files: []
        });
      }
    }
  }, [disabled, maxFiles, acceptedTypes, onFilesSelected]);

  const getZoneClasses = () => {
    const baseClasses = ['drag-drop-zone'];
    
    if (className) {
      baseClasses.push(className);
    }
    
    if (isDragOver) {
      baseClasses.push('drag-over');
    }
    
    if (disabled) {
      baseClasses.push('disabled');
    }
    
    return baseClasses.join(' ');
  };

  return (
    <div
      ref={dropZoneRef}
      className={getZoneClasses()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Drop files here or click to select"
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {children || (
        <div className="drag-drop-content">
          <div className="drag-drop-icon">
            {isDragOver ? '📁' : '📄'}
          </div>
          <div className="drag-drop-text">
            {isDragOver ? (
              <>
                <strong>Drop files here</strong>
                {showFileCount && maxFiles > 1 && (
                  <p>Up to {maxFiles} files allowed</p>
                )}
              </>
            ) : (
              <>
                <strong>Drag and drop files here</strong>
                <p>or click to select files</p>
                {showFileCount && maxFiles > 1 && (
                  <p className="file-limit">Up to {maxFiles} files</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
      
      {isDragOver && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <div className="drag-overlay-icon">📁</div>
            <div className="drag-overlay-text">Drop to add files</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DragDropZone;