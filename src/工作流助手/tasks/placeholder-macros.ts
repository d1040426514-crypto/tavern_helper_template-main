import { buildCompositeKey, parseExtractTagSpec } from './tag-extract';
import { ENUM_REGISTRY_MARKER } from './replica-enum-parse';
import { isReplicaFamilyRootTemplate } from './replica-family';
import { buildFloorTagMap } from './tag-variables';
import { resolvePlaceholderForInject, type RelayTagMap } from './utils';
import type { PostProcessTask } from './schema';
import type { ReplicaStateSnapshot } from './replica-state';
import { SCRIPT_LOG_PREFIX } from '../ui/brand';

function resolveMacroMessageId(contextMessageId?: number): number {
  if (typeof contextMessageId === 'number' && Number.isFinite(contextMessageId) && contextMessageId >= 0) {
    return contextMessageId;
  }
  try {
    return getLastMessageId();
  } catch {
    return -1;
  }
}

function resolveReplicaStateForMacro(messageId: number): ReplicaStateSnapshot {
  if (messageId < 0) return {};
  // 惰性加载，避免单测经 reconcile → settings → Pinia
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    readReplicaStateFromMessage,
    collectReplicaStateFromChat,
  } = require('./replica-reconcile') as typeof import('./replica-reconcile');
  const direct = readReplicaStateFromMessage(messageId);
  if (direct && Object.keys(direct).length) return direct;
  return collectReplicaStateFromChat({ maxMessageId: messageId });
}

function loadEffectiveTasks(): PostProcessTask[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { loadSettings } = require('../settings') as typeof import('../settings');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveEffectiveSettings } = require('./effective-settings') as typeof import('./effective-settings');
  return resolveEffectiveSettings(loadSettings()).tasks;
}

/** 用楼层 lastEnumAttrValues 重建带 ENUM_REGISTRY_MARKER 的合成 relay，供 auto launched 过滤 */
export function buildMacroRelayFromReplicaState(
  tasks: PostProcessTask[],
  snapshot: ReplicaStateSnapshot,
): RelayTagMap {
  const relay: RelayTagMap = new Map();
  for (const root of tasks) {
    if (!isReplicaFamilyRootTemplate(root)) continue;
    const values = snapshot[root.id]?.lastEnumAttrValues;
    if (!values?.length) continue;
    const enumSpecStr =
      root.replicaFamilyEnumSpec?.trim() || root.replicaFamilySpec?.trim() || '';
    const parsed = parseExtractTagSpec(enumSpecStr);
    if (!parsed?.attrName) continue;
    for (const value of values) {
      const key = buildCompositeKey(parsed.tagName, parsed.attrName, value);
      relay.set(key, [ENUM_REGISTRY_MARKER]);
    }
  }
  return relay;
}

export function resolveWorkflowPlaceholderMacro(
  placeholderName: string,
  messageId: number,
  options?: {
    tasks?: PostProcessTask[];
    historyMap?: RelayTagMap;
    replicaState?: ReplicaStateSnapshot;
  },
): string {
  const trimmed = placeholderName.trim();
  if (!trimmed) return '';

  const tasks = options?.tasks ?? loadEffectiveTasks();
  const historyMap =
    options?.historyMap ?? (messageId >= 0 ? buildFloorTagMap(messageId) : new Map());
  const snapshot = options?.replicaState ?? resolveReplicaStateForMacro(messageId);
  const relayMap = buildMacroRelayFromReplicaState(tasks, snapshot);

  return resolvePlaceholderForInject(trimmed, relayMap, historyMap, new Set(), {
    historyFallback: 'all-tags',
    allTasks: tasks,
  });
}

function replaceMacroMatch(
  context: { message_id?: number },
  fullPlaceholderName: string,
): string {
  try {
    const messageId = resolveMacroMessageId(context.message_id);
    return resolveWorkflowPlaceholderMacro(fullPlaceholderName, messageId);
  } catch (error) {
    console.warn(
      `${SCRIPT_LOG_PREFIX} 占位符宏解析失败 (${fullPlaceholderName}):`,
      error,
    );
    return '';
  }
}

export function registerPlaceholderMacros(): { stop(): void } {
  const handles = [
    registerMacroLike(/\{\{(total:launched:[^}]+)\}\}/gi, (context, _substring, inner) =>
      replaceMacroMatch(context, String(inner ?? '')),
    ),
    registerMacroLike(/\{\{(total:(?!launched:)[^}]+)\}\}/gi, (context, _substring, inner) =>
      replaceMacroMatch(context, String(inner ?? '')),
    ),
    registerMacroLike(/\{\{(replica:launched:[^}]+)\}\}/gi, (context, _substring, inner) =>
      replaceMacroMatch(context, String(inner ?? '')),
    ),
  ];

  return {
    stop: () => {
      for (const h of handles) {
        try {
          h.unregister();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
