import React, { useState, useEffect } from 'react';
import useTheme from './hooks/useTheme';
import './styles/App.css';

function App() {
  const { theme, isDark } = useTheme();
  const [testState, setTestState] = useState('initial');

  // Test effect to see if component is mounting properly
  useEffect(() => {
    console.log('App component mounted');
    setTestState('mounted');
    
    // Test if we can update state
    const timer = setTimeout(() => {
      setTestState('updated');
      console.log('State updated successfully');
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      console.log('App component unmounting');
    };
  }, []);

  console.log('App render called, testState:', testState);

  return (
    <div className={`App theme-${theme}`} data-theme={theme}>
      <div className="test-container">
        <h1>Convert App Test</h1>
        <p>Current state: {testState}</p>
        <p>Theme: {theme} (isDark: {isDark.toString()})</p>
        <p>Time: {new Date().toLocaleTimeString()}</p>
        
        <div className="test-buttons">
          <button onClick={() => setTestState('clicked')}>
            Test Button Click
          </button>
          <button onClick={() => console.log('Console test button clicked')}>
            Console Test
          </button>
        </div>
        
        <div className="test-content">
          <h2>Test Content</h2>
          <p>If you can see this, the React app is working.</p>
          <ul>
            <li>Component mounted: ✅</li>
            <li>State updates: ✅</li>
            <li>Event handlers: ✅</li>
            <li>Rendering: ✅</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;