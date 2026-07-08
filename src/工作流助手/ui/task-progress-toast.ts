import { ensureAcuToastStyles } from './toast-styles';
import {
  COMPLETION_HOLD_MS,
  LEAVE_ANIMATION_MS,
  applyProgressSnapshot,
  collectCompletingTaskIds,
  createProgressDisplayState,
  displayItemClassName,
  displayStatusSymbol,
  markDisplayItemLeaving,
  orderedDisplayItems,
  removeDisplayItem,
  resetProgressDisplayState,
  type ProgressDisplayItem,
  type ProgressDisplayState,
  type TaskProgressItem,
  type TaskProgressSnapshot,
  type TaskProgressStatus,
} from './task-progress-display';

export type { TaskProgressItem, TaskProgressSnapshot, TaskProgressStatus };

export type TaskProgressUpdate = string | TaskProgressSnapshot;

const HUD_ROOT_ID = 'acu-pp-progress-hud';

let $hudRoot: JQuery | null = null;
let stopHandler: (() => void) | null = null;
let runAborting = false;
let displayState: ProgressDisplayState = createProgressDisplayState();
let lastSnapshot: TaskProgressSnapshot | null = null;
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

function countFinished(tasks: TaskProgressItem[]): number {
  return tasks.filter(t => t.status === 'done' || t.status === 'skipped').length;
}

function clearRemovalTimers(): void {
  for (const timer of removalTimers.values()) {
    clearTimeout(timer);
  }
  removalTimers.clear();
}

function clearRemovalTimer(taskId: string): void {
  const holdKey = `${taskId}:hold`;
  const leaveKey = `${taskId}:leave`;
  for (const key of [taskId, holdKey, leaveKey]) {
    const timer = removalTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      removalTimers.delete(key);
    }
  }
}

function scheduleItemRemoval(taskId: string): void {
  clearRemovalTimer(taskId);
  const holdTimer = setTimeout(() => {
    removalTimers.delete(`${taskId}:hold`);
    displayState = markDisplayItemLeaving(displayState, taskId);
    if (lastSnapshot) {
      setHudHtml(renderSnapshotHtml(lastSnapshot));
    }
    const leaveTimer = setTimeout(() => {
      removalTimers.delete(`${taskId}:leave`);
      displayState = removeDisplayItem(displayState, taskId);
      if (lastSnapshot) {
        setHudHtml(renderSnapshotHtml(lastSnapshot));
      }
    }, LEAVE_ANIMATION_MS);
    removalTimers.set(`${taskId}:leave`, leaveTimer);
  }, COMPLETION_HOLD_MS);
  removalTimers.set(`${taskId}:hold`, holdTimer);
}

function syncDisplayState(snapshot: TaskProgressSnapshot): void {
  const prev = displayState;
  displayState = applyProgressSnapshot(prev, snapshot);
  for (const taskId of collectCompletingTaskIds(prev, displayState)) {
    scheduleItemRemoval(taskId);
  }
}

function renderTaskListItem(item: ProgressDisplayItem): string {
  const sym = displayStatusSymbol(item);
  const name = escapeHtml(item.taskName);
  const detail = item.detail
    ? ` <span class="acu-pp-progress-hud__detail">(${escapeHtml(item.detail)})</span>`
    : '';
  const className = displayItemClassName(item);
  return `<li class="${className}">${sym} ${name}${detail}</li>`;
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
  const displayItems = orderedDisplayItems(displayState, snapshot);

  let bodyHtml = '';
  if (total > 0) {
    bodyHtml += `<div class="acu-pp-progress-hud__bar" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
  }
  if (displayItems.length) {
    bodyHtml += `<ul class="acu-pp-progress-hud__list">${displayItems.map(renderTaskListItem).join('')}</ul>`;
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
  displayState = resetProgressDisplayState();
  lastSnapshot = null;
  setHudHtml(renderMessageHtml(message));
}

export function updateTaskProgressToast(update: TaskProgressUpdate): void {
  if (runAborting || !getHudRoot().find('.acu-pp-progress-hud').length) return;
  if (typeof update === 'string') {
    lastSnapshot = null;
    setHudHtml(renderMessageHtml(update));
    return;
  }
  lastSnapshot = update;
  syncDisplayState(update);
  setHudHtml(renderSnapshotHtml(update));
}

export function hideTaskProgressToast(): void {
  clearRemovalTimers();
  displayState = resetProgressDisplayState();
  lastSnapshot = null;
  if ($hudRoot?.length) {
    $hudRoot.empty().attr('aria-hidden', 'true');
  } else {
    $(`#${HUD_ROOT_ID}`).empty().attr('aria-hidden', 'true');
  }
  stopHandler = null;
}
