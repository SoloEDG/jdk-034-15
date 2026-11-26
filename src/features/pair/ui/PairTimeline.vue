<script setup lang="ts">
import { computed } from 'vue';
import type { Contacts, Failure, Limb, Move, PairTimeline } from '../../../shared/types';
import { limbNames, limbTags } from '../../limbs/lib/support';
import { failures } from '../../actions';
import { failureDetail, timelineEvents } from '../lib/plan';

const props = defineProps<{
  moves: [Move, Move];
  timeline: PairTimeline;
  contacts: Contacts;
  failure: Failure | null;
  failureAt: number | null;
  failureWindow: [number, number] | null;
  failureLimb: Limb | null;
}>();

const PAD_L = 30;
const PAD_R = 10;
const WIDTH = 244;
const LANES = [24, 46];

const rel = (t: number) => t - props.timeline.start;
const x = (t: number) => PAD_L + (rel(t) / props.timeline.duration) * (WIDTH - PAD_L - PAD_R);

const lanes = computed(() => props.moves.map((move, index) => ({
  limb: move.limb,
  y: LANES[index],
  release: props.timeline.releases[index],
  land: props.timeline.landings[index],
})));
const end = computed(() => props.timeline.start + props.timeline.duration);
const bothBands = computed(() => props.timeline.phases.filter(phase => phase.airborne.length > 1)
  .map(phase => ({ x: x(phase.from), w: Math.max(2, x(phase.to) - x(phase.from)) })));
const failBand = computed(() => props.failureWindow
  ? { x: x(props.failureWindow[0]), w: Math.max(3, x(props.failureWindow[1]) - x(props.failureWindow[0])) }
  : null);
const ticks = computed(() => [0, props.timeline.duration / 2, props.timeline.duration]
  .map(t => ({ x: x(props.timeline.start + t), label: t.toFixed(2) })));

const events = computed(() => timelineEvents(props.contacts, props.moves, props.timeline));
const phaseRows = computed(() => props.timeline.phases.map(phase => ({
  from: rel(phase.from).toFixed(2),
  to: rel(phase.to).toFixed(2),
  label: phase.airborne.length > 1 ? '双肢同时腾空'
    : phase.airborne.length === 1 ? limbNames[phase.airborne[0]] + '悬空' : '过渡站姿',
  margin: phase.balance.margin,
  bad: phase.balance.margin < 0,
})));
const firstRelease = computed(() => {
  const [a, b] = props.timeline.releases;
  return props.moves[a <= b ? 0 : 1].limb;
});
const firstLand = computed(() => {
  const [a, b] = props.timeline.landings;
  return props.moves[a <= b ? 0 : 1].limb;
});
const failureText = computed(() => props.failure
  ? failures[props.failure] + '：' + failureDetail(props)
  : '');
const failureTime = computed(() => props.failureAt === null ? null : rel(props.failureAt).toFixed(2));
</script>

<template>
  <div class="pair-timeline">
    <p class="timeline-summary">
      {{ limbNames[firstRelease] }}先离点 · {{ limbNames[firstLand] }}先承重 · 全程 {{ timeline.duration.toFixed(2) }}s
    </p>
    <svg :viewBox="'0 0 ' + WIDTH + ' 80'" class="timeline-chart" role="img"
      :aria-label="'共同时间轴：' + limbNames[firstRelease] + '先离点，' + limbNames[firstLand] + '先承重'">
      <rect v-for="(band, i) in bothBands" :key="'both' + i" :x="band.x" y="14" :width="band.w" height="42" class="tl-both" />
      <rect v-if="failBand" :x="failBand.x" y="14" :width="failBand.w" height="42" class="tl-fail" />
      <g v-for="lane in lanes" :key="lane.limb">
        <text :x="PAD_L - 6" :y="lane.y + 3.5" class="tl-tag">{{ limbTags[lane.limb] }}</text>
        <line :x1="x(timeline.start)" :y1="lane.y" :x2="x(end)" :y2="lane.y" class="tl-base" />
        <line :x1="x(timeline.start)" :y1="lane.y" :x2="x(lane.release)" :y2="lane.y" class="tl-origin" />
        <line :x1="x(lane.release)" :y1="lane.y" :x2="x(lane.land)" :y2="lane.y" class="tl-air" />
        <line :x1="x(lane.land)" :y1="lane.y" :x2="x(end)" :y2="lane.y" class="tl-target" />
        <circle :cx="x(lane.release)" :cy="lane.y" r="3.4" class="tl-release" />
        <circle :cx="x(lane.land)" :cy="lane.y" r="3.4" class="tl-land" />
      </g>
      <g v-if="failureAt !== null" :transform="'translate(' + x(failureAt) + ' 9)'" class="tl-failmark">
        <path d="M-3.2-3.2L3.2 3.2M-3.2 3.2L3.2-3.2" />
      </g>
      <line :x1="x(timeline.start)" y1="64" :x2="x(end)" y2="64" class="tl-axis" />
      <text v-for="(tick, i) in ticks" :key="'tick' + i" :x="tick.x" y="76" class="tl-tick">{{ tick.label }}s</text>
    </svg>
    <p class="timeline-legend">○ 离点 · ● 承重 · 浅色带 双肢腾空<span v-if="failBand"> · 红带 失败窗口</span></p>
    <ul class="timeline-events">
      <li v-for="(event, i) in events" :key="i">
        <i>{{ event.t.toFixed(2) }}s</i> {{ limbNames[event.limb] }}{{ event.kind === 'release' ? '离点' : '承重' }} {{ event.hold }}
      </li>
    </ul>
    <ul class="timeline-phases">
      <li v-for="(phase, i) in phaseRows" :key="i" :class="{ bad: phase.bad }">
        {{ phase.from }}–{{ phase.to }}s {{ phase.label }} · 余量 {{ phase.margin }}
      </li>
    </ul>
    <p v-if="failure" class="action-warning" role="status">
      {{ failureText }}<template v-if="failureTime !== null">（t={{ failureTime }}s）</template>
    </p>
  </div>
</template>
