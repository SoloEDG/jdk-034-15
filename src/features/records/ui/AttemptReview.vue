<script setup lang="ts">
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import type { Attempt, MoveRecord } from '../../../shared/types';
import { limbNames } from '../../limbs';
import { failures } from '../../actions';
import { PairTimeline, offsetLabel } from '../../pair';

defineProps<{ attempt: Attempt; frame: MoveRecord; step: number }>();
defineEmits<{ jump: [index: number]; close: [] }>();
</script>

<template>
  <section class="console-section replay" aria-label="动作回看">
    <div class="section-heading"><h2>动作回看</h2>
      <button class="icon-button" aria-label="关闭回看" @click="$emit('close')"><X :size="17" /></button>
    </div>
    <div class="review-nav">
      <button class="icon-button" aria-label="上一步" :disabled="step === 0" @click="$emit('jump',step-1)"><ChevronLeft :size="17" /></button>
      <b>第 {{ step + 1 }} / {{ attempt.moves.length }} 步</b>
      <button class="icon-button" aria-label="下一步" :disabled="step === attempt.moves.length - 1" @click="$emit('jump',step+1)"><ChevronRight :size="17" /></button>
    </div>
    <dl class="action-data">
      <div v-if="frame.pair">
        <dt>{{ limbNames[frame.move.limb] }} + {{ limbNames[frame.pair.second.limb] }}</dt>
        <dd>{{ frame.before[frame.move.limb] }}→{{ frame.move.target }} · {{ frame.before[frame.pair.second.limb] }}→{{ frame.pair.second.target }}</dd>
      </div>
      <div v-else><dt>{{ limbNames[frame.move.limb] }}</dt><dd>{{ frame.before[frame.move.limb] }} → {{ frame.move.target }}</dd></div>
      <div v-if="frame.pair"><dt>相对时差</dt><dd>{{ offsetLabel(frame.pair.offset, [frame.move, frame.pair.second]) }}</dd></div>
      <div><dt>体力变化</dt><dd>{{ frame.energyBefore }} → {{ frame.energyAfter }}</dd></div>
      <div><dt>{{ frame.pair ? '过程最低余量' : '离点支撑余量' }}</dt><dd>{{ frame.support.margin }}</dd></div>
      <div><dt>落点支撑余量</dt><dd>{{ frame.landing.margin }}</dd></div>
    </dl>
    <PairTimeline v-if="frame.pair" :moves="[frame.move, frame.pair.second]" :timeline="frame.pair.timeline"
      :contacts="frame.before" :failure="frame.failure" :failure-at="frame.pair.failureAt"
      :failure-window="frame.pair.failureWindow" :failure-limb="frame.pair.failureLimb" />
    <p v-else-if="frame.failure" class="action-warning" role="status">{{ failures[frame.failure] }}</p>
  </section>
</template>
