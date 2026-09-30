import { BIOME_COPY, CORES, DIFFICULTIES, MODULES, MUTATORS, TRAILS } from '../content/catalog'
import {
  CHALLENGES,
  CONTRACTS_RANK,
  MASTERY_ECHO_BONUS,
  MAX_MODULE_LEVEL,
  RANK_REWARDS,
  TUNING_RANK,
  challengeBody,
  rankTitle,
  streakBonus,
  tierName,
  tuneCost,
} from '../content/progression'
import { unlockedBiomes } from '../content/world'
import { contractLabel, liveStreak, masteryOf, moduleLevel, nextSlot, rankOf, trailLocked, tuneBlock } from '../game/progress'
import { difficultyUnlocked, loreLines, mutatorsUnlocked, todayKey, type Meta, type Summary } from '../game/save'
import type { BiomeId, Choice } from '../sim/types'

export interface HudModel {
  visible: boolean
  distance: number
  best: number
  score: number
  chain: number
  /** Share of the flow grace window still left, 0..1. */
  flowLeft: number
  hot: boolean
  speed: string
  state: string
  critical: boolean
  meter: number
  dashMax: number
  dashReady: number
  /** Recharge progress of the next dash charge, 0..1. */
  dashCharge: number
  shield: number
  biome: string
  practice: boolean
}

export type BannerKind = 'default' | 'biome' | 'lesson' | 'flow' | 'death'

const SEGMENTS = 12
const RING = 2 * Math.PI * 17

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function fmt(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString('en-US')
}

const MK = ['', 'Mk I', 'Mk II', 'Mk III']

function pct(share: number): string {
  return `${(Math.max(0, Math.min(1, share)) * 100).toFixed(1)}%`
}

/** Rank badge with a bar through the current rank. `from` animates the fill from an earlier share. */
function rankBar(rank: number, into: number, need: number, from = -1): string {
  const start = from >= 0 ? `--from:${pct(from)};` : ''
  return `<div class="rank">
    <b class="rank-no" aria-label="Rank ${rank}">${rank}</b>
    <div class="rank-body">
      <p><strong>${esc(rankTitle(rank))}</strong><span>${fmt(into)} / ${fmt(need)} XP</span></p>
      <div class="xpbar ${from >= 0 ? 'grow' : ''}"><span style="${start}--to:${pct(into / need)}"></span></div>
    </div>
  </div>`
}

function contractList(meta: Meta, compact: boolean): string {
  const day = todayKey()
  const board = meta.contracts
  if (rankOf(meta.xp).rank < CONTRACTS_RANK) return `<p class="note">Daily contracts open at rank ${CONTRACTS_RANK}.</p>`
  if (board.day !== day || !board.list.length) return '<p class="note">Today’s contracts are dealt when you next play.</p>'
  const streak = liveStreak(board, day)
  const rows = board.list
    .map((c) => {
      const share = Math.min(1, c.progress / c.goal)
      return `<li class="${c.done ? 'done' : ''}">
        <div><strong>${esc(contractLabel(c))}</strong><span>${c.done ? 'Done' : compact ? '' : `${fmt(Math.min(c.progress, c.goal))}/${fmt(c.goal)}`}</span></div>
        ${compact ? '' : `<div class="bar"><span style="width:${pct(share)}"></span></div>`}
      </li>`
    })
    .join('')
  const sweep = board.lastSweep === day
  const foot = sweep
    ? `Board cleared · ${streak}-day streak`
    : `Clear all three for a bonus${streak ? ` · streak ${streak}, next +${streakBonus(streak + 1)}` : ''}`
  return `<ul class="challenges contracts ${compact ? 'compact' : ''}">${rows}</ul><p class="note">${esc(foot)}</p>`
}

function reducedMotion(): boolean {
  return document.body.classList.contains('reduced')
}

export class Shell {
  private panel: HTMLElement
  private hudRoot: HTMLElement
  private bannerRoot: HTMLElement
  private bannerEl: HTMLElement
  private bannerSub: HTMLElement
  private live: HTMLElement
  private touch: HTMLElement
  private dist: HTMLElement
  private bestWrap: HTMLElement
  private bestFill: HTMLElement
  private bestLabel: HTMLElement
  private score: HTMLElement
  private flow: HTMLElement
  private flowRing: SVGCircleElement
  private chain: HTMLElement
  private speed: HTMLElement
  private speedWrap: HTMLElement
  private segs: HTMLElement[]
  private state: HTMLElement
  private dash: HTMLElement
  private shield: HTMLElement
  private biome: HTMLElement
  private practice: HTMLElement
  private shownScore = 0
  private targetScore = 0
  private last = {
    distance: '',
    score: '',
    chain: -1,
    biome: '',
    lit: -1,
    dash: '',
    shield: -1,
    state: '',
    speed: '',
    best: '',
  }

  constructor(
    root: HTMLElement,
    private emit: (action: string, el: HTMLElement) => void,
  ) {
    const segs = Array.from({ length: SEGMENTS }, (_, i) => `<i style="--i:${i}"></i>`).join('')
    root.innerHTML = `
      <div id="hud" hidden>
        <div class="hud-top">
          <div class="hud-left">
            <p class="pill" id="hud-biome"></p>
            <p class="dist"><span id="hud-dist">0</span><small>m</small></p>
            <div class="best" id="hud-best" hidden>
              <div class="best-track"><span id="hud-best-fill"></span></div>
              <p id="hud-best-label"></p>
            </div>
          </div>
          <div class="hud-mid">
            <p class="score" id="hud-score">0</p>
            <div class="flow" id="hud-flow">
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <circle class="flow-track" cx="20" cy="20" r="17"></circle>
                <circle class="flow-fill" id="hud-flow-ring" cx="20" cy="20" r="17" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="${RING.toFixed(2)}"></circle>
              </svg>
              <b id="hud-chain">0</b>
              <span>flow</span>
            </div>
          </div>
          <div class="hud-right" id="hud-speed-wrap">
            <p class="kicker">Speed</p>
            <p class="speed" id="hud-speed">0</p>
            <div class="segs" aria-hidden="true">${segs}</div>
          </div>
        </div>
        <div class="hud-bottom">
          <p class="state" id="hud-state">Air</p>
          <div class="dash" id="hud-dash" aria-live="polite"></div>
          <div class="shields" id="hud-shield"></div>
          <p class="pill" id="hud-practice" hidden>Practice</p>
        </div>
      </div>
      <div id="banner" aria-hidden="true"><p id="banner-title"></p><p id="banner-sub"></p></div>
      <div id="panel"></div>
      <div id="touch" data-touch hidden>
        <button type="button" id="hold-brake" data-touch><span class="ico">⏸</span>Brake</button>
        <button type="button" id="tap-dash" data-touch><span class="ico">⚡</span>Dash</button>
      </div>
      <div id="live" class="sr" aria-live="assertive"></div>
    `
    const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T
    this.panel = q('#panel')
    this.hudRoot = q('#hud')
    this.bannerRoot = q('#banner')
    this.bannerEl = q('#banner-title')
    this.bannerSub = q('#banner-sub')
    this.live = q('#live')
    this.touch = q('#touch')
    this.dist = q('#hud-dist')
    this.bestWrap = q('#hud-best')
    this.bestFill = q('#hud-best-fill')
    this.bestLabel = q('#hud-best-label')
    this.score = q('#hud-score')
    this.flow = q('#hud-flow')
    this.flowRing = q<SVGCircleElement>('#hud-flow-ring')
    this.chain = q('#hud-chain')
    this.speed = q('#hud-speed')
    this.speedWrap = q('#hud-speed-wrap')
    this.segs = Array.from(root.querySelectorAll('.segs i')) as HTMLElement[]
    this.state = q('#hud-state')
    this.dash = q('#hud-dash')
    this.shield = q('#hud-shield')
    this.biome = q('#hud-biome')
    this.practice = q('#hud-practice')

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
      brake.classList.add('down')
      brake.setPointerCapture(e.pointerId)
    }
    const up = () => {
      onBrake(false)
      brake.classList.remove('down')
    }
    brake.addEventListener('pointerdown', down)
    brake.addEventListener('pointerup', up)
    brake.addEventListener('pointercancel', up)
    brake.addEventListener('lostpointercapture', up)
    dash.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      onDash()
      this.pop(dash, 1.12)
    })
  }

  hud(m: HudModel) {
    this.hudRoot.hidden = !m.visible
    if (!m.visible) {
      this.shownScore = 0
      this.targetScore = 0
      return
    }
    const distance = fmt(m.distance)
    if (distance !== this.last.distance) {
      this.last.distance = distance
      this.dist.textContent = distance
    }

    // The score rolls toward its target instead of jumping; big awards give it a pop.
    if (m.score - this.targetScore >= 20) this.pop(this.score, 1.1)
    this.targetScore = m.score
    this.shownScore += (m.score - this.shownScore) * 0.22
    if (Math.abs(m.score - this.shownScore) < 1) this.shownScore = m.score
    const score = fmt(this.shownScore)
    if (score !== this.last.score) {
      this.last.score = score
      this.score.textContent = score
    }

    if (m.chain !== this.last.chain) {
      if (m.chain > this.last.chain && m.chain > 0) this.pop(this.flow, m.hot ? 1.3 : 1.18)
      this.last.chain = m.chain
      this.chain.textContent = String(m.chain)
    }
    this.flow.classList.toggle('on', m.chain > 0)
    this.flow.classList.toggle('hot', m.hot)
    this.flowRing.style.strokeDashoffset = (RING * (1 - m.flowLeft)).toFixed(2)

    if (m.speed !== this.last.speed) {
      this.last.speed = m.speed
      this.speed.textContent = m.speed
    }
    const lit = Math.round(m.meter * SEGMENTS)
    if (lit !== this.last.lit) {
      this.last.lit = lit
      this.segs.forEach((s, i) => s.classList.toggle('lit', i < lit))
    }
    this.speedWrap.classList.toggle('critical', m.critical)

    if (m.state !== this.last.state) {
      this.last.state = m.state
      this.state.textContent = m.state
      this.state.dataset.state = m.state
    }

    const dashKey = `${m.dashMax}:${m.dashReady}:${m.dashCharge.toFixed(2)}`
    if (dashKey !== this.last.dash) {
      const gained = m.dashReady > Number(this.last.dash.split(':')[1] ?? m.dashReady)
      this.last.dash = dashKey
      if (m.dashMax <= 0) {
        this.dash.innerHTML = ''
        this.dash.setAttribute('aria-label', 'Dash unavailable')
      } else {
        let pips = ''
        for (let i = 0; i < m.dashMax; i++) {
          const fill = i < m.dashReady ? 1 : i === m.dashReady ? m.dashCharge : 0
          pips += `<i class="${fill >= 1 ? 'ready' : ''}" style="--fill:${(fill * 360).toFixed(0)}deg"></i>`
        }
        this.dash.innerHTML = `${pips}<span>Dash</span>`
        this.dash.setAttribute('aria-label', `${m.dashReady} dash${m.dashReady === 1 ? '' : 'es'} ready`)
        if (gained) this.pop(this.dash, 1.15)
      }
    }

    if (m.shield !== this.last.shield) {
      this.last.shield = m.shield
      this.shield.innerHTML = m.shield > 0 ? `${'<i></i>'.repeat(m.shield)}<span>Shield</span>` : ''
      if (m.shield > 0) this.pop(this.shield, 1.2)
    }

    if (m.biome !== this.last.biome) {
      this.last.biome = m.biome
      this.biome.textContent = m.biome
    }
    this.practice.hidden = !m.practice

    const bestKey = m.best > 40 ? `${Math.floor(m.distance)}:${Math.floor(m.best)}` : ''
    if (bestKey !== this.last.best) {
      this.last.best = bestKey
      this.bestWrap.hidden = !bestKey
      if (bestKey) {
        const past = m.distance >= m.best
        this.bestWrap.classList.toggle('past', past)
        this.bestFill.style.width = `${Math.min(100, (m.distance / m.best) * 100).toFixed(1)}%`
        this.bestLabel.textContent = past ? 'New best' : `${fmt(m.best - m.distance)} m to best`
      }
    }
  }

  banner(title: string, sub = '', kind: BannerKind = 'default') {
    const root = this.bannerRoot
    if (!title) {
      root.classList.remove('show')
      return
    }
    this.bannerEl.textContent = title
    this.bannerSub.textContent = sub
    root.className = `kind-${kind}`
    // Force a reflow so the entrance animation replays for back-to-back banners.
    void root.offsetWidth
    root.classList.add('show')
  }

  setTouch(on: boolean) {
    this.touch.hidden = !on
  }

  showTitle(meta: Meta) {
    const diffs = DIFFICULTIES.filter((d) => difficultyUnlocked(meta, d.id))
    const mutators = mutatorsUnlocked(meta) ? MUTATORS : MUTATORS.filter((m) => m.id === 'none')
    const best = meta.bestDistance > 0 ? `<b>${fmt(meta.bestDistance)} m</b> best` : 'No record yet'
    const core = CORES.find((c) => c.id === meta.equipped.core)
    const rank = rankOf(meta.xp)
    const word = 'Bounce'
      .split('')
      .map((ch, i) => `<span class="ch" style="--i:${i}">${ch}</span>`)
      .join('')
    this.mount(`
      <section class="sheet title-sheet">
        <p class="eyebrow">A ball, a road, a promise</p>
        <h1 aria-label="Infinite Bounce"><em>infinite</em> <span class="word" aria-hidden="true">${word}<i class="logo-ball"></i></span></h1>
        <p class="lede">Steer the bounce. Spend the speed. The safe road is always there — the gold trim is a wager.</p>
        <div class="chips">
          <span class="chip">${best}</span>
          <span class="chip"><i class="dot echo"></i>${meta.echoes} echoes</span>
          <span class="chip"><i class="dot core"></i>${esc(core?.name ?? 'Balanced')} · ${esc(core?.epithet ?? '')}</span>
        </div>
        ${rankBar(rank.rank, rank.into, rank.need)}
        <details class="today" ${meta.contracts.list.some((c) => !c.done) ? 'open' : ''}>
          <summary>Today’s contracts</summary>
          ${contractList(meta, true)}
        </details>
        <div class="row">
          <label>Pace
            <select data-setting="difficulty">${diffs.map((d) => `<option value="${d.id}" ${d.id === meta.lastDifficulty ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
          </label>
          <label>Mutator
            <select data-setting="mutator" ${mutators.length < 2 ? 'disabled' : ''}>${mutators.map((m) => `<option value="${m.id}" ${m.id === meta.lastMutator ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
          </label>
        </div>
        <button type="button" class="primary big" data-action="play">Play <kbd>Space</kbd></button>
        <div class="row wrap">
          <button type="button" data-action="daily">Today’s course</button>
          <button type="button" data-action="practice">Practice</button>
        </div>
        <div class="row wrap quiet">
          <button type="button" data-action="workshop">Workshop</button>
          <button type="button" data-action="challenges">Progress</button>
          <button type="button" data-action="map">Paths</button>
          <button type="button" data-action="settings">Settings</button>
        </div>
        <p class="hint"><kbd>A</kbd><kbd>D</kbd> steer · <kbd>S</kbd> brake · <kbd>Space</kbd> dash · drag to lean</p>
      </section>`, 'title')
    this.say('')
    this.focus('[data-action="play"]')
  }

  showPause() {
    this.mount(`
      <section class="sheet narrow">
        <p class="eyebrow">Paused</p>
        <h2>The ball is waiting.</h2>
        <button type="button" class="primary" data-action="resume">Resume <kbd>Esc</kbd></button>
        <button type="button" data-action="restart">Restart</button>
        <button type="button" data-action="settings">Settings</button>
        <button type="button" class="ghost" data-action="title">End run</button>
      </section>`, 'pause')
    this.focus('[data-action="resume"]')
  }

  showChoice(choice: Choice) {
    this.mount(`
      <section class="sheet choice wide">
        <p class="eyebrow">${esc(choice.kind === 'biome' ? 'Fork in the road' : 'An offer')}</p>
        <h2>${esc(choice.title)}</h2>
        <p class="lede">${esc(choice.subtitle)}</p>
        <div class="cards">
          ${choice.cards
            .map(
              (c, i) => `<button type="button" class="card tone-${esc(c.tone)}" style="--i:${i}" data-action="pick" data-id="${esc(c.id)}">
                <kbd class="key">${i + 1}</kbd>
                <span class="kicker">${esc(c.kicker)}</span>
                <strong>${esc(c.title)}</strong>
                <span class="body">${esc(c.body)}</span>
              </button>`,
            )
            .join('')}
        </div>
      </section>`, 'choice')
    this.say(choice.title)
    this.focus('.card')
  }

  showResults(summary: Summary) {
    const stat = (label: string, value: number, suffix = '', digits = 0, prefix = '') =>
      `<div><dt>${label}</dt><dd data-count="${value}" data-digits="${digits}" data-prefix="${prefix}" data-suffix="${suffix}">${prefix}${value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}${suffix}</dd></div>`
    this.mount(`
      <section class="sheet results">
        <p class="eyebrow">${esc(summary.deathTitle)}</p>
        <h2>${esc(summary.deathLine)}</h2>
        ${summary.record ? '<p class="record"><span>New distance record</span></p>' : ''}
        <dl class="stats">
          ${stat('Distance', Math.floor(summary.distance), ' m')}
          ${stat('Score', Math.floor(summary.score))}
          ${stat('Flow', summary.chain)}
          ${stat('Speed', summary.speed, '', 1)}
          ${stat('Echoes', summary.echoes, '', 0, '+')}
        </dl>
        ${summary.echoParts.length > 1 ? `<p class="parts">${summary.echoParts.map((p) => `${esc(p.label)} <b>+${fmt(p.value)}</b>`).join(' · ')}</p>` : ''}
        <section class="gain">
          ${rankBar(summary.rankAfter.rank, summary.rankAfter.into, summary.rankAfter.need, summary.rankAfter.rank > summary.rankBefore.rank ? 0 : summary.rankBefore.into / summary.rankBefore.need)}
          <p class="parts">+${fmt(summary.xp)} XP${summary.xpParts.length ? ` · ${summary.xpParts.map((p) => `${esc(p.label)} ${fmt(p.value)}`).join(' · ')}` : ''}</p>
          ${summary.rankLines.length ? `<ul class="rankups">${summary.rankLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
          <p class="mastery ${summary.mastery.leveled ? 'up' : ''}">${esc(summary.mastery.core)} mastery ${summary.mastery.level}${summary.mastery.leveled ? ' · level up' : ''}${summary.mastery.next === null ? ' · mastered' : ` · ${fmt(summary.mastery.meters)}/${fmt(summary.mastery.next)} m`}</p>
        </section>
        ${summary.gift ? `<p class="gift">${esc(summary.gift)} is in the workshop.</p>` : ''}
        ${summary.newChallenges.length ? `<p class="gift"><b>Challenges</b> · ${summary.newChallenges.map(esc).join(' · ')}</p>` : ''}
        ${summary.contracts.length ? `<p class="gift"><b>Contracts</b> · ${summary.contracts.map(esc).join(' · ')}</p>` : ''}
        ${summary.goals.length ? `<ul class="goals">${summary.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
        <button type="button" class="primary big" data-action="again">Play again <kbd>Space</kbd></button>
        <div class="row wrap quiet">
          <button type="button" data-action="workshop">Workshop</button>
          <button type="button" data-action="title">Title</button>
        </div>
      </section>`, 'results')
    this.countUp()
    const ranked = summary.rankAfter.rank > summary.rankBefore.rank ? ` Rank ${summary.rankAfter.rank}.` : ''
    this.say(`${summary.deathTitle}. ${Math.floor(summary.distance)} meters. ${summary.xp} XP.${ranked}`)
    this.focus('[data-action="again"]')
  }

  showWorkshop(meta: Meta) {
    const rank = rankOf(meta.xp).rank
    const coreCards = CORES.map((c) => {
      const owned = meta.cores.includes(c.id)
      const on = meta.equipped.core === c.id
      const m = masteryOf(meta, c.id)
      const mastery = owned
        ? `<p class="mastery-line"><span>Mastery ${m.level}${m.level > 1 ? ` · +${Math.round((m.level - 1) * MASTERY_ECHO_BONUS * 100)}% echoes` : ''}</span><span class="bar"><span style="width:${pct(m.share)}"></span></span></p>`
        : ''
      return `<article class="item ${on ? 'on' : ''} ${owned ? '' : 'locked'}">
        <header><strong>${esc(c.name)}</strong><span>${esc(c.epithet)}</span></header>
        <p>${esc(c.body)}</p>
        ${mastery}
        ${owned ? `<button type="button" data-action="equip-core" data-id="${c.id}" ${on ? 'class="equipped"' : ''}>${on ? 'Equipped' : 'Equip'}</button>` : `<button type="button" data-action="buy" data-kind="core" data-id="${c.id}" ${meta.echoes < c.cost ? 'disabled' : ''}>Unlock · ${c.cost}</button>`}
      </article>`
    }).join('')
    const mods = MODULES.map((m) => {
      const owned = meta.modules.includes(m.id)
      const on = meta.equipped.modules.includes(m.id)
      const level = moduleLevel(meta, m.id)
      const block = tuneBlock(meta, m.id)
      const tune =
        owned && level < MAX_MODULE_LEVEL
          ? `<button type="button" data-action="tune" data-id="${m.id}" ${block ? 'disabled' : ''} title="${esc(block ?? '')}">${block?.startsWith('Rank') ? `${MK[level + 1]} at ${block.toLowerCase()}` : `Tune to ${MK[level + 1]} · ${tuneCost(m.cost, level)}`}</button>`
          : ''
      return `<article class="item ${on ? 'on' : ''} ${owned ? '' : 'locked'}">
        <header><strong>${esc(m.name)}${owned ? ` <small class="mk mk-${level}">${MK[level]}</small>` : ''}</strong><span>${on ? 'Slotted' : owned ? 'Owned' : `${m.cost} echoes`}</span></header>
        <p>${esc(m.body)}</p>
        <div class="acts">
          ${owned ? `<button type="button" data-action="equip-module" data-id="${m.id}">${on ? 'Remove' : 'Slot'}</button>` : `<button type="button" data-action="buy" data-kind="module" data-id="${m.id}" ${meta.echoes < m.cost ? 'disabled' : ''}>Unlock · ${m.cost}</button>`}
          ${tune}
        </div>
      </article>`
    }).join('')
    const trails = TRAILS.map((t) => {
      const owned = meta.trails.includes(t.id)
      const on = meta.equipped.trail === t.id
      const gate = trailLocked(meta, t.id)
      if (gate) return `<button type="button" class="swatch" style="--swatch:${t.color}" disabled><i></i>${esc(t.name)} · rank ${gate}</button>`
      return `<button type="button" class="swatch ${on ? 'on' : ''}" style="--swatch:${t.color}" ${owned ? `data-action="equip-trail" data-id="${t.id}"` : `data-action="buy" data-kind="trail" data-id="${t.id}"`} ${!owned && meta.echoes < t.cost ? 'disabled' : ''}>
        <i></i>${esc(t.name)}${owned ? '' : ` · ${t.cost}`}
      </button>`
    }).join('')
    const next = nextSlot(meta)
    const ordinal = ['', 'First', 'Second', 'Third']
    const slot = !next
      ? '<p class="note">Every module slot is built.</p>'
      : rank < next.rank
        ? `<p class="note">The ${ordinal[meta.slots + 1].toLowerCase()} slot can be built at rank ${next.rank}.</p>`
        : `<button type="button" data-action="buy" data-kind="slot" ${meta.echoes < next.cost ? 'disabled' : ''}>${ordinal[meta.slots + 1]} slot · ${next.cost}</button>`
    const bench = rank >= TUNING_RANK[2] ? 'Owned modules can be tuned up to ' + MK[rank >= TUNING_RANK[3] ? 3 : 2] + '. Tuning sharpens the upside only.' : `The tuning bench opens at rank ${TUNING_RANK[2]}.`
    const grav = meta.gravity ? '<p class="note">Gravity pulse is learned. Press <kbd>F</kbd>.</p>' : `<button type="button" data-action="buy" data-kind="gravity" ${meta.echoes < 36 ? 'disabled' : ''}>Learn gravity pulse · 36</button>`
    this.mount(`
      <section class="sheet wide">
        <p class="eyebrow">Workshop · <b class="echoes">${meta.echoes} echoes</b></p>
        <h2>This is your ball.</h2>
        <p class="lede">Cores and modules change the line. Trails do not. Cores grow mastery as you travel with them.</p>
        <h3>Cores</h3>
        <div class="items">${coreCards}</div>
        <h3>Modules · ${meta.equipped.modules.length}/${meta.slots}</h3>
        <p class="note">${esc(bench)}</p>
        <div class="items">${mods}</div>
        ${slot}
        <h3>Gravity</h3>
        ${grav}
        <h3>Trails</h3>
        <div class="swatches">${trails}</div>
        <button type="button" data-action="back">Back</button>
      </section>`, 'workshop')
    this.focus('[data-action="back"]')
  }

  showChallenges(meta: Meta) {
    const rank = rankOf(meta.xp)
    const rows = CHALLENGES.map((c) => {
      const state = meta.challenges[c.id] ?? { progress: 0, tier: 0 }
      const done = state.tier >= c.tiers.length
      const index = Math.min(state.tier, c.tiers.length - 1)
      const tier = c.tiers[index]
      const value = Math.min(tier.goal, Math.floor(state.progress))
      const pips = c.tiers.map((_, i) => `<i class="${i < state.tier ? 'on' : ''}"></i>`).join('')
      return `<li class="${done ? 'done' : ''}">
        <div><strong>${esc(done ? c.title : tierName(c, index))}</strong><span class="pips" aria-label="${state.tier} of ${c.tiers.length} tiers">${pips}</span></div>
        <p>${esc(challengeBody(c, index))} · ${done ? 'complete' : `${fmt(value)}/${fmt(tier.goal)} · ${tier.reward} echoes`}</p>
        <div class="bar"><span style="width:${pct(done ? 1 : value / tier.goal)}"></span></div>
      </li>`
    }).join('')
    const track = RANK_REWARDS.map(
      (r) => `<li class="${r.rank <= rank.rank ? 'on' : ''}"><strong>Rank ${r.rank}</strong><span>${esc(r.label)}</span></li>`,
    ).join('')
    const cleared = CHALLENGES.reduce((n, c) => n + Math.min(c.tiers.length, meta.challenges[c.id]?.tier ?? 0), 0)
    const total = CHALLENGES.reduce((n, c) => n + c.tiers.length, 0)
    const records = meta.records
      .map((r) => `<li>${Math.floor(r.distance).toLocaleString('en-US')} m · ${r.score.toLocaleString('en-US')} · ${r.difficulty}</li>`)
      .join('')
    const lore = loreLines(meta)
    this.mount(`
      <section class="sheet wide">
        <p class="eyebrow">Progress · <b class="echoes">${meta.echoes} echoes</b></p>
        <h2>Unfinished on purpose.</h2>
        ${rankBar(rank.rank, rank.into, rank.need)}
        <p class="note">XP comes from every run: distance, clean landings, lines, and flow. Harder paces and mutators pay more.</p>
        <h3>Today’s contracts</h3>
        ${contractList(meta, false)}
        <h3>Challenges · ${cleared}/${total} tiers</h3>
        <ul class="challenges">${rows}</ul>
        <h3>Rank rewards</h3>
        <ul class="tree">${track}</ul>
        <h3>On this device</h3>
        ${records ? `<ul class="records">${records}</ul>` : '<p class="note">Records appear after a run.</p>'}
        ${lore.length ? `<h3>Fragments</h3><ul class="records">${lore.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        <button type="button" data-action="back">Back</button>
      </section>`, 'challenges')
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
      return `<li class="${open.has(id) ? 'on' : ''} biome-${id}"><strong><i class="dot"></i>${esc(copy.name)}</strong><span>${state} · ${esc(copy.line)}</span></li>`
    }
    this.mount(`
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
        <ul class="tree reaches">${(Object.keys(BIOME_COPY) as BiomeId[]).map(biome).join('')}</ul>
        <button type="button" data-action="back">Back</button>
      </section>`, 'map')
    this.focus('[data-action="back"]')
  }

  showSettings(meta: Meta) {
    const s = meta.settings
    const check = (key: string, label: string, on: boolean) =>
      `<label class="check"><input type="checkbox" data-setting="${key}" ${on ? 'checked' : ''}/><span class="toggle" aria-hidden="true"></span> ${label}</label>`
    const range = (key: string, label: string, value: number, min = 0, max = 1, step = 0.01) =>
      `<label class="range">${label} <input type="range" min="${min}" max="${max}" step="${step}" data-setting="${key}" value="${value}"/></label>`
    this.mount(`
      <section class="sheet">
        <p class="eyebrow">Settings</p>
        <h2>Make it readable.</h2>
        ${range('music', 'Music', s.music)}
        ${range('sfx', 'Effects', s.sfx)}
        ${range('shake', 'Shake', s.shake)}
        ${range('flash', 'Flash', s.flash)}
        ${range('uiScale', 'Interface size', s.uiScale, 0.85, 1.35, 0.05)}
        ${check('reducedMotion', 'Reduced motion', s.reducedMotion)}
        ${check('colorblind', 'Colorblind-safe hazards', s.colorblind)}
        ${check('haptics', 'Haptics', s.haptics)}
        ${check('ghost', 'Personal-best ghost on the same seed', s.ghost)}
        ${check('telemetry', 'Keep anonymous notes on this device', s.telemetry)}
        <div class="row">
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
        </div>
        <p class="hint">Notes stay in this browser. Nothing is sent.</p>
        <button type="button" data-action="back">Back</button>
      </section>`, 'settings')
    this.focus('[data-action="back"]')
  }

  hidePanel() {
    const sheet = this.panel.querySelector('.sheet') as HTMLElement | null
    if (!sheet || reducedMotion()) {
      this.panel.innerHTML = ''
      return
    }
    // Let the sheet fall away instead of vanishing; ignore if replaced meanwhile.
    sheet.classList.add('leaving')
    this.panel.classList.add('closing')
    window.setTimeout(() => {
      if (sheet.isConnected && sheet.classList.contains('leaving')) this.panel.innerHTML = ''
      this.panel.classList.remove('closing')
    }, 180)
  }

  /** Swap in a sheet. Re-rendering the same screen (buying in the workshop) keeps it still and scrolled. */
  private mount(html: string, screen: string) {
    const prev = this.panel.querySelector('.sheet') as HTMLElement | null
    const same = !!prev && prev.dataset.screen === screen && !prev.classList.contains('leaving')
    const scroll = prev?.scrollTop ?? 0
    this.panel.classList.remove('closing')
    this.panel.innerHTML = html
    const sheet = this.panel.querySelector('.sheet') as HTMLElement | null
    if (!sheet) return
    sheet.dataset.screen = screen
    if (same) {
      sheet.classList.add('static')
      sheet.scrollTop = scroll
      return
    }
    Array.from(sheet.children).forEach((child, i) => (child as HTMLElement).style.setProperty('--i', String(Math.min(i, 12))))
  }

  private countUp() {
    const cells = Array.from(this.panel.querySelectorAll<HTMLElement>('dd[data-count]'))
    if (reducedMotion()) return
    const start = performance.now()
    const duration = 900
    const tick = (now: number) => {
      let running = false
      cells.forEach((el, i) => {
        const t = Math.min(1, Math.max(0, (now - start - 180 - i * 90) / duration))
        if (t < 1) running = true
        const k = 1 - Math.pow(1 - t, 3)
        const value = Number(el.dataset.count) * k
        const digits = Number(el.dataset.digits) || 0
        el.textContent = `${el.dataset.prefix ?? ''}${value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}${el.dataset.suffix ?? ''}`
      })
      if (running && cells[0]?.isConnected) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  private pop(el: Element, scale: number) {
    if (reducedMotion() || typeof (el as HTMLElement).animate !== 'function') return
    ;(el as HTMLElement).animate(
      [{ transform: `scale(${scale})` }, { transform: 'scale(1)' }],
      { duration: 280, easing: 'cubic-bezier(.2,1.5,.4,1)' },
    )
  }

  private say(text: string) {
    this.live.textContent = text
  }

  private focus(sel: string) {
    queueMicrotask(() => {
      const el = this.panel.querySelector(sel) as HTMLElement | null
      el?.focus({ preventScroll: true })
    })
  }
}
