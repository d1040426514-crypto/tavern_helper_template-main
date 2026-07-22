<template>
  <section v-if="epics.length" class="ac-brief-section" id="brief-epic">
    <h3 class="ac-brief-h">史诗传奇</h3>
    <FoldBlock
      v-for="[name, node] in epics"
      :key="name"
      :title="name"
      :summary="textOf(node?.核心母题关键词) || textOf(node?.基本类型)"
      :badge="textOf(node?.基本类型)"
    >
      <KvGrid
        :data="node"
        :labels="['基本类型', '核心母题关键词', '史实真相', '流变历程']"
        :cols="1"
      />
      <div v-if="entriesOf(node?.传世轶闻).length" class="ac-nested">
        <div class="ac-kv-key">传世轶闻</div>
        <FoldBlock
          v-for="[tale, body] in entriesOf(node?.传世轶闻)"
          :key="tale"
          :title="tale"
          :badge="body?.原典 ? '原典' : ''"
          :summary="textOf(body?.内容梗概).slice(0, 40)"
        >
          <KvGrid
            :data="body"
            :labels="['关键要素', '版本流传范围', '版本成型时代', '内容梗概']"
            :cols="1"
          />
        </FoldBlock>
      </div>
    </FoldBlock>
  </section>
</template>

<script setup lang="ts">
import { entriesOf, textOf } from '../../brief-utils';
import FoldBlock from './FoldBlock.vue';
import KvGrid from './KvGrid.vue';

const props = defineProps<{ world: Record<string, any> | null }>();
const epics = computed(() => entriesOf(props.world?.时代快讯?.史诗传奇));
</script>
