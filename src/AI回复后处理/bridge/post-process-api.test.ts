import assert from 'node:assert/strict';
import { acuPostProcessTaskApi } from './post-process-api';

const expectedMethods = [
  'listTasks',
  'getTask',
  'createTask',
  'updateTask',
  'deleteTask',
  'replaceTasks',
  'getChatScopeState',
  'clearChatScope',
  'promoteChatScopeToPreset',
  'updatePresetFields',
  'updateTaskPlotWorldbook',
  'updateTaskContext',
  'updatePromptGroup',
  'updateTaskStage',
  'updateTaskSchedule',
  'updateTaskExtractTags',
  'updateTaskExecutionOptions',
  'updateTaskApiPreset',
  'updateTaskApiPresetRouting',
  'addPromptGroup',
  'removePromptGroup',
  'movePromptGroup',
  'addPromptAutoSlot',
  'removePromptAutoSlot',
  'updatePromptAutoSlot',
  'addPromptAutoSegment',
  'removePromptAutoSegment',
  'updatePromptAutoSegment',
  'movePromptAutoSegment',
  'setTaskEnabled',
  'renameTask',
  'duplicateTask',
  'moveTask',
  'moveTaskToIndex',
  'rerunCurrentFloor',
  'triggerTask',
  'getEffectiveSettings',
  'getActivePresetName',
  'getLastPromptMessages',
  'getLastPlaceholderVars',
  'buildEffectivePromptGroups',
  'validateReplicaFamily',
  'listReplicaFamilyMembers',
  'getLastRunStatus',
  'listApiPresets',
  'resolveTaskApiPresetName',
  'resetTaskScheduleState',
] as const;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('acuPostProcessTaskApi exposes all P0-P2 methods', () => {
  const missing = expectedMethods.filter(m => typeof acuPostProcessTaskApi[m] !== 'function');
  assert.deepEqual(missing, []);
  assert.equal(expectedMethods.length, 45);
});
