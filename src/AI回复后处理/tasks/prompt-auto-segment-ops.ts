import type { z } from 'zod';
import { newTaskId } from './task-clone';
import { PromptAutoSegmentSchema, PromptAutoSlotSchema } from './schema';

type PromptAutoSlot = z.infer<typeof PromptAutoSlotSchema>;
type PromptAutoSegment = z.infer<typeof PromptAutoSegmentSchema>;

export function newPromptAutoSlotId(): string {
  return `auto-slot-${newTaskId().replace(/^task-/, '')}`;
}

export function newPromptAutoSegmentId(): string {
  return `auto-seg-${newTaskId().replace(/^task-/, '')}`;
}

export function defaultPromptAutoSlot(order = 0): PromptAutoSlot {
  return PromptAutoSlotSchema.parse({
    id: newPromptAutoSlotId(),
    name: '未命名插入位',
    order,
  });
}

export function defaultPromptAutoSegment(slotId: string): PromptAutoSegment {
  return PromptAutoSegmentSchema.parse({
    id: newPromptAutoSegmentId(),
    slotId,
    name: '未命名段',
    role: 'system',
    content: '',
    inserted: false,
  });
}

export function appendPromptAutoSlot(slots: PromptAutoSlot[], order?: number): PromptAutoSlot[] {
  const next = _.cloneDeep(slots);
  next.push(defaultPromptAutoSlot(order ?? 0));
  return next;
}

export function removePromptAutoSlotAt(
  slots: PromptAutoSlot[],
  segments: PromptAutoSegment[],
  index: number,
): { slots: PromptAutoSlot[]; segments: PromptAutoSegment[] } {
  if (index < 0 || index >= slots.length) {
    throw new Error(`插入位索引无效: ${index}`);
  }
  const removedId = slots[index]!.id;
  return {
    slots: slots.filter((_, i) => i !== index),
    segments: segments.filter(s => s.slotId !== removedId),
  };
}

export function appendPromptAutoSegment(
  segments: PromptAutoSegment[],
  slotId: string,
  partial?: Partial<PromptAutoSegment>,
): PromptAutoSegment[] {
  const next = _.cloneDeep(segments);
  next.push(PromptAutoSegmentSchema.parse({ ...defaultPromptAutoSegment(slotId), ...partial }));
  return next;
}

export function removePromptAutoSegmentAt(segments: PromptAutoSegment[], index: number): PromptAutoSegment[] {
  if (index < 0 || index >= segments.length) {
    throw new Error(`自动段索引无效: ${index}`);
  }
  return segments.filter((_, i) => i !== index);
}

export function countInsertedPromptAutoSegments(segments: PromptAutoSegment[]): number {
  return segments.filter(s => s.inserted).length;
}
