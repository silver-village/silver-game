/** The game screen. It reads only viewFor(), and every move goes through the engine's apply(). */
import '@fontsource-variable/vazirmatn';
import { botCommand } from './engine/bot';
import { AMULET_SET, CALL_LIMIT, RANK, ROUNDS, hasDrawAbility } from './engine/cards';
import { apply, newGame } from './engine/game';
import { RuleError, type CardId, type Command, type GameEvent, type GameState } from './engine/types';
import { viewFor, type CardView, type GameView } from './engine/view';

const ME = 0;
const SAVE_KEY = 'silver-game-v1';
const fa = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d] as string);
const TEXT: Record<number, string> = {
  0: 'وقتی هر دو دهاتی در دهکده‌ها رو باشند، دور فوراً تمام می‌شود.',
  1: 'وقتی رو باشد، یک کارت از دسته کنار آن رو می‌ماند و همه می‌توانند به‌جای کشیدن آن را بردارند.',
  2: 'وقتی در دهکده‌ات رو باشد، در نوبتت یک کارت پشت‌وروی خودت را می‌بینی.',
  3: 'وقتی در دهکده‌ات رو باشد، خودش و یک کارت دیگرت را از حریف‌ها حفظ می‌کند.',
  4: 'وقتی در دهکده‌ات رو باشد، موقع کشیدن یک کارت بیشتر می‌کشی و یکی را نگه می‌داری.',
  5: 'یک کارت پشت‌وروی خودت را رو می‌کنی.',
  6: 'یک کارت پشت‌ورو در هر دهکده‌ای را رو می‌کنی.',
  7: 'تا ۲ کارت پشت‌وروی خودت را مخفیانه می‌بینی.',
  8: 'یک کارت پشت‌وروی یک حریف را مخفیانه می‌بینی.',
  9: 'هر کارت پشت‌وروی دلخواه را مخفیانه می‌بینی.',
  10: 'ستون سوخته را می‌گردی و می‌توانی یک کارت را با کارت‌های خودت عوض کنی.',
  11: 'کارت بالای دسته را می‌بینی و با کارت حریف یا کارت‌های خودت عوض می‌کنی.',
  12: 'یک کارت حریف را با یک کارت خودت عوض می‌کنی و کارت جدید را می‌بینی.',
  13: 'وقتی در دهکده‌ات باشد، موقع معاوضه با هر کارت دیگری هم‌عدد حساب می‌شود.',
};
const nameOf = (rank: number) => AMULET_SET.find(d => d.rank === rank)?.name ?? '';
const label = (rank: number) => `${nameOf(rank)} (${fa(rank)})`;
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>';
const AMULET = '<img src="art/amulet.jpg" alt="طلسم">';
const svg = (size: number, inner: string, width = 2.5) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  history: svg(12, '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  score: svg(12, '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  cards: svg(12, '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>'),
  exit: svg(12, '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h9"/>'),
  wolf: '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L9 8.5L4 7.5L5.5 13L2 17L7.5 17.5L12 22L16.5 17.5L22 17L18.5 13L20 7.5L15 8.5L12 2Z" fill="#cbd5e1"/></svg>',
  sparkle: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#60a5fa" aria-hidden="true"><path d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8L12 2Z"/></svg>',
  burn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z" fill="rgba(239,68,68,.2)"/></svg>',
  undo: svg(15, '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>'),
};
const buttonIcon = (b: Btn) => (b.kind === 'burn' ? ICON.burn : b.label.includes('پس گرفتن') || b.label.includes('برگرداندن') ? ICON.undo : '');

type Side = { kind: 'empath' } | { kind: 'guard'; guard: CardId } | { kind: 'amulet' };
interface Btn { label: string; kind?: 'primary' | 'burn' | 'ghost'; off?: boolean; fn: () => void }
interface Controls {
  prompt: string;
  wait?: boolean;
  can?: (id: CardId, owner: number) => boolean;
  tap?: (id: CardId, owner: number) => void;
  buttons?: Btn[];
  deck?: () => void;
  discard?: () => void;
  row?: (id: CardId) => void;
  hand?: (id: CardId) => void;
  chips?: boolean;
  spot?: (index: number) => void;
  end?: (side: 'start' | 'end') => void;
}

let game: GameState | null = null;
let gameId = 0;
let rivalsWanted = 1;
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
  sheet: null as 'score' | 'log' | 'help' | null,
  note: '',
  log: [] as string[],
};

/* ---------- saving: a game survives closing the app ---------- */
function save(): void {
  try {
    if (game && game.phase !== 'gameEnd') localStorage.setItem(SAVE_KEY, JSON.stringify({ game, log: U.log.slice(-60) }));
    else localStorage.removeItem(SAVE_KEY);
  } catch { /* private mode: the game still works, it just is not saved */ }
}
function saved(): { game: GameState; log: string[] } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
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
function logEvent(e: GameEvent): void {
  const s = game as GameState;
  const r = (id: CardId) => s.cards[id]?.rank ?? 0;
  const who = 'player' in e ? nameIn(e.player) + ': ' : '';
  switch (e.type) {
    case 'drew': U.log.push(who + 'از دسته کشید'); break;
    case 'took': U.log.push(who + label(r(e.card)) + ' را برداشت'); break;
    case 'burned': U.log.push(who + label(r(e.card)) + ' را سوزاند'); break;
    case 'revealedSet': U.log.push(who + (e.matched ? 'ست هم‌عدد سوزاند' : 'ست ناهم‌عدد رو کرد')); break;
    case 'penalty': U.log.push(who + 'یک کارت جریمه گرفت'); break;
    case 'flipped': U.log.push(who + label(r(e.card)) + ' را رو کرد'); break;
    case 'looked': U.log.push(who + 'به یک کارت نگاه کرد'); break;
    case 'swapped': U.log.push(who + 'دو کارت را جابه‌جا کرد'); break;
    case 'guarded': U.log.push(who + (e.target ? 'محافظ گذاشت' : 'محافظ را برداشت')); break;
    case 'amulet': U.log.push(who + 'طلسم گذاشت'); break;
    case 'called': U.log.push(who + 'سرشماری کرد'); break;
    case 'roundEnded': U.log.push('پایان دور'); break;
    default: break;
  }
}
function dispatch(player: number, cmd: Command): GameEvent[] {
  const r = apply(game as GameState, player, cmd);
  game = r.state;
  const mine = new Set(game.players[ME]?.village ?? []);
  for (const e of r.events) {
    logEvent(e);
    if (e.type === 'saw' && e.to === ME && !game.turn.hand.includes(e.card)) U.peek.set(e.card, e.rank);
    if (player === ME) continue;
    const touched = e.type === 'flipped' || e.type === 'looked' ? [e.card] : e.type === 'swapped' ? [e.a, e.b] : [];
    touched.forEach(id => { U.pulse.add(id); if (mine.has(id)) U.mark.add(id); });
    if (e.type === 'placed') U.pulse.add(e.card);
  }
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
    while (game && game.phase === 'turn' && game.current !== ME) {
      await rivalMove(game.current, botCommand(game, game.current, Math.random));
    }
  } finally {
    rivalsRunning = false;
  }
  U.verb = '';
  U.arrow = null;
  settle();
}
async function rivalMove(p: number, cmd: Command): Promise<void> {
  const s = game as GameState;
  const beat = async (verb: string, ms = 1500) => { U.verb = verb; render(); await wait(ms); };
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
    case 'confirm': go(); U.verb = ''; render(); await wait(500); return;
    default: go();
  }
}

/* ---------- starting ---------- */
function startGame(rivals: number): void {
  gameId++;
  U.log = [];
  const names = ['تو', ...Array.from({ length: rivals }, (_, i) => 'رقیب ' + fa(i + 1))];
  game = newGame(names, Math.floor(Math.random() * 2 ** 31));
  rivalsPeek();
  save();
  render();
}
function rivalsPeek(): void {
  const s = game as GameState;
  s.players.forEach((_p, i) => {
    if (i !== ME && !s.peeked[i]) dispatch(i, botCommand(game as GameState, i, Math.random));
  });
}
function leave(): void {
  gameId++;
  game = null;
  U.sel.clear(); U.peek.clear(); U.reveal.clear(); U.mark.clear(); U.pulse.clear(); U.eye.clear();
  U.side = null; U.sheet = null; U.note = ''; U.busy = ''; U.verb = ''; U.arrow = null;
  render();
}
function resume(data: { game: GameState; log: string[] }): void {
  gameId++;
  game = data.game;
  U.log = data.log;
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
      prompt: first ? 'این کارت‌ها را به خاطر بسپار.' : 'این کارت را فقط تو می‌بینی.',
      buttons: [{ label: 'دیدم', kind: 'primary', fn: () => { U.peek.clear(); settle(); } }],
    };
  }
  if (v.phase === 'peek') {
    return {
      prompt: 'دو کارت از دهکده‌ات را برای دیدن انتخاب کن.',
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
        prompt: v.caller !== null ? 'نوبت آخر تو: از دسته یا ستون سوخته بردار.' : 'نوبت تو: از دسته بکش یا از ستون سوخته بردار.',
        chips: true,
        deck: v.deckCount ? () => act({ type: 'draw' }) : undefined,
        discard: v.discard.length && own.some(c => free(c.id)) ? () => act({ type: 'takeDiscard' }) : undefined,
        row: id => act({ type: 'takeRow', card: id }),
        buttons: canCall ? [{ label: 'سرشماری', kind: 'ghost', off: v.sideUsed, fn: () => act({ type: 'call' }) }] : [],
      };
    }
    case 'decide': {
      const hand = v.hand;
      const focus = hand.find(c => c.id === U.focus) ?? (hand[0] as CardView);
      const n = U.sel.size;
      const fromPile = v.canReturn;
      const buttons: Btn[] = [];
      if (n) buttons.push({ label: n === 1 ? 'معاوضه با این کارت' : `معاوضه با ${fa(n)} کارت`, kind: 'primary', fn: () => void quietly(exchange(focus.id, selected())) });
      const burnable = !fromPile || game?.turn.source === 'row';
      if (!n && burnable) {
        if (focus.rank !== null && hasDrawAbility(focus.rank)) buttons.push({ label: 'سوزاندن و توانایی ' + nameOf(focus.rank), kind: 'primary', fn: () => act({ type: 'burn', card: focus.id, useAbility: true }) });
        buttons.push({ label: 'فقط سوزاندن', kind: 'burn', fn: () => act({ type: 'burn', card: focus.id, useAbility: false }) });
      }
      if (!n && game?.turn.source === 'deck' && hand.length <= v.rascalExtra && v.deckCount) buttons.push({ label: 'یک کارت دیگر', kind: 'ghost', fn: () => act({ type: 'drawMore' }) });
      if (!n && fromPile) buttons.push({ label: 'برگرداندن کارت', kind: 'ghost', fn: () => act({ type: 'returnCard' }) });
      const prompt = hand.length > 1 ? 'یکی را انتخاب کن. بقیه به بالای دسته برمی‌گردند.'
        : burnable ? 'بسوزان، یا کارت‌هایی از دهکده را برای معاوضه انتخاب کن.' : 'کارت یا کارت‌هایی را که با این عوض می‌شوند انتخاب کن.';
      return { prompt, chips: true, buttons, can: (id, o) => o === ME && free(id), tap: toggle, hand: id => { U.focus = id; render(); } };
    }
    case 'placeSpot': return { prompt: 'هم‌عدد بودند. کارت جدید کجا بنشیند؟', spot: i => act({ type: 'placeSpot', index: i }) };
    case 'placeEnd': return { prompt: 'این کارت به کدام سر دهکده برود؟', end: side => act({ type: 'placeEnd', side }) };
    case 'witch': {
      const top = v.hand[0] as CardView;
      const n = U.sel.size;
      return {
        prompt: 'این کارت را با یک کارت حریف، یا با کارت‌های خودت عوض کن.',
        can: (id, o) => (o === ME ? free(id) : v.witchTargets.includes(id)),
        tap: (id, o) => { if (o === ME) toggle(id); else act({ type: 'witchGive', target: id }); },
        buttons: [{ label: n ? `معاوضه با ${fa(n)} کارت` : 'معاوضه', kind: 'primary', off: !n, fn: () => void quietly(exchange(top.id, selected())) }],
      };
    }
    case 'ability': return abilityControls(v);
    case 'confirm': default: {
      const buttons: Btn[] = [{ label: 'تأیید حرکت', kind: 'primary', fn: () => act({ type: 'confirm' }) }];
      if (v.canUndo) buttons.push({ label: 'پس گرفتن حرکت', kind: 'ghost', fn: () => act({ type: 'undo' }) });
      return { prompt: 'حرکتت انجام شد.', chips: true, buttons };
    }
  }
}
function abilityControls(v: GameView): Controls {
  const r = v.pending as number;
  const back: Btn[] = [{ label: 'استفاده نمی‌کنم', kind: 'ghost', fn: () => act({ type: 'skipAbility' }) }];
  if (v.canUndo) back.push({ label: 'پس گرفتن حرکت', kind: 'ghost', fn: () => act({ type: 'undo' }) });
  const allowed = (id: CardId) => v.candidates.includes(id);
  const one = (prompt: string): Controls => ({ prompt, can: allowed, tap: id => act({ type: 'target', cards: [id] }), buttons: back });
  switch (r) {
    case RANK.exposer: return one('تردست: یک کارت پشت‌وروی خودت را رو کن.');
    case RANK.revealer: return one('افشاگر: یک کارت پشت‌ورو در هر دهکده‌ای را رو کن.');
    case RANK.apprenticeSeer: return one('شاگرد غیب‌گو: یک کارت پشت‌وروی حریف را ببین.');
    case RANK.seer: return one('غیب‌گو: هر کارت پشت‌وروی دلخواه را ببین.');
    case RANK.beholder: {
      const n = U.sel.size;
      return {
        prompt: 'طالع‌بین: تا ۲ کارت پشت‌وروی خودت را انتخاب کن.',
        can: id => allowed(id) && (n < 2 || U.sel.has(id)),
        tap: id => { if (U.sel.has(id)) U.sel.delete(id); else U.sel.add(id); render(); },
        buttons: n ? [{ label: `دیدن ${fa(n)} کارت`, kind: 'primary', fn: () => act({ type: 'target', cards: [...U.sel] }) }] : back,
      };
    }
    case RANK.master:
      return { prompt: 'ارباب: یک کارت از ستون سوخته انتخاب کن.', can: () => false, buttons: back };
    case RANK.robber: {
      if (!U.stolen) return { prompt: 'دزد: کارتی را که از حریف می‌گیری انتخاب کن.', can: allowed, tap: id => { U.stolen = id; U.sel = new Set([id]); render(); }, buttons: back };
      const stolen = U.stolen;
      return {
        prompt: 'حالا کارتی از خودت را که به او می‌دهی انتخاب کن.',
        can: (id, o) => o === ME && v.amulet.on !== id,
        tap: id => act({ type: 'target', cards: [stolen, id] }),
        buttons: [{ label: 'انتخاب دوباره', kind: 'ghost', fn: () => { U.stolen = null; U.sel.clear(); render(); } }],
      };
    }
    default: return { prompt: '', buttons: back };
  }
}
function sideControls(v: GameView): Controls {
  const side = U.side as Side;
  const back = () => { U.side = null; render(); };
  const own = v.players[ME]?.village ?? [];
  const backBtn: Btn = { label: 'برگشت', kind: 'ghost', fn: back };
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
    return { prompt: 'افسون‌گر: یک کارت پشت‌وروی خودت را ببین.', can: (id, o) => o === ME && !own.find(c => c.id === id)?.faceUp && v.amulet.on !== id, tap: id => keep({ type: 'empathPeek', card: id }), buttons: [backBtn] };
  }
  if (side.kind === 'amulet') {
    const linked = (id: CardId) => own.some(c => c.guarding === id) || !!own.find(c => c.id === id)?.guarding;
    return { prompt: 'طلسم: کارتی را قفل کن. تا آخر دور حتی خودت هم آن را نمی‌بینی.', can: (id, o) => o === ME && !linked(id), tap: id => keep({ type: 'placeAmulet', card: id }), buttons: [backBtn] };
  }
  const g = side.guard;
  const buttons: Btn[] = [backBtn];
  if (own.find(c => c.id === g)?.guarding) buttons.unshift({ label: 'برداشتن محافظ', kind: 'burn', fn: () => keep({ type: 'guard', guard: g, target: null }) });
  return {
    prompt: 'محافظ: کارتی را که می‌خواهی حفظ شود انتخاب کن.',
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

function cardEl(c: CardView, opts: { act?: number; go?: boolean; extra?: string } = {}): string {
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
  const aria = visible ? `${nameOf(rank)}، عدد ${fa(rank)}` : 'کارت پشت‌ورو';
  const eye = U.eye.has(c.id) ? `<span class="eye">${EYE}</span>` : '';
  const inner = (visible ? `<span class="pip">${fa(rank)}</span><span class="nm">${nameOf(rank)}</span>` : '') + eye;
  const action = opts.act === undefined ? ' disabled' : ` data-act="${opts.act}"`;
  return `<button type="button" class="${cls.join(' ')}" data-cid="${c.id}" data-face="${visible ? 1 : 0}"${art}${action} aria-label="${aria}">${inner}</button>`;
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
    let html = cardEl(c, { act: able && tap ? rb(() => tap(c.id, owner)) : undefined, extra: small ? 'mini-card' : '' });
    if (owner === ME && U.sel.has(c.id)) html = `<div class="selected-marker">انتخاب شد</div>${html}`;
    if (v.amulet.on === c.id) html += `<span class="seal">${AMULET}</span>`;
    const g = row.find(x => x.guarding === c.id);
    let gAble = false;
    if (g) {
      gAble = !!m.can?.(g.id, owner);
      html += `<span class="guard">${cardEl(g, { act: gAble && tap ? rb(() => tap(g.id, owner)) : undefined, extra: 'mini-card' })}</span>`;
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
const tag = (v: GameView, i: number) => (v.amulet.holder === i && v.amulet.usable ? ` <span class="token">${AMULET}</span>` : '');
function gameEl(): string {
  const v = view();
  const m = controls(v);
  const rivalCount = v.players.length - 1;
  const rivals = v.players.map((p, i) => {
    if (i === ME) return '';
    const on = v.phase === 'turn' && v.current === i;
    const row = villageEl(v, i, m);
    const sub = on && U.verb ? `<em>${U.verb}</em>` : v.caller === i ? 'سرشماری کرد' : `دهکده حریف (${fa(p.village.length)} کارت)`;
    return `<section class="rival-panel${on ? ' on' : ''}"><div class="rival-header"><div class="rival-info"><div class="rival-avatar">${ICON.wolf}</div><span class="rival-name">${p.name}${tag(v, i)}</span></div><span class="rival-tag">${sub}</span></div><div class="cards-row-rival${m.can ? ' pick' : ''}" style="--n:${columns(row.count)}">${row.html}</div></section>`;
  }).join('');
  const pile = v.discard.slice(-2);
  const deckBtn = v.deckCount
    ? `${v.deckCount > 2 ? '<div class="deck-stack-card deck-under-2"></div>' : ''}${v.deckCount > 1 ? '<div class="deck-stack-card deck-under-1"></div>' : ''}<button type="button" class="card back deck-top${m.deck ? ' go' : ''}" data-deck="1"${m.deck ? ` data-act="${rb(m.deck)}"` : ' disabled'} aria-label="دسته"></button>`
    : '<span class="emptypile"></span>';
  const discBtn = pile.length
    ? pile.map((c, i) => {
      const isTop = i === pile.length - 1;
      return cardEl(c, { act: isTop && m.discard ? rb(m.discard) : undefined, go: isTop && !!m.discard, extra: isTop ? 'discard-card' : 'discard-under' });
    }).join('')
    : '<span class="emptypile"></span>';
  const piles = `<div class="piles-felt-ring"><div class="pile-container"><div class="pile-card-wrapper">${deckBtn}</div><div class="pile-label pile-badge-glow">دسته ${fa(v.deckCount)}</div></div><div class="pile-container"><div class="pile-card-wrapper">${discBtn}</div><div class="pile-label">سوخته</div></div></div>`;
  const rowFn = m.row;
  const row = v.row.length ? `<div class="squires"><div>${v.row.map(c => cardEl(c, { act: rowFn ? rb(() => rowFn(c.id)) : undefined, go: !!rowFn })).join('')}</div><small>کنار دسته</small></div>` : '';
  let stage = '';
  if (v.hand.length) {
    if (v.current !== ME) {
      stage = `<div class="stage spot"><div class="hand">${v.hand.map(c => cardEl(c)).join('')}</div></div>`;
    } else {
      const focus = v.hand.find(c => c.id === U.focus) ?? (v.hand[0] as CardView);
      const handFn = m.hand;
      const cards = v.hand.map(c => cardEl(c, { act: handFn && v.hand.length > 1 ? rb(() => handFn(c.id)) : undefined, go: v.hand.length > 1 && c === focus })).join('');
      const rank = focus.rank ?? 0;
      stage = `<div class="stage"><div class="hand${v.hand.length > 1 ? ' many' : ''}">${cards}</div><div class="about"><b>${label(rank)}</b><p>${TEXT[rank] ?? ''}</p></div></div>`;
    }
  }
  const chips: string[] = [];
  if (m.chips) {
    const own = v.players[ME]?.village ?? [];
    if (v.empathLeft > 0 && own.some(c => !c.faceUp && v.amulet.on !== c.id)) chips.push(`<button type="button" class="chip" data-act="${rb(() => { U.side = { kind: 'empath' }; render(); })}">افسون‌گر: ببین (${fa(v.empathLeft)})</button>`);
    own.filter(c => c.faceUp && c.rank === RANK.bodyguard && v.amulet.on !== c.id).forEach(g => chips.push(`<button type="button" class="chip" data-act="${rb(() => { U.side = { kind: 'guard', guard: g.id }; render(); })}">${g.guarding ? 'جابه‌جایی محافظ' : 'گذاشتن محافظ'}</button>`));
    if (v.amulet.holder === ME && v.amulet.usable && !v.amulet.on) chips.push(`<button type="button" class="chip" data-act="${rb(() => { U.side = { kind: 'amulet' }; render(); })}">گذاشتن طلسم</button>`);
  }
  const mine = villageEl(v, ME, m);
  const selected = (v.players[ME]?.village ?? []).flatMap((c, i) => (U.sel.has(c.id) ? [i + 1] : []));
  const hint = selected.length === 1 ? `کارت ${fa(selected[0] as number)} انتخاب شده است` : selected.length ? `${fa(selected.length)} کارت انتخاب شده است` : '';
  const actions = (m.buttons ?? []).map(b => `<button type="button" class="game-btn ${b.kind ?? ''}"${b.off ? ' disabled' : ` data-act="${rb(b.fn)}"`}>${buttonIcon(b)}<span>${b.label}</span></button>`).join('');
  const note = U.note ? `<button type="button" class="note" data-act="${rb(() => { U.note = ''; render(); })}">${U.note}</button>` : '';
  const skip = v.current !== ME && v.phase === 'turn' ? ` data-act="${rb(() => skipNow?.())}"` : '';
  return `<div class="game">
    <header class="top-bar"><div class="round-badge"><span class="round-dot"></span><span>دور ${fa(v.round)} از ${fa(ROUNDS)}</span></div><div class="top-nav-buttons">
      <button type="button" class="top-btn" data-act="${rb(() => { U.sheet = 'log'; render(); })}">${ICON.history}<span>تاریخچه</span></button>
      <button type="button" class="top-btn" data-act="${rb(() => { U.sheet = 'score'; render(); })}">${ICON.score}<span>امتیاز</span></button>
      <button type="button" class="top-btn" data-act="${rb(() => { U.sheet = 'help'; render(); })}">${ICON.cards}<span>کارت‌ها</span></button>
      <button type="button" class="top-btn" data-act="${rb(leave)}" aria-label="خروج">${ICON.exit}</button></div></header>
    <div class="rivals${rivalCount > 1 ? ' many' : ''}">${rivals}</div>
    <main class="center-table"${skip}>${piles}${row}<div class="chips">${chips.join('')}</div>${stage}${note}</main>
    <div class="turn-instruction"><span class="instruction-sparkle">${ICON.sparkle}</span><span>${m.prompt}</span></div>
    <section class="village-section"><div class="village-title-bar"><span class="village-title">دهکده شما (${fa(v.players[ME]?.village.length ?? 0)} کارت)${tag(v, ME)}${v.caller === ME ? ' · سرشماری کردی' : ''}</span><span class="village-hint">${hint}</span></div>
      <div class="cards-row-player${m.can ? ' pick' : ''}" style="--n:${columns(mine.count)}">${mine.html}</div></section>
    <footer class="action-controls">${actions}</footer>
    ${sheetEl(v)}
  </div>`;
}
function panel(title: string, body: string, closable = true): string {
  const close = closable ? `<button type="button" class="game-btn" data-act="${rb(() => { U.sheet = null; render(); })}">بستن</button>` : '';
  return `<div class="sheet"><div class="panel"><h2>${title}</h2>${body}${close}</div></div>`;
}
function scoreTable(v: GameView): string {
  const rounds = Math.max(...v.players.map(p => p.scores.length));
  const head = `<tr><th>بازیکن</th>${Array.from({ length: rounds }, (_, i) => `<th>دور ${fa(i + 1)}</th>`).join('')}<th>جمع</th></tr>`;
  const rows = v.players.map(p => `<tr><td>${p.name}</td>${p.scores.map(s => `<td>${fa(s)}</td>`).join('')}<td><b>${fa(p.total)}</b></td></tr>`).join('');
  return `<table class="score">${head}${rows}</table>`;
}
function resultText(v: GameView): string {
  const r = v.result;
  if (!r) return '';
  const why = { vote: 'سرشماری انجام شد', villager: 'هر دو دهاتی رو شدند', deck: 'دسته تمام شد' }[r.reason];
  const name = (i: number) => v.players[i]?.name ?? '';
  const outcome = r.caller === null ? 'کسی سرشماری نکرد، پس امتیاز ۰ یا جریمه‌ی ۱۰ نداریم.'
    : r.callerWon ? `${name(r.caller)}: سرشماری موفق و امتیاز ۰.` : `${name(r.caller)}: سرشماری ناموفق و ۱۰ امتیاز جریمه.`;
  const holder = v.amulet.holder ?? 0;
  const amulet = v.round >= ROUNDS ? '' : v.amulet.usable ? ` ${name(holder)}: طلسم فعال برای دور بعد.` : ` ${name(holder)}: نفر اول دور بعد، بدون طلسم فعال.`;
  return `${why}. ${outcome}${amulet}`;
}
function sheetEl(v: GameView): string {
  if (v.phase === 'gameEnd') {
    const title = v.winner === ME ? 'تو بردی' : `${v.players[v.winner ?? 0]?.name} برد`;
    return panel(title, `${scoreTable(v)}<button type="button" class="game-btn primary" data-act="${rb(leave)}">بازی جدید</button>`, false);
  }
  if (v.phase === 'roundEnd') {
    const r = v.result;
    const rows = v.players.map((p, i) => `<div class="res"><header><span>${p.name}: ${fa(r?.scores[i] ?? 0)} امتیاز</span><span>مجموع کارت‌ها ${fa(r?.sums[i] ?? 0)}</span></header><div class="cards-row-rival" style="--n:${columns(p.village.length)}">${p.village.map(c => `<div class="slot">${cardEl(c, { extra: 'mini-card' })}</div>`).join('')}</div></div>`).join('');
    const next = () => { dispatch(ME, { type: 'nextRound' }); if (game?.phase === 'peek') rivalsPeek(); settle(); };
    return panel(`پایان دور ${fa(v.round)}`, `<p>${resultText(v)}</p>${rows}${scoreTable(v)}<button type="button" class="game-btn primary" data-act="${rb(next)}">${v.round >= ROUNDS ? 'دیدن برنده' : 'دور بعد'}</button>`, false);
  }
  if (v.step === 'ability' && v.pending === RANK.master && v.current === ME && !U.side) {
    const pile = v.discard.filter(c => v.candidates.includes(c.id));
    const back = `<button type="button" class="game-btn ghost" data-act="${rb(() => act({ type: 'skipAbility' }))}">هیچ کارتی برنمی‌دارم</button>${v.canUndo ? `<button type="button" class="game-btn ghost" data-act="${rb(() => act({ type: 'undo' }))}">پس گرفتن حرکت</button>` : ''}`;
    return panel('ستون سوخته', `<div class="grid pick">${pile.map(c => cardEl(c, { act: rb(() => act({ type: 'target', cards: [c.id] })) })).join('')}</div>${back}`, false);
  }
  if (U.sheet === 'score') return panel('امتیازها', v.players.some(p => p.scores.length) ? scoreTable(v) : '<p>هنوز هیچ دوری تمام نشده است. امتیاز کمتر بهتر است.</p>');
  if (U.sheet === 'log') return panel('تاریخچه', `<ul class="logs">${[...U.log].reverse().map(l => `<li>${l}</li>`).join('')}</ul>`);
  if (U.sheet === 'help') return panel('کارت‌ها', AMULET_SET.map(d => `<div class="row-help"><b>${fa(d.rank)}</b><p><strong>${d.name} · ${fa(d.count)} کارت</strong>${TEXT[d.rank]}</p></div>`).join(''));
  return '';
}
function startEl(): string {
  const fan = [13, 10, 0, 12, 9].map(r => `<span style="background-image:url(art/c${r}.jpg)"></span>`).join('');
  const seg = [1, 2, 3].map(n => `<button type="button" class="${rivalsWanted === n ? 'on' : ''}" data-act="${rb(() => { rivalsWanted = n; render(); })}">${fa(n)} رقیب</button>`).join('');
  const data = saved();
  const cont = data ? `<button type="button" class="game-btn primary" data-act="${rb(() => resume(data))}">ادامه‌ی بازی قبلی</button>` : '';
  const install = installEvent ? `<button type="button" class="game-btn" data-act="${rb(() => { installEvent?.prompt(); installEvent = null; render(); })}">نصب روی گوشی</button>` : '';
  return `<div class="start"><div class="hero" aria-hidden="true"><div class="fan">${fan}</div></div><h1>سیلور</h1>
    <p>نسخه‌ی طلسم. بازی با رقیب‌های کامپیوتری، بدون نیاز به اینترنت.</p>
    ${cont}
    <div class="lab">تعداد رقیب</div><div class="seg">${seg}</div>
    <button type="button" class="game-btn${data ? '' : ' primary'}" data-act="${rb(() => startGame(rivalsWanted))}">بازی جدید</button>
    ${install}</div>`;
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
  reg = [];
  root.innerHTML = game ? gameEl() : startEl();
  const panelEl = root.querySelector('.panel');
  if (panelEl) panelEl.scrollTop = top;
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
