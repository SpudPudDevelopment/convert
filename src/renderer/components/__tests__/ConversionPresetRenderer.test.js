/**
 * Test suite for ConversionPresetRenderer component
 * Tests React component functionality and user interactions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConversionPresetRenderer from '../ConversionPresetRenderer.js';

// Mock the useConversionPresets hook
const mockUseConversionPresets = {
  presets: [],
  templates: [],
  categories: ['Image', 'Video', 'Audio', 'Document'],
  loading: false,
  error: null,
  selectedPreset: null,
  searchQuery: '',
  filterCategory: 'All',
  sortBy: 'name',
  sortOrder: 'asc',
  loadPresets: jest.fn(),
  loadTemplates: jest.fn(),
  createPreset: jest.fn(),
  updatePreset: jest.fn(),
  deletePreset: jest.fn(),
  duplicatePreset: jest.fn(),
  createTemplate: jest.fn(),
  createFromTemplate: jest.fn(),
  importPresets: jest.fn(),
  exportPresets: jest.fn(),
  searchPresets: jest.fn(),
  validatePreset: jest.fn(),
  getStatistics: jest.fn(),
  setSelectedPreset: jest.fn(),
  setSearchQuery: jest.fn(),
  setFilterCategory: jest.fn(),
  setSortBy: jest.fn(),
  setSortOrder: jest.fn()
};

jest.mock('../../hooks/useConversionPresets.js', () => ({
  __esModule: true,
  useConversionPresets: () => mockUseConversionPresets
}));

// Mock console methods
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn()
};

describe('ConversionPresetRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock data
    mockUseConversionPresets.presets = [];
    mockUseConversionPresets.templates = [];
    mockUseConversionPresets.loading = false;
    mockUseConversionPresets.error = null;
    mockUseConversionPresets.selectedPreset = null;
    mockUseConversionPresets.searchQuery = '';
    mockUseConversionPresets.filterCategory = 'All';
  });

  describe('rendering', () => {
    it('should render the main preset management interface', () => {
      render(<ConversionPresetRenderer />);

      expect(screen.getByText('Conversion Presets')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search presets...')).toBeInTheDocument();
      expect(screen.getByText('Create New Preset')).toBeInTheDocument();
    });

    it('should render loading state', () => {
      mockUseConversionPresets.loading = true;

      render(<ConversionPresetRenderer />);

      expect(screen.getByText('Loading presets...')).toBeInTheDocument();
    });

    it('should render error state', () => {
      mockUseConversionPresets.error = 'Failed to load presets';

      render(<ConversionPresetRenderer />);

      expect(screen.getByText('Error: Failed to load presets')).toBeInTheDocument();
    });

    it('should render empty state when no presets', () => {
      render(<ConversionPresetRenderer />);

      expect(screen.getByText('No presets found')).toBeInTheDocument();
      expect(screen.getByText('Create your first preset to get started')).toBeInTheDocument();
    });

    it('should render preset list when presets exist', () => {
      mockUseConversionPresets.presets = [
        {
          id: '1',
          name: 'High Quality Image',
          category: 'Image',
          description: 'High quality image conversion',
          settings: { quality: 95 },
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          name: 'Web Optimized',
          category: 'Image',
          description: 'Optimized for web use',
          settings: { quality: 80, width: 1920 },
          createdAt: '2024-01-02T00:00:00Z'
        }
      ];

      render(<ConversionPresetRenderer />);

      expect(screen.getByText('High Quality Image')).toBeInTheDocument();
      expect(screen.getByText('Web Optimized')).toBeInTheDocument();
      expect(screen.getByText('High quality image conversion')).toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('should update search query when typing in search input', async () => {
      const user = userEvent.setup();
      render(<ConversionPresetRenderer />);

      const searchInput = screen.getByPlaceholderText('Search presets...');
      await user.type(searchInput, 'test query');

      // Check that setSearchQuery was called with the final character
      expect(mockUseConversionPresets.setSearchQuery).toHaveBeenLastCalledWith('y');
      // Check that it was called the correct number of times (10 characters)
      expect(mockUseConversionPresets.setSearchQuery).toHaveBeenCalledTimes(10);
    });

    it('should clear search when clear button is clicked', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.searchQuery = 'existing query';

      render(<ConversionPresetRenderer />);

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);

      expect(mockUseConversionPresets.setSearchQuery).toHaveBeenCalledWith('');
    });
  });

  describe('filtering and sorting', () => {
    it('should render category filter dropdown', () => {
      render(<ConversionPresetRenderer />);

      const categorySelect = screen.getByLabelText('Filter by category');
      expect(categorySelect).toBeInTheDocument();
      
      // Check if categories are rendered as options
      expect(screen.getByText('All Categories')).toBeInTheDocument();
      expect(screen.getByText('Image')).toBeInTheDocument();
      expect(screen.getByText('Video')).toBeInTheDocument();
    });

    it('should update filter category when selection changes', async () => {
      const user = userEvent.setup();
      render(<ConversionPresetRenderer />);

      const categorySelect = screen.getByLabelText('Filter by category');
      await user.selectOptions(categorySelect, 'Image');

      expect(mockUseConversionPresets.setFilterCategory).toHaveBeenCalledWith('Image');
    });

    it('should render sort controls', () => {
      render(<ConversionPresetRenderer />);

      expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
      expect(screen.getByLabelText('Sort order')).toBeInTheDocument();
    });

    it('should update sort settings when changed', async () => {
      const user = userEvent.setup();
      render(<ConversionPresetRenderer />);

      const sortBySelect = screen.getByLabelText('Sort by');
      await user.selectOptions(sortBySelect, 'createdAt');

      expect(mockUseConversionPresets.setSortBy).toHaveBeenCalledWith('createdAt');

      const sortOrderSelect = screen.getByLabelText('Sort order');
      await user.selectOptions(sortOrderSelect, 'desc');

      expect(mockUseConversionPresets.setSortOrder).toHaveBeenCalledWith('desc');
    });
  });

  describe('preset creation', () => {
    it('should open create preset modal when create button is clicked', async () => {
      const user = userEvent.setup();
      render(<ConversionPresetRenderer />);

      const createButton = screen.getByText('Create New Preset');
      await user.click(createButton);

      expect(screen.getByText('Create Preset')).toBeInTheDocument();
      expect(screen.getByLabelText('Preset Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Category')).toBeInTheDocument();
    });

    it('should create preset when form is submitted', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.createPreset.mockResolvedValue({
        success: true,
        preset: {
          id: '3',
          name: 'New Preset',
          category: 'Image',
          settings: {}
        }
      });

      render(<ConversionPresetRenderer />);

      // Open create modal
      const createButton = screen.getByText('Create New Preset');
      await user.click(createButton);

      // Fill form
      const nameInput = screen.getByLabelText('Preset Name');
      await user.type(nameInput, 'New Preset');

      const categorySelect = screen.getByLabelText('Category');
      await user.selectOptions(categorySelect, 'Image');

      const descriptionInput = screen.getByLabelText('Description');
      await user.type(descriptionInput, 'Test description');

      // Submit form
      const submitButton = screen.getByText('Create Preset');
      await user.click(submitButton);

      expect(mockUseConversionPresets.createPreset).toHaveBeenCalledWith({
        name: 'New Preset',
        category: 'Image',
        description: 'Test description',
        settings: {}
      });
    });

    it('should show validation errors for invalid form data', async () => {
      const user = userEvent.setup();
      render(<ConversionPresetRenderer />);

      // Open create modal
      const createButton = screen.getByText('Create New Preset');
      await user.click(createButton);

      // Remove required attribute to test custom validation
      const nameInput = screen.getByLabelText('Preset Name');
      nameInput.removeAttribute('required');
      const categorySelect = screen.getByLabelText('Category');
      categorySelect.removeAttribute('required');

      // Try to submit without required fields
      const submitButton = screen.getByText('Create Preset');
      await user.click(submitButton);

      // Wait for validation error to appear
      await waitFor(() => {
        const errorElement = document.querySelector('.field-error');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveTextContent('Preset name is required');
      });
    });
  });

  describe('preset actions', () => {
    beforeEach(() => {
      mockUseConversionPresets.presets = [
        {
          id: '1',
          name: 'Test Preset',
          category: 'Image',
          description: 'Test description',
          settings: { quality: 80 },
          createdAt: '2024-01-01T00:00:00Z'
        }
      ];
    });

    it('should select preset when clicked', async () => {
      const user = userEvent.setup();
      render(<ConversionPresetRenderer />);

      const presetCard = screen.getByText('Test Preset');
      await user.click(presetCard);

      expect(mockUseConversionPresets.setSelectedPreset).toHaveBeenCalledWith(
        mockUseConversionPresets.presets[0]
      );
    });

    it('should show preset actions menu', async () => {
      const user = userEvent.setup();
      render(<ConversionPresetRenderer />);

      const actionsButton = screen.getByLabelText('Preset actions');
      await user.click(actionsButton);

      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Duplicate')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('should duplicate preset when duplicate action is clicked', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.duplicatePreset.mockResolvedValue({
        success: true,
        preset: { ...mockUseConversionPresets.presets[0], id: '2', name: 'Test Preset (Copy)' }
      });

      render(<ConversionPresetRenderer />);

      const actionsButton = screen.getByLabelText('Preset actions');
      await user.click(actionsButton);

      const duplicateButton = screen.getByText('Duplicate');
      await user.click(duplicateButton);

      expect(mockUseConversionPresets.duplicatePreset).toHaveBeenCalledWith('1');
    });

    it('should delete preset when delete action is confirmed', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.deletePreset.mockResolvedValue({ success: true });
      
      // Mock window.confirm
      global.confirm = jest.fn(() => true);

      render(<ConversionPresetRenderer />);

      const actionsButton = screen.getByLabelText('Preset actions');
      await user.click(actionsButton);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Test Preset"?');
      expect(mockUseConversionPresets.deletePreset).toHaveBeenCalledWith('1');
    });

    it('should not delete preset when delete action is cancelled', async () => {
      const user = userEvent.setup();
      global.confirm = jest.fn(() => false);

      render(<ConversionPresetRenderer />);

      const actionsButton = screen.getByLabelText('Preset actions');
      await user.click(actionsButton);

      const deleteButton = screen.getByText('Delete');
      await user.click(deleteButton);

      expect(mockUseConversionPresets.deletePreset).not.toHaveBeenCalled();
    });
  });

  describe('preset editing', () => {
    beforeEach(() => {
      mockUseConversionPresets.presets = [
        {
          id: '1',
          name: 'Test Preset',
          category: 'Image',
          description: 'Test description',
          settings: { quality: 80 },
          createdAt: '2024-01-01T00:00:00Z'
        }
      ];
    });

    it('should open edit modal when edit action is clicked', async () => {
      const user = userEvent.setup();
      render(<ConversionPresetRenderer />);

      const actionsButton = screen.getByLabelText('Preset actions');
      await user.click(actionsButton);

      const editButton = screen.getByText('Edit');
      await user.click(editButton);

      expect(screen.getByText('Edit Preset')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Preset')).toBeInTheDocument();
    });

    it('should update preset when edit form is submitted', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.updatePreset.mockResolvedValue({
        success: true,
        preset: {
          ...mockUseConversionPresets.presets[0],
          name: 'Updated Preset'
        }
      });

      render(<ConversionPresetRenderer />);

      // Open edit modal
      const actionsButton = screen.getByLabelText('Preset actions');
      await user.click(actionsButton);
      const editButton = screen.getByText('Edit');
      await user.click(editButton);

      // Update name
      const nameInput = screen.getByDisplayValue('Test Preset');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Preset');

      // Submit form
      const submitButton = screen.getByText('Update Preset');
      await user.click(submitButton);

      expect(mockUseConversionPresets.updatePreset).toHaveBeenCalledWith('1', {
        name: 'Updated Preset',
        category: 'Image',
        description: 'Test description',
        settings: { quality: 80 }
      });
    });
  });

  describe('import/export functionality', () => {
    it('should show import/export buttons', () => {
      render(<ConversionPresetRenderer />);

      expect(screen.getByText('Import Presets')).toBeInTheDocument();
      expect(screen.getByText('Export Presets')).toBeInTheDocument();
    });

    it('should trigger import when import button is clicked', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.importPresets.mockResolvedValue({
        success: true,
        imported: 5
      });

      render(<ConversionPresetRenderer />);

      const importButton = screen.getByText('Import Presets');
      await user.click(importButton);

      expect(mockUseConversionPresets.importPresets).toHaveBeenCalled();
    });

    it('should trigger export when export button is clicked', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.exportPresets.mockResolvedValue({
        success: true,
        exported: 3
      });

      render(<ConversionPresetRenderer />);

      const exportButton = screen.getByText('Export Presets');
      await user.click(exportButton);

      expect(mockUseConversionPresets.exportPresets).toHaveBeenCalled();
    });
  });

  describe('template functionality', () => {
    beforeEach(() => {
      mockUseConversionPresets.templates = [
        {
          id: 'template-1',
          name: 'High Quality Template',
          category: 'Image',
          description: 'Template for high quality images',
          settings: { quality: 95 }
        }
      ];
    });

    it('should render templates section', () => {
      render(<ConversionPresetRenderer />);

      expect(screen.getByText('Templates')).toBeInTheDocument();
      expect(screen.getByText('High Quality Template')).toBeInTheDocument();
    });

    it('should create preset from template when template is clicked', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.createFromTemplate.mockResolvedValue({
        success: true,
        preset: {
          id: '3',
          name: 'High Quality Template',
          category: 'Image',
          settings: { quality: 95 }
        }
      });

      render(<ConversionPresetRenderer />);

      const templateCard = screen.getByText('High Quality Template');
      await user.click(templateCard);

      expect(mockUseConversionPresets.createFromTemplate).toHaveBeenCalledWith('template-1');
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ConversionPresetRenderer />);

      expect(screen.getByLabelText('Search presets')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
      expect(screen.getByLabelText('Sort by')).toBeInTheDocument();
      expect(screen.getByLabelText('Sort order')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.presets = [
        {
          id: '1',
          name: 'Test Preset',
          category: 'Image',
          settings: { quality: 80 }
        }
      ];

      render(<ConversionPresetRenderer />);

      const presetCard = screen.getByLabelText('Select preset Test Preset');
      
      // Should be focusable
      presetCard.focus();
      expect(presetCard).toHaveFocus();

      // Should respond to Enter key
      await user.keyboard('{Enter}');
      expect(mockUseConversionPresets.setSelectedPreset).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should display error messages for failed operations', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.createPreset.mockResolvedValue({
        success: false,
        error: 'Preset name already exists'
      });

      render(<ConversionPresetRenderer />);

      // Open create modal and submit
      const createButton = screen.getByText('Create New Preset');
      await user.click(createButton);

      const nameInput = screen.getByLabelText('Preset Name');
      await user.type(nameInput, 'Duplicate Name');

      const categorySelect = screen.getByLabelText('Category');
      await user.selectOptions(categorySelect, 'Image');

      const submitButton = screen.getByText('Create Preset');
      await user.click(submitButton);

      await waitFor(() => {
        const errorElement = document.querySelector('.modal-error');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveTextContent('Preset name already exists');
      });
    });

    it('should handle network errors gracefully', async () => {
      const user = userEvent.setup();
      mockUseConversionPresets.createPreset.mockRejectedValue(new Error('Network error'));

      render(<ConversionPresetRenderer />);

      const createButton = screen.getByText('Create New Preset');
      await user.click(createButton);

      const nameInput = screen.getByLabelText('Preset Name');
      await user.type(nameInput, 'Test Preset');

      const categorySelect = screen.getByLabelText('Category');
      await user.selectOptions(categorySelect, 'Image');

      const submitButton = screen.getByText('Create Preset');
      await user.click(submitButton);

      await waitFor(() => {
        const errorElement = document.querySelector('.modal-error');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement).toHaveTextContent('An error occurred while creating the preset');
      }, { timeout: 3000 });
    });
  });
});