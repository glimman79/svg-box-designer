const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the production hook with scheduled React commits and native EventTarget.
// Browser tests separately verify the real DOM, focus, modal and inert behavior.
exports.importLockHarness = projectOwner => {
  const slots = [], pending = [], setters = [];
  let cursor = 0, lock;
  const window = new EventTarget();
  const dialog = { open: false, focuses: 0,
    showModal() { this.open = true; this.focus(); },
    close() { this.open = false; }, focus() { this.focuses++; } };
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: initial };
      return [slots[i].value, value => { slots[i].value = value; setters.push(value); }];
    },
    useLayoutEffect(effect, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, n) => dep !== previous.deps[n])) {
        pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const input = vm.createContext({ exports: {}, window });
  vm.runInContext(compile('src/app/modalInput.ts'), input);
  const context = vm.createContext({ exports: {}, require: name => name === './modalInput' ? input.exports : react, window });
  vm.runInContext(compile('src/app/useSvgImportLock.ts'), context);
  const render = () => {
    cursor = 0;
    lock = context.exports.useSvgImportLock(projectOwner);
    lock.dialogRef.current = dialog;
    while (pending.length) pending.shift()();
    return lock;
  };
  render();
  return { get lock() { return lock; }, window, dialog, setters, render,
    unmount() { slots.forEach(slot => slot.cleanup?.()); } };
};
