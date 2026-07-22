<template>
  <section v-if="visible" class="ac-brief-section" id="brief-chronicle">
    <h3 class="ac-brief-h">岁月史书</h3>

    <div v-if="official.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">正史演变</h4>
      <FoldBlock
        v-for="[name, node] in official"
        :key="name"
        :title="name"
        :summary="[textOf(node?.前时代称谓), textOf(node?.后时代称谓)].filter(Boolean).join(' → ')"
      >
        <KvGrid
          :data="node"
          :labels="['前时代称谓', '后时代称谓', '演变起止', '描述', '历史影响', '关键转折']"
          :cols="1"
        />
      </FoldBlock>
    </div>

    <div v-if="sings.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">特异点</h4>
      <FoldBlock
        v-for="[name, node] in sings"
        :key="name"
        :title="name"
        :badge="node?.降临 ? '降临中' : ''"
        :badge-class="node?.降临 ? 'on' : ''"
        :summary="textOf(node?.分歧源头).slice(0, 48)"
        :default-open="!!node?.降临"
        :class="{ 'ac-sing-active': node?.降临 }"
      >
        <div v-if="node?.降临" class="ac-inline-note">当前特异点已降临</div>
        <KvGrid :data="node" :labels="['分歧源头']" :cols="1" />
        <div v-if="entriesOf(node?.事件记录).length" class="ac-nested">
          <div class="ac-kv-key">分歧纪段</div>
          <FoldBlock
            v-for="[ev, body] in entriesOf(node?.事件记录)"
            :key="ev"
            :title="ev"
            :summary="textOf(body?.描述).slice(0, 40)"
          >
            <KvGrid
              :data="body"
              :labels="['前时代称谓', '后时代称谓', '纪段起止', '描述', '历史影响', '关键转折']"
              :cols="1"
            />
          </FoldBlock>
        </div>
      </FoldBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { entriesOf, textOf } from '../../brief-utils';
import FoldBlock from './FoldBlock.vue';
import KvGrid from './KvGrid.vue';

const props = defineProps<{ world: Record<string, any> | null }>();

const book = computed(() => props.world?.时代快讯?.岁月史书);
const official = computed(() => entriesOf(book.value?.正史));
const sings = computed(() => entriesOf(book.value?.特异点));
const visible = computed(() => official.value.length > 0 || sings.value.length > 0);
</script>
