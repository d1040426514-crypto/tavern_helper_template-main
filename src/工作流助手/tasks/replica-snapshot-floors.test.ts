import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  rememberReplicaSnapshotFloor,
  replaceReplicaSnapshotFloorIndex,
  takeReplicaSnapshotFloorRoots,
} from './replica-snapshot-floors';

test('snapshot floor index remembers roots and forgets them on delete', () => {
  replaceReplicaSnapshotFloorIndex([]);
  rememberReplicaSnapshotFloor(2, {
    'root-a': { attrValues: ['弗洛洛'], explicit: true },
    'root-b': { attrValues: [], explicit: true },
  });
  rememberReplicaSnapshotFloor(0, { 'root-a': { attrValues: ['旧'] } });
  assert.deepEqual(takeReplicaSnapshotFloorRoots(2).sort(), ['root-a', 'root-b']);
  assert.deepEqual(takeReplicaSnapshotFloorRoots(2), []);
  assert.deepEqual(takeReplicaSnapshotFloorRoots(0), ['root-a']);
});
