const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = resolve(__dirname, '../..');
const source = readFileSync(resolve(root, 'src/app/eGeometry.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleShim = { exports: {} };
const mockRequire = (id) => {
  if (id === './sharedGeometry') return require('./sharedGeometry');
  if (id === './assignmentBuckets') return require('../../src/app/assignmentBuckets.ts');
  if (id === '../svgUtils') return {};
  return require(id);
};

vm.runInNewContext(compiled, { require: mockRequire, module: moduleShim, exports: moduleShim.exports, console }, { filename: 'eGeometry.cjs' });

module.exports = moduleShim.exports;
