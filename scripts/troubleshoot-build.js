#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Convert App Build Troubleshooter\n');

// Check system resources
console.log('📊 Checking system resources...');
try {
  const memory = execSync('sysctl hw.memsize', { encoding: 'utf8' });
  const memGB = Math.round(parseInt(memory.split(':')[1].trim()) / (1024 * 1024 * 1024));
  console.log(`   Memory: ${memGB}GB`);
  
  if (memGB < 8) {
    console.log('   ⚠️  Warning: Less than 8GB RAM detected. Builds may hang due to insufficient memory.');
  }
} catch (error) {
  console.log('   ⚠️  Could not check memory');
}

// Check disk space
console.log('\n💾 Checking disk space...');
try {
  const diskSpace = execSync('df -h .', { encoding: 'utf8' });
  const lines = diskSpace.split('\n');
  const currentDir = lines.find(line => line.includes('.'));
  if (currentDir) {
    const parts = currentDir.split(/\s+/);
    const available = parts[3];
    console.log(`   Available space: ${available}`);
    
    if (available.includes('G') && parseInt(available) < 5) {
      console.log('   ⚠️  Warning: Less than 5GB available. Builds may fail due to insufficient disk space.');
    }
  }
} catch (error) {
  console.log('   ⚠️  Could not check disk space');
}

// Check Node.js version
console.log('\n🟢 Checking Node.js version...');
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf8' });
  console.log(`   Node.js: ${nodeVersion.trim()}`);
  
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 16) {
    console.log('   ⚠️  Warning: Node.js 16+ recommended for optimal build performance');
  }
} catch (error) {
  console.log('   ❌ Node.js not found');
}

// Check npm version
console.log('\n📦 Checking npm version...');
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf8' });
  console.log(`   npm: ${npmVersion.trim()}`);
} catch (error) {
  console.log('   ❌ npm not found');
}

// Check for common build issues
console.log('\n🔍 Checking for common build issues...');

// Check if build directory exists and size
const buildPath = path.join(__dirname, '..', 'build');
if (fs.existsSync(buildPath)) {
  try {
    const buildSize = execSync(`du -sh "${buildPath}"`, { encoding: 'utf8' });
    console.log(`   Build directory size: ${buildSize.trim()}`);
    
    // Check bundle.js size specifically
    const bundlePath = path.join(buildPath, 'bundle.js');
    if (fs.existsSync(bundlePath)) {
      const bundleSize = fs.statSync(bundlePath).size;
      const bundleSizeMB = (bundleSize / (1024 * 1024)).toFixed(2);
      console.log(`   Bundle.js size: ${bundleSizeMB}MB`);
      
      if (bundleSize > 10 * 1024 * 1024) { // 10MB
        console.log('   ⚠️  Warning: Bundle.js is very large (>10MB). This may cause build hangs.');
        console.log('      Consider optimizing imports and using code splitting.');
      }
    }
  } catch (error) {
    console.log('   ⚠️  Could not check build directory size');
  }
} else {
  console.log('   Build directory does not exist');
}

// Check node_modules size
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  try {
    const nodeModulesSize = execSync(`du -sh "${nodeModulesPath}"`, { encoding: 'utf8' });
    console.log(`   node_modules size: ${nodeModulesSize.trim()}`);
    
    // Check for heavy dependencies
    const heavyDeps = ['ffmpeg-static', 'canvas', 'sharp'];
    heavyDeps.forEach(dep => {
      const depPath = path.join(nodeModulesPath, dep);
      if (fs.existsSync(depPath)) {
        try {
          const depSize = execSync(`du -sh "${depPath}"`, { encoding: 'utf8' });
          console.log(`     ${dep}: ${depSize.trim()}`);
        } catch (error) {
          console.log(`     ${dep}: exists but size unknown`);
        }
      }
    });
  } catch (error) {
    console.log('   ⚠️  Could not check node_modules size');
  }
}

// Check for electron-builder cache issues
console.log('\n🗂️  Checking electron-builder cache...');
const electronCachePath = path.join(__dirname, '..', '.electron-cache');
if (fs.existsSync(electronCachePath)) {
  try {
    const cacheSize = execSync(`du -sh "${electronCachePath}"`, { encoding: 'utf8' });
    console.log(`   Electron cache size: ${cacheSize.trim()}`);
    
    if (cacheSize.includes('G') && parseInt(cacheSize) > 2) {
      console.log('   ⚠️  Warning: Large electron cache detected. Consider clearing it.');
    }
  } catch (error) {
    console.log('   ⚠️  Could not check electron cache size');
  }
} else {
  console.log('   Electron cache does not exist');
}

// Recommendations
console.log('\n💡 Recommendations to fix build hangs:');
console.log('   1. Run: npm run clean (clears build and dist directories)');
console.log('   2. Run: npm run build:clean (clean build with fresh dependencies)');
console.log('   3. If still hanging, try: rm -rf node_modules && npm install');
console.log('   4. Check Activity Monitor for processes using high CPU/memory');
console.log('   5. Ensure you have at least 8GB RAM and 5GB free disk space');
console.log('   6. Try building with: npm run dist:mac -- --verbose');

// Check for running processes that might interfere
console.log('\n🔄 Checking for running processes...');
try {
  const processes = execSync('ps aux | grep -E "(electron|node|npm)" | grep -v grep', { encoding: 'utf8' });
  if (processes.trim()) {
    console.log('   Running processes that might interfere:');
    processes.split('\n').forEach(line => {
      if (line.trim()) {
        const parts = line.split(/\s+/);
        const pid = parts[1];
        const command = parts.slice(10).join(' ');
        console.log(`     PID ${pid}: ${command}`);
      }
    });
    console.log('   💡 Consider killing these processes before building');
  } else {
    console.log('   No interfering processes detected');
  }
} catch (error) {
  console.log('   No interfering processes detected');
}

console.log('\n✅ Troubleshooting complete!');
console.log('   Run the recommendations above if you\'re experiencing build hangs.');
