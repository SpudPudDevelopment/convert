# Convert - Universal File Converter

A desktop application built with Electron and React for converting files between various formats.

## Features

- **Document Conversion**: PDF ↔ DOCX ↔ TXT
- **Image Conversion**: JPG ↔ PNG ↔ WEBP
- **Audio Conversion**: MP3 ↔ WAV ↔ AAC
- **Video Conversion**: MP4 ↔ MOV

## Development Setup

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd convert
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

1. Start the React development server:
   ```bash
   npm start
   ```

2. In a separate terminal, start the Electron app:
   ```bash
   npm run electron-dev
   ```

### Building

1. Build the React app:
   ```bash
   npm run build
   ```

2. Package the Electron app:
   ```bash
   npm run dist
   ```

## Project Structure

```
convert/
├── public/
│   ├── electron.js      # Main Electron process
│   ├── preload.js       # Preload script for IPC
│   └── index.html       # HTML template
├── src/
│   ├── App.js           # Main React component
│   ├── App.css          # App styles
│   ├── index.js         # React entry point
│   └── index.css        # Global styles
├── package.json         # Dependencies and scripts
├── webpack.config.js    # Webpack configuration
└── .babelrc            # Babel configuration
```

## Scripts

- `npm start` - Start React development server
- `npm run build` - Build React app for production
- `npm run electron` - Start Electron app (production)
- `npm run electron-dev` - Start Electron app (development)
- `npm run dist` - Build and package the app for distribution

## Technology Stack

- **Frontend**: React 19, CSS3
- **Desktop Framework**: Electron
- **Build Tools**: Webpack, Babel
- **Package Manager**: npm
- **Bundler**: electron-builder

## License

MIT License