import {
  applyTavernPromptMacros,
  type ApplyTavernPromptMacrosOptions,
} from './helper-macros';

/** 对后处理文本应用酒馆宏、助手宏与提示词模板 EJS（在脚本占位符替换之后调用） */

let templateMemo: Map<string, Promise<string>> | null = null;

export function beginTemplateProcessMemo(): void {
  templateMemo = new Map();
}

export function endTemplateProcessMemo(): void {
  templateMemo = null;
}

export function hasEjsTemplateTags(text: string): boolean {
  return text.includes('<%');
}

function templateMemoKey(
  text: string,
  messageId: number,
  options?: ApplyTavernPromptMacrosOptions,
): string {
  return `${messageId}\0${options?.source ?? ''}\0${options?.role ?? ''}\0${text}`;
}

type EjsEvalFn = (code: string, context?: Record<string, unknown>) => Promise<string>;

type EjsTemplateHost = {
  evaltemplate?: EjsEvalFn;
  evalTemplate?: EjsEvalFn;
  prepareContext?: (additional: Record<string, unknown>, messageId: number) => Promise<Record<string, unknown>>;
};

function asEjsHost(value: unknown): EjsTemplateHost | null {
  if (!value || typeof value !== 'object') return null;
  return value as EjsTemplateHost;
}

function evalFnOf(host: EjsTemplateHost | null): EjsEvalFn | null {
  if (!host) return null;
  if (typeof host.evaltemplate === 'function') return host.evaltemplate.bind(host);
  if (typeof host.evalTemplate === 'function') return host.evalTemplate.bind(host);
  return null;
}

/** 脚本窗口创建时只抄一次父页面接口；调用时再读父页面上的活对象。 */
function resolveEjsTemplateHost(): EjsTemplateHost | null {
  const local = typeof EjsTemplate === 'undefined' ? null : asEjsHost(EjsTemplate);
  if (evalFnOf(local)) return local;
  if (typeof window === 'undefined' || !window.parent || window.parent === window) return null;
  const parentHost = asEjsHost((window.parent as Window & { EjsTemplate?: unknown }).EjsTemplate);
  if (evalFnOf(parentHost)) return parentHost;
  return null;
}

async function applyEjsTemplate(text: string, messageId: number): Promise<string> {
  if (!text) return text;
  const host = resolveEjsTemplateHost();
  const evalFn = evalFnOf(host);
  if (!host || !evalFn) return text;

  try {
    const prepareFn = typeof host.prepareContext === 'function' ? host.prepareContext.bind(host) : null;
    const context = prepareFn ? await prepareFn({}, messageId) : {};
    return await evalFn(text, context);
  } catch (error) {
    console.warn('[工作流助手] EJS 模板处理失败:', error);
    return text;
  }
}

async function processTemplateTextUncached(
  text: string,
  messageId: number,
  options?: ApplyTavernPromptMacrosOptions,
): Promise<string> {
  let result = applyTavernPromptMacros(text, messageId, options);
  if (hasEjsTemplateTags(text) || hasEjsTemplateTags(result)) {
    result = await applyEjsTemplate(result, messageId);
  }
  result = applyTavernPromptMacros(result, messageId, options);
  return result;
}

/**
 * 处理顺序：
 * formatAsTavernRegexedString（或禁用时仅 ST 宏）→ EJS → 再跑一轮宏
 * 无 `<%` 时跳过 EJS（第二轮宏仍跑，避免改变非幂等正则的既有行为）。
 */
export async function processTemplateText(
  text: string,
  messageId: number,
  options?: ApplyTavernPromptMacrosOptions,
): Promise<string> {
  if (!text?.trim()) return text ?? '';

  const memo = templateMemo;
  if (!memo) {
    return processTemplateTextUncached(text, messageId, options);
  }

  const key = templateMemoKey(text, messageId, options);
  const hit = memo.get(key);
  if (hit) return hit;
  const pending = processTemplateTextUncached(text, messageId, options);
  memo.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    memo.delete(key);
    throw error;
  }
}
