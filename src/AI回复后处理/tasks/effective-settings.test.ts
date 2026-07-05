import assert from 'node:assert/strict';
import lodash from 'lodash';
import { resolveEffectiveSettings } from './effective-settings';
import type { PlotWorldbookConfig, PostProcessPreset, ScriptSettings } from './schema';

(globalThis as typeof globalThis & { _: typeof lodash })._ = lodash;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

const globalTasks = [{ id: 'g1', name: 'Global', enabled: true, stage: 1 }] as ScriptSettings['tasks'];
const snapshotTasks = [{ id: 's1', name: 'Snapshot', enabled: true, stage: 1 }] as ScriptSettings['tasks'];

const globalConfig: PlotWorldbookConfig = {
  source: 'manual',
  manualSelection: ['GlobalBook'],
  enabledEntries: { GlobalBook: [1] },
};

const snapshotConfig: PlotWorldbookConfig = {
  source: 'manual',
  manualSelection: ['SnapBook'],
  enabledEntries: { SnapBook: [2] },
};

const baseSettings = {
  tasks: globalTasks,
  activePresetName: '回复质检',
  contextTurnCount: 3,
  plotWorldbookConfig: globalConfig,
  taskPlotWorldbookOverridesEnabled: false,
} as ScriptSettings;

const snapshotPreset: PostProcessPreset = {
  name: '__chat_snapshot__',
  tasks: snapshotTasks,
  finalInjectTemplate: 'snap-final',
  tagVariableInjectTemplate: 'snap-tags',
  chatExtractTags: { user: ['user_tag'], assistant: ['ai_tag'] },
  contextTurnCount: 5,
  contextExtractRules: [],
  contextExcludeRules: [],
  plotWorldbookConfig: snapshotConfig,
  taskPlotWorldbookOverridesEnabled: true,
  taskContextOverridesEnabled: false,
};

const mockScope = {
  mode: 'chat_override' as const,
  snapshot: snapshotPreset,
  originPresetName: '回复质检',
  updatedAt: Date.now(),
  source: 'api' as const,
};

const g = globalThis as typeof globalThis & {
  window?: { parent?: { SillyTavern?: { getContext?: () => unknown } } };
};

function mockStContext(metadata: Record<string, unknown>) {
  const ctx = {
    chatMetadata: metadata,
    updateChatMetadata: () => {},
    saveChat: async () => {},
  };
  g.window = { parent: { SillyTavern: { getContext: () => ctx } } };
}

mockStContext({ _post_process_chat_scope: mockScope });

test('resolveEffectiveSettings prefers chat snapshot tasks', () => {
  const resolved = resolveEffectiveSettings(baseSettings);
  assert.equal(resolved.tasks[0]?.id, 's1');
  assert.equal(resolved.contextTurnCount, 5);
  assert.equal(resolved.plotWorldbookConfig.manualSelection[0], 'SnapBook');
  assert.deepEqual(resolved.chatExtractTags, { user: ['user_tag'], assistant: ['ai_tag'] });
});

test('resolveEffectiveSettings keeps global tasks when no snapshot', () => {
  mockStContext({});
  const resolved = resolveEffectiveSettings(baseSettings);
  assert.equal(resolved.tasks[0]?.id, 'g1');
});
