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

function setMemberSelected(member: PostProcessTask, selected: boolean) {
  emit('updateMember', member.id, { selected });
}

function setMemberLaunched(member: PostProcessTask, launched: boolean) {
  emit('updateMember', member.id, { launched });
}
</script>

<template>
  <div class="acu-subsection replica-scheduler">
    <h5>副本调度</h5>
    <p class="acu-notes acu-notes--sm">
      自动模式：relay 枚举决定副本数量，全部副本参与执行；选定仅用于保留楼层变量与孤儿副本。手动模式：仅「选定且启动」的副本执行 API。
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
    <div v-if="members.length" class="replica-scheduler__table">
      <div class="replica-scheduler__head" :class="{ 'replica-scheduler__head--manual': isManual }">
        <span class="replica-scheduler__col-name">副本</span>
        <span class="replica-scheduler__col-flag">选定</span>
        <span v-if="isManual" class="replica-scheduler__col-flag">启动</span>
      </div>
      <div
        v-for="member in members"
        :key="member.id"
        class="replica-scheduler__row"
        :class="{ 'replica-scheduler__row--manual': isManual }"
      >
        <span class="replica-scheduler__col-name">{{ memberLabel(member) }}</span>
        <span class="replica-scheduler__col-flag">
          <AcuToggle
            :model-value="member.replicaFamilySelected === true"
            aria-label="选定"
            @update:model-value="setMemberSelected(member, $event)"
          />
        </span>
        <span v-if="isManual" class="replica-scheduler__col-flag">
          <AcuToggle
            :model-value="member.replicaFamilyLaunched === true"
            aria-label="启动"
            @update:model-value="setMemberLaunched(member, $event)"
          />
        </span>
      </div>
    </div>
    <p v-else class="acu-notes acu-notes--sm">暂无副本；启用任务后将在运行时按 relay 同步。</p>
  </div>
</template>
