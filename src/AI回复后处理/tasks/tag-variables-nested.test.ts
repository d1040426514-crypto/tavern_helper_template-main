import assert from 'node:assert/strict';
import {
  buildDynamicAttrWritePlan,
  flattenTagContainerToRelayKeys,
  mergeNestedGroupIntoRawContainer,
} from './tag-variables-nested';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('flatten nested item_id to flat keys', () => {
  const flat = flattenTagContainerToRelayKeys({
    result: 'hello',
    item_id: {
      '1': '<item id="1">A</item>',
      '2': '<item id="2">B</item>',
    },
  });
  assert.equal(flat['item@id=1'], '<item id="1">A</item>');
  assert.equal(flat['item@id=2'], '<item id="2">B</item>');
  assert.equal(flat.result, 'hello');
});

test('flatten legacy flat keys', () => {
  const flat = flattenTagContainerToRelayKeys({
    'item@id=1': '<item id="1">A</item>',
  });
  assert.equal(flat['item@id=1'], '<item id="1">A</item>');
});

test('dynamic write plan builds nested group', () => {
  const plan = buildDynamicAttrWritePlan('item@id', {
    'item@id=2': '<item id="2">B</item>',
    'item@id=1': '<item id="1">A</item>',
  });
  assert.ok(plan);
  assert.equal(plan!.groupKey, 'item_id');
  assert.equal(plan!.entries['1'], '<item id="1">A</item>');
  assert.deepEqual(plan!.pruneToAttrValues, ['1', '2']);
});

test('merge nested prunes stale attr keys', () => {
  const plan = buildDynamicAttrWritePlan('item@id', {
    'item@id=1': '<item id="1">A</item>',
  })!;
  const raw = mergeNestedGroupIntoRawContainer(
    { item_id: { '1': 'old', '9': 'stale' } },
    plan,
  );
  const group = raw.item_id as Record<string, string>;
  assert.equal(group['1'], '<item id="1">A</item>');
  assert.equal(group['9'], undefined);
});

if (process.exitCode) process.exit(process.exitCode);
