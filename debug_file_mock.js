// Simple test to debug File mock in Jest environment
const { execSync } = require('child_process');

try {
  const result = execSync('npm test -- --testNamePattern="debug file mock" --verbose', {
    cwd: '/Users/omnibusanalysis/Desktop/Projects/convert',
    encoding: 'utf8'
  });
  console.log(result);
} catch (error) {
  console.log('Test output:', error.stdout);
  console.log('Test errors:', error.stderr);
}