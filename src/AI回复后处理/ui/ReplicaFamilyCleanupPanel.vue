<script setup lang="ts">
import { computed } from 'vue';
import type { ScriptSettings } from '../tasks/schema';
import AcuToggle from './AcuToggle.vue';
import AcuHelpPanel from './AcuHelpPanel.vue';
import AcuHelpIconBtn from './AcuHelpIconBtn.vue';

const settings = defineModel<ScriptSettings>('settings', { required: true });

const helpOpen = defineModel<boolean>('helpOpen', { default: false });

const cleanup = computed(() => {
  if (!settings.value.replicaFamilyCleanup) {
    settings.value.replicaFamilyCleanup = {
      enabled: false,
      cycleRounds: 10,
      activityRatio: 0.5,
      mode: 'manual',
      roundsSinceCleanup: 0,
      cycleRunCounts: {},
      lastManualKeepByRoot: {},
      lastCleanupRound: 0,
    };
  }
  return settings.value.replicaFamilyCleanup;
});
</script>

<template>
  <div class="acu-section replica-cleanup-panel">
    <div class="acu-heading-with-help">
      <h4>副本族清理</h4>
      <AcuHelpIconBtn
        v-model:open="helpOpen"
        panel-id="replica-cleanup-help"
        label="副本族清理说明"
      />
    </div>
    <AcuHelpPanel v-model:open="helpOpen" id="replica-cleanup-help" label="副本族清理说明">
      <p class="acu-notes acu-notes--sm" style="margin-top: 0">
        每隔 N 轮对话触发一次清理。活跃性判断：当前周期内副本执行次数 ÷ N ≥ R 视为活跃。
      </p>
      <p class="acu-notes acu-notes--sm" style="margin-bottom: 0">
        自动清理：静默移除未达保留条件的副本及对应楼层变量 key。手动清理：在后处理全部完成且酒馆渲染后弹出选择窗。
        默认保留：手动调度中已启动的副本、活跃副本、上次清理时选择保留的副本。
      </p>
    </AcuHelpPanel>
    <div class="acu-row acu-row--inline" style="margin-top: 8px">
      <AcuToggle v-model="cleanup.enabled" label="启用清理周期" />
      <label class="acu-field-label" style="margin-left: 12px">清理周期 N</label>
      <input
        v-model.number="cleanup.cycleRounds"
        class="acu-input"
        type="number"
        min="1"
        step="1"
        style="width: 72px"
        :disabled="!cleanup.enabled"
      />
      <label class="acu-field-label" style="margin-left: 12px">活跃比例 R</label>
      <input
        v-model.number="cleanup.activityRatio"
        class="acu-input"
        type="number"
        min="0"
        max="1"
        step="0.05"
        style="width: 72px"
        :disabled="!cleanup.enabled"
      />
    </div>
    <div v-if="cleanup.enabled" class="replica-cleanup-panel__mode">
      <label class="replica-scheduler__mode-option">
        <input v-model="cleanup.mode" type="radio" value="auto" />
        <span>自动清理</span>
      </label>
      <label class="replica-scheduler__mode-option">
        <input v-model="cleanup.mode" type="radio" value="manual" />
        <span>手动清理</span>
      </label>
    </div>
  </div>
</template>
