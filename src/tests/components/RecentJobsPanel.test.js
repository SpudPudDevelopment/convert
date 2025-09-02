const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event');
const { RecentJobsPanel } = require('../../renderer/components/RecentJobsPanel.js');
const { ConversionType, JobStatus } = require('../../shared/types/jobEnums.js');

// Mock the child components
jest.mock('../../renderer/components/RecentJobsList.js', () => ({
  default: jest.fn(({ onReuseSettings, onJobSelect, maxItems, compact, showFilters }) => (
    <div data-testid="recent-jobs-list">
      <div>Recent Jobs List</div>
      <div>maxItems: {maxItems}</div>
      <div>compact: {compact ? 'true' : 'false'}</div>
      <div>showFilters: {showFilters ? 'true' : 'false'}</div>
      <button onClick={() => onReuseSettings({ quality: 90 }, 'test-preset')}>Reuse Settings</button>
      <button onClick={() => onJobSelect('job-1')}>Select Job</button>
    </div>
  ))
}));

jest.mock('../../renderer/components/RecentJobsWidget.js', () => ({
  default: jest.fn(({ onReuseSettings, onJobSelect, maxItems }) => (
    <div data-testid="recent-jobs-widget">
      <div>Recent Jobs Widget</div>
      <div>maxItems: {maxItems}</div>
      <button onClick={() => onReuseSettings({ quality: 80 }, 'widget-preset')}>Widget Reuse</button>
      <button onClick={() => onJobSelect('widget-job')}>Widget Select</button>
    </div>
  ))
}));

// Mock the hooks
jest.mock('../../renderer/hooks/useRecentJobs.js', () => ({
  useRecentJobs: jest.fn(() => ({
    jobs: [
      {
        id: '1',
        name: 'test-job',
        type: ConversionType.IMAGE,
        status: JobStatus.COMPLETED,
        createdAt: Date.now()
      }
    ],
    isLoading: false,
    error: null
  }))
}));

describe('RecentJobsPanel', () => {
  let mockOnReuseSettings;
  let mockOnJobSelect;
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    mockOnReuseSettings = jest.fn();
    mockOnJobSelect = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render in widget mode by default', () => {
      render(
        <RecentJobsPanel
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByTestId('recent-jobs-widget')).toBeInTheDocument();
      expect(screen.queryByTestId('recent-jobs-list')).not.toBeInTheDocument();
    });

    it('should render in list mode when specified', () => {
      render(
        <RecentJobsPanel
          defaultViewMode="list"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByTestId('recent-jobs-list')).toBeInTheDocument();
      expect(screen.queryByTestId('recent-jobs-widget')).not.toBeInTheDocument();
    });

    it('should render collapsed when specified', () => {
      render(
        <RecentJobsPanel
          defaultViewMode="collapsed"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.queryByTestId('recent-jobs-widget')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recent-jobs-list')).not.toBeInTheDocument();
      expect(screen.getByText('Recent Jobs')).toBeInTheDocument();
    });

    it('should render panel header with title', () => {
      render(
        <RecentJobsPanel
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('Recent Jobs')).toBeInTheDocument();
    });

    it('should render view mode selector', () => {
      render(
        <RecentJobsPanel
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByTitle('Widget view')).toBeInTheDocument();
      expect(screen.getByTitle('List view')).toBeInTheDocument();
      expect(screen.getByTitle('Collapse panel')).toBeInTheDocument();
    });

    it('should render expand toggle when collapsed', () => {
      render(
        <RecentJobsPanel
          defaultViewMode="collapsed"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByTitle('Expand recent jobs panel')).toBeInTheDocument();
    });
  });

  describe('view mode switching', () => {
    it('should switch to widget mode when widget button is clicked', async () => {
      render(
        <RecentJobsPanel
          defaultViewMode="list"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const widgetButton = screen.getByTitle('Widget view');
      await user.click(widgetButton);

      expect(screen.getByTestId('recent-jobs-widget')).toBeInTheDocument();
      expect(screen.queryByTestId('recent-jobs-list')).not.toBeInTheDocument();
    });

    it('should switch to list mode when list button is clicked', async () => {
      render(
        <RecentJobsPanel
          defaultViewMode="widget"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const listButton = screen.getByTitle('List view');
      await user.click(listButton);

      expect(screen.getByTestId('recent-jobs-list')).toBeInTheDocument();
      expect(screen.queryByTestId('recent-jobs-widget')).not.toBeInTheDocument();
    });

    it('should collapse when collapse button is clicked', async () => {
      render(
        <RecentJobsPanel
          defaultViewMode="widget"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const collapseButton = screen.getByTitle('Collapse panel');
      await user.click(collapseButton);

      expect(screen.queryByTestId('recent-jobs-widget')).not.toBeInTheDocument();
      expect(screen.queryByTestId('recent-jobs-list')).not.toBeInTheDocument();
    });

    it('should expand when expand toggle is clicked', async () => {
      render(
        <RecentJobsPanel
          defaultViewMode="collapsed"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const expandButton = screen.getByTitle('Expand recent jobs panel');
      await user.click(expandButton);

      expect(screen.getByTestId('recent-jobs-widget')).toBeInTheDocument();
    });
  });

  describe('prop forwarding', () => {
    it('should forward onReuseSettings to child components', async () => {
      render(
        <RecentJobsPanel
          defaultViewMode="widget"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const reuseButton = screen.getByText('Widget Reuse');
      await user.click(reuseButton);

      expect(mockOnReuseSettings).toHaveBeenCalledWith({ quality: 80 }, 'widget-preset');
    });

    it('should forward onJobSelect to child components', async () => {
      render(
        <RecentJobsPanel
          defaultViewMode="widget"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const selectButton = screen.getByText('Widget Select');
      await user.click(selectButton);

      expect(mockOnJobSelect).toHaveBeenCalledWith('widget-job');
    });

    it('should forward maxItems to child components', () => {
      render(
        <RecentJobsPanel
          defaultViewMode="widget"
          maxItems={5}
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('maxItems: 5')).toBeInTheDocument();
    });

    it('should forward compact prop to RecentJobsList', () => {
      render(
        <RecentJobsPanel
          defaultViewMode="list"
          compact={true}
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('compact: true')).toBeInTheDocument();
    });

    it('should forward showFilters prop to RecentJobsList', () => {
      render(
        <RecentJobsPanel
          defaultViewMode="list"
          showFilters={true}
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByText('showFilters: true')).toBeInTheDocument();
    });
  });

  describe('CSS classes', () => {
    it('should apply correct CSS classes for different view modes', () => {
      const { rerender } = render(
        <RecentJobsPanel
          defaultViewMode="widget"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      let panel = screen.getByRole('region', { name: 'Recent Jobs Panel' });
      expect(panel).toHaveClass('recent-jobs-panel');
      expect(panel).toHaveClass('widget-mode');

      rerender(
        <RecentJobsPanel
          defaultViewMode="list"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      panel = screen.getByRole('region', { name: 'Recent Jobs Panel' });
      expect(panel).toHaveClass('list-mode');

      rerender(
        <RecentJobsPanel
          defaultViewMode="collapsed"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      panel = screen.getByRole('region', { name: 'Recent Jobs Panel' });
      expect(panel).toHaveClass('collapsed');
    });

    it('should apply compact class when compact prop is true', () => {
      render(
        <RecentJobsPanel
          defaultViewMode="list"
          compact={true}
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const panel = screen.getByRole('region', { name: 'Recent Jobs Panel' });
      expect(panel).toHaveClass('compact');
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(
        <RecentJobsPanel
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByRole('region', { name: 'Recent Jobs Panel' })).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument(); // Header
      expect(screen.getByRole('group', { name: 'View mode selector' })).toBeInTheDocument();
    });

    it('should have proper button labels', () => {
      render(
        <RecentJobsPanel
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByLabelText('Switch to widget view')).toBeInTheDocument();
      expect(screen.getByLabelText('Switch to list view')).toBeInTheDocument();
      expect(screen.getByLabelText('Collapse panel')).toBeInTheDocument();
    });

    it('should have proper button labels when collapsed', () => {
      render(
        <RecentJobsPanel
          defaultViewMode="collapsed"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByLabelText('Expand recent jobs panel')).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(
        <RecentJobsPanel
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const widgetButton = screen.getByTitle('Widget view');
      const listButton = screen.getByTitle('List view');
      const collapseButton = screen.getByTitle('Collapse panel');

      // Tab through buttons
      await user.tab();
      expect(widgetButton).toHaveFocus();

      await user.tab();
      expect(listButton).toHaveFocus();

      await user.tab();
      expect(collapseButton).toHaveFocus();
    });
  });

  describe('responsive behavior', () => {
    it('should handle different screen sizes', () => {
      // Mock window.matchMedia for responsive tests
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query.includes('max-width: 768px'),
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      render(
        <RecentJobsPanel
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const panel = screen.getByRole('region', { name: 'Recent Jobs Panel' });
      expect(panel).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should handle missing onReuseSettings prop gracefully', () => {
      render(
        <RecentJobsPanel
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByTestId('recent-jobs-widget')).toBeInTheDocument();
    });

    it('should handle missing onJobSelect prop gracefully', () => {
      render(
        <RecentJobsPanel
          onReuseSettings={mockOnReuseSettings}
        />
      );

      expect(screen.getByTestId('recent-jobs-widget')).toBeInTheDocument();
    });
  });

  describe('state management', () => {
    it('should maintain view mode state across re-renders', async () => {
      const { rerender } = render(
        <RecentJobsPanel
          defaultViewMode="widget"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      const listButton = screen.getByTitle('List view');
      await user.click(listButton);

      expect(screen.getByTestId('recent-jobs-list')).toBeInTheDocument();

      // Re-render with same props
      rerender(
        <RecentJobsPanel
          defaultViewMode="widget"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      // Should maintain list view state
      expect(screen.getByTestId('recent-jobs-list')).toBeInTheDocument();
    });

    it('should reset to default view mode when defaultViewMode prop changes', () => {
      const { rerender } = render(
        <RecentJobsPanel
          defaultViewMode="widget"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByTestId('recent-jobs-widget')).toBeInTheDocument();

      rerender(
        <RecentJobsPanel
          defaultViewMode="list"
          onReuseSettings={mockOnReuseSettings}
          onJobSelect={mockOnJobSelect}
        />
      );

      expect(screen.getByTestId('recent-jobs-list')).toBeInTheDocument();
    });
  });
});