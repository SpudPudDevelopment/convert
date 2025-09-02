import { UserPreferences, DEFAULT_PREFERENCES, RecentJob } from '../../renderer/models/UserPreferences.js';

describe('UserPreferences Model', () => {
  let userPreferences;

  beforeEach(() => {
    userPreferences = new UserPreferences();
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Constructor', () => {
    test('should initialize with default preferences when no data provided', () => {
      expect(userPreferences.data).toEqual(DEFAULT_PREFERENCES);
    });

    test('should initialize with provided data', () => {
      const customData = {
        ...DEFAULT_PREFERENCES,
        appearance: {
          ...DEFAULT_PREFERENCES.appearance,
          theme: 'dark'
        }
      };
      const customPrefs = new UserPreferences(customData);
      expect(customPrefs.data.appearance.theme).toBe('dark');
    });
  });

  describe('Theme Management', () => {
    test('should get current theme', () => {
      expect(userPreferences.getTheme()).toBe('light');
    });

    test('should set theme', () => {
      userPreferences.setTheme('dark');
      expect(userPreferences.getTheme()).toBe('dark');
    });

    test('should emit theme change event', () => {
      const mockCallback = jest.fn();
      userPreferences.on('themeChanged', mockCallback);
      
      userPreferences.setTheme('dark');
      
      expect(mockCallback).toHaveBeenCalledWith({
        oldTheme: 'light',
        newTheme: 'dark'
      });
    });
  });

  describe('Language Management', () => {
    test('should get current language', () => {
      expect(userPreferences.getLanguage()).toBe('en');
    });

    test('should set language', () => {
      userPreferences.setLanguage('es');
      expect(userPreferences.getLanguage()).toBe('es');
    });

    test('should emit language change event', () => {
      const mockCallback = jest.fn();
      userPreferences.on('languageChanged', mockCallback);
      
      userPreferences.setLanguage('fr');
      
      expect(mockCallback).toHaveBeenCalledWith({
        oldLanguage: 'en',
        newLanguage: 'fr'
      });
    });
  });

  describe('Preset Management', () => {
    const mockPreset = {
      name: 'Test Preset',
      description: 'Test Description',
      settings: { quality: 'high' }
    };

    test('should add preset', () => {
      const presetId = userPreferences.addPreset(mockPreset);
      
      expect(presetId).toBeDefined();
      expect(userPreferences.getPresets()).toHaveLength(1);
      expect(userPreferences.getPresets()[0].name).toBe('Test Preset');
    });

    test('should remove preset', () => {
      const presetId = userPreferences.addPreset(mockPreset);
      const removed = userPreferences.removePreset(presetId);
      
      expect(removed).toBe(true);
      expect(userPreferences.getPresets()).toHaveLength(0);
    });

    test('should update preset', () => {
      const presetId = userPreferences.addPreset(mockPreset);
      const updated = userPreferences.updatePreset(presetId, { name: 'Updated Preset' });
      
      expect(updated).toBe(true);
      expect(userPreferences.getPresets()[0].name).toBe('Updated Preset');
    });

    test('should get preset by id', () => {
      const presetId = userPreferences.addPreset(mockPreset);
      const preset = userPreferences.getPreset(presetId);
      
      expect(preset).toBeDefined();
      expect(preset.name).toBe('Test Preset');
    });

    test('should emit preset events', () => {
      const addCallback = jest.fn();
      const updateCallback = jest.fn();
      const removeCallback = jest.fn();
      
      userPreferences.on('presetAdded', addCallback);
      userPreferences.on('presetUpdated', updateCallback);
      userPreferences.on('presetRemoved', removeCallback);
      
      const presetId = userPreferences.addPreset(mockPreset);
      userPreferences.updatePreset(presetId, { name: 'Updated' });
      userPreferences.removePreset(presetId);
      
      expect(addCallback).toHaveBeenCalled();
      expect(updateCallback).toHaveBeenCalled();
      expect(removeCallback).toHaveBeenCalled();
    });
  });

  describe('Recent Jobs Management', () => {
    const mockJob = {
      inputFile: 'test.pdf',
      outputFile: 'test.docx',
      format: 'docx',
      status: 'completed'
    };

    test('should add recent job', () => {
      const jobId = userPreferences.addRecentJob(mockJob);
      
      expect(jobId).toBeDefined();
      expect(userPreferences.getRecentJobs()).toHaveLength(1);
      expect(userPreferences.getRecentJobs()[0].inputFile).toBe('test.pdf');
    });

    test('should limit recent jobs to maximum', () => {
      // Add more than the maximum number of jobs
      for (let i = 0; i < 25; i++) {
        userPreferences.addRecentJob({ ...mockJob, inputFile: `test${i}.pdf` });
      }
      
      expect(userPreferences.getRecentJobs()).toHaveLength(20);
    });

    test('should clear recent jobs', () => {
      userPreferences.addRecentJob(mockJob);
      userPreferences.clearRecentJobs();
      
      expect(userPreferences.getRecentJobs()).toHaveLength(0);
    });

    test('should emit recent job events', () => {
      const addCallback = jest.fn();
      const clearCallback = jest.fn();
      
      userPreferences.on('recentJobAdded', addCallback);
      userPreferences.on('recentJobsCleared', clearCallback);
      
      userPreferences.addRecentJob(mockJob);
      userPreferences.clearRecentJobs();
      
      expect(addCallback).toHaveBeenCalled();
      expect(clearCallback).toHaveBeenCalled();
    });
  });

  describe('Data Export/Import', () => {
    test('should export all data', () => {
      userPreferences.setTheme('dark');
      userPreferences.addPreset({ name: 'Test Preset' });
      
      const exported = userPreferences.exportData();
      
      expect(exported.appearance.theme).toBe('dark');
      expect(exported.savedPresets).toHaveLength(1);
    });

    test('should import data', () => {
      const importData = {
        ...DEFAULT_PREFERENCES,
        appearance: { ...DEFAULT_PREFERENCES.appearance, theme: 'dark' },
        savedPresets: [{ id: '1', name: 'Imported Preset' }]
      };
      
      userPreferences.importData(importData);
      
      expect(userPreferences.getTheme()).toBe('dark');
      expect(userPreferences.getPresets()).toHaveLength(1);
    });

    test('should validate import data', () => {
      const invalidData = { invalid: 'data' };
      
      expect(() => {
        userPreferences.importData(invalidData);
      }).toThrow();
    });
  });

  describe('Preference Updates', () => {
    test('should update nested preference', () => {
      userPreferences.updatePreference('appearance.theme', 'dark');
      expect(userPreferences.getTheme()).toBe('dark');
    });

    test('should update multiple preferences', () => {
      userPreferences.updatePreferences({
        'appearance.theme': 'dark',
        'general.language': 'es'
      });
      
      expect(userPreferences.getTheme()).toBe('dark');
      expect(userPreferences.getLanguage()).toBe('es');
    });

    test('should emit preference change events', () => {
      const callback = jest.fn();
      userPreferences.on('preferencesChanged', callback);
      
      userPreferences.updatePreference('appearance.theme', 'dark');
      
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Reset Functionality', () => {
    test('should reset all preferences', () => {
      userPreferences.setTheme('dark');
      userPreferences.addPreset({ name: 'Test' });
      
      userPreferences.reset();
      
      expect(userPreferences.getTheme()).toBe('light');
      expect(userPreferences.getPresets()).toHaveLength(0);
    });

    test('should reset specific section', () => {
      userPreferences.setTheme('dark');
      userPreferences.addPreset({ name: 'Test' });
      
      userPreferences.reset('appearance');
      
      expect(userPreferences.getTheme()).toBe('light');
      expect(userPreferences.getPresets()).toHaveLength(1); // Should not be affected
    });
  });
});

describe('RecentJob Class', () => {
  test('should create recent job with required fields', () => {
    const jobData = {
      inputFile: 'test.pdf',
      outputFile: 'test.docx',
      format: 'docx',
      status: 'completed'
    };
    
    const job = new RecentJob(jobData);
    
    expect(job.inputFile).toBe('test.pdf');
    expect(job.outputFile).toBe('test.docx');
    expect(job.format).toBe('docx');
    expect(job.status).toBe('completed');
    expect(job.timestamp).toBeDefined();
    expect(job.id).toBeDefined();
  });

  test('should validate required fields', () => {
    expect(() => {
      new RecentJob({});
    }).toThrow();
  });
});