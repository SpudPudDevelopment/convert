import React, { useState, useEffect } from 'react';
import './App.css';
import AudioConverter from './components/AudioConverter';

function App() {
  const [version, setVersion] = useState('');
  const [currentView, setCurrentView] = useState('home');

  useEffect(() => {
    // Get app version from Electron
    if (window.electronAPI) {
      window.electronAPI.getAppVersion().then((response) => {
        if (response.success) {
          setVersion(response.data);
        } else {
          console.error('Failed to get app version:', response.error);
        }
      }).catch((error) => {
        console.error('Failed to get app version:', error);
      });
    }
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Convert</h1>
        <p>Universal File Converter</p>
        {version && <span className="version">v{version}</span>}
      </header>
      
      <main className="App-main">
        <div className="welcome-section">
          <h2>Universal File Conversion Tool</h2>
          <div className="features">
            <div className="feature">
              <h3>📄 Documents</h3>
              <p>Convert between PDF, DOCX, and TXT formats</p>
            </div>
            <div className="feature">
              <h3>🖼️ Images</h3>
              <p>Convert between JPG, PNG, and WEBP formats</p>
            </div>
            <div className="feature">
              <h3>🎵 Audio</h3>
              <p>Convert between MP3, WAV, and AAC formats</p>
            </div>
            <div className="feature">
              <h3>🎬 Video</h3>
              <p>Convert between MP4 and MOV formats</p>
            </div>
          </div>
        </div>
        
        {currentView === 'home' && (
          <div className="action-section">
            <div className="converter-buttons">
              <button 
                className="converter-button"
                onClick={() => setCurrentView('audio')}
              >
                🎵 Audio Converter
              </button>
              <button className="converter-button" disabled>
                📄 Document Converter
                <span className="coming-soon">Coming Soon</span>
              </button>
              <button className="converter-button" disabled>
                🖼️ Image Converter
                <span className="coming-soon">Coming Soon</span>
              </button>
              <button className="converter-button" disabled>
                🎬 Video Converter
                <span className="coming-soon">Coming Soon</span>
              </button>
            </div>
            <p className="help-text">
              Choose a converter type to get started
            </p>
          </div>
        )}
        
        {currentView === 'audio' && (
          <div className="converter-view">
            <div className="converter-header">
              <button 
                className="back-button"
                onClick={() => setCurrentView('home')}
              >
                ← Back to Home
              </button>
            </div>
            <AudioConverter />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;