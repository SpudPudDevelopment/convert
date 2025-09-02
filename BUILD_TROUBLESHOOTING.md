# Build Troubleshooting Guide

If your Mac app build is hanging or failing, follow this guide to resolve the issues.

## Quick Fixes

### 1. Clean Build (Most Common Solution)
```bash
npm run clean
npm run build:clean
npm run dist:mac
```

### 2. Force Clean Everything
```bash
rm -rf node_modules package-lock.json build dist .electron-cache
npm install
npm run build:clean
npm run dist:mac
```

## Common Causes of Build Hangs

### 1. **Large Bundle Size**
- Your current bundle.js is ~4.8MB, which can cause processing delays
- **Solution**: The webpack config has been optimized with code splitting and better optimization

### 2. **Heavy Dependencies**
- `ffmpeg-static`, `canvas`, and `sharp` are large native dependencies
- **Solution**: These are now properly excluded from unnecessary processing

### 3. **Maximum Compression**
- **Previous**: `"compression": "maximum"` was causing slow builds
- **Current**: Changed to `"compression": "normal"` for better performance

### 4. **Memory Issues**
- Electron-builder needs significant RAM for processing large files
- **Solution**: Added `NODE_OPTIONS=--max-old-space-size=4096` to environment

## Build Scripts

### Optimized Build Commands
```bash
# Clean build (recommended)
npm run build:clean

# Build for Mac with cleanup
npm run dist:mac

# Build DMG only
npm run dist:mac-dmg

# Build ZIP only
npm run dist:mac-zip
```

### Troubleshooting Commands
```bash
# Run the automated troubleshooter
npm run troubleshoot

# Clean specific directories
npm run clean:build    # Remove build directory only
npm run clean:dist     # Remove dist directory only
npm run clean          # Remove all build artifacts
```

## Environment Variables

The `.electron-builder.env` file contains optimizations:
- `CSC_IDENTITY_AUTO_DISCOVERY=false` - Disables code signing for faster builds
- `NODE_OPTIONS=--max-old-space-size=4096` - Increases Node.js memory limit
- `ELECTRON_BUILDER_TIMEOUT=300000` - Sets 5-minute timeout for operations

## Performance Optimizations Applied

### Webpack Configuration
- ✅ Code splitting for production builds
- ✅ Better tree shaking and dead code elimination
- ✅ Optimized chunk splitting
- ✅ Performance budgets to warn about large bundles

### Electron Builder Configuration
- ✅ Normal compression instead of maximum
- ✅ Optimized file filtering
- ✅ Disabled unnecessary rebuilds
- ✅ Added timeout settings
- ✅ Electron download caching

## System Requirements

### Minimum Requirements
- **RAM**: 8GB (16GB recommended)
- **Disk Space**: 5GB free space
- **Node.js**: 16+ (18+ recommended)
- **macOS**: 10.15+ (11+ recommended)

### Check Your System
```bash
# Run the troubleshooter to check your system
npm run troubleshoot
```

## Debugging Build Issues

### 1. Enable Verbose Logging
```bash
npm run dist:mac -- --verbose
```

### 2. Check Activity Monitor
- Look for processes using high CPU/memory
- Kill any hanging Node.js or Electron processes

### 3. Monitor Build Progress
```bash
# Watch the build directory
watch -n 1 "ls -la build/ && echo '---' && ls -la dist/"
```

### 4. Check Logs
```bash
# View electron-builder logs
tail -f ~/.cache/electron-builder/logs/*.log
```

## Advanced Troubleshooting

### If Build Still Hangs

1. **Kill All Node Processes**
   ```bash
   pkill -f node
   pkill -f electron
   ```

2. **Clear All Caches**
   ```bash
   npm cache clean --force
   rm -rf ~/.cache/electron-builder
   rm -rf ~/.electron
   ```

3. **Rebuild Native Dependencies**
   ```bash
   npm rebuild
   ```

4. **Check for File System Issues**
   ```bash
   # Check disk health
   diskutil verifyDisk /
   
   # Check for corrupted files
   find . -name "*.lock" -delete
   ```

### Memory Optimization

If you have limited RAM:
```bash
# Set lower memory limit
export NODE_OPTIONS="--max-old-space-size=2048"
npm run dist:mac
```

### Network Issues

If electron-builder can't download Electron:
```bash
# Use alternative mirror
export ELECTRON_MIRROR="https://npm.taobao.org/mirrors/electron/"
npm run dist:mac
```

## Still Having Issues?

1. **Run the troubleshooter**: `npm run troubleshoot`
2. **Check system resources** in Activity Monitor
3. **Try building on a different machine** to isolate the issue
4. **Check for macOS updates** that might affect builds
5. **Verify Xcode Command Line Tools**: `xcode-select --install`

## Build Performance Tips

### For Faster Builds
- Use SSD storage
- Close other applications during build
- Ensure adequate cooling (thermal throttling can slow builds)
- Use wired internet connection for downloads
- Consider using a build machine with more resources

### For Development
- Use `npm run pack:mac` for faster packaging without distribution files
- Use `npm run dev` for development builds
- Consider using `npm run build:watch` for incremental builds

## Support

If you continue to experience build issues:
1. Run `npm run troubleshoot` and share the output
2. Check the [electron-builder issues](https://github.com/electron-userland/electron-builder/issues)
3. Verify your system meets the minimum requirements
4. Try building on a fresh macOS installation if possible
