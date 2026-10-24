// Transpile local source for offline boundary checks; never boot the application.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
// Resolve the declared backend compiler instead of relying on npm hoisting it
// into the monorepo root (frontend and backend use different TS versions).
const ts = createRequire(path.join(root, 'backend/package.json'))('typescript');
function source(file, stubs = {}, globals = {}) {
  const filename = path.resolve(root, file), localRequire = createRequire(filename);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, experimentalDecorators: true, emitDecoratorMetadata: false, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(`(function(require,module,exports){${output}\n})`, { console, process: { env: {} }, Buffer, Date, TextEncoder, setTimeout, clearTimeout, setInterval, clearInterval, ...globals }, { filename });
  wrapper(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), name);
      for (const candidate of [base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.tsx`]) if (fs.existsSync(candidate)) return source(candidate, stubs, globals);
    }
    return localRequire(name);
  }, module, module.exports);
  return module.exports;
}
module.exports = { source };
