import _ from 'lodash';
import { intervalToMs, parseGameTimeToMs } from './parse-game-time';
import { extractLastTagContent } from './utils';
import type { PostProcessTask, ScheduleStateEntry, ScriptSettings, TaskSchedule } from './schema';

export function resolveScheduleMode(schedule: TaskSchedule): 'round' | 'time' {
  if (schedule.mode) return schedule.mode;
  return schedule.timeInterval?.enabled ? 'time' : 'round';
}

/** 任一启用任务为「按游戏时间 + 最新消息楼层变量」时，后处理需等 MVU stat_data 更新后再执行 */
export function needsMvuDeferredRun(settings: ScriptSettings): boolean {
  return settings.tasks.some(t => {
    if (!t.enabled) return false;
    const s = t.schedule;
    if (!s || resolveScheduleMode(s) !== 'time') return false;
    const src = s.timeInterval?.timeSource;
    return src?.type === 'variable' && src.variableType === 'message';
  });
}

export interface ScheduleContext {
  currentRound: number;
  currentAiText: string;
  currentPairText: string;
  settings: ScriptSettings;
  bypassSchedule: boolean;
}

export function countAssistantRounds(): number {
  try {
    const lastId = getLastMessageId();
    if (lastId < 0) return 0;
    const msgs = getChatMessages(`0-${lastId}`);
    return msgs.filter(m => m.role === 'assistant').length;
  } catch {
    return 0;
  }
}

function resolveTimeRaw(task: PostProcessTask, ctx: ScheduleContext): { raw: string | null; fail: boolean } {
  const ti = task.schedule?.timeInterval;
  if (!ti) return { raw: null, fail: false };
  const src = ti.timeSource;
  if (src.type === 'message_tag') {
    const text = src.scope === 'current_pair' ? ctx.currentPairText : ctx.currentAiText;
    for (const tag of src.tagNames) {
      const v = extractLastTagContent(text, tag);
      if (v) return { raw: v, fail: false };
    }
    return { raw: null, fail: true };
  }
  try {
    const opt =
      src.variableType === 'message'
        ? { type: 'message' as const, message_id: 'latest' as const }
        : { type: src.variableType };
    const vars = getVariables(opt);
    const val = _.get(vars, src.path);
    if (val == null || val === '') return { raw: null, fail: true };
    return { raw: String(val).trim(), fail: false };
  } catch {
    return { raw: null, fail: true };
  }
}

export function shouldRunTask(
  task: PostProcessTask,
  state: ScheduleStateEntry | undefined,
  ctx: ScheduleContext,
): { run: boolean; reason?: string } {
  if (ctx.bypassSchedule) return { run: true };
  const schedule = task.schedule;
  if (!schedule) return { run: true };

  const mode = resolveScheduleMode(schedule);

  if (mode === 'round') {
    const roundInterval = schedule.roundInterval ?? 0;
    if (roundInterval >= 2) {
      const last = state?.lastRunRound ?? 0;
      if (ctx.currentRound - last < roundInterval) {
        return { run: false, reason: `回合间隔未到 (${ctx.currentRound - last}/${roundInterval})` };
      }
    }
    return { run: true };
  }

  const ti = schedule.timeInterval;
  if (!ti) return { run: true };

  const { raw, fail } = resolveTimeRaw(task, ctx);
  if (fail) {
    if (ti.onParseFail === 'skip') return { run: false, reason: '游戏时间解析失败' };
    if (ti.onParseFail === 'wall_clock') {
      const now = Date.now();
      const last = state?.lastRunAt ?? 0;
      if (now - last < intervalToMs(ti.value, ti.unit)) {
        return { run: false, reason: '时间间隔未到(墙钟)' };
      }
      return { run: true };
    }
    return { run: true };
  }
  const nowMs =
    ti.onParseFail === 'wall_clock' && !raw ? Date.now() : parseGameTimeToMs(raw!, ti.parseFormat);
  if (nowMs == null) {
    if (ti.onParseFail === 'skip') return { run: false, reason: '游戏时间格式无法解析' };
    return { run: true };
  }
  const lastMs = state?.lastRunGameTimeMs;
  if (lastMs != null && nowMs - lastMs < intervalToMs(ti.value, ti.unit)) {
    return { run: false, reason: '游戏时间间隔未到' };
  }

  return { run: true };
}

export function updateScheduleStateAfterRun(
  settings: ScriptSettings,
  task: PostProcessTask,
  ctx: ScheduleContext,
): void {
  const id = task.id;
  if (!settings.scheduleState[id]) {
    settings.scheduleState[id] = { lastRunRound: 0 };
  }
  const entry = settings.scheduleState[id];
  entry.lastRunRound = ctx.currentRound;
  entry.lastRunAt = Date.now();

  const schedule = task.schedule;
  if (schedule && resolveScheduleMode(schedule) === 'time') {
    const ti = schedule.timeInterval;
    if (ti) {
      const { raw } = resolveTimeRaw(task, ctx);
      if (raw) {
        entry.lastRunGameTimeRaw = raw;
        const ms = parseGameTimeToMs(raw, ti.parseFormat);
        if (ms != null) entry.lastRunGameTimeMs = ms;
      } else if (ti.onParseFail === 'wall_clock') {
        entry.lastRunGameTimeMs = Date.now();
      }
    }
  }
}
