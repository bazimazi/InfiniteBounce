import { describe, expect, it } from 'vitest'
import { CHALLENGES, CONTRACTS, xpToNext } from '../content/progression'
import { computeMods } from '../sim/loadout'
import {
  ensureContracts,
  grantRanks,
  liveStreak,
  previousDay,
  rankOf,
  runXp,
  settleChallenges,
  settleContracts,
  tuneModule,
  type RunFacts,
} from './progress'
import { autopilot } from '../sim/autopilot'
import { resolveChoice } from '../sim/choices'
import { createRun, defaultConfig } from '../sim/create'
import { fixedStep } from '../sim/step'
import { buy, commitRun, defaultMeta, loadMeta } from './save'

function facts(over: Partial<RunFacts> = {}): RunFacts {
  return {
    distance: 0,
    perfects: 0,
    walls: 0,
    nears: 0,
    enemies: 0,
    dashes: 0,
    maxChain: 0,
    maxSpeed: 0,
    fragments: 0,
    difficulty: 'normal',
    mutator: 'none',
    core: 'balanced',
    daily: false,
    ...over,
  }
}

describe('pilot rank', () => {
  it('derives rank from total XP', () => {
    expect(rankOf(0).rank).toBe(1)
    expect(rankOf(xpToNext(1) - 1).rank).toBe(1)
    expect(rankOf(xpToNext(1)).rank).toBe(2)
    expect(rankOf(xpToNext(1) + xpToNext(2)).into).toBe(0)
  })

  it('pays each rank once, including milestone trails', () => {
    const meta = defaultMeta()
    meta.xp = xpToNext(1) + xpToNext(2)
    const lines = grantRanks(meta)
    expect(lines).toHaveLength(2)
    expect(meta.trails).toContain('aurora')
    const echoes = meta.echoes
    expect(grantRanks(meta)).toHaveLength(0)
    expect(meta.echoes).toBe(echoes)
  })

  it('pays more XP for harder paces', () => {
    const run = facts({ distance: 1000, perfects: 5 })
    expect(runXp({ ...run, difficulty: 'master' }).total).toBeGreaterThan(runXp(run).total)
    expect(runXp({ ...run, mutator: 'glass' }).total).toBeGreaterThan(runXp(run).total)
  })
})

describe('tiered challenges', () => {
  it('clears several tiers in one go and never pays twice', () => {
    const meta = defaultMeta()
    const first = settleChallenges(meta, facts({ distance: 2100 }))
    expect(meta.challenges.d500.tier).toBe(3)
    expect(first.lines).toEqual(expect.arrayContaining(['Horizon I', 'Horizon II', 'Horizon III']))
    const again = settleChallenges(meta, facts({ distance: 2100 }))
    expect(again.lines).not.toContain('Horizon III')
    expect(again.echoes).toBe(0)
  })

  it('keeps single-run progress as a best, not a sum', () => {
    const meta = defaultMeta()
    settleChallenges(meta, facts({ walls: 6 }))
    settleChallenges(meta, facts({ walls: 5 }))
    expect(meta.challenges.walls.progress).toBe(6)
  })

  it('settles ownership challenges outside a run', () => {
    const meta = defaultMeta()
    meta.echoes = 1000
    buy(meta, 'core', 'agile')
    buy(meta, 'core', 'heavy')
    expect(meta.challenges.collector.tier).toBe(1)
  })

  it('has goals that climb within every challenge', () => {
    for (const def of CHALLENGES) {
      for (let i = 1; i < def.tiers.length; i++) expect(def.tiers[i].goal, def.id).toBeGreaterThan(def.tiers[i - 1].goal)
    }
  })
})

describe('daily contracts', () => {
  const unlocked = () => {
    const meta = defaultMeta()
    meta.xp = xpToNext(1)
    return meta
  }

  it('waits for rank 2 and deals the same hand for the same day', () => {
    const rookie = defaultMeta()
    expect(ensureContracts(rookie, '2026-09-30', false)).toBe(false)
    const a = unlocked()
    const b = unlocked()
    ensureContracts(a, '2026-09-30', false)
    ensureContracts(b, '2026-09-30', false)
    expect(a.contracts.list.map((c) => c.id)).toEqual(b.contracts.list.map((c) => c.id))
    expect(new Set(a.contracts.list.map((c) => c.id)).size).toBe(3)
    expect(a.contracts.list.some((c) => c.id === 'offcore' || c.id === 'mutator')).toBe(false)
  })

  it('pays a contract once and builds a streak on consecutive sweeps', () => {
    const meta = unlocked()
    const big = facts({ distance: 9000, perfects: 99, walls: 99, nears: 99, maxChain: 99, dashes: 0, enemies: 99, maxSpeed: 30, difficulty: 'hard', daily: true })
    const dashy = { ...big, dashes: 99 }
    let day = '2026-09-28'
    for (let i = 0; i < 3; i++) {
      ensureContracts(meta, day, false)
      settleContracts(meta, dashy, day)
      const out = settleContracts(meta, big, day)
      expect(meta.contracts.list.every((c) => c.done), day).toBe(true)
      expect(out.sweep || meta.contracts.lastSweep === day).toBe(true)
      day = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
    }
    expect(meta.contracts.streak).toBe(3)
    expect(liveStreak(meta.contracts, '2026-10-01')).toBe(3)
    expect(liveStreak(meta.contracts, '2026-10-03')).toBe(0)
    const echoes = meta.echoes
    expect(settleContracts(meta, big, '2026-09-30').echoes).toBe(0)
    expect(meta.echoes).toBe(echoes)
  })

  it('offers only contracts the pool defines', () => {
    const meta = unlocked()
    ensureContracts(meta, '2026-01-02', true)
    for (const c of meta.contracts.list) expect(CONTRACTS.some((d) => d.id === c.id)).toBe(true)
  })

  it('walks back a day across month edges', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
  })
})

describe('committing a run', () => {
  it('pays echoes and XP, feeds mastery, and reports a rank-up', () => {
    const meta = defaultMeta()
    const sim = createRun(defaultConfig({ seed: 5, tutorial: false }))
    for (let i = 0; i < 120 * 20 && !sim.dead; i++) {
      if (sim.choice?.cards[0]) resolveChoice(sim, sim.choice.cards[0].id)
      fixedStep(sim, autopilot(sim))
    }
    sim.distance = Math.max(sim.distance, 1400)
    const summary = commitRun(meta, sim, false)
    expect(summary.xp).toBeGreaterThan(0)
    expect(meta.xp).toBe(summary.xp)
    expect(summary.rankAfter.rank).toBeGreaterThan(1)
    expect(summary.rankLines.length).toBe(summary.rankAfter.rank - 1)
    expect(meta.echoes).toBe(summary.echoes)
    expect(summary.echoParts.reduce((n, p) => n + p.value, 0)).toBe(summary.echoes)
    expect(meta.coreMeters.balanced).toBe(Math.floor(sim.distance))
    // The run that unlocked contracts neither deals nor clears them; the next one does.
    expect(summary.contracts).toHaveLength(0)
    expect(meta.contracts.list).toHaveLength(0)
    commitRun(meta, sim, false)
    expect(meta.contracts.list).toHaveLength(3)
  })
})

describe('save migration', () => {
  it('keeps paid version 1 challenges paid and converts past play to rank', () => {
    const v1 = { ...defaultMeta(), version: 1, bestDistance: 2400, lifetime: { ...defaultMeta().lifetime, distance: 20000, perfects: 60 }, challenges: { d500: { progress: 2400, claimed: true }, d2000: { progress: 2400, claimed: true }, walls: { progress: 4, claimed: false } } }
    const store = new Map([['infinite-bounce-v1', JSON.stringify(v1)]])
    const prev = (globalThis as { localStorage?: unknown }).localStorage
    ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => {} }
    try {
      const meta = loadMeta()
      expect(meta.version).toBe(2)
      expect(meta.challenges.d500).toEqual({ progress: 2400, tier: 3 })
      expect(meta.challenges.walls).toEqual({ progress: 4, tier: 0 })
      expect(rankOf(meta.xp).rank).toBeGreaterThan(1)
      expect(meta.rankClaimed).toBe(rankOf(meta.xp).rank)
    } finally {
      ;(globalThis as { localStorage?: unknown }).localStorage = prev
    }
  })
})

describe('workshop tuning', () => {
  it('gates Mk II behind rank and scales only the upside', () => {
    const meta = defaultMeta()
    meta.echoes = 500
    buy(meta, 'module', 'brake')
    expect(tuneModule(meta, 'brake')).toBe(false)
    meta.xp = 1e5
    expect(tuneModule(meta, 'brake')).toBe(true)
    const mk1 = computeMods('balanced', ['brake'], [], 'normal', 'none')
    const mk2 = computeMods('balanced', ['brake'], [], 'normal', 'none', { brake: 2 })
    expect(mk2.brake).toBeGreaterThan(mk1.brake)
    expect(mk2.maxVx).toBe(mk1.maxVx)
  })

  it('builds the third slot only at rank', () => {
    const meta = defaultMeta()
    meta.echoes = 500
    expect(buy(meta, 'slot', '')).toBe(true)
    expect(buy(meta, 'slot', '')).toBe(false)
    meta.xp = 1e5
    expect(buy(meta, 'slot', '')).toBe(true)
    expect(meta.slots).toBe(3)
    expect(buy(meta, 'slot', '')).toBe(false)
  })
})
