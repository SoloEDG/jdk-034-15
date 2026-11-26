<script setup lang="ts">
import { computed } from 'vue';
import { ArrowLeftRight, Play, TriangleAlert, X } from 'lucide-vue-next';
import { limbNames } from '../../limbs';
import { failures } from '../../actions';
import {
  OFFSET_DOMAIN, OFFSET_STEP, formatOffset, offsetLabel, windowLabel,
  type BlockedWindow,
} from '../lib/plan';
import type { PairApi } from '../model/usePair';
import PairTimeline from './PairTimeline.vue';

const props = defineProps<{ pair: PairApi; locked: boolean }>();
defineEmits<{ execute: []; exit: [] }>();

const { members, targets, editing, offset, hint, moves, invalid, analysis, preview, contacts } = props.pair;

const STRIP_W = 244;
const STRIP_PAD = 8;
const stripX = (t: number) => STRIP_PAD + ((t + OFFSET_DOMAIN) / (OFFSET_DOMAIN * 2)) * (STRIP_W - STRIP_PAD * 2);

const costRange = computed(() => {
  const costs = (analysis.value?.samples ?? []).filter(sample => sample.cost !== null).map(sample => sample.cost as number);
  return costs.length ? [Math.min(...costs), Math.max(...costs)] : [0, 1];
});
const costY = (cost: number) => {
  const [min, max] = costRange.value;
  return 36 - ((cost - min) / Math.max(1, max - min)) * 26;
};
const costRuns = computed(() => {
  const runs: string[] = [];
  let current: string[] = [];
  for (const sample of analysis.value?.samples ?? []) {
    if (sample.cost === null) {
      if (current.length) runs.push(current.join(' '));
      current = [];
      continue;
    }
    current.push((current.length ? 'L' : 'M') + stripX(sample.offset).toFixed(1) + ' ' + costY(sample.cost).toFixed(1));
  }
  if (current.length) runs.push(current.join(' '));
  return runs;
});
const windowRects = computed(() => (analysis.value?.windows ?? []).map(window => ({
  x: stripX(window.from), w: Math.max(2, stripX(window.to) - stripX(window.from)),
})));
const blockedRects = computed(() => (analysis.value?.blocked ?? []).map(block => ({
  x: stripX(block.from), w: Math.max(1.5, stripX(block.to) - stripX(block.from)),
})));
const bestPoint = computed(() => {
  const best = analysis.value?.best;
  return best ? { x: stripX(best.offset), y: costY(best.cost) } : null;
});

function setEditing(index: 0 | 1) {
  props.pair.editing.value = index;
}
function onSlide(event: Event) {
  props.pair.setOffset(Number((event.target as HTMLInputElement).value));
}
function pick(event: MouseEvent) {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  const px = ((event.clientX - rect.left) / rect.width) * STRIP_W;
  props.pair.setOffset(((px - STRIP_PAD) / (STRIP_W - STRIP_PAD * 2)) * OFFSET_DOMAIN * 2 - OFFSET_DOMAIN);
}
function useBest() {
  const best = analysis.value?.best;
  if (best) props.pair.setOffset(best.offset);
}
function blockRange(block: BlockedWindow) {
  const range = Math.abs(block.from - block.to) < 1e-9
    ? formatOffset(block.from) + ' 一点'
    : formatOffset(block.from) + ' ~ ' + formatOffset(block.to);
  return block.fromOpen || block.toOpen ? range + '（不含端点）' : range;
}
</script>

<template>
  <section class="console-section pair-panel" aria-label="双肢编排">
    <div class="section-heading">
      <h2>双肢编排</h2>
      <button class="icon-button" aria-label="退出双肢编排" title="退出双肢编排" @click="$emit('exit')"><X :size="16" /></button>
    </div>

    <p v-if="members.length < 2" class="pair-hint">在上方「肢体落点」中点选两只肢体（已选 {{ members.length }} / 2）</p>
    <template v-else>
      <div class="pair-rows">
        <button v-for="index in [0, 1] as const" :key="index" class="pair-row" :class="{ editing: editing === index }"
          :disabled="locked" @click="setEditing(index)">
          <b>{{ limbNames[members[index]] }}</b>
          <span>{{ targets[index] ? '→ ' + targets[index] : '点岩点设落点' }}</span>
        </button>
        <button class="pair-swap" :disabled="locked" title="两只肢体互相落到对方当前岩点" @click="pair.swap()">
          <ArrowLeftRight :size="14" /> 互换落点
        </button>
      </div>
    </template>
    <p v-if="hint" class="action-warning" role="status">{{ hint }}</p>
    <p v-else-if="invalid" class="action-warning" role="status">{{ invalid }}</p>

    <template v-if="analysis && moves">
      <div class="offset-windows">
        <h3>可行相对时差</h3>
        <p v-if="!analysis.windows.length" class="pair-empty">当前站姿下没有任何可行时差</p>
        <button v-for="(window, i) in analysis.windows" :key="i" class="window-line" @click="pair.setOffset(window.bestOffset)">
          <span>{{ windowLabel(window, moves) }}</span>
          <b>{{ window.minCost === window.maxCost ? window.minCost : window.minCost + ' ~ ' + window.maxCost }} 体力</b>
        </button>
        <p v-for="(block, i) in analysis.blocked" :key="'block' + i" class="blocked-line">
          <s>{{ blockRange(block) }}</s><span>{{ block.detail }}</span>
        </p>
      </div>

      <svg :viewBox="'0 0 ' + STRIP_W + ' 60'" class="offset-strip" role="img" aria-label="时差可行性与体力曲线，点击选择时差" @click="pick">
        <line v-for="t in [-1, -0.5, 0, 0.5, 1]" :key="'grid' + t" :x1="stripX(t)" y1="6" :x2="stripX(t)" y2="56" class="strip-grid" />
        <path v-for="(run, i) in costRuns" :key="'run' + i" :d="run" class="strip-cost" />
        <rect v-for="(rect, i) in blockedRects" :key="'brect' + i" :x="rect.x" y="44" :width="rect.w" height="10" class="strip-blocked" />
        <rect v-for="(rect, i) in windowRects" :key="'wrect' + i" :x="rect.x" y="44" :width="rect.w" height="10" class="strip-window" />
        <circle v-if="bestPoint" :cx="bestPoint.x" :cy="bestPoint.y" r="3" class="strip-best" />
        <line :x1="stripX(offset)" y1="4" :x2="stripX(offset)" y2="58" class="strip-handle" />
      </svg>

      <div class="offset-slider">
        <input type="range" :min="-OFFSET_DOMAIN" :max="OFFSET_DOMAIN" :step="OFFSET_STEP" :value="offset"
          :disabled="locked" aria-label="相对时差" @input="onSlide" />
        <b>{{ offsetLabel(offset, moves) }}</b>
      </div>
      <button v-if="analysis.best" class="best-offset" @click="useBest">
        采用最省时差 {{ formatOffset(analysis.best.offset) }}（{{ analysis.best.cost }} 体力）
      </button>
    </template>

    <template v-if="preview">
      <PairTimeline :moves="preview.moves" :timeline="preview.timeline" :contacts="contacts"
        :failure="preview.failure" :failure-at="preview.failureAt" :failure-window="preview.failureWindow"
        :failure-limb="preview.failureLimb" />
      <dl class="action-data pair-cost">
        <div>
          <dt>{{ limbNames[preview.moves[0].limb] }} + {{ limbNames[preview.moves[1].limb] }} + 协调</dt>
          <dd>{{ preview.costParts[0] }} + {{ preview.costParts[1] }} + {{ preview.costParts[2] }} = {{ preview.cost }}</dd>
        </div>
      </dl>
      <p v-if="preview.failure" class="action-warning" role="status">
        <TriangleAlert :size="15" /> {{ failures[preview.failure] }}
      </p>
    </template>

    <button class="execute" :disabled="!preview || locked" @click="$emit('execute')">
      执行双肢动作<template v-if="preview"> −{{ preview.cost }} 体力</template> <Play :size="16" />
    </button>
  </section>
</template>
