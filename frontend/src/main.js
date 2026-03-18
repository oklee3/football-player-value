import './style.css'
import { supabase } from './supabaseClient.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">Supabase + FBref</p>
        <h1>Player Snapshot</h1>
        <p class="subtitle">Basic season stats ranked by goals + assists.</p>
      </div>
      <div class="hero-card">
        <div class="stat">
          <span class="label">Table</span>
          <span class="value">player_seasons</span>
        </div>
        <div class="stat">
          <span class="label">Metric</span>
          <span class="value">Goals + Assists</span>
        </div>
      </div>
    </header>

    <section class="panel">
      <div class="panel-header">
        <h2>Top Contributors</h2>
        <p class="muted">Sorted by goals + assists for your filters.</p>
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

const formatNum = (value) => {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US').format(value)
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
    .map((player) => {
      const goals = formatNum(player.goals)
      const assists = formatNum(player.assists)
      const minutes = formatNum(player.minutes)
      const total = formatNum(player.goals_plus_assists)
      const nation = player.nation || '—'
      const squad = player.squad || '—'
      const season = player.season || '—'
      const league = player.league || '—'

      return `
        <article class="card">
          <div class="card-top">
            <div>
              <h3>${player.player}</h3>
              <p class="meta">${nation} · ${squad}</p>
            </div>
            <span class="badge">${season}</span>
          </div>
          <p class="league">${league}</p>
          <div class="stats">
            <div>
              <span class="stat-label">Goals + Assists</span>
              <span class="stat-value">${total}</span>
            </div>
            <div>
              <span class="stat-label">Goals</span>
              <span class="stat-value">${goals}</span>
            </div>
            <div>
              <span class="stat-label">Assists</span>
              <span class="stat-value">${assists}</span>
            </div>
            <div>
              <span class="stat-label">Minutes</span>
              <span class="stat-value">${minutes}</span>
            </div>
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
      .select('player, nation, squad, season, league, goals, assists, minutes')
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

  const scored = data
    .map((player) => {
      const goals = player.goals || 0
      const assists = player.assists || 0
      return {
        ...player,
        goals_plus_assists: goals + assists
      }
    })
    .sort((a, b) => b.goals_plus_assists - a.goals_plus_assists)
    .slice(0, 12)

  stateEl.textContent = ''
  renderPlayers(scored)
}

applyFiltersEl.addEventListener('click', loadPlayers)
playerFilterEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loadPlayers()
})

loadFilters()
loadPlayers()
