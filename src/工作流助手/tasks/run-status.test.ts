import assert from 'node:assert/strict';
import lodash from 'lodash';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

const savedVars: Record<string, unknown> = {};
const chat: Array<Record<string, unknown>> = [];
let saveChatCalls = 0;

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
          chat: Array<Record<string, unknown>>;
          saveChat: () => Promise<void>;
          chatMetadata: Record<string, unknown>;
          updateChatMetadata: (v: Record<string, unknown>, reset: boolean) => void;
        };
      };
    };
  };
  eventEmit?: () => Promise<void>;
  eventOn?: () => { stop: () => void };
  tavern_events?: Record<string, string>;
};

g.getScriptId = () => '工作流助手';
g.getVariables = () => ({ ...savedVars });
g.insertOrAssignVariables = (data: unknown) => {
  Object.assign(savedVars, data as Record<string, unknown>);
};
g.defineStore = () => () => ({});
g.ref = <T>(v: T) => ({ value: v });
g.watchEffect = () => {};
g.eventEmit = async () => {};
g.eventOn = () => ({ stop: () => {} });
g.tavern_events = {
  MESSAGE_DELETED: 'MESSAGE_DELETED',
  CHAT_CHANGED: 'CHAT_CHANGED',
};
g.window = {
  parent: {
    SillyTavern: {
      getContext: () => ({
        chat,
        saveChat: async () => {
          saveChatCalls += 1;
        },
        chatMetadata: {},
        updateChatMetadata: () => {},
      }),
    },
  },
};

function resetChat(msgs: Array<Record<string, unknown>>): void {
  chat.length = 0;
  chat.push(...msgs);
  saveChatCalls = 0;
}

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

void (async () => {
  const {
    ACU_WORKFLOW_RUN_STATUS_KEY,
    writeRunStatusToMessage,
    readRunStatusFromMessage,
    resolveEffectiveRunStatus,
    resolveRunStatusForFloor,
    retargetRunStatusCache,
    resolveLastRunStatus,
  } = await import('./run-status');
  const { loadSettings, saveSettings } = await import('../settings');

  const sampleStatus = (messageId: number, tag: string) => ({
    messageId,
    at: 100 + messageId,
    taskResults: [
      {
        taskId: 't1',
        taskName: '任务',
        success: true,
        skipped: false,
        extractedTags: { onlyRelay: tag },
        promptMessages: [],
        aiOutput: '',
        aiReasoning: '',
      },
    ],
  });

  test('writeRunStatusToMessage sets mes top-level field and saveChat', async () => {
    resetChat([
      { is_user: true, mes: 'u' },
      { is_user: false, mes: 'ai' },
    ]);
    const status = sampleStatus(1, 'RELAY_A');
    const ok = await writeRunStatusToMessage(1, status);
    assert.equal(ok, true);
    assert.equal(saveChatCalls, 1);
    assert.ok(chat[1]?.[ACU_WORKFLOW_RUN_STATUS_KEY]);
    assert.equal(
      (chat[1]?.[ACU_WORKFLOW_RUN_STATUS_KEY] as { taskResults: Array<{ extractedTags: Record<string, string> }> })
        .taskResults[0]?.extractedTags.onlyRelay,
      'RELAY_A',
    );
    // 不写 message.data
    assert.equal(chat[1]?.data, undefined);
  });

  test('read / resolveRunStatusForFloor', async () => {
    resetChat([
      { is_user: false, mes: 'ai0', [ACU_WORKFLOW_RUN_STATUS_KEY]: sampleStatus(0, 'OLD') },
      { is_user: true, mes: 'u' },
      { is_user: false, mes: 'ai2', [ACU_WORKFLOW_RUN_STATUS_KEY]: sampleStatus(2, 'NEW') },
    ]);
    assert.equal(readRunStatusFromMessage(2)?.taskResults[0]?.extractedTags?.onlyRelay, 'NEW');
    assert.equal(resolveRunStatusForFloor(0)?.taskResults[0]?.extractedTags?.onlyRelay, 'OLD');
    assert.equal(resolveRunStatusForFloor(1), null);
    assert.equal(resolveRunStatusForFloor(null), null);
  });

  test('resolveEffectiveRunStatus scans older AI floors', () => {
    resetChat([
      { is_user: false, mes: 'ai0', [ACU_WORKFLOW_RUN_STATUS_KEY]: sampleStatus(0, 'FLOOR0') },
      { is_user: true, mes: 'u1' },
      { is_user: false, mes: 'ai2' }, // no snapshot
      { is_user: true, mes: 'u3' },
    ]);
    assert.equal(resolveEffectiveRunStatus()?.taskResults[0]?.extractedTags?.onlyRelay, 'FLOOR0');
    assert.equal(resolveEffectiveRunStatus(1)?.taskResults[0]?.extractedTags?.onlyRelay, 'FLOOR0');
    assert.equal(resolveEffectiveRunStatus(0), null);
  });

  test('retargetRunStatusCache falls back after floor deleted', () => {
    resetChat([
      { is_user: false, mes: 'ai0', [ACU_WORKFLOW_RUN_STATUS_KEY]: sampleStatus(0, 'KEEP') },
      { is_user: true, mes: 'u' },
    ]);
    const settings = loadSettings();
    settings.lastRunStatus = sampleStatus(5, 'GONE');
    saveSettings(settings);

    retargetRunStatusCache();
    const after = loadSettings().lastRunStatus;
    assert.equal(after.messageId, 0);
    assert.equal(after.taskResults[0]?.extractedTags?.onlyRelay, 'KEEP');
  });

  test('retargetRunStatusCache clears when no snapshots remain', () => {
    resetChat([{ is_user: false, mes: 'ai' }, { is_user: true, mes: 'u' }]);
    const settings = loadSettings();
    settings.lastRunStatus = sampleStatus(9, 'STALE');
    saveSettings(settings);

    retargetRunStatusCache();
    assert.deepEqual(loadSettings().lastRunStatus.taskResults, []);
  });

  test('resolveLastRunStatus prefers mes over settings cache', () => {
    resetChat([
      { is_user: false, mes: 'ai', [ACU_WORKFLOW_RUN_STATUS_KEY]: sampleStatus(0, 'MES') },
    ]);
    const settings = loadSettings();
    settings.lastRunStatus = sampleStatus(99, 'CACHE');
    saveSettings(settings);
    assert.equal(resolveLastRunStatus().taskResults[0]?.extractedTags?.onlyRelay, 'MES');
  });

  test('read rebinds stale embedded messageId to current floor', () => {
    resetChat([
      {
        is_user: false,
        mes: 'ai',
        [ACU_WORKFLOW_RUN_STATUS_KEY]: sampleStatus(5, 'STALE_MID'),
      },
      { is_user: true, mes: 'u' },
    ]);
    const status = readRunStatusFromMessage(0);
    assert.equal(status?.messageId, 0);
    assert.equal(status?.taskResults[0]?.extractedTags?.onlyRelay, 'STALE_MID');

    const effective = resolveEffectiveRunStatus();
    assert.equal(effective?.messageId, 0);
    assert.equal(effective?.taskResults[0]?.extractedTags?.onlyRelay, 'STALE_MID');
  });

  test('rebinding allows buildRelay after floor index shift', async () => {
    const { buildRelayFromLastRunStatus } = await import('./user-input-end-inject');
    resetChat([
      {
        is_user: false,
        mes: 'ai',
        [ACU_WORKFLOW_RUN_STATUS_KEY]: sampleStatus(5, 'AFTER_DELETE'),
      },
      { is_user: true, mes: 'u' },
    ]);
    const status = readRunStatusFromMessage(0);
    const { relay, taskBlocks } = buildRelayFromLastRunStatus(status ?? undefined, 0);
    assert.equal(relay.get('onlyRelay')?.[0], 'AFTER_DELETE');
    assert.equal(taskBlocks.length, 1);
  });

  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok ${t.name}`);
    } catch (e) {
      failed += 1;
      console.error(`FAIL ${t.name}`, e);
    }
  }
  if (failed) process.exitCode = 1;
})();
