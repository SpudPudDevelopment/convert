# Development Setup Guide

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Git

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SpudPudDevelopment/convert.git
   cd convert
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Environment Configuration

### For Cursor IDE Integration

1. Copy the `.cursor/mcp.json.example` file to `.cursor/mcp.json`
2. Replace the placeholder values with your actual API keys:
   ```json
   {
     "ANTHROPIC_API_KEY": "your_actual_key_here",
     "PERPLEXITY_API_KEY": "your_actual_key_here"
   }
   ```

### For CLI Usage

1. Create a `.env` file in the project root
2. Add your API keys:
   ```env
   ANTHROPIC_API_KEY=your_actual_key_here
   PERPLEXITY_API_KEY=your_actual_key_here
   ```

## Available Scripts

- `npm start` - Start the development server
- `npm run build` - Build the application
- `npm test` - Run tests
- `npm run electron` - Run the Electron app

## Development Workflow

1. Make your changes
2. Test locally
3. Commit your changes
4. Push to your feature branch
5. Create a pull request

## Important Notes

- Never commit actual API keys to the repository
- The `.cursor/` directory is gitignored to prevent accidental commits
- Large files (>100MB) are automatically rejected by GitHub
- Use `.env` files for local development secrets
