import { processTemplateText } from './template-process';
import type { ScriptSettings } from './schema';
import {
  getPlotPlaceholderTagNames,
  getPlotTagMapValue,
  mergeRelayTagMap,
  replacePlotTagPlaceholdersWithHistory,
  type RelayTagMap,
} from './utils';

export const TAG_DATA_ROOT_KEY = 'post_process_tags';

const LEGACY_TAG_VAR_PREFIX = 'pp_tag__';

function isAccessibleMessageFloor(message_id: number): boolean {
  return message_id >= 0 && getChatMessages(message_id).length > 0;
}

export function readTagContainer(variables: Record<string, unknown>): Record<string, string> {
  const raw = variables[TAG_DATA_ROOT_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) out[key] = text;
  }
  return out;
}

function readLegacyTagContainer(variables: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (!key.startsWith(LEGACY_TAG_VAR_PREFIX)) continue;
    if (value === undefined || value === null) continue;
    const tag = key.slice(LEGACY_TAG_VAR_PREFIX.length);
    const text = String(value).trim();
    if (tag && text) out[tag] = text;
  }
  return out;
}

function tagContainerToRelayMap(container: Record<string, string>): RelayTagMap {
  const map: RelayTagMap = new Map();
  for (const [tag, text] of Object.entries(container)) {
    map.set(tag, [text]);
  }
  return map;
}

/** 读取指定楼层的 post_process_tags 整包（含旧 pp_tag__ 兼容） */
export function buildFloorTagMap(floorId: number): RelayTagMap {
  if (!isAccessibleMessageFloor(floorId)) return new Map();
  try {
    const variables = getVariables({ type: 'message', message_id: floorId }) ?? {};
    const container = readTagContainer(variables);
    if (Object.keys(container).length) return tagContainerToRelayMap(container);
    return tagContainerToRelayMap(readLegacyTagContainer(variables));
  } catch {
    return new Map();
  }
}

/** 正常后处理：读当前楼 post_process_tags（应为继承后的快照） */
export function buildCurrentFloorTagMap(messageId: number): RelayTagMap {
  return buildFloorTagMap(messageId);
}

/** 重跑模式：仅读取上一楼 post_process_tags */
export function buildPreviousFloorTagMap(messageId: number): RelayTagMap {
  return buildFloorTagMap(messageId - 1);
}

export function buildInjectOnlyTagsUnion(tasks: ScriptSettings['tasks']): Set<string> {
  const set = new Set<string>();
  for (const task of tasks) {
    if (!task.enabled) continue;
    for (const tag of task.extractInjectTags ?? []) {
      const t = tag.trim();
      if (t) set.add(t);
    }
  }
  return set;
}

function migrateLegacyTagsOnFloor(variables: Record<string, unknown>): boolean {
  const legacy = readLegacyTagContainer(variables);
  if (!Object.keys(legacy).length) return false;

  const current = readTagContainer(variables);
  const merged = { ...legacy, ...current };
  variables[TAG_DATA_ROOT_KEY] = merged;
  for (const key of Object.keys(variables)) {
    if (key.startsWith(LEGACY_TAG_VAR_PREFIX)) delete variables[key];
  }
  return true;
}

export function inheritTagVariables(message_id: number): void {
  if (!isAccessibleMessageFloor(message_id) || message_id <= 0) return;

  let previous: Record<string, unknown>;
  try {
    previous = getVariables({ type: 'message', message_id: message_id - 1 }) ?? {};
  } catch {
    return;
  }

  const prevContainer = {
    ...readLegacyTagContainer(previous),
    ...readTagContainer(previous),
  };
  if (!Object.keys(prevContainer).length) return;

  updateVariablesWith(
    variables => {
      migrateLegacyTagsOnFloor(variables);
      const current = readTagContainer(variables);
      const merged = { ...prevContainer, ...current };
      variables[TAG_DATA_ROOT_KEY] = merged;
      return variables;
    },
    { type: 'message', message_id },
  );
}

export function backfillChatTagVariables(): void {
  if (getChatMessages(-1).length === 0) return;
  const last = getLastMessageId();
  for (let message_id = 0; message_id <= last; message_id++) {
    if (!isAccessibleMessageFloor(message_id)) continue;
    let variables: Record<string, unknown>;
    try {
      variables = getVariables({ type: 'message', message_id }) ?? {};
    } catch {
      continue;
    }

    const hasLegacy = Object.keys(variables).some(k => k.startsWith(LEGACY_TAG_VAR_PREFIX));
    const hasContainer = Object.keys(readTagContainer(variables)).length > 0;

    if (hasLegacy) {
      updateVariablesWith(
        vars => {
          migrateLegacyTagsOnFloor(vars);
          return vars;
        },
        { type: 'message', message_id },
      );
      continue;
    }

    if (!hasContainer && message_id > 0) {
      inheritTagVariables(message_id);
    }
  }
}

type TagAggregateInput = {
  success: boolean;
  skipped?: boolean;
  extractedTags: Record<string, string>;
  extractedBlock: string;
  taskId: string;
  taskName: string;
};

function aggregateTaskTagResults(results: TagAggregateInput[]): RelayTagMap {
  const aggregated: RelayTagMap = new Map();
  for (const r of results) {
    if (!r.success || r.skipped) continue;
    mergeRelayTagMap(aggregated, r.extractedTags);
  }
  return aggregated;
}

function getTagNamesFromVariableTemplate(template: string, successful: TagAggregateInput[]): Set<string> {
  let text = template.trim();
  for (const r of successful) {
    text = text.split(`{{task:${r.taskName}}}`).join(r.extractedBlock);
    text = text.split(`{{task:${r.taskId}}}`).join(r.extractedBlock);
  }
  return new Set(getPlotPlaceholderTagNames(text));
}

export function registerTagVariableInheritance(): EventOnReturn {
  const onMessage = (message_id: number) => {
    errorCatched(() => inheritTagVariables(message_id))();
  };

  const offReceived = eventOn(tavern_events.MESSAGE_RECEIVED, onMessage);
  const offSent = eventOn(tavern_events.MESSAGE_SENT, onMessage);
  const offChat = eventOn(tavern_events.CHAT_CHANGED, () => {
    errorCatched(backfillChatTagVariables)();
  });

  errorCatched(backfillChatTagVariables)();

  return {
    stop: () => {
      offReceived.stop();
      offSent.stop();
      offChat.stop();
    },
  };
}

export async function applyTagVariableInjectTemplate(
  settings: ScriptSettings,
  results: TagAggregateInput[],
  messageId: number,
): Promise<void> {
  const template = settings.tagVariableInjectTemplate?.trim();
  if (!template) return;

  const successful = results.filter(r => r.success && !r.skipped);
  if (!successful.length) return;

  const aggregated = aggregateTaskTagResults(successful);
  const tagNames = getTagNamesFromVariableTemplate(template, successful);
  if (!tagNames.size) return;

  const toWrite: Record<string, string> = {};
  for (const tagName of tagNames) {
    const entry = getPlotTagMapValue(aggregated, tagName);
    if (!entry.found || !entry.value.length) continue;
    const inner = entry.value.filter(Boolean).join('\n\n').trim();
    if (!inner) continue;
    toWrite[tagName] = inner;
  }

  if (!Object.keys(toWrite).length) return;

  updateVariablesWith(
    variables => {
      migrateLegacyTagsOnFloor(variables);
      const current = readTagContainer(variables);
      variables[TAG_DATA_ROOT_KEY] = { ...current, ...toWrite };
      return variables;
    },
    { type: 'message', message_id: messageId },
  );
}

export async function mergeAiFloorInjectBlock(
  settings: ScriptSettings,
  results: TagAggregateInput[],
  messageId: number,
  injectOnlyTagsUnion: Set<string>,
): Promise<string> {
  const successful = results.filter(r => r.success && !r.skipped);
  const aggregated = aggregateTaskTagResults(successful);
  const emptyHistory: RelayTagMap = new Map();

  const template = settings.finalInjectTemplate?.trim();
  if (!template) return '';

  let out = template;
  for (const r of successful) {
    out = out.split(`{{task:${r.taskName}}}`).join(r.extractedBlock);
    out = out.split(`{{task:${r.taskId}}}`).join(r.extractedBlock);
  }
  out = replacePlotTagPlaceholdersWithHistory(out, aggregated, emptyHistory, injectOnlyTagsUnion, {
    restrictToInjectOnly: true,
  });
  return processTemplateText(out, messageId);
}
