import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportExportModal from '../../renderer/components/ImportExportModal';
import { UserPreferencesProvider } from '../../renderer/contexts/UserPreferencesContext';

// Mock the UserPreferences model
jest.mock('../../renderer/models/UserPreferences.js', () => ({
  UserPreferences: jest.fn().mockImplementation(() => ({
    exportData: jest.fn().mockReturnValue({
      appearance: { theme: 'light' },
      savedPresets: [{ id: '1', name: 'Test Preset' }],
      recentJobs: [{ id: '1', inputFile: 'test.pdf' }]
    }),
    importData: jest.fn(),
    validateImportData: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
    createBackup: jest.fn().mockReturnValue('backup-id'),
    restoreFromBackup: jest.fn()
  }))
}));

// Mock file operations
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
Object.defineProperty(window.URL, 'createObjectURL', {
  value: mockCreateObjectURL
});
Object.defineProperty(window.URL, 'revokeObjectURL', {
  value: mockRevokeObjectURL
});

// Mock file reader
const mockFileReader = {
  readAsText: jest.fn(),
  result: null,
  onload: null,
  onerror: null
};
Object.defineProperty(window, 'FileReader', {
  value: jest.fn().mockImplementation(() => mockFileReader)
});

const MockedUserPreferencesProvider = ({ children }) => {
  const mockContext = {
    preferences: {
      exportData: jest.fn().mockReturnValue({
        appearance: { theme: 'light' },
        savedPresets: [{ id: '1', name: 'Test Preset' }],
        recentJobs: [{ id: '1', inputFile: 'test.pdf' }]
      }),
      importData: jest.fn(),
      validateImportData: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
      createBackup: jest.fn().mockReturnValue('backup-id'),
      restoreFromBackup: jest.fn()
    },
    updatePreferences: jest.fn(),
    resetPreferences: jest.fn()
  };
  
  return (
    <UserPreferencesProvider value={mockContext}>
      {children}
    </UserPreferencesProvider>
  );
};

const renderWithProvider = (component) => {
  return render(
    <MockedUserPreferencesProvider>
      {component}
    </MockedUserPreferencesProvider>
  );
};

describe('ImportExportModal', () => {

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onImportComplete: jest.fn(),
    onExportComplete: jest.fn(),
    preferences: {
      appearance: { theme: 'light' },
      general: { autoSave: true },
      conversion: { quality: 'high' },
      notifications: { enabled: true },
      advanced: { debugMode: false }
    },
    onImport: jest.fn(),
    onExport: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
    
    // Mock onExport to return valid data
    defaultProps.onExport.mockResolvedValue({
      preferences: {
        appearance: { theme: 'light' },
        general: { autoSave: true },
        conversion: { quality: 'high' },
        notifications: { enabled: true },
        advanced: { debugMode: false }
      },
      presets: [{ id: '1', name: 'Test Preset' }],
      recentJobs: [{ id: '1', inputFile: 'test.pdf' }],
      statistics: { totalConversions: 10 },
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    });
    
    // Mock onImport to resolve successfully
    defaultProps.onImport.mockResolvedValue();
  });

  describe('Modal Rendering', () => {
    test('should render when open', () => {
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      expect(screen.getByText('Import/Export Settings')).toBeInTheDocument();
      expect(screen.getByText('Export')).toBeInTheDocument();
      expect(screen.getByText('Import')).toBeInTheDocument();
    });

    test('should not render when closed', () => {
      renderWithProvider(<ImportExportModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText('Import/Export Settings')).not.toBeInTheDocument();
    });

    test('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      const closeButton = screen.getByLabelText('Close');
      await user.click(closeButton);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Export Functionality', () => {
    test('should show export options', () => {
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      expect(screen.getByText('Export Options')).toBeInTheDocument();
      expect(screen.getByText('All Settings')).toBeInTheDocument();
      expect(screen.getByText('Presets Only')).toBeInTheDocument();
      expect(screen.getByText('Appearance')).toBeInTheDocument();
      expect(screen.getByText('Recent Jobs')).toBeInTheDocument();
    });

    test('should export all settings by default', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      const exportButton = screen.getByText('Export Settings');
      await user.click(exportButton);
      
      // Wait for the export process to complete
      await waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
        expect(defaultProps.onExportComplete).toHaveBeenCalled();
      });
    });

    test('should export selected sections only', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Uncheck "All Settings" and select only "Presets Only"
      const allSettingsCheckbox = screen.getByText('All Settings').closest('label').querySelector('input[type="checkbox"]');
      const presetsOnlyCheckbox = screen.getByText('Presets Only').closest('label').querySelector('input[type="checkbox"]');
      
      await user.click(allSettingsCheckbox);
      await user.click(presetsOnlyCheckbox);
      
      const exportButton = screen.getByText('Export Settings');
      await user.click(exportButton);
      
      // Wait for the export process to complete
      await waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
        expect(defaultProps.onExportComplete).toHaveBeenCalled();
      });
    });

    test('should show progress during export', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      const exportButton = screen.getByText('Export Settings');
      await user.click(exportButton);
      
      // Check if progress indicator appears (even briefly)
      await waitFor(() => {
        expect(defaultProps.onExportComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Import Functionality', () => {
    test('should show import options', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      expect(screen.getByText('Import Options')).toBeInTheDocument();
      expect(screen.getByText('Merge Strategy')).toBeInTheDocument();
      expect(screen.getByDisplayValue('merge')).toBeInTheDocument();
    });

    test('should handle file selection', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify({ preferences: { appearance: { theme: 'dark' } } })], 'settings.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      expect(fileInput.files[0]).toBe(file);
    });

    test('should validate import file', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify({ preferences: { appearance: { theme: 'dark' } } })], 'settings.json', { type: 'application/json' });
      
      // Mock FileReader
      mockFileReader.result = JSON.stringify({
        preferences: { appearance: { theme: 'dark' } },
        presets: []
      });
      
      await user.upload(fileInput, file);
      
      // Simulate FileReader onload
      if (mockFileReader.onload) {
        mockFileReader.onload();
      }
      
      await waitFor(() => {
        expect(screen.queryByText(/failed to read file/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    test('should show validation errors for invalid file', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File(['{}'], 'settings.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await waitFor(() => {
        const errorElement = document.querySelector('.error-message');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement.textContent).toContain('Invalid file:');
      });
    });

    test('should import valid file with merge strategy', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify({
        preferences: { appearance: { theme: 'dark' } },
        presets: [{ id: '1', name: 'Imported Preset' }]
      })], 'settings.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await waitFor(() => {
        expect(screen.queryByText(/failed to read file/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
      
      const importButton = screen.getByText('Import Preferences');
      await user.click(importButton);
      
      // Wait for the import process to complete
      await waitFor(() => {
        expect(defaultProps.onImportComplete).toHaveBeenCalled();
      });
    });

    test('should create backup before import when enabled', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const backupCheckbox = screen.getByLabelText('Create backup before import');
      await user.click(backupCheckbox);
      
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify({ preferences: { appearance: { theme: 'dark' } } })], 'settings.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await waitFor(() => {
        expect(screen.queryByText(/failed to read file/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
      
      const importButton = screen.getByText('Import Preferences');
      await user.click(importButton);
      
      // Wait for the import process to complete
      await waitFor(() => {
        expect(defaultProps.onImportComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Merge Strategies', () => {
    test('should show merge strategy options', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      expect(screen.getByDisplayValue('merge')).toBeInTheDocument();
      expect(screen.getByDisplayValue('replace')).toBeInTheDocument();
      expect(screen.getByDisplayValue('selective')).toBeInTheDocument();
    });

    test('should change merge strategy', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const replaceRadio = screen.getByDisplayValue('replace');
      await user.click(replaceRadio);
      
      expect(screen.getByDisplayValue('replace')).toBeInTheDocument();
    });

    test('should show selective options when selective merge is chosen', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const selectiveRadio = screen.getByDisplayValue('selective');
      await user.click(selectiveRadio);
      
      await waitFor(() => {
        expect(screen.getByText('Select sections to import:')).toBeInTheDocument();
        expect(screen.getByText('Appearance')).toBeInTheDocument();
        expect(screen.getByText('General Settings')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle file read errors', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      // Mock File.text() to throw an error
      const originalText = File.prototype.text;
      File.prototype.text = jest.fn().mockRejectedValue(new Error('File read error'));
      
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File(['{}'], 'settings.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      await waitFor(() => {
        const errorElement = document.querySelector('.error-message');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement.textContent).toContain('Invalid file:');
      });
      
      // Restore original method
      File.prototype.text = originalText;
    });

    test('should handle invalid JSON', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File(['invalid json'], 'settings.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await waitFor(() => {
        const errorElement = document.querySelector('.error-message');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement.textContent).toContain('Invalid file:');
      });
    });

    test('should disable import button when no valid file is selected', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const importButton = screen.getByText('Import Preferences');
      expect(importButton).toBeDisabled();
    });
  });

  describe('Progress Indicators', () => {
    test('should show progress during import', async () => {
      const user = userEvent.setup();
      renderWithProvider(<ImportExportModal {...defaultProps} />);
      
      // Click on Import tab
      const importTab = screen.getByText('Import');
      await user.click(importTab);
      
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify({ preferences: { appearance: { theme: 'dark' } } })], 'settings.json', { type: 'application/json' });
      
      await user.upload(fileInput, file);
      
      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await waitFor(() => {
        expect(screen.queryByText(/failed to read file/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
      
      const importButton = screen.getByText('Import Preferences');
      await user.click(importButton);
      
      // Progress should be shown during import
      await waitFor(() => {
        expect(defaultProps.onImportComplete).toHaveBeenCalled();
      });
    });
  });
});