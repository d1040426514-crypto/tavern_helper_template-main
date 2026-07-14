/**
 * 通过酒馆助手公开 API 展开提示词中的宏。
 *
 * 官方 `formatAsTavernRegexedString`（destination=`prompt`）会依次：
 * 1. 应用对应作用域的酒馆正则
 * 2. `substituteParams`（SillyTavern 原生宏，如 {{user}} / {{getvar::}}）
 * 3. 遍历 MacroLike 注册表（内置 {{get/format_*_variable::}} + 其它脚本的 registerMacroLike）
 *
 * 自定义 API / generateRaw 不会经过 GENERATE_AFTER_DATA 上的 demacroOnPrompt，
 * 因此工作流提示词必须在发送前主动调用。
 *
 * @see https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/功能详情/酒馆助手宏.html
 * @see https://n0vi028.github.io/JS-Slash-Runner-Doc/guide/功能详情/其他工具函数.html
 */
export function applyTavernPromptMacros(text: string, messageId: number): string {
  if (!text?.trim()) return text ?? '';

  try {
    const lastId = getLastMessageId();
    const depth = Number.isFinite(lastId) ? Math.max(0, lastId - messageId) : undefined;
    return formatAsTavernRegexedString(text, 'world_info', 'prompt', {
      ...(depth !== undefined ? { depth } : {}),
    });
  } catch (error) {
    console.warn('[工作流助手] formatAsTavernRegexedString 失败，回退 substitudeMacros:', error);
    try {
      return substitudeMacros(text);
    } catch (fallbackError) {
      console.warn('[工作流助手] substitudeMacros 回退也失败:', fallbackError);
      return text;
    }
  }
}
