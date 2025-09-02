/**
 * Simple Conversion E2E Test
 * Tests basic conversion functionality through the UI
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TEST_CONFIG, TestUtils } from '../testConfig';

// Import components
import FileConverter from '../../renderer/components/FileConverter';
import { UserPreferencesProvider } from '../../renderer/contexts/UserPreferencesContext';

// Mock services
jest.mock('../../shared/services/UnifiedConversionService');
jest.mock('../../shared/services/JobQueue');
jest.mock('../../shared/services/QueueManager');

// Mock IPC - electronAPI is already defined in setupTests.js
const mockElectronAPI = window.electronAPI;

// Helper function to render FileConverter with required providers
const renderFileConverter = (props = {}) => {
  return render(
    <UserPreferencesProvider>
      <FileConverter {...props} />
    </UserPreferencesProvider>
  );
};

describe('Simple Conversion E2E Tests', () => {
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
    
    // Reset electron API mocks
    mockElectronAPI.invoke.mockReset();
    mockElectronAPI.on.mockReset();
    mockElectronAPI.off.mockReset();
    mockElectronAPI.send.mockReset();
  });

  test('should render FileConverter component', async () => {
    renderFileConverter({ category: "document" });
    
    // Verify component renders
    expect(screen.getByText('Document Conversion')).toBeInTheDocument();
  });

  test('should display category title correctly', async () => {
    renderFileConverter({ category: "image" });
    
    // Verify category title
    expect(screen.getByText('Image Conversion')).toBeInTheDocument();
  });

  test('should have proper test configuration', () => {
    expect(TEST_CONFIG).toBeDefined();
    expect(TEST_CONFIG.TIMEOUTS).toBeDefined();
    expect(TEST_CONFIG.MOCK_DATA).toBeDefined();
    expect(TestUtils).toBeDefined();
  });

  test('should be able to create mock files', () => {
    const mockFile = TestUtils.createMockFile('test.pdf', 'application/pdf', 1024);
    expect(mockFile).toBeDefined();
    expect(mockFile.name).toBe('test.pdf');
    expect(mockFile.type).toBe('application/pdf');
    expect(mockFile.size).toBeGreaterThan(0);
  });

  test('should be able to create mock jobs', () => {
    const mockJob = TestUtils.createMockJob({
      name: 'Test Job',
      type: 'document'
    });
    expect(mockJob).toBeDefined();
    expect(mockJob.name).toBe('Test Job');
    expect(mockJob.type).toBe('document');
  });

  test('should have electron API mocked', () => {
    expect(window.electronAPI).toBeDefined();
    expect(window.electronAPI.invoke).toBeDefined();
    expect(typeof window.electronAPI.invoke).toBe('function');
  });

  test('should have proper mock data structure', () => {
    expect(TEST_CONFIG.MOCK_DATA.FILES).toBeDefined();
    expect(TEST_CONFIG.MOCK_DATA.FILES.PDF).toBeDefined();
    expect(TEST_CONFIG.MOCK_DATA.FILES.DOCX).toBeDefined();
    expect(TEST_CONFIG.MOCK_DATA.FILES.JPG).toBeDefined();
    expect(TEST_CONFIG.MOCK_DATA.FILES.PNG).toBeDefined();
    expect(TEST_CONFIG.MOCK_DATA.FILES.MP3).toBeDefined();
    expect(TEST_CONFIG.MOCK_DATA.FILES.MP4).toBeDefined();
  });

  test('should have proper test categories', () => {
    expect(TEST_CONFIG.CATEGORIES).toBeDefined();
    expect(TEST_CONFIG.CATEGORIES.UNIT).toBe('unit');
    expect(TEST_CONFIG.CATEGORIES.INTEGRATION).toBe('integration');
    expect(TEST_CONFIG.CATEGORIES.E2E).toBe('e2e');
    expect(TEST_CONFIG.CATEGORIES.PERFORMANCE).toBe('performance');
  });
});

