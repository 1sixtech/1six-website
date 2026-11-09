import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import ts from 'typescript';

// index.ts imports interfaces as values (`AsciiMosaicFilterOptions`), the
// '@/' alias and extensionless paths, none of which Node's type stripping
// handles. In-process hooks transpile src/ with TypeScript (a devDependency)
// the way the bundler would, and resolve the paths.
const SRC = new URL('../../', import.meta.url);
const canHook = typeof nodeModule.registerHooks === 'function';
const skip = canHook ? false : 'needs module.registerHooks (Node 22.15+)';
let AscMosaic;
if (canHook) {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      let url = null;
      if (specifier.startsWith('@/')) url = new URL(specifier.slice(2), SRC);
      else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith(SRC.href)) {
        url = new URL(specifier, context.parentURL);
      }
      if (url && !/\.[cm]?[jt]sx?$/.test(url.pathname) && existsSync(`${fileURLToPath(url)}.ts`)) {
        return nextResolve(`${url.href}.ts`, context);
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (!url.startsWith(SRC.href) || !url.endsWith('.ts')) return nextLoad(url, context);
      const file = fileURLToPath(url);
      const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: file,
      });
      return { format: 'module', source: outputText, shortCircuit: true };
    },
  });
  ({ AscMosaic } = await import('./index.ts'));
}

// requestAnimationFrame driven by hand: runFrames(n) plays n display frames.
const frameCallbacks = new Map();
let frameId = 0;
globalThis.requestAnimationFrame = (callback) => {
  frameCallbacks.set(++frameId, callback);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => frameCallbacks.delete(id);
function runFrames(count) {
  for (let i = 0; i < count; i++) {
    const due = [...frameCallbacks.values()];
    frameCallbacks.clear();
    due.forEach((callback) => callback(performance.now()));
  }
}

/** A plane whose texture is a still image; `null` while it is still loading. */
function imageModel(image = { width: 16, height: 16 }) {
  const map = new THREE.Texture(image);
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map }));
}

function videoModel(video = { paused: false, readyState: 4, HAVE_CURRENT_DATA: 2 }) {
  const map = new THREE.VideoTexture(video);
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map }));
}

/**
 * An AscMosaic without its WebGL context: the constructor's fields are set by
 * hand (renderer and mosaic filter faked) so the frame loop runs in Node.
 * `drawn()` counts the frames that reached the screen.
 */
function mosaicHarness({ model = imageModel(), autoRotate = false } = {}) {
  const filter = {
    enabled: true,
    wants: false,
    frames: 0,
    getEnabled() {
      return this.enabled;
    },
    disable() {
      this.enabled = false;
    },
    renderToTarget() {},
    render() {
      this.frames += 1;
    },
    wantsFrame() {
      return this.wants;
    },
    setSize() {},
    dispose() {},
  };
  const renderer = {
    draws: 0,
    disposals: 0,
    contextLost: false,
    contextLosses: 0,
    domElement: { style: {}, width: 300, height: 200 },
    render() {
      this.draws += 1;
    },
    setSize() {},
    dispose() {
      this.disposals += 1;
    },
    getContext: () => ({ isContextLost: () => renderer.contextLost }),
    forceContextLoss() {
      this.contextLosses += 1;
      this.contextLost = true;
    },
  };
  const mosaic = Object.assign(Object.create(AscMosaic.prototype), {
    container: { clientWidth: 300, clientHeight: 200 },
    scene: new THREE.Scene(),
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10),
    renderer,
    model,
    modelOptions: null,
    orbitControls: null,
    lastOrbitOptions: undefined,
    tiltControlsEnabled: false,
    asciiMosaicFilter: filter,
    renderScale: 1,
    animationFrameId: null,
    isAnimating: false,
    useOrthographic: true,
    orthoSize: 5,
    modelAutoRotate: autoRotate,
    modelAutoRotateSpeed: 0.005,
    renderOnDemand: false,
    renderPending: true,
    sceneTexturesSettled: false,
    tiltResetAnimationId: null,
    tiltAnimationId: null,
    disposed: false,
  });
  return { mosaic, filter, renderer, drawn: () => filter.frames + renderer.draws };
}

test('render on demand: off by default; on, a still image draws only the frames that can differ', { skip }, () => {
  const { mosaic, filter, drawn } = mosaicHarness();
  mosaic.animate(); // the loop draws its first frame at once
  runFrames(3);
  assert.equal(drawn(), 4, 'off: every display frame draws');

  mosaic.setRenderOnDemand(true);
  runFrames(1);
  assert.equal(drawn(), 5, 'switching it on owes a frame');
  runFrames(5);
  assert.equal(drawn(), 5, 'a still scene draws nothing more');

  filter.wants = true; // the filter's noise clock or mouse asks
  runFrames(2);
  assert.equal(drawn(), 7);
  filter.wants = false;
  runFrames(2);
  assert.equal(drawn(), 7);

  // Paused off screen, then restarted: the restart draws at once.
  mosaic.stopAnimate();
  runFrames(2);
  assert.equal(drawn(), 7);
  mosaic.animate();
  assert.equal(drawn(), 8);
  runFrames(2);
  assert.equal(drawn(), 8);
  mosaic.stopAnimate();
});

test('render on demand: waits for the image to arrive; video and a moving scene keep every frame', { skip }, () => {
  const loading = imageModel(null);
  const still = mosaicHarness({ model: loading });
  still.mosaic.setRenderOnDemand(true);
  still.mosaic.animate();
  runFrames(3);
  assert.equal(still.drawn(), 1, 'while the image loads, only the owed first frame');
  loading.material.map.image = { width: 16, height: 16 };
  runFrames(1);
  assert.equal(still.drawn(), 2, 'the frame after it arrives uploads and shows it');
  runFrames(3);
  assert.equal(still.drawn(), 2);
  still.mosaic.stopAnimate();

  const moving = {
    video: mosaicHarness({ model: videoModel() }),
    autoRotate: mosaicHarness({ autoRotate: true }),
    orbit: mosaicHarness(),
    tilt: mosaicHarness(),
  };
  moving.orbit.mosaic.orbitControls = { update() {} };
  moving.tilt.mosaic.tiltControlsEnabled = true;
  for (const [name, { mosaic, drawn }] of Object.entries(moving)) {
    mosaic.setRenderOnDemand(true);
    mosaic.animate();
    runFrames(3);
    assert.equal(drawn(), 4, `${name}: every frame draws`);
    mosaic.stopAnimate();
  }
});

test('video frames: nothing draws until a frame is uploaded, so an empty texture never tiles one glyph', { skip }, () => {
  // A playing video reports frames through requestVideoFrameCallback.
  let presentFrame;
  const video = {
    paused: false,
    readyState: 2,
    requestVideoFrameCallback(callback) {
      presentFrame = callback;
      return 1;
    },
    cancelVideoFrameCallback() {},
  };
  const { mosaic, drawn } = mosaicHarness({ model: videoModel(video) });
  mosaic.animate();
  runFrames(5);
  assert.equal(drawn(), 0, 'a video that has not presented a frame draws nothing');
  presentFrame();
  runFrames(1);
  assert.equal(drawn(), 1, 'the first presented frame draws');
  mosaic.stopAnimate();
});

test('video frames: a paused video with decoded data still draws its frame (Low Power Mode)', { skip }, () => {
  const video = {
    paused: true,
    readyState: 2,
    requestVideoFrameCallback: () => 1,
    cancelVideoFrameCallback() {},
  };
  const { mosaic, drawn } = mosaicHarness({ model: videoModel(video) });
  mosaic.animate();
  assert.equal(drawn(), 1);
  mosaic.stopAnimate();
});

test('video frames: a paused video with no data draws nothing', { skip }, () => {
  const video = {
    paused: true,
    readyState: 1,
    requestVideoFrameCallback: () => 1,
    cancelVideoFrameCallback() {},
  };
  const { mosaic, drawn } = mosaicHarness({ model: videoModel(video) });
  mosaic.animate();
  runFrames(3);
  assert.equal(drawn(), 0);
  mosaic.stopAnimate();
});

test('render on demand: size, camera and filter changes each owe exactly one frame', { skip }, () => {
  const { mosaic, drawn } = mosaicHarness();
  mosaic.setRenderOnDemand(true);
  mosaic.animate();
  runFrames(3);
  assert.equal(drawn(), 1);

  const changes = {
    setCanvasSize: () => mosaic.setCanvasSize(320, 180),
    setRenderScale: () => mosaic.setRenderScale(2),
    setUseOrthographic: () => mosaic.setUseOrthographic(false),
    disableAsciiMosaicFilter: () => mosaic.disableAsciiMosaicFilter(),
  };
  for (const [name, change] of Object.entries(changes)) {
    const before = drawn();
    change();
    runFrames(3);
    assert.equal(drawn() - before, 1, `${name} should draw one frame`);
  }
  mosaic.stopAnimate();
});

test('render on demand: a disabled filter owes no frames, even one that would still ask', { skip }, () => {
  const { mosaic, filter, drawn } = mosaicHarness();
  mosaic.setRenderOnDemand(true);
  mosaic.animate();
  runFrames(2);
  // The real filter marks itself dirty on disable() and only its own render()
  // clears that, which a disabled filter never gets: it would ask forever.
  filter.wants = true;
  mosaic.disableAsciiMosaicFilter();
  const before = drawn();
  runFrames(5);
  assert.equal(drawn() - before, 1, 'the scene drawn once without the filter, then nothing');
  mosaic.stopAnimate();
});

test('dispose: a repeat call frees nothing twice, and a context already taken back is not lost again', { skip }, () => {
  for (const alreadyLost of [false, true]) {
    const model = imageModel();
    const { mosaic, renderer, drawn } = mosaicHarness({ model });
    let geometryDisposals = 0;
    model.geometry.addEventListener('dispose', () => {
      geometryDisposals += 1;
    });
    renderer.contextLost = alreadyLost; // e.g. evicted at the browser's live-context limit
    mosaic.animate();
    assert.equal(drawn(), 1, `the first frame draws`);

    mosaic.dispose();
    mosaic.dispose(); // AsciiCanvas: teardown, then the superseded init's own cleanup
    const name = alreadyLost ? 'lost context' : 'live context';
    assert.equal(renderer.disposals, 1, `${name}: the renderer is disposed once`);
    assert.equal(geometryDisposals, 1, `${name}: the model is disposed once`);
    assert.equal(renderer.contextLosses, alreadyLost ? 0 : 1, `${name}: context losses`);
    runFrames(2);
    assert.equal(drawn(), 1, `${name}: nothing draws after dispose`);
  }
});

/** A <video> that reports canplay only when the test says so. */
function fakeVideo() {
  return Object.assign(new EventTarget(), {
    src: '',
    paused: true,
    setAttribute() {},
    removeAttribute(name) {
      if (name === 'src') this.src = '';
    },
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
    load() {},
  });
}

test('dispose: a model still loading at dispose is freed when it arrives, never attached', { skip }, async () => {
  const videos = [];
  globalThis.document = {
    createElement: () => {
      const video = fakeVideo();
      videos.push(video);
      return video;
    },
  };
  try {
    const { mosaic } = mosaicHarness({ model: null });
    const loading = mosaic.addModel({ shape: 'plane', textureUrl: '/v.mp4', textureType: 'video' });
    mosaic.dispose(); // AsciiCanvas tears down while the video loads
    const [video] = videos;
    video.dispatchEvent(new Event('canplay')); // it arrives, and starts playing
    const model = await loading;

    assert.equal(mosaic.scene.children.includes(model), false, 'not attached to the released scene');
    assert.equal(mosaic.model, null, 'the mosaic keeps no model');
    assert.equal(video.paused, true, 'its video is stopped');
    assert.equal(video.src, '', 'and let go');
    mosaic.dispose(); // the superseded init's own cleanup finds nothing left
  } finally {
    delete globalThis.document;
  }
});


test('source readiness: an image handle waits for decoded image data', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { mosaic } = mosaicHarness({ model: imageModel(null) });
  let ready = false;
  const pending = mosaic.waitForSceneTextures().then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  t.mock.timers.tick(1000); await Promise.resolve(); assert.equal(ready, false);
  mosaic.model.material.map.image = { width: 16, height: 16 };
  t.mock.timers.tick(16); await pending; assert.equal(ready, true);
  mosaic.dispose();
});

test('source readiness: disposal releases a pending image so navigation is not held', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { mosaic } = mosaicHarness({ model: imageModel(null) });
  const pending = assert.rejects(mosaic.waitForSceneTextures(), /disposed/);
  mosaic.dispose(); t.mock.timers.tick(16); await pending;
});

test('source readiness: a missing image has a bounded deadline', { skip }, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { mosaic } = mosaicHarness({ model: imageModel(null) });
  const pending = assert.rejects(mosaic.waitForSceneTextures(), /timed out/);
  t.mock.timers.tick(5001); await pending; mosaic.dispose();
});
