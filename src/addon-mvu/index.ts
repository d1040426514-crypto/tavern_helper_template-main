import { waitUntil } from 'async-wait-until';
import { reloadOnChatChange } from '@util/script';

import { destroyAddonConsoleHost, injectAddonConsoleFab } from './fab';
import { Addon } from './global-api';
import { backfillChatAddonData, processFloor } from './store';

export { randomMinorTitle, refreshNarrativeGuidanceDetails } from './narrative-guidance';
export { ADDON_HIDDEN_FROM_PROMPT_KEYS, stripAddonHiddenFieldsForDisplay } from './display';
export { ADDON_KEY, AddonSchema, DEFAULT_ADDON_DATA, normalizeAddonData } from './schema';
export { coerceAddonData, LOOSE_NUMERIC_STRING_KEYS, STRICT_BOOLEAN_KEYS } from './coerce';
export type { AddonData } from './schema';
export { AddonEvent } from './events';
export { applyMvuLikePatch, extractAddonJsonPatchOps, extractAddonJsonPatchOpsWithIssues, parseJsonPatchOps } from './patch';
export type { MvuJsonPatchOp, PatchIssue } from './patch';
export { updateAddonFromMessage, wrapAddonData } from './update';
export type { AddonUpdateResult, AddonUpdateOptions, AddonWrapper } from './update';
export { Addon } from './global-api';
export {
  applyAddonUpdateFromMessage,
  backfillChatAddonData,
  ensureAddonData,
  getAddonData,
  inheritAddon,
  parseAddonMessage,
  processFloor,
  reprocessAllAddonFloors,
  hasChatMessages,
  isAccessibleMessageFloor,
  resolveMessageId,
  writeAddonData,
} from './store';
export { getAddonArchive, writeAddonArchive, normalizeAddonArchive, ADDON_ARCHIVE_KEY } from './archive';
export { getAddonUi, writeAddonUi, normalizeAddonUi, ADDON_UI_KEY } from './ui-state';
export {
  activateSingularity,
  deactivateSingularity,
  reconcileSingularityAfterPatch,
  setWorldDescent,
  setWorldParallel,
  createWorld,
  renameWorld,
} from './control';
export { injectAddonConsoleFab, openAddonConsole, closeAddonConsole, toggleAddonConsole } from './fab';

export const REPROCESS_ADDON_BUTTON_NAME = '重新处理addon变量';

function parentHasSillyTavern(): boolean {
  try {
    return !!_.get(window.parent, 'SillyTavern');
  } catch {
    return false;
  }
}

function exposeAddonOnParent(): void {
  try {
    (window.parent as Window & { Addon?: typeof Addon }).Addon = Addon;
  } catch {
    /* cross-origin */
  }
}

function initAddonMvu(): void {
  backfillChatAddonData();

  eventMakeLast(tavern_events.MESSAGE_SENT, (message_id: number) => {
    errorCatched(() => processFloor(message_id))();
  });

  eventMakeLast(tavern_events.MESSAGE_RECEIVED, (message_id: number) => {
    errorCatched(() => processFloor(message_id))();
  });

  eventOn(tavern_events.CHAT_CHANGED, () => {
    errorCatched(backfillChatAddonData)();
  });

  appendInexistentScriptButtons([{ name: REPROCESS_ADDON_BUTTON_NAME, visible: true }]);
  eventOn(getButtonEvent(REPROCESS_ADDON_BUTTON_NAME), () => {
    errorCatched(() => processFloor(getLastMessageId()))();
  });

  reloadOnChatChange();
  initializeGlobal('Addon', Addon);
  exposeAddonOnParent();
  errorCatched(injectAddonConsoleFab)();

  $(window).on('pagehide', () => {
    errorCatched(destroyAddonConsoleHost)();
  });

  console.info('[addon-mvu] 已加载: addon_data / archive / ui、控制台悬浮球与 Addon API 已启用');
}

$(async () => {
  try {
    await waitUntil(() => parentHasSillyTavern(), { timeout: 60000 });
  } catch {
    // parent.SillyTavern 超时未就绪时仍尝试初始化; reloadOnChatChange 会做防御处理
  }
  errorCatched(initAddonMvu)();
});
