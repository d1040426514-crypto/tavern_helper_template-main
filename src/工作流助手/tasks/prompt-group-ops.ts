import type { z } from 'zod';
import { PromptGroupSchema } from './schema';

type PromptGroup = z.infer<typeof PromptGroupSchema>;

export function defaultPromptGroup(): PromptGroup {
  return { name: '', role: 'user', content: '', enabled: true };
}

export function appendPromptGroup(groups: PromptGroup[], group?: Partial<PromptGroup>): PromptGroup[] {
  const next = _.cloneDeep(groups);
  next.push(PromptGroupSchema.parse({ ...defaultPromptGroup(), ...group }));
  return next;
}

export function removePromptGroupAt(groups: PromptGroup[], index: number): PromptGroup[] {
  if (index < 0 || index >= groups.length) {
    throw new Error(`提示词段索引无效: ${index}`);
  }
  if (groups.length <= 1) {
    throw new Error('至少保留一个提示词段');
  }
  return groups.filter((_, i) => i !== index);
}

export function movePromptGroupAt(
  groups: PromptGroup[],
  index: number,
  delta: -1 | 1,
): PromptGroup[] {
  if (index < 0 || index >= groups.length) {
    throw new Error(`提示词段索引无效: ${index}`);
  }
  const target = index + delta;
  if (target < 0 || target >= groups.length) {
    throw new Error(`提示词段无法移动: 索引 ${index} 方向 ${delta}`);
  }
  const next = _.cloneDeep(groups);
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
