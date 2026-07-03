import assert from 'node:assert/strict';
import { extractInjectTagsFromResponse } from './tag-extract';
import {
  extractPlotTagsFromResponse,
  formatTagValueForInject,
  replacePlotTagPlaceholdersWithHistory,
  type RelayTagMap,
} from './utils';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('item@id splits by attribute', () => {
  const text = '<item id="1">A</item><item id="2">B</item>';
  const { extractedTags } = extractInjectTagsFromResponse(text, ['item@id']);
  assert.equal(extractedTags['item@id=1'], '<item id="1">A</item>');
  assert.equal(extractedTags['item@id=2'], '<item id="2">B</item>');
});

test('item@id falls back bare key when no id', () => {
  const text = '<item id="1">A</item><item>无id</item>';
  const { extractedTags } = extractInjectTagsFromResponse(text, ['item@id']);
  assert.equal(extractedTags['item@id=1'], '<item id="1">A</item>');
  assert.equal(extractedTags.item, '<item>无id</item>');
});

test('two bare items last wins on item@id config', () => {
  const text = '<item>first</item><item>second</item>';
  const { extractedTags } = extractInjectTagsFromResponse(text, ['item@id']);
  assert.equal(extractedTags.item, '<item>second</item>');
});

test('bare result keeps inner last', () => {
  const text = '<result>x</result><result type="a">y</result>';
  const { extractedTags } = extractPlotTagsFromResponse(text, ['result']);
  assert.equal(extractedTags.result, 'y');
});

test('formatTagValueForInject full block passthrough', () => {
  const block = '<item id="1">A</item>';
  assert.equal(formatTagValueForInject('item@id=1', block), block);
});

test('formatTagValueForInject wraps inner', () => {
  assert.equal(formatTagValueForInject('result', 'hello'), '<result>hello</result>');
});

test('placeholder item@id=1 precise', () => {
  const map: RelayTagMap = new Map([['item@id=1', ['<item id="1">A</item>']]]);
  const out = replacePlotTagPlaceholdersWithHistory('x {{item@id=1}} y', map, new Map(), new Set(['item@id']));
  assert.equal(out, 'x <item id="1">A</item> y');
  assert.ok(!out.includes('<item><item'));
});

test('placeholder item expands all', () => {
  const map: RelayTagMap = new Map([
    ['item@id=1', ['<item id="1">A</item>']],
    ['item@id=2', ['<item id="2">B</item>']],
    ['item', ['<item>无id</item>']],
  ]);
  const out = replacePlotTagPlaceholdersWithHistory('{{item}}', map, new Map(), new Set(['item@id']));
  assert.ok(out.includes('<item id="1">A</item>'));
  assert.ok(out.includes('<item id="2">B</item>'));
  assert.ok(out.includes('<item>无id</item>'));
  assert.ok(!out.includes('<item><item'));
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
