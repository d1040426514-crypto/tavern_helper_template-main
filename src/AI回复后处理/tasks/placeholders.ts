import { resolveSummaryIndexContent } from '../bridge/summary-index';
import { buildAssistantContextSlice, buildPlotWorldbookBaseScanText } from './assistant-context';
import {
  finalizePlotWorldbookPlaceholderContent,
  getWorldbookContentForPostProcess,
} from '../worldbook/content';
import {
  buildCurrentFloorTagMap,
  buildInjectOnlyTagsUnion,
  buildPreviousFloorTagMap,
  inheritTagVariables,
} from './tag-variables';
import { processTemplateText } from './template-process';
import {
  buildTaskWorldbookTriggerText,
  isPromptGroupEnabled,
  replacePlaceholdersInText,
  replacePlotTagPlaceholdersWithHistory,
  type RelayTagMap,
} from './utils';
import { resolveTaskPlotWorldbookConfig } from './plot-worldbook-config';
import { sanitizeUserInputForPostProcess } from './sanitize-context';
import { settingsWithTaskContext } from './context-config';
import { shieldScriptPlaceholders, unshieldScriptPlaceholders } from './placeholder-shield';
import { normalizeContextTagRules } from './context-tags';
import type { DataSnapshot } from '../bridge/database-api';
import type { PostProcessTask, RunLogMessage, ScriptSettings } from './schema';
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

function buildContext7(settings: ScriptSettings, messageId: number, aiText: string): string {
  return buildAssistantContextSlice(settings, messageId, aiText);
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
  const needs$1 = task.promptGroups.some(g => isPromptGroupEnabled(g) && g.content.includes('$1'));
  const needs$7 = task.promptGroups.some(g => isPromptGroupEnabled(g) && g.content.includes('$7'));
  const taskContextSettings = settingsWithTaskContext(ctx.settings, task);
  const vars = { ...ctx.vars };

  if (needs$7) {
    vars.$7 = buildContext7(taskContextSettings, ctx.messageId, ctx.aiText);
  }

  if (needs$1) {
    if (!ctx.taskWorldbookCache.has(task.id)) {
      const baseScan = buildPlotWorldbookBaseScanText(taskContextSettings, ctx.messageId, ctx.aiText);
      const triggerText = buildTaskWorldbookTriggerText(
        task.promptGroups,
        relayTagMap,
        ctx.messageVarHistoryMap,
        ctx.injectOnlyTagsUnion,
        { historyFallback: 'all-tags' },
      );
      const wbConfig = resolveTaskPlotWorldbookConfig(task, ctx.settings);
      const wb = await getWorldbookContentForPostProcess(
        wbConfig,
        [baseScan, triggerText].filter(Boolean).join('\n'),
        ctx.messageId,
      );
      const excludeRules = normalizeContextTagRules(taskContextSettings.contextExcludeRules);
      const finalized = finalizePlotWorldbookPlaceholderContent(wb, excludeRules);
      ctx.taskWorldbookCache.set(task.id, finalized);
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
): Promise<RunLogMessage[]> {
  const messages: RunLogMessage[] = [];
  for (const g of task.promptGroups) {
    if (!isPromptGroupEnabled(g)) continue;
    const shield = shieldScriptPlaceholders(g.content);
    let content = await processTemplateText(shield.text, messageId);
    content = unshieldScriptPlaceholders(content, shield.tokens);
    content = replacePlaceholdersInText(content, vars);
    content = replacePlotTagPlaceholdersWithHistory(
      content,
      relayTagMap,
      messageVarHistoryMap,
      injectOnlyTagsUnion,
      { historyFallback: 'all-tags' },
    );
    if (!content.trim()) continue;
    messages.push({
      role: normalizePromptRole(g.role),
      content,
      name: g.name ?? '',
    });
  }
  return messages;
}
