/** 在宏/EJS 处理前屏蔽脚本占位符，避免被模板引擎改写或清空 */

const SCRIPT_PLACEHOLDER_RE = /\$(?:[1-8]|U|C)\b|\{\{[\w:]+\}\}/g;

export function shieldScriptPlaceholders(text: string): { text: string; tokens: Map<string, string> } {
  const tokens = new Map<string, string>();
  let index = 0;
  const shielded = String(text ?? '').replace(SCRIPT_PLACEHOLDER_RE, match => {
    const token = `\uE000${index++}\uE001`;
    tokens.set(token, match);
    return token;
  });
  return { text: shielded, tokens };
}

export function unshieldScriptPlaceholders(text: string, tokens: Map<string, string>): string {
  let result = String(text ?? '');
  for (const [token, original] of tokens) {
    result = result.split(token).join(original);
  }
  return result;
}
