import { getCurrentChatKey } from '../api/chat-key';

export const ACU_PP_TASKS_CHANGED = 'acu-pp:tasks-changed';
export const ACU_PP_CHAT_SCOPE_CHANGED = 'acu-pp:chat-scope-changed';
/** 本楼副本名单快照已落盘，或本次运行已取消/失败。楼层界面据此再读一次。 */
export const ACU_CHRONICLE_FLOOR_READY = 'acu_chronicle_floor_ready';

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
  /** 本次因 ensureChatOverride 等新创建了本聊快照 */
  createdSnapshot?: boolean;
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

export async function emitChronicleFloorReady(messageId: number): Promise<void> {
  if (!Number.isFinite(messageId) || messageId < 0) return;
  try {
    await eventEmit(ACU_CHRONICLE_FLOOR_READY, messageId);
  } catch (error) {
    console.warn('[工作流助手] 通知编年史楼层就绪失败:', error);
  }
}

export async function emitChatScopeChanged(
  mode: 'chat_override' | 'inherit_global',
  originPresetName?: string,
  options?: { createdSnapshot?: boolean },
): Promise<void> {
  const payload: ChatScopeChangedPayload = {
    chatKey: getCurrentChatKey(),
    mode,
    originPresetName,
    createdSnapshot: options?.createdSnapshot,
  };
  await eventEmit(ACU_PP_CHAT_SCOPE_CHANGED, payload);
}
