import { getThemeById, type ThemeTokens } from './theme';
import { loadSettings } from '../settings';
import { setPermanentStyle } from './permanent-style';

const TOAST_STYLE_ID = 'acu-pp-toast-style';

function buildToastCss(tokens: ThemeTokens): string {
  const t = tokens;
  return `
    #toast-container .acu-pp-toast.toast {
      font-family: ${t.fontUi} !important;
      font-weight: 500 !important;
      font-size: 14px !important;
      letter-spacing: 0.2px;
      background: ${t.bg1} !important;
      color: ${t.text1} !important;
      border: 1px solid ${t.border} !important;
      border-radius: ${t.radiusSm} !important;
      box-shadow: ${t.shadow} !important;
      padding: 12px 14px 12px 50px !important;
      width: min(420px, calc(100vw - 24px)) !important;
      opacity: 1 !important;
      position: relative !important;
      overflow: hidden !important;
      border-left: 3px solid ${t.text2} !important;
      background-image: none !important;
    }
    #toast-container .acu-pp-toast.toast .toast-title,
    #toast-container .acu-pp-toast.toast .toast-message {
      background: transparent !important;
      color: ${t.text1} !important;
      text-shadow: none !important;
      font-family: ${t.fontUi};
    }
    #toast-container .acu-pp-toast.toast .toast-title {
      font-weight: 650 !important;
      letter-spacing: 0.4px;
      margin-bottom: 4px !important;
    }
    #toast-container .acu-pp-toast.toast .toast-message {
      line-height: 1.55;
      font-weight: 500 !important;
      font-size: 13px !important;
    }
    #toast-container .acu-pp-toast.toast::before {
      content: "知" !important;
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      width: 26px;
      height: 26px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 12px;
      font-family: ${t.fontUi};
      color: ${t.onAccent};
      background: ${t.text2};
    }
    #toast-container .acu-pp-toast.acu-pp-toast--success { border-left-color: ${t.success} !important; }
    #toast-container .acu-pp-toast.acu-pp-toast--success::before { content: "达" !important; background: ${t.success}; }
    #toast-container .acu-pp-toast.acu-pp-toast--info { border-left-color: ${t.text2} !important; }
    #toast-container .acu-pp-toast.acu-pp-toast--info::before { content: "知" !important; background: ${t.text2}; }
    #toast-container .acu-pp-toast.acu-pp-toast--warning { border-left-color: ${t.warning} !important; }
    #toast-container .acu-pp-toast.acu-pp-toast--warning::before { content: "警" !important; background: ${t.warning}; }
    #toast-container .acu-pp-toast.acu-pp-toast--error { border-left-color: ${t.danger} !important; }
    #toast-container .acu-pp-toast.acu-pp-toast--error::before { content: "误" !important; background: ${t.danger}; }
    #toast-container .acu-pp-toast .acu-pp-stop-btn {
      padding: 4px 12px !important;
      border-radius: ${t.radiusSm} !important;
      border: 1px solid ${t.accent} !important;
      background: transparent !important;
      color: ${t.text1} !important;
      font-weight: 600 !important;
      font-family: ${t.fontUi} !important;
      cursor: pointer !important;
      font-size: 0.85em;
      box-shadow: none !important;
      flex-shrink: 0;
    }
    #toast-container .acu-pp-toast .acu-pp-stop-btn:hover:not(:disabled) {
      background: ${t.accent} !important;
      color: ${t.onAccent} !important;
    }
    #toast-container .acu-pp-toast .acu-pp-stop-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed !important;
    }
    #toast-container .acu-pp-toast .acu-pp-toast-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    #toast-container .acu-pp-toast .acu-pp-toast-row .acu-pp-toast-progress-message {
      flex: 1;
      min-width: 0;
      line-height: 1.45;
      color: ${t.text1};
    }
    #toast-container .acu-pp-toast .acu-pp-progress-headline {
      font-weight: 600;
      margin-bottom: 6px;
      color: ${t.text1};
    }
    #toast-container .acu-pp-toast .acu-pp-progress-task-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    #toast-container .acu-pp-toast .acu-pp-progress-task-item {
      font-size: 12px;
      line-height: 1.5;
      color: ${t.text2};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #toast-container .acu-pp-toast .acu-pp-progress-task-item--running {
      color: ${t.text1};
      font-weight: 600;
    }
    #toast-container .acu-pp-toast .acu-pp-progress-task-item--done {
      color: ${t.success};
    }
    #toast-container .acu-pp-toast .acu-pp-progress-task-item--failed {
      color: ${t.danger};
    }
    #toast-container .acu-pp-toast .acu-pp-progress-task-detail {
      font-weight: 400;
      color: ${t.text3};
    }
    @media (max-width: 520px) {
      #toast-container .acu-pp-toast.toast {
        width: calc(100vw - 16px) !important;
        max-width: calc(100vw - 16px) !important;
        padding: 10px 12px 10px 42px !important;
      }
      #toast-container .acu-pp-toast.toast::before {
        left: 9px;
        width: 22px;
        height: 22px;
        font-size: 11px;
      }
      #toast-container .acu-pp-toast .acu-pp-toast-row {
        flex-wrap: wrap;
        gap: 8px;
      }
      #toast-container .acu-pp-toast .acu-pp-stop-btn {
        min-height: 36px;
        flex: 1 1 auto;
      }
    }
  `;
}

/** 注入独立 toast 样式（head 直接子 style，不被 teleportStyle 克隆） */
export function ensureAcuToastStyles(themeId?: string): void {
  document.getElementById('acu-pp-permanent-style-host')?.remove();
  const theme = getThemeById(themeId ?? loadSettings().uiThemeId);
  setPermanentStyle(TOAST_STYLE_ID, buildToastCss(theme.tokens));
}

export function refreshVisibleAcuToasts(themeId?: string): void {
  ensureAcuToastStyles(themeId);
}
