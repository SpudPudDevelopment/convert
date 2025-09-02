# Dependency Bundling Documentation

## Overview
This document outlines the dependency bundling configuration for the Convert Electron application, ensuring proper inclusion of native dependencies like FFmpeg and Canvas while optimizing bundle size.

## Key Dependencies

### Runtime Dependencies
- **FFmpeg Static**: Binary for video/audio processing
- **Canvas**: Native module for image manipulation
- **PDF-lib**: PDF processing library
- **Mammoth**: Document conversion library

### Development Dependencies (Excluded)
- AI SDK packages (@ai-sdk/*, @anthropic-ai/*)
- Testing libraries (@testing-library/*, jest/*)
- Build tools (webpack/*, babel/*, electron-builder/*)
- Development utilities (nodemon, concurrently)

## Configuration

### Electron Builder Settings

#### ASAR Configuration
```json
"asar": true,
"asarUnpack": [
  "node_modules/ffmpeg-static/**/*",
  "node_modules/canvas/**/*"
]
```

#### File Exclusions
```json
"files": [
  "build/**/*",
  "src/main/**/*",
  "package.json",
  "node_modules/**/*",
  "!node_modules/.cache",
  "!node_modules/@img/sharp-darwin-x64",
  "!node_modules/@biomejs/cli-linux-x64",
  "!node_modules/@anthropic-ai/**/*",
  "!node_modules/@ai-sdk/**/*",
  "!node_modules/task-master-ai/**/*",
  "!node_modules/@testing-library/**/*",
  "!node_modules/jest/**/*",
  "!node_modules/babel-loader/**/*",
  "!node_modules/@babel/**/*",
  "!node_modules/webpack/**/*",
  "!node_modules/webpack-cli/**/*",
  "!node_modules/webpack-dev-server/**/*",
  "!node_modules/electron-builder/**/*",
  "!node_modules/concurrently/**/*",
  "!node_modules/nodemon/**/*"
]
```

### Webpack Optimization
```javascript
optimization: {
  usedExports: true,
  minimize: !isDevelopment
}
```

## Bundle Size Optimization Results

### Before Optimization
- Total app size: 624MB
- ASAR archive: 202MB
- Unpacked modules: 170MB

### After Optimization
- Total app size: 536MB (88MB reduction)
- ASAR archive: 184MB (18MB reduction)
- Unpacked modules: 101MB (69MB reduction)

### Key Optimizations
1. **Development Dependency Exclusion**: Removed 69MB of unnecessary packages
2. **Native Module Unpacking**: FFmpeg and Canvas properly accessible at runtime
3. **Tree Shaking**: Enabled webpack tree shaking for dead code elimination

## Troubleshooting

### Common Issues

#### Missing @biomejs/cli-linux-x64
**Problem**: Build fails with ENOENT error for missing directory
**Solution**: Create dummy directory or exclude in package.json

#### Sharp Conflicts
**Problem**: Sharp native bindings cause build issues on ARM64
**Solution**: Exclude platform-specific Sharp packages

#### Large Bundle Size
**Problem**: Webpack bundle exceeds recommended size limits
**Solution**: Exclude development dependencies and enable tree shaking

### Verification Steps

1. **Check Native Dependencies**:
   ```bash
   ls -la "dist/mac-arm64/Convert.app/Contents/Resources/app.asar.unpacked/node_modules/"
   ```

2. **Verify FFmpeg Binary**:
   ```bash
   ls -la "dist/mac-arm64/Convert.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
   ```

3. **Test Application Launch**:
   ```bash
   open "dist/mac-arm64/Convert.app"
   ```

## Best Practices

1. **Regular Dependency Audits**: Periodically review and exclude unnecessary packages
2. **Native Module Testing**: Always test native dependencies in the built application
3. **Size Monitoring**: Track bundle size changes during development
4. **Platform-Specific Exclusions**: Exclude incompatible platform binaries
5. **ASAR Unpacking**: Unpack native modules that need file system access

## Maintenance

- Review exclusion list when adding new dependencies
- Update native module configurations for new platforms
- Monitor bundle size impact of new features
- Test application functionality after configuration changes