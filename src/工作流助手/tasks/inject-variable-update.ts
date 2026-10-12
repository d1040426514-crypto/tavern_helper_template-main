import { acuToast } from '../ui/toast';
import {
  collectStageVariableUpdateSources,
  hasUpdateVariableTag,
  omitMvuBaselineExtras,
  type StageVariableUpdateResult,
} from './inject-variable-update-logic';
import { hasXmlTagBlock, neutralizeOrphanXmlOpens } from '@util/xml-tag-blocks';
import { resolveAddonApi, invokeClearAddonPatchLog, type ResolvedAddonApi } from './resolve-addon-api';

export {
  collectStageVariableUpdateSources,
  hasUpdateVariableTag,
  omitMvuBaselineExtras,
  type StageVariableUpdateResult,
} from './inject-variable-update-logic';

export {
  resolveAddonApi,
  resolveAddonApiFromScopes,
  isAddonApiShape,
  invokeClearAddonPatchLog,
} from './resolve-addon-api';

const BASELINE_KEY = '_post_process_inject_var_baseline';

const PATCH_TAG_NAMES = ['JSONPatch', 'AddonJSONPatch'] as const;

type InjectVarBaseline = {
  mvu?: Mvu.MvuData;
  addon?: Addon.AddonData;
};

function hasMvuJsonPatch(aiBlock: string): boolean {
  return hasXmlTagBlock(aiBlock, 'JSONPatch');
}

function hasAddonJsonPatch(aiBlock: string): boolean {
  return hasXmlTagBlock(aiBlock, 'AddonJSONPatch');
}

function sanitizePatchTagsForApply(aiBlock: string): string {
  return neutralizeOrphanXmlOpens(aiBlock, [...PATCH_TAG_NAMES]);
}

function readBaseline(messageId: number): InjectVarBaseline | undefined {
  const raw = (getChatMessages(messageId)[0]?.data as Record<string, unknown> | undefined)?.[BASELINE_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as InjectVarBaseline;
}

async function persistBaseline(messageId: number, baseline: InjectVarBaseline): Promise<void> {
  const msg = getChatMessages(messageId)[0];
  if (!msg) return;
  await setChatMessages(
    [
      {
        message_id: messageId,
        data: {
          ...(msg.data ?? {}),
          [BASELINE_KEY]: _.cloneDeep(baseline),
        },
      },
    ],
    { refresh: 'none' },
  );
}

/** waitGlobalInitialized 在目标未加载时永不 resolve；MVU 必须带超时 */
const MVU_READY_WAIT_MS = 1500;

async function ensureMvuReady(): Promise<boolean> {
  if (typeof Mvu !== 'undefined') return true;
  try {
    await Promise.race([
      waitGlobalInitialized('Mvu'),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Mvu wait timeout')), MVU_READY_WAIT_MS);
      }),
    ]);
    return typeof Mvu !== 'undefined';
  } catch {
    return false;
  }
}

/** 同步探测；禁止 waitGlobalInitialized('Addon') */
function ensureAddonReady(): ResolvedAddonApi | null {
  return resolveAddonApi();
}

function cloneMvuBaseline(messageId: number): Mvu.MvuData | undefined {
  const cloned = omitMvuBaselineExtras(
    _.cloneDeep(Mvu.getMvuData({ type: 'message', message_id: messageId })) as Record<string, unknown>,
  );
  const stat = cloned.stat_data;
  if (!stat || typeof stat !== 'object') return undefined;
  return cloned as Mvu.MvuData;
}

function floorHasObjectVar(messageId: number, key: string): boolean {
  try {
    const vars = getVariables({ type: 'message', message_id: messageId }) ?? {};
    const value = (vars as Record<string, unknown>)[key];
    return !!value && typeof value === 'object';
  } catch {
    return false;
  }
}

/**
 * 工作流改写之前拍 MVU / addon。没有 stat_data 或 addon_data 的侧不写入，
 * 也不要写成空对象。已拍过的楼（含两侧都缺席的空基线）不再在补丁应用时补拍。
 */
export async function captureInjectVarBaselineNow(messageId: number): Promise<void> {
  const next: InjectVarBaseline = {};
  if (typeof Mvu !== 'undefined' && floorHasObjectVar(messageId, 'stat_data')) {
    try {
      const mvu = cloneMvuBaseline(messageId);
      if (mvu) next.mvu = mvu;
    } catch (e) {
      console.warn('[工作流助手] 拍摄 MVU 基线失败:', e);
    }
  }
  const addonApi = ensureAddonReady();
  if (addonApi && floorHasObjectVar(messageId, 'addon_data')) {
    try {
      next.addon = _.cloneDeep(addonApi.getAddonData({ type: 'message', message_id: messageId }).addon_data);
    } catch (e) {
      console.warn('[工作流助手] 拍摄 Addon 基线失败:', e);
    }
  }
  await persistBaseline(messageId, next);
}

async function ensureBaselineSides(
  messageId: number,
  needMvu: boolean,
  needAddon: boolean,
  addonApi: ResolvedAddonApi | null,
): Promise<void> {
  let baseline = readBaseline(messageId);
  if (baseline) return;
  const next: InjectVarBaseline = {};
  let dirty = !baseline;

  if (needMvu && !next.mvu) {
    const mvu = cloneMvuBaseline(messageId);
    if (mvu) {
      next.mvu = mvu;
      dirty = true;
    }
  }
  if (needAddon && addonApi && !next.addon) {
    next.addon = _.cloneDeep(addonApi.getAddonData({ type: 'message', message_id: messageId }).addon_data);
    dirty = true;
  }

  if (dirty) {
    await persistBaseline(messageId, next);
  }
}

async function restoreBaseline(
  messageId: number,
  baseline: InjectVarBaseline,
  needMvu: boolean,
  needAddon: boolean,
  addonApi: ResolvedAddonApi | null,
): Promise<void> {
  if (needMvu && baseline.mvu) {
    await Mvu.replaceMvuData(_.cloneDeep(baseline.mvu), { type: 'message', message_id: messageId });
  }
  if (needAddon && baseline.addon && addonApi) {
    addonApi.replaceAddonData({ addon_data: _.cloneDeep(baseline.addon) }, { type: 'message', message_id: messageId });
  }
}

/**
 * 重跑整轮前：若本楼曾 capture 过 baseline，先退回再跑各阶段 apply，避免补丁叠加。
 */
export async function restoreInjectVarBaselineForRerun(messageId: number): Promise<void> {
  const baseline = readBaseline(messageId);
  if (!baseline?.mvu && !baseline?.addon) return;

  try {
    const needMvu = !!baseline.mvu;
    const needAddon = !!baseline.addon;
    if (needMvu && !(await ensureMvuReady())) {
      console.warn('[工作流助手] MVU 未就绪，重跑时无法还原 inject baseline（MVU）');
    } else if (needMvu) {
      await restoreBaseline(messageId, baseline, true, false, null);
    }
    const addonApi = needAddon ? ensureAddonReady() : null;
    if (needAddon && !addonApi) {
      console.warn('[工作流助手] Addon 未就绪，重跑时无法还原 inject baseline（Addon）');
    } else if (needAddon && addonApi) {
      await restoreBaseline(messageId, baseline, false, true, addonApi);
    }
  } catch (e) {
    console.error('[工作流助手] 重跑还原 inject baseline 失败:', e);
    acuToast('error', `重跑还原变量基线失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 每一轮工作流开始时清空 addon 变更日志，避免同楼重跑/新一轮把上一轮 ops 粘进合并日志。
 * 同轮内多阶段仍由 applyAddonUpdateFromMessage 的 mergeIntoLastLog 合并。
 * 无 Addon 时立即跳过（零等待）。
 */
export async function clearAddonPatchLogForWorkflowRound(): Promise<void> {
  try {
    invokeClearAddonPatchLog(ensureAddonReady());
  } catch (e) {
    console.warn('[工作流助手] 清空 Addon 变更日志失败:', e);
  }
}

async function applyMvuInjectPatch(messageId: number, aiBlock: string): Promise<void> {
  const ready = await ensureMvuReady();
  if (!ready) {
    console.warn('[工作流助手] MVU 未就绪，已跳过 <JSONPatch> 解析');
    return;
  }

  const sanitized = sanitizePatchTagsForApply(aiBlock);
  const oldMvu = Mvu.getMvuData({ type: 'message', message_id: messageId });
  const newMvu = await Mvu.parseMessage(sanitized, oldMvu);
  if (!newMvu || _.isEqual(newMvu, oldMvu)) return;
  await Mvu.replaceMvuData(newMvu, { type: 'message', message_id: messageId });
}

async function applyAddonInjectPatch(
  messageId: number,
  aiBlock: string,
  addonApi: ResolvedAddonApi,
): Promise<void> {
  await addonApi.applyAddonUpdateFromMessage(sanitizePatchTagsForApply(aiBlock), messageId);
}

/**
 * 对一段任务输出（通常含 `<UpdateVariable>`）写楼层 MVU / addon。
 * 首次真正 apply 前 capture baseline；不在此处做 rerun restore（见 restoreInjectVarBaselineForRerun）。
 */
export async function applyVariableUpdatesFromText(messageId: number, aiBlock: string): Promise<void> {
  if (!hasUpdateVariableTag(aiBlock)) return;

  let needMvu = hasMvuJsonPatch(aiBlock);
  let needAddon = hasAddonJsonPatch(aiBlock);
  if (!needMvu && !needAddon) return;

  try {
    if (needMvu && !(await ensureMvuReady())) {
      console.warn('[工作流助手] MVU 未就绪，已跳过 <JSONPatch> 解析');
      needMvu = false;
    }
    const addonApi = needAddon ? ensureAddonReady() : null;
    if (needAddon && !addonApi) {
      console.warn('[工作流助手] Addon 未就绪，已跳过 <AddonJSONPatch> 解析');
      needAddon = false;
    }
    if (!needMvu && !needAddon) return;

    await ensureBaselineSides(messageId, needMvu, needAddon, addonApi);

    if (needMvu) {
      await applyMvuInjectPatch(messageId, aiBlock);
    }
    if (needAddon && addonApi) {
      await applyAddonInjectPatch(messageId, aiBlock, addonApi);
    }
  } catch (e) {
    console.error('[工作流助手] 阶段变量更新失败:', e);
    acuToast('error', `阶段变量更新失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 阶段并行结束且 relay 合并后：按任务结果顺序串行 apply */
export async function applyVariableUpdatesAfterStage(
  messageId: number,
  stageResults: StageVariableUpdateResult[],
): Promise<void> {
  const sources = collectStageVariableUpdateSources(stageResults);
  for (const src of sources) {
    await applyVariableUpdatesFromText(messageId, src);
  }
}
