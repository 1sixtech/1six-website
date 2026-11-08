import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('./CrossingMark.tsx', import.meta.url);
const code = ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  fileName: file.pathname,
}).outputText;

test('About mark: readiness follows the current mount and ignores a late callback after route leave', () => {
  let ready = false;
  let setup;
  const symbol = Symbol('AsciiTeamSymbol');
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState: () => [false, () => {}], useRef: (value) => ({ current: value }),
      useCallback: (callback) => callback, useLayoutEffect: (effect) => { setup = effect; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/ascii/AsciiTeamSymbol': { AsciiTeamSymbol: symbol },
    '@/lib/introState': {
      markAboutMarkReady: () => { ready = true; },
      resetAboutMarkReady: () => { ready = false; },
    },
  };
  const exports = {};
  new vm.Script(code, { filename: file.pathname }).runInContext(vm.createContext({
    exports, require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name)); return dependencies[name];
    },
  }));
  const findSymbol = (node) => {
    if (Array.isArray(node)) return node.map(findSymbol).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    return node.type === symbol ? node : findSymbol(node.props?.children);
  };
  const old = findSymbol(exports.CrossingMark()).props.onReady;
  const cleanup = setup(); old(); assert.equal(ready, true);
  cleanup(); assert.equal(ready, false);
  const current = findSymbol(exports.CrossingMark()).props.onReady;
  const currentCleanup = setup();
  old(); assert.equal(ready, false, 'an old canvas must not reveal the new page');
  current(); assert.equal(ready, true);
  currentCleanup(); assert.equal(ready, false);
});
