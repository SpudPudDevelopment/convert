/**
 * Tests for TempWorkspaceService
 * Tests temporary workspace management functionality
 */

const { jest } = require('@jest/globals');
const { TempWorkspaceService } = require('../services/tempWorkspaceService.js');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Mock dependencies
jest.mock('fs/promises');
jest.mock('path');
jest.mock('os');
jest.mock('../utils/logger.js');

describe('TempWorkspaceService', () => {
  let service;
  let mockLogger;
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    
    // Mock createLogger
    const { createLogger } = require('../utils/logger.js');
    createLogger.mockReturnValue(mockLogger);
    
    // Mock os.tmpdir
    os.tmpdir.mockReturnValue('/tmp');
    
    // Mock path.join
    path.join.mockImplementation((...args) => args.join('/'));
    
    // Mock fs operations
    fs.mkdir.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
    fs.readFile.mockResolvedValue('{}');
    fs.readdir.mockResolvedValue([]);
    fs.stat.mockResolvedValue({ size: 1024 });
    fs.rm.mockResolvedValue();
    fs.access.mockResolvedValue();
    
    // Create service instance
    service = new TempWorkspaceService({
      cleanupInterval: 0, // Disable automatic cleanup for tests
      enableMonitoring: false // Disable monitoring for tests
    });
  });
  
  afterEach(async () => {
    if (service) {
      service.cleanup();
    }
  });
  
  describe('initialization', () => {
    test('should initialize with default options', () => {
      expect(service.options.baseDir).toBe('/tmp/convert-app');
      expect(service.options.maxWorkspaces).toBe(50);
      expect(service.options.maxDiskUsage).toBe(5 * 1024 * 1024 * 1024);
    });
    
    test('should create base directory on initialization', async () => {
      await service.initialize();
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/convert-app', { recursive: true });
    });
  });
  
  describe('createWorkspace', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    test('should create a new workspace successfully', async () => {
      const options = {
        name: 'test-workspace',
        metadata: { project: 'test' }
      };
      
      const result = await service.createWorkspace(options);
      
      expect(result.success).toBe(true);
      expect(result.workspace).toBeDefined();
      expect(result.workspace.name).toBe('test-workspace');
      expect(result.workspace.metadata.project).toBe('test');
      expect(result.workspace.status).toBe('active');
      
      // Should create workspace directory
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(result.workspace.id),
        { recursive: true }
      );
      
      // Should create subdirectories
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('input'),
        { recursive: true }
      );
      
      // Should save metadata
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.workspace.json'),
        expect.stringContaining('test-workspace')
      );
    });
    
    test('should handle workspace creation failure', async () => {
      fs.mkdir.mockRejectedValueOnce(new Error('Permission denied'));
      
      const result = await service.createWorkspace();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
      expect(service.workspaceStats.failed).toBe(1);
    });
    
    test('should enforce workspace limits', async () => {
      // Create max workspaces
      service.options.maxWorkspaces = 1;
      await service.createWorkspace({ name: 'workspace1' });
      
      // Try to create another
      const result = await service.createWorkspace({ name: 'workspace2' });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum number of workspaces');
    });
  });
  
  describe('getWorkspace', () => {
    let workspaceId;
    
    beforeEach(async () => {
      await service.initialize();
      const result = await service.createWorkspace({ name: 'test-workspace' });
      workspaceId = result.workspace.id;
    });
    
    test('should get existing workspace', async () => {
      const result = await service.getWorkspace(workspaceId);
      
      expect(result.success).toBe(true);
      expect(result.workspace.id).toBe(workspaceId);
      expect(result.workspace.name).toBe('test-workspace');
    });
    
    test('should load workspace from disk if not in memory', async () => {
      // Remove from memory
      service.activeWorkspaces.delete(workspaceId);
      
      // Mock reading from disk
      const workspaceData = {
        id: workspaceId,
        name: 'test-workspace',
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      };
      fs.readFile.mockResolvedValueOnce(JSON.stringify(workspaceData));
      
      const result = await service.getWorkspace(workspaceId);
      
      expect(result.success).toBe(true);
      expect(result.workspace.id).toBe(workspaceId);
    });
    
    test('should return error for non-existent workspace', async () => {
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));
      
      const result = await service.getWorkspace('non-existent');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Workspace not found');
    });
  });
  
  describe('updateWorkspaceStatus', () => {
    let workspaceId;
    
    beforeEach(async () => {
      await service.initialize();
      const result = await service.createWorkspace({ name: 'test-workspace' });
      workspaceId = result.workspace.id;
    });
    
    test('should update workspace status successfully', async () => {
      const result = await service.updateWorkspaceStatus(
        workspaceId,
        'completed',
        { result: 'success' }
      );
      
      expect(result.success).toBe(true);
      expect(result.workspace.status).toBe('completed');
      expect(result.workspace.metadata.result).toBe('success');
      
      // Should save updated metadata
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.workspace.json'),
        expect.stringContaining('completed')
      );
    });
  });
  
  describe('cleanupWorkspace', () => {
    let workspaceId;
    
    beforeEach(async () => {
      await service.initialize();
      const result = await service.createWorkspace({ name: 'test-workspace' });
      workspaceId = result.workspace.id;
    });
    
    test('should cleanup workspace successfully', async () => {
      // Mock workspace stats
      fs.readdir.mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'subdir', isDirectory: () => true }
      ]);
      
      const result = await service.cleanupWorkspace(workspaceId);
      
      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      
      // Should remove directory
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining(workspaceId),
        { recursive: true, force: true }
      );
      
      // Should remove from tracking
      expect(service.activeWorkspaces.has(workspaceId)).toBe(false);
      expect(service.workspaceStats.cleaned).toBe(1);
    });
    
    test('should handle cleanup errors gracefully', async () => {
      fs.rm.mockRejectedValueOnce(new Error('Permission denied'));
      
      const result = await service.cleanupWorkspace(workspaceId);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });
  
  describe('cleanupAllWorkspaces', () => {
    beforeEach(async () => {
      await service.initialize();
      // Create multiple workspaces
      await service.createWorkspace({ name: 'workspace1' });
      await service.createWorkspace({ name: 'workspace2' });
      await service.createWorkspace({ name: 'workspace3' });
    });
    
    test('should cleanup all workspaces', async () => {
      const result = await service.cleanupAllWorkspaces();
      
      expect(result.success).toBe(true);
      expect(result.results.total).toBe(3);
      expect(result.results.cleaned).toBe(3);
      expect(result.results.failed).toBe(0);
      expect(service.activeWorkspaces.size).toBe(0);
    });
  });
  
  describe('cleanupOrphanedWorkspaces', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    test('should cleanup old workspaces', async () => {
      // Mock directory listing
      fs.readdir.mockResolvedValue([
        { name: 'old-workspace', isDirectory: () => true },
        { name: 'recent-workspace', isDirectory: () => true }
      ]);
      
      // Mock old workspace metadata
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify({ createdAt: oldDate }))
        .mockResolvedValueOnce(JSON.stringify({ createdAt: recentDate }));
      
      const result = await service.cleanupOrphanedWorkspaces();
      
      expect(result.success).toBe(true);
      expect(result.cleaned).toBe(1); // Only old workspace should be cleaned
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('old-workspace'),
        { recursive: true, force: true }
      );
    });
    
    test('should cleanup workspaces without metadata', async () => {
      fs.readdir.mockResolvedValue([
        { name: 'invalid-workspace', isDirectory: () => true }
      ]);
      
      // Mock metadata read failure
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));
      
      const result = await service.cleanupOrphanedWorkspaces();
      
      expect(result.success).toBe(true);
      expect(result.cleaned).toBe(1);
    });
  });
  
  describe('disk usage monitoring', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    test('should calculate disk usage', async () => {
      // Mock directory stats
      fs.readdir.mockResolvedValue([
        { name: 'file1.txt', isDirectory: () => false },
        { name: 'file2.txt', isDirectory: () => false }
      ]);
      fs.stat.mockResolvedValue({ size: 1024 });
      
      const result = await service.getDiskUsage();
      
      expect(result.success).toBe(true);
      expect(result.data.totalSize).toBeGreaterThan(0);
      expect(result.data.usagePercentage).toBeDefined();
      expect(result.data.totalSizeFormatted).toBeDefined();
    });
  });
  
  describe('utility methods', () => {
    test('should format bytes correctly', () => {
      expect(service.formatBytes(0)).toBe('0 B');
      expect(service.formatBytes(1024)).toBe('1.0 KB');
      expect(service.formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(service.formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
    });
    
    test('should format duration correctly', () => {
      expect(service.formatDuration(1000)).toBe('1s');
      expect(service.formatDuration(60 * 1000)).toBe('1m 0s');
      expect(service.formatDuration(60 * 60 * 1000)).toBe('1h 0m');
      expect(service.formatDuration(24 * 60 * 60 * 1000)).toBe('1d 0h');
    });
  });
  
  describe('statistics', () => {
    beforeEach(async () => {
      await service.initialize();
    });
    
    test('should track workspace statistics', async () => {
      await service.createWorkspace({ name: 'workspace1' });
      const workspace2 = await service.createWorkspace({ name: 'workspace2' });
      await service.cleanupWorkspace(workspace2.workspace.id);
      
      const stats = service.getStats();
      
      expect(stats.created).toBe(2);
      expect(stats.cleaned).toBe(1);
      expect(stats.active).toBe(1);
      expect(stats.totalSizeFormatted).toBeDefined();
    });
    
    test('should get active workspaces list', async () => {
      await service.createWorkspace({ name: 'workspace1' });
      await service.createWorkspace({ name: 'workspace2' });
      
      const workspaces = service.getActiveWorkspaces();
      
      expect(workspaces).toHaveLength(2);
      expect(workspaces[0].name).toBe('workspace1');
      expect(workspaces[1].name).toBe('workspace2');
    });
  });
  
  describe('cleanup', () => {
    test('should cleanup service properly', () => {
      const removeAllListenersSpy = jest.spyOn(service, 'removeAllListeners');
      
      service.cleanup();
      
      expect(removeAllListenersSpy).toHaveBeenCalled();
    });
  });
});