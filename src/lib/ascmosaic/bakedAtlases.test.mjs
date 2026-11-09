import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// scripts/bake-mosaic-atlases.mjs shrinks the glyph sheets on the promise that
// what reaches the screen does not change. This holds the shipped files to it,
// and fails if a source sheet is replaced without baking again.
const COLUMNS = 12;
const ROWS = 3;
const CELL = 9;

async function decode(name) {
  const file = fileURLToPath(new URL(`../../../public/resource/${name}`, import.meta.url));
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** texture2D under nearest sampling, on an image uploaded with flipY. */
function texture2D({ data, width, height }, u, v) {
  const x = Math.min(width - 1, Math.floor(width * u));
  const y = height - 1 - Math.min(height - 1, Math.floor(height * v));
  return data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4).join();
}

test('each 9px sheet holds exactly what a 9-pixel cell reads from its full sheet, and only 9-pixel cells use one', async () => {
  for (const sheet of ['F_4-1', 'F_5-1', 'F_5-2']) {
    const full = await decode(`Monotone Cell ${sheet}.png`);
    const baked = await decode(`Monotone Cell ${sheet} 9px.png`);
    assert.deepEqual([baked.width, baked.height], [COLUMNS * CELL, ROWS * CELL], sheet);

    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        for (let y = 0; y < CELL; y++) {
          for (let x = 0; x < CELL; x++) {
            // FRAGMENT_SHADER: atlasUV = (mix(uMin, uMax, x), mix(vMax, vMin, y))
            // for the fragment at (x + 0.5, y + 0.5) of the cell, y up from its bottom.
            const u = (column + (x + 0.5) / CELL) / COLUMNS;
            const v = (row + 1 - (y + 0.5) / CELL) / ROWS;
            assert.equal(texture2D(baked, u, v), texture2D(full, u, v), `${sheet}: cell ${column},${row} at ${x},${y}`);
          }
        }
      }
    }
  }

  // The sheets are only right for the grid they were baked for. A pixel ratio
  // cap would multiply the cell past the 9 texels each glyph now holds.
  for (const canvas of ['AsciiThesis', 'AsciiTeamSymbol']) {
    const source = readFileSync(new URL(`../../components/ascii/${canvas}.tsx`, import.meta.url), 'utf8');
    for (const prop of ['mosaicSize={9}', 'cellCount={12}', 'setCount={3}']) {
      assert.ok(source.includes(prop), `${canvas} must set ${prop}`);
    }
    assert.equal(source.includes('pixelRatioCap'), false, `${canvas} draws at one texel per pixel`);
  }
});
