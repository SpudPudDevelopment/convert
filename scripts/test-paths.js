#!/usr/bin/env node

const path = require('path');

console.log('🔍 Testing Path Resolution for Packaged App\n');

// Simulate the packaged app environment
const isDevMode = false;
const electronDirname = '/Applications/Convert.app/Contents/Resources/app.asar/public';
const resourcePath = path.join(electronDirname, '..');

console.log('📁 Simulated packaged app paths:');
console.log(`   electronDirname: ${electronDirname}`);
console.log(`   resourcePath: ${resourcePath}`);

// Test the paths that will be used
const testPaths = [
  'src/shared/ipc/mainHandlers.js',
  'src/shared/config/development.js',
  'src/shared/utils/logger.js',
  'src/shared/utils/devUtils.js',
  'src/shared/services/crashReporting.js',
  'src/shared/services/permissions.js',
  'src/main/services/audioConversionService.js',
  'app-update.yml'
];

console.log('\n📂 Testing required module paths:');
testPaths.forEach(testPath => {
  const fullPath = path.join(resourcePath, testPath);
  console.log(`   ${testPath} -> ${fullPath}`);
});

console.log('\n📂 Testing HTML file path:');
const htmlPath = path.join(electronDirname, '../build/index.html');
console.log(`   HTML file: ${htmlPath}`);

console.log('\n📂 Testing icon path:');
const iconPath = path.join(electronDirname, '../assets/icon.png');
console.log(`   Icon file: ${iconPath}`);

console.log('\n✅ Path resolution test complete!');
console.log('   In the packaged app:');
console.log('   - src/ directory should be at: /Applications/Convert.app/Contents/Resources/app.asar/src/');
console.log('   - build/ directory should be at: /Applications/Convert.app/Contents/Resources/app.asar/build/');
console.log('   - app-update.yml should be at: /Applications/Convert.app/Contents/Resources/app-update.yml');
