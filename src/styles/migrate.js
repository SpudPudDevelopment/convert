#!/usr/bin/env node

/**
 * CSS Migration Script
 * 
 * This script helps migrate from the old CSS structure to the new architecture
 * by identifying duplicates and unused classes.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  log(`\n${'='.repeat(60)}`, 'bright');
  log(`  ${message}`, 'bright');
  log(`${'='.repeat(60)}`, 'bright');
}

function logSection(message) {
  log(`\n${'-'.repeat(40)}`, 'cyan');
  log(`  ${message}`, 'cyan');
  log(`${'-'.repeat(40)}`, 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function runCommand(command, description) {
  try {
    logInfo(`Running: ${description}`);
    const result = execSync(command, { encoding: 'utf8', cwd: process.cwd() });
    return result;
  } catch (error) {
    logError(`Failed to run: ${description}`);
    logError(error.message);
    return null;
  }
}

function findDuplicateClasses() {
  logSection('Finding Duplicate CSS Classes');
  
  const command = `grep -r "^\.[a-zA-Z][a-zA-Z0-9_-]*\s*{" src --include="*.css" | grep -v "src/tests/coverage" | sed 's/^.*\.//' | sed 's/\s*{.*$//' | sort | uniq -d`;
  
  const result = runCommand(command, 'Finding duplicate class definitions');
  if (!result) return [];
  
  const duplicates = result.trim().split('\n').filter(line => line.length > 0);
  
  if (duplicates.length === 0) {
    logSuccess('No duplicate classes found!');
    return [];
  }
  
  logWarning(`Found ${duplicates.length} duplicate classes:`);
  duplicates.forEach(dup => log(`  - ${dup}`, 'yellow'));
  
  return duplicates;
}

function findUnusedClasses() {
  logSection('Finding Unused CSS Classes');
  
  // Get defined classes
  const definedCommand = `grep -r "^\.[a-zA-Z][a-zA-Z0-9_-]*\s*{" src --include="*.css" | grep -v "src/tests/coverage" | sed 's/^.*\.//' | sed 's/\s*{.*$//' | sort | uniq`;
  const definedResult = runCommand(definedCommand, 'Finding defined classes');
  if (!definedResult) return [];
  
  // Get used classes
  const usedCommand = `grep -r "className=" src --include="*.js" | grep -v "src/tests" | grep -o 'className="[^"]*"' | sed 's/className="//' | sed 's/"//' | tr ' ' '\n' | sort | uniq`;
  const usedResult = runCommand(usedCommand, 'Finding used classes');
  if (!usedResult) return [];
  
  // Write to temporary files for comparison
  const definedFile = path.join(__dirname, 'defined_classes.txt');
  const usedFile = path.join(__dirname, 'used_classes.txt');
  
  fs.writeFileSync(definedFile, definedResult);
  fs.writeFileSync(usedFile, usedResult);
  
  // Find unused classes
  const unusedCommand = `comm -23 ${definedFile} ${usedFile}`;
  const unusedResult = runCommand(unusedCommand, 'Finding unused classes');
  
  // Clean up temp files
  fs.unlinkSync(definedFile);
  fs.unlinkSync(usedFile);
  
  if (!unusedResult) return [];
  
  const unused = unusedResult.trim().split('\n').filter(line => line.length > 0);
  
  if (unused.length === 0) {
    logSuccess('No unused classes found!');
    return [];
  }
  
  logWarning(`Found ${unused.length} unused classes`);
  logInfo('First 20 unused classes:');
  unused.slice(0, 20).forEach(cls => log(`  - ${cls}`, 'yellow'));
  
  if (unused.length > 20) {
    logInfo(`... and ${unused.length - 20} more`);
  }
  
  return unused;
}

function generateMigrationReport(duplicates, unused) {
  logSection('Migration Report');
  
  const report = {
    timestamp: new Date().toISOString(),
    duplicates: duplicates.length,
    unused: unused.length,
    recommendations: []
  };
  
  if (duplicates.length > 0) {
    report.recommendations.push({
      priority: 'HIGH',
      action: 'Remove duplicate class definitions',
      description: `Found ${duplicates.length} classes defined in multiple files`,
      examples: duplicates.slice(0, 5)
    });
  }
  
  if (unused.length > 0) {
    report.recommendations.push({
      priority: 'MEDIUM',
      action: 'Remove unused CSS classes',
      description: `Found ${unused.length} classes that are never used`,
      examples: unused.slice(0, 5)
    });
  }
  
  if (duplicates.length === 0 && unused.length === 0) {
    report.recommendations.push({
      priority: 'LOW',
      action: 'CSS is clean!',
      description: 'No duplicates or unused classes found',
      examples: []
    });
  }
  
  // Write report to file
  const reportFile = path.join(__dirname, 'migration-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  logSuccess(`Migration report saved to: ${reportFile}`);
  
  return report;
}

function showNextSteps(report) {
  logSection('Next Steps for Migration');
  
  if (report.recommendations.length === 0) {
    logSuccess('Your CSS is already clean! No migration needed.');
    return;
  }
  
  logInfo('Recommended migration steps:');
  
  report.recommendations.forEach((rec, index) => {
    log(`\n${index + 1}. ${rec.priority} PRIORITY: ${rec.action}`, 'bright');
    log(`   ${rec.description}`, 'reset');
    
    if (rec.examples.length > 0) {
      log('   Examples:', 'cyan');
      rec.examples.forEach(ex => log(`     - ${ex}`, 'yellow'));
    }
  });
  
  log('\n📋 Manual Migration Steps:', 'bright');
  log('1. Update your main CSS import to use src/styles/index.css', 'cyan');
  log('2. Remove old CSS files that contain duplicates', 'cyan');
  log('3. Update components to use utility classes and variables', 'cyan');
  log('4. Test the application to ensure styles still work', 'cyan');
  
  log('\n🔧 Automated Cleanup (Optional):', 'bright');
  log('Run: npm run css:cleanup (if you create this script)', 'cyan');
}

function main() {
  logHeader('CSS Migration Analysis');
  
  logInfo('Analyzing CSS structure for duplicates and unused classes...');
  
  try {
    const duplicates = findDuplicateClasses();
    const unused = findUnusedClasses();
    
    const report = generateMigrationReport(duplicates, unused);
    
    showNextSteps(report);
    
    logHeader('Migration Analysis Complete');
    
  } catch (error) {
    logError('Migration analysis failed:');
    logError(error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  findDuplicateClasses,
  findUnusedClasses,
  generateMigrationReport
};
