import { applyContextTagFilters, normalizeContextTagRules } from './context-tags';
import { sanitizeAiContextForPostProcess } from './sanitize-context';
import type { ScriptSettings } from './schema';

function applyContextFilters(text: string, settings: ScriptSettings): string {
  const extractRules = normalizeContextTagRules(settings.contextExtractRules);
  const excludeRules = normalizeContextTagRules(settings.contextExcludeRules);
  return applyContextTagFilters(text, extractRules, excludeRules);
}

/** 最近 N 条 AI 楼正文（提取/排除 + gametxt 清洗），$7 与 $1 世界书扫描共用 */
export function buildAssistantContextSlice(
  settings: ScriptSettings,
  messageId: number,
  aiText: string,
): string {
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

/** $1 世界书扫描基底：与 $7 相同的 AI 楼切片与过滤规则 */
export function buildPlotWorldbookBaseScanText(
  settings: ScriptSettings,
  messageId: number,
  aiText: string,
): string {
  return buildAssistantContextSlice(settings, messageId, aiText);
}
