import { describe, expect, it } from 'vitest';
import { botCommand, safeBotCommand } from './bot';
import { apply, auditCards, newGame } from './game';
import type { CardId, Command, GameState } from './types';

const seeded = (seed: number) => {
  let x = seed * 9301 + 11;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
};

/** A careless player: always draws and burns, and never plans anything. */
function careless(s: GameState, p: number): Command {
  if (s.phase === 'peek') {
    const v = s.players[p]?.village as CardId[];
    return { type: 'peek', cards: [v[0] as CardId, v[1] as CardId] };
  }
  if (s.turn.step === 'start') {
    if (s.deck.length) return { type: 'draw' };
    return s.row[0] ? { type: 'takeRow', card: s.row[0] } : { type: 'takeDiscard' };
  }
  if (s.turn.step === 'decide') return { type: 'burn', card: s.turn.hand[0] as CardId, useAbility: false };
  return { type: 'confirm' };
}

function play(names: string[], seed: number, choose: (s: GameState, p: number, r: () => number) => Command) {
  const rand = seeded(seed);
  let s = newGame(names, seed);
  const reasons: string[] = [];
  let moves = 0;
  while (s.phase !== 'gameEnd') {
    if (s.phase === 'roundEnd') {
      reasons.push(s.result?.reason ?? '');
      s = apply(s, 0, { type: 'nextRound' }).state;
      continue;
    }
    const p = s.phase === 'peek' ? s.peeked.findIndex(x => !x) : s.current;
    s = apply(s, p, choose(s, p, rand)).state;
    auditCards(s);
    if (++moves > 20000) throw new Error('game never ended');
  }
  return { s, reasons };
}

describe('rival', () => {
  it.each([2, 3, 4])('finishes every game legally with %i players', n => {
    const names = Array.from({ length: n }, (_, i) => 'P' + i);
    for (let seed = 1; seed <= 120; seed++) play(names, seed, (s, p, r) => botCommand(s, p, r));
  });

  it('calls for votes and ends rounds itself', () => {
    const reasons = Array.from({ length: 100 }, (_, i) => play(['A', 'B'], i + 1, (s, p, r) => botCommand(s, p, r)).reasons).flat();
    const votes = reasons.filter(r => r === 'vote').length;
    expect(votes / reasons.length).toBeGreaterThan(0.2);
  });

  it('clearly beats a careless player', () => {
    let wins = 0;
    const games = 200;
    for (let seed = 1; seed <= games; seed++) {
      const { s } = play(['bot', 'careless'], seed, (st, p, r) => (p === 0 ? botCommand(st, p, r) : careless(st, p)));
      if (s.winner === 0) wins++;
    }
    expect(wins / games).toBeGreaterThan(0.8);
  });

  it('does not cheat: hidden cards do not change its choice', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = newGame(['A', 'B', 'C'], seed);
      s.phase = 'turn';
      s.current = 0;
      s.players[0]!.known = s.players[0]!.village.slice(0, 2);
      const hidden = [...s.deck, ...s.players[0]!.village.slice(2), ...s.players[1]!.village, ...s.players[2]!.village];
      const other = structuredClone(s);
      const ranks = hidden.map(id => s.cards[id]!.rank).reverse();
      hidden.forEach((id, i) => { other.cards[id]!.rank = ranks[i] as number; });
      expect(botCommand(other, 0, seeded(1))).toEqual(botCommand(s, 0, seeded(1)));
    }
  });
});

describe('rival safety', () => {
  it('always gives a legal move, through whole games', () => {
    for (let seed = 1; seed <= 15; seed++) {
      let s = newGame(['A', 'B', 'C'], seed);
      const rand = seeded(seed);
      for (let step = 0; step < 5000 && s.phase !== 'gameEnd'; step++) {
        const p = s.phase === 'peek' ? s.peeked.findIndex(x => !x) : s.current;
        const cmd: Command = s.phase === 'roundEnd' ? { type: 'nextRound' } : safeBotCommand(s, p, rand);
        s = apply(s, p, cmd).state;
        auditCards(s);
      }
      expect(s.phase).toBe('gameEnd');
    }
  });
  it('does not burn a cheap set for an expensive card', () => {
    let s = newGame(['A', 'B'], 9);
    s.phase = 'turn';
    s.current = 1;
    const ids = Object.values(s.cards);
    const ones = ids.filter(c => c.rank === 1).slice(0, 2).map(c => c.id);
    const twelve = ids.find(c => c.rank === 12)?.id as CardId;
    const nines = ids.filter(c => c.rank === 5).slice(0, 1).map(c => c.id);
    s.players[1]!.village = [...ones, ...nines];
    s.players[1]!.known = [...ones, ...nines];
    s.deck = [twelve, ...s.deck.filter(id => id !== twelve && !ones.includes(id) && !nines.includes(id))];
    s = apply(s, 1, { type: 'draw' }).state;
    const cmd = safeBotCommand(s, 1, seeded(2));
    expect(cmd.type === 'exchange' && cmd.targets.some(id => ones.includes(id))).toBe(false);
  });
});
