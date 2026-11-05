import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { THEME_INIT_SCRIPT } from './themeInit.ts';

/**
 * Runs the inline <head> script as the browser does (a classic script) in a
 * sandbox holding just the globals it reads, and returns what it left behind.
 */
function runThemeInit({
  stored = null,
  phone = false,
  reducedMotion = false,
  introSeen = false,
  pathname = '/',
  storageThrows = false,
} = {}) {
  const storage = new Map(stored === null ? [] : [['theme', stored]]);
  const guard = () => {
    if (storageThrows) throw new Error('SecurityError: storage is disabled');
  };
  const listeners = {};
  const root = { attributes: {}, classes: new Set(), dataset: {} };
  const state = { root, storage, listeners, reloads: 0, history: { scrollRestoration: 'auto' } };
  const context = vm.createContext({
    localStorage: {
      getItem: (key) => (guard(), storage.get(key) ?? null),
      setItem: (key, value) => (guard(), storage.set(key, String(value))),
    },
    sessionStorage: {
      getItem: (key) => (guard(), key === 'introSeen' && introSeen ? '1' : null),
    },
    history: state.history,
    document: {
      documentElement: {
        setAttribute: (name, value) => {
          root.attributes[name] = value;
        },
        classList: { add: (name) => root.classes.add(name) },
        dataset: root.dataset,
      },
    },
    window: {
      matchMedia: (query) => ({
        matches:
          (query === '(max-width: 767px)' && phone) ||
          (query === '(prefers-reduced-motion: reduce)' && reducedMotion),
      }),
      location: {
        pathname,
        reload: () => {
          state.reloads += 1;
        },
      },
      addEventListener: (type, listener) => {
        listeners[type] = listener;
      },
    },
  });
  new vm.Script(THEME_INIT_SCRIPT).runInContext(context);
  return state;
}

test('theme bootstrap: a stored theme wins; a first visit gets dark on a phone, light on a desktop, and keeps it', () => {
  for (const [options, theme, stored] of [
    [{ stored: 'dark' }, 'dark', 'dark'],
    [{ stored: 'light', phone: true }, 'light', 'light'],
    [{ phone: true }, 'dark', 'dark'],
    [{}, 'light', 'light'],
    [{ stored: 'sepia', phone: true }, 'dark', 'dark'],
  ]) {
    const { root, storage } = runThemeInit(options);
    assert.equal(root.attributes['data-theme'], theme, JSON.stringify(options));
    assert.equal(storage.get('theme'), stored, JSON.stringify(options));
  }

  // Storage that refuses access must not stop the script before the intro lock.
  const blocked = runThemeInit({ storageThrows: true });
  assert.ok(blocked.root.classes.has('intro-lock'));
  assert.equal(blocked.root.dataset.introActive, 'true');
});

test('theme bootstrap: storage that refuses access still gets the device default', () => {
  assert.equal(runThemeInit({ storageThrows: true, phone: true }).root.attributes['data-theme'], 'dark');
  assert.equal(runThemeInit({ storageThrows: true }).root.attributes['data-theme'], 'light');
});

test('intro bootstrap: Home locks and plays the intro once per session, unless motion is reduced', () => {
  const first = runThemeInit();
  assert.ok(first.root.classes.has('intro-lock'));
  assert.equal(first.root.dataset.introActive, 'true');
  assert.equal(first.root.dataset.introSkip, undefined);
  assert.equal(first.history.scrollRestoration, 'manual');

  for (const options of [{ introSeen: true }, { reducedMotion: true }]) {
    const { root } = runThemeInit(options);
    assert.ok(root.classes.has('intro-lock'));
    assert.equal(root.dataset.introSkip, 'true', JSON.stringify(options));
    assert.equal(root.dataset.introActive, undefined, JSON.stringify(options));
  }

  const about = runThemeInit({ pathname: '/about' });
  assert.equal(about.root.classes.size, 0);
  assert.deepEqual(about.root.dataset, {});

  // A page restored from the back-forward cache reloads, so the intro and
  // canvases start clean; a normal show does not.
  first.listeners.pageshow({ persisted: false });
  assert.equal(first.reloads, 0);
  first.listeners.pageshow({ persisted: true });
  assert.equal(first.reloads, 1);
});
