import { getAssistantBeautifyLimit, saveSettings } from './settings';

const PANEL_ID = 'gametxt-settings-panel';
const STYLE_ID = 'gametxt-settings-style';

export type SettingsPanelOptions = {
  onSaved?: () => void;
};

let escHandler: ((event: KeyboardEvent) => void) | null = null;

export function closeSettingsPanel(): void {
  try {
    const doc = window.parent.document;
    doc.getElementById(PANEL_ID)?.remove();
    if (escHandler) {
      doc.removeEventListener('keydown', escHandler, true);
      escHandler = null;
    }
  } catch {
    /* 跨域或父页不可用 */
  }
}

export function openSettingsPanel(options: SettingsPanelOptions = {}): void {
  let doc: Document;
  try {
    doc = window.parent.document;
  } catch {
    console.warn('[正文美化] 无法打开设置浮层');
    return;
  }

  const existing = doc.getElementById(PANEL_ID);
  if (existing) {
    const input = existing.querySelector<HTMLInputElement>('input[type="number"]');
    input?.focus();
    input?.select();
    return;
  }

  ensureStyle(doc);

  const panel = doc.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'gametxt-settings-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '正文美化设置');

  const title = doc.createElement('div');
  title.className = 'gametxt-settings-title';
  title.textContent = '正文美化设置';

  const row = doc.createElement('label');
  row.className = 'gametxt-settings-row';
  const label = doc.createElement('span');
  label.textContent = '渲染最近 assistant 条数';
  const input = doc.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '50';
  input.step = '1';
  input.value = String(getAssistantBeautifyLimit());
  row.append(label, input);

  const hint = doc.createElement('div');
  hint.className = 'gametxt-settings-hint';
  hint.textContent = '范围 1–50，仅美化最新若干条角色消息';

  const error = doc.createElement('div');
  error.className = 'gametxt-settings-error';
  error.hidden = true;

  const actions = doc.createElement('div');
  actions.className = 'gametxt-settings-actions';
  const saveBtn = doc.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'gametxt-settings-save';
  saveBtn.textContent = '保存';
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'gametxt-settings-close';
  closeBtn.textContent = '关闭';
  actions.append(saveBtn, closeBtn);

  panel.append(title, row, hint, error, actions);
  doc.body.append(panel);
  input.focus();
  input.select();

  const showError = (message: string) => {
    error.textContent = message;
    error.hidden = !message;
  };

  const onSave = () => {
    const raw = Number(input.value);
    if (!Number.isInteger(raw) || raw < 1 || raw > 50) {
      showError('请输入 1–50 的整数');
      input.focus();
      return;
    }
    showError('');
    saveSettings({ assistantBeautifyLimit: raw });
    closeSettingsPanel();
    options.onSaved?.();
  };

  saveBtn.addEventListener('click', onSave);
  closeBtn.addEventListener('click', () => closeSettingsPanel());
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSave();
    }
  });

  escHandler = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (!doc.getElementById(PANEL_ID)) return;
    event.stopPropagation();
    closeSettingsPanel();
  };
  doc.addEventListener('keydown', escHandler, true);
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.gametxt-settings-panel {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 10000;
  width: min(320px, 92vw);
  padding: 14px 16px 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #f7f4ef;
  color: #2a2622;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  font: 13px/1.45 system-ui, "Segoe UI", sans-serif;
}
.gametxt-settings-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 10px;
}
.gametxt-settings-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gametxt-settings-row input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  background: #fff;
  color: inherit;
}
.gametxt-settings-hint {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.7;
}
.gametxt-settings-error {
  margin-top: 6px;
  font-size: 12px;
  color: #b42318;
}
.gametxt-settings-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}
.gametxt-settings-actions button {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.16);
  background: #fff;
  cursor: pointer;
  color: inherit;
}
.gametxt-settings-save {
  background: #2a2622 !important;
  color: #f7f4ef !important;
  border-color: #2a2622 !important;
}
`;
  doc.head.append(style);
}
