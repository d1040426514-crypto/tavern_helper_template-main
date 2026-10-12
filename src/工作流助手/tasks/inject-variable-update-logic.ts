const UPDATE_VARIABLE_RE = /<UpdateVariable>/i;

/** getMvuData 会带回整袋楼层变量；这些键另有存档，不能再包进 MVU 基线。 */
const MVU_BASELINE_EXCLUDED_KEYS = [
  'addon_data',
  'addon_archive',
  '_post_process_inject_var_baseline',
  '_post_process_pre_workflow_baseline',
] as const;

export function omitMvuBaselineExtras<T extends Record<string, unknown>>(data: T): T {
  const next = { ...data };
  for (const key of MVU_BASELINE_EXCLUDED_KEYS) {
    delete next[key];
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
