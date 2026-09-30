import { Rng } from '../core/rng'
import { computeMods } from './loadout'
import { ensureChunks } from './generator'
import type { Ball, BiomeId, RunConfig, RunStats, Sim } from './types'
import { TUNE } from '../content/tune'

export function defaultConfig(over: Partial<RunConfig> = {}): RunConfig {
  return {
    seed: 1,
    difficulty: 'normal',
    core: 'balanced',
    mutator: 'none',
    practice: false,
    tutorial: true,
    gravityAbility: false,
    modules: [],
    moduleLevels: {},
    trail: 'dusk',
    seen: [],
    visited: [],
    lifetimePerfects: 0,
    lifetimeWalls: 0,
    fragments: 0,
    bestChain: 0,
    bestDistance: 0,
    personalBest: 0,
    ...over,
  }
}

function emptyStats(): RunStats {
  return {
    bounces: 0,
    perfects: 0,
    walls: 0,
    enemies: 0,
    dashes: 0,
    nears: 0,
    pickups: 0,
    maxSpeed: 0,
    maxChain: 0,
    steered: false,
    braked: false,
    sawSplit: false,
    distance: 0,
    time: 0,
  }
}

export function createRun(config: RunConfig): Sim {
  const mods = computeMods(config.core, config.modules, [], config.difficulty, config.mutator, config.moduleLevels)
  const ball: Ball = {
    x: 150,
    y: -86,
    px: 150,
    py: -86,
    vx: 210,
    vy: 60,
    r: TUNE.radius,
    spin: 0,
    lastBounce: -10,
    squash: 0,
    state: 'AIR',
    surface: 'normal',
  }
  const visited: BiomeId[] = ['meadow']
  for (const b of config.visited) if (!visited.includes(b)) visited.push(b)
  const sim: Sim = {
    config,
    time: 0,
    distance: 0,
    score: 0,
    chain: 0,
    flow: 0,
    flowIdle: 0,
    echoes: 0,
    shield: 0,
    invuln: 0,
    grace: TUNE.grace,
    dashCd: 0,
    dashCharges: mods.dashCharges,
    dashTimer: 0,
    dashHeld: false,
    gravCd: 0,
    gravTimer: 0,
    gravHeld: false,
    mods,
    ball,
    chunks: [],
    events: [],
    runRng: new Rng((config.seed ^ 0x9e3779b9) >>> 0),
    worldRng: new Rng(config.seed >>> 0 || 1),
    nextId: { n: 1 },
    dead: false,
    death: null,
    biome: 'meadow',
    visited,
    seen: [...config.seen],
    recentModules: [],
    segment: 0,
    nextUpgradeAt: 560,
    relief: 0,
    choice: null,
    pendingFork: null,
    forkX: 1e9,
    runUpgradeIds: [],
    stats: emptyStats(),
    startX: ball.x,
    personalBest: config.personalBest,
    announcedRecord: false,
    closeCalls: [],
    resolvedMiss: [],
    fragments: [],
    stuck: 0,
    insideChunk: -1,
    serial: 0,
    milestoneChain: 0,
    lowSpeedTime: 0,
    ghostAcc: 0,
    ghost: [],
    fallbacks: 0,
    hitstop: 0,
  }
  ensureChunks(sim, 2800)
  return sim
}
