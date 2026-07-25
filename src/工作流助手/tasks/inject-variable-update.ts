import { acuToast } from '../ui/toast';
import {
  collectStageVariableUpdateSources,
  hasUpdateVariableTag,
  type StageVariableUpdateResult,
} from './inject-variable-update-logic';

export {
  collectStageVariableUpdateSources,
  hasUpdateVariableTag,
  type StageVariableUpdateResult,
} from './inject-variable-update-logic';

const BASELINE_KEY = '_post_process_inject_var_baseline';

const JSON_PATCH_RE = /<JSONPatch>\s*[\s\S]*?\s*<\/JSONPatch>/i;
const ADDON_JSON_PATCH_RE = /<AddonJSONPatch>\s*[\s\S]*?\s*<\/AddonJSONPatch>/i;

type InjectVarBaseline = {
  mvu?: Mvu.MvuData;
  addon?: Addon.AddonData;
};

function hasMvuJsonPatch(aiBlock: string): boolean {
  return JSON_PATCH_RE.test(aiBlock);
}

function hasAddonJsonPatch(aiBlock: string): boolean {
  return ADDON_JSON_PATCH_RE.test(aiBlock);
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

async function ensureMvuReady(): Promise<boolean> {
  try {
    await waitGlobalInitialized('Mvu');
    return typeof Mvu !== 'undefined';
  } catch {
    return false;
  }
}

async function ensureAddonReady(): Promise<boolean> {
  try {
    await waitGlobalInitialized('Addon');
    return typeof Addon !== 'undefined';
  } catch {
    return false;
  }
}

async function ensureBaselineSides(
  messageId: number,
  needMvu: boolean,
  needAddon: boolean,
): Promise<void> {
  let baseline = readBaseline(messageId);
  const next: InjectVarBaseline = baseline ? { ...baseline } : {};
  let dirty = !baseline;

  if (needMvu && !next.mvu) {
    next.mvu = _.cloneDeep(Mvu.getMvuData({ type: 'message', message_id: messageId }));
    dirty = true;
  }
  if (needAddon && !next.addon) {
    next.addon = _.cloneDeep(Addon.getAddonData({ type: 'message', message_id: messageId }).addon_data);
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
): Promise<void> {
  if (needMvu && baseline.mvu) {
    await Mvu.replaceMvuData(_.cloneDeep(baseline.mvu), { type: 'message', message_id: messageId });
  }
  if (needAddon && baseline.addon) {
    Addon.replaceAddonData({ addon_data: _.cloneDeep(baseline.addon) }, { type: 'message', message_id: messageId });
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
      await restoreBaseline(messageId, baseline, true, false);
    }
    if (needAddon && !(await ensureAddonReady())) {
      console.warn('[工作流助手] Addon 未就绪，重跑时无法还原 inject baseline（Addon）');
    } else if (needAddon) {
      await restoreBaseline(messageId, baseline, false, true);
    }
  } catch (e) {
    console.error('[工作流助手] 重跑还原 inject baseline 失败:', e);
    acuToast('error', `重跑还原变量基线失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function applyMvuInjectPatch(messageId: number, aiBlock: string): Promise<void> {
  const ready = await ensureMvuReady();
  if (!ready) {
    console.warn('[工作流助手] MVU 未就绪，已跳过 <JSONPatch> 解析');
    return;
  }

  const oldMvu = Mvu.getMvuData({ type: 'message', message_id: messageId });
  const newMvu = await Mvu.parseMessage(aiBlock, oldMvu);
  if (!newMvu || _.isEqual(newMvu, oldMvu)) return;
  await Mvu.replaceMvuData(newMvu, { type: 'message', message_id: messageId });
}

async function applyAddonInjectPatch(messageId: number, aiBlock: string): Promise<void> {
  const ready = await ensureAddonReady();
  if (!ready) {
    console.warn('[工作流助手] Addon 未就绪，已跳过 <AddonJSONPatch> 解析');
    return;
  }

  await Addon.applyAddonUpdateFromMessage(aiBlock, messageId);
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
    if (needAddon && !(await ensureAddonReady())) {
      console.warn('[工作流助手] Addon 未就绪，已跳过 <AddonJSONPatch> 解析');
      needAddon = false;
    }
    if (!needMvu && !needAddon) return;

    await ensureBaselineSides(messageId, needMvu, needAddon);

    if (needMvu) {
      await applyMvuInjectPatch(messageId, aiBlock);
    }
    if (needAddon) {
      await applyAddonInjectPatch(messageId, aiBlock);
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
