import type {
  Balance, Contacts, Failure, Limb, Move, MoveRecord, PairPreview, PairTimeline, Phase, Route,
} from '../../../shared/types';
import { distance } from '../../../shared/geometry';
import { holdAt } from '../../wall';
import { balance, balanceWith, isHand, limbNames, measureReach } from '../../limbs';
import { moveCost } from '../../stamina';

/** 相对时差的可调范围（秒）：负值表示第二只肢体先动 */
export const OFFSET_DOMAIN = 1.2;
/** 时差采样 / 滑块步长（秒）：与腾空时长精度一致，保证恰接点可选 */
export const OFFSET_STEP = 0.01;

const EPS = 1e-9;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** 单肢腾空时长：随移动距离增加，限制在 0.3 ~ 0.9 秒 */
export function flightTime(travel: number) {
  return Math.min(0.9, Math.max(0.3, round2(0.3 + travel / 500)));
}

export function travelOf(route: Route, contacts: Contacts, move: Move) {
  return distance(holdAt(route, contacts[move.limb]), holdAt(route, move.target));
}

/** 目标落点是否合法：类型匹配、不是原点、不被第三肢体占用、两落点不重复 */
export function validateTargets(route: Route, contacts: Contacts, moves: [Move, Move]): string | null {
  const [a, b] = moves;
  if (a.limb === b.limb) return '需要两只不同的肢体';
  for (const move of moves) {
    const hold = route.holds.find(candidate => candidate.id === move.target);
    if (!hold) return '未知岩点 ' + move.target;
    if (isHand(move.limb) === (hold.kind === 'step')) return limbNames[move.limb] + '与岩点类型不匹配';
    if (contacts[move.limb] === move.target) return limbNames[move.limb] + '已在岩点 ' + move.target + ' 上';
    const occupant = (Object.keys(contacts) as Limb[]).find(limb =>
      limb !== a.limb && limb !== b.limb && contacts[limb] === move.target);
    if (occupant) return '岩点 ' + move.target + ' 被' + limbNames[occupant] + '占用';
  }
  if (a.target === b.target) return '两个落点不能相同';
  return null;
}

interface TimedEvent {
  t: number;
  kind: 'release' | 'land';
  index: 0 | 1;
}

interface Occupation {
  t: number;
  limb: Limb;
}

/**
 * 沿共同时间轴构建双肢时序：A 在 t=0 离点，B 在 t=offset 离点。
 * 同一时刻先处理离点再处理落地——落点被完全释放的瞬间即允许承重。
 * 每个相位记录同时离点的肢体集合与支撑余量。
 */
export function buildTimeline(route: Route, contacts: Contacts, moves: [Move, Move], flights: [number, number], offset: number) {
  const releases: [number, number] = [0, offset];
  const landings: [number, number] = [flights[0], round2(offset + flights[1])];
  const events: TimedEvent[] = ([
    { t: releases[0], kind: 'release', index: 0 }, { t: landings[0], kind: 'land', index: 0 },
    { t: releases[1], kind: 'release', index: 1 }, { t: landings[1], kind: 'land', index: 1 },
  ] as TimedEvent[]).sort((x, y) => x.t - y.t || (x.kind === y.kind ? x.index - y.index : x.kind === 'release' ? -1 : 1));
  const states: Array<'origin' | 'air' | 'target'> = ['origin', 'origin'];
  const phases: Phase[] = [];
  const occupations: Occupation[] = [];
  const start = Math.min(releases[0], releases[1]);
  const end = Math.max(landings[0], landings[1]);
  let prev = start;
  for (const event of events) {
    if (event.t > prev + EPS) phases.push(phaseOf(route, contacts, moves, states, prev, event.t));
    if (event.kind === 'release') states[event.index] = 'air';
    else {
      const other = event.index === 0 ? 1 : 0;
      const stillHolding = states[other] === 'origin' && contacts[moves[other].limb] === moves[event.index].target;
      if (stillHolding) occupations.push({ t: event.t, limb: moves[event.index].limb });
      states[event.index] = 'target';
    }
    prev = event.t;
  }
  const timeline: PairTimeline = { offset, flights, releases, landings, start, duration: end - start, phases };
  return { timeline, occupations };
}

function phaseOf(route: Route, contacts: Contacts, moves: [Move, Move], states: Array<'origin' | 'air' | 'target'>, from: number, to: number): Phase {
  const stance = { ...contacts };
  const airborne: Limb[] = [];
  states.forEach((state, index) => {
    if (state === 'target') stance[moves[index].limb] = moves[index].target;
    if (state === 'air') airborne.push(moves[index].limb);
  });
  return { from, to, airborne, balance: balanceWith(route, stance, airborne) };
}

interface FailureCandidate {
  failure: Failure;
  at: number;
  window: [number, number] | null;
  limb: Limb | null;
  priority: number;
}

/** 评估某一相对时差下的双肢方案：逐相位支撑、落点占用、触及与体力 */
export function planPair(route: Route, contacts: Contacts, moves: [Move, Move], offset: number, energy: number): PairPreview {
  const [a, b] = moves;
  const travels: [number, number] = [travelOf(route, contacts, a), travelOf(route, contacts, b)];
  const flights: [number, number] = [flightTime(travels[0]), flightTime(travels[1])];
  const { timeline, occupations } = buildTimeline(route, contacts, moves, flights, offset);
  const next: Contacts = { ...contacts, [a.limb]: a.target, [b.limb]: b.target };
  const measures = [
    measureReach(route, contacts, a.limb, a.target, energy),
    measureReach(route, contacts, b.limb, b.target, energy),
  ];
  const landing = balance(route, next);
  const worst = timeline.phases.reduce<Balance>(
    (min, phase) => (phase.balance.margin < min.margin ? phase.balance : min), landing);

  const releaseMargin = (limb: Limb) =>
    timeline.phases.find(phase => phase.airborne.includes(limb))?.balance.margin
    ?? balanceWith(route, contacts, [limb]).margin;
  const parts: [number, number, number] = [
    moveCost(travels[0], holdAt(route, a.target).kind, route.tilt, releaseMargin(a.limb)),
    moveCost(travels[1], holdAt(route, b.target).kind, route.tilt, releaseMargin(b.limb)),
    0,
  ];
  // 协调消耗：腾空相位持续越久、余量越低，维持姿态越费力
  parts[2] = Math.ceil(timeline.phases.reduce((sum, phase) =>
    sum + (phase.airborne.length ? (phase.to - phase.from) * Math.max(0, 4 - phase.balance.margin) : 0), 0));
  const cost = parts[0] + parts[1] + parts[2];

  const candidates: FailureCandidate[] = [];
  measures.forEach((measure, index) => {
    if (measure.distance > measure.reach)
      candidates.push({ failure: 'reach', at: timeline.releases[index], window: null, limb: moves[index].limb, priority: 0 });
  });
  occupations.forEach(item =>
    candidates.push({ failure: 'occupied', at: item.t, window: [item.t, item.t], limb: item.limb, priority: 1 }));
  timeline.phases.forEach(phase => {
    if (phase.balance.margin < 0)
      candidates.push({ failure: 'support', at: phase.from, window: [phase.from, phase.to], limb: null, priority: 2 });
  });
  const end = timeline.start + timeline.duration;
  if (landing.margin < 0)
    candidates.push({ failure: 'support', at: end, window: [end, end], limb: null, priority: 2 });
  candidates.sort((x, y) => x.at - y.at || x.priority - y.priority);
  const first = candidates[0] ?? null;

  return {
    moves, timeline, next, cost, costParts: parts,
    distance: [measures[0].distance, measures[1].distance],
    reach: [measures[0].reach, measures[1].reach],
    worst, landing,
    failure: first ? first.failure : energy < cost ? 'energy' : null,
    failureAt: first ? first.at : null,
    failureWindow: first ? first.window : null,
    failureLimb: first ? first.limb : null,
  };
}

export interface OffsetWindow {
  from: number;
  to: number;
  fromOpen: boolean;
  toOpen: boolean;
  bestOffset: number;
  minCost: number;
  maxCost: number;
}

export interface BlockedWindow {
  from: number;
  to: number;
  fromOpen: boolean;
  toOpen: boolean;
  reason: Failure;
  detail: string;
}

export interface CostSample {
  offset: number;
  cost: number | null;
}

export interface PairAnalysis {
  flights: [number, number];
  domain: number;
  windows: OffsetWindow[];
  blocked: BlockedWindow[];
  samples: CostSample[];
  best: { offset: number; cost: number } | null;
}

interface Piece {
  from: number;
  to: number;
  fromOpen: boolean;
  toOpen: boolean;
}

/**
 * 枚举全部可行的相对时差区间。相位结构只在事件对齐的临界时差处改变
 * （0、±腾空时长、腾空时长之差），因此对临界点和其间中点求值即可精确覆盖。
 */
export function analyzePair(route: Route, contacts: Contacts, moves: [Move, Move], energy: number): PairAnalysis {
  const flights: [number, number] = [flightTime(travelOf(route, contacts, moves[0])), flightTime(travelOf(route, contacts, moves[1]))];
  const domain = OFFSET_DOMAIN;
  const criticals = [...new Set([0, -flights[1], flights[0], round2(flights[0] - flights[1]), -domain, domain]
    .map(round2).filter(t => t >= -domain && t <= domain))].sort((x, y) => x - y);
  const feasibleAt = (t: number) => !planPair(route, contacts, moves, t, energy).failure;

  const pieces: Piece[] = [];
  criticals.forEach((t, index) => {
    if (feasibleAt(t)) pieces.push({ from: t, to: t, fromOpen: false, toOpen: false });
    const nextCritical = criticals[index + 1];
    if (nextCritical !== undefined && nextCritical - t > EPS && feasibleAt(round2((t + nextCritical) / 2)))
      pieces.push({ from: t, to: nextCritical, fromOpen: true, toOpen: true });
  });
  const merged: Piece[] = [];
  for (const piece of pieces.sort((x, y) => x.from - y.from)) {
    const last = merged[merged.length - 1];
    const touches = last && piece.from <= last.to + EPS
      && !(Math.abs(piece.from - last.to) <= EPS && last.toOpen && piece.fromOpen);
    if (touches) {
      if (piece.to > last.to + EPS) { last.to = piece.to; last.toOpen = piece.toOpen; }
      else if (Math.abs(piece.to - last.to) <= EPS) last.toOpen = last.toOpen && piece.toOpen;
    } else merged.push({ ...piece });
  }

  const samples: CostSample[] = [];
  for (let t = -domain; t <= domain + EPS; t += OFFSET_STEP) {
    const offset = round2(t);
    const plan = planPair(route, contacts, moves, offset, energy);
    samples.push({ offset, cost: plan.failure ? null : plan.cost });
  }
  const costAt = (t: number) => {
    const plan = planPair(route, contacts, moves, t, energy);
    return plan.failure ? null : plan.cost;
  };
  const windows: OffsetWindow[] = merged.map(piece => {
    const costs = samples.filter(sample => sample.cost !== null && sample.offset >= piece.from - EPS && sample.offset <= piece.to + EPS)
      .map(sample => ({ offset: sample.offset, cost: sample.cost as number }));
    for (const t of [piece.from, piece.to]) {
      const cost = costAt(t);
      if (cost !== null && !costs.some(item => Math.abs(item.offset - t) <= EPS)) costs.push({ offset: t, cost });
    }
    const best = costs.reduce((min, item) =>
      item.cost < min.cost || (item.cost === min.cost && Math.abs(item.offset) < Math.abs(min.offset)) ? item : min);
    return {
      from: piece.from, to: piece.to, fromOpen: piece.fromOpen, toOpen: piece.toOpen,
      bestOffset: best.offset, minCost: best.cost, maxCost: Math.max(...costs.map(item => item.cost)),
    };
  });

  const blocked: BlockedWindow[] = [];
  const pushBlock = (from: number, to: number, fromOpen: boolean, toOpen: boolean) => {
    const at = to - from > EPS ? round2((from + to) / 2) : from;
    const plan = planPair(route, contacts, moves, at, energy);
    const reason = plan.failure ?? 'energy';
    blocked.push({ from, to, fromOpen, toOpen, reason, detail: failureDetail(plan) });
  };
  let cursor = -domain;
  let cursorCovered = false;
  for (const window of windows) {
    if (window.from > cursor + EPS) pushBlock(cursor, window.from, cursorCovered, !window.fromOpen);
    else if (window.fromOpen && !cursorCovered && Math.abs(window.from - cursor) <= EPS && window.from > -domain + EPS)
      pushBlock(window.from, window.from, false, false);
    cursor = Math.max(cursor, window.to);
    cursorCovered = !window.toOpen;
  }
  if (cursor < domain - EPS) pushBlock(cursor, domain, cursorCovered, false);

  const best = windows.length
    ? windows.reduce((min, window) => window.minCost < min.minCost ? window : min)
    : null;
  return {
    flights, domain, windows, blocked, samples,
    best: best ? { offset: best.bestOffset, cost: best.minCost } : null,
  };
}

/** 结算一次双肢动作：作为一条记录入库，单步记录格式保持兼容 */
export function settlePair(route: Route, contacts: Contacts, energy: number, preview: PairPreview) {
  const record: MoveRecord = {
    move: preview.moves[0],
    next: preview.next,
    cost: preview.cost,
    distance: preview.distance[0],
    reach: preview.reach[0],
    support: preview.worst,
    landing: preview.landing,
    failure: preview.failure,
    before: { ...contacts },
    energyBefore: energy,
    energyAfter: Math.max(0, energy - preview.cost),
    pair: {
      second: preview.moves[1],
      offset: preview.timeline.offset,
      timeline: preview.timeline,
      failureAt: preview.failureAt,
      failureWindow: preview.failureWindow,
      failureLimb: preview.failureLimb,
      distance: preview.distance,
      reach: preview.reach,
      costParts: preview.costParts,
    },
  };
  const finish = !preview.failure && preview.moves.some(move => move.target === route.finish);
  const result = preview.failure ? 'fall' : finish ? 'success' : null;
  return { record, result } as const;
}

interface FailureSource {
  moves: [Move, Move];
  timeline: PairTimeline;
  failure: Failure | null;
  failureLimb: Limb | null;
  failureWindow: [number, number] | null;
}

/** 失败原因的具体描述：涉及哪只肢体、哪个落点、多低的余量 */
export function failureDetail(plan: FailureSource): string {
  if (!plan.failure) return '';
  const limbText = plan.failureLimb ? limbNames[plan.failureLimb] : '';
  if (plan.failure === 'reach') return limbText + '超出可触及范围';
  if (plan.failure === 'occupied') {
    const move = plan.moves.find(item => item.limb === plan.failureLimb);
    return '落点 ' + (move?.target ?? '?') + ' 尚未完全释放，即被' + limbText + '抢占';
  }
  if (plan.failure === 'energy') return '剩余体力不足';
  const phase = plan.timeline.phases.find(item => item.balance.margin < 0
    && plan.failureWindow !== null
    && item.from >= plan.failureWindow[0] - EPS && item.from <= plan.failureWindow[1] + EPS)
    ?? plan.timeline.phases.find(item => item.balance.margin < 0);
  if (!phase) return '落定后支撑不足，发生失衡';
  const who = phase.airborne.length > 1 ? '双肢同时腾空' : limbNames[phase.airborne[0]] + '悬空';
  return who + '期间支撑余量 ' + phase.balance.margin + '，发生失衡';
}

export interface TimelineEvent {
  t: number;
  limb: Limb;
  kind: 'release' | 'land';
  hold: string;
}

/** 共同时间轴上的事件序列（时间已换算到从 0 开始） */
export function timelineEvents(contacts: Contacts, moves: [Move, Move], timeline: PairTimeline): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { t: timeline.releases[0], limb: moves[0].limb, kind: 'release', hold: contacts[moves[0].limb] },
    { t: timeline.releases[1], limb: moves[1].limb, kind: 'release', hold: contacts[moves[1].limb] },
    { t: timeline.landings[0], limb: moves[0].limb, kind: 'land', hold: moves[0].target },
    { t: timeline.landings[1], limb: moves[1].limb, kind: 'land', hold: moves[1].target },
  ];
  return events
    .sort((x, y) => x.t - y.t || (x.kind === y.kind ? 0 : x.kind === 'release' ? -1 : 1))
    .map(event => ({ ...event, t: round2(event.t - timeline.start) }));
}

/** 时差的人话描述：谁先动、错开多少 */
export function offsetLabel(offset: number, moves: [Move, Move]) {
  if (Math.abs(offset) < EPS) return '同步离点';
  const leader = offset > 0 ? moves[0].limb : moves[1].limb;
  return limbNames[leader] + '先动 ' + Math.abs(offset).toFixed(2) + 's';
}

export function formatOffset(t: number) {
  return (t > 0 ? '+' : '') + t.toFixed(2) + 's';
}

/** 可行区间的文字描述 */
export function windowLabel(window: OffsetWindow, moves: [Move, Move]) {
  if (Math.abs(window.from - window.to) < EPS) return '仅 ' + formatOffset(window.from) + ' 恰好衔接';
  const lead = window.to <= EPS ? limbNames[moves[1].limb] + '先动'
    : window.from >= -EPS ? limbNames[moves[0].limb] + '先动'
      : '可同步离点';
  return formatOffset(window.from) + ' ~ ' + formatOffset(window.to) + ' · ' + lead;
}
