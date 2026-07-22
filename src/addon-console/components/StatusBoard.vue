<template>
  <div class="ac-brief">
    <nav v-if="world" class="ac-brief-nav" aria-label="简报分区">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="ac-brief-nav-chip"
        @click="scrollTo(item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <div v-if="!world" class="ac-hint">请选择世界以查看简报</div>
    <div v-else class="ac-brief-scroll">
      <BriefMasthead :world-name="worldName" :world="world" />
      <EraStageSection :world="world" />
      <EraDynamicsSection :world="world" />
      <ChronicleSection :world="world" />
      <EpicSection :world="world" />
      <PlotEventsSection :world="world" />
      <FactionsSection :world="world" />
      <EconomySection :world="world" />
      <p class="ac-brief-foot ac-muted">空字段区块已自动隐藏 · 点击分区标题展开详情</p>
    </div>
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

const props = defineProps<{
  world: Record<string, any> | null;
  worldName: string;
}>();

const navItems = [
  { id: 'brief-masthead', label: '刊头' },
  { id: 'brief-era', label: '时代' },
  { id: 'brief-dynamics', label: '演进' },
  { id: 'brief-chronicle', label: '史书' },
  { id: 'brief-epic', label: '史诗' },
  { id: 'brief-plot', label: '剧情' },
  { id: 'brief-factions', label: '团体' },
  { id: 'brief-econ', label: '经济' },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>
