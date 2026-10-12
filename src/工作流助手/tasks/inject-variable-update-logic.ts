const UPDATE_VARIABLE_RE = /<UpdateVariable>/i;

/** 这些键属于工作流助手，不进楼层变量基线。 */
export const WORKFLOW_FLOOR_VARIABLE_KEYS = [
  'post_process_tags',
  '_post_process_done',
  '_post_process_inject_block',
  '_post_process_body_replace_origin',
  '_post_process_worldbook_write_applied',
  '_post_process_worldbook_write_snapshots',
  '_post_process_replica_state',
  '_post_process_inject_var_baseline',
  '_post_process_pre_workflow_baseline',
] as const;

const WORKFLOW_FLOOR_VARIABLE_KEY_SET = new Set<string>(WORKFLOW_FLOOR_VARIABLE_KEYS);

export function isWorkflowFloorVariableKey(key: string): boolean {
  return WORKFLOW_FLOOR_VARIABLE_KEY_SET.has(key);
}

/** 去掉工作流助手自己的键。没有剩余键时返回 undefined，避免空对象挡住以后的拍摄。 */
export function snapshotForeignFloorVariables(
  data: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isWorkflowFloorVariableKey(key)) continue;
    next[key] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

export function isLegacySplitInjectBaseline(raw: Record<string, unknown>): boolean {
  const keys = Object.keys(raw);
  return keys.length > 0 && keys.every(key => key === 'mvu' || key === 'addon');
}

/** 旧的 `{ mvu, addon }` 折成一袋。addon 写入 addon_data，盖过 mvu 里带上的同名副本。 */
export function flattenInjectBaseline(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!isLegacySplitInjectBaseline(raw)) return snapshotForeignFloorVariables(raw);
  const base: Record<string, unknown> = {};
  const mvu = raw.mvu;
  if (mvu && typeof mvu === 'object' && !Array.isArray(mvu)) {
    Object.assign(base, snapshotForeignFloorVariables(mvu as Record<string, unknown>) ?? {});
  }
  const addon = raw.addon;
  if (addon && typeof addon === 'object' && !Array.isArray(addon)) {
    base.addon_data = addon;
  }
  return Object.keys(base).length ? base : undefined;
}

/**
 * JSONPatch 写回：结果里的非工作流键生效；楼层上有而结果里没有的键留下。
 * 工作流键以楼层当前值为准，避免整包替换把它们清掉或写成拍摄时的旧值。
 */
export function mergeMvuReplacePayload(
  floor: Record<string, unknown>,
  replacement: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(replacement)) {
    if (isWorkflowFloorVariableKey(key)) continue;
    next[key] = value;
  }
  for (const [key, value] of Object.entries(floor)) {
    if (key in next) continue;
    next[key] = value;
  }
  return next;
}

/** 重跑：非工作流键换成基线那一袋，工作流键留在楼层上。 */
export function restoreForeignFloorVariables(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (isWorkflowFloorVariableKey(key)) next[key] = value;
  }
  for (const [key, value] of Object.entries(baseline)) {
    if (isWorkflowFloorVariableKey(key)) continue;
    next[key] = value;
  }
  return next;
}

export type StageVariableUpdateResult = {
  success: boolean;
  skipped?: boolean;
  variableUpdateSource?: string;
};

export function hasUpdateVariableTag(text: string): boolean {
  return UPDATE_VARIABLE_RE.test(String(text || ''));
}

/** 本阶段成功任务中含 `<UpdateVariable>` 的全文，按结果顺序（串行 apply 用） */
export function collectStageVariableUpdateSources(stageResults: StageVariableUpdateResult[]): string[] {
  const sources: string[] = [];
  for (const r of stageResults) {
    if (!r.success || r.skipped) continue;
    const src = r.variableUpdateSource ?? '';
    if (!src.trim() || !hasUpdateVariableTag(src)) continue;
    sources.push(src);
  }
  return sources;
}
