<template>
  <section v-if="visible" class="ac-brief-section" id="brief-dynamics">
    <h3 class="ac-brief-h">世界时局演进动态</h3>
    <div v-if="drive" class="ac-prose-block">
      <div class="ac-kv-key">演进驱动力</div>
      <div class="ac-prose">{{ drive }}</div>
    </div>
    <div v-if="gap" class="ac-prose-block">
      <div class="ac-kv-key">时代差格局</div>
      <div class="ac-prose">{{ gap }}</div>
    </div>

    <div v-if="potentials.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">潜在时代演化</h4>
      <FoldBlock
        v-for="[name, node] in potentials"
        :key="name"
        :title="name"
        :summary="textOf(node?.状态) || textOf(node?.描述).slice(0, 48)"
        :badge="textOf(node?.进度)"
      >
        <ProgressBar :value="node?.进度" />
        <KvGrid
          :data="node"
          :labels="['开始日期', '状态', '推动因子', '抑止因子', '描述']"
          :cols="1"
        />
        <div v-if="entriesOf(node?.已完结转折点事件影响).length" class="ac-nested">
          <div class="ac-kv-key">已完结转折点事件影响</div>
          <FoldBlock
            v-for="[ev, body] in entriesOf(node?.已完结转折点事件影响)"
            :key="ev"
            :title="ev"
            :summary="textOf(body?.最终结局).slice(0, 40)"
          >
            <KvGrid :data="body" :labels="['起止日期', '最终结局', '事件脉络', '时代影响']" :cols="1" />
          </FoldBlock>
        </div>
      </FoldBlock>
    </div>

    <div v-if="turning.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">时代关键转折点</h4>
      <FoldBlock
        v-for="[name, node] in turning"
        :key="name"
        :title="name"
        :badge="node?.临界事件 ? '临界' : textOf(node?.进度)"
        :badge-class="node?.临界事件 ? 'warn' : ''"
        :summary="textOf(node?.描述).slice(0, 48)"
      >
        <ProgressBar :value="node?.进度" />
        <KvGrid
          :data="node"
          :labels="['关联潜在时代', '描述', '总体影响']"
          :cols="1"
        />
        <KvGrid
          v-if="node?.干预态势"
          :data="node.干预态势"
          :labels="['推动力', '抑止力']"
          :cols="2"
        />
        <div v-if="entriesOf(node?.事件脉络).length" class="ac-nested">
          <div class="ac-kv-key">事件脉络</div>
          <FoldBlock
            v-for="[ev, body] in entriesOf(node?.事件脉络)"
            :key="ev"
            :title="ev"
            :summary="textOf(body?.描述).slice(0, 40)"
          >
            <KvGrid
              :data="body"
              :labels="['开始日期', '结束日期', '干预方向', '干预强度', '描述', '影响']"
              :cols="1"
            />
          </FoldBlock>
        </div>
      </FoldBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { entriesOf, isNonEmptyText, textOf } from '../../brief-utils';
import FoldBlock from './FoldBlock.vue';
import KvGrid from './KvGrid.vue';
import ProgressBar from './ProgressBar.vue';

const props = defineProps<{ world: Record<string, any> | null }>();

const dyn = computed(() => props.world?.时代快讯?.世界时局演进动态);
const drive = computed(() => textOf(dyn.value?.演进驱动力).trim());
const gap = computed(() => textOf(dyn.value?.时代差格局).trim());
const potentials = computed(() => entriesOf(dyn.value?.潜在时代演化));
const turning = computed(() => entriesOf(dyn.value?.时代关键转折点));
const visible = computed(
  () =>
    isNonEmptyText(drive.value) ||
    isNonEmptyText(gap.value) ||
    potentials.value.length > 0 ||
    turning.value.length > 0,
);
</script>
