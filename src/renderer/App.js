import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import FileConverter from './components/FileConverter';
import './styles/App.css';

const App = () => {
  const [currentTheme, setCurrentTheme] = useState('auto');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      setCurrentTheme(savedTheme);
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setCurrentTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
  }, [currentTheme]);

  const handleThemeChange = (theme) => {
    setCurrentTheme(theme);
  };

  const handleSettingsClick = () => {
    setShowSettings(!showSettings);
  };

  return (
    <div className="App">
      <Header 
        currentTheme={currentTheme}
        onThemeChange={handleThemeChange}
        onSettingsClick={handleSettingsClick}
      />
      
      <main className="main-content">
        <div className="file-converter-container">
          <h1 className="file-converter-title">File Converter</h1>
          <p className="file-converter-subtitle">
            Convert your files to different formats quickly and easily. 
            Drag and drop files or click to browse.
          </p>
          
          <FileConverter category="universal" />
        </div>
      </main>
    </div>
  );
};

export default App;