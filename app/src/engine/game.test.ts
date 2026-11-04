import { describe, expect, it } from 'vitest';
import { RANK } from './cards';
import { abilityCandidates, apply, auditCards, card, newGame } from './game';
import { RuleError, type CardId, type Command, type GameState } from './types';
import { viewFor } from './view';

/* ---------- arranging exact situations ---------- */
function freeCard(s: GameState, rank: number, used: Set<CardId>): CardId {
  const id = Object.values(s.cards).find(c => c.rank === rank && !used.has(c.id))?.id;
  if (!id) throw new Error('no free card of rank ' + rank);
  used.add(id);
  return id;
}
interface Setup {
  hands: (number | string)[][];
  top?: number[];
  discard?: number[];
  row?: number[];
  known?: boolean;
}
/** Ranks are numbers, and a string such as '3^' means that rank face up. */
function arrange(setup: Setup, seed = 1): GameState {
  const s = newGame(setup.hands.map((_, i) => 'P' + i), seed);
  const used = new Set<CardId>();
  Object.values(s.cards).forEach(c => { c.faceUp = false; c.guarding = null; });
  s.players.forEach((p, i) => {
    p.known = [];
    p.village = (setup.hands[i] ?? []).map(spec => {
      const up = typeof spec === 'string';
      const id = freeCard(s, up ? parseInt(spec) : (spec as number), used);
      card(s, id).faceUp = up;
      if (setup.known && i === 0) p.known.push(id);
      return id;
    });
  });
  s.discard = (setup.discard ?? [9]).map(r => {
    const id = freeCard(s, r, used);
    card(s, id).faceUp = true;
    return id;
  });
  s.row = (setup.row ?? []).map(r => {
    const id = freeCard(s, r, used);
    card(s, id).faceUp = true;
    return id;
  });
  const top = (setup.top ?? []).map(r => freeCard(s, r, used));
  s.removed = [];
  s.deck = [...top, ...Object.keys(s.cards).filter(id => !used.has(id))];
  s.phase = 'turn';
  s.current = 0;
  s.starter = 0;
  return s;
}
const ranks = (s: GameState, p: number): number[] => (s.players[p]?.village ?? []).map(id => card(s, id).rank);
const at = (s: GameState, p: number, i: number): CardId => s.players[p]?.village[i] as CardId;
const run = (s: GameState, p: number, ...cmds: Command[]): GameState =>
  cmds.reduce((state, cmd) => apply(state, p, cmd).state, s);
const refuses = (s: GameState, p: number, cmd: Command): void => {
  expect(() => apply(s, p, cmd)).toThrow(RuleError);
};
const drawAnd = (s: GameState): { state: GameState; hand: CardId } => {
  const state = apply(s, 0, { type: 'draw' }).state;
  return { state, hand: state.turn.hand[0] as CardId };
};

describe('setup', () => {
  it.each([2, 3, 4])('deals 52 cards correctly for %i players', n => {
    const s = newGame(Array.from({ length: n }, (_, i) => 'P' + i), 7);
    expect(Object.keys(s.cards)).toHaveLength(52);
    expect(s.players.every(p => p.village.length === 5)).toBe(true);
    expect(s.deck).toHaveLength(31);
    expect(s.removed).toHaveLength(5 * (4 - n));
    auditCards(s);
  });
  it('is the same game for the same seed', () => {
    expect(newGame(['A', 'B'], 5).deck).toEqual(newGame(['A', 'B'], 5).deck);
    expect(newGame(['A', 'B'], 5).deck).not.toEqual(newGame(['A', 'B'], 6).deck);
  });
  it('starts play only after everyone has seen two cards', () => {
    const s = newGame(['A', 'B'], 3);
    const a = run(s, 0, { type: 'peek', cards: [at(s, 0, 0), at(s, 0, 1)] });
    expect(a.phase).toBe('peek');
    refuses(a, 0, { type: 'peek', cards: [at(s, 0, 0), at(s, 0, 1)] });
    const b = run(a, 1, { type: 'peek', cards: [at(s, 1, 0), at(s, 1, 1)] });
    expect(b.phase).toBe('turn');
    expect(b.players[0]?.known).toHaveLength(2);
  });
});

describe('a normal turn', () => {
  it('a drawn exchange goes face down, the old card burns', () => {
    const s = arrange({ hands: [[10, 8, 7, 6, 5], [1, 2, 3, 4, 5]], top: [2] });
    const { state, hand } = drawAnd(s);
    const old = at(s, 0, 0);
    const after = run(state, 0, { type: 'exchange', card: hand, targets: [old] });
    expect(at(after, 0, 0)).toBe(hand);
    expect(card(after, hand).faceUp).toBe(false);
    expect(after.discard.at(-1)).toBe(old);
    expect(card(after, old).faceUp).toBe(true);
  });
  it('a card from the discard stays face up and cannot just be burned', () => {
    const s = arrange({ hands: [[10, 8, 7, 6, 5], [1, 2, 3, 4, 5]], discard: [0] });
    const a = run(s, 0, { type: 'takeDiscard' });
    const taken = a.turn.hand[0] as CardId;
    refuses(a, 0, { type: 'burn', card: taken, useAbility: false });
    const b = run(a, 0, { type: 'exchange', card: taken, targets: [at(s, 0, 2)] });
    expect(card(b, taken).faceUp).toBe(true);
    expect(at(b, 0, 2)).toBe(taken);
  });
  it('only the current player may act', () => {
    refuses(arrange({ hands: [[1], [2]] }), 1, { type: 'draw' });
  });
  it('the turn passes on confirm', () => {
    const { state, hand } = drawAnd(arrange({ hands: [[10, 8], [1, 2]], top: [7] }));
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: false });
    expect(a.current).toBe(0);
    expect(run(a, 0, { type: 'confirm' }).current).toBe(1);
  });
  it('the old state is never changed', () => {
    const s = arrange({ hands: [[10, 8], [1, 2]], top: [7] });
    const copy = structuredClone(s);
    apply(s, 0, { type: 'draw' });
    expect(s).toEqual(copy);
  });
});

describe('exchanging several cards', () => {
  it('a matching set burns, and the new card picks an emptied spot', () => {
    const s = arrange({ hands: [[10, 5, 10, 3, 2], [1, 2, 3, 4, 5]], top: [0] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'exchange', card: hand, targets: [at(s, 0, 0), at(s, 0, 2)] });
    expect(a.turn.step).toBe('placeSpot');
    refuses(a, 0, { type: 'placeSpot', index: 1 });
    const b = run(a, 0, { type: 'placeSpot', index: 2 });
    expect(ranks(b, 0)).toEqual([5, 0, 3, 2]);
    expect(b.turn.step).toBe('confirm');
    auditCards(b);
  });
  it('a mismatch returns all face down and adds the new card at an end', () => {
    const s = arrange({ hands: [['10^', 5, 3, 2, 1], [1, 2, 3, 4, 5]], top: [0] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'exchange', card: hand, targets: [at(s, 0, 0), at(s, 0, 1)] });
    expect(a.turn.step).toBe('placeEnd');
    const b = run(a, 0, { type: 'placeEnd', side: 'end' });
    expect(ranks(b, 0)).toEqual([10, 5, 3, 2, 1, 0]);
    expect(card(b, at(s, 0, 0)).faceUp).toBe(false);
    expect(b.turn.step).toBe('confirm');
    /* the whole table saw the set before it turned back */
    expect(b.players[1]?.known).toEqual(expect.arrayContaining([at(s, 0, 0), at(s, 0, 1)]));
  });
  it('three mismatched cards add a penalty card nobody has seen', () => {
    const s = arrange({ hands: [[10, 5, 3, 2, 1], [1, 2, 3, 4, 5]], top: [0, 7] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'exchange', card: hand, targets: [at(s, 0, 0), at(s, 0, 1), at(s, 0, 2)] });
    const b = run(a, 0, { type: 'placeEnd', side: 'start' });
    expect(b.turn.step).toBe('placeEnd');
    const penalty = b.turn.placing?.card as CardId;
    expect(card(b, penalty).rank).toBe(7);
    const c = run(b, 0, { type: 'placeEnd', side: 'end' });
    expect(ranks(c, 0)).toEqual([0, 10, 5, 3, 2, 1, 7]);
    expect(card(c, penalty).faceUp).toBe(false);
    expect(c.players[0]?.known).not.toContain(penalty);
    expect(c.turn.undo).toBeNull();
  });
  it('the doppelganger matches anything and burns under the others', () => {
    const s = arrange({ hands: [[13, 12, 12, 6, 2], [1, 2, 3, 4, 5]], top: [0] });
    const { state, hand } = drawAnd(s);
    const doppel = at(s, 0, 0);
    const a = run(state, 0, { type: 'exchange', card: hand, targets: [at(s, 0, 1), doppel, at(s, 0, 2)] });
    expect(a.turn.step).toBe('placeSpot');
    expect(a.discard.at(-3)).toBe(doppel);
  });
  it('two doppelgangers can leave together', () => {
    const s = arrange({ hands: [[13, 13, 6, 2], [1, 2, 3, 4]], top: [0] });
    const { state, hand } = drawAnd(s);
    expect(run(state, 0, { type: 'exchange', card: hand, targets: [at(s, 0, 0), at(s, 0, 1)] }).turn.step).toBe('placeSpot');
  });
});

describe('villagers', () => {
  it('two face-up villagers end the round at once', () => {
    const s = arrange({ hands: [['0^', 8, 9], [0, 5, 4]], top: [6] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: true });
    const b = apply(a, 0, { type: 'target', cards: [at(s, 1, 0)] });
    expect(b.state.phase).toBe('roundEnd');
    expect(b.state.result?.reason).toBe('villager');
    expect(b.state.result?.caller).toBeNull();
  });
  it('a villager on the discard pile does not count', () => {
    const s = arrange({ hands: [['0^', 8, 9], [1, 5, 4]], discard: [0], top: [5] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: false });
    expect(a.phase).toBe('turn');
  });
});

describe('squires', () => {
  it('fill the row after a turn, one per face-up squire in any village', () => {
    const s = arrange({ hands: [['1^', 8], ['1^', 7]], top: [5, 2, 3] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: false }, { type: 'confirm' });
    expect(a.row.map(id => card(a, id).rank)).toEqual([2, 3]);
  });
  it('a row card stays face up in the village', () => {
    const s = arrange({ hands: [['1^', 8], [7, 6]], row: [2] });
    const rowCard = s.row[0] as CardId;
    const a = run(s, 0, { type: 'takeRow', card: rowCard }, { type: 'exchange', card: rowCard, targets: [at(s, 0, 1)] });
    expect(card(a, rowCard).faceUp).toBe(true);
  });
  it('a row card can be burned for its ability (rule decision 2)', () => {
    const s = arrange({ hands: [['1^', 8], [7, 6]], row: [9] });
    const rowCard = s.row[0] as CardId;
    const a = run(s, 0, { type: 'takeRow', card: rowCard }, { type: 'burn', card: rowCard, useAbility: true });
    expect(a.turn.pending).toBe(RANK.seer);
  });
  it('extra cards stay when squires leave, without being replaced', () => {
    const s = arrange({ hands: [[7, 8], [6, 5]], row: [2, 3], top: [4] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: false }, { type: 'confirm' });
    expect(a.row).toHaveLength(2);
  });
  it('play continues until the deck and the row are both empty', () => {
    const s = arrange({ hands: [['1^', 8], [7, 6]], top: [5] });
    s.deck = s.deck.slice(0, 1);
    s.removed = Object.keys(s.cards).filter(id => !s.deck.includes(id) && !s.discard.includes(id) && !s.players.flatMap(p => p.village).includes(id));
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: false }, { type: 'confirm' });
    expect(a.result?.reason).toBe('deck');
  });
});

describe('empath', () => {
  it('shows one card per face-up empath, and only your own', () => {
    const s = arrange({ hands: [['2^', 8, 7], [6, 5]] });
    const a = apply(s, 0, { type: 'empathPeek', card: at(s, 0, 1) });
    expect(a.events.some(e => e.type === 'saw' && e.rank === 8 && e.to === 0)).toBe(true);
    refuses(a.state, 0, { type: 'empathPeek', card: at(s, 0, 2) });
    refuses(s, 0, { type: 'empathPeek', card: at(s, 1, 0) });
  });
});

describe('bodyguard', () => {
  const guarded = (): GameState => {
    const s = arrange({ hands: [[7, 8, 9], ['3^', 5, 2]], top: [12, 9, 11, 6, 8] });
    return run({ ...s, current: 1 }, 1, { type: 'guard', guard: at(s, 1, 0), target: at(s, 1, 1) });
  };
  const asFirst = (s: GameState): GameState => ({ ...s, current: 0 });
  it('blocks the robber, seers, revealer and witch from both cards', () => {
    const s = asFirst(guarded());
    for (const r of [RANK.robber, RANK.seer, RANK.apprenticeSeer, RANK.revealer]) {
      const c = abilityCandidates(s, 0, r);
      expect(c).not.toContain(at(s, 1, 1));
      expect(c).toContain(at(s, 1, 2));
    }
    expect(abilityCandidates(s, 0, RANK.robber)).not.toContain(at(s, 1, 0));
  });
  it('the owner can still burn a guarded card', () => {
    const s = guarded();
    const t = run(s, 1, { type: 'draw' });
    const a = run(t, 1, { type: 'exchange', card: t.turn.hand[0] as CardId, targets: [at(s, 1, 1)] });
    expect(card(a, at(s, 1, 0)).guarding).toBeNull();
  });
  it('moves and comes off', () => {
    const s = guarded();
    const a = run(s, 1, { type: 'guard', guard: at(s, 1, 0), target: at(s, 1, 2) });
    expect(card(a, at(s, 1, 0)).guarding).toBe(at(s, 1, 2));
    expect(card(run(a, 1, { type: 'guard', guard: at(s, 1, 0), target: null }), at(s, 1, 0)).guarding).toBeNull();
  });
  it('an unused bodyguard is not protected', () => {
    const s = arrange({ hands: [[7, 8], ['3^', 5]] });
    expect(abilityCandidates(s, 0, RANK.robber)).toContain(at(s, 1, 0));
  });
  it('the witch cannot hit a guarded card', () => {
    const base = guarded();
    const s: GameState = { ...structuredClone(base), current: 0, turn: { ...structuredClone(base.turn), step: 'witch', hand: [base.deck[0] as CardId], source: 'deck', sideUsed: false } };
    refuses(s, 0, { type: 'witchGive', target: at(s, 1, 1) });
  });
});

describe('rascal', () => {
  it('draws one extra per rascal, keeps one, returns the rest in order', () => {
    const s = arrange({ hands: [['4^', '4^', 9], [7, 6]], top: [11, 3, 6, 2] });
    const a = run(s, 0, { type: 'draw' }, { type: 'drawMore' }, { type: 'drawMore' });
    refuses(a, 0, { type: 'drawMore' });
    const [first, middle, third] = a.turn.hand as [CardId, CardId, CardId];
    const b = run(a, 0, { type: 'burn', card: middle, useAbility: false });
    expect(b.deck.slice(0, 2)).toEqual([first, third]);
    expect(card(b, first).faceUp).toBe(false);
    auditCards(b);
  });
  it('needs a face-up rascal', () => {
    refuses(run(arrange({ hands: [[4, 9], [7, 6]] }), 0, { type: 'draw' }), 0, { type: 'drawMore' });
  });
});

describe('draw abilities', () => {
  const useAbility = (setup: Setup): { s: GameState; a: GameState } => {
    const s = arrange(setup);
    const { state, hand } = drawAnd(s);
    return { s, a: run(state, 0, { type: 'burn', card: hand, useAbility: true }) };
  };
  it('exposer flips your own card', () => {
    const { s, a } = useAbility({ hands: [[7, 8], [6, 2]], top: [5] });
    refuses(a, 0, { type: 'target', cards: [at(s, 1, 0)] });
    expect(card(run(a, 0, { type: 'target', cards: [at(s, 0, 0)] }), at(s, 0, 0)).faceUp).toBe(true);
  });
  it('revealer flips a card in any village (rule decision 1)', () => {
    const { s, a } = useAbility({ hands: [[7, 8], [6, 2]], top: [6] });
    expect(card(run(a, 0, { type: 'target', cards: [at(s, 0, 0)] }), at(s, 0, 0)).faceUp).toBe(true);
    expect(card(run(a, 0, { type: 'target', cards: [at(s, 1, 0)] }), at(s, 1, 0)).faceUp).toBe(true);
  });
  it('beholder sees up to two of your cards', () => {
    const { s, a } = useAbility({ hands: [[7, 8, 9], [6, 2]], top: [7] });
    refuses(a, 0, { type: 'target', cards: [at(s, 0, 0), at(s, 0, 1), at(s, 0, 2)] });
    const b = run(a, 0, { type: 'target', cards: [at(s, 0, 0), at(s, 0, 1)] });
    expect(b.players[0]?.known).toEqual(expect.arrayContaining([at(s, 0, 0), at(s, 0, 1)]));
  });
  it('apprentice seer sees only a rival, and the event is private', () => {
    const { s, a } = useAbility({ hands: [[7, 8], [6, 2]], top: [8] });
    refuses(a, 0, { type: 'target', cards: [at(s, 0, 0)] });
    const r = apply(a, 0, { type: 'target', cards: [at(s, 1, 0)] });
    const saw = r.events.find(e => e.type === 'saw');
    expect(saw && saw.to).toBe(0);
    expect(card(r.state, at(s, 1, 0)).faceUp).toBe(false);
  });
  it('seer sees any face-down card', () => {
    const { s, a } = useAbility({ hands: [[7, 8], [6, 2]], top: [9] });
    expect(run(a, 0, { type: 'target', cards: [at(s, 0, 0)] }).turn.step).toBe('confirm');
  });
  it('master takes any discard, which stays face up, and burns above the master', () => {
    const { s, a } = useAbility({ hands: [[12, 8], [6, 2]], discard: [0, 2, 4], top: [10] });
    const master = a.discard.at(-1) as CardId;
    refuses(a, 0, { type: 'target', cards: [master] });
    const zero = a.discard[0] as CardId;
    const b = run(a, 0, { type: 'target', cards: [zero] });
    const old = at(s, 0, 0);
    const c = run(b, 0, { type: 'exchange', card: zero, targets: [old] });
    expect(card(c, zero).faceUp).toBe(true);
    expect(c.discard.slice(-2)).toEqual([master, old]);
    auditCards(c);
  });
  it('master can leave empty handed, and can put a chosen card back', () => {
    const { a } = useAbility({ hands: [[12, 8], [6, 2]], discard: [0, 2], top: [10] });
    expect(run(a, 0, { type: 'skipAbility' }).discard.at(-1)).toBe(a.discard.at(-1));
    const b = run(a, 0, { type: 'target', cards: [a.discard[0] as CardId] }, { type: 'returnCard' });
    expect(b.turn.step).toBe('ability');
    expect(b.discard).toEqual(a.discard);
  });
  it('witch can give the top card to a rival, whose old card burns', () => {
    const { s, a } = useAbility({ hands: [[12, 8], [6, 2]], top: [11, 0] });
    expect(a.turn.step).toBe('witch');
    const top = a.turn.hand[0] as CardId;
    const old = at(s, 1, 0);
    const b = run(a, 0, { type: 'witchGive', target: old });
    expect(at(b, 1, 0)).toBe(top);
    expect(card(b, top).faceUp).toBe(false);
    expect(b.discard.at(-1)).toBe(old);
    auditCards(b);
  });
  it('witch can exchange into your own village face down', () => {
    const { s, a } = useAbility({ hands: [[12, 8], [6, 2]], top: [11, 0] });
    const top = a.turn.hand[0] as CardId;
    const b = run(a, 0, { type: 'exchange', card: top, targets: [at(s, 0, 0)] });
    expect(card(b, top).faceUp).toBe(false);
    expect(at(b, 0, 0)).toBe(top);
  });
  it('robber swaps in place and keeps each face state', () => {
    const { s, a } = useAbility({ hands: [['8^', 7], [6, 2]], top: [12] });
    const stolen = at(s, 1, 0);
    const mine = at(s, 0, 0);
    const r = apply(a, 0, { type: 'target', cards: [stolen, mine] });
    expect(at(r.state, 0, 0)).toBe(stolen);
    expect(at(r.state, 1, 0)).toBe(mine);
    expect(card(r.state, mine).faceUp).toBe(true);
    expect(card(r.state, stolen).faceUp).toBe(false);
    expect(r.events.some(e => e.type === 'saw' && e.card === stolen)).toBe(true);
  });
  it('an ability with no target passes with no effect', () => {
    const s = arrange({ hands: [['7^', '8^'], [6, 2]], top: [5] });
    const { state, hand } = drawAnd(s);
    const r = apply(state, 0, { type: 'burn', card: hand, useAbility: true });
    expect(r.state.turn.step).toBe('confirm');
    expect(r.events.some(e => e.type === 'noEffect')).toBe(true);
  });
  it('a card without a burn ability refuses it', () => {
    const { state, hand } = drawAnd(arrange({ hands: [[7, 8], [6, 2]], top: [2] }));
    refuses(state, 0, { type: 'burn', card: hand, useAbility: true });
  });
  it('a discard taken from the pile never gets its ability', () => {
    const s = arrange({ hands: [[7, 8], [6, 2]], discard: [9] });
    const a = run(s, 0, { type: 'takeDiscard' });
    refuses(a, 0, { type: 'burn', card: a.turn.hand[0] as CardId, useAbility: true });
  });
});

describe('calling for a vote', () => {
  it('needs four cards or fewer', () => {
    refuses(arrange({ hands: [[1, 2, 3, 4, 5], [6, 7]] }), 0, { type: 'call' });
  });
  it('gives everyone else one more turn, and they cannot call', () => {
    const s = arrange({ hands: [[1, 2, 0, 3], [7, 9, 8, 6], [7, 9, 8, 6]], top: [5, 6, 7] });
    const a = run(s, 0, { type: 'call' });
    expect(a.current).toBe(1);
    refuses(a, 1, { type: 'call' });
    const b = run(a, 1, { type: 'draw' });
    const c = run(b, 1, { type: 'burn', card: b.turn.hand[0] as CardId, useAbility: false }, { type: 'confirm' });
    expect(c.phase).toBe('turn');
    const d = run(c, 2, { type: 'draw' });
    const e = run(d, 2, { type: 'burn', card: d.turn.hand[0] as CardId, useAbility: false }, { type: 'confirm' });
    expect(e.phase).toBe('roundEnd');
  });
  it('cannot follow a side ability in the same turn', () => {
    const s = arrange({ hands: [['2^', 8, 7, 6], [1, 5]] });
    refuses(run(s, 0, { type: 'empathPeek', card: at(s, 0, 1) }), 0, { type: 'call' });
  });
});

describe('scoring', () => {
  const callThenFinish = (hands: Setup['hands']): GameState => {
    const s = arrange({ hands, top: [5] });
    const a = run(s, 0, { type: 'call' });
    const b = run(a, 1, { type: 'draw' });
    return run(b, 1, { type: 'burn', card: b.turn.hand[0] as CardId, useAbility: false }, { type: 'confirm' });
  };
  it('a successful call scores 0 and earns a usable amulet', () => {
    const s = callThenFinish([[1, 2, 0, 3], [7, 9, 8, 6]]);
    expect(s.result?.scores).toEqual([0, 30]);
    expect(s.amulet).toMatchObject({ holder: 0, usable: true });
    expect(s.starter).toBe(0);
  });
  it('a tied call still counts as lowest', () => {
    const s = callThenFinish([[5, 5], [6, 4]]);
    expect(s.result?.callerWon).toBe(true);
    expect(s.result?.scores).toEqual([0, 10]);
  });
  it('a failed call adds 10, and the winner starts without a usable amulet', () => {
    const s = callThenFinish([[8, 8], [1, 2]]);
    expect(s.result?.scores).toEqual([26, 3]);
    expect(s.amulet).toMatchObject({ holder: 1, usable: false });
    expect(s.starter).toBe(1);
  });
  it('no call means plain sums (rule decision 5)', () => {
    const s = arrange({ hands: [['0^', 8], [0, 1]], top: [6] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: true }, { type: 'target', cards: [at(s, 1, 0)] });
    expect(a.result?.scores).toEqual([8, 1]);
    expect(a.amulet.usable).toBe(false);
  });
  it('a tie for lowest goes to whoever held the amulet', () => {
    const s = arrange({ hands: [[8, 8], [6, 2], [6, 2]], top: [5] });
    s.amulet = { holder: 2, usable: false, on: null };
    const a = run(s, 0, { type: 'call' });
    const b = run(a, 1, { type: 'draw' });
    const c = run(b, 1, { type: 'burn', card: b.turn.hand[0] as CardId, useAbility: false }, { type: 'confirm' });
    const d = run(c, 2, { type: 'draw' });
    const e = run(d, 2, { type: 'burn', card: d.turn.hand[0] as CardId, useAbility: false }, { type: 'confirm' });
    expect(e.amulet.holder).toBe(2);
  });
  it('without the holder, a tie goes to the nearest on the starter’s left', () => {
    const s = arrange({ hands: [[8, 8], [6, 2], [6, 2]], top: [5] });
    const a = run(s, 0, { type: 'call' });
    const b = run(a, 1, { type: 'draw' });
    const c = run(b, 1, { type: 'burn', card: b.turn.hand[0] as CardId, useAbility: false }, { type: 'confirm' });
    const d = run(c, 2, { type: 'draw' });
    const e = run(d, 2, { type: 'burn', card: d.turn.hand[0] as CardId, useAbility: false }, { type: 'confirm' });
    expect(e.amulet.holder).toBe(1);
  });
});

describe('amulet', () => {
  const holding = (): GameState => {
    const s = arrange({ hands: [[2, 3, 9, 7], [6, 5, 4]], top: [12, 9] });
    s.amulet = { holder: 0, usable: true, on: null };
    return s;
  };
  it('locks the card even for its owner', () => {
    const s = holding();
    const a = run(s, 0, { type: 'placeAmulet', card: at(s, 0, 0) });
    const b = run(a, 0, { type: 'draw' });
    refuses(b, 0, { type: 'exchange', card: b.turn.hand[0] as CardId, targets: [at(s, 0, 0)] });
  });
  it('blocks calling on the same turn', () => {
    const s = holding();
    refuses(run(s, 0, { type: 'placeAmulet', card: at(s, 0, 0) }), 0, { type: 'call' });
  });
  it('is hidden from rivals’ abilities', () => {
    const s = holding();
    const a = run(s, 0, { type: 'placeAmulet', card: at(s, 0, 0) });
    expect(abilityCandidates(a, 1, RANK.seer)).not.toContain(at(s, 0, 0));
    expect(abilityCandidates(a, 1, RANK.robber)).not.toContain(at(s, 0, 0));
  });
  it('needs a usable amulet, and goes on one card only', () => {
    const s = holding();
    refuses({ ...s, amulet: { holder: 0, usable: false, on: null } }, 0, { type: 'placeAmulet', card: at(s, 0, 0) });
    refuses(run(s, 0, { type: 'placeAmulet', card: at(s, 0, 0) }), 0, { type: 'placeAmulet', card: at(s, 0, 1) });
  });
  it('cannot share a card with a bodyguard (rule decision 4)', () => {
    const s = arrange({ hands: [['3^', 8], [6, 5]] });
    s.amulet = { holder: 0, usable: true, on: null };
    const a = run(s, 0, { type: 'guard', guard: at(s, 0, 0), target: at(s, 0, 1) });
    refuses(a, 0, { type: 'placeAmulet', card: at(s, 0, 1) });
  });
  it('on the last card only drawing to burn or calling remains', () => {
    const s = arrange({ hands: [[2], [6, 5]], top: [5] });
    s.amulet = { holder: 0, usable: false, on: at(s, 0, 0) };
    refuses(s, 0, { type: 'takeDiscard' });
    const a = run(s, 0, { type: 'draw' });
    refuses(a, 0, { type: 'exchange', card: a.turn.hand[0] as CardId, targets: [at(s, 0, 0)] });
    expect(run(s, 0, { type: 'call' }).caller).toBe(0);
  });
});

describe('taking a move back', () => {
  it('burning the drawn card can be undone, with the card still in hand', () => {
    const { state, hand } = drawAnd(arrange({ hands: [[7, 8], [6, 2]], top: [5] }));
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: false });
    const b = run(a, 0, { type: 'undo' });
    expect(b.turn.step).toBe('decide');
    expect(b.turn.hand).toEqual([hand]);
    expect(b.discard).toEqual(state.discard);
  });
  it('swapping a card you already know can be undone', () => {
    const s = arrange({ hands: [[7, 8], [6, 2]], top: [5], known: true });
    const { state, hand } = drawAnd(s);
    expect(run(state, 0, { type: 'exchange', card: hand, targets: [at(s, 0, 0)] }).turn.undo).not.toBeNull();
  });
  it('swapping an unseen card cannot be undone, because it shows that card', () => {
    const s = arrange({ hands: [[7, 8], [6, 2]], top: [5] });
    const { state, hand } = drawAnd(s);
    refuses(run(state, 0, { type: 'exchange', card: hand, targets: [at(s, 0, 0)] }), 0, { type: 'undo' });
  });
  it('an ability can be taken back before a target, not after', () => {
    const s = arrange({ hands: [[7, 8], [6, 2]], top: [9] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: true });
    expect(run(a, 0, { type: 'undo' }).turn.step).toBe('decide');
    refuses(run(a, 0, { type: 'target', cards: [at(s, 1, 0)] }), 0, { type: 'undo' });
  });
  it('the witch cannot be taken back, because she shows the top card', () => {
    const { state, hand } = drawAnd(arrange({ hands: [[7, 8], [6, 2]], top: [11] }));
    expect(run(state, 0, { type: 'burn', card: hand, useAbility: true }).turn.undo).toBeNull();
  });
  it('a side ability closes the undo', () => {
    const s = arrange({ hands: [['2^', 8], [6, 2]], top: [5] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: false });
    refuses(run(a, 0, { type: 'empathPeek', card: at(s, 0, 1) }), 0, { type: 'undo' });
  });
  it('a card taken from the discard can be returned', () => {
    const s = arrange({ hands: [[7, 8], [6, 2]] });
    const a = run(s, 0, { type: 'takeDiscard' }, { type: 'returnCard' });
    expect(a.discard).toEqual(s.discard);
    expect(a.turn.step).toBe('start');
  });
  it('a deck card cannot be returned', () => {
    refuses(drawAnd(arrange({ hands: [[7, 8], [6, 2]], top: [5] })).state, 0, { type: 'returnCard' });
  });
});

describe('what a player can see', () => {
  it('never sends hidden ranks or the deck order', () => {
    const s = arrange({ hands: [[7, 8], ['6^', 2]], top: [5] });
    const v = viewFor(s, 0);
    expect(v.players[1]?.village.map(c => c.rank)).toEqual([6, null]);
    expect(v.players[0]?.village.map(c => c.rank)).toEqual([null, null]);
    expect(v.deckCount).toBe(s.deck.length);
    expect(JSON.stringify(v)).not.toContain('known');
    expect(JSON.stringify(v)).not.toContain(s.deck[0] as string);
  });
  it('a card in hand is hidden from rivals', () => {
    const { state } = drawAnd(arrange({ hands: [[7, 8], [6, 2]], top: [5] }));
    expect(viewFor(state, 0).hand[0]?.rank).toBe(5);
    expect(viewFor(state, 1).hand[0]?.rank).toBeNull();
  });
  it('everything opens when the round ends', () => {
    const s = arrange({ hands: [['0^', 8], [0, 1]], top: [6] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: true }, { type: 'target', cards: [at(s, 1, 0)] });
    expect(viewFor(a, 0).players[1]?.village.map(c => c.rank)).toEqual([0, 1]);
  });
});

/* ---------- whole games played by random moves: nothing may ever break ---------- */
function randomMove(s: GameState, rand: () => number): { player: number; cmd: Command } {
  const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)] as T;
  if (s.phase === 'peek') {
    const player = s.peeked.findIndex(p => !p);
    const v = s.players[player]?.village ?? [];
    return { player, cmd: { type: 'peek', cards: [v[0] as CardId, v[1] as CardId] } };
  }
  if (s.phase === 'roundEnd') return { player: 0, cmd: { type: 'nextRound' } };
  const player = s.current;
  const own = s.players[player]?.village ?? [];
  const open = own.filter(id => s.amulet.on !== id);
  const hand = s.turn.hand;
  switch (s.turn.step) {
    case 'start': {
      const options: Command[] = [];
      if (s.deck.length) options.push({ type: 'draw' });
      if (s.discard.length && open.length) options.push({ type: 'takeDiscard' });
      s.row.forEach(c => options.push({ type: 'takeRow', card: c }));
      if (own.length <= 4 && s.caller === null) options.push({ type: 'call' });
      if (!options.length) return { player, cmd: { type: 'draw' } };
      return { player, cmd: pick(options) };
    }
    case 'decide': {
      const c = pick(hand);
      if (s.turn.source !== 'discard' && (rand() < 0.5 || !open.length)) {
        const r = card(s, c).rank;
        return { player, cmd: { type: 'burn', card: c, useAbility: r >= 5 && r <= 12 && rand() < 0.8 } };
      }
      const n = Math.min(open.length, 1 + Math.floor(rand() * 3));
      const targets = [...open].sort(() => rand() - 0.5).slice(0, n);
      return { player, cmd: { type: 'exchange', card: c, targets } };
    }
    case 'witch': {
      const others = s.players.flatMap((p, i) => (i === player ? [] : p.village)).filter(id => {
        const linked = card(s, id).guarding !== null || Object.values(s.cards).some(x => x.guarding === id);
        return !linked && s.amulet.on !== id;
      });
      if (others.length && (rand() < 0.5 || !open.length)) return { player, cmd: { type: 'witchGive', target: pick(others) } };
      return { player, cmd: { type: 'exchange', card: hand[0] as CardId, targets: [pick(open)] } };
    }
    case 'placeSpot': return { player, cmd: { type: 'placeSpot', index: pick(s.turn.placing?.spots ?? []) } };
    case 'placeEnd': return { player, cmd: { type: 'placeEnd', side: rand() < 0.5 ? 'start' : 'end' } };
    case 'ability': {
      const r = s.turn.pending as number;
      const c = abilityCandidates(s, player, r);
      if (rand() < 0.1) return { player, cmd: { type: 'skipAbility' } };
      if (r === RANK.robber) return { player, cmd: { type: 'target', cards: [pick(c), pick(open)] } };
      return { player, cmd: { type: 'target', cards: [pick(c)] } };
    }
    case 'confirm':
    default:
      return { player, cmd: { type: 'confirm' } };
  }
}

describe('random full games', () => {
  it.each([2, 3, 4])('stay legal to the end with %i players', n => {
    for (let seed = 1; seed <= 120; seed++) {
      let x = seed * 9301;
      const rand = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
      let s = newGame(Array.from({ length: n }, (_, i) => 'P' + i), seed);
      let moves = 0;
      while (s.phase !== 'gameEnd') {
        const { player, cmd } = randomMove(s, rand);
        s = apply(s, player, cmd).state;
        auditCards(s);
        if (++moves > 20000) throw new Error('game never ended');
      }
      expect(s.round).toBe(4);
      expect(s.winner).not.toBeNull();
      expect(s.players.every(p => p.scores.length === 4)).toBe(true);
      const low = Math.min(...s.players.map(p => p.total));
      expect(s.players[s.winner as number]?.total).toBe(low);
    }
  });
});

describe('fixes from the rulebook review', () => {
  it('a card id never tells its rank', () => {
    const villagerIds = new Set([1, 2, 3, 4, 5, 6].map(seed => {
      const s = newGame(['A', 'B'], seed);
      return Object.values(s.cards).filter(c => c.rank === RANK.villager).map(c => c.id).sort().join();
    }));
    expect(villagerIds.size).toBeGreaterThan(1);
  });
  it('a call still scores when the deck runs out during the last turns', () => {
    const s = arrange({ hands: [[1, 2, 0, 3], [7, 9, 8, 6]], top: [5] });
    s.deck = s.deck.slice(0, 1);
    s.removed = Object.keys(s.cards).filter(id => !s.deck.includes(id) && !s.discard.includes(id) && !s.players.flatMap(p => p.village).includes(id));
    const a = run(s, 0, { type: 'call' });
    const b = run(a, 1, { type: 'draw' });
    const c = run(b, 1, { type: 'burn', card: b.turn.hand[0] as CardId, useAbility: false }, { type: 'confirm' });
    expect(c.result).toMatchObject({ caller: 0, callerWon: true, scores: [0, 30] });
    expect(c.amulet).toMatchObject({ holder: 0, usable: true });
  });
  it('a call still scores when two villagers end the round', () => {
    const s = arrange({ hands: [['0^', 2, 3], [0, 9, 8]], top: [6, 5] });
    const a = run(s, 0, { type: 'call' });
    const b = run(a, 1, { type: 'draw' });
    const c = run(b, 1, { type: 'burn', card: b.turn.hand[0] as CardId, useAbility: true }, { type: 'target', cards: [at(s, 1, 0)] });
    expect(c.result).toMatchObject({ reason: 'villager', caller: 0, callerWon: true });
  });
  it('with the amulet on your last card, the witch, master and robber do nothing', () => {
    const s = arrange({ hands: [[7], [6, 2]], discard: [3, 9] });
    s.amulet = { holder: 0, usable: true, on: at(s, 0, 0) };
    for (const r of [RANK.witch, RANK.master, RANK.robber]) expect(abilityCandidates(s, 0, r)).toEqual([]);
  });
  it('the robber still knows the card given away', () => {
    const s = arrange({ hands: [[7, 8], [6, 2]], top: [12], known: true });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: true }, { type: 'target', cards: [at(s, 1, 0), at(s, 0, 0)] });
    expect(a.players[0]?.known).toEqual(expect.arrayContaining([at(s, 0, 0), at(s, 1, 0)]));
  });
  it('the empath works while an ability waits for its target', () => {
    const s = arrange({ hands: [['2^', 8, 7], [6, 5]], top: [9] });
    const { state, hand } = drawAnd(s);
    const a = run(state, 0, { type: 'burn', card: hand, useAbility: true });
    expect(a.turn.step).toBe('ability');
    const b = apply(a, 0, { type: 'empathPeek', card: at(s, 0, 1) });
    expect(b.state.turn.step).toBe('ability');
    expect(b.events.some(e => e.type === 'saw' && e.rank === 8)).toBe(true);
  });
});
