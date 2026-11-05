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

function videoModel() {
  const map = new THREE.VideoTexture({ paused: false, readyState: 4 });
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
  };
  const renderer = {
    draws: 0,
    domElement: { style: {}, width: 300, height: 200 },
    render() {
      this.draws += 1;
    },
    setSize() {},
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
  });
  return { mosaic, filter, drawn: () => filter.frames + renderer.draws };
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
