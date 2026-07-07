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

export function nextSortOrderInSlot(segments: PromptAutoSegment[], slotId: string): number {
  let max = -1;
  for (const seg of segments) {
    if (seg.slotId !== slotId) continue;
    const order = seg.sortOrder ?? 0;
    if (order > max) max = order;
  }
  return max + 1;
}

export function sortSegmentsInSlot(segments: PromptAutoSegment[], slotId: string): PromptAutoSegment[] {
  return segments
    .map((seg, index) => ({ seg, index }))
    .filter(({ seg }) => seg.slotId === slotId)
    .sort((a, b) => {
      const orderDiff = (a.seg.sortOrder ?? 0) - (b.seg.sortOrder ?? 0);
      return orderDiff !== 0 ? orderDiff : a.index - b.index;
    })
    .map(({ seg }) => seg);
}

function renumberSortOrderInSlot(segments: PromptAutoSegment[], slotId: string): PromptAutoSegment[] {
  const orderedIds = sortSegmentsInSlot(segments, slotId).map(s => s.id);
  const orderById = new Map(orderedIds.map((id, i) => [id, i]));
  return segments.map(seg => {
    if (seg.slotId !== slotId) return seg;
    return { ...seg, sortOrder: orderById.get(seg.id) ?? seg.sortOrder ?? 0 };
  });
}

export function defaultPromptAutoSegment(slotId: string, sortOrder = 0): PromptAutoSegment {
  return PromptAutoSegmentSchema.parse({
    id: newPromptAutoSegmentId(),
    slotId,
    name: '未命名段',
    role: 'system',
    content: '',
    inserted: false,
    sortOrder,
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
  const sortOrder = partial?.sortOrder ?? nextSortOrderInSlot(next, slotId);
  next.push(
    PromptAutoSegmentSchema.parse({
      ...defaultPromptAutoSegment(slotId, sortOrder),
      ...partial,
      slotId,
      sortOrder,
    }),
  );
  return next;
}

export function removePromptAutoSegmentAt(segments: PromptAutoSegment[], index: number): PromptAutoSegment[] {
  if (index < 0 || index >= segments.length) {
    throw new Error(`自动段索引无效: ${index}`);
  }
  const removed = segments[index]!;
  const next = segments.filter((_, i) => i !== index);
  return renumberSortOrderInSlot(next, removed.slotId);
}

export function movePromptAutoSegmentInSlot(
  segments: PromptAutoSegment[],
  slotId: string,
  segId: string,
  delta: -1 | 1,
): PromptAutoSegment[] {
  const inSlot = sortSegmentsInSlot(segments, slotId);
  const index = inSlot.findIndex(s => s.id === segId);
  if (index < 0) {
    throw new Error(`自动段不存在: ${segId}`);
  }
  const target = index + delta;
  if (target < 0 || target >= inSlot.length) {
    throw new Error(`自动段无法移动: 索引 ${index} 方向 ${delta}`);
  }
  const next = _.cloneDeep(segments);
  const ordered = sortSegmentsInSlot(next, slotId);
  const [item] = ordered.splice(index, 1);
  ordered.splice(target, 0, item);
  const orderById = new Map(ordered.map((seg, i) => [seg.id, i]));
  return next.map(seg => {
    if (seg.slotId !== slotId) return seg;
    return { ...seg, sortOrder: orderById.get(seg.id) ?? seg.sortOrder ?? 0 };
  });
}

export function countInsertedPromptAutoSegments(segments: PromptAutoSegment[]): number {
  return segments.filter(s => s.inserted).length;
}
