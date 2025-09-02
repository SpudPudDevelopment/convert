const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event');
const { RecentJobsList } = require('../../renderer/components/RecentJobsList.js');
const { ConversionType, JobStatus } = require('../../shared/types/jobEnums.js');

// Mock the hooks
jest.mock('../../renderer/hooks/useRecentJobs.js', () => ({
  useRecentJobs: jest.fn(),
  useRecentJobsFilter: jest.fn()
}));

import { useRecentJobs, useRecentJobsFilter } from '../../renderer/hooks/useRecentJobs.js';

describe('RecentJobsList', () => {
  let mockJobs;
  let mockUseRecentJobs;
  let mockUseRecentJobsFilter;
  let mockOnReuseSettings;
  let mockOnJobSelect;
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    
    mockJobs = [
      {
        id: '1',
        name: 'image-conversion',
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        sourceFiles: [{ name: 'test.jpg', size: 1024 }],
        outputFormat: 'png',
        fileSize: 1024,
        duration: 5000,
        createdAt: Date.now() - 1000,
        settings: { quality: 90 },
        presetUsed: 'high-quality'
      },
      {
        id: '2',
        name: 'video-conversion',
        type: ConversionType.VIDEO,
        status: JobStatus.FAILED,
        sourceFiles: [{ name: 'test.mp4', size: 2048 }],
        outputFormat: 'avi',
        fileSize: 2048,
        duration: 0,
        createdAt: Date.now() - 2000,
        settings: { bitrate: 1000 },
        error: 'Conversion failed'
      },
      {
        id: '3',
        name: 'audio-conversion',
        type: ConversionType.AUDIO,
        status: JobStatus.COMPLETED,
        sourceFiles: [{ name: 'test.mp3', size: 512 }],
        outputFormat: 'wav',
        fileSize: 512,
        duration: 3000,
        createdAt: Date.now() - 3000,
        settings: { sampleRate: 44100 }
      }
    ];

    mockUseRecentJobs = {
      jobs: mockJobs,
      removeJob: jest.fn(),
      clearAllJobs: jest.fn(),
      cleanup: jest.fn(),
      isLoading: false,
      error: null
    };

    mockUseRecentJobsFilter = {
      filteredJobs: mockJobs,
      filters: {
        type: '',
        status: '',
        search: '',
        dateRange: null,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      },
      updateFilter: jest.fn(),
      resetFilters: jest.fn()
    };

    mockOnReuseSettings = jest.fn();
    mockOnJobSelect = jest.fn();

    useRecentJobs.mockReturnValue(mockUseRecentJobs);
    useRecentJobsFilter.mockReturnValue(mockUseRecentJobsFilter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render recent jobs list', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('Recent Jobs')).toBeInTheDocument();
      expect(screen.getByText('image-conversion')).toBeInTheDocument();
      expect(screen.getByText('video-conversion')).toBeInTheDocument();
      expect(screen.getByText('audio-conversion')).toBeInTheDocument();
    });

    it('should display job statistics', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('3 jobs')).toBeInTheDocument();
    });

    it('should show empty state when no jobs', () => {
      useRecentJobs.mockReturnValue({
        ...mockUseRecentJobs,
        jobs: []
      });
      useRecentJobsFilter.mockReturnValue({
        ...mockUseRecentJobsFilter,
        filteredJobs: []
      });

      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('No recent jobs found')).toBeInTheDocument();
    });

    it('should display loading state', () => {
      useRecentJobs.mockReturnValue({
        ...mockUseRecentJobs,
        isLoading: true
      });

      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('Loading recent jobs...')).toBeInTheDocument();
    });

    it('should display error state', () => {
      useRecentJobs.mockReturnValue({
        ...mockUseRecentJobs,
        error: 'Failed to load jobs'
      });

      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('Error: Failed to load jobs')).toBeInTheDocument();
    });
  });

  describe('job display', () => {
    it('should display job details correctly', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      // Check first job details
      expect(screen.getByText('image-conversion')).toBeInTheDocument();
      expect(screen.getByText('✅')).toBeInTheDocument(); // Completed status
      expect(screen.getByText('🖼️')).toBeInTheDocument(); // Image type icon
      expect(screen.getByText('PNG')).toBeInTheDocument(); // Output format
      expect(screen.getByText('1.0 KB')).toBeInTheDocument(); // File size
      expect(screen.getByText('5.0s')).toBeInTheDocument(); // Duration
    });

    it('should display failed job with error', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('video-conversion')).toBeInTheDocument();
      expect(screen.getByText('❌')).toBeInTheDocument(); // Failed status
      expect(screen.getByText('Conversion failed')).toBeInTheDocument();
    });

    it('should format dates correctly', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      // Should show relative time like "1 second ago"
      expect(screen.getByText(/ago/)).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('should render filter controls', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
          showFilters={true}
        />
      );

      expect(screen.getByDisplayValue('All Types')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All Status')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search jobs...')).toBeInTheDocument();
    });

    it('should call updateFilter when type filter changes', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
          showFilters={true}
        />
      );

      const typeSelect = screen.getByDisplayValue('All Types');
      await user.selectOptions(typeSelect, ConversionType.IMAGE);

      expect(mockUseRecentJobsFilter.updateFilter).toHaveBeenCalledWith('type', ConversionType.IMAGE);
    });

    it('should call updateFilter when status filter changes', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
          showFilters={true}
        />
      );

      const statusSelect = screen.getByDisplayValue('All Status');
      await user.selectOptions(statusSelect, JobStatus.COMPLETED);

      expect(mockUseRecentJobsFilter.updateFilter).toHaveBeenCalledWith('status', JobStatus.COMPLETED);
    });

    it('should call updateFilter when search input changes', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
          showFilters={true}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search jobs...');
      await user.type(searchInput, 'image');

      expect(mockUseRecentJobsFilter.updateFilter).toHaveBeenCalledWith('search', 'image');
    });

    it('should call updateFilter when sort options change', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
          showFilters={true}
        />
      );

      const sortSelect = screen.getByDisplayValue('Date');
      await user.selectOptions(sortSelect, 'name');

      expect(mockUseRecentJobsFilter.updateFilter).toHaveBeenCalledWith('sortBy', 'name');
    });
  });

  describe('job selection', () => {
    it('should handle individual job selection', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      const firstJobCheckbox = checkboxes[1]; // Skip "Select All" checkbox
      
      await user.click(firstJobCheckbox);

      expect(firstJobCheckbox).toBeChecked();
    });

    it('should handle select all functionality', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const selectAllCheckbox = screen.getByLabelText(/Select All/);
      await user.click(selectAllCheckbox);

      expect(selectAllCheckbox).toBeChecked();
    });

    it('should show remove selected button when jobs are selected', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      const firstJobCheckbox = checkboxes[1];
      
      await user.click(firstJobCheckbox);

      expect(screen.getByText(/Remove Selected/)).toBeInTheDocument();
    });
  });

  describe('job actions', () => {
    it('should call onReuseSettings when reuse button is clicked', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const reuseButtons = screen.getAllByTitle('Reuse these settings');
      await user.click(reuseButtons[0]);

      expect(mockOnReuseSettings).toHaveBeenCalledWith(
        mockJobs[0].settings,
        mockJobs[0].presetUsed
      );
    });

    it('should call removeJob when remove button is clicked', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const removeButtons = screen.getAllByTitle('Remove from history');
      await user.click(removeButtons[0]);

      expect(mockUseRecentJobs.removeJob).toHaveBeenCalledWith('1');
    });

    it('should call cleanup when cleanup button is clicked', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const cleanupButton = screen.getByText('Cleanup Old');
      await user.click(cleanupButton);

      expect(mockUseRecentJobs.cleanup).toHaveBeenCalled();
    });

    it('should show confirmation dialog when clear all is clicked', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const clearAllButton = screen.getByText('Clear All');
      await user.click(clearAllButton);

      expect(screen.getByText('Clear All Recent Jobs?')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone. All job history will be permanently removed.')).toBeInTheDocument();
    });

    it('should call clearAllJobs when confirmation is accepted', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const clearAllButton = screen.getByText('Clear All');
      await user.click(clearAllButton);

      const confirmButton = screen.getByText('Clear All');
      await user.click(confirmButton);

      expect(mockUseRecentJobs.clearAllJobs).toHaveBeenCalled();
    });

    it('should close confirmation dialog when cancelled', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const clearAllButton = screen.getByText('Clear All');
      await user.click(clearAllButton);

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(screen.queryByText('Clear All Recent Jobs?')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByRole('region', { name: 'Recent Jobs' })).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox')).toHaveLength(4); // 3 jobs + select all
      expect(screen.getAllByRole('button')).toHaveLength(8); // Various action buttons
    });

    it('should support keyboard navigation', async () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const firstCheckbox = screen.getAllByRole('checkbox')[1];
      firstCheckbox.focus();
      
      await user.keyboard('{Space}');
      expect(firstCheckbox).toBeChecked();
    });
  });

  describe('responsive behavior', () => {
    it('should limit displayed jobs based on maxItems prop', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
          maxItems={2}
        />
      );

      const jobItems = screen.getAllByRole('listitem');
      expect(jobItems).toHaveLength(2);
      expect(screen.getByText('Showing 2 of 3 jobs')).toBeInTheDocument();
    });

    it('should handle compact mode', () => {
      render(
        <RecentJobsList
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
          compact={true}
        />
      );

      const container = screen.getByRole('region', { name: 'Recent Jobs' });
      expect(container).toHaveClass('compact');
    });
  });
});