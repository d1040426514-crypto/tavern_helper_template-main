import { SCRIPT_LOG_PREFIX } from '../ui/brand';
import type { ScriptSettings } from './schema';

/** shujuku 式：挂在聊天消息对象顶层，不进 message.data / post_process_tags */
export const ACU_WORKFLOW_RUN_STATUS_KEY = 'acu_workflow_run_status';

export type LastRunStatus = ScriptSettings['lastRunStatus'];

type ChatHost = {
  chat: Array<Record<string, unknown>>;
  saveChat: () => Promise<void>;
};

function getChatHost(): ChatHost | null {
  try {
    const ctx = (
      window.parent as Window & {
        SillyTavern?: {
          getContext?: () => {
            chat?: Array<Record<string, unknown>>;
            saveChat?: () => Promise<void>;
          };
        };
      }
    ).SillyTavern?.getContext?.();
    if (!ctx?.chat || typeof ctx.saveChat !== 'function') return null;
    return { chat: ctx.chat, saveChat: () => ctx.saveChat!() };
  } catch {
    return null;
  }
}

export function normalizeRunStatus(raw: unknown): LastRunStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.taskResults)) return null;
  return {
    messageId: typeof o.messageId === 'number' ? o.messageId : undefined,
    at: typeof o.at === 'number' ? o.at : undefined,
    taskResults: o.taskResults as LastRunStatus['taskResults'],
  };
}

export function readRunStatusFromMessage(messageId: number): LastRunStatus | null {
  if (messageId < 0) return null;
  const host = getChatHost();
  if (!host || messageId >= host.chat.length) return null;
  const msg = host.chat[messageId];
  if (!msg) return null;
  const status = normalizeRunStatus(msg[ACU_WORKFLOW_RUN_STATUS_KEY]);
  if (!status) return null;
  // 删楼后下标会变，内嵌 messageId 可能陈旧；以当前楼号为准
  return { ...status, messageId };
}

/**
 * 从指定楼向前扫描 assistant 消息上的运行快照（仿 shujuku getPlotFromHistory）。
 * @param beforeFloorExclusive 若给定，只看严格小于该 id 的楼
 */
export function resolveEffectiveRunStatus(beforeFloorExclusive?: number): LastRunStatus | null {
  const host = getChatHost();
  if (!host || host.chat.length === 0) return null;

  const upper =
    beforeFloorExclusive != null
      ? Math.min(beforeFloorExclusive - 1, host.chat.length - 1)
      : host.chat.length - 1;
  if (upper < 0) return null;

  for (let i = upper; i >= 0; i--) {
    const msg = host.chat[i];
    if (!msg || msg.is_user) continue;
    const status = normalizeRunStatus(msg[ACU_WORKFLOW_RUN_STATUS_KEY]);
    if (status) return { ...status, messageId: i };
  }
  return null;
}

export function resolveRunStatusForFloor(floorId: number | null): LastRunStatus | null {
  if (floorId == null || floorId < 0) return null;
  return readRunStatusFromMessage(floorId);
}

/** 写入 AI 楼顶层字段并 saveChat（不写 message.data） */
export async function writeRunStatusToMessage(
  messageId: number,
  status: LastRunStatus,
): Promise<boolean> {
  const host = getChatHost();
  if (!host || messageId < 0 || messageId >= host.chat.length) {
    console.warn(`${SCRIPT_LOG_PREFIX} 写入运行快照失败：找不到楼层 ${messageId}`);
    return false;
  }
  const msg = host.chat[messageId];
  if (!msg) {
    console.warn(`${SCRIPT_LOG_PREFIX} 写入运行快照失败：楼层 ${messageId} 为空`);
    return false;
  }
  msg[ACU_WORKFLOW_RUN_STATUS_KEY] = _.cloneDeep(status);
  try {
    await host.saveChat();
  } catch (error) {
    console.warn(`${SCRIPT_LOG_PREFIX} saveChat 保存运行快照失败:`, error);
  }
  return true;
}

/**
 * 删楼/换聊后：若缓存指向的楼已不存在，回退到仍存在的最近快照。
 */
export function retargetRunStatusCache(): void {
  // 惰性加载，避免纯 mes 读写路径在单测中拉入 Pinia settings store
  const { loadSettings, saveSettings } = require('../settings') as typeof import('../settings');
  const settings = loadSettings();
  const cachedId = settings.lastRunStatus?.messageId;
  if (cachedId != null) {
    const onFloor = readRunStatusFromMessage(cachedId);
    if (onFloor) {
      settings.lastRunStatus = _.cloneDeep(onFloor);
      saveSettings(settings);
      return;
    }
  }
  const effective = resolveEffectiveRunStatus();
  settings.lastRunStatus = effective
    ? _.cloneDeep(effective)
    : { taskResults: [] };
  saveSettings(settings);
}

/** 优先 mes 真相源，否则回退 settings 缓存 */
export function resolveLastRunStatus(): LastRunStatus {
  const effective = resolveEffectiveRunStatus();
  if (effective) return _.cloneDeep(effective);
  const { loadSettings } = require('../settings') as typeof import('../settings');
  return _.cloneDeep(loadSettings().lastRunStatus);
}

export function registerRunStatusRetarget(): EventOnReturn {
  const onRetarget = () => {
    try {
      retargetRunStatusCache();
    } catch (error) {
      console.warn(`${SCRIPT_LOG_PREFIX} retarget 运行快照缓存失败:`, error);
    }
  };

  const offDeleted = eventOn(tavern_events.MESSAGE_DELETED, onRetarget);
  const offChat = eventOn(tavern_events.CHAT_CHANGED, onRetarget);

  return {
    stop: () => {
      offDeleted.stop();
      offChat.stop();
    },
  };
}
