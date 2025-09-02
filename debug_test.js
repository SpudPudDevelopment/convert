const { getFormatConversionService } = require('./src/shared/services/FormatConversionService');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function debugTest() {
  try {
    // Create a test directory
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'debug-test-'));
    
    // Create a simple test image
    const testBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .jpeg({ quality: 80 })
    .toBuffer();
    
    // Write test image to file
    const inputPath = path.join(testDir, 'test.jpg');
    const outputPath = path.join(testDir, 'test.png');
    
    await fs.writeFile(inputPath, testBuffer);
    
    console.log('Input file created:', inputPath);
    console.log('Input file exists:', await fs.access(inputPath).then(() => true).catch(() => false));
    
    // Test conversion
    const service = getFormatConversionService();
    console.log('Service created:', !!service);
    
    const result = await service.convertFormat(inputPath, outputPath, 'png');
    console.log('Conversion result:', result.success);
    
    // Cleanup
    await fs.rmdir(testDir, { recursive: true });
    
  } catch (error) {
    console.error('Debug test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugTest();