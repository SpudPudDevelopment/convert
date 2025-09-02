/**
 * E2E Test Runner
 * Runs comprehensive end-to-end tests for the file conversion application
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_CONFIG = {
  TIMEOUT: 30000, // 30 seconds per test
  RETRIES: 2, // Number of retries for flaky tests
  PARALLEL: false, // Run tests in parallel (set to false for debugging)
  COVERAGE: true, // Generate coverage reports
  REPORTER: 'verbose', // Test reporter type
  OUTPUT_DIR: path.join(__dirname, '../coverage/e2e'),
  LOG_FILE: path.join(__dirname, '../logs/e2e-tests.log')
};

// Test suites to run
const TEST_SUITES = [
  'basic-e2e.test.js'
];

// Utility functions
const log = (message, level = 'INFO') => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  
  // Write to log file
  const logDir = path.dirname(TEST_CONFIG.LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.appendFileSync(TEST_CONFIG.LOG_FILE, logMessage + '\n');
};

const runTestSuite = (testFile) => {
  const testPath = path.join(__dirname, testFile);
  
  if (!fs.existsSync(testPath)) {
    log(`Test file not found: ${testPath}`, 'ERROR');
    return { success: false, error: 'Test file not found' };
  }

  log(`Running test suite: ${testFile}`);
  
  try {
    const command = [
      'npx',
      'jest',
      testPath,
      '--testTimeout', TEST_CONFIG.TIMEOUT,
      '--verbose',
      '--no-cache',
      '--detectOpenHandles',
      '--forceExit'
    ];

    if (TEST_CONFIG.COVERAGE) {
      command.push('--coverage');
      command.push('--coverageDirectory', TEST_CONFIG.OUTPUT_DIR);
    }

    // Remove reporter option as it's causing issues
    // if (TEST_CONFIG.REPORTER) {
    //   command.push('--reporters', TEST_CONFIG.REPORTER);
    // }

    const result = execSync(command.join(' '), {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: path.join(__dirname, '../../../')
    });

    log(`Test suite completed: ${testFile}`, 'SUCCESS');
    return { success: true, output: result };

  } catch (error) {
    log(`Test suite failed: ${testFile}`, 'ERROR');
    log(`Error: ${error.message}`, 'ERROR');
    return { success: false, error: error.message, output: error.stdout };
  }
};

const runAllTests = async () => {
  log('Starting E2E test suite execution');
  log(`Configuration: ${JSON.stringify(TEST_CONFIG, null, 2)}`);

  const results = [];
  const startTime = Date.now();

  // Create output directory
  if (!fs.existsSync(TEST_CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(TEST_CONFIG.OUTPUT_DIR, { recursive: true });
  }

  // Run each test suite
  for (const testFile of TEST_SUITES) {
    let attempts = 0;
    let success = false;

    while (attempts < TEST_CONFIG.RETRIES && !success) {
      attempts++;
      
      if (attempts > 1) {
        log(`Retrying test suite: ${testFile} (attempt ${attempts})`);
      }

      const result = runTestSuite(testFile);
      results.push({
        testFile,
        success: result.success,
        attempts,
        error: result.error,
        output: result.output
      });

      if (result.success) {
        success = true;
        log(`Test suite passed: ${testFile} (attempt ${attempts})`, 'SUCCESS');
      } else {
        log(`Test suite failed: ${testFile} (attempt ${attempts})`, 'ERROR');
        
        if (attempts < TEST_CONFIG.RETRIES) {
          log(`Waiting before retry...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        }
      }
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Generate summary report
  const passedTests = results.filter(r => r.success);
  const failedTests = results.filter(r => !r.success);

  log('=== E2E Test Execution Summary ===');
  log(`Total test suites: ${TEST_SUITES.length}`);
  log(`Passed: ${passedTests.length}`);
  log(`Failed: ${failedTests.length}`);
  log(`Duration: ${duration}ms`);

  if (failedTests.length > 0) {
    log('Failed test suites:', 'ERROR');
    failedTests.forEach(test => {
      log(`  - ${test.testFile}: ${test.error}`, 'ERROR');
    });
  }

  // Generate detailed report
  const reportPath = path.join(TEST_CONFIG.OUTPUT_DIR, 'e2e-test-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    configuration: TEST_CONFIG,
    summary: {
      total: TEST_SUITES.length,
      passed: passedTests.length,
      failed: failedTests.length,
      duration
    },
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`Detailed report saved to: ${reportPath}`);

  // Exit with appropriate code
  const exitCode = failedTests.length > 0 ? 1 : 0;
  log(`E2E test execution completed with exit code: ${exitCode}`);
  
  return exitCode;
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
E2E Test Runner

Usage: node test-runner.js [options]

Options:
  --help, -h          Show this help message
  --timeout <ms>      Set test timeout (default: 30000)
  --retries <n>       Set number of retries (default: 2)
  --parallel          Run tests in parallel
  --no-coverage       Disable coverage reporting
  --reporter <type>   Set test reporter (default: verbose)
  --suite <file>      Run specific test suite
  --list              List available test suites

Examples:
  node test-runner.js
  node test-runner.js --timeout 60000
  node test-runner.js --suite conversion-e2e.test.js
  node test-runner.js --parallel --no-coverage
    `);
    process.exit(0);
  }

  if (args.includes('--list')) {
    console.log('Available test suites:');
    TEST_SUITES.forEach(suite => console.log(`  - ${suite}`));
    process.exit(0);
  }

  // Parse command line arguments
  const timeoutIndex = args.indexOf('--timeout');
  if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
    TEST_CONFIG.TIMEOUT = parseInt(args[timeoutIndex + 1]);
  }

  const retriesIndex = args.indexOf('--retries');
  if (retriesIndex !== -1 && args[retriesIndex + 1]) {
    TEST_CONFIG.RETRIES = parseInt(args[retriesIndex + 1]);
  }

  if (args.includes('--parallel')) {
    TEST_CONFIG.PARALLEL = true;
  }

  if (args.includes('--no-coverage')) {
    TEST_CONFIG.COVERAGE = false;
  }

  const reporterIndex = args.indexOf('--reporter');
  if (reporterIndex !== -1 && args[reporterIndex + 1]) {
    TEST_CONFIG.REPORTER = args[reporterIndex + 1];
  }

  const suiteIndex = args.indexOf('--suite');
  if (suiteIndex !== -1 && args[suiteIndex + 1]) {
    const specificSuite = args[suiteIndex + 1];
    if (TEST_SUITES.includes(specificSuite)) {
      TEST_SUITES.length = 0;
      TEST_SUITES.push(specificSuite);
    } else {
      log(`Test suite not found: ${specificSuite}`, 'ERROR');
      process.exit(1);
    }
  }

  // Run tests
  runAllTests().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    log(`Unexpected error: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = {
  runAllTests,
  runTestSuite,
  TEST_CONFIG,
  TEST_SUITES
};
