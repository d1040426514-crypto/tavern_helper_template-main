<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ReplicaCleanupCandidateGroup } from '../tasks/replica-family-cleanup';

const props = defineProps<{
  groups: ReplicaCleanupCandidateGroup[];
}>();

const emit = defineEmits<{
  confirm: [keepByRoot: Record<string, string[]>];
  cancel: [];
}>();

const selected = ref<Record<string, Set<string>>>({});

function initSelection(): void {
  const next: Record<string, Set<string>> = {};
  for (const group of props.groups) {
    const set = new Set<string>();
    for (const m of group.members) {
      if (m.defaultSelected) set.add(m.attrValue);
    }
    next[group.rootId] = set;
  }
  selected.value = next;
}

initSelection();

const hasGroups = computed(() => props.groups.length > 0);

function isSelected(rootId: string, attrValue: string): boolean {
  return selected.value[rootId]?.has(attrValue) ?? false;
}

function toggleMember(rootId: string, attrValue: string): void {
  const set = new Set(selected.value[rootId] ?? []);
  if (set.has(attrValue)) set.delete(attrValue);
  else set.add(attrValue);
  selected.value = { ...selected.value, [rootId]: set };
}

function onConfirm(): void {
  const keepByRoot: Record<string, string[]> = {};
  for (const group of props.groups) {
    keepByRoot[group.rootId] = [...(selected.value[group.rootId] ?? [])];
  }
  emit('confirm', keepByRoot);
}

function onCancel(): void {
  emit('cancel');
}
</script>

<template>
  <div class="acu-overlay acu-pp-root replica-cleanup-dialog">
    <div class="acu-window replica-cleanup-dialog__window">
      <div class="acu-window-header">
        <div class="acu-window-title">
          <span class="acu-window-title-mark">清</span>
          <span>副本族清理</span>
        </div>
        <div class="acu-window-header-end">
          <button class="acu-btn acu-window-close" type="button" title="跳过本次" @click="onCancel">×</button>
        </div>
      </div>
      <div class="acu-window-body replica-cleanup-dialog__body">
        <p class="acu-notes acu-notes--sm replica-cleanup-dialog__intro">
          请选择需要继续保留的副本。未选中的副本及其楼层变量 key 将被移除。
        </p>
        <div v-if="hasGroups" class="replica-cleanup-dialog__groups">
          <div v-for="group in groups" :key="group.rootId" class="replica-cleanup-dialog__group">
            <h5 class="replica-cleanup-dialog__group-title">{{ group.rootName }}</h5>
            <div class="replica-scheduler__chip-list">
              <button
                v-for="member in group.members"
                :key="member.memberId"
                type="button"
                class="acu-auto-segment-chip"
                :class="{
                  'acu-auto-segment-chip--on': isSelected(group.rootId, member.attrValue),
                  'acu-auto-segment-chip--off': !isSelected(group.rootId, member.attrValue),
                }"
                :title="`执行 ${member.runCount} 次，活跃度 ${member.activityScore.toFixed(2)}`"
                @click="toggleMember(group.rootId, member.attrValue)"
              >
                {{ member.attrValue }}
              </button>
            </div>
          </div>
        </div>
        <p v-else class="acu-notes">当前没有可清理的副本族成员。</p>
      </div>
      <div class="acu-window-footer">
        <div class="acu-footer-actions">
          <button class="acu-btn" type="button" @click="onCancel">跳过本次</button>
          <button class="acu-btn primary" type="button" @click="onConfirm">确认保留</button>
        </div>
      </div>
    </div>
  </div>
</template>
