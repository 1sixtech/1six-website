import assert from 'node:assert/strict';
import test from 'node:test';
import { getWriter, getWriterByName, selectWritingCategory } from './writingCatalog.ts';

test('category URLs select each publication type and handle absent or invalid values', () => {
  for (const category of ['research', 'op-ed', 'announcements']) {
    assert.equal(selectWritingCategory(category), category);
  }
  for (const value of [null, '', 'all', 'unknown', '__proto__', 'Research']) {
    assert.equal(selectWritingCategory(value), 'all');
  }
});

test('an article byline resolves to its public writer profile without fabricating unknown people', () => {
  const dean = getWriterByName('Dean N.');
  assert.ok(dean);
  assert.equal(getWriter(dean.slug), dean);
  assert.equal(getWriterByName(' Dean N. '), dean);
  assert.equal(getWriterByName('Unlisted contributor'), undefined);
  assert.equal(getWriter('../dean-n'), undefined);
});
