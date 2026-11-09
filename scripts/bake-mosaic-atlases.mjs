#!/usr/bin/env node
// Bake the 12x3 glyph sheets down to the texels the mosaic actually reads.
//
// The exported sheets are 7992x1999 (16 megapixels, about 61 MB once decoded),
// yet the canvases that use them draw 9-pixel cells with nearest sampling: each
// glyph reads 81 of its 443,556 texels. Uploading the whole sheet cost every
// canvas a main-thread stall and tens of megabytes of GPU memory on a phone.
//
// Each output texel copies the exact source texel the shader samples for that
// fragment (see FRAGMENT_SHADER in asciiMosaicFilter.ts), so what reaches the
// screen does not change. Re-run after replacing a source sheet, and give the
// output a new name, since /resource/* is cached as immutable for a year:
//   node scripts/bake-mosaic-atlases.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const COLUMNS = 12;
const ROWS = 3;
const CELL = 9; // device pixels per cell: AsciiThesis and AsciiTeamSymbol `mosaicSize`
const SHEETS = ['F_4-1', 'F_5-1', 'F_5-2'];

const resources = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/resource');

for (const sheet of SHEETS) {
  const source = path.join(resources, `Monotone Cell ${sheet}.png`);
  const output = path.join(resources, `Monotone Cell ${sheet} ${CELL}px.png`);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = COLUMNS * CELL;
  const height = ROWS * CELL;
  const baked = Buffer.alloc(width * height * 4);

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
          // The fragment at (x + 0.5, y + 0.5) of a cell, y measured up from
          // the quad's bottom: atlasUV = (mix(uMin, uMax, x), mix(vMax, vMin, y)).
          const u = (column + (x + 0.5) / CELL) / COLUMNS;
          const v = (row + 1 - (y + 0.5) / CELL) / ROWS;
          const sourceX = Math.min(info.width - 1, Math.floor(info.width * u));
          // Images upload with flipY: GL texel row r is image row (height - 1 - r).
          const sourceY = info.height - 1 - Math.min(info.height - 1, Math.floor(info.height * v));
          const targetX = column * CELL + x;
          const targetY = height - 1 - (row * CELL + (CELL - 1 - y));
          data.copy(
            baked,
            (targetY * width + targetX) * 4,
            (sourceY * info.width + sourceX) * 4,
            (sourceY * info.width + sourceX) * 4 + 4,
          );
        }
      }
    }
  }

  await sharp(baked, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(output);
  console.log(`${path.basename(output)}: ${width}x${height} from ${info.width}x${info.height}`);
}
