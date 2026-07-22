<template>
  <div class="ac-brief">
    <template v-if="!world">
      <div class="ac-hint">📜 请选择世界以查看简报</div>
    </template>
    <template v-else>
      <BriefMasthead :world-name="worldName" :world="world" />

      <nav class="ac-brief-page-tabs" aria-label="简报子页">
        <button
          v-for="item in pages"
          :key="item.id"
          type="button"
          class="ac-brief-page-tab"
          :class="{ active: briefPage === item.id }"
          @click="briefPage = item.id"
        >
          <span class="ac-brief-page-tab-icon" aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="ac-brief-scroll">
        <div v-show="briefPage === 'era'" class="ac-brief-page">
          <EraStageSection :world="world" />
          <EraDynamicsSection :world="world" />
          <ChronicleSection :world="world" />
          <EpicSection :world="world" />
        </div>

        <div v-show="briefPage === 'plot'" class="ac-brief-page">
          <PlotEventsSection :world="world" />
          <FactionsSection :world="world" />
        </div>

        <div v-show="briefPage === 'econ'" class="ac-brief-page">
          <EconomySection :world="world" />
        </div>

        <p class="ac-brief-foot">✧ 星穹档案馆编撰 · 帝国天文台印制 ✧</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import BriefMasthead from './brief/BriefMasthead.vue';
import ChronicleSection from './brief/ChronicleSection.vue';
import EconomySection from './brief/EconomySection.vue';
import EpicSection from './brief/EpicSection.vue';
import EraDynamicsSection from './brief/EraDynamicsSection.vue';
import EraStageSection from './brief/EraStageSection.vue';
import FactionsSection from './brief/FactionsSection.vue';
import PlotEventsSection from './brief/PlotEventsSection.vue';

defineProps<{
  world: Record<string, any> | null;
  worldName: string;
}>();

type BriefPage = 'era' | 'plot' | 'econ';

const briefPage = ref<BriefPage>('era');

const pages: Array<{ id: BriefPage; label: string; icon: string }> = [
  { id: 'era', label: '时代快讯', icon: '🕰️' },
  { id: 'plot', label: '世界剧情态势', icon: '⚔️' },
  { id: 'econ', label: '世界经济简报', icon: '💰' },
];
</script>
