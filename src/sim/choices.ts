import { UPGRADES } from '../content/catalog'
import { computeMods } from './loadout'
import type { BiomeId, Choice, Sim } from './types'
import { BIOME_COPY } from '../content/catalog'
import { ensureChunks } from './generator'

export function rollUpgradeChoice(sim: Sim): Choice {
  const owned = new Set(sim.runUpgradeIds)
  let pool = UPGRADES.filter((u) => !owned.has(u.id))
  if (sim.config.mutator === 'nodash') {
    pool = pool.filter((u) => u.id !== 'dash2' && u.id !== 'dashfast' && u.id !== 'phase')
  }
  if (sim.config.mutator === 'glass') pool = pool.filter((u) => u.id !== 'barrier')
  const cards: Choice['cards'] = []
  const bag = [...pool]
  while (cards.length < 3 && bag.length) {
    const i = Math.floor(sim.runRng.next() * bag.length)
    const u = bag.splice(i, 1)[0]
    cards.push({ id: u.id, kicker: u.kicker, title: u.title, body: u.body, tone: u.tone })
  }
  return {
    kind: 'upgrade',
    title: 'Choose how you bounce',
    subtitle: 'Every option changes the line. None of them are a flat bonus.',
    cards,
  }
}

export function biomeChoice(sim: Sim, options: readonly BiomeId[]): Choice {
  return {
    kind: 'biome',
    title: 'The road divides',
    subtitle: 'Pick the next reach. You can stay.',
    cards: options.map((id) => ({
      id,
      kicker: id === sim.biome ? 'Stay' : 'Enter',
      title: BIOME_COPY[id].name,
      body: BIOME_COPY[id].line,
      tone: 'biome',
    })),
  }
}

export function resolveChoice(sim: Sim, cardId: string) {
  const choice = sim.choice
  if (!choice) return
  if (choice.kind === 'upgrade') {
    if (!sim.runUpgradeIds.includes(cardId)) sim.runUpgradeIds.push(cardId)
    if (cardId === 'barrier') sim.shield = Math.min(3, sim.shield + 1)
    if (cardId === 'echo') sim.echoes += 4
    if (cardId === 'breath') sim.relief += 3
    sim.mods = computeMods(
      sim.config.core,
      sim.config.modules,
      sim.runUpgradeIds,
      sim.config.difficulty,
      sim.config.mutator,
    )
    if (sim.dashCharges > sim.mods.dashCharges) sim.dashCharges = sim.mods.dashCharges
    else if (cardId === 'dash2') sim.dashCharges = Math.min(sim.mods.dashCharges, sim.dashCharges + 1)
    sim.choice = null
    return
  }
  const biome = cardId as BiomeId
  sim.biome = biome
  if (!sim.visited.includes(biome)) sim.visited.push(biome)
  sim.pendingFork = null
  sim.choice = null
  sim.events.push({ type: 'biome', biome })
  sim.events.push({ type: 'banner', text: BIOME_COPY[biome].name, sub: BIOME_COPY[biome].enter })
  ensureChunks(sim)
}
