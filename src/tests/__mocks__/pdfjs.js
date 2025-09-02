/**
 * Mock for pdfjs-dist library
 */

const pdfjs = {
  getDocument: jest.fn(() => Promise.resolve({
    numPages: 1,
    getPage: jest.fn(() => Promise.resolve({
      getViewport: jest.fn(() => ({ width: 595, height: 842 })),
      render: jest.fn(() => Promise.resolve()),
      getTextContent: jest.fn(() => Promise.resolve({ items: [] }))
    }))
  })),
  GlobalWorkerOptions: {
    workerSrc: ''
  }
};

module.exports = pdfjs;
