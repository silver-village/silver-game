/**
 * The computer rival. It reads only what a real player could know: face-up cards, its own memory
 * (player.known) and public piles. A hidden card is valued at the deck's average.
 */
import { CALL_LIMIT, RANK, hasDrawAbility } from './cards';
import { abilityCandidates, card, countFaceUp, guardOf } from './game';
import type { CardId, Command, GameState } from './types';

const UNKNOWN_VALUE = 6.5;

export function botCommand(s: GameState, me: number, rand: () => number): Command {
  const self = s.players[me];
  if (!self) throw new Error('unknown player');
  const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)] as T;
  const knowsCard = (id: CardId) => card(s, id).faceUp || self.known.includes(id);
  const value = (id: CardId) => (knowsCard(id) ? card(s, id).rank : UNKNOWN_VALUE);
  const open = () => self.village.filter(id => s.amulet.on !== id);
  const byValue = (ids: CardId[]) => [...ids].sort((a, b) => value(a) - value(b));
  const worst = () => byValue(open()).at(-1);
  const linked = (id: CardId) => card(s, id).guarding !== null || guardOf(s, id) !== null;
  /* a known pair or larger set lowers the score and shortens the village */
  const bestSet = (): CardId[] | null => {
    const groups = new Map<number, CardId[]>();
    for (const id of open()) {
      if (!knowsCard(id)) continue;
      const r = card(s, id).rank;
      if (r === RANK.doppelganger) continue;
      groups.set(r, [...(groups.get(r) ?? []), id]);
    }
    const sets = [...groups.entries()].filter(([, g]) => g.length > 1).sort((a, b) => b[0] * b[1].length - a[0] * a[1].length);
    const top = sets[0];
    if (!top) return null;
    const doppels = open().filter(id => knowsCard(id) && card(s, id).rank === RANK.doppelganger);
    return [...top[1], ...doppels];
  };

  if (s.phase === 'peek') {
    const shuffled = [...self.village].sort(() => rand() - 0.5);
    return { type: 'peek', cards: [shuffled[0] as CardId, shuffled[1] as CardId] };
  }

  switch (s.turn.step) {
    case 'start': {
      const mine = self.village.reduce((n, id) => n + value(id), 0);
      const rivals = s.players.flatMap((p, i) => (i === me ? [] : [p.village.reduce((n, id) => n + (card(s, id).faceUp ? card(s, id).rank : UNKNOWN_VALUE), 0)]));
      const allKnown = self.village.every(knowsCard);
      if (s.caller === null && !s.turn.sideUsed && self.village.length <= CALL_LIMIT && allKnown && (mine <= 8 || mine + 6 <= Math.min(...rivals))) {
        return { type: 'call' };
      }
      if (s.amulet.holder === me && s.amulet.usable && !s.amulet.on) {
        const free = byValue(self.village.filter(id => knowsCard(id) && !linked(id)))[0];
        if (free) return { type: 'placeAmulet', card: free };
      }
      const guard = self.village.find(id => card(s, id).faceUp && card(s, id).rank === RANK.bodyguard && !card(s, id).guarding && s.amulet.on !== id);
      if (guard) {
        const target = byValue(self.village.filter(id => id !== guard && knowsCard(id) && !linked(id) && s.amulet.on !== id))[0];
        if (target) return { type: 'guard', guard, target };
      }
      if (s.turn.empathUsed < countFaceUp(s, me, RANK.empath)) {
        const unseen = self.village.find(id => !knowsCard(id) && s.amulet.on !== id);
        if (unseen) return { type: 'empathPeek', card: unseen };
      }
      const w = worst();
      const gain = (id: CardId) => (w ? value(w) - card(s, id).rank : 0);
      const top = s.discard.at(-1);
      if (top && w && gain(top) >= 4) return { type: 'takeDiscard' };
      const row = s.row.filter(id => w && gain(id) >= 3).sort((a, b) => gain(b) - gain(a))[0];
      if (row) return { type: 'takeRow', card: row };
      if (s.deck.length) return { type: 'draw' };
      if (s.row[0]) return { type: 'takeRow', card: s.row[0] };
      return { type: 'takeDiscard' };
    }
    case 'decide': {
      const hand = s.turn.hand;
      if (s.turn.source === 'deck' && hand.length <= countFaceUp(s, me, RANK.rascal) && s.deck.length && Math.min(...hand.map(id => card(s, id).rank)) > 3) {
        return { type: 'drawMore' };
      }
      const held = [...hand].sort((a, b) => card(s, a).rank - card(s, b).rank)[0] as CardId;
      const rank = card(s, held).rank;
      const set = bestSet();
      if (set && open().length > 0) return { type: 'exchange', card: held, targets: set };
      const w = worst();
      if (s.turn.source === 'discard' && w) return { type: 'exchange', card: held, targets: [w] };
      if (w && value(w) - rank >= 2) return { type: 'exchange', card: held, targets: [w] };
      const useful = [...hand].sort((a, b) => card(s, b).rank - card(s, a).rank).find(id => hasDrawAbility(card(s, id).rank));
      const burn = useful ?? held;
      return { type: 'burn', card: burn, useAbility: hasDrawAbility(card(s, burn).rank) };
    }
    case 'placeSpot':
      return { type: 'placeSpot', index: s.turn.placing?.spots[0] ?? 0 };
    case 'placeEnd':
      return { type: 'placeEnd', side: 'end' };
    case 'witch': {
      const top = s.turn.hand[0] as CardId;
      const w = worst();
      if (w && value(w) - card(s, top).rank >= 2) return { type: 'exchange', card: top, targets: [w] };
      const rivals = abilityCandidates(s, me, RANK.robber);
      if (rivals.length) return { type: 'witchGive', target: byValue(rivals)[0] as CardId };
      return { type: 'exchange', card: top, targets: [w ?? (self.village[0] as CardId)] };
    }
    case 'ability': {
      const r = s.turn.pending as number;
      const options = abilityCandidates(s, me, r);
      const skip: Command = { type: 'skipAbility' };
      if (r === RANK.exposer) {
        const low = byValue(options.filter(knowsCard))[0];
        return low !== undefined && card(s, low).rank <= 2 ? { type: 'target', cards: [low] } : skip;
      }
      if (r === RANK.beholder) {
        const unseen = options.filter(id => !knowsCard(id)).slice(0, 2);
        return unseen.length ? { type: 'target', cards: unseen } : skip;
      }
      if (r === RANK.seer) {
        const unseen = options.filter(id => self.village.includes(id) && !knowsCard(id));
        return { type: 'target', cards: [unseen[0] ?? pick(options)] };
      }
      if (r === RANK.revealer || r === RANK.apprenticeSeer) {
        const rivals = options.filter(id => !self.village.includes(id));
        return rivals.length ? { type: 'target', cards: [pick(rivals)] } : skip;
      }
      const w = worst();
      if (r === RANK.master) {
        const low = [...options].sort((a, b) => card(s, a).rank - card(s, b).rank)[0];
        return low !== undefined && w && value(w) - card(s, low).rank >= 3 ? { type: 'target', cards: [low] } : skip;
      }
      if (r === RANK.robber) {
        const steal = byValue(options)[0];
        return steal !== undefined && w && value(w) - value(steal) >= 1 ? { type: 'target', cards: [steal, w] } : skip;
      }
      return skip;
    }
    case 'confirm':
    default:
      return { type: 'confirm' };
  }
}
