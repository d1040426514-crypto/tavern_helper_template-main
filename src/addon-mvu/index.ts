import { reloadOnChatChange } from '@util/script';

import { Addon } from './global-api';
import { applyAddonUpdateFromMessage, backfillChatAddonData, processFloor } from './store';

export { randomMinorTitle, refreshNarrativeGuidanceDetails } from './narrative-guidance';
export { ADDON_HIDDEN_FROM_PROMPT_KEYS, stripAddonHiddenFieldsForDisplay } from './display';
export { ADDON_KEY, AddonSchema, DEFAULT_ADDON_DATA, normalizeAddonData } from './schema';
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

export const REPROCESS_ADDON_BUTTON_NAME = '重新处理addon变量';

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

  console.info('[addon-mvu] 已加载: addon_data 继承、<AddonJSONPatch> 解析与 Addon 全局 API 已启用');
}

$(() => {
  errorCatched(initAddonMvu)();
});
