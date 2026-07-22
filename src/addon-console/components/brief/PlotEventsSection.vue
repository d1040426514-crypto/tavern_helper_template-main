<template>
  <section v-if="visible" class="ac-brief-section" id="brief-plot">
    <h3 class="ac-brief-h">时局动态</h3>

    <div v-if="worldEvents.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">世界背景事件</h4>
      <FoldBlock
        v-for="[name, node] in worldEvents"
        :key="name"
        :title="name"
        :summary="textOf(node?.参与角色) || textOf(node?.结算条件).slice(0, 40)"
      >
        <EventBody :node="node" />
      </FoldBlock>
    </div>

    <div v-if="regionEvents.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">当前区域事件</h4>
      <FoldBlock
        v-for="[name, node] in regionEvents"
        :key="name"
        :title="name"
        :summary="textOf(node?.参与角色) || textOf(node?.结算条件).slice(0, 40)"
      >
        <EventBody :node="node" />
      </FoldBlock>
    </div>

    <div v-if="rumors.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">传闻</h4>
      <FoldBlock
        v-for="[name, node] in rumors"
        :key="name"
        :title="name"
        :badge="textOf(node?.影响力)"
        :summary="textOf(node?.流传范围)"
      >
        <KvGrid :data="node" :labels="['影响力', '流传范围']" :cols="2" />
        <div v-if="entriesOf(node?.流变历程).length" class="ac-nested">
          <div class="ac-kv-key">流变历程</div>
          <FoldBlock
            v-for="[step, body] in entriesOf(node?.流变历程)"
            :key="step"
            :title="step"
            :summary="textOf(body?.传闻描述).slice(0, 40)"
          >
            <KvGrid
              :data="body"
              :labels="['流变日期', '预计时效', '真相', '传闻描述', '事实偏差', '流变诱因']"
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

const EventBody = defineComponent({
  name: 'EventBody',
  props: { node: { type: Object, default: null } },
  setup(props) {
    return () => {
      const node = props.node as any;
      const guidance = node?.叙事指导;
      const timeline = entriesOf(node?.事件脉络);
      return h('div', { class: 'ac-event-body' }, [
        h(KvGrid, {
          data: node,
          labels: ['参与角色', '牵涉团体', '结算条件'],
          cols: 1,
        }),
        guidance
          ? h('div', { class: 'ac-nested' }, [
              h('div', { class: 'ac-kv-key' }, '叙事指导'),
              h(KvGrid, {
                data: guidance,
                labels: ['宏观层', '发展层', '细节层'],
                cols: 1,
              }),
            ])
          : null,
        timeline.length
          ? h('div', { class: 'ac-nested' }, [
              h('div', { class: 'ac-kv-key' }, '事件脉络'),
              ...timeline.map(([k, v]) =>
                h('div', { class: 'ac-timeline-row', key: k }, [
                  h('strong', null, k),
                  h('span', null, textOf(v)),
                ]),
              ),
            ])
          : null,
      ]);
    };
  },
});

const props = defineProps<{ world: Record<string, any> | null }>();
const plot = computed(() => props.world?.世界剧情态势?.时局动态);
const worldEvents = computed(() => entriesOf(plot.value?.世界背景事件));
const regionEvents = computed(() => entriesOf(plot.value?.当前区域事件));
const rumors = computed(() => entriesOf(plot.value?.传闻));
const visible = computed(
  () => worldEvents.value.length > 0 || regionEvents.value.length > 0 || rumors.value.length > 0,
);
</script>
