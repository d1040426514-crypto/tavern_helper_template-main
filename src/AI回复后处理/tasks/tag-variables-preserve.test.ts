import assert from 'node:assert/strict';
import type { ScriptSettings } from './schema';
import { collectPreservedReplicaAttrValues } from './tag-variables';
import { buildDynamicAttrWritePlan, mergeNestedGroupIntoRawContainer } from './tag-variables-nested';
import { sortAttrValues } from './utils';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('collectPreservedReplicaAttrValues gathers selected member attrs', () => {
  const settings = {
    tasks: [
      {
        id: 'root',
        name: 'root',
        enabled: true,
        stage: 2,
        syncAsReplicaFamily: true,
        replicaFamilySpec: 'item@id',
        promptGroups: [],
        extractInjectTags: [],
        mergeStrategy: 'concat',
        maxRetries: 3,
        minLength: 0,
        apiPresetName: '',
        plotWorldbookMode: 'inherit',
        contextMode: 'inherit',
        structuredOutputMode: 'off',
      },
      {
        id: 'rep-2',
        name: 'rep 2',
        enabled: true,
        stage: 2,
        replicaFamilyRootId: 'root',
        replicaFamilyAttrValue: '2',
        replicaFamilySelected: true,
        promptGroups: [],
        extractInjectTags: [],
        mergeStrategy: 'concat',
        maxRetries: 3,
        minLength: 0,
        apiPresetName: '',
        plotWorldbookMode: 'inherit',
        contextMode: 'inherit',
        structuredOutputMode: 'off',
      },
    ],
  } as ScriptSettings;
  const preserved = collectPreservedReplicaAttrValues(settings, 'list {{item@id}} here');
  assert.deepEqual([...preserved.get('item@id')!], ['2']);
});

test('extended prune keeps preserved attr keys in nested container', () => {
  const plan = buildDynamicAttrWritePlan('item@id', {
    'item@id=1': '<item id="1">A</item>',
  })!;
  const extra = ['2'];
  const mergedPlan = {
    ...plan,
    pruneToAttrValues: sortAttrValues([...new Set([...plan.pruneToAttrValues, ...extra])]),
  };
  const raw = mergeNestedGroupIntoRawContainer(
    { item_id: { '1': 'old', '2': 'keep-me', '9': 'stale' } },
    mergedPlan,
  );
  const group = raw.item_id as Record<string, string>;
  assert.equal(group['1'], '<item id="1">A</item>');
  assert.equal(group['2'], 'keep-me');
  assert.equal(group['9'], undefined);
});

if (process.exitCode) process.exit(process.exitCode);
