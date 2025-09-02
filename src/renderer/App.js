import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import FileConverter from './components/FileConverter';
import UnifiedConverter from './components/UnifiedConverter';
import NotificationSystem from './components/NotificationSystem';
import UpdateNotification from './components/UpdateNotification';
import PrivacySettings from './components/PrivacySettings';
import useTheme from './hooks/useTheme';
import './styles/App.css';

function App() {
  const { theme, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('unified');

  const tabs = [
    { id: 'unified', label: 'Universal', icon: '🔄' },
    { id: 'document', label: 'Documents', icon: '📄' },
    { id: 'image', label: 'Images', icon: '🖼️' },
    { id: 'audio', label: 'Audio', icon: '🎵' },
    { id: 'video', label: 'Video', icon: '🎬' }
  ];

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey) {
        const tabIndex = parseInt(event.key) - 1;
        if (tabIndex >= 0 && tabIndex < tabs.length) {
          event.preventDefault();
          setActiveTab(tabs[tabIndex].id);
        }
      }
      
      // Arrow key navigation
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
        let newIndex;
        
        if (event.key === 'ArrowLeft') {
          newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        } else {
          newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        }
        
        if (event.target.closest('.tab-navigation')) {
          event.preventDefault();
          setActiveTab(tabs[newIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, tabs]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'unified':
        return (
          <div className="tab-content">
            <div className="category-header">
              <h3>Universal File Converter</h3>
              <p>Convert any file type with automatic format detection and unified interface</p>
            </div>
            <UnifiedConverter />
          </div>
        );
      case 'document':
        return (
          <div className="tab-content">
            <div className="category-header">
              <h3>Document Conversion</h3>
              <p>Convert between PDF, Word, Excel, PowerPoint, and text formats</p>
            </div>
            <FileConverter category="document" />
          </div>
        );
      case 'image':
        return (
          <div className="tab-content">
            <div className="category-header">
              <h3>Image Conversion</h3>
              <p>Convert between JPEG, PNG, GIF, WebP, SVG, and other image formats</p>
            </div>
            <FileConverter category="image" />
          </div>
        );
      case 'audio':
        return (
          <div className="tab-content">
            <div className="category-header">
              <h3>Audio Conversion</h3>
              <p>Convert between MP3, WAV, FLAC, AAC, OGG, and other audio formats</p>
            </div>
            <FileConverter category="audio" />
          </div>
        );
      case 'video':
        return (
          <div className="tab-content">
            <div className="category-header">
              <h3>Video Conversion</h3>
              <p>Convert between MP4, AVI, MOV, MKV, WebM, and other video formats</p>
            </div>
            <FileConverter category="video" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`App theme-${theme}`} data-theme={theme}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Header />
      
      <main id="main-content" className="App-main">
        <div className="welcome-section">
          <h2>Welcome to Convert</h2>
          <p>Your universal file conversion tool</p>
        </div>
        
        <nav className="tab-navigation" role="tablist" aria-label="Conversion categories">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tab.id}-panel`}
              tabIndex={activeTab === tab.id ? 0 : -1}
            >
              <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>
        
        <div 
          className="tab-content-container"
          role="tabpanel"
          id={`${activeTab}-panel`}
          aria-labelledby={`${activeTab}-tab`}
        >
          {renderTabContent()}
        </div>
        
        <div className="help-section">
          <p className="help-text">
            Use Ctrl+1-5 (Cmd+1-5 on Mac) to quickly switch between categories
          </p>
        </div>
      </main>
      
      <NotificationSystem />
      <UpdateNotification />
      <PrivacySettings />
    </div>
  );
}

export default App;