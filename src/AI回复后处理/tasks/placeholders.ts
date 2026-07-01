import { resolveSummaryIndexContent } from '../bridge/summary-index';
import { getWorldbookContentForPostProcess } from '../worldbook/content';
import {
  buildCurrentFloorTagMap,
  buildInjectOnlyTagsUnion,
  buildPreviousFloorTagMap,
  inheritTagVariables,
} from './tag-variables';
import { processTemplateText } from './template-process';
import {
  buildTaskWorldbookTriggerText,
  replacePlaceholdersInText,
  replacePlotTagPlaceholdersWithHistory,
  type RelayTagMap,
} from './utils';
import { sanitizeAiContextForPostProcess, sanitizeUserInputForPostProcess } from './sanitize-context';
import { shieldScriptPlaceholders, unshieldScriptPlaceholders } from './placeholder-shield';
import {
  applyContextTagFilters,
  normalizeContextTagRules,
} from './context-tags';
import type { DataSnapshot } from '../bridge/database-api';
import type { PostProcessTask, ScriptSettings } from './schema';
import { normalizePromptRole } from './prompt-role';

export interface SharedContext {
  messageId: number;
  aiText: string;
  userText: string;
  snapshot: DataSnapshot;
  settings: ScriptSettings;
  vars: Record<string, string>;
  taskWorldbookCache: Map<string, string>;
  messageVarHistoryMap: RelayTagMap;
  injectOnlyTagsUnion: Set<string>;
}

function applyContextFilters(text: string, settings: ScriptSettings): string {
  const extractRules = normalizeContextTagRules(settings.contextExtractRules);
  const excludeRules = normalizeContextTagRules(settings.contextExcludeRules);
  return applyContextTagFilters(text, extractRules, excludeRules);
}

function buildContext7(settings: ScriptSettings, messageId: number, aiText: string): string {
  const n = Math.max(0, settings.contextTurnCount);
  const endId = messageId >= 0 ? messageId : getLastMessageId();
  if (n === 0 && !aiText.trim()) return '';
  if (n === 0) {
    return sanitizeAiContextForPostProcess(applyContextFilters(aiText, settings));
  }
  try {
    if (endId < 0) return sanitizeAiContextForPostProcess(applyContextFilters(aiText, settings));
    const msgs = getChatMessages(`0-${endId}`);
    const assistantMsgs = msgs.filter(m => m.role === 'assistant');
    const slice = assistantMsgs.slice(-n);
    const joined = slice
      .map(m => sanitizeAiContextForPostProcess(applyContextFilters(m.message, settings)))
      .filter(Boolean)
      .join('\n\n');
    if (joined.trim()) return joined;
  } catch {
    // fall through
  }
  return sanitizeAiContextForPostProcess(applyContextFilters(aiText, settings));
}

async function resolve$5(settings: ScriptSettings, snapshot: DataSnapshot, messageId: number): Promise<string> {
  const raw = await resolveSummaryIndexContent(snapshot.tablesJson, settings.plotWorldbookConfig);
  return processTemplateText(raw, messageId);
}

export async function buildSharedContext(
  messageId: number,
  settings: ScriptSettings,
  snapshot: DataSnapshot,
  options?: { isRerun?: boolean },
): Promise<SharedContext> {
  const msg = getChatMessages(messageId)[0];
  const aiText = msg?.message ?? '';
  let userText = '';
  try {
    const prev = getChatMessages(messageId - 1)[0];
    if (prev?.role === 'user') userText = prev.message;
  } catch {
    userText = '';
  }

  const customVarMap: Record<string, string> = {};
  for (const v of settings.customVariables) {
    if (!v.key) continue;
    const val = await processTemplateText(v.value, messageId);
    customVarMap[v.key] = val;
    customVarMap[`{{${v.key}}}`] = val;
  }

  const $7 = buildContext7(settings, messageId, aiText);
  const $5 = await resolve$5(settings, snapshot, messageId);

  let $U = '';
  let $C = '';
  try {
    const persona = getPersona('current');
    $U = await processTemplateText([persona.name, persona.description].filter(Boolean).join('\n'), messageId);
  } catch {
    $U = '';
  }
  try {
    const char = await getCharacter('current');
    $C = await processTemplateText(char.description ?? '', messageId);
  } catch {
    $C = '';
  }

  const vars: Record<string, string> = {
    ...customVarMap,
    $1: '',
    $5,
    $7,
    $8: sanitizeUserInputForPostProcess(userText),
    $U: $U ?? '',
    $C: $C ?? '',
  };

  if (!options?.isRerun) {
    inheritTagVariables(messageId);
  }

  const messageVarHistoryMap = options?.isRerun
    ? buildPreviousFloorTagMap(messageId)
    : buildCurrentFloorTagMap(messageId);
  const injectOnlyTagsUnion = buildInjectOnlyTagsUnion(settings.tasks);

  return {
    messageId,
    aiText,
    userText,
    snapshot,
    settings,
    vars,
    taskWorldbookCache: new Map(),
    messageVarHistoryMap,
    injectOnlyTagsUnion,
  };
}

export async function resolveTaskPlaceholders(
  task: PostProcessTask,
  ctx: SharedContext,
  relayTagMap: RelayTagMap,
): Promise<Record<string, string>> {
  const needs$1 = task.promptGroups.some(g => g.content.includes('$1'));
  const vars = { ...ctx.vars };
  if (needs$1) {
    if (!ctx.taskWorldbookCache.has(task.id)) {
      const baseScan = [ctx.userText, ctx.aiText].filter(Boolean).join('\n');
      const triggerText = buildTaskWorldbookTriggerText(
        task.promptGroups,
        relayTagMap,
        ctx.messageVarHistoryMap,
        ctx.injectOnlyTagsUnion,
      );
      const wb = await getWorldbookContentForPostProcess(
        ctx.settings.plotWorldbookConfig,
        [baseScan, triggerText].join('\n'),
        ctx.messageId,
      );
      ctx.taskWorldbookCache.set(task.id, wb);
    }
    vars.$1 = ctx.taskWorldbookCache.get(task.id) ?? '';
  }
  return vars;
}

export async function renderTaskMessages(
  task: PostProcessTask,
  vars: Record<string, string>,
  relayTagMap: RelayTagMap,
  messageVarHistoryMap: RelayTagMap,
  injectOnlyTagsUnion: Set<string>,
  messageId: number,
): Promise<{ role: 'system' | 'user' | 'assistant'; content: string }[]> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  for (const g of task.promptGroups) {
    const shield = shieldScriptPlaceholders(g.content);
    let content = await processTemplateText(shield.text, messageId);
    content = unshieldScriptPlaceholders(content, shield.tokens);
    content = replacePlaceholdersInText(content, vars);
    content = replacePlotTagPlaceholdersWithHistory(
      content,
      relayTagMap,
      messageVarHistoryMap,
      injectOnlyTagsUnion,
    );
    if (!content.trim()) continue;
    messages.push({
      role: normalizePromptRole(g.role),
      content,
    });
  }
  return messages;
}
