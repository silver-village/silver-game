/** The game screen. It reads only viewFor(), and every move goes through the engine's apply(). */
import '@fontsource-variable/vazirmatn';
import { safeBotCommand } from './engine/bot';
import { AMULET_SET, CALL_LIMIT, RANK, ROUNDS, hasDrawAbility } from './engine/cards';
import { apply, newGame } from './engine/game';
import { RuleError, type CardId, type Command, type GameEvent, type GameState } from './engine/types';
import { viewFor, type CardView, type GameView } from './engine/view';

const ME = 0;
const SAVE_KEY = 'silver-game-v1';
const fa = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d] as string);
/* word for word what is printed on each card */
const TEXT: Record<number, string> = {
  0: 'وقتی «رو» است: اگر (۰) دیگری در هر یک از دهکده‌ها «رو» باشد، بلافاصله دورِ بازی به پایان می‌رسد.',
  1: 'وقتی «رو» است: ۱ کارت از ستون کارت‌ها کشیده و «رو» کنید.',
  2: 'وقتی «رو» است: در نوبت‌تان، نگاهی به یکی از کارت‌های «رو-نشده»ی خود بیندازید.',
  3: 'وقتی «رو» است: این کارت و ۱ کارت دیگر را از شرّ رُقبا حفظ کنید.',
  4: 'وقتی «رو» است: ۱ کارت اضافی از ستون کارت‌ها بِکشید.',
  5: 'یکی از کارت‌های خود را «رو» کنید.',
  6: 'یکی از کارت‌های خود یا یکی از رُقبا را «رو» کنید.',
  7: 'نگاهی به ۱ یا ۲ کارتِ خود بیندازید.',
  8: 'نگاهی به یکی از کارت‌های یکی از رُقبا بیندازید.',
  9: 'نگاهی به یکی از کارت‌های خود یا یکی از رُقبا بیندازید.',
  10: 'یکی از کارت‌های ستون کارت‌های سوخته را برای خود بردارید.',
  11: 'نگاهی به کارت بالاییِ ستون کارت‌ها انداخته و آن را با یکی از کارت‌های یکی از دهکده‌ها تعویض کنید.',
  12: 'یکی از کارت‌های یکی از رُقبا را دزدیده و یکی از کارت‌های خود را به او بدهید. می‌توانید کارت جدید را نگاه کنید.',
  13: 'در هنگام سوزانده شدن (مُعاوضه): این کارت «هم‌ارزِ» ۱ کارت دیگر می‌شود.',
};
const nameOf = (rank: number) => AMULET_SET.find(d => d.rank === rank)?.name ?? '';
const label = (rank: number) => `${nameOf(rank)} (${fa(rank)})`;
const AMULET = '<img src="art/amulet.jpg" alt="طلسم">';
const draw = (inner: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  home: draw('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h4.5v-6h4v6h4.5V10"/>'),
  sheet: draw('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  help: draw('<path d="M8.5 9a3.5 3.5 0 1 1 5.6 2.8c-1.3 1-2.1 1.7-2.1 3.2"/><path d="M12 19.2v.1" stroke-width="2.8"/>'),
  call: draw('<path d="M12 3c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4 21l1.2-4.6C3.800 15 3 13 3 10.700 3 6.400 7 3 12 3Z"/><path d="M12 7v4.500M12 14.500v.1"/>'),
  swap: draw('<path d="M8 20V5M3.500 9.500 8 5l4.500 4.500"/><path d="M16 4v15M11.500 14.500 16 19l4.500-4.500"/>'),
  ability: draw('<path d="M12 2.500 14.300 9.700 21.500 12l-7.200 2.300L12 21.500l-2.300-7.200L2.500 12l7.200-2.300L12 2.500Z"/>'),
  shield: draw('<path d="M12 3 4.500 5.500v6c0 4.700 3 8 7.500 9.500 4.500-1.500 7.500-4.800 7.500-9.500v-6L12 3Z"/><path d="M12 3v18M4.500 11.500h15"/>'),
  eye: draw('<path d="M1.500 12S5.500 5 12 5s10.500 7 10.500 7-4 7-10.500 7S1.500 12 1.500 12Z"/><circle cx="12" cy="12" r="3.200"/>'),
  check: draw('<path d="m4.500 12.500 5 5L19.500 6.500"/>'),
  flame: draw('<path d="M8.500 14.500A2.500 2.500 0 0 0 11 12c0-1.400-.5-2-1-3-1.100-2.100-.2-4.100 2-6 .5 2.500 2 4.900 4 6.500s3 3.500 3 5.500a7 7 0 1 1-14 0c0-1.200.4-2.300 1-3a2.500 2.500 0 0 0 2.500 3Z"/>'),
  back: draw('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.500A5.500 5.500 0 0 0 4 14.500 5.500 5.500 0 0 0 9.500 20H13"/>'),
  more: draw('<rect x="3" y="6" width="11" height="15" rx="1.500"/><path d="M18.500 4v7M15 7.500h7"/>'),
  star: draw('<path d="M12 2.800l2.900 5.900 6.500.9-4.700 4.600 1.100 6.500L12 17.700l-5.800 3 1.100-6.500-4.700-4.600 6.500-.9L12 2.800Z" fill="currentColor"/>'),
  resume: draw('<path d="M20 12a8 8 0 1 1-2.500-5.800"/><path d="M20.500 3v4.500H16"/><path d="m10 8.500 5.500 3.500-5.500 3.500v-7Z" fill="currentColor"/>'),
  gear: draw('<circle cx="12" cy="12" r="3.200"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M18.700 5.300l-2.100 2.100M7.400 16.600l-2.100 2.100"/>'),
  cards: draw('<rect x="8" y="3" width="12" height="16" rx="1.500"/><path d="M5 6.500v12A2.500 2.500 0 0 0 7.500 21H15"/>'),
  install: draw('<path d="M12 3v12M7 10.500l5 5 5-5"/><path d="M4 20.500h16"/>'),
  close: draw('<path d="M6 6l12 12M18 6 6 18"/>'),
  undo: draw('<path d="M3 12a9 9 0 1 0 9-9 9.750 9.750 0 0 0-6.740 2.740L3 8"/><path d="M3 3v5h5"/>'),
  skip: draw('<path d="M17 5v14L8 12l9-7Z"/><path d="M6 5v14"/>'),
  /* in a right-to-left screen, going back points right */
  goBack: draw('<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>'),
};
/* each seat keeps one colour, on its avatar and in the turn order */
const SEAT = ['#8fd3ff', '#ff9e9e', '#ffd36b', '#9be8a8'];

type Side = { kind: 'empath' } | { kind: 'guard'; guard: CardId } | { kind: 'amulet' };
/* only the actions possible now are shown, always in this order, so each one is found in the same place */
const MAIN_ORDER = ['done', 'skip', 'eye', 'burn', 'ability', 'move', 'more', 'call', 'back', 'undo'] as const;
const SIDE_ORDER = ['empath', 'guard', 'amulet'] as const;
type Slot = typeof MAIN_ORDER[number] | typeof SIDE_ORDER[number];
interface Btn { slot: Slot; label: string; icon?: keyof typeof ICON; kind?: 'burn' | 'ok'; off?: boolean; fn: () => void }
interface Controls {
  prompt: string;
  /** the second line; without it the line explains the card in hand */
  sub?: string;
  wait?: boolean;
  can?: (id: CardId, owner: number) => boolean;
  tap?: (id: CardId, owner: number) => void;
  buttons?: Btn[];
  deck?: () => void;
  discard?: () => void;
  row?: (id: CardId) => void;
  hand?: (id: CardId) => void;
  sideTools?: boolean;
  spot?: (index: number) => void;
  end?: (side: 'start' | 'end') => void;
}

let game: GameState | null = null;
let gameId = 0;
/* choices on the start screen survive closing the app */
const PREFS_KEY = 'silver-prefs-v1';
const SPEEDS = { slow: 1.5, normal: 1, fast: 0.5 } as const;
type Speed = keyof typeof SPEEDS;
const prefs: { rivals: number; speed: Speed; buzz: boolean } = (() => {
  const base = { rivals: 1, speed: 'normal' as Speed, buzz: true };
  try {
    const got = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<typeof base>;
    return {
      rivals: [1, 2, 3].includes(got.rivals ?? 0) ? (got.rivals as number) : base.rivals,
      speed: got.speed && got.speed in SPEEDS ? got.speed : base.speed,
      buzz: typeof got.buzz === 'boolean' ? got.buzz : base.buzz,
    };
  } catch { return base; }
})();
function savePrefs(): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* private mode: they just reset next time */ }
}
/** how long a rival's step stays on screen */
const pace = (ms: number) => Math.round(ms * SPEEDS[prefs.speed]);
let installEvent: (Event & { prompt: () => void }) | null = null;
const U = {
  sel: new Set<CardId>(),
  peek: new Map<CardId, number>(),
  reveal: new Map<CardId, number>(),
  pulse: new Set<CardId>(),
  mark: new Set<CardId>(),
  eye: new Set<CardId>(),
  arrow: null as { from: CardId; to: CardId } | null,
  verb: '',
  busy: '',
  side: null as Side | null,
  stolen: null as CardId | null,
  focus: null as CardId | null,
  sheet: null as 'score' | 'help' | 'settings' | 'newGame' | null,
  /** cards in the player's last set that did not match (0: none), so the next step can say why */
  setMiss: 0,
  guardNext: 0,
  note: '',
  log: [] as string[],
  /** what the player did this turn, one group per move, so an undo can drop the last one */
  mine: [] as string[][],
  /** shown for a moment after the player's turn ends on its own */
  doneMsg: '',
  /** what each rival did since the player's last turn */
  heard: new Map<number, string[]>(),
  zoom: null as number | null,
};

/* ---------- saving: a game survives closing the app ---------- */
function save(): void {
  try {
    /* cards still waiting for «دیدم» are saved too, or closing the app would lose them */
    if (game && game.phase !== 'gameEnd') localStorage.setItem(SAVE_KEY, JSON.stringify({ game, log: U.log.slice(-60), peek: [...U.peek] }));
    else localStorage.removeItem(SAVE_KEY);
  } catch { /* private mode: the game still works, it just is not saved */ }
}
interface Saved { game: GameState; log: string[]; peek?: [CardId, number][] }
/** A save from an older version that this one cannot read is dropped, instead of breaking the game. */
function saved(): Saved | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Saved;
    viewFor(data.game, ME);
    if (!Array.isArray(data.log) || data.game.players.length < 2) throw new Error('old save');
    return data;
  } catch {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clean */ }
    return null;
  }
}

/* ---------- waiting, and skipping a wait by tapping ---------- */
const ABORT = 'game-left';
let skipNow: (() => void) | null = null;
function wait(ms: number): Promise<void> {
  const id = gameId;
  return new Promise((res, rej) => {
    const done = () => { skipNow = null; if (id === gameId) res(); else rej(ABORT); };
    const timer = setTimeout(done, ms);
    skipNow = () => { clearTimeout(timer); done(); };
  });
}
const quietly = (work: Promise<void>) => work.catch(e => { if (e !== ABORT) throw e; });

/* ---------- moves ---------- */
const view = (): GameView => viewFor(game as GameState, ME);
const nameIn = (i: number) => game?.players[i]?.name ?? '';
/** One move in words, without who made it ('' when it is not worth telling). */
function describe(e: GameEvent): string {
  const s = game as GameState;
  const r = (id: CardId) => s.cards[id]?.rank ?? 0;
  switch (e.type) {
    case 'drew': return 'از دسته کشید';
    case 'took': return label(r(e.card)) + ' را برداشت';
    case 'burned': return label(r(e.card)) + ' را سوزاند';
    case 'revealedSet': return e.matched ? 'ست هم‌عدد سوزاند' : 'ست ناهم‌عدد رو کرد';
    case 'penalty': return 'یک کارت جریمه گرفت';
    case 'flipped': return label(r(e.card)) + ' را رو کرد';
    case 'looked': return 'به یک کارت نگاه کرد';
    case 'swapped': return 'دو کارت را جابه‌جا کرد';
    case 'guarded': return e.target ? 'محافظ گذاشت' : 'محافظ را برداشت';
    case 'amulet': return 'طلسم گذاشت';
    case 'called': return 'سرشماری کرد';
    default: return '';
  }
}
function dispatch(player: number, cmd: Command): GameEvent[] {
  const r = apply(game as GameState, player, cmd);
  game = r.state;
  const mine = new Set(game.players[ME]?.village ?? []);
  if (player === ME) {
    if (cmd.type === 'undo') U.mine.pop();
    else U.mine.push([]);
  }
  r.events.forEach((e, k) => {
    let text = describe(e);
    /* a single swap burns the old card and places the new one: say it as one swap */
    const nextEv = r.events[k + 1];
    if (e.type === 'burned' && nextEv?.type === 'placed' && cmd.type !== 'burn') text = label(game?.cards[e.card]?.rank ?? 0) + ' را با کارت جدید عوض کرد';
    if (text) U.log.push(nameIn((e as { player: number }).player) + ': ' + text);
    if (e.type === 'roundEnded') {
      U.log.push('پایان دور');
      U.mark.clear();
      U.pulse.clear();
      U.heard.clear();
      U.mine = [];
    }
    if (text && player === ME && cmd.type !== 'undo') U.mine[U.mine.length - 1]?.push(text);
    if (text && player !== ME && r.state.phase === 'turn') U.heard.set(player, [...(U.heard.get(player) ?? []), text]);
    /* once the player has moved, the rivals' news is old */
    if (e.type === 'turnEnded' && e.player === ME) U.heard.clear();
    if (e.type === 'saw' && e.to === ME && !r.state.turn.hand.includes(e.card)) U.peek.set(e.card, e.rank);
    if (e.type === 'revealedSet' && player === ME) U.setMiss = e.matched ? 0 : e.cards.length;
    if (player === ME) return;
    const touched = e.type === 'flipped' || e.type === 'looked' ? [e.card] : e.type === 'swapped' ? [e.a, e.b] : [];
    touched.forEach(id => { U.pulse.add(id); if (mine.has(id)) U.mark.add(id); });
    if (e.type === 'placed') U.pulse.add(e.card);
  });
  save();
  return r.events;
}
const sideOpen = (v: GameView): boolean => {
  const own = v.players[ME]?.village ?? [];
  if (v.empathLeft > 0 && own.some(c => !c.faceUp && v.amulet.on !== c.id)) return true;
  if (own.some(c => c.faceUp && c.rank === RANK.bodyguard && v.amulet.on !== c.id)) return true;
  return v.amulet.holder === ME && v.amulet.usable && !v.amulet.on;
};
/** What happens after any human move: finish the turn if nothing is left, then let rivals play. */
function settle(): void {
  U.sel.clear();
  U.side = null;
  U.stolen = null;
  U.focus = null;
  if (game && !U.peek.size && game.phase === 'turn' && game.current === ME && game.turn.step === 'confirm') {
    const v = view();
    if (!v.canUndo && !sideOpen(v)) dispatch(ME, { type: 'confirm' });
  }
  if (game && !U.peek.size && game.phase === 'turn' && game.current !== ME) void quietly(runRivals());
  render();
}
function act(cmd: Command): void {
  try {
    dispatch(ME, cmd);
    U.note = '';
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
    U.note = e.message;
    const shown = U.note;
    setTimeout(() => { if (U.note === shown) { U.note = ''; render(); } }, 4000);
  }
  settle();
}
async function exchange(card: CardId, targets: CardId[]): Promise<void> {
  if (targets.length > 1) await showSet(targets);
  act({ type: 'exchange', card, targets });
}
async function showSet(targets: CardId[]): Promise<void> {
  const s = game as GameState;
  targets.forEach(id => U.reveal.set(id, s.cards[id]?.rank ?? 0));
  U.busy = 'کارت‌ها رو می‌شوند…';
  render();
  await wait(1300);
  U.busy = '';
  U.reveal.clear();
}

/* ---------- rivals ---------- */
let rivalsRunning = false;
async function runRivals(): Promise<void> {
  if (rivalsRunning) return;
  rivalsRunning = true;
  try {
    /* a turn that ended by itself still says what happened before the rivals move */
    const did = U.mine.flat();
    U.mine = [];
    if (did.length) {
      U.doneMsg = did.join('، ');
      render();
      await wait(1200);
      U.doneMsg = '';
    }
    while (game && game.phase === 'turn' && game.current !== ME) {
      await rivalMove(game.current, safeBotCommand(game, game.current, Math.random));
    }
  } finally {
    rivalsRunning = false;
  }
  U.verb = '';
  U.arrow = null;
  /* a short buzz says the rivals are done and it is the player's turn */
  if (prefs.buzz && game?.phase === 'turn' && game.current === ME) {
    try { navigator.vibrate?.(30); } catch { /* not every phone can */ }
  }
  settle();
}
async function rivalMove(p: number, cmd: Command): Promise<void> {
  const s = game as GameState;
  const beat = async (verb: string, ms = 1500) => { U.verb = verb; render(); await wait(pace(ms)); };
  const go = () => { dispatch(p, cmd); };
  const aim = async (from: CardId, to: CardId, verb: string) => { U.arrow = { from, to }; await beat(verb); U.arrow = null; };
  switch (cmd.type) {
    case 'draw': go(); await beat('کشید'); return;
    case 'drawMore': go(); await beat('یکی دیگر کشید'); return;
    case 'takeDiscard': case 'takeRow': go(); await beat('برداشت'); return;
    case 'exchange':
      await aim(cmd.card, cmd.targets[0] as CardId, 'عوض می‌کند');
      if (cmd.targets.length > 1) await showSet(cmd.targets);
      go();
      await beat('عوض کرد', 1000);
      return;
    case 'burn':
      U.reveal.set(cmd.card, s.cards[cmd.card]?.rank ?? 0);
      await beat('می‌سوزاند');
      U.reveal.clear();
      go();
      await beat('سوزاند', 900);
      return;
    case 'target': {
      const pending = s.turn.pending;
      if (pending === RANK.robber) {
        await aim(cmd.cards[1] as CardId, cmd.cards[0] as CardId, 'می‌دزدد');
        go();
        await beat('دزدید');
      } else if (pending === RANK.master) {
        go();
        await beat('برداشت');
      } else {
        U.eye = new Set(cmd.cards);
        await beat(pending === RANK.exposer || pending === RANK.revealer ? 'رو می‌کند' : 'نگاه می‌کند');
        U.eye = new Set();
        go();
        await beat(pending === RANK.exposer || pending === RANK.revealer ? 'رو کرد' : 'نگاه کرد', 900);
      }
      return;
    }
    case 'witchGive':
      await aim(s.turn.hand[0] as CardId, cmd.target, 'عوض می‌کند');
      go();
      await beat('عوض کرد', 1000);
      return;
    case 'empathPeek':
      U.eye = new Set([cmd.card]);
      await beat('نگاه می‌کند');
      U.eye = new Set();
      go();
      return;
    case 'guard': go(); U.pulse.add(cmd.target ?? cmd.guard); await beat('محافظ گذاشت'); return;
    case 'placeAmulet': go(); U.pulse.add(cmd.card); await beat('طلسم گذاشت'); return;
    case 'call': go(); await beat('سرشماری کرد'); return;
    case 'confirm': go(); U.verb = ''; render(); await wait(pace(500)); return;
    default: go();
  }
}

/* ---------- starting ---------- */
function startGame(rivals: number): void {
  gameId++;
  U.sheet = null;
  U.log = [];
  U.heard.clear();
  U.mine = [];
  U.doneMsg = '';
  const names = ['تو', ...Array.from({ length: rivals }, (_, i) => 'رقیب ' + fa(i + 1))];
  game = newGame(names, Math.floor(Math.random() * 2 ** 31));
  rivalsPeek();
  save();
  render();
}
function rivalsPeek(): void {
  const s = game as GameState;
  s.players.forEach((_p, i) => {
    if (i !== ME && !s.peeked[i]) dispatch(i, safeBotCommand(game as GameState, i, Math.random));
  });
}
function leave(): void {
  gameId++;
  game = null;
  U.sel.clear(); U.peek.clear(); U.reveal.clear(); U.mark.clear(); U.pulse.clear(); U.eye.clear();
  U.side = null; U.sheet = null; U.heard.clear(); U.mine = []; U.doneMsg = ''; U.zoom = null; U.note = ''; U.busy = ''; U.verb = ''; U.arrow = null;
  render();
}
function resume(data: Saved): void {
  gameId++;
  U.sheet = null;
  game = data.game;
  U.log = data.log;
  U.peek = new Map(Array.isArray(data.peek) ? data.peek : []);
  settle();
}

/* ---------- what the player can do right now ---------- */
function controls(v: GameView): Controls {
  if (U.busy) return { prompt: U.busy, wait: true };
  if (v.phase !== 'peek' && v.phase !== 'turn') return { prompt: '' };
  const own = v.players[ME]?.village ?? [];
  if (U.peek.size) {
    const first = v.phase === 'peek' || (game?.turn.step === 'start' && v.current !== ME) || U.peek.size === 2 && !game?.turn.source;
    return {
      prompt: first ? 'به خاطر بسپار' : 'فقط تو می‌بینی',
      buttons: [{ slot: 'done', icon: 'eye', label: 'دیدم', kind: 'ok', fn: () => { U.peek.clear(); save(); settle(); } }],
    };
  }
  if (v.phase === 'peek') {
    return {
      prompt: 'دو کارت را ببین',
      can: (_id, o) => o === ME,
      tap: id => {
        if (U.sel.has(id)) U.sel.delete(id); else if (U.sel.size < 2) U.sel.add(id);
        if (U.sel.size === 2) {
          const [a, b] = [...U.sel] as [CardId, CardId];
          U.sel.clear();
          dispatch(ME, { type: 'peek', cards: [a, b] });
        }
        render();
      },
    };
  }
  if (v.current !== ME) return { prompt: 'نوبت ' + nameIn(v.current), wait: true };
  if (U.side) return sideControls(v);

  const free = (id: CardId) => v.amulet.on !== id;
  const toggle = (id: CardId) => { if (U.sel.has(id)) U.sel.delete(id); else U.sel.add(id); render(); };
  const selected = () => own.filter(c => U.sel.has(c.id)).map(c => c.id);

  switch (v.step) {
    case 'start': {
      const canCall = own.length <= CALL_LIMIT && v.caller === null;
      return {
        prompt: v.caller !== null ? 'نوبت آخر: کارت بکش' : 'کارت بکش',
        sideTools: true,
        deck: v.deckCount ? () => act({ type: 'draw' }) : undefined,
        discard: v.discard.length && own.some(c => free(c.id)) ? () => act({ type: 'takeDiscard' }) : undefined,
        row: id => act({ type: 'takeRow', card: id }),
        buttons: canCall ? [{ slot: 'call', icon: 'call', label: 'سرشماری', off: v.sideUsed, fn: () => act({ type: 'call' }) }] : [],
      };
    }
    case 'decide': {
      const hand = v.hand;
      const focus = hand.find(c => c.id === U.focus) ?? (hand[0] as CardView);
      const n = U.sel.size;
      const fromPile = v.canReturn;
      const buttons: Btn[] = [];
      const burnable = !fromPile || game?.turn.source === 'row';
      const power = burnable && focus.rank !== null && hasDrawAbility(focus.rank);
      /* the swap button is always on show, so the player learns that tapping a village card swaps */
      buttons.push({ slot: 'move', icon: 'swap', label: 'معاوضه', off: !n, fn: () => void quietly(exchange(focus.id, selected())) });
      if (!n && burnable) {
        if (power) buttons.push({ slot: 'ability', icon: 'ability', label: 'سوزاندن + توانایی', fn: () => act({ type: 'burn', card: focus.id, useAbility: true }) });
        buttons.push({ slot: 'burn', icon: 'flame', label: power ? 'فقط سوزاندن' : 'سوزاندن', kind: 'burn', fn: () => act({ type: 'burn', card: focus.id, useAbility: false }) });
      }
      if (!n && game?.turn.source === 'deck' && hand.length <= v.rascalExtra && v.deckCount) buttons.push({ slot: 'more', icon: 'more', label: 'کارت بیشتر', fn: () => act({ type: 'drawMore' }) });
      if (!n && fromPile) buttons.push({ slot: 'back', icon: 'back', label: 'برگرداندن', fn: () => act({ type: 'returnCard' }) });
      const text = TEXT[focus.rank ?? -1] ?? '';
      let prompt: string;
      let sub: string;
      if (n > 1) { prompt = setPrompt(n); sub = setRisk(n); }
      else if (n === 1) { prompt = 'معاوضه را بزن'; sub = 'برای ست، کارت‌های هم‌عدد دیگر را هم انتخاب کن.'; }
      else if (hand.length > 1) { prompt = 'یکی را نگه دار'; sub = text; }
      else if (burnable) { prompt = 'بسوزان، یا کارت دهکده را بزن تا عوض شود'; sub = text; }
      /* a card from the burned pile is only swapped, so its ability is not offered */
      else { prompt = 'کارت دهکده را بزن تا عوض شود'; sub = 'کارت ستون سوخته فقط معاوضه می‌شود و توانایی‌اش به کار نمی‌آید.'; }
      return { prompt, sub, sideTools: true, buttons, can: (id, o) => o === ME && free(id), tap: toggle, hand: id => { U.focus = id; render(); } };
    }
    case 'placeSpot': return { prompt: 'کارت جدید کجا بنشیند؟', spot: i => act({ type: 'placeSpot', index: i }) };
    case 'placeEnd': {
      const end = (side: 'start' | 'end') => act({ type: 'placeEnd', side });
      if (game?.turn.placing?.unseen) {
        return { prompt: 'کارت جریمه: کدام سر دهکده؟', sub: 'ست ۳ کارتی یا بیشتر هم‌عدد نبود، پس یک کارت ندیده از دسته هم جریمه می‌گیری.', sideTools: true, end };
      }
      const extra = U.setMiss >= 3 ? ' بعد از آن، یک کارت ندیده هم از دسته جریمه می‌گیری.' : '';
      return {
        prompt: U.setMiss ? 'ست هم‌عدد نبود: کدام سر دهکده؟' : 'به کدام سر دهکده برود؟',
        sub: U.setMiss ? `کارت‌های ست پشت‌ورو سر جایشان برگشتند (همه آن‌ها را دیدند). کارت جدید نمی‌سوزد و به یک سر دهکده‌ات اضافه می‌شود.${extra}` : undefined,
        sideTools: true,
        end,
      };
    }
    case 'witch': {
      const top = v.hand[0] as CardView;
      const n = U.sel.size;
      return {
        prompt: n > 1 ? setPrompt(n) : 'با کارت حریف یا خودت عوض کن',
        sub: n > 1 ? setRisk(n) : undefined,
        sideTools: true,
        can: (id, o) => (o === ME ? free(id) : v.witchTargets.includes(id)),
        tap: (id, o) => { if (o === ME) toggle(id); else act({ type: 'witchGive', target: id }); },
        buttons: [{ slot: 'move', icon: 'swap', label: 'معاوضه', off: !n, fn: () => void quietly(exchange(top.id, selected())) }],
      };
    }
    /* the empath, bodyguard and amulet work at any moment of the turn */
    case 'ability': return { ...abilityControls(v), sideTools: true };
    case 'confirm': default: {
      const buttons: Btn[] = [{ slot: 'done', icon: 'check', label: 'تمام', kind: 'ok', fn: () => { U.mine = []; act({ type: 'confirm' }); } }];
      if (v.canUndo) buttons.push({ slot: 'undo', icon: 'undo', label: 'پس گرفتن', fn: () => act({ type: 'undo' }) });
      const did = U.mine.flat();
      return { prompt: 'نوبتت تمام شد؟', sub: did.length ? 'این نوبت: ' + did.join('، ') : undefined, sideTools: true, buttons };
    }
  }
}
/* choosing several cards means a set, which costs a card when the numbers differ */
const setPrompt = (n: number) => `ست ${fa(n)} کارتی: همه باید هم‌عدد باشند`;
const setRisk = (n: number) => `اگر هم‌عدد نباشند، کارت‌ها برمی‌گردند و کارت جدید هم به دهکده‌ات اضافه می‌شود${n >= 3 ? '، به‌علاوه‌ی یک کارت جریمه از دسته' : ''}.`;
function abilityControls(v: GameView): Controls {
  const r = v.pending as number;
  const back: Btn[] = [{ slot: 'skip', icon: 'skip', label: 'رد کردن', fn: () => act({ type: 'skipAbility' }) }];
  if (v.canUndo) back.push({ slot: 'undo', icon: 'undo', label: 'پس گرفتن', fn: () => act({ type: 'undo' }) });
  const allowed = (id: CardId) => v.candidates.includes(id);
  const one = (prompt: string): Controls => ({ prompt, can: allowed, tap: id => act({ type: 'target', cards: [id] }), buttons: back });
  switch (r) {
    case RANK.exposer: return one('یک کارت خودت را رو کن');
    case RANK.revealer: return one('یک کارت را رو کن');
    case RANK.apprenticeSeer: return one('یک کارت حریف را ببین');
    case RANK.seer: return one('یک کارت را ببین');
    case RANK.beholder: {
      const n = U.sel.size;
      return {
        prompt: 'تا ۲ کارت خودت را ببین',
        can: id => allowed(id) && (n < 2 || U.sel.has(id)),
        tap: id => { if (U.sel.has(id)) U.sel.delete(id); else U.sel.add(id); render(); },
        buttons: n ? [{ slot: 'eye', icon: 'eye', label: 'دیدن', fn: () => act({ type: 'target', cards: [...U.sel] }) }] : back,
      };
    }
    case RANK.master:
      return { prompt: 'یک کارت بردار', can: () => false, buttons: back };
    case RANK.robber: {
      if (!U.stolen) return { prompt: 'کارت حریف را انتخاب کن', can: allowed, tap: id => { U.stolen = id; U.sel = new Set([id]); render(); }, buttons: back };
      const stolen = U.stolen;
      return {
        prompt: 'کارت خودت را بده',
        can: (id, o) => o === ME && v.amulet.on !== id,
        tap: id => act({ type: 'target', cards: [stolen, id] }),
        buttons: [{ slot: 'back', icon: 'goBack', label: 'برگشت', fn: () => { U.stolen = null; U.sel.clear(); render(); } }],
      };
    }
    default: return { prompt: '', buttons: back };
  }
}
function sideControls(v: GameView): Controls {
  const side = U.side as Side;
  const back = () => { U.side = null; render(); };
  const own = v.players[ME]?.village ?? [];
  const backBtn: Btn = { slot: 'back', icon: 'goBack', label: 'برگشت', fn: back };
  const keep = (cmd: Command) => {
    const sel = new Set(U.sel);
    const focus = U.focus;
    dispatch(ME, cmd);
    U.side = null;
    U.sel = sel;
    U.focus = focus;
    render();
  };
  if (side.kind === 'empath') {
    return { prompt: 'یک کارت خودت را ببین', can: (id, o) => o === ME && !own.find(c => c.id === id)?.faceUp && v.amulet.on !== id, tap: id => keep({ type: 'empathPeek', card: id }), buttons: [backBtn] };
  }
  if (side.kind === 'amulet') {
    const linked = (id: CardId) => own.some(c => c.guarding === id) || !!own.find(c => c.id === id)?.guarding;
    return { prompt: 'یک کارت را قفل کن', can: (id, o) => o === ME && !linked(id), tap: id => keep({ type: 'placeAmulet', card: id }), buttons: [backBtn] };
  }
  const g = side.guard;
  const buttons: Btn[] = [backBtn];
  if (own.find(c => c.id === g)?.guarding) buttons.unshift({ slot: 'guard', icon: 'shield', label: 'برداشتن', kind: 'burn', fn: () => keep({ type: 'guard', guard: g, target: null }) });
  return {
    prompt: 'یک کارت را حفظ کن',
    can: (id, o) => {
      if (o !== ME || id === g || v.amulet.on === id) return false;
      if (own.find(c => c.id === id)?.guarding) return false;
      const other = own.find(c => c.guarding === id);
      return !other || other.id === g;
    },
    tap: id => keep({ type: 'guard', guard: g, target: id }),
    buttons,
  };
}

/* ---------- drawing ---------- */
const root = document.getElementById('root') as HTMLElement;
let reg: (() => void)[] = [];
const rb = (fn: () => void) => reg.push(fn) - 1;

/** ghost: a copy shown somewhere else (big in the middle), so it must not take part in the glide */
function cardEl(c: CardView, opts: { act?: number; go?: boolean; extra?: string; ghost?: boolean; where?: string } = {}): string {
  const rank = U.peek.get(c.id) ?? U.reveal.get(c.id) ?? c.rank;
  const visible = rank !== null;
  const cls = ['card', visible ? 'face' : 'back'];
  if (U.sel.has(c.id)) cls.push('sel');
  if (U.mark.has(c.id)) cls.push('marked');
  if (U.pulse.has(c.id)) cls.push('pulse');
  if (U.peek.has(c.id)) cls.push('peek');
  if (opts.go) cls.push('go');
  if (opts.extra) cls.push(opts.extra);
  const art = visible ? ` style="background-image:url(art/c${rank}.jpg)"` : '';
  const aria = (opts.where ? opts.where + ': ' : '') + (visible ? `${nameOf(rank)}، عدد ${fa(rank)}` : 'کارت پشت‌ورو') + (U.sel.has(c.id) ? '، انتخاب‌شده' : '');
  const eye = U.eye.has(c.id) ? `<span class="eye">${ICON.eye}</span>` : '';
  const inner = (visible ? `<span class="pip">${fa(rank)}</span><span class="nm">${nameOf(rank)}</span>` : '') + eye;
  /* a face-up card with nothing to do opens big, so its picture and text can be read */
  let action = ` data-act="${opts.act}"`;
  if (opts.act === undefined) {
    if (visible) { action = ` data-zoom="${rank}"`; cls.push('idle'); } else action = ' disabled';
  }
  const id = opts.ghost ? '' : ` data-cid="${c.id}" data-face="${visible ? 1 : 0}"`;
  return `<button type="button" class="${cls.join(' ')}"${id}${art}${action} aria-label="${aria}">${inner}</button>`;
}
function villageEl(v: GameView, owner: number, m: Controls): { html: string; count: number } {
  const row = v.players[owner]?.village ?? [];
  const items: string[] = [];
  const gap = (fn: () => void) => `<div class="slot"><button type="button" class="gap" data-act="${rb(fn)}">اینجا</button></div>`;
  const small = owner !== ME;
  row.forEach((c, i) => {
    if (owner === ME && m.spot && v.spots.includes(i)) {
      const spot = m.spot;
      items.push(gap(() => spot(i)));
      return;
    }
    if (c.guarding) return;
    const able = !!m.can?.(c.id, owner);
    const tap = m.tap;
    const where = `${owner === ME ? 'دهکده‌ی تو' : `دهکده‌ی ${nameIn(owner)}`}، کارت ${fa(i + 1)}`;
    let html = cardEl(c, { act: able && tap ? rb(() => tap(c.id, owner)) : undefined, extra: small ? 'mini-card' : '', where });
    if (v.amulet.on === c.id) html += `<span class="seal">${AMULET}</span>`;
    const g = row.find(x => x.guarding === c.id);
    let gAble = false;
    if (g) {
      gAble = !!m.can?.(g.id, owner);
      html += `<span class="guard">${cardEl(g, { act: gAble && tap ? rb(() => tap(g.id, owner)) : undefined, extra: 'mini-card', where: where + '، محافظ' })}</span>`;
    }
    const dim = !!m.can && !able && !gAble;
    items.push(`<div class="slot${dim ? ' dim' : ''}">${html}</div>`);
  });
  if (owner === ME && m.end) {
    const end = m.end;
    items.unshift(gap(() => end('start')));
    items.push(gap(() => end('end')));
  }
  return { html: items.join(''), count: items.length };
}
const columns = (count: number) => Math.min(Math.max(5, count), 7);
const amuletToken = (v: GameView, i: number) => (v.amulet.holder === i && v.amulet.usable && !v.amulet.on ? `<span class="amulet-token">${AMULET}</span>` : '');
const round = (icon: string) => `<span class="ring">${icon}</span>`;

function toolsEl(v: GameView, m: Controls): string {
  const by = new Map<Slot, Btn>();
  (m.buttons ?? []).forEach(b => by.set(b.slot, b));
  /* the side tools work at any moment of the turn and stay apart, at the far end */
  if (m.sideTools) {
    const own = v.players[ME]?.village ?? [];
    if (!by.has('empath') && v.empathLeft > 0 && own.some(c => !c.faceUp && v.amulet.on !== c.id)) by.set('empath', { slot: 'empath', icon: 'eye', label: `افسون‌گر ${fa(v.empathLeft)}`, fn: () => { U.side = { kind: 'empath' }; render(); } });
    const guards = own.filter(c => c.faceUp && c.rank === RANK.bodyguard && v.amulet.on !== c.id);
    /* with several bodyguards, each tap moves on to the next one */
    if (!by.has('guard') && guards.length) by.set('guard', { slot: 'guard', icon: 'shield', label: 'محافظ', fn: () => { const g = guards[U.guardNext++ % guards.length] as CardView; U.side = { kind: 'guard', guard: g.id }; render(); } });
    if (!by.has('amulet') && v.amulet.holder === ME && v.amulet.usable && !v.amulet.on) by.set('amulet', { slot: 'amulet', label: 'طلسم', fn: () => { U.side = { kind: 'amulet' }; render(); } });
  }
  const one = (b: Btn) => {
    const art = b.slot === 'amulet' ? AMULET : ICON[b.icon ?? 'check'];
    const cls = `tool ${b.kind ?? ''}${b.slot === 'amulet' ? ' art' : ''}${b.off ? ' off' : ''}`;
    return `<button type="button" class="${cls}"${b.off ? ' disabled' : ` data-act="${rb(b.fn)}"`}>${round(art)}<small>${b.label}</small></button>`;
  };
  const main = MAIN_ORDER.flatMap(k => (by.has(k) ? [one(by.get(k) as Btn)] : []));
  const side = SIDE_ORDER.flatMap(k => (by.has(k) ? [one(by.get(k) as Btn)] : []));
  return main.join('') + (main.length && side.length ? '<span class="tools-sep" aria-hidden="true"></span>' : '') + side.join('');
}
function messageEl(v: GameView, m: Controls): string {
  let main = m.prompt;
  let sub = m.sub ?? '';
  if (U.doneMsg) {
    main = 'نوبتت تمام شد';
    sub = U.doneMsg;
  } else if (v.phase === 'turn' && v.current !== ME && U.verb) {
    main = `${nameIn(v.current)} ${U.verb}`;
    sub = 'برای سریع‌تر شدن، روی میز بزن';
  } else if (!m.sub && v.current === ME && v.phase === 'turn' && !v.hand.length && !U.peek.size && U.heard.size) {
    /* what the rivals did since the player's last turn, one line each */
    sub = [...U.heard].map(([p, said]) => `<i style="--c:${SEAT[p]}"></i>${nameIn(p)}: ${said.join('، ')}`).join('<br>');
  }
  return `<div class="message"><b>${main}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
}
function gameEl(): string {
  const v = view();
  const m = controls(v);
  const rivalCount = v.players.length - 1;
  const rivals = v.players.map((p, i) => {
    if (i === ME) return '';
    const on = v.phase === 'turn' && v.current === i;
    const row = villageEl(v, i, m);
    const called = v.caller === i ? '<span class="called">سرشماری کرد</span>' : '';
    /* the avatar is a placeholder: a character portrait can take its place later */
    return `<section class="rival-panel${on ? ' on' : ''}" aria-label="${p.name}"><span class="rival-avatar" style="--c:${SEAT[i]}" aria-hidden="true">${fa(i)}</span><div class="cards-row-rival${m.can ? ' pick' : ''}" style="--n:${columns(row.count)}">${row.html}</div>${amuletToken(v, i)}${called}</section>`;
  }).join('');
  const pile = v.discard.slice(-2);
  const deckBtn = v.deckCount
    ? `${v.deckCount > 2 ? '<div class="deck-stack-card deck-under-2"></div>' : ''}${v.deckCount > 1 ? '<div class="deck-stack-card deck-under-1"></div>' : ''}<button type="button" class="card back deck-top${m.deck ? ' go' : ''}" data-deck="1"${m.deck ? ` data-act="${rb(m.deck)}"` : ' disabled'} aria-label="دسته، ${fa(v.deckCount)} کارت"></button><span class="deck-count" aria-hidden="true">${fa(v.deckCount)}</span>`
    : '<span class="emptypile"></span>';
  const discBtn = pile.length
    ? pile.map((c, i) => {
      const isTop = i === pile.length - 1;
      return cardEl(c, { act: isTop && m.discard ? rb(m.discard) : undefined, go: isTop && !!m.discard, extra: isTop ? 'discard-card' : 'discard-under', where: 'ستون سوخته' });
    }).join('')
    : '<span class="emptypile"></span>';
  const rowFn = m.row;
  const row = v.row.length ? `<div class="squires">${v.row.map(c => `<div class="sq">${cardEl(c, { act: rowFn ? rb(() => rowFn(c.id)) : undefined, go: !!rowFn, where: 'کنار دسته' })}</div>`).join('')}</div>` : '';
  const piles = `<div class="piles">${row}<div class="pile">${deckBtn}</div><div class="pile">${discBtn}</div></div>`;
  let stage = '';
  if (v.hand.length) {
    if (v.current !== ME) {
      stage = `<div class="stage watch"><div class="hand">${v.hand.map(c => cardEl(c)).join('')}</div></div>`;
    } else {
      const focus = v.hand.find(c => c.id === U.focus) ?? (v.hand[0] as CardView);
      const handFn = m.hand;
      const cards = v.hand.map(c => cardEl(c, { act: handFn && v.hand.length > 1 ? rb(() => handFn(c.id)) : undefined, go: v.hand.length > 1 && c === focus })).join('');
      stage = `<div class="stage"><div class="hand${v.hand.length > 1 ? ' many' : ''}">${cards}</div></div>`;
    }
  }
  /* the card waiting for a place stays in sight, so it is clear what goes where */
  const placing = v.current === ME && (v.step === 'placeEnd' || v.step === 'placeSpot') ? game?.turn.placing : null;
  if (placing) {
    const pc: CardView = { id: placing.card, rank: placing.unseen ? null : (game as GameState).cards[placing.card]?.rank ?? null, faceUp: false, guarding: null };
    stage = `<div class="stage"><div class="hand">${cardEl(pc)}</div></div>`;
  }
  /* a card just looked at is also shown big in the middle, where it can be read */
  if (U.peek.size) {
    const seen = [...U.peek].map(([id, rank]) => cardEl({ id, rank, faceUp: false, guarding: null }, { ghost: true })).join('');
    stage = `<div class="stage"><div class="hand${U.peek.size > 1 ? ' many' : ''}">${seen}</div></div>`;
  }
  const n = v.players.length;
  const scored = v.players.some(p => p.scores.length);
  const order = Array.from({ length: n }, (_, k) => (v.current + k) % n)
    .map((i, k) => `<li class="${k === 0 && v.phase === 'turn' ? 'now' : ''}${i === ME ? ' me' : ''}"><i style="--c:${SEAT[i]}"></i>${nameIn(i)}${scored ? ` <b aria-label="امتیاز">${fa(v.players[i]?.total ?? 0)}</b>` : ''}</li>`).join('');
  const orderEl = v.phase === 'turn' || v.phase === 'peek' ? `<ol class="order" aria-label="ترتیب نوبت‌ها، از نوبت فعلی">${order}</ol>` : '<ol class="order"></ol>';
  const mine = villageEl(v, ME, m);
  const note = U.note ? `<button type="button" class="note" data-act="${rb(() => { U.note = ''; render(); })}">${U.note}</button>` : '';
  const skip = v.current !== ME && v.phase === 'turn' ? ` data-act="${rb(() => skipNow?.())}"` : '';
  const topBtn = (icon: string, labelText: string, fn: () => void) => `<button type="button" class="round-btn" aria-label="${labelText}" data-act="${rb(fn)}">${round(icon)}</button>`;
  return `<div class="game">
    <header class="top-bar">
      ${topBtn(ICON.home, 'خانه', leave)}
      ${topBtn(ICON.sheet, 'امتیاز و تاریخچه', () => { U.sheet = 'score'; render(); })}
      <div class="round-title"><h1>دور ${fa(v.round)} <small>از ${fa(ROUNDS)}</small></h1></div>
      ${topBtn(ICON.help, 'راهنمای کارت‌ها', () => { U.sheet = 'help'; render(); })}
    </header>
    ${orderEl}
    <div class="rivals${rivalCount > 1 ? ' many' : ''}">${rivals}</div>
    <main class="center-table"${skip}>${piles}${stage}${note}</main>
    ${messageEl(v, m)}
    <section class="village-section${v.phase === 'turn' && v.current === ME ? ' on' : ''}" aria-label="دهکده‌ی تو">${amuletToken(v, ME)}${v.caller === ME ? '<span class="called">سرشماری کردی</span>' : ''}
      <div class="cards-row-player${m.can ? ' pick' : ''}" style="--n:${columns(mine.count)}">${mine.html}</div></section>
    <nav class="tools" aria-label="کارها">${toolsEl(v, m)}</nav>
    ${sheetEl(v)}
    ${zoomEl()}
  </div>`;
}
function zoomEl(): string {
  if (U.zoom === null) return '';
  const r = U.zoom;
  return `<div class="zoom" role="dialog" aria-modal="true" aria-label="${nameOf(r)}" tabindex="-1" data-act="${rb(() => { U.zoom = null; render(); })}"><span class="zoom-card" style="background-image:url(art/c${r}.jpg)"></span><p><strong>${label(r)}</strong>${TEXT[r] ?? ''}</p><small>برای بستن بزن</small></div>`;
}
/** A dialog. A closable one also closes with Escape or a tap outside it. */
function panel(title: string, body: string, closable = true): string {
  const close = closable ? `<button type="button" class="panel-close" aria-label="بستن" data-act="${rb(closeSheet)}">${ICON.close}</button>` : '';
  return `<div class="sheet"${closable ? ' data-close="1"' : ''}><div class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabindex="-1">${close}<h2 id="panel-title">${title}</h2>${body}</div></div>`;
}
function closeSheet(): void {
  U.sheet = null;
  render();
}
function helpBody(): string {
  return AMULET_SET.map(d => `<div class="row-help"><button type="button" class="thumb" data-zoom="${d.rank}" aria-label="${d.name} بزرگ" style="background-image:url(art/c${d.rank}.jpg)"></button><p><strong>${d.name} · ${fa(d.rank)}</strong><small>${fa(d.count)} کارت</small>${TEXT[d.rank]}</p></div>`).join('');
}
function scoreTable(v: GameView): string {
  const rounds = Math.max(...v.players.map(p => p.scores.length));
  const low = Math.min(...v.players.map(p => p.total));
  const head = `<tr><th>بازیکن</th>${Array.from({ length: rounds }, (_, i) => `<th>دور ${fa(i + 1)}</th>`).join('')}<th>جمع کل</th></tr>`;
  const rows = v.players.map((p, i) => `<tr${p.total === low ? ' class="best"' : ''}><td><i style="--c:${SEAT[i]}"></i>${p.name}</td>${p.scores.map(s => `<td>${fa(s)}</td>`).join('')}<td><b>${fa(p.total)}</b></td></tr>`).join('');
  return `<table class="score">${head}${rows}</table>`;
}
/** Why the round ended, what the call did and who starts next, in plain sentences. */
function resultText(v: GameView): string {
  const r = v.result;
  if (!r) return '';
  const name = (i: number) => v.players[i]?.name ?? '';
  const lines = [{ vote: 'دور با سرشماری تمام شد.', villager: 'دور تمام شد، چون هر دو دهاتی رو شدند.', deck: 'دور تمام شد، چون کارت‌های دسته تمام شد.' }[r.reason]];
  if (r.caller !== null) {
    const who = r.caller === ME ? 'تو سرشماری کردی و' : `${name(r.caller)} سرشماری کرد و`;
    lines.push(r.callerWon ? `${who} کمترین مجموع را داشت، پس امتیاز این دور ۰ شد.` : `${who} کمترین مجموع را نداشت، پس ۱۰ امتیاز جریمه اضافه شد.`);
  }
  if (v.round < ROUNDS) {
    const holder = v.amulet.holder ?? 0;
    lines.push(`${holder === ME ? 'تو دور بعد را شروع می‌کنی' : `${name(holder)} دور بعد را شروع می‌کند`}${v.amulet.usable ? ' و طلسم فعال دارد' : ''}.`);
  }
  return lines.map(l => `<p>${l}</p>`).join('');
}
/** The log, newest first, with each player's moves in a row joined into one line. */
function historyEl(v: GameView): string {
  const groups: { who: number; texts: string[] }[] = [];
  for (const line of U.log) {
    const who = v.players.findIndex(p => line.startsWith(p.name + ': '));
    const text = who < 0 ? line : line.slice((v.players[who]?.name.length ?? 0) + 2);
    const last = groups[groups.length - 1];
    if (last && last.who === who && who >= 0) last.texts.push(text);
    else groups.push({ who, texts: [text] });
  }
  return `<ul class="logs">${groups.reverse().map(g => (g.who < 0
    ? `<li class="sep">${g.texts.join('، ')}</li>`
    : `<li><i style="--c:${SEAT[g.who]}"></i><b>${nameIn(g.who)}:</b> ${g.texts.join('، ')}</li>`)).join('')}</ul>`;
}
function sheetEl(v: GameView): string {
  if (v.phase === 'gameEnd') {
    const title = v.winner === ME ? 'تو بردی!' : `${v.players[v.winner ?? 0]?.name} برد`;
    const again = () => { prefs.rivals = v.players.length - 1; startGame(prefs.rivals); };
    return panel(title, `<p>برنده کسی است که در پایان ${fa(ROUNDS)} دور کمترین جمع امتیاز را دارد.</p>${scoreTable(v)}
      <button type="button" class="game-btn primary" data-act="${rb(again)}">یک بازی دیگر</button>
      <button type="button" class="game-btn" data-act="${rb(leave)}">صفحه‌ی اول</button>`, false);
  }
  if (v.phase === 'roundEnd') {
    const r = v.result;
    const best = Math.min(...(r?.scores ?? [0]));
    const rows = v.players.map((p, i) => {
      const score = r?.scores[i] ?? 0;
      const sum = r?.sums[i] ?? 0;
      const note = sum !== score ? `<small>مجموع کارت‌ها ${fa(sum)}</small>` : '';
      const cards = p.village.map(c => `<div class="slot">${cardEl(c, { extra: 'mini-card' })}</div>`).join('');
      return `<div class="res${score === best ? ' best' : ''}"><header><span><i style="--c:${SEAT[i]}"></i>${p.name}${score === best ? ' <em>کمترین</em>' : ''}</span><span><b>${fa(score)}</b> امتیاز ${note}</span></header><div class="res-cards">${cards}</div></div>`;
    }).join('');
    const next = () => { dispatch(ME, { type: 'nextRound' }); if (game?.phase === 'peek') rivalsPeek(); settle(); };
    return panel(`پایان دور ${fa(v.round)} از ${fa(ROUNDS)}`, `${resultText(v)}${rows}<h3>جدول امتیاز <small>(کمتر بهتر است)</small></h3>${scoreTable(v)}<button type="button" class="game-btn primary" data-act="${rb(next)}">${v.round >= ROUNDS ? 'دیدن برنده' : 'دور بعد'}</button>`, false);
  }
  if (v.step === 'ability' && v.pending === RANK.master && v.current === ME && !U.side) {
    const pile = v.discard.filter(c => v.candidates.includes(c.id));
    const back = `<button type="button" class="game-btn" data-act="${rb(() => act({ type: 'skipAbility' }))}">هیچ کارتی برنمی‌دارم</button>${v.canUndo ? `<button type="button" class="game-btn" data-act="${rb(() => act({ type: 'undo' }))}">پس گرفتن حرکت</button>` : ''}`;
    return panel('ستون سوخته', `<div class="grid pick">${pile.map(c => cardEl(c, { act: rb(() => act({ type: 'target', cards: [c.id] })) })).join('')}</div>${back}`, false);
  }
  if (U.sheet === 'score') {
    const scores = v.players.some(p => p.scores.length) ? scoreTable(v) : '<p>هنوز هیچ دوری تمام نشده است. امتیاز کمتر بهتر است.</p>';
    const history = U.log.length ? `<h3>تاریخچه <small>(تازه‌ترین بالا)</small></h3>${historyEl(v)}` : '';
    return panel('امتیازها', scores + history);
  }
  if (U.sheet === 'help') return panel('کارت‌ها', helpBody());
  return '';
}
function startEl(): string {
  const fan = [13, 10, 0, 12, 9].map(r => `<span style="background-image:url(art/c${r}.jpg)"></span>`).join('');
  const data = saved();
  const big = (icon: string, text: string, fn?: () => void, note = '') => `<button type="button" class="round-btn big"${fn ? ` data-act="${rb(fn)}"` : ' disabled'}>${round(icon)}<small>${text}</small>${note ? `<span class="note-under">${note}</span>` : ''}</button>`;
  /* a half-played game is never thrown away without asking */
  const fresh = () => { if (data) { U.sheet = 'newGame'; render(); } else startGame(prefs.rivals); };
  const small = (icon: string, text: string, fn: () => void) => `<button type="button" class="round-btn" data-act="${rb(fn)}">${round(icon)}<small>${text}</small></button>`;
  const open = (name: 'settings' | 'help') => () => { U.sheet = name; render(); };
  const install = installEvent ? small(ICON.install, 'نصب', () => { installEvent?.prompt(); installEvent = null; render(); }) : '';
  const where = (g: GameState) => (g.phase === 'roundEnd' ? `پایان دور ${fa(g.round)}` : `دور ${fa(g.round)} از ${fa(ROUNDS)}`);
  let sheet = '';
  if (U.sheet === 'help') sheet = panel('کارت‌ها', helpBody());
  if (U.sheet === 'settings') {
    const seg = <T,>(items: [T, string][], now: T, set: (x: T) => void) => `<div class="seg">${items.map(([x, t]) => `<button type="button" class="${now === x ? 'on' : ''}" aria-pressed="${now === x}" data-act="${rb(() => { set(x); savePrefs(); render(); })}">${t}</button>`).join('')}</div>`;
    sheet = panel('تنظیمات', `<div class="lab">تعداد رقیب در بازی جدید</div>${seg([[1, '۱ رقیب'], [2, '۲ رقیب'], [3, '۳ رقیب']], prefs.rivals, x => { prefs.rivals = x; })}
      <div class="lab">سرعت حرکت رقیب‌ها</div>${seg<Speed>([['slow', 'آرام'], ['normal', 'معمولی'], ['fast', 'سریع']], prefs.speed, x => { prefs.speed = x; })}
      <div class="lab">لرزش گوشی وقتی نوبت تو می‌شود</div>${seg([[true, 'روشن'], [false, 'خاموش']], prefs.buzz, x => { prefs.buzz = x; })}
      <p>وسط نوبت رقیب‌ها هم می‌توانی روی میز بزنی تا سریع‌تر جلو بروند.</p>`);
  }
  if (U.sheet === 'newGame' && data) {
    const g = data.game;
    sheet = panel('بازی جدید؟', `<p>یک بازی نیمه‌کاره داری (${where(g)}، ${fa(g.players.length - 1)} رقیب). اگر بازی جدید شروع کنی، آن بازی پاک می‌شود و برنمی‌گردد.</p>
      <button type="button" class="game-btn primary" data-act="${rb(() => resume(data))}">ادامه‌ی همان بازی</button>
      <button type="button" class="game-btn danger" data-act="${rb(() => startGame(prefs.rivals))}">پاکش کن، بازی جدید (${fa(prefs.rivals)} رقیب)</button>`);
  }
  return `<div class="start">
    <div class="logo"><h1>سیلور</h1><p>طلسم</p></div>
    <div class="hero" aria-hidden="true"><div class="fan">${fan}</div></div>
    <div class="main-actions">${big(ICON.star, 'بازی جدید', fresh, `${fa(prefs.rivals)} رقیب`)}${big(ICON.resume, 'ادامه', data ? () => resume(data) : undefined, data ? where(data.game) : 'بازی ذخیره‌شده نیست')}</div>
    <nav class="home-tools">${small(ICON.gear, 'تنظیمات', open('settings'))}${small(ICON.cards, 'کارت‌ها', open('help'))}${install}</nav>
    ${sheet}${zoomEl()}</div>`;
}

/* every card glides from where it was to where it is now, so one move rule animates everything */
function render(): void {
  /* w is the layout width: a card caught in mid-flip must not make the next move start tiny */
  const old = new Map<string, { r: DOMRect; f: string; w: number }>();
  root.querySelectorAll<HTMLElement>('[data-cid]').forEach(el => old.set(el.dataset.cid as string, { r: el.getBoundingClientRect(), f: el.dataset.face as string, w: el.offsetWidth }));
  const deckEl = root.querySelector<HTMLElement>('[data-deck]');
  const oldDeck = deckEl?.getBoundingClientRect() ?? null;
  const oldDeckWidth = deckEl?.offsetWidth ?? 0;
  const top = root.querySelector('.panel')?.scrollTop ?? 0;
  const focusKey = keyOf(document.activeElement);
  const hadDialog = !!root.querySelector('.sheet, .zoom');
  reg = [];
  root.innerHTML = game ? gameEl() : startEl();
  const panelEl = root.querySelector('.panel');
  if (panelEl) panelEl.scrollTop = top;
  keepFocus(focusKey, hadDialog);
  announce();
  drawArrow();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll<HTMLElement>('[data-cid]').forEach(el => {
    if (el.closest('.sheet')) return;
    const o = old.get(el.dataset.cid as string);
    const from = o?.r ?? oldDeck;
    if (!from) return;
    const n = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - n.left - n.width / 2;
    const dy = from.top + from.height / 2 - n.top - n.height / 2;
    const moved = Math.abs(dx) > 1 || Math.abs(dy) > 1;
    const flip = !!o && o.f !== el.dataset.face;
    if (!moved && !flip) return;
    const scale = el.offsetWidth ? (o?.w ?? oldDeckWidth) / el.offsetWidth : 1;
    el.style.zIndex = '5';
    const anim = el.animate(
      [{ transform: `translate(${dx}px,${dy}px) scale(${scale})${flip ? ' rotateY(90deg)' : ''}` }, { transform: 'none' }],
      { duration: moved ? 360 : 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    anim.onfinish = () => { el.style.zIndex = ''; };
  });
}
/* ---------- keyboard and screen readers: the screen is redrawn after every move ---------- */
/** Something that finds the same button again after a redraw. */
function keyOf(el: Element | null): string | null {
  if (!(el instanceof HTMLElement) || !root.contains(el) || el === root) return null;
  if (el.dataset.cid) return `[data-cid="${el.dataset.cid}"]`;
  return `${el.tagName}|${el.className}|${el.getAttribute('aria-label') ?? ''}|${el.textContent ?? ''}`;
}
function keepFocus(key: string | null, hadDialog: boolean): void {
  const dialog = root.querySelector<HTMLElement>('.zoom') ?? root.querySelector<HTMLElement>('.panel');
  /* behind an open dialog nothing can be reached */
  root.querySelectorAll<HTMLElement>('.game > *, .start > *').forEach(el => {
    el.inert = !!dialog && !el.contains(dialog) && !el.matches('.sheet, .zoom');
  });
  if (dialog && !hadDialog) { dialog.focus(); return; }
  if (!key) return;
  let target: HTMLElement | null = null;
  if (key.startsWith('[')) target = root.querySelector<HTMLElement>(key);
  else target = Array.from(root.querySelectorAll<HTMLElement>('button')).find(b => keyOf(b) === key) ?? null;
  if (!target || (target as HTMLButtonElement).disabled || target.inert || target.closest('[inert]')) {
    /* the next thing to do is usually in the tool row */
    const scope = dialog ?? root;
    target = scope.querySelector<HTMLElement>('.tools button:not([disabled])') ?? scope.querySelector<HTMLElement>('button[data-act]');
  }
  target?.focus({ preventScroll: true });
}
let lastSaid = '';
/** The message line is rebuilt each time, so a steady live region outside the redraw reads it out. */
function announce(): void {
  const live = document.getElementById('live');
  const text = (root.querySelector('.message') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? '';
  if (live && text && text !== lastSaid) { lastSaid = text; live.textContent = text; }
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (U.zoom !== null) { U.zoom = null; render(); return; }
  if (root.querySelector('.sheet[data-close]')) closeSheet();
});
function drawArrow(): void {
  if (!U.arrow) return;
  const a = root.querySelector(`[data-cid="${U.arrow.from}"]`);
  const b = root.querySelector(`[data-cid="${U.arrow.to}"]`);
  if (!a || !b) return;
  const o = root.getBoundingClientRect();
  const ra = a.getBoundingClientRect();
  const rc = b.getBoundingClientRect();
  const x1 = ra.left + ra.width / 2 - o.left;
  const y1 = ra.top + ra.height / 2 - o.top;
  const x2 = rc.left + rc.width / 2 - o.left;
  const y2 = rc.top + rc.height / 2 - o.top;
  root.insertAdjacentHTML('beforeend', `<svg class="arrow" width="${o.width}" height="${o.height}"><defs><marker id="tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#d9583a"/></marker></defs><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d9583a" stroke-width="4" stroke-linecap="round" marker-end="url(#tip)" pathLength="1"/></svg>`);
}
root.addEventListener('click', e => {
  /* a tap on the dark area around a closable dialog closes it */
  if ((e.target as HTMLElement).matches('.sheet[data-close]')) { closeSheet(); return; }
  const z = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom]');
  if (z) {
    U.zoom = Number(z.dataset.zoom);
    render();
    return;
  }
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b || (b as HTMLButtonElement).disabled) return;
  const fn = reg[Number(b.dataset.act)];
  if (!fn) return;
  if (game && game.current === ME) {
    U.pulse.clear();
    U.mark.clear();
  }
  fn();
});

/* ---------- installing and working offline ---------- */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e as Event & { prompt: () => void };
  if (!game) render();
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  void navigator.serviceWorker.register('sw.js').catch(() => { /* the game still runs online */ });
}
render();
