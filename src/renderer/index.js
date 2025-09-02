import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext';
import './styles/index.css';

console.log('Renderer process starting...');

// Add global error handler
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  console.error('Error stack:', event.error?.stack);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Initialize the React application in the Electron renderer process
const container = document.getElementById('root');
console.log('Root container found:', container);

if (!container) {
  console.error('Root container not found!');
} else {
  try {
    console.log('Creating React root...');
    const root = createRoot(container);
    console.log('React root created');

    console.log('Rendering React app...');
    root.render(
      <React.StrictMode>
        <UserPreferencesProvider>
          <App />
        </UserPreferencesProvider>
      </React.StrictMode>
    );
    console.log('React app rendered successfully');
  } catch (error) {
    console.error('Error during React initialization:', error);
    console.error('Error stack:', error.stack);
    
    // Try to render a simple fallback
    try {
      container.innerHTML = `
        <div style="padding: 20px; color: white; background: #1e1e1e; font-family: Arial, sans-serif;">
          <h1>App Error</h1>
          <p>The application encountered an error during startup.</p>
          <pre style="background: #333; padding: 10px; overflow: auto;">${error.message}\n\n${error.stack}</pre>
        </div>
      `;
    } catch (fallbackError) {
      console.error('Failed to render fallback:', fallbackError);
    }
  }
}

// Enable hot module replacement in development
if (module.hot) {
  module.hot.accept();
}