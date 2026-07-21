import type { AddonData } from './schema';

/** 历史上用于隐藏前端控制字段；现已全部对 AI 可见可写，集合为空 */
export const ADDON_HIDDEN_FROM_PROMPT_KEYS = new Set<string>();

/** 生成供世界书/提示词使用的 addon 快照（当前不做字段剥离） */
export function stripAddonHiddenFieldsForDisplay(data: unknown): AddonData | unknown {
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }
  return _.cloneDeep(data);
}
