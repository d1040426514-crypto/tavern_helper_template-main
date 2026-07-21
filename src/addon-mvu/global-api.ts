import { AddonEvent } from './events';
import {
  applyAddonUpdateFromMessage,
  ensureAddonData,
  getAddonData as getAddonDataFromStore,
  hasChatMessages,
  parseAddonMessage,
  processFloor as processFloorInternal,
  resolveMessageId,
  writeAddonData,
} from './store';
import { stripAddonHiddenFieldsForDisplay } from './display';
import { AddonData, DEFAULT_ADDON_DATA, normalizeAddonData } from './schema';
import { wrapAddonData, AddonWrapper } from './update';

type AddonMessageOption = Extract<VariableOption, { type: 'message' }>;

function resolveAddonMessageId(option: AddonMessageOption): number {
  return resolveMessageId(option.message_id);
}

export const Addon = {
  events: AddonEvent,

  getAddonData(options: AddonMessageOption): AddonWrapper {
    if (!hasChatMessages()) {
      return wrapAddonData(DEFAULT_ADDON_DATA);
    }
    const message_id = resolveAddonMessageId(options);
    const addon_data = getAddonDataFromStore(message_id) ?? DEFAULT_ADDON_DATA;
    return wrapAddonData(addon_data);
  },

  /** 供提示词/世界书使用的 addon 快照 */
  getDisplayAddonData(options: AddonMessageOption): AddonWrapper {
    if (!hasChatMessages()) {
      return wrapAddonData(DEFAULT_ADDON_DATA);
    }
    const message_id = resolveAddonMessageId(options);
    const addon_data = getAddonDataFromStore(message_id) ?? DEFAULT_ADDON_DATA;
    return wrapAddonData(normalizeAddonData(stripAddonHiddenFieldsForDisplay(addon_data)) as AddonData);
  },

  replaceAddonData(data: AddonWrapper, options: AddonMessageOption): void {
    if (!hasChatMessages()) {
      return;
    }
    const message_id = resolveAddonMessageId(options);
    writeAddonData(message_id, normalizeAddonData(data.addon_data));
  },

  parseMessage(message: string, old_data: AddonWrapper): Promise<AddonWrapper | undefined> {
    return parseAddonMessage(message, old_data.addon_data).then(updated =>
      updated === undefined ? undefined : wrapAddonData(updated),
    );
  },

  processFloor(message_id?: number | 'latest'): Promise<void> {
    const resolved = message_id === undefined ? getLastMessageId() : resolveMessageId(message_id);
    return processFloorInternal(resolved);
  },

  applyAddonUpdateFromMessage,
  ensureAddonData,
} as const;

export type { AddonData, AddonWrapper };
