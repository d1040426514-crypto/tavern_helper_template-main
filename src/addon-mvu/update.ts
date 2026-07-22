import { getAddonArchive, writeAddonArchive } from './archive';
import { shouldShowAddonUpdateErrors } from './config';
import { reconcileSingularityAfterPatch } from './control';
import { AddonEvent } from './events';
import { applyMvuLikePatch, extractAddonJsonPatchOpsWithIssues, MvuJsonPatchOp, PatchIssue } from './patch';
import { syncReplicaLaunched } from './replica-sync';
import { AddonData, normalizeAddonData } from './schema';

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
  /** 写回特异点存档 / 副本族同步的楼层；缺省则不做 reconcile 写回 */
  message_id?: number;
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

  let new_wrapper = wrapAddonData(normalizeAddonData(patched));

  if (options.emitEvents) {
    await eventEmit(AddonEvent.VARIABLE_UPDATE_ENDED, new_wrapper, old_wrapper);
    new_wrapper = wrapAddonData(normalizeAddonData(new_wrapper.addon_data));
  }

  // patch 后特异点状态机 + 可选写回 archive / 副本族
  if (options.message_id !== undefined && isAccessibleFloor(options.message_id)) {
    const archive = getAddonArchive(options.message_id);
    const reconciled = reconcileSingularityAfterPatch(base, new_wrapper.addon_data, archive);
    new_wrapper = wrapAddonData(reconciled.data);
    writeAddonArchive(options.message_id, reconciled.archive);
    const sync_warnings = await syncReplicaLaunched(reconciled.data);
    for (const w of [...reconciled.warnings, ...sync_warnings]) {
      issues.push({ kind: 'apply', message: w });
    }
  } else {
    const archive = { activeKey: null as string | null, snapshots: {} as Record<string, AddonData> };
    const reconciled = reconcileSingularityAfterPatch(base, new_wrapper.addon_data, archive);
    new_wrapper = wrapAddonData(reconciled.data);
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

function isAccessibleFloor(message_id: number): boolean {
  return message_id >= 0 && getChatMessages(message_id).length > 0;
}
