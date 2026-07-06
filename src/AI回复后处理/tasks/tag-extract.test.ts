import assert from 'node:assert/strict';
import { extractInjectTagsFromResponse } from './tag-extract';
import {
  extractPlotTagsFromResponse,
  formatTagValueForInject,
  mergeRelayTagMap,
  refreshNestedExtractTagsInContent,
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

test('formatTagValueForInject bare key wraps nested child tags', () => {
  const inner = '<npc act="李明">李明</npc>';
  const out = formatTagValueForInject('不在场npc', inner);
  assert.equal(out, `<不在场npc>${inner}</不在场npc>`);
});

test('formatTagValueForInject bare key passthrough own full block', () => {
  const block = '<不在场npc><npc act="李明">李明</npc></不在场npc>';
  assert.equal(formatTagValueForInject('不在场npc', block), block);
});

test('formatTagValueForInject composite npc@act passthrough', () => {
  const block = '<npc act="李明">李明</npc>';
  assert.equal(formatTagValueForInject('npc@act=李明', block), block);
});

test('formatTagValueForInject item key does not match itemize', () => {
  const inner = '<itemize>list</itemize>';
  const out = formatTagValueForInject('item', inner);
  assert.equal(out, `<item>${inner}</item>`);
});

test('placeholder 不在场npc preserves outer wrapper', () => {
  const inner = '<npc act="李明">李明</npc>';
  const map: RelayTagMap = new Map([['不在场npc', [inner]]]);
  const out = replacePlotTagPlaceholdersWithHistory('{{不在场npc}}', map, new Map(), new Set(['不在场npc']));
  assert.equal(out, `<不在场npc>${inner}</不在场npc>`);
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

test('placeholder item@id dynamic expands attr instances only', () => {
  const map: RelayTagMap = new Map([
    ['item@id=2', ['<item id="2">B</item>']],
    ['item@id=1', ['<item id="1">A</item>']],
    ['item', ['<item>无id</item>']],
  ]);
  const out = replacePlotTagPlaceholdersWithHistory('{{item@id}}', map, new Map(), new Set(['item@id']));
  assert.ok(out.indexOf('<item id="1">') < out.indexOf('<item id="2">'));
  assert.ok(!out.includes('<item>无id</item>'));
});

test('historyFallback all-tags without injectOnly whitelist', () => {
  const history: RelayTagMap = new Map([['archived', ['saved']]]);
  const out = replacePlotTagPlaceholdersWithHistory('{{archived}}', new Map(), history, new Set(), {
    historyFallback: 'all-tags',
  });
  assert.equal(out, '<archived>saved</archived>');
});

test('relay wins over history with all-tags fallback', () => {
  const relay: RelayTagMap = new Map([['foo', ['new']]]);
  const history: RelayTagMap = new Map([['foo', ['old']]]);
  const out = replacePlotTagPlaceholdersWithHistory('{{foo}}', relay, history, new Set(), {
    historyFallback: 'all-tags',
  });
  assert.equal(out, '<foo>new</foo>');
});

test('all-tags fallback empty when neither relay nor history', () => {
  const out = replacePlotTagPlaceholdersWithHistory('x{{missing}}y', new Map(), new Map(), new Set(), {
    historyFallback: 'all-tags',
  });
  assert.equal(out, 'xy');
});

test('mergeRelayTagMap overwrites same key', () => {
  const map: RelayTagMap = new Map();
  mergeRelayTagMap(map, { 'item@id=1': '<item id="1">S1</item>' });
  mergeRelayTagMap(map, { 'item@id=1': '<item id="1">S2</item>' });
  assert.equal(map.get('item@id=1')?.length, 1);
  assert.equal(map.get('item@id=1')?.[0], '<item id="1">S2</item>');
});

test('replica composite placeholder prefers floor over relay', () => {
  const relay: RelayTagMap = new Map([['item@id=1', ['<item id="1">enum</item>']]]);
  const history: RelayTagMap = new Map([['item@id=1', ['<item id="1">floor</item>']]]);
  const out = replacePlotTagPlaceholdersWithHistory('x {{item@id=1}} y', relay, history, new Set(['item@id']), {
    historyFallback: 'all-tags',
    replicaAttrSpec: { tagName: 'item', attrName: 'id' },
  });
  assert.equal(out, 'x <item id="1">floor</item> y');
});

test('replica composite placeholder empty floor yields empty attr block', () => {
  const relay: RelayTagMap = new Map([['item@id=2', ['<item id="2">enum</item>']]]);
  const out = replacePlotTagPlaceholdersWithHistory('{{item@id=2}}', relay, new Map(), new Set(['item@id']), {
    historyFallback: 'all-tags',
    replicaAttrSpec: { tagName: 'item', attrName: 'id' },
  });
  assert.equal(out, '<item id="2"></item>');
});

test('outer tag refreshes nested inner from relay', () => {
  const relay: RelayTagMap = new Map([
    ['story', ['<npc>old</npc>']],
    ['npc', ['new']],
  ]);
  const out = replacePlotTagPlaceholdersWithHistory('{{story}}', relay, new Map(), new Set(['story', 'npc']), {
    historyFallback: 'all-tags',
  });
  assert.equal(out, '<story><npc>new</npc></story>');
});

test('refreshNestedExtractTagsInContent ignores unconfigured tags', () => {
  const relay: RelayTagMap = new Map([
    ['story', ['<other>old</other>']],
    ['other', ['new']],
  ]);
  const out = refreshNestedExtractTagsInContent(
    '<story><other>old</other></story>',
    relay,
    new Map(),
    new Set(['story']),
    { historyFallback: 'all-tags' },
  );
  assert.equal(out, '<story><other>old</other></story>');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
