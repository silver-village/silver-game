/**
 * The Amulet rules as a pure state machine: apply(state, player, command) returns a new state
 * and never touches the old one. It knows nothing about screens, so it can also run on a server.
 * Rules reference: docs/rules-amulet.md
 */
import {
  AMULET_SET, CALL_LIMIT, DEALT_SETS, FAILED_CALL_PENALTY, RANK, ROUNDS, VILLAGE_SIZE, hasDrawAbility,
} from './cards';
import {
  RuleError, type ApplyResult, type Card, type CardId, type Command, type GameEvent, type GameState, type Turn,
} from './types';

const fail = (message: string): never => {
  throw new RuleError(message);
};

/* ---------- random numbers: the seed lives in the state, so games can be replayed ---------- */
function nextRandom(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(s: GameState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

/* ---------- setup ---------- */
const freshTurn = (): Turn => ({
  step: 'start', hand: [], source: null, empathUsed: 0, sideUsed: false, pending: null, placing: null, undo: null, pre: null,
});

export function newGame(names: string[], seed: number): GameState {
  if (names.length < 2 || names.length > DEALT_SETS) fail('بازی ۲ تا ۴ بازیکن دارد');
  const s: GameState = {
    cards: {},
    players: names.map(name => ({ name, village: [], total: 0, scores: [], known: [] })),
    deck: [], discard: [], row: [], removed: [],
    round: 1, starter: 0, current: 0,
    amulet: { holder: null, usable: false, on: null },
    caller: null, finalLeft: 0,
    phase: 'peek', peeked: names.map(() => false),
    turn: freshTurn(), rng: seed | 0, result: null, winner: null,
  };
  s.starter = Math.floor(nextRandom(s) * names.length);
  deal(s);
  return s;
}

function deal(s: GameState): void {
  const cards: Record<CardId, Card> = {};
  let n = 0;
  for (const def of AMULET_SET) {
    for (let i = 0; i < def.count; i++) {
      const id = `c${n++}`;
      cards[id] = { id, rank: def.rank, faceUp: false, guarding: null };
    }
  }
  s.cards = cards;
  const pool = shuffle(s, Object.keys(cards));
  const sets = Array.from({ length: DEALT_SETS }, () => pool.splice(0, VILLAGE_SIZE));
  s.players.forEach((p, i) => {
    p.village = sets[i] ?? [];
    p.known = [];
  });
  s.removed = sets.slice(s.players.length).flat();
  const first = pool.shift() as CardId;
  card(s, first).faceUp = true;
  s.discard = [first];
  s.deck = pool;
  s.row = [];
  s.caller = null;
  s.finalLeft = 0;
  s.amulet.on = null;
  s.current = s.starter;
  s.turn = freshTurn();
  s.phase = 'peek';
  s.peeked = s.players.map(() => false);
  s.result = null;
}

/* ---------- questions about the state ---------- */
export const card = (s: GameState, id: CardId): Card => s.cards[id] ?? fail('کارت پیدا نشد');
const rank = (s: GameState, id: CardId): number => card(s, id).rank;

export function ownerOf(s: GameState, id: CardId): number {
  return s.players.findIndex(p => p.village.includes(id));
}
export function guardOf(s: GameState, id: CardId): CardId | null {
  return Object.values(s.cards).find(c => c.guarding === id)?.id ?? null;
}
const isAmuleted = (s: GameState, id: CardId): boolean => s.amulet.on === id;
const isLinked = (s: GameState, id: CardId): boolean => card(s, id).guarding !== null || guardOf(s, id) !== null;

/** A card this actor may not view or move. */
export function isLocked(s: GameState, id: CardId, actor: number): boolean {
  if (isAmuleted(s, id)) return true;
  return ownerOf(s, id) !== actor && isLinked(s, id);
}
/** A card no ability may flip face up: flipping would show a protected card (rule decision 3). */
const canFlip = (s: GameState, id: CardId): boolean =>
  !card(s, id).faceUp && !isAmuleted(s, id) && !isLinked(s, id);

export function countFaceUp(s: GameState, player: number, r: number): number {
  return (s.players[player]?.village ?? []).filter(id => card(s, id).faceUp && rank(s, id) === r).length;
}
const totalFaceUp = (s: GameState, r: number): number =>
  s.players.reduce((n, _p, i) => n + countFaceUp(s, i, r), 0);

export function setMatches(s: GameState, ids: CardId[]): boolean {
  const others = ids.map(id => rank(s, id)).filter(r => r !== RANK.doppelganger);
  return others.every(r => r === others[0]);
}
const knows = (s: GameState, player: number, id: CardId): boolean =>
  (s.players[player]?.known ?? []).includes(id);

/* ---------- small moves ---------- */
const see = (s: GameState, player: number, id: CardId, ev: GameEvent[]): void => {
  const p = s.players[player];
  if (p && !p.known.includes(id)) p.known.push(id);
  ev.push({ type: 'saw', player, card: id, rank: rank(s, id), to: player });
};
const forget = (s: GameState, id: CardId): void => {
  s.players.forEach(p => { p.known = p.known.filter(k => k !== id); });
};
function unlink(s: GameState, id: CardId): void {
  card(s, id).guarding = null;
  const g = guardOf(s, id);
  if (g) card(s, g).guarding = null;
}
function toDiscard(s: GameState, id: CardId): void {
  const c = card(s, id);
  c.faceUp = true;
  c.guarding = null;
  forget(s, id);
  s.discard.push(id);
}
function refillRow(s: GameState): void {
  const want = totalFaceUp(s, RANK.squire);
  while (s.row.length < want && s.deck.length) {
    const id = s.deck.shift() as CardId;
    card(s, id).faceUp = true;
    s.row.push(id);
  }
}

/* ---------- ending things ---------- */
function bothVillagersUp(s: GameState): boolean {
  return totalFaceUp(s, RANK.villager) === 2;
}
/** Two face-up villagers end the round at once, whatever was happening. */
function endIfVillagers(s: GameState, ev: GameEvent[]): boolean {
  if (s.phase === 'turn' && bothVillagersUp(s)) {
    finishRound(s, 'villager', ev);
    return true;
  }
  return false;
}
function finishRound(s: GameState, reason: 'vote' | 'villager' | 'deck', ev: GameEvent[]): void {
  s.phase = 'roundEnd';
  const sums = s.players.map(p => p.village.reduce((n, id) => n + rank(s, id), 0));
  const low = Math.min(...sums);
  const caller = reason === 'vote' ? s.caller : null;
  const callerWon = caller !== null && sums[caller] === low;
  const scores = sums.map((n, i) => (i === caller ? (callerWon ? 0 : n + FAILED_CALL_PENALTY) : n));
  scores.forEach((n, i) => {
    const p = s.players[i];
    if (p) {
      p.total += n;
      p.scores.push(n);
    }
  });
  const best = Math.min(...scores);
  const tied = scores.flatMap((n, i) => (n === best ? [i] : []));
  if (callerWon) {
    s.amulet.holder = caller;
    s.amulet.usable = true;
  } else {
    s.amulet.usable = false;
    if (s.amulet.holder === null || !tied.includes(s.amulet.holder)) {
      s.amulet.holder = nearestLeft(s, s.starter, tied);
    }
  }
  s.starter = s.amulet.holder as number;
  s.amulet.on = null;
  s.result = { reason, sums, scores, caller, callerWon };
  s.turn = freshTurn();
  ev.push({ type: 'roundEnded', reason });
}
function nearestLeft(s: GameState, from: number, among: number[]): number {
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (among.includes(i)) return i;
  }
  return among[0] as number;
}
function endGame(s: GameState, ev: GameEvent[]): void {
  const low = Math.min(...s.players.map(p => p.total));
  const tied = s.players.flatMap((p, i) => (p.total === low ? [i] : []));
  const holder = s.amulet.holder ?? 0;
  s.winner = tied.length === 1 ? (tied[0] as number) : tied.includes(holder) ? holder : nearestLeft(s, holder, tied);
  s.phase = 'gameEnd';
  ev.push({ type: 'gameEnded', winner: s.winner });
}
function endTurn(s: GameState, ev: GameEvent[]): void {
  ev.push({ type: 'turnEnded', player: s.current });
  refillRow(s);
  if (s.caller !== null && s.caller !== s.current) {
    s.finalLeft--;
    if (s.finalLeft <= 0) return finishRound(s, 'vote', ev);
  }
  if (!s.deck.length && !s.row.length) return finishRound(s, 'deck', ev);
  s.current = (s.current + 1) % s.players.length;
  s.turn = freshTurn();
}

/* ---------- the exchange, shared by normal turns, the master and the witch ---------- */
function validTargets(s: GameState, player: number, targets: CardId[]): void {
  const village = s.players[player]?.village ?? [];
  if (!targets.length) fail('حداقل یک کارت انتخاب کن');
  if (new Set(targets).size !== targets.length) fail('کارت تکراری انتخاب شده');
  for (const id of targets) {
    if (!village.includes(id)) fail('فقط کارت‌های دهکده‌ی خودت');
    if (isAmuleted(s, id)) fail('کارت طلسم‌شده جابه‌جا نمی‌شود');
  }
}
function runExchange(s: GameState, player: number, incoming: CardId, faceUp: boolean, targets: CardId[], ev: GameEvent[]): void {
  const p = s.players[player];
  if (!p) return;
  const inc = card(s, incoming);
  inc.faceUp = faceUp;
  s.turn.hand = [];
  if (targets.length === 1) {
    const old = targets[0] as CardId;
    unlink(s, old);
    p.village[p.village.indexOf(old)] = incoming;
    toDiscard(s, old);
    ev.push({ type: 'burned', player, card: old }, { type: 'placed', player, card: incoming });
    return afterMain(s, player, incoming, ev);
  }
  const matched = setMatches(s, targets);
  targets.forEach(id => unlink(s, id));
  ev.push({ type: 'revealedSet', player, cards: targets, matched });
  if (matched) {
    const spots = targets.map(id => p.village.indexOf(id)).sort((a, b) => a - b);
    const doppels = targets.filter(id => rank(s, id) === RANK.doppelganger);
    const rest = targets.filter(id => rank(s, id) !== RANK.doppelganger);
    [...doppels, ...rest].forEach(id => {
      toDiscard(s, id);
      ev.push({ type: 'burned', player, card: id });
    });
    s.turn.placing = { card: incoming, spots, penalty: false, unseen: false };
    s.turn.step = 'placeSpot';
  } else {
    /* the set was shown to the whole table before it turned back */
    targets.forEach(id => {
      card(s, id).faceUp = false;
      s.players.forEach(q => { if (!q.known.includes(id)) q.known.push(id); });
    });
    s.turn.placing = { card: incoming, spots: [], penalty: targets.length >= 3, unseen: false };
    s.turn.step = 'placeEnd';
  }
}
function afterMain(s: GameState, player: number, incoming: CardId, ev: GameEvent[]): void {
  const p = s.players[player];
  if (p && !s.turn.placing?.unseen && !p.known.includes(incoming)) p.known.push(incoming);
  s.turn.placing = null;
  s.turn.pending = null;
  s.turn.step = 'confirm';
  endIfVillagers(s, ev);
}

/* ---------- abilities ---------- */
export function abilityCandidates(s: GameState, player: number, r: number): CardId[] {
  const everyone = s.players.flatMap(p => p.village);
  const own = s.players[player]?.village ?? [];
  const others = everyone.filter(id => !own.includes(id));
  switch (r) {
    case RANK.exposer: return own.filter(id => canFlip(s, id));
    case RANK.revealer: return everyone.filter(id => canFlip(s, id));
    case RANK.beholder: return own.filter(id => !card(s, id).faceUp && !isAmuleted(s, id));
    case RANK.apprenticeSeer: return others.filter(id => !card(s, id).faceUp && !isLocked(s, id, player));
    case RANK.seer: return everyone.filter(id => !card(s, id).faceUp && !isLocked(s, id, player));
    case RANK.master: return s.discard.slice(0, -1);
    case RANK.witch: return s.deck.length ? [s.deck[0] as CardId] : [];
    case RANK.robber: return own.some(id => !isAmuleted(s, id)) ? others.filter(id => !isLocked(s, id, player)) : [];
    default: return [];
  }
}
function startAbility(s: GameState, player: number, r: number, ev: GameEvent[]): void {
  if (!abilityCandidates(s, player, r).length) {
    s.turn.step = 'confirm';
    ev.push({ type: 'noEffect', player });
    return;
  }
  if (r === RANK.witch) {
    const top = s.deck.shift() as CardId;
    s.turn.hand = [top];
    s.turn.source = 'deck';
    s.turn.undo = null; /* the top card was shown */
    s.turn.step = 'witch';
    see(s, player, top, ev);
    return;
  }
  s.turn.pending = r;
  s.turn.step = 'ability';
}
function resolveAbility(s: GameState, player: number, targets: CardId[], ev: GameEvent[]): void {
  const r = s.turn.pending;
  if (r === null) return fail('توانایی‌ای منتظر نیست');
  const allowed = abilityCandidates(s, player, r);
  const pick = (id: CardId | undefined): CardId => {
    if (id === undefined || !allowed.includes(id)) return fail('این کارت قابل انتخاب نیست');
    return id;
  };
  if (r === RANK.master) {
    const chosen = pick(targets[0]);
    s.turn.pre = stripped(s);
    s.discard.splice(s.discard.indexOf(chosen), 1);
    s.turn.hand = [chosen];
    s.turn.source = 'discard';
    s.turn.pending = null;
    s.turn.step = 'decide';
    s.turn.undo = null;
    ev.push({ type: 'took', player, card: chosen, from: 'discard' });
    return;
  }
  s.turn.undo = null; /* picking a target shows or moves something */
  if (r === RANK.robber) {
    const stolen = pick(targets[0]);
    const mine = targets[1];
    const own = s.players[player]?.village ?? [];
    if (mine === undefined || !own.includes(mine) || isAmuleted(s, mine)) return fail('کارت خودت را هم انتخاب کن');
    const victim = s.players[ownerOf(s, stolen)];
    if (!victim) return;
    unlink(s, mine);
    forget(s, stolen);
    forget(s, mine);
    victim.village[victim.village.indexOf(stolen)] = mine;
    own[own.indexOf(mine)] = stolen;
    ev.push({ type: 'swapped', player, a: stolen, b: mine });
    if (!card(s, stolen).faceUp) see(s, player, stolen, ev);
  } else if (r === RANK.exposer || r === RANK.revealer) {
    const id = pick(targets[0]);
    card(s, id).faceUp = true;
    forget(s, id);
    ev.push({ type: 'flipped', player, card: id });
  } else if (r === RANK.beholder) {
    if (targets.length < 1 || targets.length > 2 || new Set(targets).size !== targets.length) fail('۱ یا ۲ کارت انتخاب کن');
    targets.forEach(id => {
      pick(id);
      see(s, player, id, ev);
      ev.push({ type: 'looked', player, card: id });
    });
  } else {
    const id = pick(targets[0]);
    see(s, player, id, ev);
    ev.push({ type: 'looked', player, card: id });
  }
  s.turn.pending = null;
  s.turn.step = 'confirm';
  endIfVillagers(s, ev);
}

/* ---------- commands ---------- */
const stripped = (s: GameState): GameState => {
  const copy = structuredClone(s);
  copy.turn.undo = null;
  copy.turn.pre = null;
  return copy;
};
function needStep(s: GameState, ...steps: Turn['step'][]): void {
  if (s.phase !== 'turn') fail('الان وقت این کار نیست');
  if (!steps.includes(s.turn.step)) fail('الان وقت این کار نیست');
}
const swappable = (s: GameState, player: number): CardId[] =>
  (s.players[player]?.village ?? []).filter(id => !isAmuleted(s, id));

export function apply(state: GameState, player: number, cmd: Command): ApplyResult {
  const s = structuredClone(state);
  const ev: GameEvent[] = [];
  if (cmd.type === 'peek') {
    peek(s, player, cmd.cards, ev);
    return { state: s, events: ev };
  }
  if (cmd.type === 'nextRound') {
    if (s.phase !== 'roundEnd') fail('دور هنوز تمام نشده');
    if (s.round >= ROUNDS) {
      endGame(s, ev);
    } else {
      s.round++;
      deal(s);
    }
    return { state: s, events: ev };
  }
  if (player !== s.current) fail('نوبت تو نیست');

  switch (cmd.type) {
    case 'draw': {
      needStep(s, 'start');
      if (!s.deck.length) fail('دسته خالی است');
      s.turn.hand = [s.deck.shift() as CardId];
      s.turn.source = 'deck';
      s.turn.step = 'decide';
      ev.push({ type: 'drew', player });
      see(s, player, s.turn.hand[0] as CardId, ev);
      break;
    }
    case 'drawMore': {
      needStep(s, 'decide');
      if (s.turn.source !== 'deck' || s.turn.undo) fail('فقط موقع کشیدن از دسته');
      if (s.turn.hand.length > countFaceUp(s, player, RANK.rascal)) fail('حقه‌باز کافی نداری');
      if (!s.deck.length) fail('دسته خالی است');
      const id = s.deck.shift() as CardId;
      s.turn.hand.push(id);
      see(s, player, id, ev);
      break;
    }
    case 'takeDiscard': {
      needStep(s, 'start');
      if (!s.discard.length) fail('ستون سوخته خالی است');
      if (!swappable(s, player).length) fail('کارتی برای معاوضه نداری');
      s.turn.pre = stripped(s);
      const id = s.discard.pop() as CardId;
      s.turn.hand = [id];
      s.turn.source = 'discard';
      s.turn.step = 'decide';
      ev.push({ type: 'took', player, card: id, from: 'discard' });
      break;
    }
    case 'takeRow': {
      needStep(s, 'start');
      if (!s.row.includes(cmd.card)) fail('این کارت کنار دسته نیست');
      s.turn.pre = stripped(s);
      s.row.splice(s.row.indexOf(cmd.card), 1);
      s.turn.hand = [cmd.card];
      s.turn.source = 'row';
      s.turn.step = 'decide';
      ev.push({ type: 'took', player, card: cmd.card, from: 'row' });
      break;
    }
    case 'returnCard': {
      needStep(s, 'decide');
      const pre = s.turn.pre;
      if (!pre) return fail('این کارت برگشت‌پذیر نیست');
      return { state: structuredClone(pre), events: ev };
    }
    case 'call': {
      needStep(s, 'start');
      if (s.caller !== null) fail('سرشماری قبلاً انجام شده');
      if (s.turn.sideUsed) fail('در این نوبت از توانایی استفاده کرده‌ای');
      if ((s.players[player]?.village.length ?? 0) > CALL_LIMIT) fail('فقط با ۴ کارت یا کمتر');
      s.caller = player;
      s.finalLeft = s.players.length - 1;
      ev.push({ type: 'called', player });
      endTurn(s, ev);
      break;
    }
    case 'burn': {
      needStep(s, 'decide');
      if (s.turn.source === 'discard') fail('کارت ستون سوخته باید معاوضه شود');
      if (!s.turn.hand.includes(cmd.card)) fail('این کارت در دستت نیست');
      const before = stripped(s);
      returnOthers(s, cmd.card);
      s.turn.hand = [];
      toDiscard(s, cmd.card);
      ev.push({ type: 'burned', player, card: cmd.card });
      s.turn.undo = before;
      s.turn.pre = null;
      s.turn.step = 'confirm';
      if (cmd.useAbility) {
        if (!hasDrawAbility(rank(s, cmd.card))) fail('این کارت توانایی سوزاندن ندارد');
        startAbility(s, player, rank(s, cmd.card), ev);
      }
      break;
    }
    case 'exchange': {
      needStep(s, 'decide', 'witch');
      if (!s.turn.hand.includes(cmd.card)) fail('این کارت در دستت نیست');
      validTargets(s, player, cmd.targets);
      const before = stripped(s);
      const shows = cmd.targets.some(id => !card(s, id).faceUp && !knows(s, player, id));
      const wasWitch = s.turn.step === 'witch';
      const faceUp = !wasWitch && s.turn.source !== 'deck';
      returnOthers(s, cmd.card);
      runExchange(s, player, cmd.card, faceUp, cmd.targets, ev);
      s.turn.pre = null;
      s.turn.undo = shows || wasWitch ? null : before;
      break;
    }
    case 'placeSpot': {
      needStep(s, 'placeSpot');
      const placing = s.turn.placing;
      const p = s.players[player];
      if (!placing || !p || !placing.spots.includes(cmd.index)) return fail('این جا خالی نیست');
      const emptied = new Set(placing.spots);
      p.village = p.village.flatMap((id, i) =>
        i === cmd.index ? [placing.card] : emptied.has(i) ? [] : [id]);
      ev.push({ type: 'placed', player, card: placing.card });
      afterMain(s, player, placing.card, ev);
      break;
    }
    case 'placeEnd': {
      needStep(s, 'placeEnd');
      const placing = s.turn.placing;
      const p = s.players[player];
      if (!placing || !p) return fail('کارتی منتظر جا نیست');
      if (cmd.side === 'start') p.village.unshift(placing.card);
      else p.village.push(placing.card);
      ev.push({ type: 'placed', player, card: placing.card });
      if (placing.penalty && s.deck.length) {
        const extra = s.deck.shift() as CardId;
        card(s, extra).faceUp = false;
        s.turn.placing = { card: extra, spots: [], penalty: false, unseen: true };
        ev.push({ type: 'penalty', player, card: extra });
      } else {
        afterMain(s, player, placing.card, ev);
      }
      break;
    }
    case 'target': {
      needStep(s, 'ability');
      resolveAbility(s, player, cmd.cards, ev);
      break;
    }
    case 'witchGive': {
      needStep(s, 'witch');
      const top = s.turn.hand[0];
      const owner = ownerOf(s, cmd.target);
      const victim = s.players[owner];
      if (top === undefined || !victim || owner === player) return fail('یک کارت حریف را انتخاب کن');
      if (isLocked(s, cmd.target, player)) fail('این کارت قابل انتخاب نیست');
      card(s, top).faceUp = false;
      forgetFor(s, owner, top);
      victim.village[victim.village.indexOf(cmd.target)] = top;
      toDiscard(s, cmd.target);
      s.turn.hand = [];
      s.turn.step = 'confirm';
      ev.push({ type: 'swapped', player, a: top, b: cmd.target }, { type: 'burned', player, card: cmd.target });
      endIfVillagers(s, ev);
      break;
    }
    case 'skipAbility': {
      needStep(s, 'ability');
      s.turn.pending = null;
      s.turn.step = 'confirm';
      break;
    }
    case 'empathPeek': {
      needStep(s, 'start', 'decide', 'confirm');
      if (s.turn.empathUsed >= countFaceUp(s, player, RANK.empath)) fail('افسون‌گر رو نداری');
      if (!(s.players[player]?.village ?? []).includes(cmd.card)) fail('فقط کارت‌های خودت');
      if (card(s, cmd.card).faceUp || isAmuleted(s, cmd.card)) fail('این کارت قابل دیدن نیست');
      s.turn.empathUsed++;
      s.turn.sideUsed = true;
      s.turn.undo = null;
      see(s, player, cmd.card, ev);
      break;
    }
    case 'guard': {
      needStep(s, 'start', 'decide', 'confirm');
      const own = s.players[player]?.village ?? [];
      const g = card(s, cmd.guard);
      if (!own.includes(cmd.guard) || !g.faceUp || g.rank !== RANK.bodyguard) fail('محافظ رو لازم است');
      if (isAmuleted(s, cmd.guard)) fail('محافظ طلسم‌شده جابه‌جا نمی‌شود');
      if (cmd.target !== null) {
        const t = cmd.target;
        const other = guardOf(s, t);
        if (!own.includes(t) || t === cmd.guard) fail('یک کارت دیگر خودت را انتخاب کن');
        if (card(s, t).guarding !== null || isAmuleted(s, t) || (other !== null && other !== cmd.guard)) fail('این کارت قابل محافظت نیست');
      }
      g.guarding = cmd.target;
      s.turn.sideUsed = true;
      s.turn.undo = null;
      ev.push({ type: 'guarded', player, guard: cmd.guard, target: cmd.target });
      break;
    }
    case 'placeAmulet': {
      needStep(s, 'start', 'decide', 'confirm');
      if (s.amulet.holder !== player || !s.amulet.usable) fail('طلسم فعال نداری');
      if (s.amulet.on) fail('طلسم قبلاً گذاشته شده');
      if (!(s.players[player]?.village ?? []).includes(cmd.card) || isLinked(s, cmd.card)) fail('این کارت قابل طلسم نیست');
      s.amulet.on = cmd.card;
      s.turn.sideUsed = true;
      s.turn.undo = null;
      ev.push({ type: 'amulet', player, card: cmd.card });
      break;
    }
    case 'confirm': {
      needStep(s, 'confirm');
      endTurn(s, ev);
      break;
    }
    case 'undo': {
      needStep(s, 'confirm', 'ability');
      const undo = s.turn.undo;
      if (!undo) return fail('این حرکت پس گرفتنی نیست');
      return { state: structuredClone(undo), events: ev };
    }
  }
  return { state: s, events: ev };
}

function returnOthers(s: GameState, keep: CardId): void {
  const others = s.turn.hand.filter(id => id !== keep);
  others.forEach(id => { card(s, id).faceUp = false; });
  s.deck = [...others, ...s.deck];
}
function forgetFor(s: GameState, player: number, id: CardId): void {
  const p = s.players[player];
  if (p) p.known = p.known.filter(k => k !== id);
}
function peek(s: GameState, player: number, cards: [CardId, CardId], ev: GameEvent[]): void {
  if (s.phase !== 'peek') fail('الان وقت دیدن کارت نیست');
  if (s.peeked[player]) fail('قبلاً کارت‌هایت را دیده‌ای');
  const own = s.players[player]?.village ?? [];
  if (cards[0] === cards[1] || !cards.every(id => own.includes(id))) fail('دو کارت از دهکده‌ی خودت');
  cards.forEach(id => see(s, player, id, ev));
  s.peeked[player] = true;
  if (s.peeked.every(Boolean)) s.phase = 'turn';
}

/** Rule check for tests and debugging: every card exists exactly once. */
export function auditCards(s: GameState): void {
  const zones = [...s.deck, ...s.discard, ...s.row, ...s.removed, ...s.turn.hand, ...s.players.flatMap(p => p.village)];
  if (s.turn.placing) zones.push(s.turn.placing.card);
  const inVillageTwice = s.turn.step === 'placeSpot';
  const ids = new Set(zones);
  if (!inVillageTwice && (zones.length !== Object.keys(s.cards).length || ids.size !== zones.length)) {
    throw new Error(`card count ${zones.length}/${ids.size}`);
  }
}
