/** What one player may see. The screen and, later, the network only ever receive this. */
import { RANK } from './cards';
import { abilityCandidates, countFaceUp } from './game';
import type { CardId, GameState, Phase, RoundResult, Step } from './types';

export interface CardView {
  id: CardId;
  /** null while the card is hidden from this viewer. */
  rank: number | null;
  faceUp: boolean;
  guarding: CardId | null;
}

export interface GameView {
  me: number;
  phase: Phase;
  round: number;
  current: number;
  starter: number;
  caller: number | null;
  amulet: GameState['amulet'];
  players: { name: string; village: CardView[]; total: number; scores: number[] }[];
  deckCount: number;
  discard: CardView[];
  row: CardView[];
  hand: CardView[];
  step: Step;
  pending: number | null;
  /** Cards the waiting ability may choose. */
  candidates: CardId[];
  /** Rival cards the witch's card may replace. */
  witchTargets: CardId[];
  empathLeft: number;
  rascalExtra: number;
  sideUsed: boolean;
  spots: number[];
  canUndo: boolean;
  canReturn: boolean;
  result: RoundResult | null;
  winner: number | null;
}

export function viewFor(s: GameState, me: number): GameView {
  const reveal = s.phase === 'roundEnd' || s.phase === 'gameEnd';
  const show = (id: CardId, open = false): CardView => {
    const c = s.cards[id];
    if (!c) throw new Error('unknown card ' + id);
    return { id, rank: c.faceUp || open || reveal ? c.rank : null, faceUp: c.faceUp, guarding: c.guarding };
  };
  const mine = s.current === me;
  return {
    me,
    phase: s.phase,
    round: s.round,
    current: s.current,
    starter: s.starter,
    caller: s.caller,
    amulet: s.amulet,
    players: s.players.map(p => ({ name: p.name, village: p.village.map(id => show(id)), total: p.total, scores: p.scores })),
    deckCount: s.deck.length,
    discard: s.discard.map(id => show(id)),
    row: s.row.map(id => show(id)),
    /* a card in hand is secret unless it came from a public pile */
    hand: s.turn.hand.map(id => show(id, mine)),
    step: s.turn.step,
    pending: mine ? s.turn.pending : null,
    candidates: mine && s.turn.pending !== null ? abilityCandidates(s, me, s.turn.pending) : [],
    witchTargets: mine && s.turn.step === 'witch' ? abilityCandidates(s, me, RANK.robber) : [],
    empathLeft: mine ? countFaceUp(s, me, RANK.empath) - s.turn.empathUsed : 0,
    rascalExtra: mine ? countFaceUp(s, me, RANK.rascal) : 0,
    sideUsed: s.turn.sideUsed,
    spots: mine ? (s.turn.placing?.spots ?? []) : [],
    canUndo: mine && s.turn.undo !== null,
    canReturn: mine && s.turn.pre !== null,
    result: s.result,
    winner: s.winner,
  };
}
