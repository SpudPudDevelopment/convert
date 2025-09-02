import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import UnifiedConverter from './components/UnifiedConverter';
import NotificationSystem from './components/NotificationSystem';
import UpdateNotification from './components/UpdateNotification';
import PrivacySettings from './components/PrivacySettings';
import PresetManager from './components/PresetManager';
import UserPreferencesComponent from './components/UserPreferences';
import RecentJobsPanel from './components/RecentJobsPanel';
import useTheme from './hooks/useTheme';
import './styles/App.css';

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error Boundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

const App = () => {
  const [activeTab, setActiveTab] = useState('converter');
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    console.log('App component rendering');
    
    // Set up keyboard navigation
    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case '1':
            event.preventDefault();
            setActiveTab('converter');
            break;
          case '2':
            event.preventDefault();
            setActiveTab('presets');
            break;
          case '3':
            event.preventDefault();
            setActiveTab('settings');
            break;
          case '4':
            event.preventDefault();
            setActiveTab('recent');
            break;
          case '5':
            event.preventDefault();
            setActiveTab('help');
            break;
          default:
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'converter':
        return (
          <div className="tab-content">
            <UnifiedConverter />
          </div>
        );
      case 'presets':
        return (
          <div className="tab-content">
            <PresetManager 
              onPresetSelect={(preset) => {
                console.log('Preset selected:', preset);
                // You can add logic here to apply the preset to the converter
              }}
              showTemplates={true}
            />
          </div>
        );
      case 'settings':
        return (
          <div className="tab-content">
            <UserPreferencesComponent onClose={() => setActiveTab('converter')} />
          </div>
        );
      case 'recent':
        return (
          <div className="tab-content">
            <RecentJobsPanel 
              viewMode="list"
              onReuseSettings={(settings, presetUsed) => {
                console.log('Reusing settings:', settings, presetUsed);
                // You can add logic here to apply the settings to the converter
                setActiveTab('converter');
              }}
              onJobSelect={(job) => {
                console.log('Job selected:', job);
                // You can add logic here to show job details
              }}
            />
          </div>
        );
      case 'help':
        return (
          <div className="tab-content">
            <h2>Help & Documentation</h2>
            <p>Help content will be implemented here.</p>
          </div>
        );
      default:
        return (
          <div className="tab-content">
            <UnifiedConverter />
          </div>
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="App" data-theme={theme}>
        <Header 
          theme={theme}
          onThemeToggle={toggleTheme}
          onPrivacySettingsClick={() => setShowPrivacySettings(true)}
        />
        
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'converter' ? 'active' : ''}`}
            onClick={() => setActiveTab('converter')}
          >
            🎯 Converter
          </button>
          <button
            className={`tab-button ${activeTab === 'presets' ? 'active' : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            ⚙️ Presets
          </button>
          <button
            className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            🔧 Settings
          </button>
          <button
            className={`tab-button ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={() => setActiveTab('recent')}
          >
            📋 Recent
          </button>
          <button
            className={`tab-button ${activeTab === 'help' ? 'active' : ''}`}
            onClick={() => setActiveTab('help')}
          >
            ❓ Help
          </button>
        </div>

        <main className="main-content">
          {renderTabContent()}
        </main>

        <NotificationSystem />
        <UpdateNotification />
        
        {showPrivacySettings && (
          <PrivacySettings
            onClose={() => setShowPrivacySettings(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;