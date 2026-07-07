import { getThemeById, type ThemeTokens } from './theme';
import { loadSettings } from '../settings';
import { setPermanentStyle } from './permanent-style';

const TOAST_STYLE_ID = 'acu-pp-toast-style';
const PROGRESS_HUD_STYLE_ID = 'acu-pp-progress-hud-style';

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
    }
  `;
}

function buildProgressHudCss(tokens: ThemeTokens): string {
  const t = tokens;
  return `
    #acu-pp-progress-hud.acu-pp-progress-hud-root {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      right: calc(env(safe-area-inset-right, 0px) + 12px);
      z-index: 10030;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      width: max-content;
      max-width: 280px;
      pointer-events: none;
    }
    #acu-pp-progress-hud.acu-pp-progress-hud-root[aria-hidden="true"],
    #acu-pp-progress-hud.acu-pp-progress-hud-root:empty {
      display: none;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud {
      font-family: ${t.fontUi};
      font-size: 13px;
      font-weight: 500;
      color: ${t.text1};
      background: ${t.bg1};
      border: 1px solid ${t.border};
      border-radius: ${t.radiusSm};
      box-shadow: ${t.shadow};
      padding: 6px 8px;
      pointer-events: auto;
      text-align: right;
      width: max-content;
      max-width: 280px;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__head {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: nowrap;
      gap: 0;
      min-width: 0;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__title {
      flex: 0 1 auto;
      max-width: 12em;
      min-width: 0;
      font-weight: 600;
      font-size: 13px;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: ${t.text1};
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__actions {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      gap: 0;
      margin-left: 4px;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__count {
      font-size: 12px;
      font-weight: 600;
      color: ${t.text2};
      font-variant-numeric: tabular-nums;
      line-height: 1.25;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__count + .acu-pp-progress-hud__stop {
      margin-left: 4px;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__stop {
      flex-shrink: 0;
      padding: 2px 8px;
      border-radius: ${t.radiusSm};
      border: 1px solid ${t.accent};
      background: transparent;
      color: ${t.text1};
      font-weight: 600;
      font-family: ${t.fontUi};
      font-size: 12px;
      cursor: pointer;
      line-height: 1.25;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__stop:hover:not(:disabled) {
      background: ${t.accent};
      color: ${t.onAccent};
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__stop:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__bar {
      margin-top: 4px;
      height: 2px;
      border-radius: 999px;
      background: ${t.border};
      overflow: hidden;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__bar > i {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: ${t.accent};
      transition: width 0.2s ease;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__list {
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
      max-height: 96px;
      overflow-y: auto;
      text-align: right;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__item {
      font-size: 12px;
      line-height: 1.25;
      color: ${t.text2};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: right;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__item--running,
    #acu-pp-progress-hud .acu-pp-progress-hud__active.acu-pp-progress-hud__item--running {
      color: ${t.text1};
      font-weight: 600;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__item--done {
      color: ${t.success};
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__item--failed {
      color: ${t.danger};
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__detail {
      font-weight: 400;
      color: ${t.text3};
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__active {
      margin-top: 4px;
      font-size: 12px;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: ${t.text1};
      text-align: right;
    }
    #acu-pp-progress-hud .acu-pp-progress-hud__active + .acu-pp-progress-hud__active {
      margin-top: 2px;
    }
    @media (max-width: 640px) {
      #acu-pp-progress-hud.acu-pp-progress-hud-root {
        top: calc(env(safe-area-inset-top, 0px) + 8px);
        right: calc(env(safe-area-inset-right, 0px) + 8px);
        max-width: min(240px, calc(100vw - 16px));
      }
      #acu-pp-progress-hud .acu-pp-progress-hud {
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 0;
        border-radius: 0;
        font-size: 12px;
        text-shadow: 0 0 1px rgba(0, 0, 0, 0.35);
      }
      #acu-pp-progress-hud .acu-pp-progress-hud__title {
        font-size: 12px;
        max-width: 10em;
      }
      #acu-pp-progress-hud .acu-pp-progress-hud__bar {
        display: none;
      }
      #acu-pp-progress-hud .acu-pp-progress-hud__stop {
        min-height: auto;
        padding: 0;
        border: none;
        background: transparent;
        color: ${t.accent};
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      #acu-pp-progress-hud .acu-pp-progress-hud__stop:hover:not(:disabled) {
        background: transparent;
        color: ${t.accent};
        opacity: 0.85;
      }
      #acu-pp-progress-hud .acu-pp-progress-hud__item,
      #acu-pp-progress-hud .acu-pp-progress-hud__active {
        font-size: 11px;
        line-height: 1.2;
      }
      #acu-pp-progress-hud .acu-pp-progress-hud__list {
        margin-top: 2px;
      }
    }
  `;
}

/** 注入独立 toast 样式（head 直接子 style，不被 teleportStyle 克隆） */
export function ensureAcuToastStyles(themeId?: string): void {
  document.getElementById('acu-pp-permanent-style-host')?.remove();
  const theme = getThemeById(themeId ?? loadSettings().uiThemeId);
  setPermanentStyle(TOAST_STYLE_ID, buildToastCss(theme.tokens));
  setPermanentStyle(PROGRESS_HUD_STYLE_ID, buildProgressHudCss(theme.tokens));
}

export function refreshVisibleAcuToasts(themeId?: string): void {
  ensureAcuToastStyles(themeId);
}
