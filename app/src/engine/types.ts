/** Game data. Everything here is plain JSON, so a state can be saved or sent to a server later. */

export type CardId = string;

export interface Card {
  id: CardId;
  rank: number;
  faceUp: boolean;
  /** For a bodyguard: the card it sits on. */
  guarding: CardId | null;
}

export interface Player {
  name: string;
  village: CardId[];
  total: number;
  scores: number[];
  /** Face-down cards this player has seen. Hidden from every other player. */
  known: CardId[];
}

export type Phase = 'peek' | 'turn' | 'roundEnd' | 'gameEnd';

/**
 * start: nothing done yet this turn. decide: holding a card.
 * placeSpot / placeEnd: a card waits for its place in the village.
 * ability: an ability waits for a target. witch: the witch's card waits for an exchange.
 * confirm: the main action is over and the player can still undo or use side abilities.
 */
export type Step = 'start' | 'decide' | 'placeSpot' | 'placeEnd' | 'ability' | 'witch' | 'confirm';

export type Source = 'deck' | 'discard' | 'row';

export interface Placing {
  card: CardId;
  /** Village indexes freed by a matching set. Empty when placing at an end. */
  spots: number[];
  /** A penalty card follows this placement. */
  penalty: boolean;
  /** This is the penalty card: nobody has seen it. */
  unseen: boolean;
}

export interface Turn {
  step: Step;
  hand: CardId[];
  source: Source | null;
  empathUsed: number;
  sideUsed: boolean;
  /** Rank of the ability waiting for a target. */
  pending: number | null;
  placing: Placing | null;
  /** The move can be taken back to this state, because it showed nothing new. */
  undo: GameState | null;
  /** State to go back to when a card taken from a public pile is returned. */
  pre: GameState | null;
}

export interface RoundResult {
  reason: 'vote' | 'villager' | 'deck';
  sums: number[];
  scores: number[];
  caller: number | null;
  callerWon: boolean;
}

export interface GameState {
  cards: Record<CardId, Card>;
  players: Player[];
  deck: CardId[];
  discard: CardId[];
  row: CardId[];
  removed: CardId[];
  round: number;
  starter: number;
  current: number;
  amulet: { holder: number | null; usable: boolean; on: CardId | null };
  caller: number | null;
  finalLeft: number;
  phase: Phase;
  peeked: boolean[];
  turn: Turn;
  rng: number;
  result: RoundResult | null;
  winner: number | null;
}

export type Command =
  | { type: 'peek'; cards: [CardId, CardId] }
  | { type: 'draw' }
  | { type: 'drawMore' }
  | { type: 'takeDiscard' }
  | { type: 'takeRow'; card: CardId }
  | { type: 'returnCard' }
  | { type: 'call' }
  | { type: 'burn'; card: CardId; useAbility: boolean }
  | { type: 'exchange'; card: CardId; targets: CardId[] }
  | { type: 'placeSpot'; index: number }
  | { type: 'placeEnd'; side: 'start' | 'end' }
  | { type: 'target'; cards: CardId[] }
  | { type: 'witchGive'; target: CardId }
  | { type: 'skipAbility' }
  | { type: 'empathPeek'; card: CardId }
  | { type: 'guard'; guard: CardId; target: CardId | null }
  | { type: 'placeAmulet'; card: CardId }
  | { type: 'confirm' }
  | { type: 'undo' }
  | { type: 'nextRound' };

/** What happened, for animations. An event with `to` is only for that player. */
export type GameEvent =
  | { type: 'drew'; player: number; to?: undefined }
  | { type: 'saw'; player: number; card: CardId; rank: number; to: number }
  | { type: 'took'; player: number; card: CardId; from: Source; to?: undefined }
  | { type: 'burned'; player: number; card: CardId; to?: undefined }
  | { type: 'revealedSet'; player: number; cards: CardId[]; matched: boolean; to?: undefined }
  | { type: 'placed'; player: number; card: CardId; to?: undefined }
  | { type: 'penalty'; player: number; card: CardId; to?: undefined }
  | { type: 'flipped'; player: number; card: CardId; to?: undefined }
  | { type: 'looked'; player: number; card: CardId; to?: undefined }
  | { type: 'swapped'; player: number; a: CardId; b: CardId; to?: undefined }
  | { type: 'guarded'; player: number; guard: CardId; target: CardId | null; to?: undefined }
  | { type: 'amulet'; player: number; card: CardId; to?: undefined }
  | { type: 'called'; player: number; to?: undefined }
  | { type: 'noEffect'; player: number; to?: undefined }
  | { type: 'turnEnded'; player: number; to?: undefined }
  | { type: 'roundEnded'; reason: RoundResult['reason']; to?: undefined }
  | { type: 'gameEnded'; winner: number; to?: undefined };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export class RuleError extends Error {
  override name = 'RuleError';
}
