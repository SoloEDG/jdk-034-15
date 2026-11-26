import { computed } from 'vue';
import type { Limb } from '../shared/types';
import { holdAt, routes, useWall } from '../features/wall';
import { balance, useLimbs } from '../features/limbs';
import { useStamina } from '../features/stamina';
import { useActions } from '../features/actions';
import { settlePair, usePair } from '../features/pair';
import { useRecords } from '../features/records';

export function useChallenge() {
  const wall = useWall();
  const limbs = useLimbs(wall.route.value.start);
  const stamina = useStamina(wall.route.value.energy);
  const actions = useActions(wall.route, limbs.contacts, limbs.selected, stamina.remaining);
  const pair = usePair(wall.route, limbs.contacts, stamina.remaining);
  const records = useRecords();
  const shownRoute = computed(() => routes.find(item => item.id === records.active.value?.routeId) ?? wall.route.value);
  const shownContacts = computed(() => {
    const frame = records.frame.value;
    return frame ? (frame.failure ? frame.before : frame.next) : limbs.contacts.value;
  });
  const shownBalance = computed(() => balance(shownRoute.value, shownContacts.value));
  const targetMarks = computed(() => {
    const frame = records.frame.value;
    const ids = frame ? [frame.move.target, frame.pair?.second.target]
      : pair.active.value ? pair.targets.value
        : [actions.target.value];
    return ids.filter((id): id is string => Boolean(id)).map(id => holdAt(shownRoute.value, id));
  });
  const shownStates = computed(() => {
    if (records.active.value)
      return { ...Object.fromEntries(Object.values(shownContacts.value).map(id => [id, 'occupied'])), ...Object.fromEntries(targetMarks.value.map(hold => [hold.id, 'target'])) };
    if (pair.active.value)
      return { ...Object.fromEntries(Object.values(limbs.contacts.value).map(id => [id, 'occupied'])), ...Object.fromEntries(pair.targets.value.filter(Boolean).map(id => [id, 'target'])) };
    return actions.states.value;
  });
  const locked = computed(() => Boolean(records.active.value || actions.result.value));
  const pairActive = computed(() => pair.active.value && !records.active.value);
  const pairMembers = computed(() => pairActive.value ? pair.members.value : null);
  const pairPending = computed(() => pairActive.value ? pair.preview.value?.cost ?? 0 : actions.preview.value?.cost ?? 0);

  function start(id: string) {
    records.close();
    wall.choose(id);
    limbs.reset(wall.route.value.start);
    stamina.reset(wall.route.value.energy);
    actions.reset();
    pair.reset();
  }
  function chooseLimb(limb: Limb) {
    if (locked.value) return;
    if (pair.active.value) { pair.toggle(limb); return; }
    limbs.selected.value = limb;
    actions.target.value = null;
  }
  function chooseHold(id: string) {
    if (locked.value) return;
    if (pair.active.value) { pair.assign(id); return; }
    actions.choose(id);
  }
  function enterPair() {
    if (locked.value) return;
    actions.target.value = null;
    pair.enter();
  }
  function execute() {
    if (locked.value) return;
    const move = actions.execute();
    if (!move) return;
    stamina.spend(move.cost);
    if (!move.failure) limbs.land(move.next);
    if (actions.result.value) {
      records.add(wall.route.value.id, actions.result.value, actions.moves.value);
    }
  }
  function executePair() {
    if (locked.value || !pair.preview.value) return;
    const change = settlePair(wall.route.value, limbs.contacts.value, stamina.remaining.value, pair.preview.value);
    actions.moves.value.push(change.record);
    actions.result.value = change.result;
    stamina.spend(change.record.cost);
    if (!change.record.failure) limbs.land(change.record.next);
    pair.exit();
    if (actions.result.value) {
      records.add(wall.route.value.id, actions.result.value, actions.moves.value);
    }
  }

  return {
    ...wall, ...limbs, ...stamina, ...actions, ...records, pair, pairActive, pairMembers, pairPending,
    shownRoute, shownContacts, shownBalance, shownStates, targetMarks, locked,
    start, chooseLimb, chooseHold, enterPair, execute, executePair,
  };
}
