/**
 * Basic E2E Test
 * Simple test to verify the E2E testing setup works
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TEST_CONFIG, TestUtils } from '../testConfig';

// Mock services
jest.mock('../../shared/services/UnifiedConversionService');
jest.mock('../../shared/services/JobQueue');
jest.mock('../../shared/services/QueueManager');

// Mock IPC - electronAPI is already defined in setupTests.js
const mockElectronAPI = window.electronAPI;

describe('Basic E2E Test Setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  test('should be able to render basic React components', () => {
    const TestComponent = () => <div data-testid="test-component">Test Component</div>;
    
    render(<TestComponent />);
    
    const element = screen.getByTestId('test-component');
    expect(element).toBeInTheDocument();
    expect(element.textContent).toBe('Test Component');
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
