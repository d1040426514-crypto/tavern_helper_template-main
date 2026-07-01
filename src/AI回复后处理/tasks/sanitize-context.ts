import { extractLastTagContent } from './utils';

const USER_INPUT_TAGS = ['Current round input', 'Participant_input', 'user_input'];

function sanitizeSingleAiMessage(text: string): string {
  const gametxt = extractLastTagContent(text, 'gametxt');
  if (gametxt?.trim()) return gametxt.trim();
  return text.trim();
}

/** 提取命定之诗等预设包裹的用户输入内文，避免宏二次展开 */
export function sanitizeUserInputForPostProcess(text: string): string {
  if (!text?.trim()) return text ?? '';
  for (const tag of USER_INPUT_TAGS) {
    const inner = extractLastTagContent(text, tag);
    if (inner?.trim()) return inner.trim();
  }
  const stripped = text.replace(/^<Current round input>\s*/i, '').replace(/\s*<\/Current round input>\s*$/i, '');
  if (stripped !== text) return stripped.trim();
  return text.trim();
}

/** 从 AI 楼层中提取 gametxt 正文；多轮时逐段提取 */
export function sanitizeAiContextForPostProcess(text: string): string {
  if (!text?.trim()) return text ?? '';
  const gametxt = extractLastTagContent(text, 'gametxt');
  if (gametxt?.trim()) return gametxt.trim();

  const parts = text
    .split(/\n\n+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const joined = parts.map(part => sanitizeSingleAiMessage(part)).filter(Boolean).join('\n\n');
    if (joined.trim()) return joined;
  }
  return sanitizeSingleAiMessage(text);
}
