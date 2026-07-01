import { shouldShowAddonUpdateErrors } from './config';
import { AddonEvent } from './events';
import { applyMvuLikePatch, extractAddonJsonPatchOpsWithIssues, MvuJsonPatchOp, PatchIssue } from './patch';
import { AddonData, AddonSchema } from './schema';

export type AddonWrapper = {
  addon_data: AddonData;
};

export type AddonUpdateResult = {
  data: AddonData;
  changed: boolean;
  ops: MvuJsonPatchOp[];
  issues: PatchIssue[];
};

export type AddonUpdateOptions = {
  /** 是否触发 Addon.events 钩子, 默认 false (parseMessage 等纯解析场景) */
  emitEvents?: boolean;
  message_content?: string;
  /** patch 解析完成后、应用前可修改 ops */
  mutateOps?: (ops: MvuJsonPatchOp[]) => MvuJsonPatchOp[];
};

export function wrapAddonData(addon_data: AddonData): AddonWrapper {
  return { addon_data };
}

function notifyIssues(issues: PatchIssue[]): void {
  if (issues.length === 0 || !shouldShowAddonUpdateErrors()) {
    return;
  }
  const lines = issues.map(issue => {
    const op_hint = issue.op ? ` [${issue.op.op} ${'path' in issue.op ? issue.op.path : ''}]` : '';
    return `${issue.kind === 'parse' ? '解析' : '应用'}: ${issue.message}${op_hint}`;
  });
  toastr.warning(lines.join('\n'), '[addon-mvu] 变量更新存在问题');
}

/**
 * 从消息解析 `<AddonJSONPatch>` 并应用 patch.
 * 无 patch 块或 patch 后无变化时返回 undefined (对齐 MVU parseMessage 语义).
 */
export async function updateAddonFromMessage(
  message: string,
  base: AddonData,
  options: AddonUpdateOptions = {},
): Promise<AddonUpdateResult | undefined> {
  const old_wrapper = wrapAddonData(base);

  if (options.emitEvents) {
    await eventEmit(AddonEvent.VARIABLE_UPDATE_STARTED, old_wrapper);
  }

  const { ops: extracted_ops, issues: parse_issues } = extractAddonJsonPatchOpsWithIssues(message);
  if (extracted_ops.length === 0) {
    notifyIssues(parse_issues);
    return undefined;
  }

  let ops = extracted_ops;
  if (options.mutateOps) {
    ops = options.mutateOps(ops);
  }

  if (options.emitEvents) {
    await eventEmit(AddonEvent.PATCH_PARSED, old_wrapper, ops, options.message_content ?? message);
  }

  const { data: patched, issues: apply_issues } = applyMvuLikePatch(_.cloneDeep(base), ops);
  const issues = [...parse_issues, ...apply_issues];

  let new_wrapper = wrapAddonData(AddonSchema.parse(patched));

  if (options.emitEvents) {
    await eventEmit(AddonEvent.VARIABLE_UPDATE_ENDED, new_wrapper, old_wrapper);
    new_wrapper = wrapAddonData(AddonSchema.parse(new_wrapper.addon_data));
  }

  notifyIssues(issues);

  if (_.isEqual(new_wrapper.addon_data, base)) {
    return undefined;
  }

  return {
    data: new_wrapper.addon_data,
    changed: true,
    ops,
    issues,
  };
}
