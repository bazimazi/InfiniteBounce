import type { Rng } from '../core/rng'

export type BiomeId =
  | 'meadow'
  | 'industrial'
  | 'sky'
  | 'neon'
  | 'cavern'
  | 'inferno'
  | 'void'
  | 'machine'
  | 'cosmic'
  | 'infinite'

export type Difficulty = 'relaxed' | 'normal' | 'hard' | 'extreme' | 'master'

export type CoreId = 'balanced' | 'agile' | 'heavy' | 'elastic' | 'magnetic' | 'volatile'

export type ModuleId =
  | 'momentum'
  | 'bounce'
  | 'speed'
  | 'brake'
  | 'combo'
  | 'risk'
  | 'wall'
  | 'magnet'

export type TrailId = 'none' | 'dusk' | 'ember' | 'ion' | 'petal' | 'void'

export type MutatorId = 'none' | 'tailwind' | 'heavy' | 'nodash' | 'glass'

export type Route = 'safe' | 'normal' | 'expert'

export type PlatformKind =
  | 'normal'
  | 'super'
  | 'weak'
  | 'sticky'
  | 'ice'
  | 'bumper'
  | 'moving'
  | 'collapsing'
  | 'launch'
  | 'magnetic'
  | 'conveyor'
  | 'cloud'
  | 'oneway'
  | 'wall'

export type HazardKind = 'spikes' | 'laser' | 'crusher' | 'lava' | 'sweep'

export type EnemyKind = 'hopper' | 'wisp' | 'shard'

export type PickupKind = 'gem' | 'echo' | 'shield' | 'dash' | 'fragment' | 'loop'

export type ZoneKind = 'wind' | 'updraft' | 'lowgrav' | 'flipgrav' | 'glide'

export type DeathId =
  | 'FALLEN'
  | 'LOST'
  | 'OVERSPEED'
  | 'SPIKES'
  | 'COLLISION'
  | 'CRUSHED'
  | 'LASER'
  | 'SWEEP'
  | 'LAVA'

export type MomentumState =
  | 'STABLE'
  | 'ACCEL'
  | 'HIGH'
  | 'CRITICAL'
  | 'BRAKE'
  | 'AIR'
  | 'WALL'
  | 'DASH'

export interface Platform {
  id: number
  x: number
  y: number
  w: number
  h: number
  kind: PlatformKind
  route: Route
  phase: number
  amp: number
  freq: number
  axis: 'x' | 'y'
  conveyor: number
  collapseDelay: number
  collapsed: boolean
  fallY: number
  fallV: number
  touchedAt: number
  bumperAngle: number
  flash: number
}

export interface Hazard {
  id: number
  kind: HazardKind
  x: number
  y: number
  w: number
  h: number
  phase: number
  freq: number
  amp: number
  speed: number
}

export interface Enemy {
  id: number
  kind: EnemyKind
  x: number
  y: number
  r: number
  originX: number
  originY: number
  amp: number
  freq: number
  phase: number
  flash: number
  cooldown: number
}

export interface Pickup {
  id: number
  kind: PickupKind
  x: number
  y: number
  taken: boolean
  value: number
  bob: number
}

export interface Zone {
  id: number
  kind: ZoneKind
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  gravMul: number
}

export interface Sign {
  x: number
  y: number
  text: string
}

export interface Chunk {
  index: number
  x: number
  w: number
  floorY: number
  exitY: number
  biome: BiomeId
  moduleId: string
  difficulty: number
  tags: string[]
  platforms: Platform[]
  hazards: Hazard[]
  enemies: Enemy[]
  pickups: Pickup[]
  zones: Zone[]
  signs: Sign[]
  setpiece: string | null
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type SimEvent =
  | { type: 'bounce'; x: number; y: number; perfect: boolean; fast: boolean; kind: PlatformKind; speed: number }
  | { type: 'wall'; x: number; y: number; skill: boolean }
  | { type: 'enemy'; x: number; y: number; kind: EnemyKind }
  | { type: 'dash'; x: number; y: number }
  | { type: 'nearmiss'; x: number; y: number; threaded: boolean }
  | { type: 'pickup'; x: number; y: number; kind: PickupKind; value: number }
  | { type: 'shield'; x: number; y: number }
  | { type: 'death'; id: DeathId; x: number; y: number }
  | { type: 'banner'; text: string; sub?: string }
  | { type: 'flow'; chain: number }
  | { type: 'record' }
  | { type: 'biome'; biome: BiomeId }
  | { type: 'respawn' }

export interface InputFrame {
  x: number
  y: number
  brake: boolean
  dash: boolean
  grav: boolean
  pause: boolean
}

export interface Mods {
  gravity: number
  bounce: number
  minBounce: number
  maxBounce: number
  accel: number
  air: number
  brake: number
  maxVx: number
  dashImpulse: number
  dashCharges: number
  dashCd: number
  wall: number
  wallPop: number
  magnet: number
  flowDecay: number
  score: number
  near: number
  frictionKeep: number
  phase: boolean
  enemyBounce: number
  enemyDash: boolean
  heavyLanding: boolean
  control: number
  promise: number
}

export interface Ball {
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  r: number
  spin: number
  lastBounce: number
  squash: number
  state: MomentumState
  surface: PlatformKind
}

export interface RunStats {
  bounces: number
  perfects: number
  walls: number
  enemies: number
  dashes: number
  nears: number
  pickups: number
  maxSpeed: number
  maxChain: number
  steered: boolean
  braked: boolean
  sawSplit: boolean
  distance: number
  time: number
}

export interface ChoiceCard {
  id: string
  kicker: string
  title: string
  body: string
  tone: string
}

export interface Choice {
  kind: 'upgrade' | 'biome'
  title: string
  subtitle: string
  cards: ChoiceCard[]
}

export interface GhostSample {
  t: number
  x: number
  y: number
}

export interface RunConfig {
  seed: number
  difficulty: Difficulty
  core: CoreId
  mutator: MutatorId
  practice: boolean
  tutorial: boolean
  gravityAbility: boolean
  modules: ModuleId[]
  trail: TrailId
  seen: string[]
  visited: BiomeId[]
  lifetimePerfects: number
  lifetimeWalls: number
  fragments: number
  bestChain: number
  bestDistance: number
  personalBest: number
}

export const PX_PER_METER = 48

export interface Sim {
  config: RunConfig
  time: number
  distance: number
  score: number
  chain: number
  flow: number
  flowIdle: number
  echoes: number
  shield: number
  invuln: number
  grace: number
  dashCd: number
  dashCharges: number
  dashTimer: number
  dashHeld: boolean
  gravCd: number
  gravTimer: number
  gravHeld: boolean
  mods: Mods
  ball: Ball
  chunks: Chunk[]
  events: SimEvent[]
  runRng: Rng
  worldRng: Rng
  nextId: { n: number }
  dead: boolean
  death: DeathId | null
  biome: BiomeId
  visited: BiomeId[]
  seen: string[]
  recentModules: string[]
  segment: number
  nextUpgradeAt: number
  relief: number
  choice: Choice | null
  pendingFork: BiomeId[] | null
  forkX: number
  runUpgradeIds: string[]
  stats: RunStats
  startX: number
  personalBest: number
  announcedRecord: boolean
  closeCalls: number[]
  resolvedMiss: number[]
  fragments: number[]
  stuck: number
  insideChunk: number
  serial: number
  milestoneChain: number
  lowSpeedTime: number
  ghostAcc: number
  ghost: GhostSample[]
  fallbacks: number
  hitstop: number
}

export const BIOME_ORDER: BiomeId[] = [
  'meadow',
  'industrial',
  'sky',
  'neon',
  'cavern',
  'inferno',
  'void',
  'machine',
  'cosmic',
  'infinite',
]
