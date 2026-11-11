import { z } from 'zod';

export const DEFAULT_ASSISTANT_BEAUTIFY_LIMIT = 2;

export const SettingsSchema = z.object({
  assistantBeautifyLimit: z.number().int().min(1).max(50).default(DEFAULT_ASSISTANT_BEAUTIFY_LIMIT),
});

export type BeautifySettings = z.infer<typeof SettingsSchema>;

function readRaw(): Record<string, unknown> {
  try {
    return (getVariables({ type: 'script', script_id: getScriptId() }) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export function loadSettings(): BeautifySettings {
  const parsed = SettingsSchema.safeParse(readRaw());
  if (parsed.success) return parsed.data;
  return SettingsSchema.parse({});
}

export function saveSettings(partial: Partial<BeautifySettings>): BeautifySettings {
  const next = SettingsSchema.parse({ ...loadSettings(), ...partial });
  insertOrAssignVariables(
    { assistantBeautifyLimit: next.assistantBeautifyLimit },
    { type: 'script', script_id: getScriptId() },
  );
  return next;
}

export function getAssistantBeautifyLimit(): number {
  return loadSettings().assistantBeautifyLimit;
}
