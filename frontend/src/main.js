import './style.css'
import { supabase } from './supabaseClient.js'
import { aggregatePlayerProfiles } from './transferValue.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">oklee3</p>
        <h1>Transfer Value Rankings</h1>
        <p class="subtitle">A basic transfer value score using aggregated goals, assists, and age across the seasons you have collected.</p>
      </div>
      <div class="hero-card">
        <div class="stat">
          <span class="label">Table</span>
          <span class="value">player_seasons</span>
        </div>
        <div class="stat">
          <span class="label">Metric</span>
          <span class="value">tyreek's transfer value</span>
        </div>
      </div>
    </header>

    <section class="panel">
      <div class="panel-header">
        <h2>Highest Value Players</h2>
        <p class="muted">Ranked by an aggregated transfer value score for your filters.</p>
      </div>
      <div class="filters">
        <label class="filter">
          <span>League</span>
          <select id="leagueFilter">
            <option value="">Any league</option>
          </select>
        </label>
        <label class="filter">
          <span>Season</span>
          <select id="seasonFilter">
            <option value="">Any season</option>
          </select>
        </label>
        <label class="filter">
          <span>Player</span>
          <input id="playerFilter" type="search" placeholder="Search player name" />
        </label>
        <button id="applyFilters" class="btn">Apply</button>
      </div>
      <div id="state" class="state">Loading players…</div>
      <div id="grid" class="grid" aria-live="polite"></div>
    </section>
  </main>
`

const stateEl = document.querySelector('#state')
const gridEl = document.querySelector('#grid')
const leagueFilterEl = document.querySelector('#leagueFilter')
const seasonFilterEl = document.querySelector('#seasonFilter')
const playerFilterEl = document.querySelector('#playerFilter')
const applyFiltersEl = document.querySelector('#applyFilters')

const FETCH_BATCH = 1000
const MAX_RESULTS = 24

const formatNum = (value) => {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

const formatScore = (value) => {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value)
}

const uniqueSorted = (items) => {
  const set = new Set(items.filter(Boolean))
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

const loadFilters = async () => {
  const { data, error } = await supabase
    .from('player_seasons')
    .select('league, season')
    .limit(FETCH_BATCH)

  if (error || !data) return

  const leagues = uniqueSorted(data.map((row) => row.league))
  const seasons = uniqueSorted(data.map((row) => row.season)).sort((a, b) =>
    b.localeCompare(a)
  )

  leagues.forEach((league) => {
    const option = document.createElement('option')
    option.value = league
    option.textContent = league
    leagueFilterEl.appendChild(option)
  })

  seasons.forEach((season) => {
    const option = document.createElement('option')
    option.value = season
    option.textContent = season
    seasonFilterEl.appendChild(option)
  })
}

const renderPlayers = (players) => {
  gridEl.innerHTML = players
    .map((player, index) => {
      const goals = formatNum(player.goals)
      const assists = formatNum(player.assists)
      const minutes = formatNum(player.minutes)
      const total = formatNum(player.goals_plus_assists)
      const age = formatNum(player.age)
      const transferValue = formatScore(player.transfer_value)
      const nation = player.nation || '—'
      const squad = player.squad_label || '—'
      const season = player.season_label || '—'
      const league = player.league_label || '—'
      const seasonsCovered = formatNum(player.season_count)

      return `
        <article class="card">
          <div class="card-top">
            <div>
              <p class="rank">#${index + 1}</p>
              <h3>${player.player}</h3>
              <p class="meta">${nation} · ${squad}</p>
            </div>
            <span class="badge">${season}</span>
          </div>
          <p class="league">${league}</p>
          <div class="stats">
            <div>
              <span class="stat-label">Value</span>
              <span class="stat-value">${transferValue}</span>
            </div>
            <div>
              <span class="stat-label">Age</span>
              <span class="stat-value">${age}</span>
            </div>
            <div>
              <span class="stat-label">G+A</span>
              <span class="stat-value">${total}</span>
            </div>
            <div>
              <span class="stat-label">Gls / Ast</span>
              <span class="stat-value">${goals} / ${assists}</span>
            </div>
          </div>
          <div class="card-meta-grid">
            <p class="card-note"><span class="card-note-label">Seasons</span>${seasonsCovered}</p>
            <p class="card-note"><span class="card-note-label">Range</span>${season}</p>
            <p class="card-note"><span class="card-note-label">Clubs</span>${squad}</p>
            <p class="card-note"><span class="card-note-label">Minutes</span>${minutes}</p>
          </div>
        </article>
      `
    })
    .join('')
}

const fetchAllPlayers = async ({ league, season, player }) => {
  let from = 0
  const all = []

  while (true) {
    let query = supabase
      .from('player_seasons')
      .select('player_id, player, nation, squad, season, league, goals, assists, age, minutes')
      .neq('player', 'Player')
      .range(from, from + FETCH_BATCH - 1)

    if (league) query = query.eq('league', league)
    if (season) query = query.eq('season', season)
    if (player) query = query.ilike('player', `%${player}%`)

    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break

    all.push(...data)
    if (data.length < FETCH_BATCH) break

    from += FETCH_BATCH
    stateEl.textContent = `Loading players… (${all.length})`
  }

  return all
}

const loadPlayers = async () => {
  stateEl.textContent = 'Loading players…'
  gridEl.innerHTML = ''

  const league = leagueFilterEl.value
  const season = seasonFilterEl.value
  const player = playerFilterEl.value.trim()

  let data = []
  try {
    data = await fetchAllPlayers({ league, season, player })
  } catch (error) {
    stateEl.textContent = `Failed to load: ${error.message}`
    stateEl.classList.add('error')
    return
  }

  if (!data || data.length === 0) {
    stateEl.textContent = 'No data found yet. Check your table and RLS policies.'
    return
  }

  const scored = aggregatePlayerProfiles(data)
    .sort((a, b) => {
      if (b.transfer_value !== a.transfer_value) {
        return b.transfer_value - a.transfer_value
      }
      return b.goals_plus_assists - a.goals_plus_assists
    })
    .slice(0, MAX_RESULTS)

  stateEl.textContent = ''
  renderPlayers(scored)
}

applyFiltersEl.addEventListener('click', loadPlayers)
playerFilterEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadPlayers()
})

loadFilters()
loadPlayers()
