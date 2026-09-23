import { BIOME_COPY, CHALLENGES, CORES, DIFFICULTIES, MODULES, MUTATORS, TRAILS } from '../content/catalog'
import { unlockedBiomes } from '../content/world'
import { difficultyUnlocked, loreLines, mutatorsUnlocked, type Meta, type Summary } from '../game/save'
import type { BiomeId, Choice } from '../sim/types'

export interface HudModel {
  visible: boolean
  distance: string
  score: string
  chain: string
  hot: boolean
  speed: string
  state: string
  meter: number
  dash: string
  dashLabel: string
  shield: string
  biome: string
  practice: boolean
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

export class Shell {
  private panel: HTMLElement
  private hudRoot: HTMLElement
  private bannerEl: HTMLElement
  private bannerSub: HTMLElement
  private live: HTMLElement
  private touch: HTMLElement
  private dist: HTMLElement
  private score: HTMLElement
  private chain: HTMLElement
  private speed: HTMLElement
  private state: HTMLElement
  private meter: HTMLElement
  private dash: HTMLElement
  private shield: HTMLElement
  private biome: HTMLElement
  private practice: HTMLElement

  constructor(
    root: HTMLElement,
    private emit: (action: string, el: HTMLElement) => void,
  ) {
    root.innerHTML = `
      <div id="hud" hidden>
        <div class="hud-top">
          <div>
            <p class="kicker" id="hud-biome"></p>
            <p class="dist" id="hud-dist">0</p>
          </div>
          <div class="hud-mid">
            <p class="kicker">Score</p>
            <p class="score" id="hud-score">0</p>
            <p class="chain" id="hud-chain">0</p>
          </div>
          <div class="hud-right">
            <p class="kicker">Speed</p>
            <p class="speed" id="hud-speed">0</p>
            <div class="meter" aria-hidden="true"><span id="hud-meter"></span></div>
          </div>
        </div>
        <div class="hud-bottom">
          <p id="hud-state">Air</p>
          <p id="hud-dash" aria-live="polite"></p>
          <p id="hud-shield"></p>
          <p id="hud-practice" hidden>Practice</p>
        </div>
      </div>
      <div id="banner" aria-hidden="true"><p id="banner-title"></p><p id="banner-sub"></p></div>
      <div id="panel"></div>
      <div id="touch" data-touch hidden>
        <button type="button" id="hold-brake" data-touch>Brake</button>
        <button type="button" id="tap-dash" data-touch>Dash</button>
      </div>
      <div id="live" class="sr" aria-live="assertive"></div>
    `
    this.panel = root.querySelector('#panel')!
    this.hudRoot = root.querySelector('#hud')!
    this.bannerEl = root.querySelector('#banner-title')!
    this.bannerSub = root.querySelector('#banner-sub')!
    this.live = root.querySelector('#live')!
    this.touch = root.querySelector('#touch')!
    this.dist = root.querySelector('#hud-dist')!
    this.score = root.querySelector('#hud-score')!
    this.chain = root.querySelector('#hud-chain')!
    this.speed = root.querySelector('#hud-speed')!
    this.state = root.querySelector('#hud-state')!
    this.meter = root.querySelector('#hud-meter')!
    this.dash = root.querySelector('#hud-dash')!
    this.shield = root.querySelector('#hud-shield')!
    this.biome = root.querySelector('#hud-biome')!
    this.practice = root.querySelector('#hud-practice')!

    root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null
      if (!el || el.hasAttribute('disabled')) return
      this.emit(el.dataset.action ?? '', el)
    })
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLElement
      if (el.dataset.setting) this.emit('setting', el)
    })
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLElement
      if (el.dataset.setting) this.emit('setting', el)
    })
  }

  bindTouch(onBrake: (down: boolean) => void, onDash: () => void) {
    const brake = this.touch.querySelector('#hold-brake') as HTMLButtonElement
    const dash = this.touch.querySelector('#tap-dash') as HTMLButtonElement
    const down = (e: PointerEvent) => {
      e.preventDefault()
      onBrake(true)
      brake.setPointerCapture(e.pointerId)
    }
    brake.addEventListener('pointerdown', down)
    brake.addEventListener('pointerup', () => onBrake(false))
    brake.addEventListener('pointercancel', () => onBrake(false))
    brake.addEventListener('lostpointercapture', () => onBrake(false))
    dash.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      onDash()
    })
  }

  hud(m: HudModel) {
    this.hudRoot.hidden = !m.visible
    this.dist.textContent = m.distance
    this.score.textContent = m.score
    this.chain.textContent = m.chain
    this.chain.classList.toggle('hot', m.hot)
    this.speed.textContent = m.speed
    this.state.textContent = m.state
    this.meter.style.width = `${Math.round(m.meter * 100)}%`
    this.dash.textContent = m.dash
    this.dash.setAttribute('aria-label', m.dashLabel)
    this.shield.textContent = m.shield
    this.biome.textContent = m.biome
    this.practice.hidden = !m.practice
  }

  banner(title: string, sub = '') {
    this.bannerEl.textContent = title
    this.bannerSub.textContent = sub
    this.bannerEl.parentElement?.classList.toggle('show', title.length > 0)
  }

  setTouch(on: boolean) {
    this.touch.hidden = !on
  }

  showTitle(meta: Meta) {
    const diffs = DIFFICULTIES.filter((d) => difficultyUnlocked(meta, d.id))
    const mutators = mutatorsUnlocked(meta) ? MUTATORS : MUTATORS.filter((m) => m.id === 'none')
    const best = meta.bestDistance > 0 ? `${Math.floor(meta.bestDistance).toLocaleString('en-US')} m best` : 'No record yet'
    const core = CORES.find((c) => c.id === meta.equipped.core)
    this.panel.innerHTML = `
      <section class="sheet title-sheet">
        <p class="eyebrow">A ball, a road, a promise</p>
        <h1><em>infinite</em> <span>Bounce</span></h1>
        <p class="lede">Steer the bounce. Spend the speed. The safe road is always there — the gold trim is a wager.</p>
        <p class="best">${esc(best)} · ${meta.echoes} echoes</p>
        <div class="row">
          <label>Pace
            <select data-setting="difficulty">${diffs.map((d) => `<option value="${d.id}" ${d.id === meta.lastDifficulty ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
          </label>
          <label>Mutator
            <select data-setting="mutator" ${mutators.length < 2 ? 'disabled' : ''}>${mutators.map((m) => `<option value="${m.id}" ${m.id === meta.lastMutator ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
          </label>
        </div>
        <p class="coreline">${esc(core?.name ?? 'Balanced')} · ${esc(core?.epithet ?? '')}</p>
        <button type="button" class="primary" data-action="play">Play</button>
        <div class="row wrap">
          <button type="button" data-action="daily">Today’s course</button>
          <button type="button" data-action="practice">Practice</button>
        </div>
        <div class="row wrap quiet">
          <button type="button" data-action="workshop">Workshop</button>
          <button type="button" data-action="challenges">Challenges</button>
          <button type="button" data-action="map">Paths</button>
          <button type="button" data-action="settings">Settings</button>
        </div>
        <p class="hint">A / D steer · S brake · Space dash · drag to lean</p>
      </section>`
    this.say('')
    this.focus('[data-action="play"]')
  }

  showPause() {
    this.panel.innerHTML = `
      <section class="sheet">
        <p class="eyebrow">Paused</p>
        <h2>The ball is waiting.</h2>
        <button type="button" class="primary" data-action="resume">Resume</button>
        <button type="button" data-action="restart">Restart</button>
        <button type="button" data-action="settings">Settings</button>
        <button type="button" data-action="title">End run</button>
      </section>`
    this.focus('[data-action="resume"]')
  }

  showChoice(choice: Choice) {
    this.panel.innerHTML = `
      <section class="sheet choice">
        <p class="eyebrow">${esc(choice.kind === 'biome' ? 'Fork' : 'Offer')}</p>
        <h2>${esc(choice.title)}</h2>
        <p class="lede">${esc(choice.subtitle)}</p>
        <div class="cards">
          ${choice.cards
            .map(
              (c, i) => `<button type="button" class="card tone-${esc(c.tone)}" data-action="pick" data-id="${esc(c.id)}">
                <span class="kicker">${i + 1} · ${esc(c.kicker)}</span>
                <strong>${esc(c.title)}</strong>
                <span>${esc(c.body)}</span>
              </button>`,
            )
            .join('')}
        </div>
      </section>`
    this.say(choice.title)
    this.focus('.card')
  }

  showResults(summary: Summary) {
    this.panel.innerHTML = `
      <section class="sheet">
        <p class="eyebrow">${esc(summary.deathTitle)}</p>
        <h2>${esc(summary.deathLine)}</h2>
        <dl class="stats">
          <div><dt>Distance</dt><dd>${summary.distance.toLocaleString('en-US', { maximumFractionDigits: 0 })} m</dd></div>
          <div><dt>Score</dt><dd>${summary.score.toLocaleString('en-US')}</dd></div>
          <div><dt>Flow</dt><dd>${summary.chain}</dd></div>
          <div><dt>Speed</dt><dd>${summary.speed.toFixed(1)}</dd></div>
          <div><dt>Echoes</dt><dd>+${summary.echoes}</dd></div>
        </dl>
        ${summary.record ? '<p class="record">New distance</p>' : ''}
        ${summary.gift ? `<p class="gift">${esc(summary.gift)} is in the workshop.</p>` : ''}
        ${summary.newChallenges.length ? `<p class="gift">${summary.newChallenges.map((c) => `Challenge · ${esc(c)}`).join(' · ')}</p>` : ''}
        <ul class="goals">${summary.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
        <button type="button" class="primary" data-action="again">Play again</button>
        <div class="row wrap quiet">
          <button type="button" data-action="workshop">Workshop</button>
          <button type="button" data-action="title">Title</button>
        </div>
      </section>`
    this.say(`${summary.deathTitle}. ${Math.floor(summary.distance)} meters.`)
    this.focus('[data-action="again"]')
  }

  showWorkshop(meta: Meta) {
    const coreCards = CORES.map((c) => {
      const owned = meta.cores.includes(c.id)
      const on = meta.equipped.core === c.id
      return `<article class="item ${on ? 'on' : ''}">
        <header><strong>${esc(c.name)}</strong><span>${esc(c.epithet)}</span></header>
        <p>${esc(c.body)}</p>
        ${owned ? `<button type="button" data-action="equip-core" data-id="${c.id}">${on ? 'Equipped' : 'Equip'}</button>` : `<button type="button" data-action="buy" data-kind="core" data-id="${c.id}" ${meta.echoes < c.cost ? 'disabled' : ''}>Unlock · ${c.cost}</button>`}
      </article>`
    }).join('')
    const mods = MODULES.map((m) => {
      const owned = meta.modules.includes(m.id)
      const on = meta.equipped.modules.includes(m.id)
      return `<article class="item ${on ? 'on' : ''}">
        <header><strong>${esc(m.name)}</strong><span>${on ? 'Slotted' : owned ? 'Owned' : `${m.cost} echoes`}</span></header>
        <p>${esc(m.body)}</p>
        ${owned ? `<button type="button" data-action="equip-module" data-id="${m.id}">${on ? 'Remove' : 'Slot'}</button>` : `<button type="button" data-action="buy" data-kind="module" data-id="${m.id}" ${meta.echoes < m.cost ? 'disabled' : ''}>Unlock · ${m.cost}</button>`}
      </article>`
    }).join('')
    const trails = TRAILS.map((t) => {
      const owned = meta.trails.includes(t.id)
      const on = meta.equipped.trail === t.id
      return `<button type="button" class="swatch ${on ? 'on' : ''}" style="--swatch:${t.color}" ${owned ? `data-action="equip-trail" data-id="${t.id}"` : `data-action="buy" data-kind="trail" data-id="${t.id}"`} ${!owned && meta.echoes < t.cost ? 'disabled' : ''}>
        <i></i>${esc(t.name)}${owned ? '' : ` · ${t.cost}`}
      </button>`
    }).join('')
    const slot = meta.slots >= 2 ? '<p>Both module slots are open.</p>' : `<button type="button" data-action="buy" data-kind="slot" ${meta.echoes < 18 ? 'disabled' : ''}>Second slot · 18</button>`
    const grav = meta.gravity ? '<p>Gravity pulse is learned. Press F.</p>' : `<button type="button" data-action="buy" data-kind="gravity" ${meta.echoes < 36 ? 'disabled' : ''}>Learn gravity pulse · 36</button>`
    this.panel.innerHTML = `
      <section class="sheet wide">
        <p class="eyebrow">Workshop · ${meta.echoes} echoes</p>
        <h2>This is your ball.</h2>
        <p class="lede">Cores and modules change the line. Trails do not. One module slot is free; the second is earned.</p>
        <h3>Cores</h3>
        <div class="items">${coreCards}</div>
        <h3>Modules · ${meta.equipped.modules.length}/${meta.slots}</h3>
        <div class="items">${mods}</div>
        ${slot}
        <h3>Gravity</h3>
        ${grav}
        <h3>Trails</h3>
        <div class="swatches">${trails}</div>
        <button type="button" data-action="back">Back</button>
      </section>`
    this.focus('[data-action="back"]')
  }

  showChallenges(meta: Meta) {
    const rows = CHALLENGES.map((c) => {
      const prog = meta.challenges[c.id]
      const value = Math.min(c.goal, Math.floor(prog?.progress ?? 0))
      const done = !!prog?.claimed || value >= c.goal
      return `<li class="${done ? 'done' : ''}">
        <div><strong>${esc(c.title)}</strong><span>${value}/${c.goal}</span></div>
        <p>${esc(c.body)} · ${c.reward} echoes</p>
      </li>`
    }).join('')
    const records = meta.records
      .map((r) => `<li>${Math.floor(r.distance).toLocaleString('en-US')} m · ${r.score.toLocaleString('en-US')} · ${r.difficulty}</li>`)
      .join('')
    const lore = loreLines(meta)
    this.panel.innerHTML = `
      <section class="sheet wide">
        <p class="eyebrow">Challenges</p>
        <h2>Unfinished on purpose.</h2>
        <ul class="challenges">${rows}</ul>
        <h3>On this device</h3>
        ${records ? `<ul class="records">${records}</ul>` : '<p>Records appear after a run.</p>'}
        ${lore.length ? `<h3>Fragments</h3><ul class="records">${lore.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        <button type="button" data-action="back">Back</button>
      </section>`
    this.focus('[data-action="back"]')
  }

  showMap(meta: Meta) {
    const open = new Set(
      unlockedBiomes({
        distance: meta.bestDistance,
        perfects: meta.lifetime.perfects,
        walls: meta.lifetime.walls,
        runWalls: 0,
        chain: meta.bestChain,
        fragments: meta.fragments.length,
        visited: meta.visited,
        gravity: meta.gravity,
      }),
    )
    const skill = (name: string, on: boolean, note: string) =>
      `<li class="${on ? 'on' : ''}"><strong>${esc(name)}</strong><span>${esc(note)}</span></li>`
    const biome = (id: BiomeId) => {
      const copy = BIOME_COPY[id]
      const state = meta.visited.includes(id) ? 'Visited' : open.has(id) ? 'Open' : 'Closed'
      return `<li class="${open.has(id) ? 'on' : ''}"><strong>${esc(copy.name)}</strong><span>${state} · ${esc(copy.line)}</span></li>`
    }
    this.panel.innerHTML = `
      <section class="sheet wide">
        <p class="eyebrow">Paths</p>
        <h2>Strengths can diverge.</h2>
        <div class="cols">
          <div>
            <h3>Hands</h3>
            <ul class="tree">
              ${skill('Steering', true, 'Always yours')}
              ${skill('Landings', meta.lifetime.perfects > 0, 'Perfects live in the middle')}
              ${skill('Momentum', meta.bestDistance >= 200, 'Speed is a risk')}
              ${skill('Dash', meta.lifetime.dashes >= 8, 'A burst, not a walk')}
            </ul>
          </div>
          <div>
            <h3>Lines</h3>
            <ul class="tree">
              ${skill('Walls', meta.lifetime.walls >= 6, 'A rebound is a route')}
              ${skill('Enemies', meta.lifetime.enemies >= 4, 'Steps, until they are not')}
              ${skill('Gravity', meta.gravity || open.has('void'), 'Down becomes optional')}
              ${skill('Flow', meta.bestChain >= 12, 'Skilled actions, chained')}
            </ul>
          </div>
        </div>
        <h3>Reaches</h3>
        <ul class="tree">${(Object.keys(BIOME_COPY) as BiomeId[]).map(biome).join('')}</ul>
        <button type="button" data-action="back">Back</button>
      </section>`
    this.focus('[data-action="back"]')
  }

  showSettings(meta: Meta) {
    const s = meta.settings
    const check = (key: string, label: string, on: boolean) =>
      `<label class="check"><input type="checkbox" data-setting="${key}" ${on ? 'checked' : ''}/> ${label}</label>`
    this.panel.innerHTML = `
      <section class="sheet">
        <p class="eyebrow">Settings</p>
        <h2>Make it readable.</h2>
        <label>Music <input type="range" min="0" max="1" step="0.01" data-setting="music" value="${s.music}"/></label>
        <label>Effects <input type="range" min="0" max="1" step="0.01" data-setting="sfx" value="${s.sfx}"/></label>
        <label>Shake <input type="range" min="0" max="1" step="0.01" data-setting="shake" value="${s.shake}"/></label>
        <label>Flash <input type="range" min="0" max="1" step="0.01" data-setting="flash" value="${s.flash}"/></label>
        <label>Interface size <input type="range" min="0.85" max="1.35" step="0.05" data-setting="uiScale" value="${s.uiScale}"/></label>
        ${check('reducedMotion', 'Reduced motion', s.reducedMotion)}
        ${check('colorblind', 'Colorblind-safe hazards', s.colorblind)}
        ${check('haptics', 'Haptics', s.haptics)}
        ${check('ghost', 'Personal-best ghost on the same seed', s.ghost)}
        ${check('telemetry', 'Keep anonymous notes on this device', s.telemetry)}
        <label>Touch controls
          <select data-setting="touch">
            <option value="auto" ${s.touch === 'auto' ? 'selected' : ''}>Automatic</option>
            <option value="on" ${s.touch === 'on' ? 'selected' : ''}>Always</option>
            <option value="off" ${s.touch === 'off' ? 'selected' : ''}>Hidden</option>
          </select>
        </label>
        <label>Pointer
          <select data-setting="pointerMode">
            <option value="drag" ${s.pointerMode === 'drag' ? 'selected' : ''}>Drag to steer</option>
            <option value="zones" ${s.pointerMode === 'zones' ? 'selected' : ''}>Left and right zones</option>
          </select>
        </label>
        <p class="hint">Notes stay in this browser. Nothing is sent.</p>
        <button type="button" data-action="back">Back</button>
      </section>`
    this.focus('[data-action="back"]')
  }

  hidePanel() {
    this.panel.innerHTML = ''
  }

  private say(text: string) {
    this.live.textContent = text
  }

  private focus(sel: string) {
    queueMicrotask(() => {
      const el = this.panel.querySelector(sel) as HTMLElement | null
      el?.focus()
    })
  }
}
