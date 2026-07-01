import { ensureAcuToastStyles } from './toast-styles';

const PROGRESS_TOAST_CLASS = 'toast acu-pp-toast acu-pp-toast--info acu-pp-progress-toast';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let progressToast: JQuery | null = null;
let stopHandler: (() => void) | null = null;
let runAborting = false;

export function isTaskProgressStopping(): boolean {
  return runAborting;
}

function bindStopButton(stopBtnId: string): void {
  setTimeout(() => {
    const $btn = $(`#${stopBtnId}`);
    if (!$btn.length) return;
    $btn.off('click.acu_pp_stop').on('click.acu_pp_stop', (e: JQuery.ClickEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (runAborting) return;
      runAborting = true;
      $btn.prop('disabled', true);
      stopHandler?.();
      hideTaskProgressToast();
    });
  }, 50);
}

function removeProgressToastsFromDom(): void {
  $('#toast-container .acu-pp-progress-toast').remove();
}

export function showTaskProgressToast(message: string, onStop: () => void): void {
  hideTaskProgressToast();
  runAborting = false;
  ensureAcuToastStyles();
  stopHandler = onStop;
  const stopBtnId = `acu-pp-stop-${Date.now()}`;
  const html = `<div class="acu-pp-toast-row"><span class="acu-pp-toast-progress-message">${escapeHtml(message)}</span><button id="${stopBtnId}" type="button" class="acu-pp-stop-btn">停止</button></div>`;
  progressToast = toastr.info(html, '', {
    timeOut: 0,
    extendedTimeOut: 0,
    tapToDismiss: false,
    escapeHtml: false,
    closeButton: false,
    progressBar: false,
    toastClass: PROGRESS_TOAST_CLASS,
  });
  bindStopButton(stopBtnId);
}

export function updateTaskProgressToast(message: string): void {
  if (runAborting || !progressToast) return;
  progressToast.find('.acu-pp-toast-progress-message').text(message);
}

export function hideTaskProgressToast(): void {
  if (progressToast) {
    try {
      toastr.clear(progressToast);
    } catch {
      /* ignore */
    }
    progressToast = null;
  }
  removeProgressToastsFromDom();
  stopHandler = null;
}
