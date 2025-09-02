# Development Workflow

This document outlines the development workflow and available tools for the Convert application.

## Quick Start

### Development Commands

```bash
# Start development with hot reloading (recommended)
npm run dev

# Start only the renderer process (React app)
npm run dev:renderer

# Start only the main process with auto-restart
npm run dev:main

# Full development mode with both processes
npm run dev:full

# Production build
npm run build

# Clean build artifacts
npm run clean
```

### Environment Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development:**
   ```bash
   npm run dev
   ```

3. **Run tests:**
   ```bash
   npm test
   node src/shared/tests/devEnvironment.test.js
   ```

## Development Features

### Hot Reloading

- **Renderer Process**: Automatic reload when React components change
- **Main Process**: Automatic restart when Electron main process files change
- **Shared Modules**: Automatic restart when shared utilities change

### Debugging Tools

- **DevTools**: Automatically opens in development mode
- **Electron Debug**: Enhanced debugging capabilities
- **Source Maps**: Available for easier debugging
- **Error Overlay**: Shows compilation errors in the browser

### Logging System

#### Log Levels
- `error`: Critical errors
- `warn`: Warnings and potential issues
- `info`: General information
- `debug`: Detailed debugging information

#### Usage
```javascript
const logger = require('../src/shared/utils/logger');

logger.info('Application started');
logger.debug('Debug information', { data: 'example' });
logger.error('An error occurred', error);
```

#### Log Files
Logs are written to the `logs/` directory:
- `error.log`: Error messages
- `warn.log`: Warning messages
- `info.log`: Info messages
- `debug.log`: Debug messages

### Performance Monitoring

#### Memory Monitoring
```javascript
const devUtils = require('../src/shared/utils/devUtils');

// Log current memory usage
logger.logMemoryUsage();

// Get debug information
const debugInfo = devUtils.getDebugInfo();
```

#### Performance Measurement
```javascript
// Start timing an operation
devUtils.startPerformanceMark('file-conversion');

// ... perform operation ...

// End timing and log results
devUtils.endPerformanceMark('file-conversion');
```

### Environment Configuration

The development environment is configured through `src/shared/config/development.js`:

```javascript
const config = require('../src/shared/config/development');

// Environment flags
config.isDev          // true in development
config.isProduction   // true in production
config.isTest         // true in test environment

// Development settings
config.debug.showDevTools      // Auto-open DevTools
config.debug.enableHotReload   // Enable hot reloading
config.logging.level           // Logging level
config.performance.enableProfiling  // Performance monitoring
```

## File Structure

```
src/
├── shared/
│   ├── config/
│   │   └── development.js     # Environment configuration
│   ├── utils/
│   │   ├── logger.js          # Logging utility
│   │   └── devUtils.js        # Development utilities
│   ├── tests/
│   │   └── devEnvironment.test.js  # Environment tests
│   └── ...
├── renderer/                  # React application
└── ...
public/
├── electron.js               # Main Electron process
├── preload.js               # Preload script
└── ...
logs/                        # Log files (created automatically)
docs/                        # Documentation
```

## Development Workflow

### 1. Starting Development

1. Open terminal and navigate to project directory
2. Run `npm run dev` to start both renderer and main processes
3. The application will open automatically
4. DevTools will open if enabled in configuration

### 2. Making Changes

#### Renderer Process (React)
- Edit files in `src/renderer/`
- Changes are automatically reflected (hot reload)
- Check browser console for any errors

#### Main Process (Electron)
- Edit files in `public/electron.js` or `src/shared/`
- Application automatically restarts
- Check terminal console for any errors

#### Shared Modules
- Edit files in `src/shared/`
- Both processes restart automatically
- Changes affect both renderer and main processes

### 3. Debugging

#### Browser DevTools
- Automatically opens in development
- Use Console, Elements, Network, Sources tabs
- React DevTools available if installed

#### Main Process Debugging
- Use `console.log()` statements
- Check terminal output
- Use `logger.debug()` for structured logging

#### Performance Issues
- Monitor memory usage in logs
- Use performance marks for timing operations
- Check for slow operation warnings

### 4. Testing

#### Environment Tests
```bash
node src/shared/tests/devEnvironment.test.js
```

#### Manual Testing
1. Test file selection and conversion
2. Test window controls (minimize, maximize, close)
3. Test theme switching
4. Test error handling

## Troubleshooting

### Common Issues

#### Hot Reload Not Working
- Check if `electron-reload` is installed
- Verify file watching is working
- Check terminal for error messages

#### DevTools Not Opening
- Check `config.debug.showDevTools` setting
- Verify development environment detection
- Try manually opening with Ctrl+Shift+I (Cmd+Opt+I on Mac)

#### Build Errors
- Run `npm run clean` to clear build cache
- Check for syntax errors in code
- Verify all dependencies are installed

#### Performance Issues
- Check memory usage in logs
- Look for memory leak warnings
- Monitor slow operation alerts

### Getting Help

1. Check the logs in the `logs/` directory
2. Run environment tests to verify setup
3. Check terminal output for error messages
4. Review this documentation for configuration options

## Best Practices

### Code Organization
- Keep shared utilities in `src/shared/`
- Use the logger for all output instead of `console.log`
- Follow the established file structure

### Performance
- Use performance marks for timing critical operations
- Monitor memory usage regularly
- Avoid blocking operations in the main thread

### Debugging
- Use structured logging with context data
- Include error handling in all async operations
- Test both development and production builds

### Environment Management
- Use environment variables for configuration
- Keep development and production configs separate
- Document any required environment setup