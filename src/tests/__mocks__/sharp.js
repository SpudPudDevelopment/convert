/**
 * Mock for Sharp image processing library
 */

const sharp = jest.fn(() => ({
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  png: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  gif: jest.fn().mockReturnThis(),
  tiff: jest.fn().mockReturnThis(),
  bmp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(() => Promise.resolve(Buffer.from('mock-image-data'))),
  toFile: jest.fn(() => Promise.resolve({ format: 'jpeg', width: 100, height: 100 })),
  metadata: jest.fn(() => Promise.resolve({
    format: 'jpeg',
    width: 100,
    height: 100,
    space: 'srgb',
    channels: 3,
    depth: 'uchar',
    density: 72,
    orientation: 1,
    hasProfile: false,
    hasAlpha: false
  }))
}));

// Static methods
sharp.metadata = jest.fn(() => Promise.resolve({
  format: 'jpeg',
  width: 100,
  height: 100
}));

sharp.format = {
  jpeg: {},
  png: {},
  webp: {},
  gif: {},
  tiff: {},
  bmp: {}
};

module.exports = sharp;
