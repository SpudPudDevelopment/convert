#!/usr/bin/env node

/**
 * Simple CSS Migration Script
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

function findDuplicateClasses() {
  logSection('Finding Duplicate CSS Classes');
  
  try {
    // Use a simpler approach - find all CSS files and analyze them
    const cssFiles = [];
    
    function findCSSFiles(dir) {
      const items = fs.readdirSync(dir);
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('coverage')) {
          findCSSFiles(fullPath);
        } else if (item.endsWith('.css')) {
          cssFiles.push(fullPath);
        }
      });
    }
    
    findCSSFiles(path.join(process.cwd(), 'src'));
    
    logInfo(`Found ${cssFiles.length} CSS files`);
    
    // Read all CSS files and extract class names
    const allClasses = new Map(); // class -> [files]
    
    cssFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const classMatches = content.match(/^\s*\.([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/gm);
      
      if (classMatches) {
        classMatches.forEach(match => {
          const className = match.replace(/^\s*\./, '').replace(/\s*\{.*$/, '');
          if (!allClasses.has(className)) {
            allClasses.set(className, []);
          }
          allClasses.get(className).push(file);
        });
      }
    });
    
    // Find duplicates
    const duplicates = [];
    allClasses.forEach((files, className) => {
      if (files.length > 1) {
        duplicates.push({
          className,
          files: files.map(f => path.relative(process.cwd(), f))
        });
      }
    });
    
    if (duplicates.length === 0) {
      logSuccess('No duplicate classes found!');
      return [];
    }
    
    logWarning(`Found ${duplicates.length} duplicate classes:`);
    duplicates.slice(0, 20).forEach(dup => {
      log(`  - ${dup.className}`, 'yellow');
      dup.files.forEach(file => log(`    → ${file}`, 'cyan'));
    });
    
    if (duplicates.length > 20) {
      logInfo(`... and ${duplicates.length - 20} more`);
    }
    
    return duplicates;
    
  } catch (error) {
    logError(`Failed to find duplicate classes: ${error.message}`);
    return [];
  }
}

function findUnusedClasses() {
  logSection('Finding Unused CSS Classes');
  
  try {
    // Find all defined classes
    const cssFiles = [];
    
    function findCSSFiles(dir) {
      const items = fs.readdirSync(dir);
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('coverage')) {
          findCSSFiles(fullPath);
        } else if (item.endsWith('.css')) {
          cssFiles.push(fullPath);
        }
      });
    }
    
    findCSSFiles(path.join(process.cwd(), 'src'));
    
    // Extract all defined classes
    const definedClasses = new Set();
    cssFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const classMatches = content.match(/^\s*\.([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/gm);
      
      if (classMatches) {
        classMatches.forEach(match => {
          const className = match.replace(/^\s*\./, '').replace(/\s*\{.*$/, '');
          definedClasses.add(className);
        });
      }
    });
    
    // Find all used classes in JS files
    const jsFiles = [];
    
    function findJSFiles(dir) {
      const items = fs.readdirSync(dir);
      items.forEach(item => {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('coverage')) {
          findJSFiles(fullPath);
        } else if (item.endsWith('.js') || item.endsWith('.jsx')) {
          jsFiles.push(fullPath);
        }
      });
    }
    
    findJSFiles(path.join(process.cwd(), 'src'));
    
    const usedClasses = new Set();
    jsFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8');
      const classNameMatches = content.match(/className=["']([^"']+)["']/g);
      
      if (classNameMatches) {
        classNameMatches.forEach(match => {
          const classNames = match.replace(/className=["']/, '').replace(/["']$/, '');
          classNames.split(' ').forEach(cls => {
            if (cls.trim()) {
              usedClasses.add(cls.trim());
            }
          });
        });
      }
    });
    
    // Find unused classes
    const unused = Array.from(definedClasses).filter(cls => !usedClasses.has(cls));
    
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
    
  } catch (error) {
    logError(`Failed to find unused classes: ${error.message}`);
    return [];
  }
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
      examples: duplicates.slice(0, 5).map(d => d.className)
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
