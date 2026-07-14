import { applyTavernPromptMacros } from './helper-macros';

/** 对后处理文本应用酒馆宏、助手宏与提示词模板 EJS（在脚本占位符替换之后调用） */

async function applyEjsTemplate(text: string, messageId: number): Promise<string> {
  if (!text || typeof EjsTemplate === 'undefined') return text;

  const evalFn =
    typeof EjsTemplate.evaltemplate === 'function'
      ? EjsTemplate.evaltemplate.bind(EjsTemplate)
      : typeof (EjsTemplate as { evalTemplate?: typeof EjsTemplate.evaltemplate }).evalTemplate === 'function'
        ? (EjsTemplate as { evalTemplate: typeof EjsTemplate.evaltemplate }).evalTemplate.bind(EjsTemplate)
        : null;
  if (!evalFn) return text;

  try {
    const prepareFn =
      typeof EjsTemplate.prepareContext === 'function'
        ? EjsTemplate.prepareContext.bind(EjsTemplate)
        : null;
    const context = prepareFn ? await prepareFn({}, messageId) : {};
    return await evalFn(text, context);
  } catch (error) {
    console.warn('[工作流助手] EJS 模板处理失败:', error);
    return text;
  }
}

/**
 * 处理顺序：
 * formatAsTavernRegexedString（正则 + ST 宏 + 全部 MacroLike）→ EJS → 再跑一轮宏
 */
export async function processTemplateText(text: string, messageId: number): Promise<string> {
  if (!text?.trim()) return text ?? '';

  let result = applyTavernPromptMacros(text, messageId);
  result = await applyEjsTemplate(result, messageId);
  result = applyTavernPromptMacros(result, messageId);
  return result;
}
