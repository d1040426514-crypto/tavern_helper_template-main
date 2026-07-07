import type { PostProcessTask } from './schema';
import type { ActiveStructuredOutputMode, StructuredOutputMode } from './strict-variable-response';

export const MVU_JSON_PATCH_PROMPT_GROUP_NAME = 'MVU JSON Patch变量输出规则';
export const ADDON_JSON_PATCH_PROMPT_GROUP_NAME = 'Addon JSON Patch变量输出规则';

const AUTO_PROMPT_GROUP_NAMES = new Set([MVU_JSON_PATCH_PROMPT_GROUP_NAME, ADDON_JSON_PATCH_PROMPT_GROUP_NAME]);

export function isStructuredOutputRulesPromptGroup(name: string): boolean {
  return AUTO_PROMPT_GROUP_NAMES.has(name.trim());
}

export function buildMvuJsonPatchPromptGroupContent(): string {
  return `[MVU 变量 JSON 输出规则]
你必须仅输出一个合法 JSON 对象（不要使用 markdown 代码围栏，不要输出 XML 或自然语言前后缀）。本规则已包含 json 关键字。

## 业务约束
- patch 使用 JSON Patch (RFC 6902) 风格，但支持扩展操作：replace、delta、insert、remove、move
- insert 到数组末尾时 path 使用 \`-\` 作为索引
- path 相对 stat_data 根路径（如 \`/角色/HP\`，不要写 \`/stat_data/...\`）
- 禁止更新以 \`_\` 开头的只读字段（如 \`_变量\`）
- analysis 须为英文，不超过 80 词，说明：时间流逝、是否允许大幅变动、基于当前上下文的变量变更分析

## 根对象结构（format 必须为 mvu_json_patch_v1）
{
  "format": "mvu_json_patch_v1",
  "analysis": "Time passed: ... Dramatic updates allowed: yes/no. Changed: ...",
  "patch": [
    { "op": "replace", "path": "/path/to/variable", "value": "new_value" },
    { "op": "delta", "path": "/path/to/number", "value": -10 },
    { "op": "insert", "path": "/path/to/object/new_key", "value": "new_value" },
    { "op": "insert", "path": "/path/to/array/-", "value": "new_item" },
    { "op": "remove", "path": "/path/to/key" },
    { "op": "move", "from": "/path/from", "to": "/path/to" }
  ]
}`;
}

export function buildAddonJsonPatchPromptGroupContent(): string {
  return `[Addon 变量 JSON 输出规则]
你必须仅输出一个合法 JSON 对象（不要使用 markdown 代码围栏，不要输出 XML 或自然语言前后缀）。本规则已包含 json 关键字。

## 业务约束
- patch 使用 JSON Patch (RFC 6902) 风格，但支持扩展操作：replace、delta、insert、remove、move
- path 相对 addon_data 根路径（如 \`/位面/某世界/...\`，不要写 \`/addon_data/...\`）
- boolean 字段必须是 JSON true/false，不能是字符串
- 禁止更新以 \`_\` 开头的只读字段
- 禁止更新 path 含「降临」或「平行演化」的字段（前端保留）
- 叙事指导.细节层 每回合由 addon-mvu 脚本自动刷新；优先更新宏观层/发展层与事件字段
- analysis 须为英文，不超过 80 词，说明：时间流逝、是否允许大幅变动、基于当前上下文的 addon 变量分析

## 根对象结构（format 必须为 addon_json_patch_v1）
{
  "format": "addon_json_patch_v1",
  "analysis": "Time passed: ... Dramatic updates allowed: yes/no. Changed: ...",
  "patch": [
    { "op": "replace", "path": "/位面/某世界/字段", "value": "new_value" },
    { "op": "insert", "path": "/位面/某世界/new_key", "value": "new_value" },
    { "op": "remove", "path": "/位面/某世界/key" }
  ]
}`;
}

function ensureStructuredOutputRules(task: PostProcessTask): NonNullable<PostProcessTask['structuredOutputRules']> {
  if (!task.structuredOutputRules) {
    task.structuredOutputRules = {};
  }
  return task.structuredOutputRules;
}

export function resolveStructuredOutputRulesContent(
  task: PostProcessTask,
  mode: ActiveStructuredOutputMode,
): string {
  const rules = task.structuredOutputRules;
  if (mode === 'mvu_json_patch') {
    const cached = rules?.mvu?.trim();
    if (cached) return cached;
    return buildMvuJsonPatchPromptGroupContent();
  }
  const cached = rules?.addon?.trim();
  if (cached) return cached;
  return buildAddonJsonPatchPromptGroupContent();
}

export function captureStructuredOutputRulesFromTask(task: PostProcessTask): void {
  const rules = ensureStructuredOutputRules(task);
  for (const pg of task.promptGroups) {
    if (pg.name === MVU_JSON_PATCH_PROMPT_GROUP_NAME) {
      rules.mvu = pg.content;
    }
    if (pg.name === ADDON_JSON_PATCH_PROMPT_GROUP_NAME) {
      rules.addon = pg.content;
    }
  }
}

export function updateStructuredOutputRulesCacheFromPromptGroups(task: PostProcessTask): void {
  captureStructuredOutputRulesFromTask(task);
}

function removeAutoPromptGroups(task: PostProcessTask): void {
  task.promptGroups = task.promptGroups.filter(pg => !isStructuredOutputRulesPromptGroup(pg.name));
}

export function syncStructuredOutputPromptGroup(task: PostProcessTask, mode: StructuredOutputMode): void {
  captureStructuredOutputRulesFromTask(task);
  removeAutoPromptGroups(task);
  if (mode === 'off') return;

  const name =
    mode === 'mvu_json_patch' ? MVU_JSON_PATCH_PROMPT_GROUP_NAME : ADDON_JSON_PATCH_PROMPT_GROUP_NAME;
  const content = resolveStructuredOutputRulesContent(task, mode);
  task.promptGroups.push({
    name,
    role: 'system',
    content,
    enabled: true,
  });
}
