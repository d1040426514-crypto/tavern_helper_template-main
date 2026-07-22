export const ADDON_UI_KEY = 'addon_ui';

export type AddonUiTheme = 'light' | 'dark';

export type AddonUiState = {
  位面交汇: boolean;
  theme?: AddonUiTheme;
};

export const DEFAULT_ADDON_UI: AddonUiState = {
  位面交汇: false,
  theme: 'light',
};

function isAccessibleFloor(message_id: number): boolean {
  return message_id >= 0 && getChatMessages(message_id).length > 0;
}

export function normalizeAddonUi(raw?: unknown): AddonUiState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return _.cloneDeep(DEFAULT_ADDON_UI);
  }
  const obj = raw as Record<string, unknown>;
  const theme = obj.theme === 'dark' || obj.theme === 'light' ? obj.theme : 'light';
  return {
    位面交汇: obj.位面交汇 === true,
    theme,
  };
}

export function getAddonUi(message_id: number): AddonUiState {
  if (!isAccessibleFloor(message_id)) {
    return _.cloneDeep(DEFAULT_ADDON_UI);
  }
  const raw = _.get(getVariables({ type: 'message', message_id }), ADDON_UI_KEY);
  return normalizeAddonUi(raw);
}

export function writeAddonUi(message_id: number, ui: AddonUiState): void {
  if (!isAccessibleFloor(message_id)) {
    return;
  }
  const normalized = normalizeAddonUi(ui);
  updateVariablesWith(
    variables => {
      _.set(variables, ADDON_UI_KEY, normalized);
      return variables;
    },
    { type: 'message', message_id },
  );
}

export function inheritAddonUi(message_id: number): AddonUiState {
  const previous = message_id > 0 ? getAddonUi(message_id - 1) : undefined;
  const inherited = normalizeAddonUi(previous);
  writeAddonUi(message_id, inherited);
  return inherited;
}

/** 楼层已有 ui 则直接返回，否则从上一楼继承 */
export function ensureAddonUi(message_id: number): AddonUiState {
  if (!isAccessibleFloor(message_id)) {
    return _.cloneDeep(DEFAULT_ADDON_UI);
  }
  const raw = _.get(getVariables({ type: 'message', message_id }), ADDON_UI_KEY);
  if (raw !== undefined && raw !== null) {
    return normalizeAddonUi(raw);
  }
  return inheritAddonUi(message_id);
}
