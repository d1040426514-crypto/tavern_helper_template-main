import { ensureAcuToastStyles } from './toast-styles';

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

const HUD_ROOT_ID = 'acu-pp-progress-hud';

let $hudRoot: JQuery | null = null;
let stopHandler: (() => void) | null = null;
let runAborting = false;

export function isTaskProgressStopping(): boolean {
  return runAborting;
}

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

function countFinished(tasks: TaskProgressItem[]): number {
  return tasks.filter(t => t.status === 'done' || t.status === 'skipped').length;
}

function renderTaskListItem(item: TaskProgressItem): string {
  const sym = statusSymbol(item.status);
  const name = escapeHtml(item.taskName);
  const detail = item.detail
    ? ` <span class="acu-pp-progress-hud__detail">(${escapeHtml(item.detail)})</span>`
    : '';
  return `<li class="acu-pp-progress-hud__item acu-pp-progress-hud__item--${item.status}">${sym} ${name}${detail}</li>`;
}

function renderStopButton(): string {
  return '<button type="button" class="acu-pp-progress-hud__stop">停止</button>';
}

function renderHeadActions(innerHtml: string): string {
  return `<div class="acu-pp-progress-hud__actions">${innerHtml}</div>`;
}

function renderMessageHtml(message: string): string {
  const title = escapeHtml(message);
  return `<div class="acu-pp-progress-hud" role="status" aria-live="polite">
    <div class="acu-pp-progress-hud__head">
      <span class="acu-pp-progress-hud__title" title="${title}">${title}</span>
      ${renderHeadActions(renderStopButton())}
    </div>
  </div>`;
}

function renderSnapshotHtml(snapshot: TaskProgressSnapshot): string {
  const tasks = snapshot.tasks;
  const total = tasks.length;
  const finished = countFinished(tasks);
  const headline = escapeHtml(snapshot.headline);
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
  const showList = total > 0 && total <= 4;
  const running = tasks.filter(t => t.status === 'running').slice(0, 2);

  let bodyHtml = '';
  if (total > 0) {
    bodyHtml += `<div class="acu-pp-progress-hud__bar" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
  }
  if (showList) {
    bodyHtml += `<ul class="acu-pp-progress-hud__list">${tasks.map(renderTaskListItem).join('')}</ul>`;
  } else if (running.length) {
    bodyHtml += running
      .map(
        item =>
          `<div class="acu-pp-progress-hud__active acu-pp-progress-hud__item--running">${statusSymbol(item.status)} ${escapeHtml(item.taskName)}</div>`,
      )
      .join('');
  }

  const countHtml =
    total > 0 ? `<span class="acu-pp-progress-hud__count">${finished}/${total}</span>` : '';

  return `<div class="acu-pp-progress-hud acu-pp-progress-hud--snapshot" role="status" aria-live="polite">
    <div class="acu-pp-progress-hud__head">
      <span class="acu-pp-progress-hud__title" title="${headline}">${headline}</span>
      ${renderHeadActions(`${countHtml}${renderStopButton()}`)}
    </div>
    ${bodyHtml}
  </div>`;
}

function getHudRoot(): JQuery {
  if ($hudRoot?.length) return $hudRoot;
  let $root = $(`#${HUD_ROOT_ID}`);
  if (!$root.length) {
    $root = $(`<div id="${HUD_ROOT_ID}" class="acu-pp-progress-hud-root"></div>`).appendTo('body');
  }
  $hudRoot = $root;
  return $root;
}

function bindStopButton(): void {
  const $root = getHudRoot();
  $root
    .find('.acu-pp-progress-hud__stop')
    .off('click.acu_pp_stop')
    .on('click.acu_pp_stop', (e: JQuery.ClickEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (runAborting) return;
      runAborting = true;
      const $btn = $(e.currentTarget);
      $btn.prop('disabled', true).text('停止中…');
      stopHandler?.();
      setTimeout(() => hideTaskProgressToast(), 300);
    });
}

function setHudHtml(html: string): void {
  const $root = getHudRoot();
  $root.html(html).attr('aria-hidden', 'false');
  bindStopButton();
}

export function showTaskProgressToast(message: string, onStop: () => void): void {
  hideTaskProgressToast();
  runAborting = false;
  ensureAcuToastStyles();
  stopHandler = onStop;
  setHudHtml(renderMessageHtml(message));
}

export function updateTaskProgressToast(update: TaskProgressUpdate): void {
  if (runAborting || !getHudRoot().find('.acu-pp-progress-hud').length) return;
  if (typeof update === 'string') {
    setHudHtml(renderMessageHtml(update));
    return;
  }
  setHudHtml(renderSnapshotHtml(update));
}

export function hideTaskProgressToast(): void {
  if ($hudRoot?.length) {
    $hudRoot.empty().attr('aria-hidden', 'true');
  } else {
    $(`#${HUD_ROOT_ID}`).empty().attr('aria-hidden', 'true');
  }
  stopHandler = null;
}
