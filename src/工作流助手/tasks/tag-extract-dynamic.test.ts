import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDynamicAttrPlaceholder, parseTotalPlaceholder } from './tag-extract';

test('parseDynamicAttrPlaceholder accepts tag@attr', () => {
  assert.deepEqual(parseDynamicAttrPlaceholder('item@id'), { tagName: 'item', attrName: 'id' });
  assert.deepEqual(parseDynamicAttrPlaceholder('  npc@name  '), { tagName: 'npc', attrName: 'name' });
});

test('parseDynamicAttrPlaceholder rejects precise composite with equals', () => {
  assert.equal(parseDynamicAttrPlaceholder('item@id=1'), null);
});

test('parseDynamicAttrPlaceholder rejects total: namespaced placeholders', () => {
  assert.equal(parseDynamicAttrPlaceholder('total:item@id'), null);
  assert.equal(parseDynamicAttrPlaceholder('TOTAL:item@id'), null);
  assert.equal(parseDynamicAttrPlaceholder('replica:val'), null);
});

test('parseDynamicAttrPlaceholder rejects colon inside tag or attr', () => {
  assert.equal(parseDynamicAttrPlaceholder('foo:bar@id'), null);
  assert.equal(parseDynamicAttrPlaceholder('item@id:x'), null);
});

test('parseTotalPlaceholder still resolves total:tag@attr', () => {
  assert.deepEqual(parseTotalPlaceholder('total:item@id'), { tagName: 'item', attrName: 'id' });
  assert.deepEqual(parseTotalPlaceholder('TOTAL:npc@name'), { tagName: 'npc', attrName: 'name' });
  assert.equal(parseTotalPlaceholder('item@id'), null);
  assert.equal(parseTotalPlaceholder('total:item@id=1'), null);
});
