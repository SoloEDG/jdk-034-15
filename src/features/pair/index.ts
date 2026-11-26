export {
  OFFSET_DOMAIN, OFFSET_STEP, analyzePair, failureDetail, flightTime, formatOffset,
  offsetLabel, planPair, settlePair, timelineEvents, validateTargets, windowLabel,
} from './lib/plan';
export type { BlockedWindow, CostSample, OffsetWindow, PairAnalysis } from './lib/plan';
export { usePair, type PairApi } from './model/usePair';
export { default as PairPanel } from './ui/PairPanel.vue';
export { default as PairTimeline } from './ui/PairTimeline.vue';
