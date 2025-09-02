import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportExportModal from '../../renderer/components/ImportExportModal';
import { UserPreferencesProvider } from '../../renderer/contexts/UserPreferencesContext';
import { UserPreferences } from '../../renderer/models/UserPreferences';
import { RecentJobsManager } from '../../shared/services/RecentJobsManager';

// Mock File.prototype.text to return the file content
Object.defineProperty(File.prototype, 'text', {
  value: function() {
    return Promise.resolve(this._content || '');
  },
  writable: true
});

// Integration test for the complete import/export workflow
describe('Import/Export Workflow Integration', () => {
  let userPreferences;
  let recentJobsManager;
  let mockContext;

  beforeEach(() => {
    userPreferences = new UserPreferences();
    recentJobsManager = new RecentJobsManager(userPreferences);
    
    mockContext = {
      preferences: userPreferences,
      recentJobsManager,
      updatePreferences: jest.fn(),
      resetPreferences: jest.fn()
    };
  });

  const TestWrapper = ({ children }) => {
    return (
      <UserPreferencesProvider value={mockContext}>
        {children}
      </UserPreferencesProvider>
    );
  };

  describe('Complete Export Workflow', () => {
    test('should export all settings with proper data structure', async () => {
      const user = userEvent.setup();
      
      // Setup test data
      userPreferences.setPreference('appearance.theme', 'dark');
      userPreferences.setPreference('general.language', 'es');
      userPreferences.addPreset({
        name: 'High Quality PDF',
        description: 'Best quality PDF conversion',
        settings: { quality: 'high', dpi: 300 }
      });
      recentJobsManager.addRecentJob({
        inputFile: 'document.pdf',
        outputFile: 'document.docx',
        format: 'docx',
        status: 'completed'
      });

      const onExportComplete = jest.fn();
      
      render(
        <TestWrapper>
          <ImportExportModal
            isOpen={true}
            mode="export"
            onClose={jest.fn()}
            onExport={jest.fn()}
            onExportComplete={onExportComplete}
            onImportComplete={jest.fn()}
            preferences={{
              appearance: { theme: 'light' },
              general: { language: 'en' }
            }}
          />
        </TestWrapper>
      );

      // Perform export
      const exportButton = screen.getByText('Export Settings');
      await user.click(exportButton);

      await waitFor(() => {
        expect(onExportComplete).toHaveBeenCalled();
      });

      // Verify the exported data structure
      const exportedData = userPreferences.exportData();
      expect(exportedData).toHaveProperty('appearance.theme', 'dark');
      expect(exportedData).toHaveProperty('general.language', 'es');
      expect(exportedData.savedPresets).toHaveLength(1);
      expect(exportedData.recentJobs).toHaveLength(1);
    });

    test('should export selective sections only', async () => {
      const user = userEvent.setup();
      
      // Setup test data
      userPreferences.setPreference('appearance.theme', 'dark');
      userPreferences.addPreset({ name: 'Test Preset' });
      recentJobsManager.addRecentJob({
        inputFile: 'test.pdf',
        outputFile: 'test.docx',
        format: 'docx',
        status: 'completed'
      });

      const onExportComplete = jest.fn();
      
      render(
        <TestWrapper>
          <ImportExportModal
            isOpen={true}
            mode="export"
            onClose={jest.fn()}
            onExport={jest.fn()}
            onExportComplete={onExportComplete}
            onImportComplete={jest.fn()}
            preferences={{
              appearance: { theme: 'light' },
              general: { language: 'en' }
            }}
          />
        </TestWrapper>
      );

      // Uncheck "All Settings" and select only "Presets Only"
      const allSettingsCheckbox = screen.getByLabelText('All Settings');
      const presetsOnlyCheckbox = screen.getByLabelText('Presets Only');
      
      await user.click(allSettingsCheckbox);
      await user.click(presetsOnlyCheckbox);

      const exportButton = screen.getByText('Export Settings');
      await user.click(exportButton);

      await waitFor(() => {
        expect(onExportComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Complete Import Workflow', () => {
    test('should import valid settings with merge strategy', async () => {
      const user = userEvent.setup();
      
      // Setup existing data
      userPreferences.setPreference('appearance.theme', 'light');
      userPreferences.addPreset({ name: 'Existing Preset' });

      const importData = {
        appearance: { theme: 'dark' },
        general: { language: 'fr' },
        savedPresets: [
          { id: 'new-1', name: 'Imported Preset', settings: { quality: 'high' } }
        ],
        recentJobs: [
          {
            id: 'job-1',
            inputFile: 'imported.pdf',
            outputFile: 'imported.docx',
            format: 'docx',
            status: 'completed',
            timestamp: new Date()
          }
        ]
      };

      const onImportComplete = jest.fn();
      const onImport = jest.fn().mockResolvedValue();
      
      render(
        <TestWrapper>
          <ImportExportModal
            isOpen={true}
            mode="import"
            onClose={jest.fn()}
            onImport={onImport}
            onImportComplete={onImportComplete}
            preferences={{
              appearance: { theme: 'light' },
              general: { language: 'en' }
            }}
          />
        </TestWrapper>
      );

      // Create and upload file
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify(importData)], 'settings.json', {
        type: 'application/json'
      });
      file._content = JSON.stringify(importData);

      await user.upload(fileInput, file);

      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        expect(screen.queryByText(/failed to read file/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Set merge strategy
      const mergeSelect = screen.getByDisplayValue('merge');
      await user.selectOptions(mergeSelect, 'merge');

      // Import the settings
      const importButton = screen.getByText('Import Preferences');
      await user.click(importButton);

      await waitFor(() => {
        expect(onImportComplete).toHaveBeenCalled();
      });

      // Verify the data was imported correctly
      expect(userPreferences.getPreference('appearance.theme')).toBe('dark');
      expect(userPreferences.getPreference('general.language')).toBe('fr');
      expect(userPreferences.getPresets()).toHaveLength(2); // Existing + imported
    });

    test('should handle replace strategy correctly', async () => {
      const user = userEvent.setup();
      
      // Setup existing data
      userPreferences.addPreset({ name: 'Existing Preset 1' });
      userPreferences.addPreset({ name: 'Existing Preset 2' });

      const importData = {
        savedPresets: [
          { id: 'new-1', name: 'Replacement Preset' }
        ]
      };

      const onImportComplete = jest.fn();
      const onImport = jest.fn().mockResolvedValue();
      
      render(
        <TestWrapper>
          <ImportExportModal
            isOpen={true}
            mode="import"
            onClose={jest.fn()}
            onImport={onImport}
            onImportComplete={onImportComplete}
            preferences={{
              appearance: { theme: 'light' },
              general: { language: 'en' }
            }}
          />
        </TestWrapper>
      );

      // Upload file
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify(importData)], 'settings.json', {
        type: 'application/json'
      });
      file._content = JSON.stringify(importData);

      await user.upload(fileInput, file);

      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        expect(screen.queryByText(/failed to read file/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Set replace strategy
      const mergeSelect = screen.getByDisplayValue('merge');
      await user.selectOptions(mergeSelect, 'replace');

      const importButton = screen.getByText('Import Preferences');
      await user.click(importButton);

      await waitFor(() => {
        expect(onImportComplete).toHaveBeenCalled();
      });

      // Verify existing presets were replaced
      expect(userPreferences.getPresets()).toHaveLength(1);
      expect(userPreferences.getPresets()[0].name).toBe('Replacement Preset');
    });

    test('should handle selective import correctly', async () => {
      const user = userEvent.setup();
      
      const importData = {
        preferences: {
          appearance: { theme: 'dark' }
        },
        presets: [
          { id: 'new-1', name: 'Imported Preset' }
        ],
        recentJobs: [
          {
            id: 'job-1',
            inputFile: 'imported.pdf',
            outputFile: 'imported.docx',
            format: 'docx',
            status: 'completed'
          }
        ]
      };

      const onImportComplete = jest.fn();
      const onImport = jest.fn().mockResolvedValue();
      
      render(
        <TestWrapper>
          <ImportExportModal
            isOpen={true}
            mode="import"
            onClose={jest.fn()}
            onImport={onImport}
            onImportComplete={onImportComplete}
            preferences={{
              appearance: { theme: 'light' },
              general: { language: 'en' }
            }}
          />
        </TestWrapper>
      );

      // Upload file
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify(importData)], 'settings.json', {
        type: 'application/json'
      });
      file._content = JSON.stringify(importData);

      await user.upload(fileInput, file);

      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        expect(screen.queryByText(/failed to read file/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Set selective strategy
      const mergeSelect = screen.getByDisplayValue('merge');
      await user.selectOptions(mergeSelect, 'selective');

      await waitFor(() => {
        expect(screen.getByText('Select sections to import:')).toBeInTheDocument();
      });

      // Select only appearance settings
      const appearanceCheckbox = screen.getByLabelText('Appearance Settings');
      await user.click(appearanceCheckbox);

      const importButton = screen.getByText('Import Preferences');
      await user.click(importButton);

      await waitFor(() => {
        expect(onImportComplete).toHaveBeenCalled();
      });

      // Verify only appearance was imported
      expect(userPreferences.getPreference('appearance.theme')).toBe('dark');
      expect(userPreferences.getPresets()).toHaveLength(0); // Should not be imported
    });
  });

  describe('Backup and Restore Workflow', () => {
    test('should create backup before import and allow restore', async () => {
      const user = userEvent.setup();
      
      // Setup existing data
      userPreferences.setPreference('appearance.theme', 'light');
      userPreferences.addPreset({ name: 'Original Preset' });

      const importData = {
        preferences: {
          appearance: { theme: 'dark' }
        },
        presets: []
      };

      const onImportComplete = jest.fn();
      const onImport = jest.fn().mockResolvedValue();
      
      render(
        <TestWrapper>
          <ImportExportModal
            isOpen={true}
            mode="import"
            onClose={jest.fn()}
            onImport={onImport}
            onImportComplete={onImportComplete}
            preferences={{
              appearance: { theme: 'light' },
              general: { language: 'en' }
            }}
          />
        </TestWrapper>
      );

      // Upload file first (backup option only appears after file selection)
      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify(importData)], 'settings.json', {
        type: 'application/json'
      });
      file._content = JSON.stringify(importData);

      await user.upload(fileInput, file);

      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        expect(screen.queryByText(/failed to read file/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Enable backup creation (now that file is loaded)
      const backupCheckbox = screen.getByLabelText('Create backup before import');
      await user.click(backupCheckbox);

      const importButton = screen.getByText('Import Preferences');
      await user.click(importButton);

      await waitFor(() => {
        expect(onImportComplete).toHaveBeenCalled();
      });

      // Verify backup was created and data was imported
      expect(onImport).toHaveBeenCalledWith(
        importData,
        expect.objectContaining({
          strategy: 'merge',
          createBackup: true
        })
      );
    });
  });

  describe('Error Handling Workflow', () => {
    test('should handle validation errors gracefully', async () => {
      const user = userEvent.setup();
      
      const invalidData = {
        preferences: {
          invalidField: 'invalid value',
          appearance: 'not an object'
        }
      };

      const onImport = jest.fn().mockResolvedValue();
      
      render(
        <TestWrapper>
          <ImportExportModal
            isOpen={true}
            mode="import"
            onClose={jest.fn()}
            onImport={onImport}
            onImportComplete={jest.fn()}
            preferences={{
              appearance: { theme: 'light' },
              general: { language: 'en' }
            }}
          />
        </TestWrapper>
      );

      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      const file = new File([JSON.stringify(invalidData)], 'invalid.json', {
        type: 'application/json'
      });
      file._content = JSON.stringify(invalidData);

      await user.upload(fileInput, file);

      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        const errorElement = document.querySelector('.error-message');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement.textContent).toContain('Failed to read file');
      }, { timeout: 3000 });

      // Import button should remain disabled
      const importButton = screen.getByText('Import Preferences');
      expect(importButton).toBeDisabled();
    });

    test('should handle file read errors', async () => {
      const user = userEvent.setup();
      
      const onImport = jest.fn().mockResolvedValue();
      
      render(
        <TestWrapper>
          <ImportExportModal
            isOpen={true}
            mode="import"
            onClose={jest.fn()}
            onImport={onImport}
            onImportComplete={jest.fn()}
            preferences={{
              appearance: { theme: 'light' },
              general: { language: 'en' }
            }}
          />
        </TestWrapper>
      );

      const fileInputLabel = screen.getByText(/choose preferences file/i);
      const fileInput = fileInputLabel.closest('label').querySelector('input[type="file"]');
      
      const file = new File([JSON.stringify({ preferences: { appearance: { theme: 'dark' } } })], 'settings.json', { type: 'application/json' });
      file._content = JSON.stringify({ preferences: { appearance: { theme: 'dark' } } });
      
      // Mock the text method on the specific file instance
      const mockText = jest.fn().mockRejectedValue(new Error('File read failed'));
      Object.defineProperty(file, 'text', {
        value: mockText,
        writable: true
      });

      await user.upload(fileInput, file);

      // Wait for file processing
      await new Promise(resolve => setTimeout(resolve, 100));

      await waitFor(() => {
        const errorElement = document.querySelector('.error-message');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement.textContent).toContain('Failed to read file');
      }, { timeout: 3000 });
    });
  });
});