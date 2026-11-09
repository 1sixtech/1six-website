import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real hook's effect with a controlled window and animation frame.
const file = new URL('./useScrollReveal.ts', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: file.pathname,
}).outputText;

function revealHarness() {
  const state = { visible: false };
  let effect;
  const window = new EventTarget();
  window.scrollY = 0;
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    window,
    exports,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    require: (name) => ({
      react: {
        useState: (initial) => (typeof initial === 'boolean'
          ? [state.visible, (value) => { state.visible = value; }]
          : [initial, () => {}]),
        useEffect: (setup) => { effect = setup; },
      },
      'next/navigation': { usePathname: () => '/thesis' },
    })[name],
  }));
  exports.useScrollReveal();
  effect();
  return {
    state,
    scroll(y) {
      window.scrollY = y;
      window.dispatchEvent(new Event('scroll'));
    },
  };
}

test('header reveal: the route resetting to the top is not the first scroll', () => {
  const reveal = revealHarness();
  reveal.scroll(0);
  assert.equal(reveal.state.visible, false, 'arriving from further down another page');
  reveal.scroll(12);
  assert.equal(reveal.state.visible, true);
});
