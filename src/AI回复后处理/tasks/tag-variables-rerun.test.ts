import assert from 'node:assert/strict';
import { TAG_DATA_ROOT_KEY } from './tag-variables';

function makeFloorVars(): Record<number, Record<string, unknown>> {
  return {
    1: {
      [TAG_DATA_ROOT_KEY]: {
        item_id: { '1': 'from-floor-1' },
        result: 'keep-me',
      },
    },
    2: {
      [TAG_DATA_ROOT_KEY]: {
        item_id: { '1': 'stale', '9': 'orphan' },
        extra: 'should-be-removed',
      },
    },
  };
}

function installMocks(floorVars: Record<number, Record<string, unknown>>): void {
  const g = globalThis as typeof globalThis & {
    getChatMessages?: (message_id: number) => Array<{ role: string; message: string }>;
    getVariables?: (opt: { type: string; message_id: number }) => Record<string, unknown>;
    updateVariablesWith?: (
      updater: (variables: Record<string, unknown>) => Record<string, unknown>,
      opt: { type: string; message_id: number },
    ) => void;
  };

  g.getChatMessages = (message_id: number) => {
    if (message_id >= 0 && message_id <= 2) return [{ role: 'assistant', message: '' }];
    return [];
  };

  g.getVariables = (opt: { type: string; message_id: number }) => ({
    ...(floorVars[opt.message_id] ?? {}),
  });

  g.updateVariablesWith = (updater, opt) => {
    floorVars[opt.message_id] = updater({ ...(floorVars[opt.message_id] ?? {}) });
  };
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  await test('restorePostProcessTagsFromPreviousFloor replaces current snapshot', async () => {
    const floorVars = makeFloorVars();
    installMocks(floorVars);
    const { restorePostProcessTagsFromPreviousFloor } = await import('./tag-variables');
    restorePostProcessTagsFromPreviousFloor(2);
    const current = floorVars[2][TAG_DATA_ROOT_KEY] as Record<string, unknown>;
    assert.deepEqual(current, {
      item_id: { '1': 'from-floor-1' },
      result: 'keep-me',
    });
    assert.equal(current.extra, undefined);
    assert.equal((current.item_id as Record<string, string>)['9'], undefined);
  });

  await test('restorePostProcessTagsFromPreviousFloor clears when previous empty', async () => {
    const floorVars: Record<number, Record<string, unknown>> = {
      0: {},
      1: {
        [TAG_DATA_ROOT_KEY]: { stale: 'x' },
      },
    };
    installMocks(floorVars);
    const { restorePostProcessTagsFromPreviousFloor } = await import('./tag-variables');
    restorePostProcessTagsFromPreviousFloor(1);
    assert.equal(floorVars[1][TAG_DATA_ROOT_KEY], undefined);
  });
}

main().then(() => {
  if (process.exitCode) process.exit(process.exitCode);
});
