/** 对后处理文本应用酒馆宏、助手宏与提示词模板 EJS（在脚本占位符替换之后调用） */

function applyTavernMacros(text: string): string {
  if (!text) return text;
  try {
    return substitudeMacros(text);
  } catch (error) {
    console.warn('[工作流助手] 宏替换失败:', error);
    return text;
  }
}

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
 * 处理顺序：酒馆/助手宏 → EJS → 再次宏替换（捕获 EJS 输出中的 {{宏}}）
 */
export async function processTemplateText(text: string, messageId: number): Promise<string> {
  if (!text?.trim()) return text ?? '';

  let result = applyTavernMacros(text);
  result = await applyEjsTemplate(result, messageId);
  result = applyTavernMacros(result);
  return result;
}
