import type { Difficulty, MutatorId, TrailId } from '../sim/types'

/* ------------------------------------------------------------------ rank */

const RANK_TITLES = ['Rookie', 'Roller', 'Bouncer', 'Carver', 'Arc Reader', 'Line Keeper', 'Skyrunner', 'Rhythm', 'Momentum', 'Infinite']

/** A new title every five ranks; the last one holds forever. */
export function rankTitle(rank: number): string {
  return RANK_TITLES[Math.min(RANK_TITLES.length - 1, Math.floor((Math.max(1, rank) - 1) / 5))]
}

/** XP needed to climb from `rank` to `rank + 1`. Grows gently so late ranks stay reachable. */
export function xpToNext(rank: number): number {
  const r = Math.max(0, rank - 1)
  return Math.round(140 + 45 * r + 6 * Math.pow(r, 1.5))
}

export interface RankReward {
  rank: number
  label: string
  echoes?: number
  trail?: TrailId
}

/** Milestone ranks. Every rank also pays a small echo purse (see `rankPurse`). */
export const RANK_REWARDS: RankReward[] = [
  { rank: 2, label: 'Daily contracts open' },
  { rank: 3, label: 'Aurora trail', trail: 'aurora' },
  { rank: 5, label: 'Tuning bench: Mk II modules' },
  { rank: 7, label: 'Nova trail', trail: 'nova' },
  { rank: 8, label: 'Third module slot can be built' },
  { rank: 10, label: 'Tuning bench: Mk III modules' },
  { rank: 12, label: 'Solar trail', trail: 'solar' },
  { rank: 15, label: 'A purse of 60 echoes', echoes: 60 },
  { rank: 20, label: 'Halo trail', trail: 'halo' },
]

export function rankPurse(rank: number): number {
  return 4 + rank
}

export const CONTRACTS_RANK = 2
export const TUNING_RANK = [0, 0, 5, 10] as const
export const THIRD_SLOT_RANK = 8
export const SLOT_COST = [0, 0, 18, 60] as const
export const MAX_MODULE_LEVEL = 3

/** Echo cost to raise a module from `level` to `level + 1`. */
export function tuneCost(baseCost: number, level: number): number {
  return baseCost * (level === 1 ? 2 : 4)
}

/** Share of a module's upside it delivers at a given Mk. Downsides never scale. */
export function moduleBoost(level: number): number {
  return 1 + 0.35 * (Math.max(1, Math.min(MAX_MODULE_LEVEL, level)) - 1)
}

export const DIFFICULTY_XP: Record<Difficulty, number> = {
  relaxed: 0.8,
  normal: 1,
  hard: 1.2,
  extreme: 1.45,
  master: 1.75,
}

export const MUTATOR_XP: Record<MutatorId, number> = {
  none: 1,
  tailwind: 1.1,
  heavy: 1.15,
  nodash: 1.2,
  glass: 1.2,
}

/* --------------------------------------------------------------- mastery */

/** Meters travelled with a core to reach each mastery level (index = level - 1). */
export const MASTERY_METERS = [0, 1500, 5000, 12000, 25000]

/** Echo bonus per mastery level above the first. */
export const MASTERY_ECHO_BONUS = 0.04

export function masteryLevel(meters: number): number {
  let level = 1
  for (let i = 1; i < MASTERY_METERS.length; i++) if (meters >= MASTERY_METERS[i]) level = i + 1
  return level
}

/* ------------------------------------------------------------ challenges */

export type ChallengeMetric =
  | 'runDistance'
  | 'lifePerfects'
  | 'runWalls'
  | 'lifeEnemies'
  | 'maxSpeed'
  | 'bestChain'
  | 'biomes'
  | 'runNears'
  | 'daily'
  | 'lifeDashes'
  | 'runs'
  | 'fragments'
  | 'lifeDistance'
  | 'hardDistance'
  | 'runPerfects'
  | 'cores'

export interface ChallengeTier {
  goal: number
  reward: number
}

export interface ChallengeDef {
  id: string
  title: string
  /** `{n}` is replaced with the current tier's goal. */
  body: string
  metric: ChallengeMetric
  tiers: ChallengeTier[]
}

const tiers = (goals: number[], rewards: number[]): ChallengeTier[] => goals.map((goal, i) => ({ goal, reward: rewards[i] }))

export const CHALLENGES: ChallengeDef[] = [
  { id: 'd500', title: 'Horizon', body: 'Travel {n}m in a single run.', metric: 'runDistance', tiers: tiers([500, 1000, 2000, 3500, 5000], [8, 12, 16, 24, 36]) },
  { id: 'perfects', title: 'Clean Landings', body: 'Land {n} perfect bounces across your career.', metric: 'lifePerfects', tiers: tiers([25, 100, 250, 600, 1500], [12, 16, 22, 30, 44]) },
  { id: 'walls', title: 'Rebound', body: 'Wall-bounce {n} times in one run.', metric: 'runWalls', tiers: tiers([10, 18, 30], [12, 18, 28]) },
  { id: 'enemies', title: 'Living Steps', body: 'Bounce off {n} enemies.', metric: 'lifeEnemies', tiers: tiers([15, 60, 150, 400], [10, 14, 20, 30]) },
  { id: 'speed', title: 'Critical', body: 'Reach momentum {n}.', metric: 'maxSpeed', tiers: tiers([18, 21, 24], [10, 16, 24]) },
  { id: 'combo', title: 'In Phrase', body: 'Build a flow chain of {n}.', metric: 'bestChain', tiers: tiers([20, 35, 50, 80], [12, 18, 26, 40]) },
  { id: 'industrial', title: 'Cartographer', body: 'Enter {n} different reaches.', metric: 'biomes', tiers: tiers([2, 4, 6, 8, 10], [10, 14, 18, 24, 36]) },
  { id: 'nearmiss', title: 'Thread', body: 'Earn {n} near misses in one run.', metric: 'runNears', tiers: tiers([8, 15, 25], [10, 16, 24]) },
  { id: 'daily', title: "Today's Course", body: 'Travel {n}m on a day’s shared seed.', metric: 'daily', tiers: tiers([800, 1500, 2500], [14, 20, 28]) },
  { id: 'dashes', title: 'Burst Habit', body: 'Dash {n} times across your career.', metric: 'lifeDashes', tiers: tiers([50, 200, 600, 1500], [8, 12, 18, 28]) },
  { id: 'runs', title: 'Returning', body: 'Finish {n} runs.', metric: 'runs', tiers: tiers([10, 40, 100, 250], [8, 14, 22, 36]) },
  { id: 'fragments', title: 'Archivist', body: 'Recover {n} fragments.', metric: 'fragments', tiers: tiers([1, 3, 6], [10, 18, 30]) },
  { id: 'odometer', title: 'Odometer', body: 'Travel {n}m across your career.', metric: 'lifeDistance', tiers: tiers([5000, 25000, 80000, 200000], [10, 18, 28, 44]) },
  { id: 'pressure', title: 'Under Pressure', body: 'Travel {n}m in one run on Hard or above.', metric: 'hardDistance', tiers: tiers([800, 2000, 3500], [14, 22, 34]) },
  { id: 'composure', title: 'Composure', body: 'Land {n} perfects in one run.', metric: 'runPerfects', tiers: tiers([10, 20, 35], [10, 16, 26]) },
  { id: 'collector', title: 'Collector', body: 'Own {n} cores.', metric: 'cores', tiers: tiers([3, 6], [10, 20]) },
]

/** XP paid for clearing tier `index` (0-based) of any challenge. */
export function challengeXp(index: number): number {
  return 30 + index * 25
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

export function tierName(def: ChallengeDef, index: number): string {
  return def.tiers.length > 1 ? `${def.title} ${NUMERALS[index] ?? index + 1}` : def.title
}

export function challengeBody(def: ChallengeDef, index: number): string {
  const tier = def.tiers[Math.min(index, def.tiers.length - 1)]
  return def.body.replace('{n}', tier.goal.toLocaleString('en-US'))
}

/* ------------------------------------------------------------- contracts */

export type ContractMetric =
  | 'runDistance'
  | 'runPerfects'
  | 'runWalls'
  | 'runNears'
  | 'runChain'
  | 'runDashes'
  | 'runEnemies'
  | 'runSpeed'
  | 'hardDistance'
  | 'offCoreDistance'
  | 'mutatorDistance'
  | 'noDashDistance'
  | 'dailyDistance'

export interface ContractDef {
  id: string
  /** `{n}` is replaced with the goal. */
  title: string
  metric: ContractMetric
  /** Goal at rank 1; distance goals scale up with rank. */
  base: number
  scales: boolean
  /** Who can be offered this contract. */
  needs?: 'altCore' | 'mutators'
}

export const CONTRACTS: ContractDef[] = [
  { id: 'far', title: 'Travel {n}m in one run', metric: 'runDistance', base: 900, scales: true },
  { id: 'perfects', title: 'Land {n} perfects in one run', metric: 'runPerfects', base: 8, scales: true },
  { id: 'walls', title: 'Wall-bounce {n} times in one run', metric: 'runWalls', base: 5, scales: true },
  { id: 'nears', title: 'Earn {n} near misses in one run', metric: 'runNears', base: 5, scales: true },
  { id: 'chain', title: 'Reach a flow chain of {n}', metric: 'runChain', base: 14, scales: true },
  { id: 'dashes', title: 'Dash {n} times in one run', metric: 'runDashes', base: 10, scales: true },
  { id: 'enemies', title: 'Step on {n} enemies in one run', metric: 'runEnemies', base: 4, scales: true },
  { id: 'speed', title: 'Hit momentum {n}', metric: 'runSpeed', base: 17, scales: false },
  { id: 'hard', title: 'Travel {n}m on Hard or above', metric: 'hardDistance', base: 700, scales: true },
  { id: 'offcore', title: 'Travel {n}m with a core other than Balanced', metric: 'offCoreDistance', base: 700, scales: true, needs: 'altCore' },
  { id: 'mutator', title: 'Travel {n}m under a mutator', metric: 'mutatorDistance', base: 600, scales: true, needs: 'mutators' },
  { id: 'nodash', title: 'Travel {n}m without dashing', metric: 'noDashDistance', base: 450, scales: true },
  { id: 'course', title: 'Travel {n}m on today’s course', metric: 'dailyDistance', base: 700, scales: true },
]

export const CONTRACTS_PER_DAY = 3
export const CONTRACT_ECHOES = 10
export const CONTRACT_XP = 60
export const CONTRACT_SWEEP_ECHOES = 15

/** Rounded goal for a contract offered at `rank`. */
export function contractGoal(def: ContractDef, rank: number): number {
  if (!def.scales) return def.base
  const k = 1 + Math.min(1.2, (rank - 1) * 0.06)
  const raw = def.base * k
  const step = raw >= 200 ? 50 : 1
  return Math.round(raw / step) * step
}

export function contractTitle(def: ContractDef, goal: number): string {
  return def.title.replace('{n}', goal.toLocaleString('en-US'))
}

/** Consecutive-day streak bonus for clearing every contract. */
export function streakBonus(streak: number): number {
  return Math.min(7, Math.max(0, streak)) * 3
}
