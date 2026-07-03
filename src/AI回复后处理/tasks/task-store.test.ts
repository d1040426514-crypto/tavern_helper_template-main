import assert from 'node:assert/strict';
import lodash from 'lodash';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

const savedVars: Record<string, unknown> = {};
const chatMetadata: Record<string, unknown> = {};

const g = globalThis as typeof globalThis & {
  getVariables?: (opt: unknown) => Record<string, unknown>;
  insertOrAssignVariables?: (data: unknown, opt: unknown) => void;
  getScriptId?: () => string;
  defineStore?: (...args: unknown[]) => unknown;
  ref?: <T>(v: T) => { value: T };
  watchEffect?: (fn: () => void) => void;
  window?: {
    parent?: {
      SillyTavern?: {
        getContext?: () => {
          chatMetadata: Record<string, unknown>;
          updateChatMetadata: (v: Record<string, unknown>, reset: boolean) => void;
          saveChat: () => Promise<void>;
        };
      };
    };
  };
  eventEmit?: () => Promise<void>;
};

g.getScriptId = () => 'AI回复后处理';
g.getVariables = () => ({ ...savedVars });
g.insertOrAssignVariables = (data: unknown) => {
  Object.assign(savedVars, data as Record<string, unknown>);
};
g.defineStore = () => () => ({});
g.ref = <T>(v: T) => ({ value: v });
g.watchEffect = () => {};
g.eventEmit = async () => {};
g.window = {
  parent: {
    SillyTavern: {
      getContext: () => ({
        chatMetadata,
        updateChatMetadata: (v, reset) => {
          if (reset) {
            for (const key of Object.keys(chatMetadata)) delete chatMetadata[key];
          }
          Object.assign(chatMetadata, v);
        },
        saveChat: async () => {},
      }),
    },
  },
};

function test(name: string, fn: () => void | Promise<void>): void {
  void (async () => {
    try {
      await fn();
      console.log(`ok ${name}`);
    } catch (e) {
      console.error(`FAIL ${name}`, e);
      process.exitCode = 1;
    }
  })();
}

void (async () => {
  const { loadSettings } = await import('../settings');
  const { readChatTaskScope } = await import('./chat-task-scope');
  const { createTask, listTasks, clearChatScope, updateTaskStage, updateTaskSchedule } = await import('./task-store');

  test('createTask via API does not mutate global tasks', async () => {
    const before = loadSettings();
    const globalCount = before.tasks.length;
    await createTask({ name: 'API Task' }, 'api');
    const after = loadSettings();
    assert.equal(after.tasks.length, globalCount);
    assert.ok(readChatTaskScope()?.snapshot?.tasks.some(t => t.name === 'API Task'));
    assert.ok(listTasks().some(t => t.name === 'API Task'));
    await clearChatScope('api');
  });

  test('updateTaskStage rejects invalid stage', async () => {
    await assert.rejects(() => updateTaskStage('fake-id', 0, 'api'), /执行阶段无效/);
  });

  test('updateTaskStage and updateTaskSchedule via API', async () => {
    await clearChatScope('api');
    const task = await createTask({ name: 'Schedule Test' }, 'api');
    const staged = await updateTaskStage(task.id, 3, 'api');
    assert.equal(staged.stage, 3);
    const scheduled = await updateTaskSchedule(task.id, { mode: 'round', roundInterval: 2 }, 'api');
    assert.equal(scheduled.schedule?.mode, 'round');
    assert.equal(scheduled.schedule?.roundInterval, 2);
    await clearChatScope('api');
  });
})();
