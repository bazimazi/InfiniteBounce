import { CORES, DEATH_COPY, DIFFICULTIES, FRAGMENTS, MODULES, TRAILS } from '../content/catalog'
import { CHALLENGES, challengeBody, tierName } from '../content/progression'
import { unlockedBiomes } from '../content/world'
import { fnv1a } from '../core/math'
import type { BiomeId, CoreId, Difficulty, GhostSample, ModuleId, MutatorId, Sim, TrailId } from '../sim/types'
import { PX_PER_METER } from '../sim/types'
import {
  contractLabel,
  emptyBoard,
  ensureContracts,
  factsOf,
  grantRanks,
  masteryEchoMul,
  masteryOf,
  nextRankReward,
  nextSlot,
  rankOf,
  runXp,
  settleChallenges,
  settleContracts,
  type ChallengeState,
  type ContractBoard,
  type XpPart,
} from './progress'

const KEY = 'infinite-bounce-v1'
const META_VERSION = 2

export interface Settings {
  music: number
  sfx: number
  shake: number
  flash: number
  reducedMotion: boolean
  colorblind: boolean
  uiScale: number
  haptics: boolean
  ghost: boolean
  telemetry: boolean
  touch: 'auto' | 'on' | 'off'
  pointerMode: 'drag' | 'zones'
}

export interface RunRecord {
  distance: number
  score: number
  chain: number
  speed: number
  seed: number
  difficulty: Difficulty
  core: CoreId
  day: string
}

export interface TelemetryEvent {
  t: number
  name: string
  distance?: number
  detail?: string
}

export interface Meta {
  version: number
  echoes: number
  /** Total pilot XP ever earned; rank is derived from it. */
  xp: number
  /** Highest rank whose rewards have been paid. */
  rankClaimed: number
  runs: number
  bestDistance: number
  bestScore: number
  bestChain: number
  bestSpeed: number
  lifetime: {
    distance: number
    perfects: number
    bounces: number
    walls: number
    enemies: number
    dashes: number
    nears: number
    time: number
  }
  visited: BiomeId[]
  cores: CoreId[]
  modules: ModuleId[]
  moduleLevels: Partial<Record<ModuleId, number>>
  coreMeters: Partial<Record<CoreId, number>>
  slots: number
  equipped: { core: CoreId; modules: ModuleId[]; trail: TrailId }
  trails: TrailId[]
  gravity: boolean
  challenges: Record<string, ChallengeState>
  contracts: ContractBoard
  fragments: number[]
  seen: string[]
  settings: Settings
  telemetry: TelemetryEvent[]
  bestGhost: GhostSample[] | null
  ghostSeed: number
  daily: { day: string; distance: number; score: number }
  tutorialDone: boolean
  gifted: boolean
  records: RunRecord[]
  lastDifficulty: Difficulty
  lastMutator: MutatorId
}

export interface Summary {
  distance: number
  score: number
  chain: number
  speed: number
  deathTitle: string
  deathLine: string
  echoes: number
  echoParts: XpPart[]
  record: boolean
  gift: string | null
  goals: string[]
  newChallenges: string[]
  contracts: string[]
  xp: number
  xpParts: XpPart[]
  rankBefore: { rank: number; into: number; need: number }
  rankAfter: { rank: number; into: number; need: number; title: string }
  rankLines: string[]
  mastery: { core: string; level: number; leveled: boolean; share: number; next: number | null; meters: number }
}

function prefersReduced(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function defaultSettings(): Settings {
  return {
    music: 0.7,
    sfx: 0.85,
    shake: prefersReduced() ? 0 : 0.55,
    flash: prefersReduced() ? 0 : 0.45,
    reducedMotion: prefersReduced(),
    colorblind: false,
    uiScale: 1,
    haptics: true,
    ghost: true,
    telemetry: false,
    touch: 'auto',
    pointerMode: 'drag',
  }
}

export function defaultMeta(): Meta {
  return {
    version: META_VERSION,
    echoes: 0,
    xp: 0,
    rankClaimed: 1,
    runs: 0,
    bestDistance: 0,
    bestScore: 0,
    bestChain: 0,
    bestSpeed: 0,
    lifetime: { distance: 0, perfects: 0, bounces: 0, walls: 0, enemies: 0, dashes: 0, nears: 0, time: 0 },
    visited: ['meadow'],
    cores: ['balanced'],
    modules: [],
    moduleLevels: {},
    coreMeters: {},
    slots: 1,
    equipped: { core: 'balanced', modules: [], trail: 'dusk' },
    trails: ['none', 'dusk'],
    gravity: false,
    challenges: {},
    contracts: emptyBoard(),
    fragments: [],
    seen: [],
    settings: defaultSettings(),
    telemetry: [],
    bestGhost: null,
    ghostSeed: 0,
    daily: { day: '', distance: 0, score: 0 },
    tutorialDone: false,
    gifted: false,
    records: [],
    lastDifficulty: 'normal',
    lastMutator: 'none',
  }
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

export function dailySeed(day = todayKey()): number {
  return fnv1a(`infinite-bounce:${day}`) || 1
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultMeta()
    const parsed = JSON.parse(raw) as Partial<Meta>
    const base = defaultMeta()
    const meta = { ...base, ...parsed, lifetime: { ...base.lifetime, ...parsed.lifetime }, equipped: { ...base.equipped, ...parsed.equipped }, settings: { ...base.settings, ...parsed.settings }, daily: { ...base.daily, ...parsed.daily }, contracts: { ...base.contracts, ...parsed.contracts } }
    if ((parsed.version ?? 1) < 2) migrateV1(meta)
    meta.slots = Math.max(1, Math.min(3, meta.slots))
    meta.equipped.modules = (meta.equipped.modules ?? []).filter((id) => meta.modules.includes(id)).slice(0, meta.slots)
    if (!meta.cores.includes(meta.equipped.core)) meta.equipped.core = 'balanced'
    if (!meta.trails.includes(meta.equipped.trail)) meta.equipped.trail = 'dusk'
    return meta
  } catch {
    return defaultMeta()
  }
}

/**
 * Version 1 had flat challenges and no rank. Tiers already paid stay paid, and
 * past play is converted to XP so veterans start at a rank that reflects it.
 */
function migrateV1(meta: Meta) {
  const old = meta.challenges as unknown as Record<string, { progress?: number; claimed?: boolean; tier?: number }>
  const next: Record<string, ChallengeState> = {}
  for (const def of CHALLENGES) {
    const prev = old[def.id]
    if (!prev) continue
    next[def.id] = { progress: prev.progress ?? 0, tier: prev.tier ?? (prev.claimed ? 1 : 0) }
  }
  // The old 2,000m challenge folded into Horizon; its tiers up to 2,000m were paid.
  if (old.d2000?.claimed) next.d500 = { progress: Math.max(next.d500?.progress ?? 0, meta.bestDistance), tier: Math.max(next.d500?.tier ?? 0, 3) }
  meta.challenges = next
  const l = meta.lifetime
  meta.xp = Math.round(l.distance / 8 + l.perfects * 4 + (l.walls + l.enemies) * 3 + l.nears * 5)
  meta.coreMeters = { [meta.equipped.core]: Math.round(l.distance) }
  meta.version = META_VERSION
  // Career challenges (dashes, runs, odometer...) are new; credit what was already done.
  settleChallenges(meta, null)
  grantRanks(meta)
}

export function saveMeta(meta: Meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta))
  } catch {
    /* storage full or blocked — the run still happened */
  }
}

export function track(meta: Meta, name: string, distance?: number, detail?: string) {
  if (!meta.settings.telemetry) return
  meta.telemetry.push({ t: Date.now(), name, distance, detail })
  if (meta.telemetry.length > 250) meta.telemetry.splice(0, meta.telemetry.length - 250)
}

export function difficultyUnlocked(meta: Meta, id: Difficulty): boolean {
  const def = DIFFICULTIES.find((d) => d.id === id)
  if (!def) return false
  return meta.bestDistance >= def.unlockDistance || (def.unlockChain > 0 && meta.bestChain >= def.unlockChain)
}

export function mutatorsUnlocked(meta: Meta): boolean {
  return meta.bestDistance >= 2500 || meta.runs >= 12
}

export function goals(meta: Meta): string[] {
  const out: string[] = []
  const open = new Set(unlockedBiomes({
    distance: meta.bestDistance,
    perfects: meta.lifetime.perfects,
    walls: meta.lifetime.walls,
    runWalls: 0,
    chain: meta.bestChain,
    fragments: meta.fragments.length,
    visited: meta.visited,
    gravity: meta.gravity,
  }))
  const nextBiome = (['industrial', 'sky', 'neon', 'cavern', 'inferno', 'void', 'machine', 'cosmic', 'infinite'] as BiomeId[]).find((id) => !open.has(id))
  if (nextBiome) {
    const hints: Record<string, string> = {
      industrial: 'Travel 650m to open the Industrial reach',
      sky: 'Land 10 perfects, or travel 1,600m, to open the Sky',
      neon: 'Bank 12 wall bounces, or travel 2,200m, to open Neon',
      cavern: 'A single run of 6 wall bounces opens the Caverns',
      inferno: 'Reach 1,700m after the works to open Inferno',
      void: 'Travel 2,800m, or learn gravity, to open the Void',
      machine: 'A chain of 18 and 2,300m opens the Machine Core',
      cosmic: 'Find 2 fragments, or travel 3,400m, to open the Cosmic',
      infinite: 'Travel 4,300m to open the Infinite',
    }
    out.push(hints[nextBiome] ?? 'A further reach is still closed')
  }
  const contract = meta.contracts.day === todayKey() ? meta.contracts.list.find((c) => !c.done) : undefined
  if (contract) out.push(`Contract · ${contractLabel(contract)}`)
  // The open challenge tier closest to done, so the hint is always a near target.
  const challenge = CHALLENGES.flatMap((def) => {
    const state = meta.challenges[def.id] ?? { progress: 0, tier: 0 }
    const tier = def.tiers[state.tier]
    return tier ? [{ def, state, tier, share: state.progress / tier.goal }] : []
  }).sort((x, y) => y.share - x.share)[0]
  if (challenge) {
    const p = Math.min(Math.floor(challenge.state.progress), challenge.tier.goal)
    out.push(`${tierName(challenge.def, challenge.state.tier)} · ${challengeBody(challenge.def, challenge.state.tier).replace(/\.$/, '')} · ${p.toLocaleString('en-US')}/${challenge.tier.goal.toLocaleString('en-US')}`)
  }
  const affordable = [...CORES.filter((c) => !meta.cores.includes(c.id)), ...MODULES.filter((m) => !meta.modules.includes(m.id))].sort((a, b) => a.cost - b.cost)[0]
  if (affordable) {
    const need = Math.max(0, affordable.cost - meta.echoes)
    out.push(need === 0 ? `${affordable.name} is ready in the workshop` : `${affordable.name} needs ${need} more echoes`)
  }
  const reward = nextRankReward(rankOf(meta.xp).rank)
  if (reward) out.push(`Rank ${reward.rank} brings: ${reward.label}`)
  if (!out.length) out.push('Take a mutator. The safe habits are the ones to break.')
  return out.slice(0, 3)
}

export function commitRun(meta: Meta, sim: Sim, dailyRun: boolean): Summary {
  const distance = sim.distance
  const chain = sim.stats.maxChain
  const speed = sim.stats.maxSpeed
  const record = distance > meta.bestDistance && distance > 30
  const day = todayKey()
  const before = rankOf(meta.xp)
  const run = factsOf(sim, dailyRun)
  meta.runs += 1
  meta.lifetime.distance += distance
  meta.lifetime.perfects += sim.stats.perfects
  meta.lifetime.bounces += sim.stats.bounces
  meta.lifetime.walls += sim.stats.walls
  meta.lifetime.enemies += sim.stats.enemies
  meta.lifetime.dashes += sim.stats.dashes
  meta.lifetime.nears += sim.stats.nears
  meta.lifetime.time += sim.stats.time
  if (distance > meta.bestDistance) {
    meta.bestDistance = distance
    meta.bestGhost = sim.ghost.slice(0, 2000)
    meta.ghostSeed = sim.config.seed
  }
  if (sim.score > meta.bestScore) meta.bestScore = sim.score
  if (chain > meta.bestChain) meta.bestChain = chain
  if (speed > meta.bestSpeed) meta.bestSpeed = speed
  for (const id of sim.visited) if (!meta.visited.includes(id)) meta.visited.push(id)
  for (const id of sim.seen) if (!meta.seen.includes(id)) meta.seen.push(id)
  for (const id of sim.fragments) if (!meta.fragments.includes(id)) meta.fragments.push(id)
  if (dailyRun) {
    if (meta.daily.day !== day || distance > meta.daily.distance) {
      meta.daily = { day, distance: Math.max(meta.daily.day === day ? meta.daily.distance : 0, distance), score: sim.score }
    }
  }

  // Mastery pays at the level the core had going in; the run then feeds the next level.
  const core = sim.config.core
  const masteryBefore = masteryOf(meta, core)
  meta.coreMeters[core] = (meta.coreMeters[core] ?? 0) + Math.floor(distance)
  const masteryAfter = masteryOf(meta, core)

  const style = sim.stats.perfects * 2 + sim.stats.nears + Math.floor(chain / 4) + sim.fragments.length * 6
  const road = Math.floor(distance / 75)
  const base = road + sim.echoes + style
  const mastery = Math.floor(base * (masteryEchoMul(masteryBefore.level) - 1))
  meta.echoes += base + mastery

  // Deal before this run's XP lands, so a run that unlocks contracts doesn't also clear them.
  ensureContracts(meta, day, mutatorsUnlocked(meta))
  const xp = runXp(run)
  meta.xp += xp.total
  const challenges = settleChallenges(meta, run)
  const contracts = settleContracts(meta, run, day)
  const purseFrom = meta.echoes
  const rankLines = grantRanks(meta)
  const ranks = meta.echoes - purseFrom
  const earned = base + mastery + challenges.echoes + contracts.echoes + ranks

  let gift: string | null = null
  if (!meta.gifted) {
    meta.gifted = true
    if (!meta.trails.includes('ember')) meta.trails.push('ember')
    gift = 'Ember trail'
  }
  meta.tutorialDone = true
  meta.records.unshift({
    distance,
    score: Math.floor(sim.score),
    chain: Math.floor(chain),
    speed: Math.round(speed),
    seed: sim.config.seed,
    difficulty: sim.config.difficulty,
    core,
    day,
  })
  meta.records = meta.records.slice(0, 8)
  const death = DEATH_COPY[sim.death ?? 'FALLEN'] ?? DEATH_COPY.FALLEN
  track(meta, 'run_end', distance, sim.death ?? 'quit')
  const after = rankOf(meta.xp)
  const echoParts: XpPart[] = [
    { label: 'Road', value: road },
    { label: 'Pickups', value: sim.echoes },
    { label: 'Style', value: style },
    { label: 'Mastery', value: mastery },
    { label: 'Challenges', value: challenges.echoes },
    { label: 'Contracts', value: contracts.echoes },
    { label: 'Rank', value: ranks },
  ].filter((p) => p.value > 0)
  const xpParts: XpPart[] = [
    ...xp.parts,
    { label: 'Challenges', value: challenges.xp },
    { label: 'Contracts', value: contracts.xp },
  ].filter((p) => p.value > 0)
  return {
    distance,
    score: Math.floor(sim.score),
    chain: Math.floor(chain),
    speed: Math.round(speed * 10) / 10,
    deathTitle: death.title,
    deathLine: death.line,
    echoes: earned,
    echoParts,
    record,
    gift,
    goals: goals(meta),
    newChallenges: challenges.lines,
    contracts: contracts.lines,
    xp: xp.total + challenges.xp + contracts.xp,
    xpParts,
    rankBefore: { rank: before.rank, into: before.into, need: before.need },
    rankAfter: { rank: after.rank, into: after.into, need: after.need, title: after.title },
    rankLines,
    mastery: {
      core: CORES.find((c) => c.id === core)?.name ?? core,
      level: masteryAfter.level,
      leveled: masteryAfter.level > masteryBefore.level,
      share: masteryAfter.share,
      next: masteryAfter.next,
      meters: masteryAfter.meters,
    },
  }
}

export function buy(meta: Meta, kind: 'core' | 'module' | 'trail' | 'slot' | 'gravity', id: string): boolean {
  if (kind === 'core') {
    const def = CORES.find((c) => c.id === id)
    if (!def || meta.cores.includes(def.id) || meta.echoes < def.cost) return false
    meta.echoes -= def.cost
    meta.cores.push(def.id)
    track(meta, 'unlock', undefined, def.id)
    // Owning cores is itself a challenge; settle it now rather than after the next run.
    settleChallenges(meta, null)
    grantRanks(meta)
    return true
  }
  if (kind === 'module') {
    const def = MODULES.find((m) => m.id === id)
    if (!def || meta.modules.includes(def.id) || meta.echoes < def.cost) return false
    meta.echoes -= def.cost
    meta.modules.push(def.id)
    track(meta, 'unlock', undefined, def.id)
    return true
  }
  if (kind === 'trail') {
    const def = TRAILS.find((t) => t.id === id)
    if (!def || def.rank || meta.trails.includes(def.id) || meta.echoes < def.cost) return false
    meta.echoes -= def.cost
    meta.trails.push(def.id)
    track(meta, 'unlock', undefined, def.id)
    return true
  }
  if (kind === 'slot') {
    const slot = nextSlot(meta)
    if (!slot || meta.echoes < slot.cost || rankOf(meta.xp).rank < slot.rank) return false
    meta.echoes -= slot.cost
    meta.slots += 1
    return true
  }
  if (kind === 'gravity') {
    if (meta.gravity || meta.echoes < 36) return false
    meta.echoes -= 36
    meta.gravity = true
    return true
  }
  return false
}

export function equipCore(meta: Meta, id: CoreId) {
  if (meta.cores.includes(id)) meta.equipped.core = id
}

export function toggleModule(meta: Meta, id: ModuleId) {
  if (!meta.modules.includes(id)) return
  const has = meta.equipped.modules.includes(id)
  if (has) meta.equipped.modules = meta.equipped.modules.filter((m) => m !== id)
  else if (meta.equipped.modules.length < meta.slots) meta.equipped.modules.push(id)
  else if (meta.slots === 1) meta.equipped.modules = [id]
  else meta.equipped.modules = [...meta.equipped.modules.slice(1), id]
}

export function equipTrail(meta: Meta, id: TrailId) {
  if (meta.trails.includes(id)) meta.equipped.trail = id
}

export function loreLines(meta: Meta): string[] {
  return meta.fragments.slice().sort((a, b) => a - b).map((id) => FRAGMENTS[id]).filter(Boolean)
}

export function speedLabel(pxPerSec: number): string {
  return (pxPerSec / PX_PER_METER).toFixed(0)
}
