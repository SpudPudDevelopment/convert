/**
 * Mock for Electron modules
 */

const electron = {
  app: {
    getPath: jest.fn((name) => `/mock/${name}`),
    getAppPath: jest.fn(() => '/mock/app'),
    getName: jest.fn(() => 'Convert'),
    getVersion: jest.fn(() => '1.0.0'),
    isPackaged: jest.fn(() => false),
    quit: jest.fn(),
    exit: jest.fn()
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeHandler: jest.fn(),
    removeAllListeners: jest.fn()
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    send: jest.fn()
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showErrorBox: jest.fn(),
    showMessageBox: jest.fn()
  },
  shell: {
    openPath: jest.fn(),
    showItemInFolder: jest.fn(),
    trashItem: jest.fn()
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    loadFile: jest.fn(),
    webContents: {
      send: jest.fn(),
      on: jest.fn()
    },
    on: jest.fn(),
    close: jest.fn(),
    destroy: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    minimize: jest.fn(),
    maximize: jest.fn(),
    restore: jest.fn(),
    setTitle: jest.fn(),
    setSize: jest.fn(),
    setPosition: jest.fn()
  }))
};

module.exports = electron;
