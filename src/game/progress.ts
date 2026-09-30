import { CORES, MODULES, TRAILS } from '../content/catalog'
import {
  CHALLENGES,
  CONTRACTS,
  CONTRACTS_PER_DAY,
  CONTRACTS_RANK,
  CONTRACT_ECHOES,
  CONTRACT_SWEEP_ECHOES,
  CONTRACT_XP,
  DIFFICULTY_XP,
  MASTERY_ECHO_BONUS,
  MASTERY_METERS,
  MAX_MODULE_LEVEL,
  MUTATOR_XP,
  RANK_REWARDS,
  SLOT_COST,
  THIRD_SLOT_RANK,
  TUNING_RANK,
  challengeXp,
  contractGoal,
  contractTitle,
  masteryLevel,
  rankPurse,
  rankTitle,
  streakBonus,
  tierName,
  tuneCost,
  xpToNext,
  type ChallengeDef,
  type ContractDef,
} from '../content/progression'
import { fnv1a } from '../core/math'
import { Rng } from '../core/rng'
import type { CoreId, Difficulty, ModuleId, MutatorId, Sim } from '../sim/types'
import type { Meta } from './save'

/** What a finished run contributes to progression, detached from the live sim. */
export interface RunFacts {
  distance: number
  perfects: number
  walls: number
  nears: number
  enemies: number
  dashes: number
  maxChain: number
  maxSpeed: number
  fragments: number
  difficulty: Difficulty
  mutator: MutatorId
  core: CoreId
  daily: boolean
}

export function factsOf(sim: Sim, daily: boolean): RunFacts {
  const s = sim.stats
  return {
    distance: sim.distance,
    perfects: s.perfects,
    walls: s.walls,
    nears: s.nears,
    enemies: s.enemies,
    dashes: s.dashes,
    maxChain: s.maxChain,
    maxSpeed: s.maxSpeed,
    fragments: sim.fragments.length,
    difficulty: sim.config.difficulty,
    mutator: sim.config.mutator,
    core: sim.config.core,
    daily,
  }
}

const HARD: Difficulty[] = ['hard', 'extreme', 'master']

/* ------------------------------------------------------------------ rank */

export interface RankInfo {
  rank: number
  /** XP earned inside the current rank. */
  into: number
  /** XP the current rank asks for in total. */
  need: number
  title: string
}

export function rankOf(xp: number): RankInfo {
  let rank = 1
  let left = Math.max(0, Math.floor(xp))
  while (left >= xpToNext(rank)) {
    left -= xpToNext(rank)
    rank++
  }
  return { rank, into: left, need: xpToNext(rank), title: rankTitle(rank) }
}

export interface XpPart {
  label: string
  value: number
}

export function runXp(run: RunFacts): { total: number; parts: XpPart[] } {
  const parts: XpPart[] = [
    { label: 'Distance', value: run.distance / 8 },
    { label: 'Landings', value: run.perfects * 4 },
    { label: 'Lines', value: run.walls * 3 + run.enemies * 3 + run.nears * 5 },
    { label: 'Flow', value: Math.floor(run.maxChain / 2) * 2 },
    { label: 'Fragments', value: run.fragments * 25 },
  ]
  const mul = DIFFICULTY_XP[run.difficulty] * MUTATOR_XP[run.mutator]
  const out = parts.map((p) => ({ label: p.label, value: Math.round(p.value * mul) })).filter((p) => p.value > 0)
  return { total: out.reduce((sum, p) => sum + p.value, 0), parts: out }
}

/** Pays out every rank reached but not yet rewarded. Returns what was granted, one line each. */
export function grantRanks(meta: Meta): string[] {
  const { rank } = rankOf(meta.xp)
  const lines: string[] = []
  while (meta.rankClaimed < rank) {
    const r = ++meta.rankClaimed
    const purse = rankPurse(r)
    meta.echoes += purse
    const extras: string[] = []
    for (const reward of RANK_REWARDS.filter((x) => x.rank === r)) {
      if (reward.trail && !meta.trails.includes(reward.trail)) meta.trails.push(reward.trail)
      if (reward.echoes) meta.echoes += reward.echoes
      extras.push(reward.label)
    }
    lines.push(`Rank ${r} · ${rankTitle(r)} · +${purse} echoes${extras.length ? ` · ${extras.join(' · ')}` : ''}`)
  }
  return lines
}

export function nextRankReward(rank: number) {
  return RANK_REWARDS.find((r) => r.rank > rank) ?? null
}

/* --------------------------------------------------------------- mastery */

export interface MasteryInfo {
  level: number
  meters: number
  /** Meters at which the next level lands, or null at the cap. */
  next: number | null
  /** Progress through the current level, 0..1. */
  share: number
}

export function masteryOf(meta: Meta, core: CoreId): MasteryInfo {
  const meters = meta.coreMeters[core] ?? 0
  const level = masteryLevel(meters)
  const from = MASTERY_METERS[level - 1]
  const next = MASTERY_METERS[level] ?? null
  return { level, meters, next, share: next === null ? 1 : (meters - from) / (next - from) }
}

export function masteryEchoMul(level: number): number {
  return 1 + (level - 1) * MASTERY_ECHO_BONUS
}

/* ------------------------------------------------------------ challenges */

export interface ChallengeState {
  progress: number
  /** Tiers already cleared and paid. */
  tier: number
}

function challengeValue(meta: Meta, def: ChallengeDef, run: RunFacts | null): number {
  switch (def.metric) {
    case 'runDistance':
      return run?.distance ?? 0
    case 'lifePerfects':
      return meta.lifetime.perfects
    case 'runWalls':
      return run?.walls ?? 0
    case 'lifeEnemies':
      return meta.lifetime.enemies
    case 'maxSpeed':
      return meta.bestSpeed
    case 'bestChain':
      return meta.bestChain
    case 'biomes':
      return meta.visited.length
    case 'runNears':
      return run?.nears ?? 0
    case 'daily':
      return run?.daily ? run.distance : 0
    case 'lifeDashes':
      return meta.lifetime.dashes
    case 'runs':
      return meta.runs
    case 'fragments':
      return meta.fragments.length
    case 'lifeDistance':
      return meta.lifetime.distance
    case 'hardDistance':
      return run && HARD.includes(run.difficulty) ? run.distance : 0
    case 'runPerfects':
      return run?.perfects ?? 0
    case 'cores':
      return meta.cores.length
    default:
      return 0
  }
}

export interface Payout {
  lines: string[]
  echoes: number
  xp: number
}

/** Advances every challenge and pays each tier crossed. Pass `null` outside a run (after a purchase). */
export function settleChallenges(meta: Meta, run: RunFacts | null): Payout {
  const out: Payout = { lines: [], echoes: 0, xp: 0 }
  for (const def of CHALLENGES) {
    const prev = meta.challenges[def.id] ?? { progress: 0, tier: 0 }
    const state: ChallengeState = { progress: Math.max(prev.progress, challengeValue(meta, def, run)), tier: prev.tier }
    while (state.tier < def.tiers.length && state.progress >= def.tiers[state.tier].goal) {
      out.echoes += def.tiers[state.tier].reward
      out.xp += challengeXp(state.tier)
      out.lines.push(tierName(def, state.tier))
      state.tier++
    }
    meta.challenges[def.id] = state
  }
  meta.echoes += out.echoes
  meta.xp += out.xp
  return out
}

/* ------------------------------------------------------------- contracts */

export interface ContractState {
  id: string
  goal: number
  progress: number
  done: boolean
}

export interface ContractBoard {
  day: string
  list: ContractState[]
  streak: number
  /** Last day every contract was cleared. */
  lastSweep: string
}

export function emptyBoard(): ContractBoard {
  return { day: '', list: [], streak: 0, lastSweep: '' }
}

export function previousDay(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`)
  return Number.isFinite(t) ? new Date(t - 86400000).toISOString().slice(0, 10) : ''
}

function eligible(meta: Meta, def: ContractDef, mutatorsOpen: boolean): boolean {
  if (def.needs === 'altCore') return meta.cores.some((c) => c !== 'balanced')
  if (def.needs === 'mutators') return mutatorsOpen
  return true
}

/** Deals today's contracts if the board is stale. Same day and pool always deal the same hand. */
export function ensureContracts(meta: Meta, day: string, mutatorsOpen: boolean): boolean {
  const { rank } = rankOf(meta.xp)
  if (rank < CONTRACTS_RANK || meta.contracts.day === day) return false
  const pool = CONTRACTS.filter((def) => eligible(meta, def, mutatorsOpen))
  const rng = new Rng(fnv1a(`contracts:${day}`) || 1)
  const hand: ContractDef[] = []
  while (hand.length < CONTRACTS_PER_DAY && pool.length) hand.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0])
  meta.contracts.day = day
  meta.contracts.list = hand.map((def) => ({ id: def.id, goal: contractGoal(def, rank), progress: 0, done: false }))
  return true
}

/** Streak as it stands today: it lapses once a whole day passes without a sweep. */
export function liveStreak(board: ContractBoard, day: string): number {
  return board.lastSweep === day || board.lastSweep === previousDay(day) ? board.streak : 0
}

export function contractDef(id: string): ContractDef | undefined {
  return CONTRACTS.find((c) => c.id === id)
}

export function contractLabel(c: ContractState): string {
  const def = contractDef(c.id)
  return def ? contractTitle(def, c.goal) : c.id
}

export function contractValue(def: ContractDef, run: RunFacts): number {
  switch (def.metric) {
    case 'runDistance':
      return run.distance
    case 'runPerfects':
      return run.perfects
    case 'runWalls':
      return run.walls
    case 'runNears':
      return run.nears
    case 'runChain':
      return run.maxChain
    case 'runDashes':
      return run.dashes
    case 'runEnemies':
      return run.enemies
    case 'runSpeed':
      return run.maxSpeed
    case 'hardDistance':
      return HARD.includes(run.difficulty) ? run.distance : 0
    case 'offCoreDistance':
      return run.core !== 'balanced' ? run.distance : 0
    case 'mutatorDistance':
      return run.mutator !== 'none' ? run.distance : 0
    case 'noDashDistance':
      return run.dashes === 0 ? run.distance : 0
    case 'dailyDistance':
      return run.daily ? run.distance : 0
    default:
      return 0
  }
}

/** Contracts a run in progress has just met, for an in-run callout. Nothing is paid here. */
export function metContracts(meta: Meta, run: RunFacts, day: string): ContractState[] {
  if (meta.contracts.day !== day) return []
  return meta.contracts.list.filter((c) => {
    const def = contractDef(c.id)
    return !c.done && !!def && contractValue(def, run) >= c.goal
  })
}

export function settleContracts(meta: Meta, run: RunFacts, day: string): Payout & { sweep: boolean } {
  const out = { lines: [] as string[], echoes: 0, xp: 0, sweep: false }
  const board = meta.contracts
  if (board.day !== day || !board.list.length) return out
  for (const c of board.list) {
    const def = contractDef(c.id)
    if (!def || c.done) continue
    c.progress = Math.max(c.progress, contractValue(def, run))
    if (c.progress >= c.goal) {
      c.done = true
      out.echoes += CONTRACT_ECHOES
      out.xp += CONTRACT_XP
      out.lines.push(contractTitle(def, c.goal))
    }
  }
  if (out.lines.length && board.list.every((c) => c.done) && board.lastSweep !== day) {
    board.streak = board.lastSweep === previousDay(day) ? board.streak + 1 : 1
    board.lastSweep = day
    const bonus = CONTRACT_SWEEP_ECHOES + streakBonus(board.streak)
    out.echoes += bonus
    out.sweep = true
    out.lines.push(`Full board · day ${board.streak} streak · +${bonus} echoes`)
  }
  meta.echoes += out.echoes
  meta.xp += out.xp
  return out
}

/* ------------------------------------------------------------- workshop */

export function moduleLevel(meta: Meta, id: ModuleId): number {
  return meta.moduleLevels[id] ?? 1
}

/** Why a module cannot be tuned further right now, or null when it can. */
export function tuneBlock(meta: Meta, id: ModuleId): string | null {
  const def = MODULES.find((m) => m.id === id)
  if (!def || !meta.modules.includes(id)) return 'Not owned'
  const level = moduleLevel(meta, id)
  if (level >= MAX_MODULE_LEVEL) return 'Fully tuned'
  const rank = TUNING_RANK[level + 1]
  if (rankOf(meta.xp).rank < rank) return `Rank ${rank}`
  if (meta.echoes < tuneCost(def.cost, level)) return 'Not enough echoes'
  return null
}

export function tuneModule(meta: Meta, id: ModuleId): boolean {
  if (tuneBlock(meta, id)) return false
  const def = MODULES.find((m) => m.id === id)!
  const level = moduleLevel(meta, id)
  meta.echoes -= tuneCost(def.cost, level)
  meta.moduleLevels[id] = level + 1
  return true
}

export const MAX_SLOTS = SLOT_COST.length - 1

/** Cost and rank gate of the next module slot, or null when all are built. */
export function nextSlot(meta: Meta): { cost: number; rank: number } | null {
  const n = meta.slots + 1
  if (n > MAX_SLOTS) return null
  return { cost: SLOT_COST[n], rank: n >= 3 ? THIRD_SLOT_RANK : 0 }
}

export function trailLocked(meta: Meta, id: string): number | null {
  const def = TRAILS.find((t) => t.id === id)
  return def?.rank && !meta.trails.includes(def.id) ? def.rank : null
}

export function coreName(id: CoreId): string {
  return CORES.find((c) => c.id === id)?.name ?? id
}
