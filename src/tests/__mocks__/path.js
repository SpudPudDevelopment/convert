/**
 * Mock for Node.js path module
 */

const path = {
  join: jest.fn((...args) => {
    if (!args || args.length === 0) return '';
    return args.filter(arg => arg !== undefined && arg !== null).join('/');
  }),
  resolve: jest.fn((...args) => {
    if (!args || args.length === 0) return '';
    return args.filter(arg => arg !== undefined && arg !== null).join('/');
  }),
  dirname: jest.fn((filePath) => {
    if (!filePath) return '';
    return filePath.split('/').slice(0, -1).join('/');
  }),
  basename: jest.fn((filePath, ext) => {
    if (!filePath) return '';
    const name = filePath.split('/').pop();
    return ext ? name.replace(ext, '') : name;
  }),
  extname: jest.fn((filePath) => {
    if (!filePath) return '';
    const match = filePath.match(/\.[^.]*$/);
    return match ? match[0] : '';
  }),
  parse: jest.fn((filePath) => {
    if (!filePath) return { dir: '', name: '', ext: '', base: '', root: '' };
    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    return { dir, name, ext, base: name + ext, root: '/' };
  }),
  isAbsolute: jest.fn((filePath) => filePath && filePath.startsWith('/')),
  normalize: jest.fn((filePath) => filePath || ''),
  relative: jest.fn((from, to) => {
    if (!from || !to) return '';
    return to.replace(from, '');
  }),
  sep: '/'
};

module.exports = path;
