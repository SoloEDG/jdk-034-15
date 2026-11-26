import { computed, ref, type Ref } from 'vue';
import type { Contacts, Limb, Move, Route } from '../../../shared/types';
import { holdAt } from '../../wall';
import { isHand, limbNames } from '../../limbs';
import { OFFSET_DOMAIN, OFFSET_STEP, analyzePair, planPair, validateTargets } from '../lib/plan';

export function usePair(route: Ref<Route>, contacts: Ref<Contacts>, energy: Ref<number>) {
  const active = ref(false);
  const members = ref<Limb[]>(['lf', 'rf']);
  const targets = ref<(string | null)[]>([null, null]);
  const offset = ref(0);
  const editing = ref<0 | 1>(0);
  const hint = ref('');

  const moves = computed<[Move, Move] | null>(() => {
    const [first, second] = targets.value;
    return members.value.length === 2 && first && second
      ? [{ limb: members.value[0], target: first }, { limb: members.value[1], target: second }]
      : null;
  });
  const invalid = computed(() => moves.value ? validateTargets(route.value, contacts.value, moves.value) : null);
  const analysis = computed(() =>
    moves.value && !invalid.value ? analyzePair(route.value, contacts.value, moves.value, energy.value) : null);
  const preview = computed(() =>
    moves.value && !invalid.value ? planPair(route.value, contacts.value, moves.value, offset.value, energy.value) : null);

  function enter() {
    active.value = true;
    hint.value = '';
    if (members.value.length !== 2) members.value = ['lf', 'rf'];
    if (!targets.value[0] && !targets.value[1]) swap();
  }
  function exit() {
    active.value = false;
    hint.value = '';
  }
  function toggle(limb: Limb) {
    hint.value = '';
    members.value = members.value.includes(limb)
      ? members.value.filter(item => item !== limb)
      : [...members.value, limb].slice(-2);
    targets.value = [null, null];
    offset.value = 0;
  }
  function swap() {
    if (members.value.length !== 2) return;
    targets.value = [contacts.value[members.value[1]], contacts.value[members.value[0]]];
    hint.value = '';
  }
  function assign(id: string) {
    if (members.value.length !== 2) { hint.value = '请先在肢体落点中选择两只肢体'; return; }
    const limb = members.value[editing.value];
    const hold = holdAt(route.value, id);
    if (isHand(limb) === (hold.kind === 'step')) { hint.value = '岩点类型与' + limbNames[limb] + '不匹配'; return; }
    if (contacts.value[limb] === id) { hint.value = limbNames[limb] + '已在岩点 ' + id + ' 上'; return; }
    if (targets.value[1 - editing.value] === id) { hint.value = '两个落点不能相同'; return; }
    const occupant = (Object.keys(contacts.value) as Limb[]).find(item =>
      !members.value.includes(item) && contacts.value[item] === id);
    if (occupant) { hint.value = '岩点 ' + id + ' 被' + limbNames[occupant] + '占用'; return; }
    targets.value[editing.value] = id;
    editing.value = (1 - editing.value) as 0 | 1;
    hint.value = '';
  }
  function setOffset(value: number) {
    const snapped = Math.round(value / OFFSET_STEP) * OFFSET_STEP;
    offset.value = Math.max(-OFFSET_DOMAIN, Math.min(OFFSET_DOMAIN, Math.round(snapped * 100) / 100));
  }
  function reset() {
    active.value = false;
    members.value = ['lf', 'rf'];
    targets.value = [null, null];
    offset.value = 0;
    editing.value = 0;
    hint.value = '';
  }

  return {
    active, members, targets, offset, editing, hint, moves, invalid, analysis, preview, contacts,
    enter, exit, toggle, swap, assign, setOffset, reset,
  };
}

export type PairApi = ReturnType<typeof usePair>;
