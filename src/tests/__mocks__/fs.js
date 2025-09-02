/**
 * Mock for Node.js fs module
 */

const fs = {
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
  readFileSync: jest.fn(() => '{}'),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  statSync: jest.fn(() => ({
    isFile: () => true,
    isDirectory: () => false,
    size: 1024
  })),
  readdirSync: jest.fn(() => []),
  copyFileSync: jest.fn(),
  renameSync: jest.fn(),
  accessSync: jest.fn(),
  constants: {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2
  }
};

module.exports = fs;
