<script setup lang="ts">
import { computed } from 'vue';
import type { PostProcessTask, ReplicaFamilyScheduleMode } from '../tasks/schema';
import AcuToggle from './AcuToggle.vue';

const props = defineProps<{
  root: PostProcessTask;
  members: PostProcessTask[];
}>();

const emit = defineEmits<{
  updateMode: [mode: ReplicaFamilyScheduleMode];
  updateMember: [memberId: string, patch: { selected?: boolean; launched?: boolean }];
}>();

const scheduleMode = computed({
  get: (): ReplicaFamilyScheduleMode => props.root.replicaFamilyScheduleMode ?? 'auto',
  set: (v: ReplicaFamilyScheduleMode) => emit('updateMode', v),
});

const isManual = computed(() => scheduleMode.value === 'manual');

function memberLabel(member: PostProcessTask): string {
  return member.replicaFamilyAttrValue?.trim() || member.name;
}

function isMemberSelected(member: PostProcessTask): boolean {
  return member.replicaFamilySelected === true;
}

function toggleMemberSelected(member: PostProcessTask): void {
  emit('updateMember', member.id, { selected: !isMemberSelected(member) });
}

function setMemberLaunched(member: PostProcessTask, launched: boolean): void {
  emit('updateMember', member.id, { launched });
}
</script>

<template>
  <div class="acu-subsection replica-scheduler">
    <h5>副本调度</h5>
    <p class="acu-notes acu-notes--sm">
      自动模式：relay 枚举决定副本数量，全部副本参与执行；点选副本按钮表示「选定」，用于保留楼层变量与孤儿副本。手动模式：仅「选定且启动」的副本执行 API。
    </p>
    <div class="replica-scheduler__mode">
      <label class="replica-scheduler__mode-option">
        <input v-model="scheduleMode" type="radio" value="auto" />
        <span>自动调度</span>
      </label>
      <label class="replica-scheduler__mode-option">
        <input v-model="scheduleMode" type="radio" value="manual" />
        <span>手动调度</span>
      </label>
    </div>
    <div v-if="members.length" class="replica-scheduler__chip-list">
      <div
        v-for="member in members"
        :key="member.id"
        class="replica-scheduler__member"
        :class="{ 'replica-scheduler__member--manual': isManual }"
      >
        <button
          type="button"
          class="acu-auto-segment-chip"
          :class="{
            'acu-auto-segment-chip--on': isMemberSelected(member),
            'acu-auto-segment-chip--off': !isMemberSelected(member),
          }"
          :title="isMemberSelected(member) ? '点击取消选定' : '点击选定'"
          :aria-pressed="isMemberSelected(member)"
          @click="toggleMemberSelected(member)"
        >
          {{ memberLabel(member) }}
        </button>
        <div v-if="isManual" class="replica-scheduler__launch">
          <span class="replica-scheduler__launch-label">启动</span>
          <AcuToggle
            :model-value="member.replicaFamilyLaunched === true"
            aria-label="启动"
            @update:model-value="setMemberLaunched(member, $event)"
          />
        </div>
      </div>
    </div>
    <p v-else class="acu-notes acu-notes--sm">暂无副本；启用任务后将在运行时按 relay 同步。</p>
  </div>
</template>
