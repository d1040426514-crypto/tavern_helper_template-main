<template>
  <section v-if="visible" class="ac-brief-section" id="brief-era">
    <h3 class="ac-brief-h">世界时代阶段</h3>
    <KvGrid :data="stage" :labels="labels" :cols="2" />
  </section>
</template>

<script setup lang="ts">
import { hasAnyText } from '../../brief-utils';
import KvGrid from './KvGrid.vue';

const props = defineProps<{ world: Record<string, any> | null }>();

const labels = [
  '时代阶段',
  '核心社会组织形式',
  '主流世界观与思潮',
  '主要经济模式',
  '技术特征',
  '主导性能源与动力',
  '关键材料标志',
  '社会阶级结构',
  '生产力与生产关系矛盾',
  '世界秩序格局',
];

const stage = computed(() => props.world?.时代快讯?.世界时代阶段);
const visible = computed(() => hasAnyText(stage.value, labels));
</script>
