import { ensureAcuToastStyles } from './toast-styles';

const PROGRESS_TOAST_CLASS = 'toast acu-pp-toast acu-pp-toast--info acu-pp-progress-toast';

export type TaskProgressStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface TaskProgressItem {
  taskId: string;
  taskName: string;
  status: TaskProgressStatus;
  detail?: string;
}

export interface TaskProgressSnapshot {
  headline: string;
  stageNo?: number;
  tasks: TaskProgressItem[];
}

export type TaskProgressUpdate = string | TaskProgressSnapshot;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusSymbol(status: TaskProgressStatus): string {
  switch (status) {
    case 'done':
      return '✓';
    case 'running':
      return '⟳';
    case 'skipped':
      return '⊘';
    case 'failed':
      return '✗';
    default:
      return '○';
  }
}

function renderSnapshotHtml(snapshot: TaskProgressSnapshot): string {
  const headline = escapeHtml(snapshot.headline);
  const items = snapshot.tasks
    .map(item => {
      const sym = statusSymbol(item.status);
      const name = escapeHtml(item.taskName);
      const detail = item.detail ? ` <span class="acu-pp-progress-task-detail">(${escapeHtml(item.detail)})</span>` : '';
      return `<li class="acu-pp-progress-task-item acu-pp-progress-task-item--${item.status}">${sym} ${name}${detail}</li>`;
    })
    .join('');
  return `<div class="acu-pp-progress-headline">${headline}</div><ul class="acu-pp-progress-task-list">${items}</ul>`;
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
      $btn.prop('disabled', true).text('停止中…');
      stopHandler?.();
      setTimeout(() => hideTaskProgressToast(), 300);
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
  const html = `<div class="acu-pp-toast-row"><div class="acu-pp-toast-progress-message">${escapeHtml(message)}</div><button id="${stopBtnId}" type="button" class="acu-pp-stop-btn">停止</button></div>`;
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

export function updateTaskProgressToast(update: TaskProgressUpdate): void {
  if (runAborting || !progressToast) return;
  const $message = progressToast.find('.acu-pp-toast-progress-message');
  if (typeof update === 'string') {
    $message.html(escapeHtml(update));
    return;
  }
  $message.html(renderSnapshotHtml(update));
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
