import { acuToast } from '../ui/toast';

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
  const baseline = raw as InjectVarBaseline;
  return baseline;
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

function captureBaseline(messageId: number, needMvu: boolean, needAddon: boolean): InjectVarBaseline {
  const baseline: InjectVarBaseline = {};
  if (needMvu) {
    baseline.mvu = _.cloneDeep(Mvu.getMvuData({ type: 'message', message_id: messageId }));
  }
  if (needAddon) {
    baseline.addon = _.cloneDeep(Addon.getAddonData({ type: 'message', message_id: messageId }).addon_data);
  }
  return baseline;
}

async function restoreBaseline(messageId: number, baseline: InjectVarBaseline, needMvu: boolean, needAddon: boolean): Promise<void> {
  if (needMvu && baseline.mvu) {
    await Mvu.replaceMvuData(_.cloneDeep(baseline.mvu), { type: 'message', message_id: messageId });
  }
  if (needAddon && baseline.addon) {
    Addon.replaceAddonData({ addon_data: _.cloneDeep(baseline.addon) }, { type: 'message', message_id: messageId });
  }
}

async function applyMvuInjectPatch(messageId: number, aiBlock: string): Promise<void> {
  const ready = await ensureMvuReady();
  if (!ready) {
    console.warn('[工作流助手] MVU 未就绪，已跳过注入块 <JSONPatch> 解析');
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
    console.warn('[工作流助手] Addon 未就绪，已跳过注入块 <AddonJSONPatch> 解析');
    return;
  }

  await Addon.applyAddonUpdateFromMessage(aiBlock, messageId);
}

export async function applyInjectVariableUpdates(
  messageId: number,
  aiBlock: string,
  options?: { isRerun?: boolean },
): Promise<void> {
  let needMvu = hasMvuJsonPatch(aiBlock);
  let needAddon = hasAddonJsonPatch(aiBlock);
  if (!needMvu && !needAddon) return;

  try {
    // 必须先 waitGlobalInitialized，再访问 Mvu/Addon（含 baseline 读写）
    if (needMvu && !(await ensureMvuReady())) {
      console.warn('[工作流助手] MVU 未就绪，已跳过注入块 <JSONPatch> 解析');
      needMvu = false;
    }
    if (needAddon && !(await ensureAddonReady())) {
      console.warn('[工作流助手] Addon 未就绪，已跳过注入块 <AddonJSONPatch> 解析');
      needAddon = false;
    }
    if (!needMvu && !needAddon) return;

    let baseline = readBaseline(messageId);

    if (options?.isRerun && baseline) {
      await restoreBaseline(messageId, baseline, needMvu, needAddon);
    } else if (!baseline) {
      baseline = captureBaseline(messageId, needMvu, needAddon);
      await persistBaseline(messageId, baseline);
    }

    if (needMvu) {
      await applyMvuInjectPatch(messageId, aiBlock);
    }
    if (needAddon) {
      await applyAddonInjectPatch(messageId, aiBlock);
    }
  } catch (e) {
    console.error('[工作流助手] 注入块变量更新失败:', e);
    acuToast('error', `注入块变量更新失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}
