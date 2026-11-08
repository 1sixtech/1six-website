import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { AsciiMosaicFilter } from './asciiMosaicFilter.ts';

// The filter's coverage supersampling (SUPERSAMPLE in buildCoverageAtlas).
const SUPERSAMPLE = 8;

/**
 * The atlas images the fake loader serves, by URL. Each is a function from an
 * output texel (x, y) and one of its SUPERSAMPLE² samples (sx, sy) to that
 * sample's RGBA, as the browser's scaled drawImage would have produced it.
 * A URL not listed here fails to load.
 */
const atlases = new Map();
const PLAIN = '/atlas-plain.png';
atlases.set(PLAIN, () => [0, 0, 0, 255]);
let canvas2dAvailable = true;
/** The DOM work done so far: images fetched, canvases made, images drawn. */
const dom = { images: 0, canvases: 0, draws: 0 };

class FakeImage extends EventTarget {
  #src = '';
  get src() {
    return this.#src;
  }
  set src(url) {
    this.#src = url;
    setTimeout(() => this.dispatchEvent(new Event(atlases.has(url) ? 'load' : 'error')));
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  getContext() {
    if (!canvas2dAvailable) return null;
    let drawn = null;
    return {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage: (image) => {
        dom.draws += 1;
        drawn = image;
      },
      getImageData: (x, y, w, h) => {
        const sample = atlases.get(drawn.src);
        const data = new Uint8ClampedArray(w * h * 4);
        for (let py = 0; py < h; py++) {
          for (let px = 0; px < w; px++) {
            const rgba = sample(
              Math.floor(px / SUPERSAMPLE),
              Math.floor(py / SUPERSAMPLE),
              px % SUPERSAMPLE,
              py % SUPERSAMPLE,
            );
            data.set(rgba, (py * w + px) * 4);
          }
        }
        return { data };
      },
    };
  }
}

// Just the DOM the filter touches: three's ImageLoader and the atlas canvas.
globalThis.document = {
  createElementNS: () => {
    dom.images += 1;
    return new FakeImage();
  },
  createElement: () => {
    dom.canvases += 1;
    return new FakeCanvas();
  },
};
after(() => {
  delete globalThis.document;
});

/** Stands in for THREE.WebGLRenderer: records each frame's scene. */
function fakeRenderer() {
  const domElement = new EventTarget();
  domElement.width = 300;
  domElement.height = 200;
  domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200 });
  const scenes = [];
  return {
    domElement,
    scenes,
    render: (scene) => scenes.push(scene),
    getRenderTarget: () => null,
    setRenderTarget: () => {},
  };
}

/** The mosaic mesh of the last frame drawn. */
function drawnMesh(renderer) {
  return renderer.scenes.at(-1).children.find((child) => child.isInstancedMesh);
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

async function ready(filter) {
  for (let i = 0; i < 20 && !filter.isReady(); i++) await tick();
  assert.ok(filter.isReady(), 'the filter never became ready');
}

/** Lets a pending atlas load (the fake image's load event) and its swap finish. */
async function settled() {
  for (let i = 0; i < 5; i++) await tick();
}

/** A filter at 40x20 that has finished loading its atlas. */
async function readyFilter(options, renderer = fakeRenderer()) {
  const filter = new AsciiMosaicFilter(renderer, 40, 20, { mosaicCellTextureUrl: PLAIN, ...options });
  await ready(filter);
  await settled();
  return { filter, renderer };
}

/** The atlas texture the last frame sampled. */
function drawnTexture(renderer) {
  return drawnMesh(renderer).material.uniforms.tAtlas.value;
}

/** The coverage atlas of the last frame, read as [r, g, b, a] per texel. */
function drawnAtlas(renderer) {
  const atlas = drawnTexture(renderer);
  const { data, width } = atlas.image;
  const texel = (x, row) => Array.from(data.slice((row * width + x) * 4, (row * width + x) * 4 + 4));
  return { atlas, texel };
}

/** Swaps performance.now for a clock the test moves by hand. */
function fakeClock(start) {
  const clock = { now: start };
  performance.now = () => clock.now;
  clock.restore = () => {
    delete performance.now;
  };
  return clock;
}

test('coverage atlas: each texel is its premultiplied sample average, rows flipped, drawn 1:1', async () => {
  atlases.set('/atlas-coverage.png', (x, y, sx, sy) => {
    if (y === 1) return [10, 20, 30, 255];
    if (x === 0) return [200, 100, 60, 255];
    // 48 of 64 samples: transparent white samples must add no colour.
    if (x === 1) return sy < 6 ? [200, 100, 60, 255] : [255, 255, 255, 0];
    if (x === 2) return [250, 0, 0, 51];
    return [255, 255, 255, 0];
  });
  const { filter, renderer } = await readyFilter({
    smoothCells: true,
    mosaicCellTextureUrl: '/atlas-coverage.png',
    mosaicSize: 2,
    cellCount: 2,
    setCount: 1,
  });
  filter.render();
  const { atlas, texel } = drawnAtlas(renderer);

  // cellCount x setCount cells of mosaicSize pixels, one texel per pixel.
  assert.equal(atlas.image.width, 4);
  assert.equal(atlas.image.height, 2);
  // Image row 0 lands on the last texture row (flipY orientation).
  assert.deepEqual(texel(0, 1), [200, 100, 60, 255]);
  assert.deepEqual(texel(1, 1), [150, 75, 45, 191]);
  assert.deepEqual(texel(2, 1), [50, 0, 0, 51]);
  assert.deepEqual(texel(3, 1), [0, 0, 0, 0]);
  assert.deepEqual(texel(0, 0), [10, 20, 30, 255]);

  // Already premultiplied, already flipped, no mipmaps: an integer cell maps
  // texel to pixel, so it samples nearest; blending expects premultiplied colour.
  assert.equal(atlas.isDataTexture, true);
  assert.equal(atlas.flipY, false);
  assert.equal(atlas.premultiplyAlpha, false);
  assert.equal(atlas.generateMipmaps, false);
  assert.equal(atlas.minFilter, THREE.NearestFilter);
  assert.equal(atlas.magFilter, THREE.NearestFilter);
  assert.equal(drawnMesh(renderer).material.premultipliedAlpha, true);
  filter.dispose();
});

test('coverage atlas: cellGain lifts coverage, keeps the colour, and caps at full coverage', async () => {
  atlases.set('/atlas-gain.png', (x, y, sx, sy) => {
    if (x === 0) return sy < 4 ? [200, 100, 60, 255] : [0, 0, 0, 0];
    if (x === 1) return sy < 7 ? [200, 100, 60, 255] : [0, 0, 0, 0];
    if (x === 2) return [0, 0, 0, 0];
    return [200, 100, 60, 255];
  });
  const { filter, renderer } = await readyFilter({
    smoothCells: true,
    mosaicCellTextureUrl: '/atlas-gain.png',
    mosaicSize: 2,
    cellCount: 2,
    cellGain: 1.2,
  });
  filter.render();
  const { texel } = drawnAtlas(renderer);

  assert.deepEqual(texel(0, 1), [120, 60, 36, 153]); // 0.5 -> 0.6 of (200, 100, 60)
  assert.deepEqual(texel(1, 1), [200, 100, 60, 255]); // 0.875 -> capped at 1
  assert.deepEqual(texel(2, 1), [0, 0, 0, 0]); // empty stays empty (no 0/0)
  assert.deepEqual(texel(3, 1), [200, 100, 60, 255]); // full stays full
  filter.dispose();
});

test('coverage atlas: a fractional cell (1.25x or 1.5x screens) rounds its size and filters linearly', async () => {
  const fractional = await readyFilter({ smoothCells: true, mosaicSize: 7.5, cellCount: 3 });
  fractional.filter.render();
  const { atlas: linear } = drawnAtlas(fractional.renderer);
  assert.equal(linear.image.width, 3 * 8);
  assert.equal(linear.image.height, 8);
  assert.equal(linear.minFilter, THREE.LinearFilter);
  assert.equal(linear.magFilter, THREE.LinearFilter);
  fractional.filter.dispose();

  // Float noise from a pixel-ratio product still counts as an integer cell.
  const integer = await readyFilter({ smoothCells: true, mosaicSize: 10.0004, cellCount: 3 });
  integer.filter.render();
  const { atlas: nearest } = drawnAtlas(integer.renderer);
  assert.equal(nearest.image.width, 3 * 10);
  assert.equal(nearest.minFilter, THREE.NearestFilter);
  integer.filter.dispose();
});

test('coverage atlas: a new cell size re-renders it and disposes the old one; the same size does not', async () => {
  const { filter, renderer } = await readyFilter({ smoothCells: true, mosaicSize: 2, cellCount: 2 });
  filter.render();
  const { atlas: first } = drawnAtlas(renderer);
  let firstDisposed = false;
  first.addEventListener('dispose', () => {
    firstDisposed = true;
  });

  filter.setMosaicSize(3);
  filter.render();
  const { atlas: second } = drawnAtlas(renderer);
  assert.notEqual(second, first);
  assert.equal(second.image.width, 2 * 3);
  assert.equal(second.image.height, 3);
  assert.equal(firstDisposed, true);

  // A repeat of the size, or a resize (which re-applies it), keeps the atlas.
  filter.setMosaicSize(3);
  filter.setSize(60, 30);
  filter.render();
  assert.equal(drawnAtlas(renderer).atlas, second);
  filter.dispose();
});

test('coverage atlas: the empty placeholder does not report readiness before its glyphs arrive', async () => {
  const renderer = fakeRenderer();
  const filter = new AsciiMosaicFilter(renderer, 40, 20, {
    smoothCells: true,
    mosaicCellTextureUrl: PLAIN,
    mosaicSize: 2,
    cellCount: 2,
  });
  // The mesh exists and can draw a placeholder, but cannot ready a loader.
  assert.equal(filter.isReady(), false);
  filter.render();
  const placeholder = drawnTexture(renderer);
  assert.equal(placeholder.image.width, 1);
  assert.deepEqual(Array.from(placeholder.image.data), [0, 0, 0, 0]);
  assert.equal(drawnMesh(renderer).material.premultipliedAlpha, true);
  assert.equal(filter.wantsFrame(performance.now()), false);
  let placeholderDisposed = false;
  placeholder.addEventListener('dispose', () => {
    placeholderDisposed = true;
  });

  await settled();
  assert.equal(filter.isReady(), true);
  // The coverage atlas is in place and owes a frame (render on demand).
  assert.equal(filter.wantsFrame(performance.now()), true);
  filter.render();
  const { atlas } = drawnAtlas(renderer);
  assert.equal(atlas.isDataTexture, true);
  assert.equal(atlas.image.width, 4);
  assert.equal(placeholderDisposed, true);
  filter.dispose();
});

test('plain atlas: readiness waits for image data instead of the TextureLoader handle', async () => {
  const filter = new AsciiMosaicFilter(fakeRenderer(), 40, 20, { mosaicCellTextureUrl: PLAIN });
  assert.equal(filter.isReady(), false);
  await settled();
  assert.equal(filter.isReady(), true);
  filter.dispose();
  assert.equal(filter.isReady(), false);
});

test('coverage atlas: a filter disposed while its atlas loads builds, keeps and fetches nothing more', async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    // A load that succeeds, and one that fails (the plain-atlas fallback path).
    for (const url of [PLAIN, '/atlas-missing.png']) {
      const filter = new AsciiMosaicFilter(fakeRenderer(), 40, 20, { smoothCells: true, mosaicCellTextureUrl: url });
      const placeholder = filter.atlasResult.texture;
      const before = { ...dom };
      filter.dispose(); // the atlas image's load or error event is still queued
      await settled();
      assert.deepEqual(dom, before, `${url}: no coverage build and no fallback fetch`);
      assert.equal(filter.atlasImage, null, `${url}: the source image is let go`);
      assert.equal(filter.atlasResult.texture, placeholder, `${url}: no atlas is swapped in`);
      assert.equal(filter.isReady(), false);
    }
    assert.deepEqual(warnings, [], 'a disposed filter reports no failure');
  } finally {
    console.warn = warn;
  }
});

test('coverage atlas: a new set count re-renders it with one row per set', async () => {
  const { filter, renderer } = await readyFilter({ smoothCells: true, mosaicSize: 2, cellCount: 2, setCount: 1 });
  filter.render();
  const { atlas: one } = drawnAtlas(renderer);
  assert.equal(one.image.height, 2);
  filter.setSetCount(3);
  filter.render();
  const { atlas: three } = drawnAtlas(renderer);
  assert.equal(three.image.height, 3 * 2);
  filter.setSetCount(3); // the same count keeps it
  filter.render();
  assert.equal(drawnAtlas(renderer).atlas, three);
  filter.dispose();
});

test('coverage atlas: a failed load or a missing 2D context falls back to the plain atlas', async () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const missing = { renderer: fakeRenderer() };
    missing.filter = new AsciiMosaicFilter(missing.renderer, 40, 20, {
      smoothCells: true, mosaicCellTextureUrl: '/atlas-missing.png',
    });
    await settled(); // the plain loader also fails for the same URL
    assert.equal(missing.filter.isReady(), false, 'failed media must not report drawable glyphs');
    missing.filter.render();
    const atlas = drawnTexture(missing.renderer);
    assert.notEqual(atlas.isDataTexture, true);
    assert.equal(atlas.minFilter, THREE.NearestFilter);
    // The material blends premultiplied from the start, so the fallback is
    // premultiplied on upload to match.
    assert.equal(atlas.premultiplyAlpha, true);
    assert.equal(drawnMesh(missing.renderer).material.premultipliedAlpha, true);
    assert.match(warnings[0], /커버리지 아틀라스 생성 실패/);
    missing.filter.dispose();

    canvas2dAvailable = false;
    const no2d = await readyFilter({ smoothCells: true });
    no2d.filter.render();
    assert.notEqual(drawnTexture(no2d.renderer).isDataTexture, true);
    assert.equal(drawnTexture(no2d.renderer).premultiplyAlpha, true);
    assert.equal(drawnMesh(no2d.renderer).material.premultipliedAlpha, true);
    assert.match(warnings.at(-1), /2D canvas context unavailable/);
    no2d.filter.dispose();
  } finally {
    canvas2dAvailable = true;
    console.warn = warn;
  }
});

test('targetScale sizes the scene render target, rounded, at least 1px, clamped to (0.1, 1]', async () => {
  const half = await readyFilter({ targetScale: 0.5 });
  half.filter.setSize(301, 199);
  assert.equal(half.filter.getRenderTarget().width, 151);
  assert.equal(half.filter.getRenderTarget().height, 100);
  half.filter.dispose();

  const tiny = await readyFilter({ targetScale: 0 });
  tiny.filter.setSize(40, 3);
  assert.equal(tiny.filter.getRenderTarget().width, 4);
  assert.equal(tiny.filter.getRenderTarget().height, 1);
  tiny.filter.dispose();

  for (const targetScale of [undefined, 3]) {
    const full = await readyFilter({ targetScale });
    assert.equal(full.filter.getRenderTarget().width, 40);
    assert.equal(full.filter.getRenderTarget().height, 20);
    full.filter.dispose();
  }
});

test('a resize that lands while the atlas loads builds the mesh at the new size', async () => {
  const renderer = fakeRenderer();
  const filter = new AsciiMosaicFilter(renderer, 100, 50, {
    smoothCells: true,
    mosaicCellTextureUrl: PLAIN,
    mosaicSize: 10,
  });
  filter.setSize(200, 100);
  await ready(filter);
  filter.render();
  const mesh = drawnMesh(renderer);
  assert.equal(mesh.count, 20 * 10);
  assert.deepEqual(mesh.material.uniforms.uResolution.value.toArray(), [200, 100]);
  filter.dispose();
});

test('wantsFrame: a still scene asks only after a change or when its noise or set clock is due', async () => {
  const clock = fakeClock(1000);
  try {
    const filter = new AsciiMosaicFilter(fakeRenderer(), 40, 20, { mosaicCellTextureUrl: PLAIN });
    // A first frame is owed as soon as the mesh exists, even though a loader
    // must still wait for the atlas image before treating the content as ready.
    assert.equal(filter.isReady(), false);
    assert.equal(filter.wantsFrame(clock.now), true);
    filter.render();
    assert.equal(filter.wantsFrame(clock.now), false);
    assert.equal(filter.wantsFrame(clock.now + 60_000), false); // no noise, one set: no clock

    filter.setNoiseIntensity(0.02);
    filter.setNoiseFPS(10);
    filter.render(); // the next noise tick is due at 1100
    assert.equal(filter.wantsFrame(1099), false);
    assert.equal(filter.wantsFrame(1100), true);

    // A random or cycling set selection ticks the same clock, given 2+ sets.
    filter.setNoiseIntensity(0);
    for (const [mode, sets, clocked] of [
      ['cycle', 3, true],
      ['random', 3, true],
      ['cycle', 1, false],
      ['first', 3, false],
      ['offsetRow', 3, false],
    ]) {
      filter.setSetSelectionMode(mode);
      filter.setSetCount(sets);
      filter.render();
      assert.equal(filter.wantsFrame(1100), clocked, `${mode} over ${sets} set(s)`);
    }
    filter.dispose();
  } finally {
    clock.restore();
  }
});

test('wantsFrame: mouse effects keep frames coming while live and while they ease out', async () => {
  const clock = fakeClock(1000);
  try {
    const cases = [
      { options: { avoid: true }, wakes: true },
      { options: { setSelectionMode: 'offsetRow', setCount: 3 }, wakes: true },
      // The world map: offsetRow over one set has no row to shift to.
      { options: { setSelectionMode: 'offsetRow', setCount: 1 }, wakes: false },
    ];
    for (const { options, wakes } of cases) {
      const { filter, renderer } = await readyFilter(options);
      const name = JSON.stringify(options);
      filter.enable(); // attaches the mouse listeners
      filter.render();
      assert.equal(filter.wantsFrame(clock.now), false, `${name}: idle`);

      renderer.domElement.dispatchEvent(new Event('mouseenter'));
      assert.equal(filter.wantsFrame(clock.now), wakes, `${name}: mouse inside`);
      clock.now += 16;
      filter.render(); // the effect eases in a little

      renderer.domElement.dispatchEvent(new Event('mouseleave'));
      assert.equal(filter.wantsFrame(clock.now), wakes, `${name}: easing out`);
      clock.now += 1000;
      filter.render(); // a long frame settles the ease
      assert.equal(filter.wantsFrame(clock.now), false, `${name}: settled`);
      filter.dispose();
    }
  } finally {
    clock.restore();
  }
});

test('wantsFrame: every setting change asks for a frame, even one that repeats the value', async () => {
  const { filter } = await readyFilter({ mosaicSize: 2 });
  const changes = {
    setMosaicSize: () => filter.setMosaicSize(2),
    setSize: () => filter.setSize(40, 20),
    setNoiseIntensity: () => filter.setNoiseIntensity(0),
    setNoiseFPS: () => filter.setNoiseFPS(15),
    setNoiseFPSRandom: () => filter.setNoiseFPSRandom(0),
    setSetCount: () => filter.setSetCount(1),
    setSetSelectionMode: () => filter.setSetSelectionMode('first'),
    setOffsetRowRadius: () => filter.setOffsetRowRadius(80),
    setAvoid: () => filter.setAvoid(false),
    setAdjustCellOrder: () => filter.setAdjustCellOrder(false),
    setAvoidRadius: () => filter.setAvoidRadius(80),
    setAvoidStrength: () => filter.setAvoidStrength(0.15),
    setMinBrightness: () => filter.setMinBrightness(20),
    setMaxBrightness: () => filter.setMaxBrightness(80),
    enable: () => filter.enable(),
    disable: () => filter.disable(),
  };
  // Every setter of the filter is listed: one added later must join this test.
  const setters = Object.getOwnPropertyNames(AsciiMosaicFilter.prototype)
    .filter((name) => /^set[A-Z]/.test(name) || name === 'enable' || name === 'disable');
  assert.deepEqual(Object.keys(changes).sort(), setters.sort(), 'a new setter needs a case here');
  for (const [name, change] of Object.entries(changes)) {
    filter.render();
    assert.equal(filter.wantsFrame(performance.now()), false, `before ${name}`);
    change();
    assert.equal(filter.wantsFrame(performance.now()), true, `${name} should ask for a frame`);
  }
  filter.dispose();
});
