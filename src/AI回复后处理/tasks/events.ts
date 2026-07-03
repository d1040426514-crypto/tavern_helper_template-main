import { getCurrentChatKey } from '../api/chat-key';

export const ACU_PP_TASKS_CHANGED = 'acu-pp:tasks-changed';
export const ACU_PP_CHAT_SCOPE_CHANGED = 'acu-pp:chat-scope-changed';

export type TaskChangeAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'replace'
  | 'clear'
  | 'preset'
  | 'schedule_reset';

export type TasksChangedPayload = {
  chatKey: string;
  action: TaskChangeAction;
  taskId?: string;
  source: 'api' | 'ui';
};

export type ChatScopeChangedPayload = {
  chatKey: string;
  mode: 'chat_override' | 'inherit_global';
  originPresetName?: string;
};

export async function emitTasksChanged(
  action: TaskChangeAction,
  source: 'api' | 'ui',
  taskId?: string,
): Promise<void> {
  const payload: TasksChangedPayload = {
    chatKey: getCurrentChatKey(),
    action,
    taskId,
    source,
  };
  await eventEmit(ACU_PP_TASKS_CHANGED, payload);
}

export async function emitChatScopeChanged(
  mode: 'chat_override' | 'inherit_global',
  originPresetName?: string,
): Promise<void> {
  const payload: ChatScopeChangedPayload = {
    chatKey: getCurrentChatKey(),
    mode,
    originPresetName,
  };
  await eventEmit(ACU_PP_CHAT_SCOPE_CHANGED, payload);
}
