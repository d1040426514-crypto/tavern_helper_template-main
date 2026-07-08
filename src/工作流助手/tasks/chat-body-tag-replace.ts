import {
  findAllTagInstances,
  findLastTagInstance,
  parseCompositeKey,
  parseExtractTagSpec,
  storedTagValueToInner,
  type ExtractTagSpec,
} from './tag-extract';
import { processTemplateText } from './template-process';
import {
  buildCurrentFloorTagMap,
  buildExtractedBlockFromTags,
  writeFloorTagValues,
} from './tag-variables';
import { overwriteRelayTagMap, replacePlotTagPlaceholdersWithHistory, type RelayTagMap } from './utils';
import type { SharedContext } from './placeholders';
import type { ChatBodyTagReplaceRule, ScriptSettings } from './schema';
import type { TaskRunResult } from './runtime';

export const BODY_REPLACE_ORIGIN_KEY = '_post_process_body_replace_origin';

function isMvuExtraAnalysisActive(): boolean {
  try {
    return typeof Mvu !== 'undefined' && Mvu.isDuringExtraAnalysis?.() === true;
  } catch {
    return false;
  }
}

function keyMatchesExtractSpec(key: string, spec: ExtractTagSpec): boolean {
  if (!spec.attrName) return key === spec.tagName;
  const parsed = parseCompositeKey(key);
  if (!parsed) return false;
  return parsed.tagName === spec.tagName && parsed.attrName === spec.attrName;
}

export function collectStageTagsForRule(stageResults: TaskRunResult[], targetTag: string): Record<string, string> {
  const spec = parseExtractTagSpec(targetTag);
  if (!spec) return {};

  const merged: Record<string, string> = {};
  for (const r of stageResults) {
    if (!r.success || r.skipped) continue;
    for (const [key, value] of Object.entries(r.extractedTags ?? {})) {
      if (!String(value ?? '').trim()) continue;
      if (!keyMatchesExtractSpec(key, spec)) continue;
      merged[key] = value;
    }
  }
  return merged;
}

export function replaceBareTagLastInner(text: string, tagName: string, newInner: string): string {
  const inst = findLastTagInstance(text, tagName);
  if (!inst) return text;
  const blockStart = text.lastIndexOf(inst.fullBlock);
  if (blockStart < 0) return text;
  const openEnd = text.indexOf('>', blockStart);
  if (openEnd < 0) return text;
  const closeTag = `</${tagName}>`;
  const closeStart = blockStart + inst.fullBlock.length - closeTag.length;
  return text.slice(0, openEnd + 1) + newInner + text.slice(closeStart);
}

export function replaceAttrTagInners(
  text: string,
  tagName: string,
  attrName: string,
  attrValueToInner: Record<string, string>,
): string {
  let result = text;
  const lowerAttr = attrName.toLowerCase();
  for (const [attrValue, newInner] of Object.entries(attrValueToInner)) {
    const instances = findAllTagInstances(result, tagName);
    const inst = instances.find(i => i.attrs[lowerAttr] === attrValue);
    if (!inst) continue;
    const blockStart = result.indexOf(inst.fullBlock);
    if (blockStart < 0) continue;
    const openEnd = result.indexOf('>', blockStart);
    if (openEnd < 0) continue;
    const closeTag = `</${tagName}>`;
    const closeStart = blockStart + inst.fullBlock.length - closeTag.length;
    result = result.slice(0, openEnd + 1) + newInner + result.slice(closeStart);
  }
  return result;
}

export function replaceTagInnersInMessage(
  message: string,
  targetTag: string,
  renderedInnerByKey: Record<string, string>,
): string {
  const spec = parseExtractTagSpec(targetTag);
  if (!spec || !Object.keys(renderedInnerByKey).length) return message;

  if (!spec.attrName) {
    const inner = renderedInnerByKey[spec.tagName] ?? renderedInnerByKey[targetTag];
    if (inner == null) return message;
    return replaceBareTagLastInner(message, spec.tagName, inner);
  }

  const attrValues: Record<string, string> = {};
  for (const [key, inner] of Object.entries(renderedInnerByKey)) {
    const parsed = parseCompositeKey(key);
    if (!parsed) continue;
    attrValues[parsed.attrValue] = inner;
  }
  return replaceAttrTagInners(message, spec.tagName, spec.attrName, attrValues);
}

function toTagAggregateInput(r: TaskRunResult) {
  const extractedTags = r.extractedTags ?? {};
  return {
    success: !!r.success,
    skipped: r.skipped,
    extractedTags,
    extractedBlock: buildExtractedBlockFromTags(extractedTags),
    taskId: r.taskId,
    taskName: r.taskName,
  };
}

function aggregateTaskResults(results: TaskRunResult[]): RelayTagMap {
  const aggregated: RelayTagMap = new Map();
  for (const r of results) {
    if (!r.success || r.skipped) continue;
    overwriteRelayTagMap(aggregated, r.extractedTags ?? {});
  }
  return aggregated;
}

export async function renderChatBodyTagReplaceTemplate(
  template: string,
  allStageResults: TaskRunResult[],
  messageId: number,
): Promise<string> {
  const trimmed = template.trim();
  if (!trimmed) return '';

  const successful = allStageResults.filter(r => r.success && !r.skipped).map(toTagAggregateInput);
  const aggregated = aggregateTaskResults(allStageResults);
  const historyMap = buildCurrentFloorTagMap(messageId);

  let out = trimmed;
  for (const r of successful) {
    out = out.split(`{{task:${r.taskName}}}`).join(r.extractedBlock);
    out = out.split(`{{task:${r.taskId}}}`).join(r.extractedBlock);
  }
  out = replacePlotTagPlaceholdersWithHistory(out, aggregated, historyMap, new Set(), {
    historyFallback: 'all-tags',
  });
  return processTemplateText(out, messageId);
}

function templateInnerForKey(key: string, rendered: string): string {
  const trimmed = rendered.trim();
  if (!trimmed) return '';
  return storedTagValueToInner(key, trimmed);
}

function isRuleActive(rule: ChatBodyTagReplaceRule, assistantTags: string[]): boolean {
  const targetTag = rule.targetTag.trim();
  const template = rule.template.trim();
  if (!targetTag || !template) return false;
  return assistantTags.some(t => t.trim() === targetTag);
}

export async function ensureBodyReplaceOriginCaptured(messageId: number): Promise<void> {
  const msg = getChatMessages(messageId)[0];
  if (!msg || msg.role !== 'assistant') return;
  const data = (msg.data ?? {}) as Record<string, unknown>;
  if (typeof data[BODY_REPLACE_ORIGIN_KEY] === 'string') return;

  await setChatMessages(
    [
      {
        message_id: messageId,
        data: {
          ...data,
          [BODY_REPLACE_ORIGIN_KEY]: msg.message ?? '',
        },
      },
    ],
    { refresh: 'none' },
  );
}

export async function restoreBodyReplaceOrigin(messageId: number): Promise<void> {
  const msg = getChatMessages(messageId)[0];
  if (!msg) return;
  const data = (msg.data ?? {}) as Record<string, unknown>;
  const origin = data[BODY_REPLACE_ORIGIN_KEY];
  if (typeof origin !== 'string') return;

  await setChatMessages(
    [
      {
        message_id: messageId,
        message: origin,
        data: { ...data },
      },
    ],
    { refresh: 'affected' },
  );
}

export interface ApplyChatBodyTagReplaceAfterStageOptions {
  messageId: number;
  settings: ScriptSettings;
  stageResults: TaskRunResult[];
  allStageResults: TaskRunResult[];
  ctx: SharedContext;
  onMessageUpdated?: (text: string) => void;
}

export async function applyChatBodyTagReplaceAfterStage(
  options: ApplyChatBodyTagReplaceAfterStageOptions,
): Promise<void> {
  const { messageId, settings, stageResults, allStageResults, ctx, onMessageUpdated } = options;
  const rules = settings.chatBodyTagReplaceRules ?? [];
  if (!rules.length) return;

  const msg = getChatMessages(messageId)[0];
  if (!msg || msg.role !== 'assistant') return;

  if (isMvuExtraAnalysisActive()) {
    console.warn('[工作流助手] MVU 额外模型解析进行中，已跳过本阶段聊天正文标签替换');
    return;
  }

  const assistantTags = settings.chatExtractTags?.assistant ?? [];
  let message = msg.message ?? '';
  let anyReplaced = false;

  for (const rule of rules) {
    if (!isRuleActive(rule, assistantTags)) continue;

    const stageTags = collectStageTagsForRule(stageResults, rule.targetTag);
    if (!Object.keys(stageTags).length) continue;

    writeFloorTagValues(messageId, stageTags);

    const rendered = await renderChatBodyTagReplaceTemplate(rule.template, allStageResults, messageId);
    const renderedInnerByKey: Record<string, string> = {};
    const spec = parseExtractTagSpec(rule.targetTag.trim());
    if (!spec) continue;

    if (!spec.attrName) {
      const inner = templateInnerForKey(spec.tagName, rendered);
      if (inner) renderedInnerByKey[spec.tagName] = inner;
    } else {
      for (const key of Object.keys(stageTags)) {
        const inner = templateInnerForKey(key, rendered);
        if (inner) renderedInnerByKey[key] = inner;
      }
    }

    const next = replaceTagInnersInMessage(message, rule.targetTag.trim(), renderedInnerByKey);
    if (next !== message) {
      message = next;
      anyReplaced = true;
    }
  }

  if (!anyReplaced) return;

  await setChatMessages(
    [
      {
        message_id: messageId,
        message,
        data: msg.data ?? {},
      },
    ],
    { refresh: 'affected' },
  );

  ctx.aiText = message;
  onMessageUpdated?.(message);
}
