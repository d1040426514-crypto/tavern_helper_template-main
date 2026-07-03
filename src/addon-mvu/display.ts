import type { AddonData } from './schema';

/** 不对 AI 展示、不由 AI patch 的字段（留待前端手动控制） */
export const ADDON_HIDDEN_FROM_PROMPT_KEYS = new Set(['降临', '平行演化']);

function stripHiddenOnRecord(record: Record<string, unknown> | undefined): void {
  if (!record) {
    return;
  }
  for (const entry of Object.values(record)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const obj = entry as Record<string, unknown>;
    for (const key of ADDON_HIDDEN_FROM_PROMPT_KEYS) {
      delete obj[key];
    }
    const singularityPoints = (obj.岁月史书 as Record<string, unknown> | undefined)?.特异点;
    if (singularityPoints && typeof singularityPoints === 'object' && !Array.isArray(singularityPoints)) {
      for (const sp of Object.values(singularityPoints)) {
        if (sp && typeof sp === 'object' && !Array.isArray(sp)) {
          for (const key of ADDON_HIDDEN_FROM_PROMPT_KEYS) {
            delete (sp as Record<string, unknown>)[key];
          }
        }
      }
    }
  }
}

/** 生成供世界书/提示词使用的 addon 快照（隐藏前端控制字段） */
export function stripAddonHiddenFieldsForDisplay(data: unknown): AddonData | unknown {
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }
  const copy = _.cloneDeep(data) as Record<string, unknown>;
  stripHiddenOnRecord(copy.位面 as Record<string, unknown> | undefined);
  return copy;
}
