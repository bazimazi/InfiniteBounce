import { CHALLENGES, CORES, DEATH_COPY, DIFFICULTIES, FRAGMENTS, MODULES, TRAILS } from '../content/catalog'
import { unlockedBiomes } from '../content/world'
import { fnv1a } from '../core/math'
import type { BiomeId, CoreId, Difficulty, GhostSample, ModuleId, MutatorId, Sim, TrailId } from '../sim/types'
import { PX_PER_METER } from '../sim/types'

const KEY = 'infinite-bounce-v1'

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
  version: 1
  echoes: number
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
  slots: number
  equipped: { core: CoreId; modules: ModuleId[]; trail: TrailId }
  trails: TrailId[]
  gravity: boolean
  challenges: Record<string, { progress: number; claimed: boolean }>
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
  record: boolean
  gift: string | null
  goals: string[]
  newChallenges: string[]
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
    version: 1,
    echoes: 0,
    runs: 0,
    bestDistance: 0,
    bestScore: 0,
    bestChain: 0,
    bestSpeed: 0,
    lifetime: { distance: 0, perfects: 0, bounces: 0, walls: 0, enemies: 0, dashes: 0, nears: 0, time: 0 },
    visited: ['meadow'],
    cores: ['balanced'],
    modules: [],
    slots: 1,
    equipped: { core: 'balanced', modules: [], trail: 'dusk' },
    trails: ['none', 'dusk'],
    gravity: false,
    challenges: {},
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
    const meta = { ...base, ...parsed, lifetime: { ...base.lifetime, ...parsed.lifetime }, equipped: { ...base.equipped, ...parsed.equipped }, settings: { ...base.settings, ...parsed.settings }, daily: { ...base.daily, ...parsed.daily } }
    meta.equipped.modules = (meta.equipped.modules ?? []).filter((id) => meta.modules.includes(id)).slice(0, meta.slots)
    if (!meta.cores.includes(meta.equipped.core)) meta.equipped.core = 'balanced'
    if (!meta.trails.includes(meta.equipped.trail)) meta.equipped.trail = 'dusk'
    return meta
  } catch {
    return defaultMeta()
  }
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

function challengeValue(meta: Meta, id: string, sim: Sim, dailyRun: boolean): number {
  const def = CHALLENGES.find((c) => c.id === id)
  if (!def) return 0
  switch (def.metric) {
    case 'runDistance':
      return sim.distance
    case 'lifePerfects':
      return meta.lifetime.perfects
    case 'runWalls':
      return sim.stats.walls
    case 'lifeEnemies':
      return meta.lifetime.enemies
    case 'maxSpeed':
      return meta.bestSpeed
    case 'bestChain':
      return meta.bestChain
    case 'biomeIndustrial':
      return meta.visited.includes('industrial') ? 1 : 0
    case 'runNears':
      return sim.stats.nears
    case 'daily':
      return dailyRun && meta.daily.day === todayKey() ? meta.daily.distance : (meta.challenges[id]?.progress ?? 0)
    default:
      return 0
  }
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
  const challenge = CHALLENGES.find((c) => (meta.challenges[c.id]?.progress ?? 0) < c.goal)
  if (challenge) {
    const p = Math.floor(meta.challenges[challenge.id]?.progress ?? 0)
    out.push(`${challenge.title}: ${Math.min(p, challenge.goal)}/${challenge.goal}`)
  }
  const affordable = [...CORES.filter((c) => !meta.cores.includes(c.id)), ...MODULES.filter((m) => !meta.modules.includes(m.id))].sort((a, b) => a.cost - b.cost)[0]
  if (affordable) {
    const need = Math.max(0, affordable.cost - meta.echoes)
    out.push(need === 0 ? `${affordable.name} is ready in the workshop` : `${affordable.name} needs ${need} more echoes`)
  }
  if (!out.length) out.push('Take a mutator. The safe habits are the ones to break.')
  return out.slice(0, 3)
}

export function commitRun(meta: Meta, sim: Sim, dailyRun: boolean): Summary {
  const distance = sim.distance
  const chain = sim.stats.maxChain
  const speed = sim.stats.maxSpeed
  const record = distance > meta.bestDistance && distance > 30
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
    const day = todayKey()
    if (meta.daily.day !== day || distance > meta.daily.distance) {
      meta.daily = { day, distance: Math.max(meta.daily.day === day ? meta.daily.distance : 0, distance), score: sim.score }
    }
  }

  const newChallenges: string[] = []
  let bonus = 0
  for (const c of CHALLENGES) {
    const prev = meta.challenges[c.id] ?? { progress: 0, claimed: false }
    const value = Math.max(prev.progress, challengeValue(meta, c.id, sim, dailyRun))
    const claimed = prev.claimed
    meta.challenges[c.id] = { progress: value, claimed }
    if (!claimed && value >= c.goal) {
      meta.challenges[c.id].claimed = true
      bonus += c.reward
      newChallenges.push(c.title)
    }
  }

  const style = sim.stats.perfects * 2 + sim.stats.nears + Math.floor(chain / 4) + sim.fragments.length * 6
  const earned = Math.floor(distance / 75) + sim.echoes + style + bonus
  meta.echoes += earned

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
    core: sim.config.core,
    day: todayKey(),
  })
  meta.records = meta.records.slice(0, 8)
  const death = DEATH_COPY[sim.death ?? 'FALLEN'] ?? DEATH_COPY.FALLEN
  track(meta, 'run_end', distance, sim.death ?? 'quit')
  return {
    distance,
    score: Math.floor(sim.score),
    chain: Math.floor(chain),
    speed: Math.round(speed * 10) / 10,
    deathTitle: death.title,
    deathLine: death.line,
    echoes: earned,
    record,
    gift,
    goals: goals(meta),
    newChallenges,
  }
}

export function buy(meta: Meta, kind: 'core' | 'module' | 'trail' | 'slot' | 'gravity', id: string): boolean {
  if (kind === 'core') {
    const def = CORES.find((c) => c.id === id)
    if (!def || meta.cores.includes(def.id) || meta.echoes < def.cost) return false
    meta.echoes -= def.cost
    meta.cores.push(def.id)
    track(meta, 'unlock', undefined, def.id)
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
    if (!def || meta.trails.includes(def.id) || meta.echoes < def.cost) return false
    meta.echoes -= def.cost
    meta.trails.push(def.id)
    track(meta, 'unlock', undefined, def.id)
    return true
  }
  if (kind === 'slot') {
    if (meta.slots >= 2 || meta.echoes < 18) return false
    meta.echoes -= 18
    meta.slots = 2
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
