export type Limb = 'lh' | 'rh' | 'lf' | 'rf';
export type Contacts = Record<Limb, string>;
export type HoldKind = 'jug' | 'edge' | 'slope' | 'step';

export interface Point {
  x: number;
  y: number;
}

export interface Hold extends Point {
  id: string;
  kind: HoldKind;
  angle: number;
}

export interface Route {
  id: string;
  name: string;
  grade: string;
  color: string;
  tilt: number;
  energy: number;
  start: Contacts;
  finish: string;
  holds: Hold[];
}

export interface Move {
  limb: Limb;
  target: string;
}

export interface Balance {
  margin: number;
  span: number;
}

export type Failure = 'reach' | 'support' | 'energy' | 'occupied';

export interface Preview {
  move: Move;
  next: Contacts;
  cost: number;
  distance: number;
  reach: number;
  support: Balance;
  landing: Balance;
  failure: Failure | null;
}

/** 双肢交错动作中某一相位的支撑情况（共同时间轴上的一小段） */
export interface Phase {
  from: number;
  to: number;
  airborne: Limb[];
  balance: Balance;
}

/** 双肢动作在共同时间轴上的完整时序 */
export interface PairTimeline {
  offset: number;
  flights: [number, number];
  releases: [number, number];
  landings: [number, number];
  start: number;
  duration: number;
  phases: Phase[];
}

export interface PairPreview {
  moves: [Move, Move];
  timeline: PairTimeline;
  next: Contacts;
  cost: number;
  costParts: [number, number, number];
  distance: [number, number];
  reach: [number, number];
  worst: Balance;
  landing: Balance;
  failure: Failure | null;
  failureAt: number | null;
  failureWindow: [number, number] | null;
  failureLimb: Limb | null;
}

export interface MoveRecord extends Preview {
  before: Contacts;
  energyBefore: number;
  energyAfter: number;
  pair?: PairDetail;
}

/** 单条记录中保存的第二肢体与共同时间轴，供回看定位 */
export interface PairDetail {
  second: Move;
  offset: number;
  timeline: PairTimeline;
  failureAt: number | null;
  failureWindow: [number, number] | null;
  failureLimb: Limb | null;
  distance: [number, number];
  reach: [number, number];
  costParts: [number, number, number];
}

export interface Attempt {
  id: string;
  routeId: string;
  result: 'success' | 'fall';
  moves: MoveRecord[];
  at: number;
}
