import type { z } from 'zod';
import { PromptGroupSchema, type PostProcessTask } from './schema';

type PromptGroup = z.infer<typeof PromptGroupSchema>;

function segmentToPromptGroup(seg: PostProcessTask['promptAutoSegments'][number]): PromptGroup {
  return PromptGroupSchema.parse({
    name: seg.name,
    role: seg.role,
    content: seg.content,
    enabled: true,
  });
}

function getInsertedAutoGroupsAtOrder(task: PostProcessTask, order: number): PromptGroup[] {
  const slots = [...(task.promptAutoSlots ?? [])]
    .filter(s => s.order === order)
    .sort((a, b) => a.id.localeCompare(b.id));
  const segments = task.promptAutoSegments ?? [];
  const result: PromptGroup[] = [];
  for (const slot of slots) {
    for (const seg of segments) {
      if (seg.slotId !== slot.id || !seg.inserted) continue;
      result.push(segmentToPromptGroup(seg));
    }
  }
  return result;
}

/** 合并手动 promptGroups 与已启用的自动段（order=k 插在 manual[k] 之前） */
export function buildEffectivePromptGroups(task: PostProcessTask): PromptGroup[] {
  const manual = task.promptGroups ?? [];
  const result: PromptGroup[] = [];
  for (let i = 0; i <= manual.length; i++) {
    result.push(...getInsertedAutoGroupsAtOrder(task, i));
    if (i < manual.length) {
      result.push(manual[i]!);
    }
  }
  return result;
}

/** 扫描任务提示词正文（手动启用段 + 已插入自动段） */
export function iterTaskPromptContents(task: PostProcessTask): string[] {
  const texts: string[] = [];
  for (const g of task.promptGroups ?? []) {
    if (g.enabled === false) continue;
    texts.push(g.content);
  }
  for (const seg of task.promptAutoSegments ?? []) {
    if (!seg.inserted) continue;
    texts.push(seg.content);
  }
  return texts;
}
