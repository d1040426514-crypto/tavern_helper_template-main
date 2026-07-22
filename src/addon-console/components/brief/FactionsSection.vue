<template>
  <BriefSection v-if="visible" id="brief-factions" icon="🏛️" title="团体动态">
    <div v-if="worldFactions.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">🌐 世界背景团体</h4>
      <FactionCard v-for="[name, node] in worldFactions" :key="name" :name="name" :node="node" />
    </div>

    <div v-if="regionFactions.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">📍 当前区域团体</h4>
      <FactionCard v-for="[name, node] in regionFactions" :key="name" :name="name" :node="node" />
    </div>
  </BriefSection>
</template>

<script setup lang="ts">
import { entriesOf, textOf } from '../../brief-utils';
import BriefSection from './BriefSection.vue';
import FoldBlock from './FoldBlock.vue';
import KvGrid from './KvGrid.vue';

const FactionCard = defineComponent({
  name: 'FactionCard',
  props: {
    name: { type: String, required: true },
    node: { type: Object, default: null },
  },
  setup(props) {
    return () => {
      const node = props.node as any;
      const people = entriesOf(node?.核心人物);
      const diplomacy = entriesOf(node?.外交关系);
      const pillars = entriesOf(node?.权力支柱);
      return h(
        FoldBlock,
        {
          title: props.name,
          summary: textOf(node?.活跃区域) || textOf(node?.发展态势).slice(0, 40),
          badge: textOf(node?.发展态势).slice(0, 12),
        },
        {
          default: () => [
            h(KvGrid, {
              data: node,
              labels: ['活跃区域', '内政概况', '发展态势', '当前动态'],
              cols: 1,
            }),
            node?.声誉
              ? h('div', { class: 'ac-nested' }, [
                  h('div', { class: 'ac-kv-key' }, '声誉'),
                  h(KvGrid, {
                    data: node.声誉,
                    labels: ['官方', '民间', '暗域', '业界'],
                    cols: 2,
                  }),
                ])
              : null,
            pillars.length
              ? h('div', { class: 'ac-nested' }, [
                  h('div', { class: 'ac-kv-key' }, '权力支柱'),
                  ...pillars.map(([k, v]) =>
                    h('div', { class: 'ac-timeline-node', key: k }, [
                      h('strong', null, k + ' · '),
                      h('span', null, textOf(v)),
                    ]),
                  ),
                ])
              : null,
            diplomacy.length
              ? h('div', { class: 'ac-nested' }, [
                  h('div', { class: 'ac-kv-key' }, '外交关系'),
                  ...diplomacy.map(([k, v]) =>
                    h('div', { class: 'ac-timeline-node', key: k }, [
                      h('strong', null, k + ' · '),
                      h('span', null, textOf(v)),
                    ]),
                  ),
                ])
              : null,
            people.length
              ? h('div', { class: 'ac-nested' }, [
                  h('div', { class: 'ac-kv-key' }, '核心人物'),
                  ...people.map(([pname, pbody]) =>
                    h(
                      FoldBlock,
                      {
                        key: pname,
                        title: pname,
                        summary: textOf((pbody as any)?.身份职务),
                      },
                      {
                        default: () => [
                          h(KvGrid, {
                            data: pbody,
                            labels: ['身份职务'],
                            cols: 1,
                          }),
                          entriesOf((pbody as any)?.权力支柱).length
                            ? h('div', { class: 'ac-nested' }, [
                                h('div', { class: 'ac-kv-key' }, '权力支柱'),
                                ...entriesOf((pbody as any)?.权力支柱).map(([k, v]) =>
                                  h('div', { class: 'ac-timeline-node', key: k }, [
                                    h('strong', null, k + ' · '),
                                    h('span', null, textOf(v)),
                                  ]),
                                ),
                              ])
                            : null,
                        ],
                      },
                    ),
                  ),
                ])
              : null,
          ],
        },
      );
    };
  },
});

const props = defineProps<{ world: Record<string, any> | null }>();
const factions = computed(() => props.world?.世界剧情态势?.团体动态);
const worldFactions = computed(() => entriesOf(factions.value?.世界背景团体));
const regionFactions = computed(() => entriesOf(factions.value?.当前区域团体));
const visible = computed(() => worldFactions.value.length > 0 || regionFactions.value.length > 0);
</script>
