import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext';
import './styles/index.css';

console.log('Renderer process starting...');

// Initialize the React application in the Electron renderer process
const container = document.getElementById('root');
console.log('Root container found:', container);

if (!container) {
  console.error('Root container not found!');
} else {
  const root = createRoot(container);
  console.log('React root created');

  root.render(
    <React.StrictMode>
      <UserPreferencesProvider>
        <App />
      </UserPreferencesProvider>
    </React.StrictMode>
  );
  console.log('React app rendered');
}

// Enable hot module replacement in development
if (module.hot) {
  module.hot.accept();
}