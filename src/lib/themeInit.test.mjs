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
  hash = '',
  storageThrows = false,
} = {}) {
  const storage = new Map(stored === null ? [] : [['theme', stored]]);
  const guard = () => {
    if (storageThrows) throw new Error('SecurityError: storage is disabled');
  };
  const listeners = {};
  const timers = [];
  const root = { attributes: {}, classes: new Set(), dataset: {} };
  const state = { root, storage, listeners, reloads: 0, timers, history: { scrollRestoration: 'auto' } };
  const context = vm.createContext({
    localStorage: {
      getItem: (key) => (guard(), storage.get(key) ?? null),
      setItem: (key, value) => (guard(), storage.set(key, String(value))),
    },
    sessionStorage: {
      getItem: (key) => (guard(), key === 'siteIntroSeen' && introSeen ? '1' : null),
    },
    history: state.history,
    setTimeout: (callback) => timers.push(callback),
    document: {
      documentElement: {
        setAttribute: (name, value) => {
          root.attributes[name] = value;
        },
        classList: { add: (name) => root.classes.add(name), remove: (...names) => names.forEach((name) => root.classes.delete(name)) },
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
        pathname, hash,
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

test('intro bootstrap: both visual routes may show the logo; Writing is immediate', () => {
  const first = runThemeInit();
  assert.ok(first.root.classes.has('intro-lock'));
  assert.equal(first.root.dataset.introActive, 'true');
  assert.equal(first.root.dataset.introSkip, undefined);
  assert.equal(first.history.scrollRestoration, 'manual');

  for (const options of [{ introSeen: true }, { reducedMotion: true }]) {
    const { root } = runThemeInit(options);
    assert.equal(root.classes.has('intro-lock'), false);
    assert.equal(root.dataset.introSkip, 'true', JSON.stringify(options));
    assert.equal(root.dataset.introActive, undefined, JSON.stringify(options));
  }

  const thesis = runThemeInit({ pathname: '/thesis' });
  assert.ok(thesis.root.classes.has('intro-lock'));
  assert.equal(thesis.root.dataset.introActive, 'true');
  assert.ok(thesis.root.classes.has('thesis-entry-lock'));
  const returning = runThemeInit({ pathname: '/thesis', introSeen: true });
  assert.ok(returning.root.classes.has('thesis-entry-lock'));
  assert.equal(returning.root.classes.has('intro-lock'), false);

  const writing = runThemeInit({ pathname: '/writing' });
  assert.equal(writing.root.classes.size, 0);
  assert.equal(writing.root.dataset.introSkip, 'true');

  // A page restored from the back-forward cache reloads, so the intro and
  // canvases start clean; a normal show does not.
  first.listeners.pageshow({ persisted: false });
  assert.equal(first.reloads, 0);
  first.listeners.pageshow({ persisted: true });
  assert.equal(first.reloads, 1);
});


test('entry watchdog: blocked application chunks release both locks and prevent a late full intro', () => {
  const entry = runThemeInit({ pathname: '/thesis' });
  entry.timers[0]();
  assert.equal(entry.root.classes.size, 0);
  assert.equal(entry.root.dataset.introActive, undefined);
  assert.equal(entry.root.dataset.introExpired, 'true');
});

test('entry watchdog: hydrated navigation retains ownership of its current locks', () => {
  const entry = runThemeInit({ pathname: '/thesis' });
  entry.root.dataset.entryHydrated = 'true';
  entry.timers[0]();
  assert.ok(entry.root.classes.has('intro-lock'));
  assert.ok(entry.root.classes.has('thesis-entry-lock'));
});


test('entry bootstrap: direct anchors retain their first-screen policy', () => {
  for (const hash of ['#thesis', '#products']) {
    const entry = runThemeInit({ pathname: '/thesis', hash });
    assert.equal(entry.root.dataset.introActive, 'true');
    assert.equal(entry.root.classes.has('thesis-entry-lock'), false);
  }
  const text = runThemeInit({ hash: '#investors' });
  assert.equal(text.root.classes.size, 0);
  assert.equal(text.root.dataset.introSkip, 'true');
});
