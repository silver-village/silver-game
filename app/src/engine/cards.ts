/** The Amulet set. Adding another set means another table like this one. */

export const RANK = {
  villager: 0,
  squire: 1,
  empath: 2,
  bodyguard: 3,
  rascal: 4,
  exposer: 5,
  revealer: 6,
  beholder: 7,
  apprenticeSeer: 8,
  seer: 9,
  master: 10,
  witch: 11,
  robber: 12,
  doppelganger: 13,
} as const;

export interface CardDef {
  rank: number;
  key: keyof typeof RANK;
  name: string;
  count: number;
}

export const AMULET_SET: CardDef[] = [
  { rank: 0, key: 'villager', name: 'دهاتی', count: 2 },
  { rank: 1, key: 'squire', name: 'نوچه', count: 4 },
  { rank: 2, key: 'empath', name: 'افسون‌گر', count: 4 },
  { rank: 3, key: 'bodyguard', name: 'محافظ', count: 4 },
  { rank: 4, key: 'rascal', name: 'حقه‌باز', count: 4 },
  { rank: 5, key: 'exposer', name: 'تردست', count: 4 },
  { rank: 6, key: 'revealer', name: 'افشاگر', count: 4 },
  { rank: 7, key: 'beholder', name: 'طالع‌بین', count: 4 },
  { rank: 8, key: 'apprenticeSeer', name: 'شاگرد غیب‌گو', count: 4 },
  { rank: 9, key: 'seer', name: 'غیب‌گو', count: 4 },
  { rank: 10, key: 'master', name: 'ارباب', count: 4 },
  { rank: 11, key: 'witch', name: 'جادوگر', count: 4 },
  { rank: 12, key: 'robber', name: 'دزد', count: 4 },
  { rank: 13, key: 'doppelganger', name: 'بدل', count: 2 },
];

export const DECK_SIZE = AMULET_SET.reduce((n, d) => n + d.count, 0);
export const VILLAGE_SIZE = 5;
export const DEALT_SETS = 4;
export const ROUNDS = 4;
export const CALL_LIMIT = 4;
export const FAILED_CALL_PENALTY = 10;

export const hasDrawAbility = (rank: number): boolean => rank >= RANK.exposer && rank <= RANK.robber;
